import { env } from "./runtime";
export function db() {
  if (!env.DB)
    throw new Error("De gegevensopslag is tijdelijk niet beschikbaar.");
  return env.DB;
}
export function config() {
  return process.env as Record<string, string>;
}
export async function encrypt(value: string) {
  const key = config().VAULT_KEY;
  if (!key) throw new Error("De hostingkluis is nog niet geconfigureerd.");
  const raw = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      k,
      new TextEncoder().encode(value),
    ),
  );
  return btoa(String.fromCharCode(...iv, ...data));
}
export async function decrypt(value: string) {
  const key = config().VAULT_KEY;
  if (!key) throw new Error("Hostingkluis niet beschikbaar.");
  const raw = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  const k = await crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "decrypt",
  ]);
  const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
  return new TextDecoder().decode(
    await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: bytes.slice(0, 12) },
      k,
      bytes.slice(12),
    ),
  );
}
export const now = () => new Date().toISOString();
export const uid = () => crypto.randomUUID();
export async function notify(
  user: string | null,
  project: string,
  body: string,
) {
  if (user)
    await db()
      .prepare(
        "INSERT INTO notifications (id,user,project,body,created) VALUES (?,?,?,?,?)",
      )
      .bind(uid(), user, project, body, now())
      .run();
}
