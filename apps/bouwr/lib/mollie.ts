import { config, db, encrypt, decrypt, notify, now, uid } from "./server";
import { getSqlite } from "./runtime";
import { PLATFORM_FEE_PERCENT } from "./payment-plan";
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
    p.amount.value !== amount(row.amount).value ||
    (p.metadata?.phase || null) !== (row.phase || null)
  )
    throw Error("Betaalgegevens komen niet overeen.");
  if (!["open", "pending", "authorized", "paid", "canceled", "expired", "failed"].includes(p.status)) throw Error("Onbekende betaalstatus.");
  if (row.status === "paid" && p.status !== "paid") throw Error("Een ontvangen betaling kan niet worden teruggezet.");
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
  await db().prepare("UPDATE payment_intents SET status=? WHERE provider_id=?").bind(p.status, id).run();
  const checkout = p._links?.checkout?.href ? safeCheckout(p._links.checkout.href) : undefined;
  if (checkout) await db().prepare("UPDATE payments SET checkout=? WHERE id=?").bind(checkout, id).run();
  return { id, status: p.status, checkout };
}
function safeCheckout(value: string) {
  const url = new URL(value);
  if (url.protocol !== "https:" || !(url.hostname === "mollie.com" || url.hostname.endsWith(".mollie.com"))) throw Error("Ongeldige Mollie-checkout.");
  return url.href;
}
export async function createPayment(p: Json, phaseId?: string) {
  const c = paymentConfig();
  if (c.MOLLIE_ENABLED !== "true") throw Error("Mollie is nog niet geactiveerd. Er wordt geen betaling gestart.");
  if (p.payment_mode !== "platform" || !p.executor) throw Error("Betaling niet beschikbaar.");
  const phased = p.payment_schedule === "phases";
  if (phased !== !!phaseId) throw Error(phased ? "Kies de betaalfase." : "Dit project heeft één projectbetaling.");
  const phase = phaseId ? await db().prepare("SELECT * FROM project_phases WHERE id=? AND project=?").bind(phaseId, p.id).first<Json>() : null;
  if (phaseId && (!phase || phase.status !== "approved")) throw Error("Deze fase moet eerst door de opdrachtgever worden goedgekeurd.");
  const cents = phase?.amount ?? p.budget;
  if (!Number.isSafeInteger(cents) || cents < 100) throw Error("Een betaling moet minimaal € 1 zijn.");
  const existing = await db().prepare("SELECT * FROM payments WHERE project=? AND phase IS ? ORDER BY created DESC,attempt DESC").bind(p.id, phaseId || null).all<Json>();
  const paid = existing.results.find(payment => payment.status === "paid");
  if (paid) throw Error("Deze betaling is al ontvangen.");
  const active = existing.results.find(payment => ["open", "pending", "authorized"].includes(payment.status));
  if (active) {
    const current = await syncPayment(active.id);
    if (current?.status === "paid") throw Error("Deze betaling is al ontvangen.");
    if (current && ["open", "pending", "authorized"].includes(current.status)) {
      if (current.checkout) return { checkout: current.checkout };
      throw Error("De betaling is in verwerking. Vernieuw de status voordat je opnieuw probeert.");
    }
  }
  const { token, profile } = await merchantToken(p.executor);
  const intent = getSqlite().transaction(() => {
    const current = getSqlite().prepare("SELECT * FROM projects WHERE id=?").get(p.id) as Json;
    if (!current || current.executor !== p.executor || current.payment_mode !== "platform" || (current.payment_schedule === "phases") !== !!phaseId) throw Error("Het betaalplan is gewijzigd. Vernieuw het project.");
    const currentPhase = phaseId ? getSqlite().prepare("SELECT * FROM project_phases WHERE id=? AND project=?").get(phaseId, p.id) as Json | undefined : undefined;
    if (phaseId && currentPhase?.status !== "approved") throw Error("Deze fase moet eerst worden goedgekeurd.");
    const active = getSqlite().prepare("SELECT id FROM payments WHERE project=? AND phase IS ? AND status IN ('open','pending','authorized','paid')").get(p.id, phaseId || null) as Json | undefined;
    if (active) throw Error("Er is inmiddels een betaling gestart. Open de betaling opnieuw.");
    const scope = phaseId || "full";
    const unfinished = getSqlite().prepare("SELECT * FROM payment_intents WHERE project=? AND scope=? AND status='creating' ORDER BY attempt DESC LIMIT 1").get(p.id, scope) as Json | undefined;
    if (unfinished) return unfinished;
    const last = getSqlite().prepare("SELECT MAX(attempt) AS attempt FROM (SELECT attempt FROM payments WHERE project=? AND phase IS ? UNION ALL SELECT attempt FROM payment_intents WHERE project=? AND scope=?)").get(p.id, phaseId || null, p.id, scope) as Json;
    const attempt = (last.attempt || 0) + 1, amount = currentPhase?.amount ?? current.budget;
    const intent = { id: uid(), project: p.id, phase: phaseId || null, scope, attempt, amount, fee: Math.round(amount * PLATFORM_FEE_PERCENT / 100) };
    getSqlite().prepare("INSERT INTO payment_intents (id,project,phase,scope,attempt,amount,fee,created) VALUES (?,?,?,?,?,?,?,?)").run(intent.id, intent.project, intent.phase, intent.scope, intent.attempt, intent.amount, intent.fee, now());
    return intent;
  })();
  const fee = intent.fee;
  const r = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST", redirect: "error", signal: AbortSignal.timeout(20000), headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Idempotency-Key": intent.id },
    body: JSON.stringify({
      amount: amount(intent.amount), description: `Bouwr · ${p.title}${phase ? " · " + phase.name : ""}`.slice(0, 255), profileId: profile,
      redirectUrl: `${c.APP_ORIGIN}/?project=${p.id}&payment=return`, webhookUrl: `${c.APP_ORIGIN}/api/mollie/webhook`, locale: "nl_NL",
      metadata: { project: p.id, phase: phaseId || null }, testmode: c.MOLLIE_LIVE !== "true",
      applicationFee: { amount: amount(fee), description: "Bouwr platformvergoeding" },
    }),
  });
  const pay = await r.json() as Json;
  if (!r.ok || !/^tr_[A-Za-z0-9]+$/.test(pay.id || "") || !pay._links?.checkout?.href || !["open", "pending", "authorized", "paid"].includes(pay.status)) throw Error("Mollie kon geen betaling starten. Controleer de accountkoppeling.");
  if (pay.amount?.currency !== "EUR" || pay.amount?.value !== amount(intent.amount).value || pay.metadata?.project !== p.id || (pay.metadata?.phase || null) !== (phaseId || null)) throw Error("Mollie gaf afwijkende betaalgegevens terug.");
  const checkout = safeCheckout(pay._links.checkout.href);
  getSqlite().transaction(() => {
    getSqlite().prepare("INSERT INTO payments (id,project,amount,fee,status,created,phase,attempt,checkout) VALUES (?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING").run(pay.id, p.id, intent.amount, fee, pay.status, now(), phaseId || null, intent.attempt, checkout);
    getSqlite().prepare("UPDATE payment_intents SET status=?,provider_id=? WHERE id=?").run(pay.status, pay.id, intent.id);
  })();
  return { checkout };
}
