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

function loginHtml(error = '') {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Login · pr3nt</title><style>:root{--ink:#101820;--muted:#8b98a5;--green:#00d084;--line:rgba(255,255,255,.15)}*{box-sizing:border-box}body{margin:0;min-height:100vh;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#fff;background:radial-gradient(circle at 20% 20%,rgba(0,208,132,.22),transparent 28%),radial-gradient(circle at 80% 10%,rgba(255,255,255,.12),transparent 24%),linear-gradient(135deg,#07110d 0%,#101820 52%,#17212b 100%);display:grid;place-items:center;padding:24px}.login{width:min(1040px,100%);display:grid;grid-template-columns:1.2fr .8fr;gap:32px;align-items:center}.brand{font-size:48px;font-weight:950;letter-spacing:-.07em;margin-bottom:18px}.hero h1{font-size:54px;line-height:.96;margin:0 0 16px;letter-spacing:-.06em}.hero p{max-width:560px;color:#d4dde5;font-size:17px;line-height:1.65}.card{background:rgba(255,255,255,.92);backdrop-filter:blur(16px);color:var(--ink);border:1px solid rgba(255,255,255,.55);border-radius:28px;padding:30px;box-shadow:0 24px 80px rgba(0,0,0,.28)}label{display:block;font-weight:800;margin-bottom:8px}input{width:100%;padding:14px 14px;border:1px solid #cbd5e1;border-radius:14px;font:inherit;background:#fff}button{margin-top:14px;width:100%;border:0;border-radius:14px;background:var(--ink);color:#fff;padding:14px;font-weight:900;cursor:pointer}.hint{color:#667085;font-size:13px;line-height:1.5}.error{background:#fff1f0;border:1px solid #fed3d1;color:#9f1f12;border-radius:12px;padding:10px;margin-bottom:12px}@media(max-width:820px){.login{grid-template-columns:1fr}.hero h1{font-size:40px}.brand{font-size:36px}}</style></head><body><main class="login"><section class="hero"><div class="brand">pr3nt</div><h1>Interne omgeving voor productie en orders.</h1><p>Beheer orders, planning, labels en productie vanuit één afgeschermde omgeving in dezelfde Pr3nt-stijl.</p></section><section class="card"><h2>Login</h2><p class="hint">Vul je toegangssleutel in om verder te gaan.</p>${error ? `<div class="error">${e(error)}</div>` : ''}<form method="post" action="/admin/work/login"><label>Toegangssleutel</label><input name="workerKey" type="password" autocomplete="current-password" required><button type="submit">Inloggen</button></form></section></main></body></html>`;
}

function hasWorkerAccess(req) {
  const adminKey = process.env.ADMIN_KEY || '';
  const workerKey = process.env.PRINT_WORKER_KEY || '';
  const cookieKey = req.cookies?.pr3nt_worker_key || req.cookies?.pr3nt_admin_key || '';
  const headerKey = req.get('x-worker-key') || '';
  return Boolean(
    (workerKey && (safeEquals(cookieKey, workerKey) || safeEquals(headerKey, workerKey))) ||
    (adminKey && (safeEquals(cookieKey, adminKey) || safeEquals(headerKey, adminKey)))
  );
}

function requireWorker(req, res, next) {
  if (hasWorkerAccess(req)) return next();
  return res.status(401).send(loginHtml());
}

function statusLabel(status = '') {
  const labels = { paid: 'Betaald', print_queue: 'Print in queue', ready_to_ship: 'Klaar voor verzending', shipped: 'Verzonden', delivered: 'Geleverd' };
  return labels[status] || status || '-';
}

function productionAmountHtml(quote = {}) {
  const value = quote.productionAmount || quote.productionOfferAmount || quote.productionPrice || '';
  if (!String(value).trim()) return '<span>-</span>';
  return `<strong>€ ${fmt(value)}</strong>`;
}

function fileLinks(quote) {
  const files = Array.isArray(quote.files) ? quote.files : [];
  if (!files.length && quote.fileUrl) return `<a href="${e(quote.fileUrl)}">${e(quote.fileOriginalName || 'Bestand downloaden')}</a>`;
  return files.map((file) => `<a href="${e(file.url)}">${e(file.originalName || file.storedName || 'Bestand')}</a>`).join('<br>') || '-';
}

function orderEtaText(quote = {}) {
  if (!quote.scheduledStartAt && !quote.scheduledEndAt) return 'Nog niet ingepland';
  const start = quote.scheduledStartAt ? new Date(quote.scheduledStartAt).toLocaleString('nl-NL') : '-';
  const end = quote.scheduledEndAt ? new Date(quote.scheduledEndAt).toLocaleString('nl-NL') : '-';
  return `${start} → ${end}`;
}

function shell(active, body) {
  const nav = [
    ['orders', '/admin/work', 'Orders'],
    ['options', '/admin/work/options', 'Opties'],
    ['agenda', '/admin/work/agenda', 'Agenda'],
    ['stats', '/admin/work/stats', 'Statistieken'],
  ];
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Admin · pr3nt</title><style>:root{--bg:#f4f6f5;--card:#fff;--ink:#101820;--muted:#667085;--line:#e3e8ef;--green:#00d084;--soft:#eef8f3}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.app{min-height:100vh;display:grid;grid-template-columns:250px 1fr}.side{background:#101820;color:#fff;padding:22px;display:flex;flex-direction:column;gap:22px}.logo{font-size:28px;font-weight:950;letter-spacing:-.07em}.nav{display:grid;gap:8px}.nav a{display:flex;align-items:center;justify-content:space-between;color:#d7dde0;text-decoration:none;padding:11px 12px;border-radius:14px;font-weight:800}.nav a.active,.nav a:hover{background:rgba(0,208,132,.13);color:#fff}.content{padding:26px}.top{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.eyebrow{color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.08em;font-size:12px}h1{font-size:34px;letter-spacing:-.05em;margin:4px 0 6px}.muted{color:var(--muted)}.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:16px}.card{background:var(--card);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 10px 30px rgba(16,24,32,.04)}.stat strong{display:block;font-size:28px;letter-spacing:-.04em}table{width:100%;border-collapse:collapse}th,td{padding:13px 12px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.badge{display:inline-flex;border-radius:999px;background:#eef2f7;padding:5px 9px;font-size:12px;font-weight:850}.badge.green{background:#e9fbf2;color:#087443}.button,button{border:0;border-radius:12px;background:#101820;color:#fff;padding:10px 13px;font-weight:850;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:7px}button.light,.button.light{background:#fff;color:#101820;border:1px solid #cbd5e1}select,input,textarea{border:1px solid #cbd5e1;border-radius:12px;padding:9px 10px;font:inherit;background:#fff;width:100%}.small-form{display:grid;gap:8px}.grid2{display:grid;grid-template-columns:1fr 1fr;gap:14px}.agenda-list{display:grid;gap:12px}.agenda-item{display:grid;grid-template-columns:150px 1fr auto;gap:12px;align-items:center}.logout{margin-top:auto}.production{font-weight:900}.subtle{font-size:12px;color:var(--muted)}@media(max-width:900px){.app{grid-template-columns:1fr}.side{position:static}.nav{grid-template-columns:repeat(2,1fr)}.cards,.grid2{grid-template-columns:1fr}.content{padding:16px}table,thead,tbody,tr,td,th{display:block}thead{display:none}td{border-bottom:0}.agenda-item{grid-template-columns:1fr}}</style></head><body><main class="app"><aside class="side"><div><div class="logo">pr3nt</div><div class="subtle">Interne omgeving</div></div><nav class="nav">${nav.map(([key, href, label]) => `<a class="${active === key ? 'active' : ''}" href="${href}">${label}<span>›</span></a>`).join('')}</nav><form class="logout" method="post" action="/admin/work/logout"><button class="light" type="submit">Uitloggen</button></form></aside><section class="content">${body}</section></main></body></html>`;
}

function workOrdersHtml(quotes) {
  const active = quotes.filter((q) => !q.archivedAt && ['paid', 'print_queue', 'ready_to_ship'].includes(q.status));
  const stats = {
    open: active.length,
    planned: active.filter((q) => q.scheduledStartAt).length,
    production: active.filter((q) => q.status === 'print_queue').length,
    ready: active.filter((q) => q.status === 'ready_to_ship').length,
  };
  const rows = active.map((quote) => `<tr><td><strong>${e(quote.name || '-')}</strong><br><span class="subtle">${e(quote.id)}</span></td><td>${e(quote.material || '-')} · ${e(quote.color || '-')}<br>${quote.rush === 'Ja' ? '<span class="badge">Spoed</span>' : '<span class="subtle">Normaal</span>'}</td><td><span class="badge ${quote.status === 'paid' ? 'green' : ''}">${e(statusLabel(quote.status))}</span><br><span class="subtle">${e(orderEtaText(quote))}</span></td><td class="production">${productionAmountHtml(quote)}</td><td>${fileLinks(quote)}</td><td>${quote.myParcelLabelUrl ? `<a href="${e(quote.myParcelLabelUrl)}" target="_blank">Label openen</a>` : e(quote.myParcelStatus === 'error' ? quote.myParcelError : quote.myParcelMessage || 'Nog geen label')}</td><td><form class="small-form" method="post" action="/admin/work/quotes/${encodeURIComponent(quote.id)}"><select name="status"><option value="paid" ${quote.status === 'paid' ? 'selected' : ''}>Betaald</option><option value="print_queue" ${quote.status === 'print_queue' ? 'selected' : ''}>In productie</option><option value="ready_to_ship" ${quote.status === 'ready_to_ship' ? 'selected' : ''}>Klaar voor verzending</option><option value="shipped" ${quote.status === 'shipped' ? 'selected' : ''}>Verzonden</option></select><input name="scheduledStartAt" type="datetime-local" value="${e(String(quote.scheduledStartAt || '').slice(0, 16))}"><input name="scheduledEndAt" type="datetime-local" value="${e(String(quote.scheduledEndAt || '').slice(0, 16))}"><input name="assignedPrinter" placeholder="Printer" value="${e(quote.assignedPrinter || '')}"><button type="submit">Opslaan</button></form></td></tr>`).join('');
  return shell('orders', `<div class="top"><div><span class="eyebrow">Werkruimte</span><h1>Orders</h1><p class="muted">Betaalde orders, bestanden, productiebedrag, planning en verzendlabels op één plek.</p></div><a class="button light" href="/admin?classic=1">Volledig beheer</a></div><section class="cards"><div class="card stat"><span class="muted">Open</span><strong>${stats.open}</strong></div><div class="card stat"><span class="muted">Ingepland</span><strong>${stats.planned}</strong></div><div class="card stat"><span class="muted">In productie</span><strong>${stats.production}</strong></div><div class="card stat"><span class="muted">Klaar</span><strong>${stats.ready}</strong></div></section><section class="card"><table><thead><tr><th>Klant</th><th>Order</th><th>Status/planning</th><th>Productie</th><th>Bestanden</th><th>Label</th><th>Actie</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Geen actieve orders.</td></tr>'}</tbody></table></section>`);
}

function workAgendaHtml(quotes) {
  const planned = quotes.filter((q) => !q.archivedAt && (q.scheduledStartAt || q.scheduledEndAt)).sort((a, b) => String(a.scheduledStartAt || '').localeCompare(String(b.scheduledStartAt || '')));
  const items = planned.map((quote) => `<div class="card agenda-item"><div><strong>${e(String(quote.scheduledStartAt || '').slice(0, 16).replace('T', ' '))}</strong><br><span class="subtle">tot ${e(String(quote.scheduledEndAt || '').slice(0, 16).replace('T', ' '))}</span></div><div><strong>${e(quote.name || '-')}</strong><br><span class="muted">${e(quote.material || '-')} · ${e(quote.color || '-')} · ${e(quote.assignedPrinter || 'Geen printer gekozen')}</span></div><a class="button light" href="/admin?classic=1">Open beheer</a></div>`).join('');
  return shell('agenda', `<div class="top"><div><span class="eyebrow">Planning</span><h1>Agenda</h1><p class="muted">Orders met geplande productie. Inplannen doe je via het orderoverzicht.</p></div></div><section class="agenda-list">${items || '<div class="card">Nog geen orders ingepland.</div>'}</section>`);
}

function workOptionsHtml() {
  return shell('options', `<div class="top"><div><span class="eyebrow">Instellingen</span><h1>Opties</h1><p class="muted">Deze pagina is voorbereid voor medewerkers, printers, productietijden en verzendinstellingen.</p></div></div><section class="grid2"><div class="card"><h2>Productie</h2><p class="muted">Gebruik de orderplanning om start/eindtijd, printer en status vast te leggen.</p></div><div class="card"><h2>Verzending</h2><p class="muted">MyParcel-labels worden automatisch klaargezet na betaling wanneer het adres compleet is.</p></div></section>`);
}

function workStatsHtml(quotes) {
  const active = quotes.filter((q) => !q.archivedAt);
  const paid = active.filter((q) => q.paidAt || q.status === 'paid');
  const productionTotal = paid.reduce((sum, q) => sum + money(q.productionAmount || q.productionOfferAmount || q.productionPrice || 0), 0);
  return shell('stats', `<div class="top"><div><span class="eyebrow">Inzicht</span><h1>Statistieken</h1><p class="muted">Basisoverzicht voor productie en orders.</p></div></div><section class="cards"><div class="card stat"><span class="muted">Actieve orders</span><strong>${active.length}</strong></div><div class="card stat"><span class="muted">Betaald</span><strong>${paid.length}</strong></div><div class="card stat"><span class="muted">Ingepland</span><strong>${active.filter((q) => q.scheduledStartAt).length}</strong></div><div class="card stat"><span class="muted">Productie totaal</span><strong>€ ${fmt(productionTotal)}</strong></div></section>`);
}

export function registerMyParcelRoutes(app) {
  app.use('/api/mollie/webhook', (req, res, next) => {
    res.on('finish', () => {
      createMissingMyParcelLabels().catch((error) => console.warn('MyParcel automatische labels mislukt:', error.message));
    });
    next();
  });

  app.get('/admin', (req, res, next) => {
    if (req.query?.classic === '1') return next();
    return res.redirect('/admin/work');
  });

  app.get('/print', (_req, res) => res.redirect('/admin/work'));

  app.post('/print/login', (req, res) => res.redirect(307, '/admin/work/login'));
  app.post('/print/logout', (req, res) => res.redirect(307, '/admin/work/logout'));

  app.post('/admin/work/login', (req, res) => {
    const adminKey = process.env.ADMIN_KEY || '';
    const workerKey = process.env.PRINT_WORKER_KEY || '';
    const submittedKey = String(req.body?.workerKey || '');
    const valid = (workerKey && safeEquals(submittedKey, workerKey)) || (adminKey && safeEquals(submittedKey, adminKey));
    if (!valid) return res.status(401).send(loginHtml('Sleutel is onjuist.'));
    res.cookie?.('pr3nt_worker_key', submittedKey, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 1000 * 60 * 60 * 12 });
    return res.redirect('/admin/work');
  });

  app.post('/admin/work/logout', (req, res) => {
    res.clearCookie?.('pr3nt_worker_key');
    res.redirect('/admin/work');
  });

  app.get('/admin/work', requireWorker, async (_req, res) => {
    const quotes = await readQuotes();
    res.send(workOrdersHtml(quotes));
  });

  app.get('/admin/work/options', requireWorker, async (_req, res) => res.send(workOptionsHtml()));

  app.get('/admin/work/agenda', requireWorker, async (_req, res) => {
    const quotes = await readQuotes();
    res.send(workAgendaHtml(quotes));
  });

  app.get('/admin/work/stats', requireWorker, async (_req, res) => {
    const quotes = await readQuotes();
    res.send(workStatsHtml(quotes));
  });

  app.post('/admin/work/quotes/:id', requireWorker, async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (!quote) return res.status(404).send('Order niet gevonden');
    const allowed = new Set(['paid', 'print_queue', 'ready_to_ship', 'shipped']);
    if (allowed.has(req.body.status)) quote.status = req.body.status;
    quote.scheduledStartAt = clean(req.body.scheduledStartAt, 40);
    quote.scheduledEndAt = clean(req.body.scheduledEndAt, 40);
    quote.assignedPrinter = clean(req.body.assignedPrinter, 120);
    if (quote.scheduledStartAt || quote.scheduledEndAt) {
      quote.customerEtaText = `Je order staat ingepland voor productie${quote.scheduledStartAt ? ` vanaf ${quote.scheduledStartAt.replace('T', ' ')}` : ''}${quote.scheduledEndAt ? `. Verwachte afronding: ${quote.scheduledEndAt.replace('T', ' ')}` : ''}.`;
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
