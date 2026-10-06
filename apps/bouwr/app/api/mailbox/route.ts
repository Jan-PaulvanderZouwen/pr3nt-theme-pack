import { z } from "zod";
import { account, chatAccess, fail, projectAccess, Row } from "@/lib/access";
import { db, config, now, uid } from "@/lib/server";
import { boundedBody } from "@/lib/http";
import { disconnectOutlook, graph, outlookConfigured, storeOutlookMessage, syncOutlook } from "@/lib/outlook";
import { getSqlite } from "@/lib/runtime";

export const dynamic = "force-dynamic";
const json = (value: unknown, status = 200) => Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
function error(e: unknown) {
  if (e instanceof z.ZodError || e instanceof SyntaxError) return json({ error: "Controleer de ingevulde gegevens." }, 400);
  const err = e as Error & { status?: number };
  if (!err.status) console.error("Mailbox request failed", err.message);
  return json({ error: err.status ? err.message : "De mailboxactie is niet gelukt. Probeer het opnieuw." }, err.status || 503);
}
const draftSchema = z.object({
  id: z.string().uuid().optional(), kind: z.enum(["project", "outlook"]), project: z.string().uuid().optional(),
  channel: z.enum(["internal", "client"]).optional(), recipient: z.string().max(250).default(""), subject: z.string().max(250).default(""),
  body: z.string().max(20000).default(""), replyId: z.string().max(1000).optional(),
});
async function externalMessage(user: string, id: unknown) {
  const row = await db().prepare("SELECT * FROM outlook_messages WHERE user=? AND id=?").bind(user, z.string().min(1).max(1000).parse(id)).first<Row>();
  if (!row) fail("Bericht niet gevonden in jouw mailbox.", 404);
  return row;
}
export async function GET(req: Request) {
  try {
    const a = await account(); if (!a.p) fail("Maak eerst je profiel aan.", 403);
    const user = a.u.userId, url = new URL(req.url);
    if (url.searchParams.has("thread")) {
      const [id, channel, ...extra] = String(url.searchParams.get("thread")).split(":");
      if (extra.length) fail("Ongeldig gesprek.");
      await chatAccess(z.string().uuid().parse(id), z.enum(["internal", "client"]).parse(channel), a);
      const messages = (await db().prepare("SELECT m.*,u.name,u.email FROM (SELECT * FROM messages WHERE project=? AND channel=? ORDER BY created DESC,id DESC LIMIT 1000) m JOIN users u ON u.id=m.author ORDER BY m.created,m.id").bind(id, channel).all()).results;
      return json({ messages });
    }
    if (url.searchParams.has("external")) return json({ message: await externalMessage(user, url.searchParams.get("external")) });
    const projects = (await db().prepare("SELECT p.id,p.title,p.client,p.owner,p.executor,p.contact FROM projects p WHERE p.owner=? OR p.executor=? OR p.id IN (SELECT project FROM memberships WHERE email=? AND revoked=0) ORDER BY p.created DESC LIMIT 1000").bind(user, user, a.u.email).all<Row>()).results;
    const states = (await db().prepare("SELECT * FROM mail_thread_states WHERE user=?").bind(user).all<Row>()).results;
    const threads: Row[] = [];
    for (const p of projects) {
      const owner = p.owner === user, executor = p.executor === user;
      const channels = owner ? ["internal", "client"] : executor ? p.contact ? ["internal", "client"] : ["internal"] : ["client"];
      for (const channel of channels) {
        const id = `${p.id}:${channel}`, state = states.find(s => s.thread === id);
        const last = await db().prepare("SELECT m.*,u.name FROM messages m JOIN users u ON u.id=m.author WHERE project=? AND channel=? ORDER BY created DESC,m.id DESC LIMIT 1").bind(p.id, channel).first<Row>();
        const unread = await db().prepare("SELECT COUNT(*) AS count FROM messages WHERE project=? AND channel=? AND author<>? AND created>?").bind(p.id, channel, user, state?.read_at || "").first<Row>();
        const sent = await db().prepare("SELECT COUNT(*) AS count FROM messages WHERE project=? AND channel=? AND author=?").bind(p.id, channel, user).first<Row>();
        threads.push({ id, kind: "project", project: p.id, channel, subject: p.title, client: p.client, sender: last?.name || (channel === "internal" ? "Developergesprek" : "Klantgesprek"), preview: last?.body || "Start het gesprek", received: last?.created || "", unread: unread?.count || 0, starred: !!state?.starred, archived: !!state?.archived, sent: !!sent?.count });
      }
    }
    const drafts = (await db().prepare("SELECT * FROM mail_drafts WHERE user=? ORDER BY updated DESC LIMIT 100").bind(user).all<Row>()).results;
    const allowedDrafts: Row[] = [];
    for (const draft of drafts) {
      if (draft.kind === "project") { try { await chatAccess(draft.project, draft.channel, a); } catch { continue; } }
      allowedDrafts.push(draft);
    }
    const external = (await db().prepare("SELECT id,conversation,folder,subject,sender,sender_name,recipients,preview,is_read,starred,has_attachments,received,web_url FROM outlook_messages WHERE user=? ORDER BY received DESC LIMIT 1000").bind(user).all<Row>()).results;
    const connection = await db().prepare("SELECT email,updated FROM outlook_connections WHERE user=?").bind(user).first();
    const sync = (await db().prepare("SELECT folder,synced,pending FROM outlook_sync WHERE user=?").bind(user).all()).results;
    return json({ threads, external, drafts: allowedDrafts, outlook: { configured: outlookConfigured(), connection, sync } });
  } catch (e) { return error(e); }
}
export async function POST(req: Request) {
  try {
    if (req.headers.get("origin") !== new URL(config().APP_ORIGIN).origin) fail("Ongeldige aanvraag.", 403);
    const a = await account(); if (!a.p) fail("Maak eerst je profiel aan.", 403);
    const b = JSON.parse(new TextDecoder().decode(await boundedBody(req, 100000))) as Row, user = a.u.userId;
    const op = z.string().parse(b.op);
    const remoteConnection = ["externalState", "saveOutlookDraft", "sendOutlook"].includes(op) ? getSqlite().prepare("SELECT generation FROM outlook_connections WHERE user=?").get(user) as Row | undefined : undefined;
    const assertConnection = () => {
      const current = getSqlite().prepare("SELECT generation FROM outlook_connections WHERE user=?").get(user) as Row | undefined;
      if (!remoteConnection || current?.generation !== remoteConnection.generation) fail("De Outlook-koppeling is gewijzigd. Probeer opnieuw.", 409);
    };
    const remoteGraph = (path: string, method = "GET", body?: unknown) => { assertConnection(); return graph(user, path, method, body, remoteConnection!.generation); };
    if (op === "sync") { if (a.p.role !== "developer") fail("Geen toegang tot Outlook.", 403); return json({ ok: true, ...await syncOutlook(user) }); }
    if (op === "disconnect") { await disconnectOutlook(user); return json({ ok: true }); }
    if (op === "threadState") {
      const [project, channel, ...extra] = z.string().parse(b.thread).split(":"); if (extra.length) fail("Ongeldig gesprek.");
      await chatAccess(z.string().uuid().parse(project), z.enum(["internal", "client"]).parse(channel), a);
      const patch = z.object({ readUntil: z.string().datetime().optional(), unread: z.boolean().optional(), starred: z.boolean().optional(), archived: z.boolean().optional() }).parse(b);
      if (patch.readUntil && patch.readUntil > now()) fail("Ongeldige leestijd.");
      await db().prepare("INSERT INTO mail_thread_states (user,thread) VALUES (?,?) ON CONFLICT(user,thread) DO NOTHING").bind(user, b.thread).run();
      if (patch.readUntil !== undefined || patch.unread !== undefined) await db().prepare("UPDATE mail_thread_states SET read_at=? WHERE user=? AND thread=?").bind(patch.unread ? "" : patch.readUntil || now(), user, b.thread).run();
      if (patch.starred !== undefined) await db().prepare("UPDATE mail_thread_states SET starred=? WHERE user=? AND thread=?").bind(patch.starred ? 1 : 0, user, b.thread).run();
      if (patch.archived !== undefined) await db().prepare("UPDATE mail_thread_states SET archived=? WHERE user=? AND thread=?").bind(patch.archived ? 1 : 0, user, b.thread).run();
      return json({ ok: true });
    }
    if (op === "saveDraft") {
      const v = draftSchema.parse(b);
      if (v.kind === "project") await chatAccess(z.string().uuid().parse(v.project), z.enum(["internal", "client"]).parse(v.channel), a);
      if (v.kind === "outlook" && a.p.role !== "developer") fail("Geen toegang tot Outlook-concepten.", 403);
      if (v.replyId && v.kind === "outlook") await externalMessage(user, v.replyId);
      if (v.id && !await db().prepare("SELECT id FROM mail_drafts WHERE user=? AND id=?").bind(user, v.id).first()) fail("Geen toegang tot dit concept.", 403);
      const id = v.id || uid();
      if (!v.id) { const count = await db().prepare("SELECT COUNT(*) AS count FROM mail_drafts WHERE user=?").bind(user).first<Row>(); if ((count?.count || 0) >= 100) fail("Je hebt al 100 concepten. Ruim eerst een concept op.", 409); }
      await db().prepare("INSERT INTO mail_drafts (id,user,kind,project,channel,recipient,subject,body,reply_id,updated) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET kind=excluded.kind,project=excluded.project,channel=excluded.channel,recipient=excluded.recipient,subject=excluded.subject,body=excluded.body,reply_id=excluded.reply_id,updated=excluded.updated WHERE mail_drafts.user=excluded.user")
        .bind(id, user, v.kind, v.project || null, v.channel || null, v.recipient, v.subject, v.body, v.replyId || null, now()).run();
      return json({ ok: true, id });
    }
    if (op === "deleteDraft") { await db().prepare("DELETE FROM mail_drafts WHERE user=? AND id=?").bind(user, z.string().uuid().parse(b.id)).run(); return json({ ok: true }); }
    if (op === "externalState") {
      const message = await externalMessage(user, b.id);
      const patch = z.object({ read: z.boolean().optional(), starred: z.boolean().optional(), archived: z.boolean().optional() }).parse(b);
      if (patch.read !== undefined || patch.starred !== undefined) {
        await remoteGraph( `/me/messages/${encodeURIComponent(message.id)}`, "PATCH", { ...(patch.read === undefined ? {} : { isRead: patch.read }), ...(patch.starred === undefined ? {} : { flag: { flagStatus: patch.starred ? "flagged" : "notFlagged" } }) });
        assertConnection();
        if (patch.read !== undefined) await db().prepare("UPDATE outlook_messages SET is_read=? WHERE user=? AND id=?").bind(patch.read ? 1 : 0, user, message.id).run();
        if (patch.starred !== undefined) await db().prepare("UPDATE outlook_messages SET starred=? WHERE user=? AND id=?").bind(patch.starred ? 1 : 0, user, message.id).run();
      }
      if (patch.archived !== undefined) {
        const folder = patch.archived ? "archive" : "inbox";
        const moved = await remoteGraph( `/me/messages/${encodeURIComponent(message.id)}/move`, "POST", { destinationId: folder });
        if (!moved?.id) fail("Microsoft kon het bericht niet verplaatsen.", 503);
        assertConnection();
        getSqlite().transaction(() => { getSqlite().prepare("DELETE FROM outlook_messages WHERE user=? AND id=?").run(user, message.id); storeOutlookMessage(user, folder, moved); })();
      }
      return json({ ok: true });
    }
    if (op === "saveOutlookDraft") {
      const v = z.object({ remoteDraftId: z.string().min(1).max(1000), recipient: z.string().max(250), subject: z.string().max(250), body: z.string().max(20000) }).parse(b);
      const message = await externalMessage(user, v.remoteDraftId);
      if (message.folder !== "drafts") fail("Dit bericht is geen Outlook-concept.");
      if (v.recipient && !z.string().email().safeParse(v.recipient).success) fail("Controleer het e-mailadres.");
      await remoteGraph( `/me/messages/${encodeURIComponent(message.id)}`, "PATCH", { subject: v.subject, body: { contentType: "Text", content: v.body }, toRecipients: v.recipient ? [{ emailAddress: { address: v.recipient } }] : [] });
      assertConnection();
      await db().prepare("UPDATE outlook_messages SET subject=?,body=?,preview=?,recipients=? WHERE user=? AND id=?").bind(v.subject, v.body, v.body.slice(0, 500), JSON.stringify(v.recipient ? [{ emailAddress: { address: v.recipient } }] : []), user, message.id).run();
      return json({ ok: true });
    }
    if (op === "sendOutlook") {
      if (a.p.role !== "developer") fail("Geen toegang tot Outlook.", 403);
      const v = z.object({ requestId: z.string().uuid(), recipient: z.string().email().max(250).optional(), subject: z.string().trim().min(1).max(250), body: z.string().trim().min(1).max(20000), replyId: z.string().max(1000).optional(), draftId: z.string().uuid().optional(), remoteDraftId: z.string().max(1000).optional() }).parse(b);
      const connection = await db().prepare("SELECT user FROM outlook_connections WHERE user=?").bind(user).first(); if (!connection) fail("Koppel eerst Outlook.", 409);
      if (v.replyId) await externalMessage(user, v.replyId);
      if (v.remoteDraftId) { const draft = await externalMessage(user, v.remoteDraftId); if (draft.folder !== "drafts") fail("Dit bericht is geen Outlook-concept."); }
      if (!v.replyId && !v.recipient) fail("Vul een ontvanger in.");
      if (v.draftId && !await db().prepare("SELECT id FROM mail_drafts WHERE id=? AND user=? AND kind='outlook'").bind(v.draftId, user).first()) fail("Geen toegang tot dit concept.", 403);
      const previous = await db().prepare("SELECT status FROM mail_send_requests WHERE user=? AND id=?").bind(user, v.requestId).first<Row>();
      if (previous?.status === "sent") return json({ ok: true });
      if (previous) fail("Dit verzendverzoek is al verwerkt of in verwerking. Controleer eerst Verzonden in Outlook.", 409);
      await db().prepare("INSERT INTO mail_send_requests (user,id,status,created) VALUES (?,?,'sending',?)").bind(user, v.requestId, now()).run();
      try {
        let remoteId = v.remoteDraftId;
        if (!remoteId) {
          const remote = v.replyId ? await remoteGraph( `/me/messages/${encodeURIComponent(v.replyId)}/createReply`, "POST") : await remoteGraph( "/me/messages", "POST", { subject: v.subject, body: { contentType: "Text", content: v.body }, toRecipients: [{ emailAddress: { address: v.recipient } }] });
          if (!remote?.id) fail("Microsoft kon geen verzendconcept aanmaken.", 503);
          remoteId = remote.id;
        }
        await db().prepare("UPDATE mail_send_requests SET remote_id=? WHERE user=? AND id=?").bind(remoteId, user, v.requestId).run();
        if (v.replyId || v.remoteDraftId) await remoteGraph( `/me/messages/${encodeURIComponent(remoteId!)}`, "PATCH", { body: { contentType: "Text", content: v.body }, ...(v.remoteDraftId ? { subject: v.subject, toRecipients: [{ emailAddress: { address: v.recipient } }] } : {}) });
        await remoteGraph( `/me/messages/${encodeURIComponent(remoteId!)}/send`, "POST");
        assertConnection();
        await db().prepare("UPDATE mail_send_requests SET status='sent' WHERE user=? AND id=?").bind(user, v.requestId).run();
        if (v.draftId) await db().prepare("DELETE FROM mail_drafts WHERE id=? AND user=?").bind(v.draftId, user).run();
        if (v.remoteDraftId) await db().prepare("DELETE FROM outlook_messages WHERE id=? AND user=? AND folder='drafts'").bind(v.remoteDraftId, user).run();
        return json({ ok: true });
      } catch (e) {
        await db().prepare("UPDATE mail_send_requests SET status='uncertain' WHERE user=? AND id=?").bind(user, v.requestId).run();
        fail("Microsoft kon de verzending niet bevestigen. Controleer Verzonden en Concepten in Outlook voordat je opnieuw verstuurt.", 503);
      }
    }
    fail("Onbekende mailboxactie.");
  } catch (e) { return error(e); }
}
