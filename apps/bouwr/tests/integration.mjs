// Tests use isolated storage and intercept email in this process; no real mail is sent.
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { spawn } from "node:child_process";

const directory = mkdtempSync(path.join(tmpdir(), "bouwr-test-"));
Object.assign(process.env, {
  APP_ORIGIN: "https://test.invalid",
  DATA_DIR: directory,
  BETTER_AUTH_SECRET: randomBytes(48).toString("base64"),
  VAULT_KEY: randomBytes(32).toString("base64"),
  ADMIN_EMAIL: "owner@test.invalid",
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
const server = spawn(process.execPath, [".next/standalone/server.js"], {
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
    `PASS: ${count} integration requests · authentication, roles, bids, secrets, client access, chat, progress, notifications, CSRF and SSR.`,
  );
} finally {
  await mf.dispose();
}
