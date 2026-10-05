import { config, db, encrypt, decrypt, notify, now } from "./server";
type Json = Record<string, any>;
const amount = (cents: number) => ({
  currency: "EUR",
  value: (cents / 100).toFixed(2),
});
export function paymentConfig(): Record<string, string> {
  const c = config();
  if (
    !c.MOLLIE_CLIENT_ID ||
    !c.MOLLIE_CLIENT_SECRET ||
    !c.APP_ORIGIN ||
    !c.VAULT_KEY
  )
    throw Error("Mollie Connect is nog niet gekoppeld.");
  const origin = new URL(c.APP_ORIGIN);
  if (origin.protocol !== "https:")
    throw Error("Mollie vereist een beveiligde domeinnaam.");
  return { ...c, APP_ORIGIN: origin.origin };
}
export async function oauthToken(values: Record<string, string>) {
  const c = paymentConfig();
  const r = await fetch("https://api.mollie.com/oauth2/tokens", {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(c.MOLLIE_CLIENT_ID + ":" + c.MOLLIE_CLIENT_SECRET)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      redirect_uri: c.APP_ORIGIN + "/api/mollie/callback",
      ...values,
    }),
  });
  const j = (await r.json()) as Json;
  if (!r.ok || !j.access_token || !j.refresh_token)
    throw Error(
      "Mollie-accountkoppeling niet gelukt. Koppel je account opnieuw.",
    );
  return j;
}
export async function merchantToken(user: string) {
  const row = await db()
    .prepare("SELECT * FROM mollie_connections WHERE user=?")
    .bind(user)
    .first<Json>();
  if (!row)
    throw Error("De uitvoerder heeft zijn Mollie-account nog niet gekoppeld.");
  let tokens = JSON.parse(await decrypt(row.tokens));
  if (row.expires < Date.now() + 60000) {
    tokens = await oauthToken({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
    });
    await db()
      .prepare("UPDATE mollie_connections SET tokens=?,expires=? WHERE user=?")
      .bind(
        await encrypt(JSON.stringify(tokens)),
        Date.now() + Number(tokens.expires_in || 3600) * 1000,
        user,
      )
      .run();
  }
  return { token: tokens.access_token, profile: row.profile };
}
export async function syncPayment(id: string) {
  const row = await db()
    .prepare(
      "SELECT pay.*,p.executor,p.owner FROM payments pay JOIN projects p ON p.id=pay.project WHERE pay.id=?",
    )
    .bind(id)
    .first<Json>();
  if (!row) return null;
  const { token } = await merchantToken(row.executor);
  const c = paymentConfig();
  const url = `https://api.mollie.com/v2/payments/${encodeURIComponent(id)}${c.MOLLIE_LIVE === "true" ? "" : "?testmode=true"}`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  const p = (await r.json()) as Json;
  if (!r.ok) throw Error("Betaalstatus kon niet worden gecontroleerd.");
  if (
    p.id !== id ||
    p.metadata?.project !== row.project ||
    p.amount?.currency !== "EUR" ||
    p.amount.value !== amount(row.amount).value
  )
    throw Error("Betaalgegevens komen niet overeen.");
  if (p.status !== row.status) {
    const result = await db()
      .prepare("UPDATE payments SET status=? WHERE id=? AND status=?")
      .bind(p.status, id, row.status)
      .run();
    if (result.meta.changes && p.status === "paid") {
      await notify(
        row.owner,
        row.project,
        "De projectbetaling is ontvangen via Mollie.",
      );
      await notify(
        row.executor,
        row.project,
        "De projectbetaling is ontvangen via Mollie.",
      );
    }
  }
  return { id, status: p.status, checkout: p._links?.checkout?.href };
}
export async function createPayment(p: Json) {
  const c = paymentConfig();
  if (c.MOLLIE_ENABLED !== "true")
    throw Error(
      "Mollie is nog niet geactiveerd. Er wordt geen betaling gestart.",
    );
  const { token, profile } = await merchantToken(p.executor);
  const existing = await db()
    .prepare("SELECT id,status FROM payments WHERE project=?")
    .bind(p.id)
    .first<Json>();
  if (existing) {
    const current = await syncPayment(existing.id);
    if (current?.status === "paid") throw Error("Dit project is al betaald.");
    if (current?.checkout) return { checkout: current.checkout };
    throw Error(
      "Deze betaling heeft geen open checkout. Neem contact op met de beheerder.",
    );
  }
  const fee = Math.round((p.budget * 15) / 100);
  const r = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "Idempotency-Key": `bouwr-project-${p.id}`,
    },
    body: JSON.stringify({
      amount: amount(p.budget),
      description: `Bouwr · ${p.title}`.slice(0, 255),
      profileId: profile,
      redirectUrl: `${c.APP_ORIGIN}/?project=${p.id}&payment=return`,
      webhookUrl: `${c.APP_ORIGIN}/api/mollie/webhook`,
      locale: "nl_NL",
      metadata: { project: p.id },
      testmode: c.MOLLIE_LIVE !== "true",
      applicationFee: {
        amount: amount(fee),
        description: "Bouwr platformvergoeding 15%",
      },
    }),
  });
  const pay = (await r.json()) as Json;
  if (!r.ok || !pay.id || !pay._links?.checkout?.href)
    throw Error(
      "Mollie kon geen betaling starten. Controleer de accountkoppeling.",
    );
  const checkout = new URL(pay._links.checkout.href);
  if (
    checkout.protocol !== "https:" ||
    !(
      checkout.hostname === "mollie.com" ||
      checkout.hostname.endsWith(".mollie.com")
    )
  )
    throw Error("Ongeldige Mollie-checkout.");
  await db()
    .prepare(
      "INSERT INTO payments (id,project,amount,fee,status,created) VALUES (?,?,?,?,?,?) ON CONFLICT(project) DO NOTHING",
    )
    .bind(pay.id, p.id, p.budget, fee, pay.status, now())
    .run();
  return { checkout: checkout.href };
}
