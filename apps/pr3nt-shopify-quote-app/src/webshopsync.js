// Webshoporders van pr3nt.nl naar Orders.
// De website bewaart de webshoporders; deze module haalt ze elke paar minuten op via /api/cms:
// - betaald: als order met status Betaald in Orders, met eigen klantportaal (en een mail met de link);
// - niet betaald: niet in Orders, maar herinneringsmails met de betaallink (na 1 uur, 1 dag en 3 dagen);
// - reserve-aanvragen (offerte-aanvragen die op de website bleven hangen): als gewone aanvraag in Orders.
// Statuswijzigingen in Orders (printen, verzonden, geleverd) gaan terug naar de website.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';
import { get, post, put, raw, cmsReady, siteUrl } from './cms/client.js';
import { readQuotes, writeQuotes } from './admin.js';
import { sendCustomerMail } from './statusmails.js';
import { mailFrom, transactionalMailOptions } from './mailutils.js';
import { roundMoney } from './vat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const uploadDir = path.resolve(appRoot, process.env.UPLOAD_DIR || 'uploads/quotes');
const statePath = path.join(dataDir, 'webshop-sync.json');
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';
const vatRate = Number(process.env.PR3NT_VAT_RATE || 0.21);
const minutes = Math.max(1, Number(process.env.WEBSHOP_SYNC_MINUTES || 2));

const HOUR = 3600_000;
// Herinneringen na 1 uur, 1 dag en 3 dagen. Na 7 dagen houden we op.
export const reminderAfter = [HOUR, 24 * HOUR, 72 * HOUR];
const reminderWindow = 7 * 24 * HOUR;

const finished = /geleverd|voltooid|afgerond|verzonden|geannuleerd|geweigerd/i;
const cancelled = /geannuleerd|geweigerd|vervallen/i;

// Welke websitestatus hoort bij een stap in Orders (eerste die past uit de statuslijst van de website).
const statusMatch = {
  print_queue: /print|productie|behandeling/i,
  ready_to_ship: /klaar|verzendklaar|ingepakt/i,
  shipped: /verzonden|onderweg/i,
  delivered: /geleverd|voltooid|afgerond/i,
};

const str = (x) => (x == null ? '' : String(x));
const ms = (v) => new Date(v || 0).getTime() || 0;
const safeId = (v) => str(v).replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80);

export const isWebshop = (quote = {}) => quote.source === 'webshop';

// ---------- Eigen administratie: wat is al gezien, welke herinneringen zijn verstuurd ----------

export async function readSyncState() {
  try {
    const state = JSON.parse(await readFile(statePath, 'utf8'));
    return { startedAt: state.startedAt || '', lastRunAt: state.lastRunAt || '', lastError: state.lastError || '', orders: state.orders || {} };
  } catch {
    return { startedAt: '', lastRunAt: '', lastError: '', orders: {} };
  }
}

async function writeSyncState(state) {
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

// ---------- Van websiteorder naar order in Orders ----------

function exVat(amountInclVat) {
  return String(Math.round((Number(amountInclVat || 0) / (1 + vatRate)) * 10000) / 10000);
}

function addressOf(customer = {}) {
  const street = str(customer.street);
  const houseNumber = str(customer.houseNumber);
  return {
    name: str(customer.name),
    company: str(customer.company),
    address: [street, houseNumber].filter(Boolean).join(' ') || str(customer.address),
    street,
    houseNumber,
    postalCode: str(customer.postalCode),
    city: str(customer.city),
    country: str(customer.country) || 'Nederland',
  };
}

// Webshopprijzen zijn incl. btw; Orders rekent met regels excl. btw.
function linesOf(order) {
  const d = order.details || {};
  const lines = (order.items || []).map((item) => ({
    label: str(item.name) || 'Product',
    description: str(item.color),
    qty: str(item.quantity || 1),
    unit: exVat(item.price),
  }));
  if (d.delivery !== 'afhalen' && Number(d.shipping) > 0) lines.push({ label: 'Verzendkosten', description: 'incl. track & trace', qty: '1', unit: exVat(d.shipping) });
  // Klopt de som niet met wat de klant betaalde (korting, afronding), dan één regel voor het verschil.
  const paid = Number(order.amount);
  if (Number.isFinite(paid) && paid > 0) {
    const sum = (order.items || []).reduce((total, item) => total + Number(item.price || 0) * Number(item.quantity || 1), 0) + (d.delivery !== 'afhalen' ? Number(d.shipping || 0) : 0);
    const diff = roundMoney(paid - sum);
    if (Math.abs(diff) >= 0.01) lines.push({ label: diff < 0 ? 'Korting' : 'Overig', description: '', qty: '1', unit: exVat(diff) });
  }
  return lines;
}

function unique(list) {
  return [...new Set(list.map(str).filter(Boolean))];
}

export function quoteFromWebshopOrder(order, now = new Date().toISOString()) {
  const d = order.details || {};
  const customer = order.customer || {};
  const shipping = addressOf(customer);
  const pickup = d.delivery === 'afhalen';
  const paidAt = order.paid_at || now;
  return {
    id: `webshop-${safeId(order.id)}`,
    source: 'webshop',
    webshopOrderId: str(order.id),
    webshopUrl: str(order.customerUrl),
    webshopStatus: str(order.status),
    portalToken: randomUUID(),
    status: 'paid',
    requestType: 'webshop',
    createdAt: order.created_at || now,
    updatedAt: now,
    paidAt,
    acceptedAt: paidAt,
    name: str(customer.name),
    email: str(customer.email),
    phone: str(customer.phone),
    material: str(d.material) || unique((order.items || []).map((item) => item.material)).join(', '),
    color: str(d.color) || unique((order.items || []).map((item) => item.color)).join(', '),
    rush: d.rush ? 'Ja' : 'Nee',
    description: str(d.comment || d.description),
    note: pickup ? 'Afhalen op afspraak' : '',
    quoteLines: linesOf(order),
    shipping,
    billing: { name: shipping.name, company: shipping.company, address: shipping.address, postalCode: shipping.postalCode, city: shipping.city, country: shipping.country },
    trackingCode: str(order.track_trace),
    files: [],
    invoices: [],
    messages: [{ from: 'pr3nt', text: 'Bestelling via de webshop ontvangen en betaald.', createdAt: now }],
  };
}

async function downloadReserveFile(order, quoteId) {
  if (!order.file_name) return [];
  const upstream = await raw(`orders/${encodeURIComponent(order.id)}/file`);
  if (!upstream.ok) return [];
  const originalName = str(order.file_name).slice(0, 200);
  const safeOriginalName = originalName.replace(/[^a-zA-Z0-9._-]/g, '-');
  const storedName = `${quoteId}-${safeOriginalName}`;
  await writeFile(path.join(uploadDir, storedName), Buffer.from(await upstream.arrayBuffer()));
  return [{ originalName, safeOriginalName, storedName, extension: path.extname(safeOriginalName).toLowerCase(), url: `${baseUrl}/files/${quoteId}/${encodeURIComponent(safeOriginalName)}` }];
}

// Offerte-aanvraag die op de website bleef hangen omdat app.pr3nt.nl even niet bereikbaar was.
async function quoteFromReserveOrder(order, now = new Date().toISOString()) {
  const d = order.details || {};
  const customer = order.customer || {};
  const shipping = addressOf(customer);
  const id = `quote-${Date.now()}-${randomUUID().slice(0, 8)}`;
  const files = await downloadReserveFile(order, id);
  const first = files[0] || {};
  return {
    id,
    source: 'website-reserve',
    webshopOrderId: str(order.id),
    portalToken: randomUUID(),
    status: 'received',
    requestType: files.length ? '3d_file' : 'no_model',
    createdAt: order.created_at || now,
    updatedAt: now,
    name: str(customer.name),
    email: str(customer.email),
    phone: str(customer.phone),
    material: str(d.material) || 'PLA',
    color: str(d.color),
    rush: d.rush ? 'Ja' : 'Nee',
    description: str(d.comment || d.description),
    note: '',
    shipping,
    billing: { name: shipping.name, address: shipping.address, postalCode: shipping.postalCode, city: shipping.city, country: shipping.country },
    messages: [],
    files,
    fileOriginalName: first.originalName || '',
    fileStoredName: first.storedName || '',
    fileExtension: first.extension || '',
    fileUrl: first.url || '',
  };
}

// ---------- Mails ----------

function mailer() {
  return nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.transip.email', port: Number(process.env.SMTP_PORT || 465), secure: String(process.env.SMTP_SECURE || 'true') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}

function esc(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

const reminderCopy = [
  ['Je bestelling staat nog voor je klaar', 'Je hebt iets besteld bij pr3nt.nl, maar de betaling is nog niet gelukt. Geen zorgen, je bestelling staat nog klaar. Rond de betaling af, dan gaan we voor je printen.'],
  ['Nog even afrekenen?', 'Je bestelling bij pr3nt.nl wacht nog op betaling. Ging er iets mis met betalen of heb je een vraag? Antwoord gerust op deze mail, dan helpen we je.'],
  ['Laatste herinnering voor je bestelling', 'Dit is de laatste herinnering voor je bestelling bij pr3nt.nl. Wil je hem toch niet meer? Dan hoef je niets te doen.'],
];

export function reminderMailHtml(order, step, link) {
  const [title, text] = reminderCopy[Math.min(step, reminderCopy.length - 1)];
  const name = str(order.customer?.name).split(/\s+/)[0];
  const items = (order.items || []).map((item) => `<li>${esc(item.quantity || 1)}× ${esc(item.name)}${item.color ? ` · ${esc(item.color)}` : ''}</li>`).join('');
  const amount = Number(order.amount) > 0 ? `<p style="margin:0 0 18px;font-size:18px"><strong>Totaal: € ${Number(order.amount).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></p>` : '';
  return `<div style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,sans-serif;color:#101820"><div style="max-width:640px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden"><div style="padding:28px;background:#101820;color:#fff"><div style="font-size:24px;font-weight:900">pr3nt.nl</div><h1 style="margin:22px 0 8px;font-size:28px;line-height:1.1">${esc(title)}</h1><p style="margin:0;color:#d7dde0">Bestelling ${esc(order.id)}</p></div><div style="padding:28px"><p style="margin:0 0 16px;line-height:1.55">${name ? `Hoi ${esc(name)},<br><br>` : ''}${esc(text)}</p>${items ? `<ul style="margin:0 0 16px;padding-left:18px;line-height:1.6">${items}</ul>` : ''}${amount}<p style="margin:0 0 20px"><a href="${esc(link)}" style="display:inline-block;background:#00D084;color:#101820;text-decoration:none;font-weight:800;padding:14px 22px;border-radius:999px">Bestelling afronden</a></p><p style="margin:0;font-size:13px;color:#667085;line-height:1.5">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${esc(link)}</span></p></div></div></div></div>`;
}

async function sendReminder(order, step) {
  const to = str(order.customer?.email);
  if (!to) return false;
  const link = str(order.payment_url) || str(order.customerUrl) || siteUrl();
  const [title] = reminderCopy[Math.min(step, reminderCopy.length - 1)];
  await mailer().sendMail(transactionalMailOptions({ from: mailFrom(), to, replyTo: process.env.MAIL_TO || 'bestellingen@pr3nt.nl', subject: `${title} · pr3nt.nl`, html: reminderMailHtml(order, step, link), entityRefId: `pr3nt-webshop-reminder-${order.id}-${step}` }));
  return true;
}

// ---------- Eén ronde ----------

let running = false;

function websiteStatusFor(status, options = []) {
  const pattern = statusMatch[status];
  return pattern ? options.find((option) => pattern.test(option)) || '' : '';
}

async function pushStatuses(quotes, options) {
  let changed = false;
  for (const quote of quotes) {
    if (!isWebshop(quote) || quote.archivedAt || quote.webshopPushedStatus === quote.status) continue;
    const target = websiteStatusFor(quote.status, options);
    const id = encodeURIComponent(quote.webshopOrderId);
    try {
      if (quote.trackingCode && quote.trackingCode !== quote.webshopPushedTracking) {
        await put(`orders/${id}`, { track_trace: quote.trackingCode });
        quote.webshopPushedTracking = quote.trackingCode;
      }
      // De klant krijgt de mail al van app.pr3nt.nl; de website hoeft niet nog eens te mailen.
      if (target && target !== quote.webshopStatus) await post(`orders/${id}/status`, { status: target, note: '', notify: false });
      if (target) quote.webshopStatus = target;
      quote.webshopPushedStatus = quote.status;
      changed = true;
    } catch (error) {
      console.warn(`[webshop] status van ${quote.webshopOrderId} niet naar de website gestuurd:`, error.message);
    }
  }
  return changed;
}

export async function syncWebshopOrders({ now = Date.now() } = {}) {
  if (running || !cmsReady()) return null;
  running = true;
  const state = await readSyncState();
  const nowIso = new Date(now).toISOString();
  const firstRun = !state.startedAt;
  if (firstRun) state.startedAt = nowIso;
  const result = { imported: 0, reserve: 0, reminders: 0 };
  try {
    const [{ orders = [] }, meta] = await Promise.all([get('orders'), get('meta').catch(() => ({}))]);
    const quotes = await readQuotes();
    const byOrderId = new Map(quotes.filter((quote) => quote.webshopOrderId).map((quote) => [quote.webshopOrderId, quote]));
    let quotesChanged = false;

    for (const listed of orders) {
      const id = str(listed.id);
      if (!id) continue;
      const entry = state.orders[id] || (state.orders[id] = { seenAt: nowIso });
      if (entry.quoteId || entry.skipped) continue;
      const existing = byOrderId.get(id);
      if (existing) { entry.quoteId = existing.id; continue; }
      const status = str(listed.status);

      if (listed.kind === 'filament') {
        if (listed.paid_at) {
          // Al afgehandeld vóór deze koppeling bestond: niet opnieuw in Orders zetten.
          if (finished.test(status)) { entry.skipped = 'afgerond'; continue; }
          const { order } = await get(`orders/${encodeURIComponent(id)}`);
          const quote = quoteFromWebshopOrder(order, nowIso);
          quotes.unshift(quote);
          byOrderId.set(id, quote);
          entry.quoteId = quote.id;
          entry.paidAt = order.paid_at;
          quotesChanged = true;
          result.imported += 1;
          post(`orders/${encodeURIComponent(id)}/note`, { note: `In Orders van app.pr3nt.nl gezet (${quote.id}).`, visible: false }).catch(() => {});
          if (quote.email) sendCustomerMail(quote, 'Bedankt voor je bestelling', 'We hebben je bestelling en betaling ontvangen. We plannen je print nu in. In je klantportaal volg je de status, van printen tot verzending.', 'Volg je bestelling').catch((error) => console.warn('[webshop] portaalmail niet verstuurd:', error.message));
          continue;
        }
        // Niet betaald: herinneringen, alleen voor orders van na de start van deze koppeling.
        if (cancelled.test(status) || entry.remindersStopped) continue;
        const created = ms(listed.created_at);
        if (!created || created < ms(state.startedAt) || now - created > reminderWindow) continue;
        const sent = entry.reminders || [];
        if (sent.length >= reminderAfter.length || now - created < reminderAfter[sent.length]) continue;
        try {
          const { order } = await get(`orders/${encodeURIComponent(id)}`);
          if (order.paid_at) continue;
          if (await sendReminder(order, sent.length)) {
            entry.reminders = [...sent, nowIso];
            result.reminders += 1;
          }
        } catch (error) {
          console.warn(`[webshop] herinnering voor ${id} niet verstuurd:`, error.message);
        }
        continue;
      }

      // Reserve-aanvraag (print): als gewone aanvraag in Orders, tenzij al afgehandeld.
      if (finished.test(status)) { entry.skipped = 'afgerond'; continue; }
      const { order } = await get(`orders/${encodeURIComponent(id)}`);
      const quote = await quoteFromReserveOrder(order, nowIso);
      quotes.unshift(quote);
      byOrderId.set(id, quote);
      entry.quoteId = quote.id;
      quotesChanged = true;
      result.reserve += 1;
      post(`orders/${encodeURIComponent(id)}/note`, { note: `Als offerte-aanvraag in Orders van app.pr3nt.nl gezet (${quote.id}).`, visible: false }).catch(() => {});
    }

    const options = unique([...(meta?.orderStatuses?.filament || [])]);
    if (await pushStatuses(quotes, options)) quotesChanged = true;
    if (quotesChanged) {
      // Opnieuw inlezen en alleen onze wijzigingen toepassen, zodat een opslag in het beheer tussendoor niet verloren gaat.
      const latest = await readQuotes();
      const mine = new Map(quotes.filter((quote) => quote.webshopOrderId).map((quote) => [quote.id, quote]));
      const merged = latest.map((quote) => {
        const ours = mine.get(quote.id);
        if (!ours) return quote;
        mine.delete(quote.id);
        return { ...quote, webshopStatus: ours.webshopStatus, webshopPushedStatus: ours.webshopPushedStatus, webshopPushedTracking: ours.webshopPushedTracking };
      });
      await writeQuotes([...mine.values(), ...merged]);
    }
    state.lastError = '';
  } catch (error) {
    state.lastError = error.message;
    console.warn('[webshop] ophalen mislukt:', error.message);
  } finally {
    state.lastRunAt = nowIso;
    await writeSyncState(state).catch((error) => console.warn('[webshop] status niet opgeslagen:', error.message));
    running = false;
  }
  return result;
}

export async function stopReminders(orderId) {
  const state = await readSyncState();
  const entry = state.orders[orderId] || (state.orders[orderId] = { seenAt: new Date().toISOString() });
  entry.remindersStopped = true;
  await writeSyncState(state);
}

export function startWebshopSync() {
  if (String(process.env.WEBSHOP_SYNC || 'on').toLowerCase() === 'off') return;
  const run = () => syncWebshopOrders().catch((error) => console.warn('[webshop]', error.message));
  setTimeout(run, 15_000).unref?.();
  setInterval(run, minutes * 60_000).unref?.();
}
