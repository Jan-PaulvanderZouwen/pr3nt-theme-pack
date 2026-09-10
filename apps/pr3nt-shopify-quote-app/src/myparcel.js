import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const settingsFilePath = path.join(dataDir, 'work-settings.json');
const myParcelApiBase = process.env.MYPARCEL_API_BASE || 'https://api.myparcel.nl';
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';

function e(value = '') { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;'); }
function clean(value = '', max = 300) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, max); }
function money(value) { const number = Number(String(value || '0').replace(',', '.')); return Number.isFinite(number) ? number : 0; }
function fmt(value) { return money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function enabled() { return Boolean(process.env.MYPARCEL_API_KEY); }
function authHeader() { return `basic ${Buffer.from(process.env.MYPARCEL_API_KEY || '').toString('base64')}`; }
function safeEquals(a = '', b = '') { const left = Buffer.from(String(a)); const right = Buffer.from(String(b)); if (!left.length || left.length !== right.length) return false; return timingSafeEqual(left, right); }

async function readJson(filePath, fallback) { try { const data = JSON.parse(await readFile(filePath, 'utf8')); return data || fallback; } catch { return fallback; } }
async function writeJson(filePath, data) { await writeFile(filePath, JSON.stringify(data, null, 2)); }
async function readQuotes() { const quotes = await readJson(quotesFilePath, []); return Array.isArray(quotes) ? quotes : []; }
async function writeQuotes(quotes) { await writeJson(quotesFilePath, quotes); }

function defaultSettings() {
  const count = Number(process.env.PRINTER_COUNT || 2) || 2;
  return { printerCount: count, printers: Array.from({ length: count }, (_, index) => ({ id: `printer-${index + 1}`, name: `Printer ${index + 1}` })), calendarToken: process.env.PRINT_CALENDAR_TOKEN || '' };
}

async function readSettings() {
  const saved = await readJson(settingsFilePath, {});
  const count = Math.max(1, Math.min(20, Number(saved.printerCount || process.env.PRINTER_COUNT || 2)));
  const existing = Array.isArray(saved.printers) ? saved.printers : [];
  const printers = Array.from({ length: count }, (_, index) => {
    const current = existing[index] || {};
    return { id: clean(current.id || `printer-${index + 1}`, 80), name: clean(current.name || `Printer ${index + 1}`, 80) };
  });
  return { ...defaultSettings(), ...saved, printerCount: count, printers, calendarToken: saved.calendarToken || process.env.PRINT_CALENDAR_TOKEN || '' };
}

async function writeSettingsFromBody(body = {}) {
  const count = Math.max(1, Math.min(20, Number(body.printerCount || 1)));
  const names = Array.isArray(body.printerName) ? body.printerName : body.printerName ? [body.printerName] : [];
  const settings = await readSettings();
  const token = clean(body.calendarToken || settings.calendarToken || randomUUID(), 160);
  const printers = Array.from({ length: count }, (_, index) => ({ id: `printer-${index + 1}`, name: clean(names[index] || settings.printers?.[index]?.name || `Printer ${index + 1}`, 80) }));
  const next = { ...settings, printerCount: count, printers, calendarToken: token };
  await writeJson(settingsFilePath, next);
  return next;
}

function shippingAddress(quote = {}) {
  const shipping = quote.shipping || quote.billing || {};
  const address = shipping.address || [shipping.street, shipping.houseNumber].filter(Boolean).join(' ');
  const match = String(address || '').trim().match(/^(.+?)\s+(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)$/);
  return { person: clean(shipping.name || quote.name, 80), company: clean(shipping.company || quote.company, 80), street: clean(shipping.street || (match ? match[1] : address), 80), number: clean(shipping.houseNumber || (match ? match[2] : ''), 20), postalCode: clean(shipping.postalCode || shipping.postalcode || quote.billing?.postalCode, 20).replace(/\s+/g, ''), city: clean(shipping.city || quote.billing?.city, 80), country: clean(shipping.country || quote.billing?.country || 'NL', 2).toUpperCase().replace('NEDERLAND', 'NL'), email: clean(quote.email, 120), phone: clean(quote.phone, 40) };
}

function canCreateShipment(quote = {}) {
  if (!enabled()) return { ok: false, reason: 'MYPARCEL_API_KEY ontbreekt.' };
  if (!quote || quote.myParcelShipmentId) return { ok: false, reason: 'Geen quote of zending bestaat al.' };
  if (!quote.paidAt && quote.status !== 'paid') return { ok: false, reason: 'Order is nog niet betaald.' };
  const address = shippingAddress(quote);
  const missing = [];
  if (!address.person) missing.push('naam');
  if (!address.street) missing.push('straat');
  if (!address.number) missing.push('huisnummer');
  if (!address.postalCode) missing.push('postcode');
  if (!address.city) missing.push('plaats');
  if (missing.length) return { ok: false, reason: `Verzendadres mist: ${missing.join(', ')}.` };
  return { ok: true, address };
}

function shipmentPayload(quote) {
  const address = shippingAddress(quote);
  const cc = address.country === 'BE' ? 'BE' : 'NL';
  const recipient = { cc, person: address.person, company: address.company, street: address.street, number: address.number, postal_code: address.postalCode, city: address.city, email: address.email, phone: address.phone };
  Object.keys(recipient).forEach((key) => { if (!recipient[key]) delete recipient[key]; });
  return { data: { shipments: [{ reference_identifier: clean(quote.id, 50), recipient, options: { package_type: 1, label_description: clean(`Pr3nt ${quote.id}`, 45) } }] } };
}

async function myParcelFetch(endpoint, options = {}) {
  const response = await fetch(`${myParcelApiBase}${endpoint}`, { ...options, headers: { Authorization: authHeader(), 'User-Agent': process.env.MYPARCEL_USER_AGENT || 'Pr3ntPortal/1', ...(options.headers || {}) } });
  const text = await response.text();
  let body = {};
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!response.ok) throw new Error(`MyParcel API fout ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

function firstShipmentId(result = {}) {
  const data = result.data || result;
  const ids = data.ids || data.shipment_ids || data.shipmentIds || data.shipments;
  if (Array.isArray(ids)) {
    const first = ids[0];
    if (typeof first === 'number' || typeof first === 'string') return String(first);
    return String(first?.id || first?.shipment_id || first?.shipmentId || '');
  }
  return String(data.id || data.shipment_id || data.shipmentId || '');
}

async function labelUrlForShipment(shipmentId) {
  if (!shipmentId) return '';
  try {
    const result = await myParcelFetch(`/shipment_labels/${encodeURIComponent(shipmentId)}`, { method: 'GET', headers: { Accept: 'application/json;charset=utf-8' } });
    const url = result?.data?.pdfs?.url || result?.data?.url || result?.url || '';
    if (!url) return '';
    return url.startsWith('http') ? url : `${myParcelApiBase}${url}`;
  } catch { return ''; }
}

export async function createMyParcelShipmentForQuote(quote) {
  const check = canCreateShipment(quote);
  if (!check.ok) return { skipped: true, reason: check.reason };
  const result = await myParcelFetch('/shipments', { method: 'POST', headers: { 'Content-Type': 'application/vnd.shipment+json;charset=utf-8;version=1.1', Accept: 'application/vnd.shipment_label_link+json;charset=utf-8' }, body: JSON.stringify(shipmentPayload(quote)) });
  const shipmentId = firstShipmentId(result);
  if (!shipmentId) throw new Error(`MyParcel gaf geen shipment id terug: ${JSON.stringify(result)}`);
  const labelUrl = await labelUrlForShipment(shipmentId);
  return { skipped: false, shipmentId, labelUrl, raw: result };
}

export async function createMissingMyParcelLabels() {
  if (!enabled()) return { skipped: true, reason: 'MYPARCEL_API_KEY ontbreekt.' };
  const quotes = await readQuotes();
  let changed = false;
  const results = [];
  for (const quote of quotes) {
    if (quote.archivedAt || quote.myParcelShipmentId || (!quote.paidAt && quote.status !== 'paid')) continue;
    const now = new Date().toISOString();
    try {
      const result = await createMyParcelShipmentForQuote(quote);
      if (result.skipped) {
        quote.myParcelStatus = 'skipped';
        quote.myParcelMessage = result.reason;
        results.push({ id: quote.id, skipped: true, reason: result.reason });
      } else {
        quote.myParcelStatus = 'created';
        quote.myParcelShipmentId = result.shipmentId;
        quote.myParcelLabelUrl = result.labelUrl;
        quote.myParcelCreatedAt = now;
        quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
        quote.messages.push({ from: 'pr3nt', text: `MyParcel-verzendlabel klaargezet${result.shipmentId ? `: ${result.shipmentId}` : ''}.`, createdAt: now });
        results.push({ id: quote.id, shipmentId: result.shipmentId, labelUrl: result.labelUrl });
      }
      changed = true;
    } catch (error) {
      quote.myParcelStatus = 'error';
      quote.myParcelError = error.message;
      quote.myParcelTriedAt = now;
      results.push({ id: quote.id, error: error.message });
      changed = true;
    }
  }
  if (changed) await writeQuotes(quotes);
  return { skipped: false, results };
}

function quoteLines(quote = {}) { return Array.isArray(quote.quoteLines) ? quote.quoteLines : []; }

function estimatedPrintHours(quote = {}) {
  const explicit = money(quote.estimatedPrintHours || quote.printHours || 0);
  if (explicit > 0) return explicit;
  const line = quoteLines(quote).find((item) => /print\s*-?\s*uren|printuren|print uur|printtijd/i.test(`${item.label || ''} ${item.description || ''}`));
  if (line) {
    const qty = money(line.qty || 0);
    if (qty > 0) return qty;
    const unit = money(line.unit || 0);
    const total = money(line.total || 0);
    if (unit > 0 && total > 0) return total / unit;
  }
  return 1;
}

function addHoursLocal(datetimeLocal, hours) {
  if (!datetimeLocal) return '';
  const date = new Date(datetimeLocal);
  if (Number.isNaN(date.getTime())) return '';
  date.setMinutes(date.getMinutes() + Math.max(0.25, hours) * 60);
  return toLocalInputValue(date);
}

function toLocalInputValue(date) { const pad = (value) => String(value).padStart(2, '0'); return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`; }
function formatDateTime(value = '') { if (!value) return '-'; const date = new Date(value); if (Number.isNaN(date.getTime())) return e(String(value).replace('T', ' ')); return e(date.toLocaleString('nl-NL', { dateStyle: 'short', timeStyle: 'short' })); }
function orderEtaText(quote = {}) { if (!quote.scheduledStartAt && !quote.scheduledEndAt) return 'Nog niet ingepland'; return `${formatDateTime(quote.scheduledStartAt)} → ${formatDateTime(quote.scheduledEndAt)}`; }

function loginHtml(error = '') {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login · pr3nt</title><style>:root{--ink:#101820;--green:#00d084;--muted:#d7dde0}*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;background:radial-gradient(circle at 20% 15%,rgba(0,208,132,.35),transparent 26%),radial-gradient(circle at 85% 20%,rgba(255,255,255,.12),transparent 22%),linear-gradient(135deg,#101820 0%,#17232c 48%,#07100d 100%);display:grid;place-items:center}.card{width:min(430px,calc(100vw - 32px));background:rgba(255,255,255,.96);color:var(--ink);border:1px solid rgba(255,255,255,.36);border-radius:28px;padding:30px;box-shadow:0 30px 80px rgba(0,0,0,.32)}.brand{font-size:32px;font-weight:950;letter-spacing:-.07em;margin-bottom:18px}.muted{color:#667085;line-height:1.55}input{width:100%;padding:13px 14px;border:1px solid #cbd5e1;border-radius:14px;font:inherit}button{margin-top:12px;width:100%;border:0;border-radius:14px;background:var(--ink);color:#fff;padding:13px;font-weight:900;cursor:pointer}.error{background:#fff1f0;border:1px solid #fed3d1;color:#9f1f12;border-radius:14px;padding:10px;margin-bottom:12px}</style></head><body><section class="card"><div class="brand">pr3nt</div><h1>Login</h1><p class="muted">Vul je toegangssleutel in om de interne omgeving te openen.</p>${error ? `<div class="error">${e(error)}</div>` : ''}<form method="post" action="/admin/work/login"><input name="workerKey" type="password" autocomplete="current-password" required><button type="submit">Inloggen</button></form></section></body></html>`;
}

function hasWorkerAccess(req) {
  const adminKey = process.env.ADMIN_KEY || '';
  const workerKey = process.env.PRINT_WORKER_KEY || '';
  const cookieKey = req.cookies?.pr3nt_worker_key || req.cookies?.pr3nt_admin_key || '';
  const headerKey = req.get('x-worker-key') || '';
  return Boolean((workerKey && (safeEquals(cookieKey, workerKey) || safeEquals(headerKey, workerKey))) || (adminKey && (safeEquals(cookieKey, adminKey) || safeEquals(headerKey, adminKey))));
}

function hasAdminAccess(req) { const adminKey = process.env.ADMIN_KEY || ''; const key = req.cookies?.pr3nt_admin_key || req.get('x-admin-key') || ''; return Boolean(adminKey && safeEquals(key, adminKey)); }
function requireWorker(req, res, next) { if (hasWorkerAccess(req)) return next(); return res.status(401).send(loginHtml()); }

function requireCalendarAccess(req, res, next) {
  const submitted = String(req.query.token || '');
  const envToken = process.env.PRINT_CALENDAR_TOKEN || '';
  if (envToken && safeEquals(submitted, envToken)) return next();
  readSettings().then((settings) => {
    if (settings.calendarToken && safeEquals(submitted, settings.calendarToken)) return next();
    return res.status(401).send('Agenda-feed niet geautoriseerd');
  }).catch(() => res.status(401).send('Agenda-feed niet geautoriseerd'));
}

function statusLabel(status = '') { const labels = { paid: 'Betaald', print_queue: 'In productie', ready_to_ship: 'Klaar voor verzending', shipped: 'Verzonden', delivered: 'Geleverd' }; return labels[status] || status || '-'; }
function productionAmountHtml(quote = {}) { const value = quote.productionAmount || quote.productionOfferAmount || quote.productionPrice || ''; if (!String(value).trim()) return '<span>-</span>'; return `<strong>€ ${fmt(value)}</strong>`; }
function fileLinks(quote) { const files = Array.isArray(quote.files) ? quote.files : []; if (!files.length && quote.fileUrl) return `<a href="${e(quote.fileUrl)}">${e(quote.fileOriginalName || 'Bestand downloaden')}</a>`; return files.map((file) => `<a href="${e(file.url)}">${e(file.originalName || file.storedName || 'Bestand')}</a>`).join('<br>') || '-'; }

function navHtml(active = '') {
  const nav = [['admin', '/admin?classic=1', 'Admin orders'], ['work', '/admin/work', 'Werkruimte'], ['options', '/admin/work/options', 'Opties'], ['agenda', '/admin/work/agenda', 'Agenda'], ['stats', '/admin/work/stats', 'Statistieken']];
  return `<aside class="unified-side"><div><div class="unified-logo">pr3nt</div><div class="unified-sub">Interne omgeving</div></div><nav class="unified-nav">${nav.map(([key, href, label]) => `<a class="${active === key ? 'active' : ''}" href="${href}">${label}<span>›</span></a>`).join('')}</nav><form class="unified-logout" method="post" action="/admin/work/logout"><button type="submit">Uitloggen</button></form></aside>`;
}

function shell(active, body) { return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin · pr3nt</title><style>${unifiedCss()}</style></head><body><main class="unified-app">${navHtml(active)}<section class="unified-content">${body}</section></main></body></html>`; }

function unifiedCss() {
  return `:root{--bg:#f4f6f5;--card:#fff;--ink:#101820;--muted:#667085;--line:#e3e8ef;--green:#00d084;--soft:#eef8f3}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.unified-app{min-height:100vh;display:grid;grid-template-columns:250px 1fr}.unified-side{background:#101820;color:#fff;padding:22px;display:flex;flex-direction:column;gap:22px}.unified-logo{font-size:28px;font-weight:950;letter-spacing:-.07em}.unified-sub,.subtle{font-size:12px;color:#9ca7ad}.unified-nav{display:grid;gap:8px}.unified-nav a{display:flex;align-items:center;justify-content:space-between;color:#d7dde0;text-decoration:none;padding:11px 12px;border-radius:14px;font-weight:850}.unified-nav a.active,.unified-nav a:hover{background:rgba(0,208,132,.13);color:#fff}.unified-content{padding:26px;min-width:0}.unified-logout{margin-top:auto}.unified-logout button{width:100%;background:#fff;color:#101820;border:1px solid rgba(255,255,255,.2)}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.eyebrow{color:var(--muted);font-weight:850;text-transform:uppercase;letter-spacing:.08em;font-size:12px}h1{font-size:34px;letter-spacing:-.05em;margin:4px 0 6px}.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 10px 30px rgba(16,24,32,.04)}.stat strong{display:block;font-size:28px;letter-spacing:-.04em}table{width:100%;border-collapse:collapse}th,td{padding:13px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.badge{display:inline-flex;border-radius:999px;background:#eef2f7;padding:5px 9px;font-size:12px;font-weight:850}.badge.green{background:#e9fbf2;color:#087443}.button,button{border:0;border-radius:12px;background:#101820;color:#fff;padding:10px 13px;font-weight:850;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px}.button.light,button.light{background:#fff;color:#101820;border:1px solid #cbd5e1}select,input,textarea{border:1px solid #cbd5e1;border-radius:12px;padding:9px 10px;font:inherit;background:#fff;width:100%}.small-form{display:grid;gap:8px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.production{font-weight:900}.printer-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px}.printer-lane{min-height:520px;background:#fff;border:1px solid var(--line);border-radius:24px;overflow:hidden}.printer-head{padding:14px 16px;border-bottom:1px solid var(--line);background:#f8fafc;font-weight:950}.printer-body{position:relative;height:720px;background:linear-gradient(to bottom,#f8fafc 0,#f8fafc 39px,#fff 40px);background-size:100% 40px}.hour-line{position:absolute;left:0;right:0;border-top:1px solid #edf1f5;font-size:11px;color:#94a3b8;padding-left:10px}.print-block{position:absolute;left:12px;right:12px;min-height:36px;border-radius:14px;background:#101820;color:#fff;padding:9px 10px;box-shadow:0 12px 28px rgba(16,24,32,.18);overflow:hidden}.print-block strong{display:block}.print-block span{display:block;color:#cbd5e1;font-size:12px}.block-soft{background:#0f766e}.settings-printers{display:grid;gap:10px}.agenda-tools{display:flex;gap:10px;flex-wrap:wrap;align-items:center}@media(max-width:900px){.unified-app{grid-template-columns:1fr}.unified-side{position:static}.unified-nav{grid-template-columns:repeat(2,1fr)}.cards,.grid2{grid-template-columns:1fr}.unified-content{padding:16px}table,thead,tbody,tr,td,th{display:block}thead{display:none}td{border-bottom:0}.printer-body{height:auto;min-height:0;padding:12px}.hour-line{display:none}.print-block{position:static;margin-bottom:10px}}`;
}

function decorateClassicAdminHtml(html) {
  if (typeof html !== 'string' || !html.includes('pr3nt Dashboard')) return html;
  const bridgeCss = `${unifiedCss()}.unified-content .shell{max-width:none;margin:0;padding:0}.unified-content .topbar{display:none}.unified-content .card{border-radius:22px}.unified-content .detail-grid{grid-template-columns:minmax(0,1fr) 390px}.unified-content .button{border-radius:12px}.unified-content h1{letter-spacing:-.04em}.admin-classic-title{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.admin-classic-title h1{margin:4px 0 6px}.admin-classic-title p{margin:0;color:#667085}@media(max-width:900px){.unified-content .detail-grid{grid-template-columns:1fr}.admin-classic-title{display:block}}`;
  let output = html.replace('</style>', `${bridgeCss}</style>`);
  output = output.replace('<body><main class="shell">', `<body><main class="unified-app">${navHtml('admin')}<section class="unified-content"><div class="admin-classic-title"><div><span class="eyebrow">Admin</span><h1>Admin orders</h1><p>Volledig beheer van aanvragen, offertes, prijzen, productiebedrag en klantcommunicatie.</p></div><a class="button light" href="/admin/work">Werkruimte openen</a></div><div class="shell">`);
  output = output.replace('</main><script>', '</div></section></main><script>');
  output = output.replace('</main></body>', '</div></section></main></body>');
  return output;
}

function decorateClassicAdminMiddleware(req, res, next) {
  if (req.method !== 'GET') return next();
  if (!req.path.startsWith('/admin')) return next();
  if (req.path.startsWith('/admin/work')) return next();
  const originalSend = res.send.bind(res);
  res.send = (body) => originalSend(decorateClassicAdminHtml(body));
  return next();
}

function eligibleOrders(quotes) { return quotes.filter((q) => !q.archivedAt && ['paid', 'print_queue', 'ready_to_ship'].includes(q.status)); }
function printerSelect(settings, selected = '') { return `<select name="assignedPrinter">${settings.printers.map((printer) => `<option value="${e(printer.id)}" ${selected === printer.id || selected === printer.name ? 'selected' : ''}>${e(printer.name)}</option>`).join('')}</select>`; }

function workOrdersHtml(quotes, settings) {
  const active = eligibleOrders(quotes);
  const stats = { open: active.length, planned: active.filter((q) => q.scheduledStartAt).length, production: active.filter((q) => q.status === 'print_queue').length, ready: active.filter((q) => q.status === 'ready_to_ship').length };
  const rows = active.map((quote) => {
    const hours = estimatedPrintHours(quote);
    return `<tr><td><strong>${e(quote.name || '-')}</strong><br><span class="subtle">${e(quote.id)}</span></td><td>${e(quote.material || '-')} · ${e(quote.color || '-')}<br>${quote.rush === 'Ja' ? '<span class="badge">Spoed</span>' : '<span class="subtle">Normaal</span>'}</td><td><span class="badge ${quote.status === 'paid' ? 'green' : ''}">${e(statusLabel(quote.status))}</span><br><span class="subtle">${e(orderEtaText(quote))}</span></td><td><strong>${fmt(hours)} uur</strong><br><span class="subtle">uit offerte-regel Print-uren</span></td><td class="production">${productionAmountHtml(quote)}</td><td>${fileLinks(quote)}</td><td>${quote.myParcelLabelUrl ? `<a href="${e(quote.myParcelLabelUrl)}" target="_blank">Label openen</a>` : e(quote.myParcelStatus === 'error' ? quote.myParcelError : quote.myParcelMessage || 'Nog geen label')}</td><td><form class="small-form" method="post" action="/admin/work/quotes/${encodeURIComponent(quote.id)}"><select name="status"><option value="paid" ${quote.status === 'paid' ? 'selected' : ''}>Betaald</option><option value="print_queue" ${quote.status === 'print_queue' ? 'selected' : ''}>In productie</option><option value="ready_to_ship" ${quote.status === 'ready_to_ship' ? 'selected' : ''}>Klaar voor verzending</option><option value="shipped" ${quote.status === 'shipped' ? 'selected' : ''}>Verzonden</option></select>${printerSelect(settings, quote.assignedPrinter)}<input name="scheduledStartAt" type="datetime-local" value="${e(String(quote.scheduledStartAt || '').slice(0, 16))}"><input name="estimatedPrintHours" inputmode="decimal" value="${e(quote.estimatedPrintHours || fmt(hours))}" placeholder="Printuren"><button type="submit">Plan blok</button></form></td></tr>`;
  }).join('');
  return shell('work', `<div class="top"><div><span class="eyebrow">Werkruimte</span><h1>Orders</h1><p class="muted">Plan printerblokken automatisch op basis van de offerte-regel Print-uren.</p></div><a class="button light" href="/admin?classic=1">Admin orders</a></div><section class="cards"><div class="card stat"><span class="muted">Open</span><strong>${stats.open}</strong></div><div class="card stat"><span class="muted">Ingepland</span><strong>${stats.planned}</strong></div><div class="card stat"><span class="muted">In productie</span><strong>${stats.production}</strong></div><div class="card stat"><span class="muted">Printers</span><strong>${settings.printerCount}</strong></div></section><section class="card"><table><thead><tr><th>Klant</th><th>Order</th><th>Status/planning</th><th>Printduur</th><th>Productie</th><th>Bestanden</th><th>Label</th><th>Planning</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Geen actieve orders.</td></tr>'}</tbody></table></section>`);
}

function minutesFromStartOfDay(value = '') { const date = new Date(value); if (Number.isNaN(date.getTime())) return 0; return date.getHours() * 60 + date.getMinutes(); }
function sameDay(value = '', selectedDate = '') { if (!value) return false; return String(value).slice(0, 10) === selectedDate; }

function calendarBlocks(quotes, settings, selectedDate) {
  const blocks = eligibleOrders(quotes).filter((q) => q.scheduledStartAt && sameDay(q.scheduledStartAt, selectedDate));
  return settings.printers.map((printer) => {
    const printerBlocks = blocks.filter((q) => (q.assignedPrinter || settings.printers[0]?.id) === printer.id || q.assignedPrinter === printer.name);
    const html = printerBlocks.map((quote, index) => {
      const startMinutes = minutesFromStartOfDay(quote.scheduledStartAt);
      const hours = money(quote.estimatedPrintHours || estimatedPrintHours(quote));
      const top = Math.max(0, Math.min(700, (startMinutes / 1440) * 720));
      const height = Math.max(36, Math.min(720 - top, (Math.max(0.25, hours) * 60 / 1440) * 720));
      return `<div class="print-block ${index % 2 ? 'block-soft' : ''}" style="top:${top}px;height:${height}px"><strong>${e(quote.name || 'Order')}</strong><span>${formatDateTime(quote.scheduledStartAt)} · ${fmt(hours)} uur</span><span>${e(quote.material || '-')} · ${e(quote.color || '-')}</span><span>${e(quote.id)}</span></div>`;
    }).join('');
    const hourLines = Array.from({ length: 13 }, (_, index) => `<div class="hour-line" style="top:${((index * 2) / 24) * 720}px">${String(index * 2).padStart(2, '0')}:00</div>`).join('');
    return `<section class="printer-lane"><div class="printer-head">${e(printer.name)}</div><div class="printer-body">${hourLines}${html || '<div style="padding:14px;color:#667085">Vrij beschikbaar</div>'}</div></section>`;
  }).join('');
}

function calendarFeedUrl(settings = {}) {
  const token = settings.calendarToken || process.env.PRINT_CALENDAR_TOKEN || '';
  return token ? `${baseUrl}/admin/work/calendar.ics?token=${encodeURIComponent(token)}` : '';
}

function workAgendaHtml(quotes, settings, selectedDate) {
  return shell('agenda', `<div class="top"><div><span class="eyebrow">Printerplanning</span><h1>Blok-agenda</h1><p class="muted">Elke printer heeft een eigen baan. Een order van 8 printuren blokkeert automatisch 8 uur.</p></div><form class="agenda-tools" method="get" action="/admin/work/agenda"><input type="date" name="date" value="${e(selectedDate)}"><button type="submit">Toon dag</button></form></div><section class="printer-grid">${calendarBlocks(quotes, settings, selectedDate)}</section>`);
}

function workOptionsHtml(settings, saved = false) {
  const calendarToken = settings.calendarToken || randomUUID();
  const feedUrl = calendarFeedUrl({ ...settings, calendarToken });
  const printerInputs = Array.from({ length: settings.printerCount }, (_, index) => `<label><span>Printer ${index + 1}</span><input name="printerName" value="${e(settings.printers[index]?.name || `Printer ${index + 1}`)}"></label>`).join('');
  return shell('options', `<div class="top"><div><span class="eyebrow">Instellingen</span><h1>Opties</h1><p class="muted">Beheer printers, printernamen en agenda-synchronisatie.</p></div></div>${saved ? '<div class="card" style="margin-bottom:16px;background:#ecfdf3">Instellingen opgeslagen.</div>' : ''}<section class="grid2"><form class="card small-form" method="post" action="/admin/work/options"><h2>Printers</h2><label><span>Aantal printers</span><input name="printerCount" type="number" min="1" max="20" value="${e(settings.printerCount)}"></label><div class="settings-printers">${printerInputs}</div><label><span>Agenda-token</span><input name="calendarToken" value="${e(calendarToken)}"></label><button type="submit">Opslaan</button></form><div class="card"><h2>Agenda-plugin</h2><p class="muted">Gebruik deze alleen-lezen ICS-feed om de printerplanning te synchroniseren met Apple Agenda, Google Agenda of Outlook.</p>${feedUrl ? `<label><span>Synchronisatie-link</span><input readonly value="${e(feedUrl)}"></label><p class="muted">Houd deze link privé. Iedereen met de token kan de planning lezen.</p>` : '<p class="muted">Sla eerst een agenda-token op om de synchronisatie-link te maken.</p>'}<hr style="border:0;border-top:1px solid #e3e8ef;margin:18px 0"><h2>Werking</h2><p class="muted">De printduur wordt automatisch gehaald uit de offerte-regel met “Print-uren”. Vul je daar bijvoorbeeld aantal 8 in, dan plant het portaal een blok van 8 uur.</p></div></section>`);
}

function workStatsHtml(quotes, settings) {
  const active = quotes.filter((q) => !q.archivedAt);
  const paid = active.filter((q) => q.paidAt || q.status === 'paid');
  const planned = active.filter((q) => q.scheduledStartAt);
  const productionTotal = paid.reduce((sum, q) => sum + money(q.productionAmount || q.productionOfferAmount || q.productionPrice || 0), 0);
  const plannedHours = planned.reduce((sum, q) => sum + money(q.estimatedPrintHours || estimatedPrintHours(q)), 0);
  return shell('stats', `<div class="top"><div><span class="eyebrow">Inzicht</span><h1>Statistieken</h1><p class="muted">Basisoverzicht voor productie en orders.</p></div></div><section class="cards"><div class="card stat"><span class="muted">Actieve orders</span><strong>${active.length}</strong></div><div class="card stat"><span class="muted">Betaald</span><strong>${paid.length}</strong></div><div class="card stat"><span class="muted">Geplande uren</span><strong>${fmt(plannedHours)}</strong></div><div class="card stat"><span class="muted">Printers</span><strong>${settings.printerCount}</strong></div></section><section class="cards"><div class="card stat"><span class="muted">Ingepland</span><strong>${planned.length}</strong></div><div class="card stat"><span class="muted">Productie totaal</span><strong>€ ${fmt(productionTotal)}</strong></div><div class="card stat"><span class="muted">Labels klaar</span><strong>${active.filter((q) => q.myParcelShipmentId).length}</strong></div><div class="card stat"><span class="muted">Spoed</span><strong>${active.filter((q) => q.rush === 'Ja').length}</strong></div></section>`);
}

function icsDate(value = '') { const date = new Date(value); if (Number.isNaN(date.getTime())) return ''; const pad = (n) => String(n).padStart(2, '0'); return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}00Z`; }
function icsEscape(value = '') { return String(value).replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n'); }

function calendarIcs(quotes, settings) {
  const events = eligibleOrders(quotes).filter((q) => q.scheduledStartAt && q.scheduledEndAt).map((quote) => {
    const printer = settings.printers.find((p) => p.id === quote.assignedPrinter || p.name === quote.assignedPrinter);
    const title = `Pr3nt print: ${quote.name || quote.id}`;
    const description = [`Order: ${quote.id}`, `Printer: ${printer?.name || quote.assignedPrinter || '-'}`, `Printuren: ${fmt(quote.estimatedPrintHours || estimatedPrintHours(quote))}`, `Materiaal: ${quote.material || '-'}`, `Kleur: ${quote.color || '-'}`].join('\n');
    return ['BEGIN:VEVENT', `UID:${icsEscape(quote.id)}@pr3nt.nl`, `DTSTAMP:${icsDate(new Date().toISOString())}`, `DTSTART:${icsDate(quote.scheduledStartAt)}`, `DTEND:${icsDate(quote.scheduledEndAt)}`, `SUMMARY:${icsEscape(title)}`, `DESCRIPTION:${icsEscape(description)}`, 'END:VEVENT'].join('\r\n');
  }).join('\r\n');
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pr3nt//Printerplanning//NL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Pr3nt printerplanning', events, 'END:VCALENDAR'].filter(Boolean).join('\r\n');
}

export function registerMyParcelRoutes(app) {
  app.use('/api/mollie/webhook', (req, res, next) => { res.on('finish', () => { createMissingMyParcelLabels().catch((error) => console.warn('MyParcel automatische labels mislukt:', error.message)); }); next(); });

  app.get('/admin', (req, res, next) => { if (req.query?.classic === '1') return next(); if (hasAdminAccess(req)) return res.redirect('/admin?classic=1'); return res.redirect('/admin/work'); });
  app.get('/print', (_req, res) => res.redirect('/admin/work'));
  app.post('/print/login', (req, res) => res.redirect(307, '/admin/work/login'));
  app.post('/print/logout', (req, res) => res.redirect(307, '/admin/work/logout'));
  app.use(decorateClassicAdminMiddleware);

  app.post('/admin/work/login', (req, res) => {
    const adminKey = process.env.ADMIN_KEY || '';
    const workerKey = process.env.PRINT_WORKER_KEY || '';
    const submittedKey = String(req.body?.workerKey || '');
    const valid = (workerKey && safeEquals(submittedKey, workerKey)) || (adminKey && safeEquals(submittedKey, adminKey));
    if (!valid) return res.status(401).send(loginHtml('Sleutel is onjuist.'));
    res.cookie?.('pr3nt_worker_key', submittedKey, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 1000 * 60 * 60 * 12 });
    return res.redirect('/admin/work');
  });

  app.post('/admin/work/logout', (req, res) => { res.clearCookie?.('pr3nt_worker_key'); res.redirect('/admin/work'); });

  app.get('/admin/work', requireWorker, async (_req, res) => { const [quotes, settings] = await Promise.all([readQuotes(), readSettings()]); res.send(workOrdersHtml(quotes, settings)); });
  app.get('/admin/work/options', requireWorker, async (req, res) => { const settings = await readSettings(); res.send(workOptionsHtml(settings, req.query.saved === '1')); });
  app.post('/admin/work/options', requireWorker, async (req, res) => { await writeSettingsFromBody(req.body); res.redirect('/admin/work/options?saved=1'); });
  app.get('/admin/work/agenda', requireWorker, async (req, res) => { const [quotes, settings] = await Promise.all([readQuotes(), readSettings()]); const selectedDate = clean(req.query.date || new Date().toISOString().slice(0, 10), 10); res.send(workAgendaHtml(quotes, settings, selectedDate)); });
  app.get('/admin/work/stats', requireWorker, async (_req, res) => { const [quotes, settings] = await Promise.all([readQuotes(), readSettings()]); res.send(workStatsHtml(quotes, settings)); });
  app.get('/admin/work/calendar.ics', requireCalendarAccess, async (_req, res) => { const [quotes, settings] = await Promise.all([readQuotes(), readSettings()]); res.setHeader('Content-Type', 'text/calendar; charset=utf-8'); res.setHeader('Content-Disposition', 'inline; filename="pr3nt-printerplanning.ics"'); res.send(calendarIcs(quotes, settings)); });

  app.post('/admin/work/quotes/:id', requireWorker, async (req, res) => {
    const [quotes, settings] = await Promise.all([readQuotes(), readSettings()]);
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (!quote) return res.status(404).send('Order niet gevonden');
    const allowed = new Set(['paid', 'print_queue', 'ready_to_ship', 'shipped']);
    if (allowed.has(req.body.status)) quote.status = req.body.status;
    const start = clean(req.body.scheduledStartAt, 40);
    const hours = Math.max(0.25, money(req.body.estimatedPrintHours || estimatedPrintHours(quote)));
    const printer = settings.printers.find((item) => item.id === req.body.assignedPrinter || item.name === req.body.assignedPrinter) || settings.printers[0];
    quote.estimatedPrintHours = fmt(hours);
    quote.assignedPrinter = printer?.id || clean(req.body.assignedPrinter, 120);
    quote.scheduledStartAt = start;
    quote.scheduledEndAt = start ? addHoursLocal(start, hours) : '';
    if (quote.scheduledStartAt || quote.scheduledEndAt) {
      const printerName = settings.printers.find((item) => item.id === quote.assignedPrinter)?.name || quote.assignedPrinter || 'printer';
      quote.customerEtaText = `Je order staat ingepland voor productie vanaf ${quote.scheduledStartAt.replace('T', ' ')}. Verwachte afronding: ${quote.scheduledEndAt.replace('T', ' ')}.`;
      quote.productionScheduleNote = `${printerName} · ${fmt(hours)} printuren`;
    }
    quote.updatedAt = new Date().toISOString();
    await writeQuotes(quotes);
    res.redirect('/admin/work');
  });

  app.post('/print/quotes/:id', requireWorker, async (req, res) => res.redirect(307, `/admin/work/quotes/${encodeURIComponent(req.params.id)}`));

  app.post('/admin/quotes/:id/myparcel', async (req, res) => {
    const adminKey = process.env.ADMIN_KEY || '';
    const key = req.get('x-admin-key') || req.cookies?.pr3nt_admin_key;
    if (adminKey && key !== adminKey) return res.status(401).send('Niet ingelogd');
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (!quote) return res.status(404).send('Order niet gevonden');
    const now = new Date().toISOString();
    try {
      const result = await createMyParcelShipmentForQuote(quote);
      if (result.skipped) { quote.myParcelStatus = 'skipped'; quote.myParcelMessage = result.reason; } else { quote.myParcelStatus = 'created'; quote.myParcelShipmentId = result.shipmentId; quote.myParcelLabelUrl = result.labelUrl; quote.myParcelCreatedAt = now; }
    } catch (error) { quote.myParcelStatus = 'error'; quote.myParcelError = error.message; quote.myParcelTriedAt = now; }
    await writeQuotes(quotes);
    res.redirect(`/admin/quotes/${encodeURIComponent(quote.id)}?saved=1`);
  });
}
