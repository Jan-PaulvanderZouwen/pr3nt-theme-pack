// Loaded ONLY by the isolated test server. No Microsoft/Mollie network request is sent.
import Database from "better-sqlite3";
import { writeFileSync } from "node:fs";
import path from "node:path";
const nativeFetch = globalThis.fetch;
const database = new Database(path.join(process.env.DATA_DIR, "bouwr.sqlite"));
const payments = new Map(), mail = new Map(), counters = { send: 0, createPayment: 0, token: 0 };
const gets = new Map();
const json = (body, status = 200) => Response.json(body, { status });
const count = () => writeFileSync(path.join(process.env.DATA_DIR, "provider-counts.json"), JSON.stringify(counters));
function fixture(id, folder) {
  return { id, subject: "Outlook review " + folder, conversationId: "conversation-" + id, from: { emailAddress: { name: "Client Example", address: "client@example.invalid" } }, replyTo: [{ emailAddress: { address: "support@example.invalid" } }], toRecipients: [{ emailAddress: { address: "owner@example.invalid" } }], bodyPreview: "Review the project", body: { contentType: "text", content: "Review notes from Outlook.\nNo real email was sent." }, isRead: false, flag: { flagStatus: "notFlagged" }, hasAttachments: true, receivedDateTime: new Date().toISOString(), webLink: "https://outlook.office.com/mail/inbox/id/" + id, folder };
}
for (const folder of ["inbox", "sentitems", "drafts", "archive"]) mail.set("message-" + folder, fixture("message-" + folder, folder));
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
  if (!["api.mollie.com", "graph.microsoft.com", "login.microsoftonline.com"].includes(url.hostname)) {
    if (["127.0.0.1", "localhost", "test.invalid"].includes(url.hostname)) return nativeFetch(input, init);
    throw Error("Unmocked network request blocked in integration tests.");
  }
  const method = init.method || "GET";
  if (url.hostname === "login.microsoftonline.com") {
    const values = new URLSearchParams(init.body);
    if (values.get("grant_type") === "authorization_code" && !values.get("code_verifier")) return json({ error: "missing PKCE" }, 400);
    counters.token++; count();
    return json({ access_token: "mock-graph-token", refresh_token: "mock-refresh-token", expires_in: 3600, scope: "User.Read Mail.ReadWrite Mail.Send" });
  }
  if (url.hostname === "api.mollie.com") {
    if (url.pathname === "/v2/payments" && method === "POST") {
      const key = new Headers(init.headers).get("Idempotency-Key");
      const existing = [...payments.values()].find(p => p.key === key);
      if (existing) return json(existing);
      counters.createPayment++; count();
      const body = JSON.parse(init.body), id = "tr_Test" + counters.createPayment;
      const p = { ...body, key, id, status: "open", _links: { checkout: { href: "https://www.mollie.com/checkout/" + id } } };
      payments.set(id, p); return json(p, 201);
    }
    if (url.pathname.startsWith("/v2/payments/") && method === "GET") {
      const id = url.pathname.split("/").at(-1), row = database.prepare("SELECT * FROM payments WHERE id=?").get(id);
      if (!row) return json({}, 404);
      const n = (gets.get(id) || 0) + 1; gets.set(id, n);
      return json({ id, status: id === "tr_Expired" ? "expired" : n > 1 ? "paid" : "open", amount: { currency: "EUR", value: (row.amount / 100).toFixed(2) }, metadata: { project: row.project, phase: row.phase || null }, _links: { checkout: { href: "https://www.mollie.com/checkout/" + id } } });
    }
    throw Error("Unmocked Mollie request");
  }
  if (url.pathname === "/v1.0/me") return json({ id: "mock-ms-user", mail: "owner@example.invalid", userPrincipalName: "owner@example.invalid" });
  const folder = url.pathname.match(/^\/v1\.0\/me\/mailFolders\/(inbox|sentitems|drafts|archive)\/messages\/delta$/)?.[1];
  if (folder) return json({ value: [...mail.values()].filter(m => m.folder === folder), "@odata.deltaLink": `https://graph.microsoft.com/v1.0/me/mailFolders/${folder}/messages/delta?$deltatoken=fixture` });
  if (url.pathname === "/v1.0/me/messages" && method === "POST") { const body = JSON.parse(init.body); const id = "draft-new-" + mail.size; const m = { ...fixture(id, "drafts"), ...body }; mail.set(id, m); return json(m, 201); }
  const match = url.pathname.match(/^\/v1\.0\/me\/messages\/([^/]+)(?:\/(createReply|send|move))?$/);
  if (match) {
    const id = decodeURIComponent(match[1]), op = match[2], m = mail.get(id);
    if (!m) return json({}, 404);
    if (op === "createReply") { const draftId = "reply-" + mail.size, draft = { ...fixture(draftId, "drafts"), subject: "Re: " + m.subject, toRecipients: m.replyTo }; mail.set(draftId, draft); return json(draft, 201); }
    if (op === "send") { counters.send++; count(); m.folder = "sentitems"; return new Response(null, { status: 202 }); }
    if (op === "move") { m.folder = JSON.parse(init.body).destinationId; return json(m, 201); }
    if (method === "PATCH") { Object.assign(m, JSON.parse(init.body)); return json(m); }
    return json(m);
  }
  throw Error("Unmocked Graph request " + url.pathname);
};
