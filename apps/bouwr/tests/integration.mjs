// Tests use isolated storage and intercept email in this process; no real mail is sent.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";

const directory = mkdtempSync(path.join(tmpdir(), "bouwr-test-"));
Object.assign(process.env, {
  APP_ORIGIN: "https://test.invalid",
  DATA_DIR: directory,
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
  VAULT_KEY: randomBytes(32).toString("base64"),
  ADMIN_EMAIL: "owner@test.invalid",
  MOLLIE_CLIENT_ID: "mock-client",
  MOLLIE_CLIENT_SECRET: "mock-secret",
  MOLLIE_ENABLED: "true",
  MICROSOFT_CLIENT_ID: "mock-client",
  MICROSOFT_CLIENT_SECRET: "mock-secret",
});
await import("../scripts/migrate.ts");
const { env, getSqlite } = await import("../lib/runtime.ts");
const database = env.DB;
const { getAuth } = await import("../lib/auth.ts");
const auth = getAuth();
const captured = new Map();
const context = await auth.$context;
context.options.emailVerification.sendVerificationEmail = async ({
  user,
  url,
}) => {
  captured.set(user.email, url);
};

async function prepareAccounts(people) {
  for (const [index, [key, person]] of Object.entries(people).entries()) {
    const headers = {
      Origin: "https://test.invalid",
      "Content-Type": "application/json",
      "x-real-ip": `192.0.2.${index + 10}`,
    };
    const body = {
      name: key,
      email: person.email,
      password: "Test-passphrase-2026!",
      callbackURL: "/inloggen",
    };
    const signUp = await auth.handler(
      new Request("https://test.invalid/api/auth/sign-up/email", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    assert.equal(signUp.status, 200, await signUp.text());
    const unverified = await auth.handler(
      new Request("https://test.invalid/api/auth/sign-in/email", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    assert.equal(unverified.status, 403);
    const verify = await auth.handler(
      new Request(captured.get(person.email), { headers }),
    );
    assert.equal(verify.status, 302);
    const login = await auth.handler(
      new Request("https://test.invalid/api/auth/sign-in/email", {
        method: "POST",
        headers,
        body: JSON.stringify(body),
      }),
    );
    const data = await login.json();
    assert.equal(login.status, 200, JSON.stringify(data));
    person.id = data.user.id;
    person.cookie = login.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .filter((value) => value.includes("session_token="))
      .join("; ");
    assert.ok(person.cookie);
  }
}
const server = spawn(process.execPath, ["--import", "./tests/provider-mock.mjs", ".next/standalone/server.js"], {
  env: {
    ...process.env,
    NODE_ENV: "production",
    PORT: "3118",
    HOSTNAME: "127.0.0.1",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let logs = "";
server.stdout.on("data", (data) => {
  logs += data;
});
server.stderr.on("data", (data) => {
  logs += data;
});
const mf = {
  async dispatchFetch(url, options = {}) {
    const parsed = new URL(url);
    const headers = new Headers(options.headers);
    headers.set("Host", "test.invalid");
    headers.set("x-forwarded-proto", "https");
    headers.set("x-real-ip", "192.0.2.100");
    return fetch("http://127.0.0.1:3118" + parsed.pathname + parsed.search, {
      ...options,
      headers,
      redirect: "manual",
    });
  },
  async dispose() {
    server.kill("SIGTERM");
    await new Promise((resolve) => {
      server.once("exit", resolve);
      setTimeout(resolve, 2000);
    });
    rmSync(directory, { recursive: true, force: true });
  },
};
for (let i = 0; i < 100; i++) {
  try {
    const response = await mf.dispatchFetch("https://test.invalid/api/health");
    if (response.ok) break;
  } catch {}
  if (i === 99) throw new Error("Testserver kon niet starten: " + logs);
  await new Promise((resolve) => setTimeout(resolve, 100));
}
let count = 0;
const people = {
  owner: { id: "owner-id", email: "owner@test.invalid" },
  executor: { id: "executor-id", email: "executor@test.invalid" },
  outsider: { id: "outsider-id", email: "outsider@test.invalid" },
  client: { id: "client-id", email: "client@test.invalid" },
};
async function call(person, path = "", body, expected = 200) {
  const headers = {};
  if (person) {
    headers.Cookie = people[person].cookie;
  }
  if (body) {
    headers.Origin = "https://test.invalid";
    headers["Content-Type"] = "application/json";
  }
  const r = await mf.dispatchFetch(
    "https://test.invalid/api/workspace" + path,
    {
      method: body ? "POST" : "GET",
      headers,
      ...(body ? { body: JSON.stringify(body) } : {}),
    },
  );
  const raw = await r.text();
  assert.ok(
    raw,
    `${person || "anonymous"} ${body?.op || path}: empty response ${r.status} ${JSON.stringify([...r.headers])}`,
  );
  const d = JSON.parse(raw);
  assert.equal(
    r.status,
    expected,
    `${person || "anonymous"} ${body?.op || path}: ${JSON.stringify(d)}`,
  );
  count++;
  return d;
}
try {
  await prepareAccounts(people);
  await call(null, "", undefined, 401);
  for (const [name, u] of Object.entries(people))
    await call(name, "", {
      op: "register",
      name,
      company: "Test " + name,
      role: name === "client" ? "client" : "developer",
    });
  const p = await call("owner", "", {
    op: "create",
    title: "Secure portal test",
    client: "Confidential client name",
    description: "Public scope only.",
    category: "Webapp",
    budget: 125000,
    deadline: "2026-11-01",
    hosting: "Eigen hosting",
    contact: false,
    paymentMode: "platform",
    checklist: [
      { title: "Authorization checked", done: false, group: "Development" },
    ],
  });
  await call("client", "", { op: "create", title: "Denied" }, 403);
  await call(
    "outsider",
    "",
    {
      op: "create",
      title: "No direct billing",
      client: "Test",
      description: "Test",
      category: "Website",
      budget: 10000,
      deadline: "2026-11-01",
      hosting: "Eigen hosting",
      contact: false,
      paymentMode: "direct",
      checklist: [],
    },
    403,
  );
  await call("owner", "", {
    op: "vault",
    project: p.id,
    value: "sftp://private-host · secret password",
  });
  const market = await call("outsider");
  assert.ok(market.market.some((x) => x.id === p.id));
  assert.ok(!JSON.stringify(market).includes("Confidential client name"));
  const publicDetail = await call("outsider", "?project=" + p.id);
  assert.equal(publicDetail.project.client, undefined);
  assert.equal(publicDetail.hasSecret, true);
  assert.equal(publicDetail.messages.length, 0);
  await call("outsider", "", { op: "vault", project: p.id }, 403);
  await call(
    "outsider",
    "",
    { op: "chat", project: p.id, channel: "internal", body: "Not allowed" },
    403,
  );
  await call("executor", "", {
    op: "bid",
    project: p.id,
    amount: 100000,
    days: 14,
    message: "I can build this securely.",
  });
  const bids = await call("owner", "?project=" + p.id);
  assert.equal(bids.bids.length, 1);
  await call("owner", "", {
    op: "accept",
    project: p.id,
    bid: bids.bids[0].id,
  });
  await call(
    "owner",
    "",
    { op: "accept", project: p.id, bid: bids.bids[0].id },
    409,
  );
  const secret = await call("executor", "", { op: "vault", project: p.id });
  assert.ok(secret.value.includes("secret password"));
  await call("outsider", "?project=" + p.id, undefined, 403);
  await call("owner", "", {
    op: "invite",
    project: p.id,
    email: "client@test.invalid",
  });
  const upload = async (visible) => {
    const form = new FormData();
    form.append(
      "file",
      new Blob([visible ? "Shared deliverable" : "Private developer notes"], {
        type: "text/plain",
      }),
      visible ? "deliverable.txt" : "private.txt",
    );
    form.append("project", p.id);
    form.append("folder", "06 Oplevering");
    form.append("clientVisible", String(visible));
    const encoded = new Request("https://test.invalid/api/workspace", {
      method: "POST",
      body: form,
    });
    const response = await mf.dispatchFetch(
      "https://test.invalid/api/workspace",
      {
        method: "POST",
        headers: {
          Origin: "https://test.invalid",
          "Content-Type": encoded.headers.get("content-type"),
          Cookie: people.owner.cookie,
        },
        body: await encoded.arrayBuffer(),
      },
    );
    assert.equal(response.status, 200, await response.text());
    count++;
  };
  await upload(false);
  await upload(true);
  const uploaded = await call("owner", "?project=" + p.id);
  assert.equal(uploaded.files.length, 2);
  const privateFile = uploaded.files.find((f) => !f.client_visible);
  const deniedFile = await mf.dispatchFetch(
    "https://test.invalid/api/workspace?download=" + privateFile.id,
    {
      headers: {
        Cookie: people.client.cookie,
      },
    },
  );
  assert.equal(deniedFile.status, 403);
  count++;
  const sharedFile = uploaded.files.find((f) => f.client_visible);
  const download = await mf.dispatchFetch(
    "https://test.invalid/api/workspace?download=" + sharedFile.id,
    {
      headers: {
        Cookie: people.client.cookie,
      },
    },
  );
  assert.equal(download.status, 200);
  assert.equal(await download.text(), "Shared deliverable");
  assert.equal(download.headers.get("x-content-type-options"), "nosniff");
  assert.ok(download.headers.get("content-disposition").includes("attachment"));
  count++;
  const storedSecret = await database
    .prepare("SELECT secret FROM projects WHERE id=?")
    .bind(p.id)
    .first();
  assert.ok(!storedSecret.secret.includes("secret password"));
  const clientDetail = await call("client", "?project=" + p.id);
  assert.equal(clientDetail.files.length, 1);
  assert.equal(clientDetail.files[0].name, "deliverable.txt");
  assert.equal(clientDetail.project.budget, undefined);
  assert.equal(clientDetail.project.secret, undefined);
  assert.equal(clientDetail.project.payment_mode, undefined);
  assert.equal(clientDetail.bids.length, 0);
  await call("client", "", { op: "vault", project: p.id }, 403);
  await call(
    "client",
    "",
    { op: "chat", project: p.id, channel: "internal", body: "Denied" },
    403,
  );
  await call(
    "executor",
    "",
    { op: "chat", project: p.id, channel: "client", body: "Denied" },
    403,
  );
  await call("owner", "", {
    op: "chat",
    project: p.id,
    channel: "internal",
    body: "Internal secret message",
  });
  await call("client", "", {
    op: "chat",
    project: p.id,
    channel: "client",
    body: "Hello developer",
  });
  const clientChat = await call("client", "?project=" + p.id);
  assert.ok(!JSON.stringify(clientChat).includes("Internal secret message"));
  await call("owner", "", { op: "contact", project: p.id, contact: true });
  await call("executor", "", {
    op: "chat",
    project: p.id,
    channel: "client",
    body: "Hello client",
  });
  await call("executor", "", {
    op: "update",
    project: p.id,
    progress: 90,
    status: "review",
    checklist: [],
  });
  await call(
    "executor",
    "",
    {
      op: "update",
      project: p.id,
      progress: 100,
      status: "completed",
      checklist: [],
    },
    403,
  );
  await call("owner", "", {
    op: "update",
    project: p.id,
    progress: 100,
    status: "completed",
    checklist: [],
  });
  await call("owner", "", { op: "payment", project: p.id }, 503);
  const after = await call("owner");
  assert.ok(after.notifications.length > 0);
  assert.ok(after.admin);
  const permission = await call("executor");
  assert.equal(permission.admin, null);
  const invites = await call("owner", "?project=" + p.id);
  await call("owner", "", {
    op: "revoke",
    project: p.id,
    invite: invites.invites[0].id,
  });
  await call("client", "?project=" + p.id, undefined, 403);
  const csrf = await mf.dispatchFetch("https://test.invalid/api/workspace", {
    method: "POST",
    headers: {
      Origin: "https://evil.invalid",
      "Content-Type": "application/json",
      Cookie: people.owner.cookie,
    },
    body: JSON.stringify({ op: "readNotifications" }),
  });
  assert.equal(csrf.status, 403);
  count++;

  // Personal overview and configurator remain private and server-validated.
  const { newConfiguration } = await import("../lib/configurator.ts");
  const { defaultWidgets } = await import("../lib/dashboard.ts");
  const { encrypt } = await import("../lib/server.ts");
  const widgets = defaultWidgets().reverse();
  widgets.push({ id: crypto.randomUUID(), kind: "notes", title: "Private owner note", width: "small", content: "Owner-only reminder", links: [] });
  await call("owner", "", { op: "saveDashboard", widgets });
  assert.equal((await call("owner")).dashboard.at(-1).content, "Owner-only reminder");
  assert.ok(!JSON.stringify((await call("executor")).dashboard).includes("Owner-only reminder"));
  await call("client", "", { op: "saveDashboard", widgets }, 403);
  await call("owner", "", { op: "saveDashboard", widgets: [{ ...widgets[0], links: [{ label: "Unsafe", url: "javascript:alert(1)" }] }] }, 400);
  const configuration = { ...newConfiguration(), title: "Configured website", client: "Private configured client", purpose: "Public website goal", audience: "Private audience note", technicalNotes: "Private integration requirements", budget: 123457, deadline: "2026-12-01", paymentSchedule: "phases" };
  await call("owner", "", { op: "saveConfigurationDraft", configuration });
  assert.equal((await call("owner")).configuratorDraft.configuration.technicalNotes, "Private integration requirements");
  assert.equal((await call("executor")).configuratorDraft, null);
  await call("client", "", { op: "saveConfigurationDraft", configuration }, 403);
  const configured = await call("owner", "", { op: "create", configuration });
  let configuredDetail = await call("owner", "?project=" + configured.id);
  assert.equal(configuredDetail.project.payment_schedule, "phases");
  assert.equal(configuredDetail.phases.length, 3);
  assert.equal(configuredDetail.phases.reduce((v, phase) => v + phase.amount, 0), 123457);
  assert.ok(configuredDetail.project.document.includes("Private integration requirements"));
  assert.ok(configuredDetail.project.checklist.some(item => item.title.includes("Contactformulier")));
  assert.equal((await call("owner")).configuratorDraft, null);
  const publicConfig = await call("outsider", "?project=" + configured.id);
  assert.equal(publicConfig.project.configuration, undefined);
  assert.equal(publicConfig.project.document, undefined);
  assert.ok(!JSON.stringify(await call("outsider")).includes("Private integration requirements"));
  const briefing = await mf.dispatchFetch("https://test.invalid/api/workspace?document=" + configured.id, { headers: { Cookie: people.owner.cookie } });
  assert.equal(briefing.status, 200); assert.equal(briefing.headers.get("content-type"), "application/pdf");
  assert.ok(briefing.headers.get("content-disposition").endsWith('.pdf"'));
  const pdfBytes = Buffer.from(await briefing.arrayBuffer()); assert.ok(pdfBytes.subarray(0, 5).equals(Buffer.from("%PDF-")));
  const { PDFDocument, PDFName } = await import("pdf-lib"); const pdf = await PDFDocument.load(pdfBytes);
  assert.ok(pdf.getPageCount() >= 2); for (const page of pdf.getPages()) assert.equal(page.node.Resources()?.lookup(PDFName.of("XObject"))?.keys().length || 0, 0);
  const pdfPath = path.join(directory, "briefing.pdf"); writeFileSync(pdfPath, pdfBytes);
  const extracted = spawnSync("pdftotext", [pdfPath, "-"], { encoding: "utf8" });
  if (!extracted.error) { assert.equal(extracted.status, 0); assert.ok(extracted.stdout.includes("Private integration requirements")); assert.ok(extracted.stdout.includes("Opleverchecklist")); }
  count++;
  const deniedBriefing = await mf.dispatchFetch("https://test.invalid/api/workspace?document=" + configured.id, { headers: { Cookie: people.outsider.cookie } });
  assert.equal(deniedBriefing.status, 403); count++;
  // Short portal links retain login redirects and enforce the invited, verified address.
  const portalLink = await call("owner", "", { op: "invite", project: configured.id, email: people.client.email });
  assert.equal(portalLink.url, `/portaal/${configured.id}`);
  const portalLogin = await mf.dispatchFetch("https://test.invalid" + portalLink.url);
  assert.equal(portalLogin.status, 307); assert.equal(portalLogin.headers.get("location"), "/inloggen?returnTo=" + encodeURIComponent(portalLink.url)); count++;
  const wrongPortal = await mf.dispatchFetch("https://test.invalid" + portalLink.url, { headers: { Cookie: people.outsider.cookie } });
  const wrongHtml = await wrongPortal.text(); assert.ok(wrongHtml.includes("Geen toegang tot dit klantportaal")); assert.ok(!wrongHtml.includes("Private integration requirements")); count++;
  await call("outsider", "", { op: "preparePortal", project: configured.id }, 403);
  getSqlite().prepare("DELETE FROM users WHERE id=?").run(people.client.id);
  const portalPage = await mf.dispatchFetch("https://test.invalid" + portalLink.url, { headers: { Cookie: people.client.cookie } });
  assert.equal(portalPage.status, 200); assert.ok(!(await portalPage.text()).includes("Private integration requirements")); count++;
  await call("client", "", { op: "preparePortal", project: configured.id });
  await call("client", "", { op: "preparePortal", project: configured.id });
  assert.equal(getSqlite().prepare("SELECT role FROM users WHERE id=?").get(people.client.id).role, "client");
  await call("client", "?project=" + configured.id);
  const clientBriefing = await mf.dispatchFetch("https://test.invalid/api/workspace?document=" + configured.id, { headers: { Cookie: people.client.cookie } }); assert.equal(clientBriefing.status, 403); count++;
  const portalInvite = (await call("owner", "?project=" + configured.id)).invites.find(i => i.email === people.client.email);
  await call("owner", "", { op: "revoke", project: configured.id, invite: portalInvite.id });
  await call("client", "", { op: "preparePortal", project: configured.id }, 403);
  const revokedPortal = await mf.dispatchFetch("https://test.invalid" + portalLink.url, { headers: { Cookie: people.client.cookie } }); assert.ok((await revokedPortal.text()).includes("Geen toegang tot dit klantportaal")); count++;
  await call("executor", "", { op: "bid", project: configured.id, amount: 100001, days: 20, message: "Configure this scope" });
  await call("owner", "", { op: "saveConfiguration", project: configured.id, configuration: { ...configuration, headline: "Updated design" } });
  assert.equal((await call("owner", "?project=" + configured.id)).bids[0].status, "declined");
  await call("executor", "", { op: "bid", project: configured.id, amount: 100001, days: 20, message: "Updated scope accepted" });
  const currentBid = (await call("owner", "?project=" + configured.id)).bids[0];
  await call("owner", "", { op: "accept", project: configured.id, bid: currentBid.id });
  configuredDetail = await call("owner", "?project=" + configured.id);
  assert.equal(configuredDetail.phases.reduce((v, phase) => v + phase.amount, 0), 100001);
  await call("owner", "", { op: "saveConfiguration", project: configured.id, configuration }, 403);
  await call("owner", "", { op: "paymentPlan", project: configured.id, schedule: "phases", phases: [{ name: "One", percentage: 20 }, { name: "Two", percentage: 20 }] }, 400);
  await call("executor", "", { op: "paymentPlan", project: configured.id, schedule: "full" }, 403);
  const [phaseOne, phaseTwo] = configuredDetail.phases;
  await call("owner", "", { op: "payment", project: configured.id }, 503);
  await call("owner", "", { op: "payment", project: configured.id, phase: phaseOne.id }, 503);
  await call("outsider", "", { op: "phaseStatus", project: configured.id, phase: phaseOne.id, status: "submitted" }, 403);
  await call("executor", "", { op: "phaseStatus", project: configured.id, phase: phaseOne.id, status: "submitted" });
  await call("executor", "", { op: "phaseStatus", project: configured.id, phase: phaseOne.id, status: "approved" }, 403);
  await call("owner", "", { op: "phaseStatus", project: configured.id, phase: phaseOne.id, status: "approved" });
  getSqlite().prepare("INSERT INTO mollie_connections (user,tokens,profile,expires) VALUES (?,?,?,?)").run(people.executor.id, await encrypt(JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh" })), "pfl_mock", Date.now() + 3600000);
  const firstCheckout = await call("owner", "", { op: "payment", project: configured.id, phase: phaseOne.id });
  assert.ok(firstCheckout.checkout.startsWith("https://www.mollie.com/"));
  const sameCheckout = await call("owner", "", { op: "payment", project: configured.id, phase: phaseOne.id });
  assert.equal(sameCheckout.checkout, firstCheckout.checkout);
  const paymentRows = getSqlite().prepare("SELECT * FROM payments WHERE phase=?").all(phaseOne.id);
  assert.equal(paymentRows.length, 1); assert.equal(paymentRows[0].fee, Math.round(phaseOne.amount * 0.05));
  await call("owner", "", { op: "paymentStatus", project: configured.id });
  assert.equal((await call("owner", "?project=" + configured.id)).payments[0].status, "paid");
  await call("owner", "", { op: "payment", project: configured.id, phase: phaseOne.id }, 503);
  await call("owner", "", { op: "phaseStatus", project: configured.id, phase: phaseOne.id, status: "pending" }, 409);
  await call("owner", "", { op: "paymentPlan", project: configured.id, schedule: "full" }, 409);
  await call("executor", "", { op: "phaseStatus", project: configured.id, phase: phaseTwo.id, status: "submitted" });
  await call("owner", "", { op: "phaseStatus", project: configured.id, phase: phaseTwo.id, status: "approved" });
  getSqlite().prepare("INSERT INTO payments (id,project,phase,amount,fee,status,attempt,created) VALUES (?,?,?,?,?,'open',1,?)").run("tr_Expired", configured.id, phaseTwo.id, phaseTwo.amount, Math.round(phaseTwo.amount * 0.15), new Date().toISOString());
  await call("owner", "", { op: "payment", project: configured.id, phase: phaseTwo.id });
  const retry = getSqlite().prepare("SELECT * FROM payments WHERE phase=? ORDER BY attempt DESC").all(phaseTwo.id);
  assert.equal(retry.length, 2); assert.equal(retry[0].attempt, 2); assert.equal(retry[1].status, "expired");
  assert.equal(retry[0].fee, Math.round(phaseTwo.amount * 0.05)); assert.equal(retry[1].fee, Math.round(phaseTwo.amount * 0.15));

  // Mailbox views use the same project rights; state/drafts belong to one user.
  async function mailCall(person, suffix = "", body, expected = 200) {
    const response = await mf.dispatchFetch("https://test.invalid/api/mailbox" + suffix, { method: body ? "POST" : "GET", headers: { ...(person ? { Cookie: people[person].cookie } : {}), ...(body ? { Origin: "https://test.invalid", "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const value = await response.json(); assert.equal(response.status, expected, JSON.stringify(value)); count++; return value;
  }
  await mailCall(null, "", undefined, 401);
  await call("owner", "", { op: "chat", project: configured.id, channel: "internal", body: "Private configurator conversation" });
  await call("owner", "", { op: "chat", project: configured.id, channel: "client", body: "Private customer conversation" });
  const executorMail = await mailCall("executor");
  assert.ok(executorMail.threads.some(t => t.id === configured.id + ":internal"));
  assert.ok(!executorMail.threads.some(t => t.id === configured.id + ":client"));
  assert.ok(!JSON.stringify(await mailCall("outsider")).includes("Private configurator conversation"));
  const internal = await mailCall("executor", "?thread=" + configured.id + ":internal");
  assert.equal(internal.messages[0].body, "Private configurator conversation");
  await mailCall("executor", "?thread=" + configured.id + ":client", undefined, 403);
  await mailCall("executor", "", { op: "threadState", thread: configured.id + ":internal", readUntil: internal.messages[0].created, starred: true });
  assert.equal((await mailCall("executor")).threads.find(t => t.id === configured.id + ":internal").unread, 0);
  assert.equal((await mailCall("owner")).threads.find(t => t.id === configured.id + ":internal").starred, false);
  const draft = await mailCall("executor", "", { op: "saveDraft", kind: "project", project: configured.id, channel: "internal", subject: "Private draft", body: "Unsent message" });
  assert.equal((await mailCall("executor")).drafts.length, 1);
  assert.equal((await mailCall("owner")).drafts.length, 0);
  await mailCall("owner", "", { op: "saveDraft", id: draft.id, kind: "project", project: configured.id, channel: "internal", subject: "Attempt", body: "Denied" }, 403);
  const chatRequest = crypto.randomUUID();
  for (let i = 0; i < 2; i++) await call("executor", "", { op: "chat", project: configured.id, channel: "internal", body: "One message only", requestId: chatRequest });
  assert.equal(getSqlite().prepare("SELECT COUNT(*) AS count FROM messages WHERE request_id=?").get(chatRequest).count, 1);

  const offlineEmailDraft = await mailCall("owner", "", { op: "saveDraft", kind: "outlook", recipient: "outside@external.invalid", subject: "Write before connecting", body: "Keep this concept through the initial connection" });
  await mailCall("client", "", { op: "saveDraft", kind: "outlook", subject: "Denied", body: "Client cannot create mailbox drafts" }, 403);
  // Fake Microsoft OAuth and Graph endpoints; real credentials/email are never used.
  const connect = await mf.dispatchFetch("https://test.invalid/api/outlook/connect", { headers: { Cookie: people.owner.cookie } });
  assert.equal(connect.status, 302); const authorize = new URL(connect.headers.get("location"));
  assert.equal(authorize.searchParams.get("code_challenge_method"), "S256");
  const state = authorize.searchParams.get("state");
  const wrongUser = await mf.dispatchFetch("https://test.invalid/api/outlook/callback?state=" + state + "&code=mock-code", { headers: { Cookie: people.executor.cookie } });
  assert.equal(wrongUser.status, 403);
  const callback = await mf.dispatchFetch("https://test.invalid/api/outlook/callback?state=" + state + "&code=mock-code", { headers: { Cookie: people.owner.cookie } });
  assert.equal(callback.status, 302); count += 3;
  const consumedCallback = await mf.dispatchFetch("https://test.invalid/api/outlook/callback?state=" + state + "&code=mock-code", { headers: { Cookie: people.owner.cookie } }); assert.equal(consumedCallback.status, 403); count++;
  const tokenRow = getSqlite().prepare("SELECT tokens FROM outlook_connections WHERE user=?").get(people.owner.id);
  assert.ok(!tokenRow.tokens.includes("mock-graph-token"));
  assert.ok((await mailCall("owner")).drafts.some(d => d.id === offlineEmailDraft.id));
  await mailCall("owner", "", { op: "sync" });
  const outlook = await mailCall("owner");
  assert.equal(outlook.external.length, 4); assert.equal(outlook.outlook.connection.email, "owner@example.invalid");
  assert.equal((await mailCall("executor")).external.length, 0);
  await mailCall("executor", "?external=message-inbox", undefined, 404);
  await mailCall("executor", "", { op: "externalState", id: "message-inbox", read: true }, 404);
  await mailCall("owner", "", { op: "externalState", id: "message-inbox", read: true, starred: true });
  let externalRow = (await mailCall("owner", "?external=message-inbox")).message;
  assert.equal(externalRow.is_read, 1); assert.equal(externalRow.starred, 1);
  assert.ok(externalRow.reply_to.includes("support@example.invalid"));
  await mailCall("owner", "", { op: "externalState", id: "message-inbox", archived: true });
  assert.equal((await mailCall("owner", "?external=message-inbox")).message.folder, "archive");
  const sendRequest = crypto.randomUUID();
  await mailCall("owner", "", { op: "sendOutlook", requestId: sendRequest, replyId: "message-inbox", subject: "Re: review", body: "Simulated reply only" });
  await mailCall("owner", "", { op: "sendOutlook", requestId: sendRequest, replyId: "message-inbox", subject: "Re: review", body: "Simulated reply only" });
  assert.equal(JSON.parse(readFileSync(path.join(directory, "provider-counts.json"), "utf8")).send, 1);
  const externalRequest = crypto.randomUUID();
  for (let i = 0; i < 2; i++) await mailCall("owner", "", { op: "sendOutlook", requestId: externalRequest, recipient: "outside@external.invalid", subject: "New external email", body: "Explicit outbound email test" });
  const outbound = JSON.parse(readFileSync(path.join(directory, "provider-counts.json"), "utf8"));
  assert.equal(outbound.send, 2); assert.equal(outbound.lastSent.recipients[0].emailAddress.address, "outside@external.invalid"); assert.equal(outbound.lastSent.subject, "New external email");
  await mailCall("owner", "", { op: "sendOutlook", requestId: crypto.randomUUID(), recipient: "invalid-address", subject: "Denied", body: "Invalid destination" }, 400);
  await mailCall("owner", "", { op: "saveOutlookDraft", remoteDraftId: "message-drafts", recipient: "client@example.invalid", subject: "Edited draft", body: "Draft content only" });
  assert.equal((await mailCall("owner", "?external=message-drafts")).message.subject, "Edited draft");
  getSqlite().prepare("UPDATE outlook_sync SET cursor=? WHERE user=? AND folder='inbox'").run("https://malicious.invalid/token-collector", people.owner.id);
  await mailCall("owner", "", { op: "sync" }, 400);
  await mailCall("client", "", { op: "sync" }, 403);
  await mailCall("owner", "", { op: "disconnect" });
  assert.equal((await mailCall("owner")).external.length, 0);
  assert.equal(getSqlite().prepare("SELECT user FROM outlook_connections WHERE user=?").get(people.owner.id), undefined);
  const mailboxCsrf = await mf.dispatchFetch("https://test.invalid/api/mailbox", { method: "POST", headers: { Cookie: people.owner.cookie, Origin: "https://evil.invalid", "Content-Type": "application/json" }, body: JSON.stringify({ op: "disconnect" }) }); assert.equal(mailboxCsrf.status, 403); count++;
  const home = await mf.dispatchFetch("https://test.invalid/");
  assert.equal(home.status, 307);
  assert.ok(home.headers.get("location")?.startsWith("/inloggen"));
  assert.ok(
    !(await home.text()).includes("Goed overzicht. Lekker doorbouwen."),
  );
  const protectedHome = await mf.dispatchFetch("https://test.invalid/", {
    headers: { Cookie: people.owner.cookie },
  });
  assert.equal(protectedHome.status, 200);
  const html = await protectedHome.text();
  assert.ok(html.includes("Goed overzicht. Lekker doorbouwen."));
  assert.ok(!html.includes("Confidential client name"));
  count++;
  const spoof = await mf.dispatchFetch("https://test.invalid/api/workspace", {
    headers: {
      "oai-authenticated-user-id": people.owner.id,
      "oai-authenticated-user-email": people.owner.email,
    },
  });
  assert.equal(spoof.status, 401);
  const signout = await mf.dispatchFetch(
    "https://test.invalid/api/auth/sign-out",
    {
      method: "POST",
      headers: {
        Cookie: people.owner.cookie,
        Origin: "https://test.invalid",
        "Content-Type": "application/json",
      },
      body: "{}",
    },
  );
  assert.equal(signout.status, 200);
  await call("owner", "", undefined, 401);
  const signedOut = await mf.dispatchFetch("https://test.invalid/", {
    headers: { Cookie: people.owner.cookie },
  });
  assert.equal(signedOut.status, 307);
  console.log(
    `PASS: ${count} integration requests · authentication, roles, configurator, documents, widgets, private mailbox, mocked Outlook OAuth/send/sync, phases, 5% fees, payment retries, CSRF and SSR.`,
  );
} finally {
  await mf.dispose();
}
