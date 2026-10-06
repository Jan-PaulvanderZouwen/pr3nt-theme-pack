import { randomBytes, createHash } from "node:crypto";
import { db, config, encrypt, decrypt, now, uid } from "./server";
import { getSqlite } from "./runtime";
import { fail } from "./access";

type Row = Record<string, any>;
const scope = "offline_access User.Read Mail.ReadWrite Mail.Send";
const folders = ["inbox", "sentitems", "drafts", "archive"] as const;
export const outlookConfigured = () => !!(config().MICROSOFT_CLIENT_ID && config().MICROSOFT_CLIENT_SECRET && config().VAULT_KEY);
export function outlookConfig() {
  if (!outlookConfigured()) fail("De Outlook-koppeling moet eerst door de beheerder worden ingesteld.", 503);
  const c = config(), origin = new URL(c.APP_ORIGIN);
  if (origin.protocol !== "https:") fail("Outlook vereist een beveiligde website.", 503);
  const tenant = c.MICROSOFT_TENANT_ID || "common";
  if (!/^(common|organizations|consumers|[a-f0-9-]{36})$/i.test(tenant)) fail("Ongeldige Microsoft-tenantinstelling.", 503);
  return { clientId: c.MICROSOFT_CLIENT_ID, secret: c.MICROSOFT_CLIENT_SECRET, tenant, origin: origin.origin, redirect: origin.origin + "/api/outlook/callback" };
}
export async function startOutlook(user: string) {
  const c = outlookConfig(), state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
  await db().prepare("DELETE FROM outlook_states WHERE expires<?").bind(Date.now()).run();
  await db().prepare("INSERT INTO outlook_states (id,user,verifier,expires) VALUES (?,?,?,?)").bind(state, user, await encrypt(verifier), Date.now() + 600000).run();
  const url = new URL(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/authorize`);
  url.search = new URLSearchParams({ client_id: c.clientId, response_type: "code", redirect_uri: c.redirect, response_mode: "query", scope, state, code_challenge: createHash("sha256").update(verifier).digest("base64url"), code_challenge_method: "S256", prompt: "select_account" }).toString();
  return url.href;
}
async function exchange(values: Record<string, string>) {
  const c = outlookConfig();
  const response = await fetch(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, { method: "POST", redirect: "error", signal: AbortSignal.timeout(20000), headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ client_id: c.clientId, client_secret: c.secret, scope, ...values }) });
  const token = await response.json() as Row;
  if (!response.ok || !token.access_token || !token.refresh_token) fail("Microsoft kon de koppeling niet bevestigen. Koppel je account opnieuw.", 503);
  const granted = new Set(String(token.scope || "").toLowerCase().split(" ").map(s => s.replace("https://graph.microsoft.com/", "")));
  if (!["user.read", "mail.readwrite", "mail.send"].every(s => granted.has(s))) fail("Microsoft heeft niet alle benodigde mailboxrechten verleend.", 403);
  return token;
}
function graphUrl(path: string) {
  const url = new URL(path.startsWith("https://") ? path : "https://graph.microsoft.com/v1.0" + path);
  if (url.protocol !== "https:" || url.hostname !== "graph.microsoft.com" || url.port || !(url.pathname === "/v1.0/me" || url.pathname.startsWith("/v1.0/me/"))) fail("Ongeldige Microsoft-aanvraag.");
  return url.href;
}
export async function graphWithToken(token: string, path: string, method = "GET", body?: unknown) {
  const response = await fetch(graphUrl(path), { method, redirect: "error", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'IdType="ImmutableId", outlook.body-content-type="text", odata.maxpagesize=50' }, ...(body === undefined ? {} : { body: JSON.stringify(body) }) });
  if (!response.ok) {
    if (response.status === 410) fail("De synchronisatiecursor is verlopen. Synchroniseer opnieuw.", 410);
    if (response.status === 429) fail("Microsoft vraagt om even te wachten. Probeer de synchronisatie later opnieuw.", 429);
    if ([401, 403].includes(response.status)) fail("Microsoft heeft toegang geweigerd. Controleer toestemming of koppel Outlook opnieuw.", 503);
    if (response.status === 404) fail("Dit bericht of deze map is niet meer beschikbaar in Outlook.", 404);
    fail("De Outlook-aanvraag is niet gelukt. Probeer het later opnieuw.", 503);
  }
  if (response.status === 202 || response.status === 204) return null;
  return await response.json() as Row;
}
export async function finishOutlook(user: string, state: string, code: string) {
  const row = await db().prepare("DELETE FROM outlook_states WHERE id=? AND user=? AND expires>? RETURNING verifier").bind(state, user, Date.now()).first<Row>();
  if (!row) fail("De koppelaanvraag is verlopen. Start opnieuw.", 403);
  const c = outlookConfig(), token = await exchange({ grant_type: "authorization_code", code, redirect_uri: c.redirect, code_verifier: await decrypt(row.verifier) });
  const me = await graphWithToken(token.access_token, "/me?$select=id,mail,userPrincipalName");
  const email = me?.mail || me?.userPrincipalName;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("Het Microsoft-account heeft geen bruikbaar mailboxadres.", 400);
  const encrypted = await encrypt(JSON.stringify(token));
  getSqlite().transaction(() => {
    const replacing = getSqlite().prepare("SELECT user FROM outlook_connections WHERE user=?").get(user);
    for (const table of ["outlook_messages", "outlook_sync", "outlook_sync_locks"]) getSqlite().prepare(`DELETE FROM ${table} WHERE user=?`).run(user);
    if (replacing) getSqlite().prepare("DELETE FROM mail_drafts WHERE user=? AND kind='outlook'").run(user);
    getSqlite().prepare("INSERT INTO outlook_connections (user,email,tokens,expires,updated,generation) VALUES (?,?,?,?,?,?) ON CONFLICT(user) DO UPDATE SET email=excluded.email,tokens=excluded.tokens,expires=excluded.expires,updated=excluded.updated,generation=excluded.generation")
      .run(user, email.toLowerCase(), encrypted, Date.now() + Number(token.expires_in || 3600) * 1000, now(), uid());
  })();
}
const refreshes = new Map<string, Promise<string>>();
export async function outlookToken(user: string, generation?: string): Promise<string> {
  const row = await db().prepare("SELECT * FROM outlook_connections WHERE user=?").bind(user).first<Row>();
  if (!row) fail("Koppel eerst jouw Outlook-account.", 409);
  if (generation && row.generation !== generation) fail("De Outlook-koppeling is gewijzigd. Probeer de actie opnieuw.", 409);
  const tokens = JSON.parse(await decrypt(row.tokens));
  const refreshKey = `${user}:${row.generation}`;
  if (row.expires > Date.now() + 60000) return tokens.access_token;
  if (refreshes.has(refreshKey)) return refreshes.get(refreshKey)!;
  const promise = (async () => {
    const token = await exchange({ grant_type: "refresh_token", refresh_token: tokens.refresh_token });
    const result = await db().prepare("UPDATE outlook_connections SET tokens=?,expires=?,updated=? WHERE user=? AND generation=?").bind(await encrypt(JSON.stringify(token)), Date.now() + Number(token.expires_in || 3600) * 1000, now(), user, row.generation).run();
    if (!result.meta.changes) fail("De Outlook-koppeling is ingetrokken. Koppel opnieuw.", 409);
    return token.access_token as string;
  })();
  refreshes.set(refreshKey, promise);
  try { return await promise; } finally { refreshes.delete(refreshKey); }
}
export async function graph(user: string, path: string, method = "GET", body?: unknown, generation?: string) {
  const token = await outlookToken(user, generation);
  const current = getSqlite().prepare("SELECT generation FROM outlook_connections WHERE user=?").get(user) as Row | undefined;
  if (!current || generation && current.generation !== generation) fail("De Outlook-koppeling is gewijzigd.", 409);
  return graphWithToken(token, path, method, body);
}

function plainBody(body: Row | undefined) {
  const value = String(body?.content || "").slice(0, 100000);
  return body?.contentType?.toLowerCase() === "html" ? value.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?\s*>|<\/p>/gi, "\n").replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">") : value;
}
export function storeOutlookMessage(user: string, folder: string, message: Row) {
  if (!message.id || typeof message.id !== "string") return;
  const received = message.receivedDateTime || message.sentDateTime || message.createdDateTime || now();
  getSqlite().prepare("INSERT INTO outlook_messages (user,id,conversation,folder,subject,sender,sender_name,recipients,reply_to,preview,body,is_read,starred,has_attachments,received,web_url) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(user,id) DO UPDATE SET conversation=excluded.conversation,folder=excluded.folder,subject=excluded.subject,sender=excluded.sender,sender_name=excluded.sender_name,recipients=excluded.recipients,reply_to=excluded.reply_to,preview=excluded.preview,body=excluded.body,is_read=excluded.is_read,starred=excluded.starred,has_attachments=excluded.has_attachments,received=excluded.received,web_url=excluded.web_url")
    .run(user, message.id, message.conversationId || "", folder, String(message.subject || "(geen onderwerp)").slice(0, 500), message.from?.emailAddress?.address || "", message.from?.emailAddress?.name || "", JSON.stringify(message.toRecipients || []), JSON.stringify(message.replyTo || []), String(message.bodyPreview || "").slice(0, 500), plainBody(message.body), message.isRead ? 1 : 0, message.flag?.flagStatus === "flagged" ? 1 : 0, message.hasAttachments ? 1 : 0, received, String(message.webLink || ""));
}
export async function syncOutlook(user: string) {
  const lease = Date.now() + 180000, deadline = Date.now() + 60000;
  const locked = await db().prepare("INSERT INTO outlook_sync_locks (user,expires) VALUES (?,?) ON CONFLICT(user) DO UPDATE SET expires=excluded.expires WHERE outlook_sync_locks.expires<? RETURNING user").bind(user, lease, Date.now()).first();
  if (!locked) fail("De mailbox wordt al gesynchroniseerd.", 409);
  let updated = 0, pending = false;
  try {
    const connection = getSqlite().prepare("SELECT generation FROM outlook_connections WHERE user=?").get(user) as Row | undefined;
    if (!connection) fail("De Outlook-koppeling is ingetrokken.", 409);
    const token = await outlookToken(user, connection.generation);
    for (const folder of folders) {
      if (Date.now() > deadline) { pending = true; break; }
      const previous = getSqlite().prepare("SELECT cursor FROM outlook_sync WHERE user=? AND folder=?").get(user, folder) as Row | undefined;
      const initial = `/me/mailFolders/${folder}/messages/delta?$select=id,conversationId,subject,from,toRecipients,replyTo,bodyPreview,body,isRead,flag,hasAttachments,receivedDateTime,sentDateTime,createdDateTime,webLink&$top=50&$orderby=receivedDateTime%20desc`;
      let cursor = previous?.cursor || initial;
      for (let page = 0; page < 4; page++) {
        if (Date.now() > deadline) { pending = true; break; }
        let response: Row | null;
        try { response = await graphWithToken(token, cursor); } catch (error) {
          if ((error as any).status === 410) { getSqlite().prepare("DELETE FROM outlook_sync WHERE user=? AND folder=?").run(user, folder); fail("De synchronisatie is opnieuw ingesteld. Klik nogmaals op synchroniseren.", 409); }
          if ((error as any).status === 404 && folder === "archive") break;
          throw error;
        }
        if (!response || !Array.isArray(response.value)) fail("Microsoft gaf geen geldige mailboxgegevens terug.", 503);
        const next = response["@odata.nextLink"], delta = response["@odata.deltaLink"];
        if (!next && !delta) fail("Microsoft gaf geen synchronisatiecursor terug.", 503);
        graphUrl(next || delta);
        getSqlite().transaction(() => {
          const current = getSqlite().prepare("SELECT generation FROM outlook_connections WHERE user=?").get(user) as Row | undefined;
          if (current?.generation !== connection.generation) fail("De Outlook-koppeling is gewijzigd. Synchroniseer opnieuw.", 409);
          for (const message of response!.value) {
            if (message["@removed"]) getSqlite().prepare("DELETE FROM outlook_messages WHERE user=? AND id=? AND folder=?").run(user, message.id, folder);
            else { storeOutlookMessage(user, folder, message); updated++; }
          }
          getSqlite().prepare("INSERT INTO outlook_sync (user,folder,cursor,synced,pending) VALUES (?,?,?,?,?) ON CONFLICT(user,folder) DO UPDATE SET cursor=excluded.cursor,synced=excluded.synced,pending=excluded.pending").run(user, folder, next || delta, now(), next ? 1 : 0);
        })();
        if (!next) break;
        cursor = next;
        if (page === 3) pending = true;
      }
    }
    return { updated, pending };
  } finally { await db().prepare("DELETE FROM outlook_sync_locks WHERE user=? AND expires=?").bind(user, lease).run(); }
}
export async function disconnectOutlook(user: string) {
  getSqlite().transaction(() => {
    for (const table of ["outlook_connections", "outlook_messages", "outlook_sync", "outlook_states"]) getSqlite().prepare(`DELETE FROM ${table} WHERE user=?`).run(user);
    getSqlite().prepare("DELETE FROM mail_drafts WHERE user=? AND kind='outlook'").run(user);
  })();
}
