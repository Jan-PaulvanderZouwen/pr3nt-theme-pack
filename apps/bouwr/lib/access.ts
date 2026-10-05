import { getCurrentUser } from "./session";
import { db, config } from "./server";

export type Row = Record<string, any>;
export function fail(message: string, status = 400): never {
  throw Object.assign(new Error(message), { status });
}
export async function account() {
  const u = await getCurrentUser();
  if (!u) fail("Log eerst veilig in.", 401);
  const p = await db().prepare("SELECT * FROM users WHERE id=?").bind(u.userId).first<Row>();
  return { u, p, admin: !!config().ADMIN_EMAIL && u.email === config().ADMIN_EMAIL.toLowerCase() };
}
export async function projectAccess(id: string, a: Awaited<ReturnType<typeof account>>, allowOpen = false) {
  const p = await db().prepare("SELECT * FROM projects WHERE id=?").bind(id).first<Row>();
  if (!p) fail("Project niet gevonden.", 404);
  const owner = p.owner === a.u.userId, executor = p.executor === a.u.userId;
  const member = !!await db().prepare("SELECT id FROM memberships WHERE project=? AND email=? AND revoked=0").bind(id, a.u.email).first();
  if (!owner && !executor && !member && !a.admin && !(allowOpen && p.status === "open" && a.p?.role === "developer"))
    fail("Je hebt geen toegang tot dit project.", 403);
  return { p, owner, executor, member };
}
export async function chatAccess(id: string, channel: string, a: Awaited<ReturnType<typeof account>>) {
  const x = await projectAccess(id, a);
  if (channel === "internal" && !(x.owner || x.executor)) fail("Geen toegang tot developerberichten.", 403);
  if (channel === "client" && !(x.owner || x.member || (x.executor && x.p.contact))) fail("Klantcontact is niet toegestaan.", 403);
  if (!["internal", "client"].includes(channel)) fail("Ongeldig gesprek.");
  return x;
}
