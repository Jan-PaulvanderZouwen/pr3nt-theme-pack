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
  } catch (error) {
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

function workerLoginHtml(error = '') {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Printmedewerker · pr3nt</title><style>body{margin:0;background:#f6f6f7;font-family:Inter,system-ui,sans-serif;color:#101820}.card{max-width:420px;margin:80px auto;background:#fff;border:1px solid #e1e3e5;border-radius:18px;padding:24px}input{width:100%;padding:11px;border:1px solid #c9cccf;border-radius:10px}button{margin-top:12px;width:100%;border:0;border-radius:10px;background:#111827;color:#fff;padding:12px;font-weight:800}.error{background:#fff1f0;border:1px solid #fed3d1;color:#9f1f12;border-radius:12px;padding:10px;margin-bottom:12px}</style></head><body><section class="card"><h1>Printmedewerker</h1><p>Vul de medewerker-sleutel in om printorders te bekijken.</p>${error ? `<div class="error">${e(error)}</div>` : ''}<form method="post" action="/print/login"><input name="workerKey" type="password" autocomplete="current-password" required><button type="submit">Inloggen</button></form></section></body></html>`;
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
  return res.status(401).send(workerLoginHtml());
}

function statusLabel(status = '') {
  const labels = { paid: 'Betaald', print_queue: 'Print in queue', ready_to_ship: 'Klaar voor verzending', shipped: 'Verzonden', delivered: 'Geleverd' };
  return labels[status] || status || '-';
}

function fileLinks(quote) {
  const files = Array.isArray(quote.files) ? quote.files : [];
  if (!files.length && quote.fileUrl) return `<a href="${e(quote.fileUrl)}">${e(quote.fileOriginalName || 'Bestand downloaden')}</a>`;
  return files.map((file) => `<a href="${e(file.url)}">${e(file.originalName || file.storedName || 'Bestand')}</a>`).join('<br>') || '-';
}

function renderPrintDashboard(quotes) {
  const active = quotes.filter((q) => !q.archivedAt && ['paid', 'print_queue', 'ready_to_ship'].includes(q.status));
  const rows = active.map((quote) => `<tr><td><strong>${e(quote.name || '-')}</strong><br><span>${e(quote.id)}</span></td><td>${e(quote.material || '-')} · ${e(quote.color || '-')}<br>${quote.rush === 'Ja' ? '<b>Spoed</b>' : ''}</td><td>${e(statusLabel(quote.status))}</td><td>${fileLinks(quote)}</td><td>${quote.myParcelLabelUrl ? `<a href="${e(quote.myParcelLabelUrl)}" target="_blank">Label openen</a>` : e(quote.myParcelStatus === 'error' ? quote.myParcelError : quote.myParcelMessage || 'Nog geen label')}</td><td><form method="post" action="/print/quotes/${encodeURIComponent(quote.id)}"><select name="status"><option value="print_queue" ${quote.status === 'print_queue' ? 'selected' : ''}>Print in queue</option><option value="ready_to_ship" ${quote.status === 'ready_to_ship' ? 'selected' : ''}>Klaar voor verzending</option><option value="shipped" ${quote.status === 'shipped' ? 'selected' : ''}>Verzonden</option></select><button type="submit">Opslaan</button></form></td></tr>`).join('');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Printorders · pr3nt</title><style>body{margin:0;background:#f6f6f7;color:#202223;font-family:Inter,system-ui,sans-serif}.shell{max-width:1280px;margin:0 auto;padding:22px}.top{display:flex;justify-content:space-between;gap:16px;align-items:center}.card{background:#fff;border:1px solid #e1e3e5;border-radius:16px;padding:20px}table{width:100%;border-collapse:collapse}th,td{padding:12px;border-bottom:1px solid #e1e3e5;text-align:left;vertical-align:top}th{font-size:12px;color:#6d7175;text-transform:uppercase;letter-spacing:.06em}button,select{border:1px solid #c9cccf;border-radius:10px;padding:8px 10px;font:inherit}button{background:#111827;color:#fff;font-weight:800;cursor:pointer}a{color:#2c6ecb;text-decoration:none}span{color:#6d7175;font-size:12px}.logout{border:1px solid #c9cccf;border-radius:10px;background:#fff;color:#202223;padding:8px 10px;text-decoration:none;font-weight:800}@media(max-width:760px){table,thead,tbody,tr,td,th{display:block}thead{display:none}td{border-bottom:0}.card{padding:12px}.top{align-items:flex-start;flex-direction:column}}</style></head><body><main class="shell"><div class="top"><div><h1>Printorders</h1><p>Alle betaalde orders die geprint of verzonden moeten worden.</p></div><form method="post" action="/print/logout"><button class="logout" type="submit">Uitloggen</button></form></div><section class="card"><table><thead><tr><th>Klant</th><th>Print</th><th>Status</th><th>Bestanden</th><th>MyParcel</th><th>Actie</th></tr></thead><tbody>${rows || '<tr><td colspan="6">Geen actieve printorders.</td></tr>'}</tbody></table></section></main></body></html>`;
}

export function registerMyParcelRoutes(app) {
  app.use('/api/mollie/webhook', (req, res, next) => {
    res.on('finish', () => {
      createMissingMyParcelLabels().catch((error) => console.warn('MyParcel automatische labels mislukt:', error.message));
    });
    next();
  });

  app.post('/print/login', (req, res) => {
    const adminKey = process.env.ADMIN_KEY || '';
    const workerKey = process.env.PRINT_WORKER_KEY || '';
    const submittedKey = String(req.body?.workerKey || '');
    const valid = (workerKey && safeEquals(submittedKey, workerKey)) || (adminKey && safeEquals(submittedKey, adminKey));
    if (!valid) return res.status(401).send(workerLoginHtml('Sleutel is onjuist.'));
    res.cookie?.('pr3nt_worker_key', submittedKey, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 1000 * 60 * 60 * 12 });
    return res.redirect('/print');
  });

  app.post('/print/logout', (req, res) => {
    res.clearCookie?.('pr3nt_worker_key');
    res.redirect('/print');
  });

  app.get('/print', requireWorker, async (_req, res) => {
    const quotes = await readQuotes();
    res.send(renderPrintDashboard(quotes));
  });

  app.post('/print/quotes/:id', requireWorker, async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (!quote) return res.status(404).send('Order niet gevonden');
    const allowed = new Set(['print_queue', 'ready_to_ship', 'shipped']);
    if (allowed.has(req.body.status)) quote.status = req.body.status;
    quote.updatedAt = new Date().toISOString();
    await writeQuotes(quotes);
    res.redirect('/print');
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
