import { getCurrentUser } from "@/lib/session";
import { db, uid } from "@/lib/server";
import { paymentConfig } from "@/lib/mollie";
export async function GET() {
  try {
    const u = await getCurrentUser();
    if (!u) return Response.json({ error: "Log eerst in." }, { status: 401 });
    const p = await db()
      .prepare("SELECT role FROM users WHERE id=?")
      .bind(u.userId)
      .first<{ role: string }>();
    if (p?.role !== "developer")
      return Response.json(
        { error: "Alleen developers kunnen een Mollie-account koppelen." },
        { status: 403 },
      );
    const c = paymentConfig();
    const state = uid() + uid();
    await db()
      .prepare("DELETE FROM oauth_states WHERE expires<?")
      .bind(Date.now())
      .run();
    await db()
      .prepare("INSERT INTO oauth_states (id,user,expires) VALUES (?,?,?)")
      .bind(state, u.userId, Date.now() + 600000)
      .run();
    const url = new URL("https://my.mollie.com/oauth2/authorize");
    url.search = new URLSearchParams({
      client_id: c.MOLLIE_CLIENT_ID,
      redirect_uri: c.APP_ORIGIN + "/api/mollie/callback",
      state,
      response_type: "code",
      scope:
        "payments.read payments.write profiles.read refunds.read refunds.write",
    }).toString();
    return Response.redirect(url, 302);
  } catch (e) {
    return Response.json({ error: (e as Error).message }, { status: 503 });
  }
}
