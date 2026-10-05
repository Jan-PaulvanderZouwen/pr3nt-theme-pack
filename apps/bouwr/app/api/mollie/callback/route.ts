import { getCurrentUser } from "@/lib/session";
import { db, encrypt } from "@/lib/server";
import { paymentConfig, oauthToken } from "@/lib/mollie";
export async function GET(req: Request) {
  try {
    const u = await getCurrentUser();
    if (!u) return Response.json({ error: "Log eerst in." }, { status: 401 });
    const url = new URL(req.url),
      state = url.searchParams.get("state"),
      code = url.searchParams.get("code");
    if (!state || !code)
      return Response.json(
        { error: "Accountkoppeling afgebroken." },
        { status: 400 },
      );
    const consumed = await db()
      .prepare(
        "DELETE FROM oauth_states WHERE id=? AND user=? AND expires>? RETURNING id",
      )
      .bind(state, u.userId, Date.now())
      .first();
    if (!consumed)
      return Response.json(
        { error: "Deze koppelaanvraag is verlopen. Start opnieuw." },
        { status: 403 },
      );
    const c = paymentConfig();
    const t = await oauthToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: c.APP_ORIGIN + "/api/mollie/callback",
    });
    const r = await fetch("https://api.mollie.com/v2/profiles", {
      headers: { Authorization: `Bearer ${t.access_token}` },
    });
    const j = (await r.json()) as Record<string, any>;
    const profiles =
      j._embedded?.profiles?.filter(
        (p: Record<string, any>) => p.status !== "blocked",
      ) || [];
    if (!r.ok || profiles.length !== 1)
      return Response.json(
        {
          error:
            "Koppel een account met één betaalprofiel. Meerdere profielen moeten eerst door de beheerder worden ingesteld.",
        },
        { status: 400 },
      );
    await db()
      .prepare(
        "INSERT INTO mollie_connections (user,tokens,profile,expires) VALUES (?,?,?,?) ON CONFLICT(user) DO UPDATE SET tokens=excluded.tokens,profile=excluded.profile,expires=excluded.expires",
      )
      .bind(
        u.userId,
        await encrypt(JSON.stringify(t)),
        profiles[0].id,
        Date.now() + Number(t.expires_in || 3600) * 1000,
      )
      .run();
    return Response.redirect(c.APP_ORIGIN + "/?mollie=connected", 302);
  } catch (e) {
    console.error("Mollie callback failed", (e as Error).message);
    return Response.json(
      { error: "Mollie koppelen is niet gelukt. Start opnieuw." },
      { status: 503 },
    );
  }
}
