import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const myParcelApiBase = process.env.MYPARCEL_API_BASE || 'https://api.myparcel.nl';

function e(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function clean(value = '', max = 300) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function fmt(value) {
  return money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function enabled() {
  return Boolean(process.env.MYPARCEL_API_KEY);
}

function authHeader() {
  return `basic ${Buffer.from(process.env.MYPARCEL_API_KEY || '').toString('base64')}`;
}

function safeEquals(a = '', b = '') {
  const left = Buffer.from(String(a));
  const right = Buffer.from(String(b));
  if (!left.length || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

async function readQuotes() {
  try {
    const quotes = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    return Array.isArray(quotes) ? quotes : [];
  } catch {
    return [];
  }
}

async function writeQuotes(quotes) {
  await writeFile(quotesFilePath, JSON.stringify(quotes, null, 2));
}

function shippingAddress(quote = {}) {
  const shipping = quote.shipping || quote.billing || {};
  const address = shipping.address || [shipping.street, shipping.houseNumber].filter(Boolean).join(' ');
  const match = String(address || '').trim().match(/^(.+?)\s+(\d+\s*[a-zA-Z]?(?:\s*[-/]\s*\d+\s*[a-zA-Z]?)?)$/);
  return {
    person: clean(shipping.name || quote.name, 80),
    company: clean(shipping.company || quote.company, 80),
    street: clean(shipping.street || (match ? match[1] : address), 80),
    number: clean(shipping.houseNumber || (match ? match[2] : ''), 20),
    postalCode: clean(shipping.postalCode || shipping.postalcode || quote.billing?.postalCode, 20).replace(/\s+/g, ''),
    city: clean(shipping.city || quote.billing?.city, 80),
    country: clean(shipping.country || quote.billing?.country || 'NL', 2).toUpperCase().replace('NEDERLAND', 'NL'),
    email: clean(quote.email, 120),
    phone: clean(quote.phone, 40),
  };
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
  const recipient = {
    cc,
    person: address.person,
    company: address.company,
    street: address.street,
    number: address.number,
    postal_code: address.postalCode,
    city: address.city,
    email: address.email,
    phone: address.phone,
  };
  Object.keys(recipient).forEach((key) => { if (!recipient[key]) delete recipient[key]; });
  return {
    data: {
      shipments: [
        {
          reference_identifier: clean(quote.id, 50),
          recipient,
          options: {
            package_type: 1,
            label_description: clean(`Pr3nt ${quote.id}`, 45),
          },
        },
      ],
    },
  };
}

async function myParcelFetch(endpoint, options = {}) {
  const response = await fetch(`${myParcelApiBase}${endpoint}`, {
    ...options,
    headers: {
      Authorization: authHeader(),
      'User-Agent': process.env.MYPARCEL_USER_AGENT || 'Pr3ntPortal/1',
      ...(options.headers || {}),
    },
  });
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
    const result = await myParcelFetch(`/shipment_labels/${encodeURIComponent(shipmentId)}`, {
      method: 'GET',
      headers: { Accept: 'application/json;charset=utf-8' },
    });
    const url = result?.data?.pdfs?.url || result?.data?.url || result?.url || '';
    if (!url) return '';
    return url.startsWith('http') ? url : `${myParcelApiBase}${url}`;
  } catch {
    return '';
  }
}

export async function createMyParcelShipmentForQuote(quote) {
  const check = canCreateShipment(quote);
  if (!check.ok) return { skipped: true, reason: check.reason };

  const payload = shipmentPayload(quote);
  const result = await myParcelFetch('/shipments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/vnd.shipment+json;charset=utf-8;version=1.1',
      Accept: 'application/vnd.shipment_label_link+json;charset=utf-8',
    },
    body: JSON.stringify(payload),
  });

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
        changed = true;
        continue;
      }
      quote.myParcelStatus = 'created';
      quote.myParcelShipmentId = result.shipmentId;
      quote.myParcelLabelUrl = result.labelUrl;
      quote.myParcelCreatedAt = now;
      quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
      quote.messages.push({ from: 'pr3nt', text: `MyParcel-verzendlabel klaargezet${result.shipmentId ? `: ${result.shipmentId}` : ''}.`, createdAt: now });
      results.push({ id: quote.id, shipmentId: result.shipmentId, labelUrl: result.labelUrl });
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

function accessRole(req) {
  const adminKey = process.env.ADMIN_KEY || '';
  const workerKey = process.env.PRINT_WORKER_KEY || '';
  const cookieKey = req.cookies?.pr3nt_worker_key || req.cookies?.pr3nt_admin_key || '';
  const headerKey = req.get('x-worker-key') || '';
  const key = cookieKey || headerKey;
  if (adminKey && safeEquals(key, adminKey)) return 'admin';
  if (workerKey && safeEquals(key, workerKey)) return 'worker';
  return '';
}

function hasInternalAccess(req) {
  return Boolean(accessRole(req));
}

function requireInternal(req, res, next) {
  if (hasInternalAccess(req)) return next();
  return res.status(401).send(loginHtml());
}

function loginHtml(error = '') {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login · pr3nt</title><style>:root{--ink:#101820;--green:#00d084;--muted:#6b7280}*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);background:radial-gradient(circle at top left,rgba(0,208,132,.24),transparent 34%),linear-gradient(135deg,#07120f 0%,#101820 48%,#17212f 100%);display:grid;place-items:center}.login{width:min(430px,calc(100vw - 28px));background:rgba(255,255,255,.96);border:1px solid rgba(255,255,255,.34);border-radius:28px;padding:30px;box-shadow:0 28px 80px rgba(0,0,0,.28)}.brand{font-size:30px;font-weight:950;letter-spacing:-.06em;margin-bottom:26px}.eyebrow{font-size:12px;color:var(--muted);font-weight:850;text-transform:uppercase;letter-spacing:.08em}h1{font-size:34px;letter-spacing:-.05em;margin:8px 0 8px}p{color:var(--muted);line-height:1.55}input{width:100%;border:1px solid #cfd5dd;border-radius:14px;padding:13px 14px;font:inherit;margin-top:8px}button{width:100%;border:0;border-radius:14px;background:var(--green);color:#082115;padding:13px 16px;font-weight:950;margin-top:14px;cursor:pointer}.error{background:#fff1f0;border:1px solid #fed3d1;color:#9f1f12;border-radius:14px;padding:12px;margin:14px 0}</style></head><body><section class="login"><div class="brand">pr3nt.nl</div><span class="eyebrow">Interne omgeving</span><h1>Login</h1><p>Log in om orders, planning en productie te beheren.</p>${error ? `<div class="error">${e(error)}</div>` : ''}<form method="post" action="/admin/work/login"><label><span class="eyebrow">Toegangssleutel</span><input name="accessKey" type="password" autocomplete="current-password" required></label><button type="submit">Inloggen</button></form></section></body></html>`;
}

function statusLabel(status = '') {
  const labels = { paid: 'Betaald', print_queue: 'Print in queue', ready_to_ship: 'Klaar voor verzending', shipped: 'Verzonden', delivered: 'Geleverd' };
  return labels[status] || status || '-';
}

function statusClass(status = '') {
  if (status === 'paid') return 'blue';
  if (status === 'print_queue') return 'orange';
  if (status === 'ready_to_ship') return 'green';
  return '';
}

function productionAmountHtml(quote = {}) {
  const value = quote.productionAmount || quote.productionOfferAmount || quote.productionPrice || '';
  if (!String(value).trim()) return '<span class="muted">Nog niet ingesteld</span>';
  return `<strong>€ ${fmt(value)}</strong>`;
}

function fileLinks(quote) {
  const files = Array.isArray(quote.files) ? quote.files : [];
  if (!files.length && quote.fileUrl) return `<a href="${e(quote.fileUrl)}">${e(quote.fileOriginalName || 'Bestand downloaden')}</a>`;
  return files.map((file) => `<a href="${e(file.url)}">${e(file.originalName || file.storedName || 'Bestand')}</a>`).join('<br>') || '<span class="muted">Geen bestanden</span>';
}

function lineCount(quote = {}) {
  return Array.isArray(quote.quoteLines) ? quote.quoteLines.length : quote.quoteAmount ? 1 : 0;
}

function scheduleText(quote = {}) {
  if (!quote.scheduledStartAt && !quote.scheduledEndAt) return '<span class="muted">Niet ingepland</span>';
  const start = quote.scheduledStartAt ? new Date(quote.scheduledStartAt).toLocaleString('nl-NL') : 'Nog niet bekend';
  const end = quote.scheduledEndAt ? new Date(quote.scheduledEndAt).toLocaleString('nl-NL') : 'Nog niet bekend';
  return `${e(start)}<br><span class="muted">tot ${e(end)}</span>`;
}

function activeOrders(quotes) {
  return quotes.filter((q) => !q.archivedAt && ['paid', 'print_queue', 'ready_to_ship'].includes(q.status));
}

function appLayout({ title = 'Werkruimte', active = 'orders', role = 'worker', body = '' }) {
  const isAdmin = role === 'admin';
  const items = [
    ['orders', 'Orders', '/admin/work'],
    ['options', 'Opties', '/admin/work/options'],
    ['agenda', 'Agenda', '/admin/work/agenda'],
    ['stats', 'Statistieken', '/admin/work/stats'],
  ];
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · pr3nt</title><style>:root{--bg:#f4f6f5;--card:#fff;--ink:#101820;--muted:#667085;--line:#e1e5e9;--green:#00d084;--dark:#111827;--orange:#fff4e5;--blue:#e9f2ff;--radius:18px}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.45}a{color:inherit;text-decoration:none}.app{min-height:100vh;display:grid;grid-template-columns:250px 1fr}.sidebar{background:#0b1411;color:#fff;padding:22px;display:flex;flex-direction:column;gap:24px;position:sticky;top:0;height:100vh}.brand{font-size:27px;font-weight:950;letter-spacing:-.06em}.role{color:#9aa7a0;font-size:12px;font-weight:800;text-transform:uppercase;letter-spacing:.08em}.nav{display:grid;gap:7px}.nav a{display:flex;align-items:center;gap:10px;padding:11px 12px;border-radius:13px;color:#cdd8d2;font-weight:800}.nav a.active,.nav a:hover{background:rgba(255,255,255,.1);color:#fff}.side-footer{margin-top:auto}.logout{width:100%;border:1px solid rgba(255,255,255,.16);background:rgba(255,255,255,.06);color:#fff;border-radius:13px;padding:11px;font-weight:900;cursor:pointer}.main{padding:26px;max-width:1480px;width:100%}.top{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;margin-bottom:18px}.eyebrow{color:var(--muted);font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.08em}h1{font-size:34px;letter-spacing:-.05em;margin:4px 0}.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px;margin-bottom:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 1px 0 rgba(0,0,0,.03),0 12px 30px rgba(16,24,32,.05);padding:18px}.stat strong{display:block;font-size:26px;letter-spacing:-.04em}.table-wrap{overflow:auto}.orders{width:100%;border-collapse:separate;border-spacing:0}.orders th{text-align:left;font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em;padding:12px;border-bottom:1px solid var(--line)}.orders td{background:#fff;border-bottom:1px solid var(--line);padding:13px 12px;vertical-align:top}.orders tr:hover td{background:#fbfcfd}.badge{display:inline-flex;border-radius:999px;background:#eef0f2;color:#344054;padding:5px 9px;font-size:12px;font-weight:850}.badge.green{background:#e9fbf2;color:#087443}.badge.orange{background:var(--orange);color:#8a4b00}.badge.blue{background:var(--blue);color:#1d4e89}.button,button{border:0;border-radius:11px;background:var(--dark);color:#fff;padding:9px 12px;font-weight:900;cursor:pointer}.button.ghost{background:#fff;color:var(--ink);border:1px solid #cbd1d8}input,select,textarea{width:100%;border:1px solid #cbd1d8;border-radius:11px;padding:9px 10px;font:inherit;background:#fff}textarea{min-height:72px}.inline-form{display:grid;grid-template-columns:1fr 1fr;gap:8px;min-width:310px}.inline-form .full{grid-column:1/-1}.pill-row{display:flex;gap:8px;flex-wrap:wrap}.split{display:grid;grid-template-columns:1.3fr .7fr;gap:16px}.agenda-list{display:grid;gap:10px}.agenda-item{display:grid;grid-template-columns:150px 1fr auto;gap:12px;align-items:center;border:1px solid var(--line);border-radius:14px;padding:12px;background:#fff}.notice{border:1px solid #bbf7d0;background:#ecfdf3;color:#166534;border-radius:14px;padding:12px;margin-bottom:14px}@media(max-width:1050px){.app{grid-template-columns:1fr}.sidebar{position:static;height:auto}.cards,.split{grid-template-columns:1fr}.inline-form{grid-template-columns:1fr}}@media(max-width:760px){.main{padding:16px}.orders,thead,tbody,tr,td,th{display:block}.orders thead{display:none}.orders td{border-bottom:0}.orders tr{display:block;border:1px solid var(--line);border-radius:16px;margin-bottom:12px;overflow:hidden}}</style></head><body><div class="app"><aside class="sidebar"><div><div class="brand">pr3nt.nl</div><div class="role">${isAdmin ? 'Admin' : 'Werkruimte'}</div></div><nav class="nav">${items.map(([key, label, href]) => `<a class="${active === key ? 'active' : ''}" href="${href}">${label}</a>`).join('')}${isAdmin ? '<a href="/admin">Volledig beheer</a>' : ''}</nav><div class="side-footer"><form method="post" action="/admin/work/logout"><button class="logout" type="submit">Uitloggen</button></form></div></aside><main class="main">${body}</main></div></body></html>`;
}

function stats(quotes) {
  const active = activeOrders(quotes);
  return {
    open: active.length,
    paid: active.filter((q) => q.status === 'paid').length,
    planned: active.filter((q) => q.scheduledStartAt || q.scheduledEndAt).length,
    ready: active.filter((q) => q.status === 'ready_to_ship').length,
    productionTotal: active.reduce((sum, q) => sum + money(q.productionAmount || q.productionOfferAmount || q.productionPrice || 0), 0),
  };
}

function renderOrders(quotes, req) {
  const role = accessRole(req) || 'worker';
  const active = activeOrders(quotes);
  const s = stats(quotes);
  const rows = active.map((quote) => `<tr><td><strong>${e(quote.name || '-')}</strong><br><span class="muted">${e(quote.id)}</span></td><td>${e(quote.material || '-')} · ${e(quote.color || '-')}<br><span class="muted">${lineCount(quote)} regel(s) · ${quote.rush === 'Ja' ? 'Spoed' : 'Normaal'}</span></td><td><span class="badge ${statusClass(quote.status)}">${e(statusLabel(quote.status))}</span></td><td>${productionAmountHtml(quote)}</td><td>${scheduleText(quote)}</td><td>${fileLinks(quote)}</td><td>${quote.myParcelLabelUrl ? `<a class="button ghost" href="${e(quote.myParcelLabelUrl)}" target="_blank">Label</a>` : `<span class="muted">${e(quote.myParcelStatus === 'error' ? quote.myParcelError : quote.myParcelMessage || 'Geen label')}</span>`}</td><td><form class="inline-form" method="post" action="/admin/work/orders/${encodeURIComponent(quote.id)}"><select name="status"><option value="paid" ${quote.status === 'paid' ? 'selected' : ''}>Betaald</option><option value="print_queue" ${quote.status === 'print_queue' ? 'selected' : ''}>Print in queue</option><option value="ready_to_ship" ${quote.status === 'ready_to_ship' ? 'selected' : ''}>Klaar voor verzending</option><option value="shipped" ${quote.status === 'shipped' ? 'selected' : ''}>Verzonden</option></select><input name="estimatedProductionHours" value="${e(quote.estimatedProductionHours || '')}" placeholder="Uren"><input class="full" name="scheduledStartAt" type="datetime-local" value="${e(datetimeLocal(quote.scheduledStartAt))}"><input class="full" name="scheduledEndAt" type="datetime-local" value="${e(datetimeLocal(quote.scheduledEndAt))}"><input class="full" name="assignedPrinter" value="${e(quote.assignedPrinter || '')}" placeholder="Printer / machine"><textarea class="full" name="productionNotes" placeholder="Productienotitie">${e(quote.productionNotes || '')}</textarea><button class="full" type="submit">Opslaan</button></form></td></tr>`).join('');
  const body = `<div class="top"><div><span class="eyebrow">Interne omgeving</span><h1>Orders</h1><p class="muted">Eén omgeving voor beheer en productie, met afgeschermde rechten per login.</p></div></div><section class="cards"><div class="card stat"><span class="muted">Open orders</span><strong>${s.open}</strong></div><div class="card stat"><span class="muted">Te plannen</span><strong>${s.paid}</strong></div><div class="card stat"><span class="muted">Ingepland</span><strong>${s.planned}</strong></div><div class="card stat"><span class="muted">Klaar</span><strong>${s.ready}</strong></div></section><section class="card table-wrap"><table class="orders"><thead><tr><th>Klant</th><th>Order</th><th>Status</th><th>Productie</th><th>Planning</th><th>Bestanden</th><th>Label</th><th>Actie</th></tr></thead><tbody>${rows || '<tr><td colspan="8" class="muted">Geen actieve orders.</td></tr>'}</tbody></table></section>`;
  return appLayout({ title: 'Orders', active: 'orders', role, body });
}

function datetimeLocal(value = '') {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function isoFromLocal(value = '') {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toISOString();
}

function renderAgenda(quotes, req) {
  const role = accessRole(req) || 'worker';
  const planned = activeOrders(quotes)
    .filter((q) => q.scheduledStartAt || q.scheduledEndAt)
    .sort((a, b) => String(a.scheduledStartAt || '').localeCompare(String(b.scheduledStartAt || '')));
  const items = planned.map((q) => `<div class="agenda-item"><div><strong>${q.scheduledStartAt ? e(new Date(q.scheduledStartAt).toLocaleDateString('nl-NL')) : '-'}</strong><br><span class="muted">${q.scheduledStartAt ? e(new Date(q.scheduledStartAt).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })) : ''}</span></div><div><strong>${e(q.name || q.id)}</strong><br><span class="muted">${e(q.material || '-')} · ${e(q.color || '-')} · ${e(q.assignedPrinter || 'Geen printer gekozen')}</span></div><span class="badge ${statusClass(q.status)}">${e(statusLabel(q.status))}</span></div>`).join('');
  const body = `<div class="top"><div><span class="eyebrow">Planning</span><h1>Agenda</h1><p class="muted">Plan productie via Orders. De klant ziet daarna automatisch de verwachte productietijd in het klantportaal.</p></div></div><section class="card"><div class="agenda-list">${items || '<p class="muted">Nog geen orders ingepland.</p>'}</div></section>`;
  return appLayout({ title: 'Agenda', active: 'agenda', role, body });
}

function renderOptions(req) {
  const role = accessRole(req) || 'worker';
  const isAdmin = role === 'admin';
  const body = `<div class="top"><div><span class="eyebrow">Instellingen</span><h1>Opties</h1><p class="muted">Instellingen blijven afgeschermd. Productie ziet alleen relevante operationele informatie.</p></div></div><section class="split"><div class="card"><h2>Toegang</h2><p>Gebruik één interne stijl onder <strong>/admin</strong>. Admin en productie blijven gescheiden met aparte sleutels en cookies.</p><div class="pill-row"><span class="badge green">Admin afgeschermd</span><span class="badge blue">Werkruimte actief</span><span class="badge">Geen key in URL</span></div></div><div class="card"><h2>MyParcel</h2><p class="muted">API-key: ${process.env.MYPARCEL_API_KEY ? 'ingesteld' : 'ontbreekt'}<br>User-Agent: ${e(process.env.MYPARCEL_USER_AGENT || 'Pr3ntPortal/1')}</p>${isAdmin ? '<p class="muted">Volledige instellingen pas je aan in de server .env.</p>' : ''}</div></section>`;
  return appLayout({ title: 'Opties', active: 'options', role, body });
}

function renderStats(quotes, req) {
  const role = accessRole(req) || 'worker';
  const s = stats(quotes);
  const body = `<div class="top"><div><span class="eyebrow">Inzicht</span><h1>Statistieken</h1><p class="muted">Snelle productie-inzichten voor de interne omgeving.</p></div></div><section class="cards"><div class="card stat"><span class="muted">Open orders</span><strong>${s.open}</strong></div><div class="card stat"><span class="muted">Ingepland</span><strong>${s.planned}</strong></div><div class="card stat"><span class="muted">Klaar voor verzending</span><strong>${s.ready}</strong></div><div class="card stat"><span class="muted">Productiebedrag totaal</span><strong>€ ${fmt(s.productionTotal)}</strong></div></section>`;
  return appLayout({ title: 'Statistieken', active: 'stats', role, body });
}

function planningNoticeHtml(quote = {}) {
  if (!quote.scheduledStartAt && !quote.scheduledEndAt && !quote.estimatedProductionHours) return '';
  const start = quote.scheduledStartAt ? new Date(quote.scheduledStartAt).toLocaleString('nl-NL') : '';
  const end = quote.scheduledEndAt ? new Date(quote.scheduledEndAt).toLocaleString('nl-NL') : '';
  const hours = quote.estimatedProductionHours ? `${e(quote.estimatedProductionHours)} uur` : '';
  const lines = [
    start ? `Productie gepland: ${e(start)}` : '',
    end ? `Verwachte afronding: ${e(end)}` : '',
    hours ? `Geschatte productietijd: ${hours}` : '',
  ].filter(Boolean).join('<br>');
  return `<section class="tracking-card" id="production-planning"><div class="tracking-icon">🗓️</div><div><span class="eyebrow">Planning</span><h2>Verwachte productietijd</h2><p class="muted">${lines}</p></div></section>`;
}

function injectPlanningIntoPortal(html, quote) {
  const block = planningNoticeHtml(quote);
  if (!block || html.includes('id="production-planning"')) return html;
  return html.includes('</main>') ? html.replace(/(<\/main>)/, `${block}$1`) : `${html}${block}`;
}

export function registerMyParcelRoutes(app) {
  app.use('/api/mollie/webhook', (req, res, next) => {
    res.on('finish', () => {
      createMissingMyParcelLabels().catch((error) => console.warn('MyParcel automatische labels mislukt:', error.message));
    });
    next();
  });

  app.get('/print', (_req, res) => res.redirect('/admin/work'));
  app.post('/print/login', (_req, res) => res.redirect(307, '/admin/work/login'));
  app.post('/print/logout', (_req, res) => res.redirect(307, '/admin/work/logout'));
  app.post('/print/quotes/:id', (req, res) => res.redirect(307, `/admin/work/orders/${encodeURIComponent(req.params.id)}`));

  app.post('/admin/work/login', (req, res) => {
    const adminKey = process.env.ADMIN_KEY || '';
    const workerKey = process.env.PRINT_WORKER_KEY || '';
    const submittedKey = String(req.body?.accessKey || req.body?.workerKey || '');
    const valid = (workerKey && safeEquals(submittedKey, workerKey)) || (adminKey && safeEquals(submittedKey, adminKey));
    if (!valid) return res.status(401).send(loginHtml('Sleutel is onjuist.'));
    res.cookie?.('pr3nt_worker_key', submittedKey, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 1000 * 60 * 60 * 12 });
    return res.redirect('/admin/work');
  });

  app.post('/admin/work/logout', (req, res) => {
    res.clearCookie?.('pr3nt_worker_key');
    res.redirect('/admin/work');
  });

  app.get('/admin/work', requireInternal, async (req, res) => {
    const quotes = await readQuotes();
    res.send(renderOrders(quotes, req));
  });

  app.get('/admin/work/options', requireInternal, (req, res) => res.send(renderOptions(req)));

  app.get('/admin/work/agenda', requireInternal, async (req, res) => {
    const quotes = await readQuotes();
    res.send(renderAgenda(quotes, req));
  });

  app.get('/admin/work/stats', requireInternal, async (req, res) => {
    const quotes = await readQuotes();
    res.send(renderStats(quotes, req));
  });

  app.post('/admin/work/orders/:id', requireInternal, async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (!quote) return res.status(404).send('Order niet gevonden');
    const allowed = new Set(['paid', 'print_queue', 'ready_to_ship', 'shipped']);
    if (allowed.has(req.body.status)) quote.status = req.body.status;
    quote.estimatedProductionHours = clean(req.body.estimatedProductionHours, 40);
    quote.scheduledStartAt = isoFromLocal(req.body.scheduledStartAt);
    quote.scheduledEndAt = isoFromLocal(req.body.scheduledEndAt);
    quote.assignedPrinter = clean(req.body.assignedPrinter, 120);
    quote.productionNotes = clean(req.body.productionNotes, 1000);
    quote.updatedAt = new Date().toISOString();
    await writeQuotes(quotes);
    res.redirect('/admin/work');
  });

  app.use('/portal/:token', async (req, res, next) => {
    const subPath = req.path.replace(/\/+$/, '') || '/';
    const isPortalPage = subPath === '/' || subPath === '/account';
    if (req.method !== 'GET' || !isPortalPage) return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const quote = (await readQuotes()).find((item) => !item.archivedAt && (item.portalToken === req.params.token || item.id === req.params.token));
        return originalSend(quote ? injectPlanningIntoPortal(body, quote) : body);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });

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
      if (result.skipped) {
        quote.myParcelStatus = 'skipped';
        quote.myParcelMessage = result.reason;
      } else {
        quote.myParcelStatus = 'created';
        quote.myParcelShipmentId = result.shipmentId;
        quote.myParcelLabelUrl = result.labelUrl;
        quote.myParcelCreatedAt = now;
      }
    } catch (error) {
      quote.myParcelStatus = 'error';
      quote.myParcelError = error.message;
      quote.myParcelTriedAt = now;
    }
    await writeQuotes(quotes);
    res.redirect(`/admin/quotes/${encodeURIComponent(quote.id)}?saved=1`);
  });
}
