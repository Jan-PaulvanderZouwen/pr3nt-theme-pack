// E-mails aan producenten: nieuwe orders, geaccepteerd/toegewezen, ingetrokken, label klaar en uitbetaald.
// De uitnodiging zelf staat in producerinvite.js. Een mail die niet lukt, houdt nooit het werk tegen: we loggen hem alleen.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { readSettings } from './myparcel.js';
import { transactionalMailOptions } from './mailutils.js';
import { e } from './ui/layout.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', process.env.DATA_DIR || 'data');
const stateFile = path.join(dataDir, 'producer-mail.json');
const baseUrl = () => String(process.env.APP_BASE_URL || 'https://app.pr3nt.nl').replace(/\/$/, '');

function money(value) { const number = Number(String(value ?? '0').replace(',', '.')); return Number.isFinite(number) ? number : 0; }
export function euroText(value) { return `€ ${money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`; }
const firstName = (name = '') => String(name || '').trim().split(/\s+/)[0] || '';

let transport;
function mailer() {
  if (transport) return transport;
  // MAIL_TRANSPORT=json: niets versturen, alleen in de log zetten (handig om te testen).
  if (process.env.MAIL_TRANSPORT === 'json') transport = nodemailer.createTransport({ jsonTransport: true });
  else transport = nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.transip.email', port: Number(process.env.SMTP_PORT || 465), secure: String(process.env.SMTP_SECURE || 'true') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  return transport;
}

// Eén huisstijl voor alle producentmails: crème achtergrond, witte kaart, één duidelijke knop.
export function producerMailHtml({ eyebrow = 'Pr3nt producenten', title, intro = '', rows = [], button, after = '' }) {
  const table = rows.length ? `<table role="presentation" style="width:100%;border-collapse:collapse;margin:16px 0">${rows.map(([left, right, sub]) => `<tr><td style="padding:10px 0;border-top:1px solid #eee7dd;vertical-align:top"><strong>${e(left)}</strong>${sub ? `<br><span style="color:#5b6470;font-size:13px">${e(sub)}</span>` : ''}</td><td style="padding:10px 0;border-top:1px solid #eee7dd;text-align:right;vertical-align:top;white-space:nowrap;font-weight:600">${e(right || '')}</td></tr>`).join('')}</table>` : '';
  const cta = button ? `<p style="margin:24px 0 8px"><a href="${e(button.href)}" style="display:inline-block;background:#101820;color:#fff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:600">${e(button.text)}</a></p>` : '';
  return `<div style="margin:0;padding:0;background:#F7F4EF;font-family:Inter,Arial,sans-serif;color:#101820"><div style="max-width:560px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border-radius:20px;padding:28px;border:1px solid #e9e4dc">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#00A86B;margin:0 0 6px">${e(eyebrow)}</p>
<h1 style="font-size:23px;line-height:1.25;margin:0 0 12px">${e(title)}</h1>
${intro ? `<p style="line-height:1.6;margin:0">${intro}</p>` : ''}${table}${cta}
${after ? `<p style="line-height:1.6;color:#5b6470;font-size:14px;margin:16px 0 0">${after}</p>` : ''}
</div><p style="text-align:center;color:#8a8f96;font-size:12px;margin:14px 0 0">Je krijgt deze mail omdat je producent bent bij Pr3nt. Meldingen over nieuwe orders zet je uit bij Vergoeding op ${e(baseUrl().replace(/^https?:\/\//, ''))}.</p></div></div>`;
}

async function send(to, subject, html) {
  if (!to) return false;
  const info = await mailer().sendMail(transactionalMailOptions({ to, subject, html }));
  if (process.env.MAIL_TRANSPORT === 'json') console.log(`[producent-mail] ${to} · ${subject}`);
  return Boolean(info);
}

async function producerAccount(username) {
  if (!username) return null;
  const settings = await readSettings();
  const account = settings.users.find((user) => user.username === username);
  return account && account.role === 'producer' ? account : null;
}
const addressOf = (account) => account?.email || (/@/.test(account?.username || '') ? account.username : '');

function orderSummary(quote = {}) {
  const what = [quote.material, quote.color].filter(Boolean).join(' · ') || 'Print';
  return `${what}${String(quote.rush || '').toLowerCase() === 'ja' ? ' · spoed' : ''}`;
}
const orderLink = (quote) => `${baseUrl()}/admin/work/orders/${encodeURIComponent(quote.id)}`;
// Late import: producers.js -> myparcel.js -> ... hangt niet van deze module af, maar zo blijft de volgorde vrij.
async function feeOf(quote) { const { producerFee } = await import('./producers.js'); return producerFee(quote); }

// ---------- Losse meldingen ----------

export async function notifyProducerAccepted(username, quote) {
  const account = await producerAccount(username);
  if (!account) return false;
  const fee = quote.producerFee?.total ? quote.producerFee : await feeOf(quote);
  const html = producerMailHtml({
    title: `Order ${quote.id} is van jou`,
    intro: `Top, ${e(firstName(account.name) || 'daar')}! Je hebt deze order geaccepteerd. Niemand anders kan hem nu nog pakken.`,
    rows: [[orderSummary(quote), euroText(fee.total), fee.ship ? `${euroText(fee.print)} printen + ${euroText(fee.ship)} verzenden` : 'printen'], ['Order', quote.id]],
    button: { href: orderLink(quote), text: 'Bestanden en details' },
    after: 'Meld de order klaar zodra hij geprint is. Pr3nt maakt dan het verzendlabel en je krijgt een mail als het klaarstaat.',
  });
  return send(addressOf(account), `Geaccepteerd: order ${quote.id}`, html);
}

export async function notifyProducerAssigned(username, quote) {
  const account = await producerAccount(username);
  if (!account) return false;
  const fee = await feeOf(quote);
  const html = producerMailHtml({
    title: 'Pr3nt heeft een order voor je',
    intro: `Hoi ${e(firstName(account.name) || 'daar')}, deze order is aan jou gegeven. Hij staat bij je in Productie.`,
    rows: [[orderSummary(quote), euroText(fee.total), fee.ship ? `${euroText(fee.print)} printen + ${euroText(fee.ship)} verzenden` : 'printen'], ['Order', quote.id]],
    button: { href: orderLink(quote), text: 'Order bekijken' },
  });
  return send(addressOf(account), `Nieuwe order voor jou: ${quote.id}`, html);
}

export async function notifyProducerReleased(username, quote) {
  const account = await producerAccount(username);
  if (!account) return false;
  const html = producerMailHtml({
    title: `Order ${quote.id} is niet meer van jou`,
    intro: `Hoi ${e(firstName(account.name) || 'daar')}, Pr3nt heeft deze order bij je weggehaald. Ben je al begonnen met printen? Laat het even weten, dan zoeken we het samen uit.`,
  });
  return send(addressOf(account), `Order ${quote.id} ingetrokken`, html);
}

// Labels zijn gemaakt: één mail per producent, met alle pakketten die klaarstaan.
export async function notifyLabelsReady(quotes = []) {
  const byProducer = new Map();
  quotes.filter((quote) => quote.producer).forEach((quote) => byProducer.set(quote.producer, [...(byProducer.get(quote.producer) || []), quote]));
  let sent = 0;
  for (const [username, list] of byProducer) {
    const account = await producerAccount(username);
    if (!account) continue;
    const shipments = new Set(list.map((quote) => quote.myParcelShipmentId));
    const html = producerMailHtml({
      title: shipments.size === 1 ? 'Je verzendlabel staat klaar' : `${shipments.size} verzendlabels staan klaar`,
      intro: `Print het label, plak het op het pakket en breng het weg. Zet de order daarna op Verzonden, dan krijgt de klant de track & trace.${list.length > shipments.size ? ' Orders met hetzelfde adres gaan samen in één pakket.' : ''}`,
      rows: list.map((quote) => [orderSummary(quote), quote.id, list.filter((item) => item.myParcelShipmentId === quote.myParcelShipmentId).length > 1 ? 'samen in één pakket' : '']),
      button: { href: `${baseUrl()}/admin/work`, text: 'Naar mijn orders' },
    });
    await send(addressOf(account), shipments.size === 1 ? 'Verzendlabel klaar' : 'Verzendlabels klaar', html);
    sent += 1;
  }
  return sent;
}

export async function notifyPayoutPaid(account, payout) {
  if (!account) return false;
  const html = producerMailHtml({
    eyebrow: 'Pr3nt uitbetaling',
    title: `${euroText(payout.total)} is onderweg`,
    intro: `Hoi ${e(firstName(account.name) || 'daar')}, we hebben je vergoeding overgemaakt${payout.iban ? ` naar ${e(maskIban(payout.iban))}` : ''}. Hieronder staat waarvoor.`,
    rows: [...payout.orders.map((order) => [order.label || 'Order', euroText(order.total), `${order.id}${order.ship ? ` · ${euroText(order.print)} printen + ${euroText(order.ship)} verzenden` : ''}`]), ['Totaal', euroText(payout.total), `Kenmerk ${payout.reference}`]],
    button: { href: `${baseUrl()}/admin/work/vergoeding`, text: 'Mijn vergoedingen' },
    after: 'Het bedrag staat meestal binnen één werkdag op je rekening.',
  });
  return send(addressOf(account), `Uitbetaling ${payout.reference}: ${euroText(payout.total)}`, html);
}

export function maskIban(iban = '') {
  const clean = String(iban).replace(/\s+/g, '');
  return clean.length > 8 ? `${clean.slice(0, 4)} •••• ${clean.slice(-4)}` : clean;
}

// ---------- Nieuwe orders: periodiek één verzamelmail per producent ----------

async function readState() { try { return JSON.parse(await readFile(stateFile, 'utf8')); } catch { return null; } }
async function writeState(state) { await mkdir(dataDir, { recursive: true }); await writeFile(stateFile, JSON.stringify(state, null, 2)); }

let running = false;
export async function mailNewOrders({ quotes: preloaded } = {}) {
  if (running) return { skipped: true };
  running = true;
  try {
    const { inProduction, phaseOf, fitsProducer } = await import('./producers.js');
    const quotes = preloaded || await (await import('./admin.js')).readQuotes();
    const open = quotes.filter((quote) => inProduction(quote) && phaseOf(quote) === 'new');
    const saved = await readState();
    const state = saved || { notified: {} };
    const now = new Date().toISOString();
    if (!saved) {
      // Eerste keer na de update: orders die al langer openstaan niet alsnog rondmailen.
      const cutoff = new Date(Date.now() - 6 * 3600000).toISOString();
      open.filter((quote) => String(quote.paidAt || quote.updatedAt || '') < cutoff).forEach((quote) => { state.notified[quote.id] = now; });
    }
    const fresh = open.filter((quote) => !state.notified[quote.id]);
    // Oude meldingen opruimen zodat het bestand klein blijft.
    const openIds = new Set(open.map((quote) => quote.id));
    Object.keys(state.notified).forEach((id) => { if (!openIds.has(id) && state.notified[id] < new Date(Date.now() - 60 * 86400000).toISOString()) delete state.notified[id]; });
    if (!fresh.length) { if (!saved) await writeState(state); return { sent: 0 }; }
    const settings = await readSettings();
    const producers = settings.users.filter((user) => user.role === 'producer' && user.passwordHash && user.notifyNew !== 'off' && user.paused !== 'on' && addressOf(user));
    const feeList = await Promise.all(fresh.map(feeOf));
    let sent = 0;
    for (const account of producers) {
      // Alleen orders die deze producent kan maken (materialen uit zijn account).
      const mine = fresh.map((quote, index) => ({ quote, fee: feeList[index] })).filter((item) => fitsProducer(account, item.quote));
      if (!mine.length) continue;
      const list = mine.map((item) => item.quote);
      const fees = mine.map((item) => item.fee);
      const html = producerMailHtml({
        title: list.length === 1 ? 'Er staat een nieuwe order klaar' : `Er staan ${list.length} nieuwe orders klaar`,
        intro: `Hoi ${e(firstName(account.name) || 'daar')}, wie het eerst accepteert, krijgt de order. Daarna verdwijnt hij bij de andere producenten.`,
        rows: list.map((quote, index) => [orderSummary(quote), euroText(fees[index].total), `${quote.id}${fees[index].ship ? ' · incl. verzenden' : ''}`]),
        button: { href: `${baseUrl()}/admin/work`, text: list.length === 1 ? 'Bekijken en accepteren' : 'Bekijk de orders' },
      });
      try { await send(addressOf(account), list.length === 1 ? 'Nieuwe order bij Pr3nt' : `${list.length} nieuwe orders bij Pr3nt`, html); sent += 1; } catch (error) { console.warn(`[producent-mail] ${account.username}:`, error.message); }
    }
    fresh.forEach((quote) => { state.notified[quote.id] = now; });
    await writeState(state);
    return { sent, orders: fresh.length };
  } finally {
    running = false;
  }
}

export function startProducerMail() {
  if (String(process.env.PRODUCER_MAIL || 'on').toLowerCase() === 'off') return;
  const minutes = Math.max(1, Number(process.env.PRODUCER_MAIL_MINUTES || 2) || 2);
  const run = () => mailNewOrders().catch((error) => console.warn('[producent-mail] nieuwe orders mailen mislukt:', error.message));
  setTimeout(run, 45_000).unref?.();
  setInterval(run, minutes * 60_000).unref?.();
}
