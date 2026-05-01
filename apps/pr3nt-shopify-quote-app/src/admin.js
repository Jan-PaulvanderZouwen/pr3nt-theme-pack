import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';

const statuses = [
  ['received', 'Order ontvangen'],
  ['creating_quote', 'Offerte wordt aangemaakt'],
  ['quote_sent', 'Offerte verstuurd'],
  ['accepted', 'Offerte akkoord'],
  ['paid', 'Betaling voltooid'],
  ['print_queue', 'Print in queue'],
  ['ready_to_ship', 'Klaar voor verzending'],
  ['shipped', 'Verzonden'],
  ['delivered', 'Geleverd'],
];

const quoteTemplate = [
  ['Fillament', '€0,12 per gram', '', '0,12'],
  ['Print-uren', '€0,35 per uur', '', '0,35'],
  ['Verwerkingskosten', '', '1', '7,50'],
  ['Verzendkosten', 'incl. track & trace', '1', '6,55'],
  ['Verpakkingskosten', '', '1', '3,50'],
];

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function clean(value = '', max = 3000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function fmt(value) {
  return money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function normalizeQuoteLines(body) {
  const labels = Array.isArray(body.lineLabel) ? body.lineLabel : body.lineLabel ? [body.lineLabel] : [];
  const qtys = Array.isArray(body.lineQty) ? body.lineQty : body.lineQty ? [body.lineQty] : [];
  const units = Array.isArray(body.lineUnit) ? body.lineUnit : body.lineUnit ? [body.lineUnit] : [];
  const descriptions = Array.isArray(body.lineDescription) ? body.lineDescription : body.lineDescription ? [body.lineDescription] : [];
  return labels.map((label, index) => ({
    label: clean(label, 140),
    description: clean(descriptions[index] || '', 300),
    qty: clean(qtys[index] || '1', 30) || '1',
    unit: clean(units[index] || '0', 30) || '0',
  })).filter((line) => line.label || line.description || money(line.unit) > 0);
}

function quoteLines(quote) {
  if (Array.isArray(quote.quoteLines) && quote.quoteLines.length) return quote.quoteLines;
  if (quote.quoteAmount) return [{ label: 'Offertebedrag', description: '', qty: '1', unit: quote.quoteAmount }];
  return [];
}

function quoteTotal(quote) {
  return quoteLines(quote).reduce((sum, line) => sum + money(line.qty || 1) * money(line.unit || 0), 0);
}

function statusLabel(status) {
  return statuses.find(([value]) => value === status)?.[1] || 'Order ontvangen';
}

function statusOptions(selected) {
  return statuses.map(([value, label]) => `<option value="${value}" ${selected === value ? 'selected' : ''}>${label}</option>`).join('');
}

function ensurePortalToken(quote) {
  if (!quote.portalToken) quote.portalToken = randomUUID();
  return quote.portalToken;
}

function portalUrl(quote) {
  return `${baseUrl}/portal/${encodeURIComponent(ensurePortalToken(quote))}`;
}

function applyAutomaticStatus(quote) {
  if (['print_queue', 'ready_to_ship', 'shipped', 'delivered'].includes(quote.status)) return;
  if (quote.trackingCode) {
    quote.status = 'shipped';
    return;
  }
  if (quote.paidAt || quote.status === 'paid') {
    quote.status = 'paid';
    return;
  }
  if (quote.acceptedAt || quote.status === 'accepted') {
    quote.status = 'accepted';
    return;
  }
  if (quoteTotal(quote) > 0) {
    quote.status = 'quote_sent';
    return;
  }
  quote.status = quote.status || 'received';
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

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.transip.email',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function quoteEmailHtml(quote) {
  const url = portalUrl(quote);
  const rows = quoteLines(quote).map((line) => {
    const lineTotal = money(line.qty || 1) * money(line.unit || 0);
    return `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb"><strong>${escapeHtml(line.label || 'Regel')}</strong>${line.description ? `<br><span style="color:#667085">${escapeHtml(line.description)}</span>` : ''}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${escapeHtml(line.qty || 1)}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">€ ${fmt(line.unit)}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right"><strong>€ ${fmt(lineTotal)}</strong></td></tr>`;
  }).join('');
  return `<div style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,sans-serif;color:#101820"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden"><div style="padding:28px;background:#101820;color:#fff"><div style="font-size:24px;font-weight:900">pr3nt.nl</div><h1 style="margin:20px 0 8px;font-size:32px;line-height:1.05">Je offerte staat klaar</h1><p style="margin:0;color:#d7dde0">Bekijk de offerte, geef akkoord en betaal daarna veilig via je portaal.</p></div><div style="padding:28px"><p>Hoi ${escapeHtml(quote.name || '')},</p><p>We hebben je 3D-print aanvraag bekeken. Je offerte staat klaar in je klantportaal.</p><table style="width:100%;border-collapse:collapse;margin:18px 0"><thead><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Omschrijving</th><th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb">Aantal</th><th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb">Prijs</th><th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb">Totaal</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3" style="padding:12px;text-align:right;font-weight:900">Totaal</td><td style="padding:12px;text-align:right;font-weight:900">€ ${fmt(quoteTotal(quote))}</td></tr></tfoot></table><p><a href="${url}" style="display:inline-block;background:#00d084;color:#082115;text-decoration:none;padding:14px 20px;border-radius:999px;font-weight:800">Offerte bekijken en accepteren</a></p><p style="font-size:14px;color:#667085;line-height:1.5">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${url}</span></p></div></div></div></div>`;
}

async function notifyCustomerQuoteSent(quote) {
  if (!quote.email || quote.quoteSentAt || quoteTotal(quote) <= 0) return;
  const mailer = transporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await mailer.sendMail({
    from,
    to: quote.email,
    subject: 'Je offerte van pr3nt.nl staat klaar',
    html: quoteEmailHtml(quote),
  });
  quote.quoteSentAt = new Date().toISOString();
  quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
  quote.messages.push({ from: 'pr3nt', text: 'De offerte is verstuurd naar je e-mailadres.', createdAt: quote.quoteSentAt });
}

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY || '';
  if (!adminKey) return next();
  const key = req.query.key || req.get('x-admin-key') || req.cookies?.pr3nt_admin_key;
  if (key === adminKey) {
    res.cookie?.('pr3nt_admin_key', adminKey, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 1000 * 60 * 60 * 12 });
    return next();
  }
  res.status(401).send(renderPage('Inloggen', `<section class="card login-card"><h1>pr3nt Dashboard</h1><p>Vul je admin sleutel in om aanvragen te beheren.</p><form method="get" action="/admin" class="stack"><input name="key" type="password" required><button class="button green" type="submit">Inloggen</button></form></section>`));
}

function renderPage(title, body) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · pr3nt Dashboard</title><style>
    :root{--bg:#f6f6f7;--card:#fff;--ink:#202223;--muted:#6d7175;--line:#e1e3e5;--green:#00d084;--dark:#111827;--radius:16px}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}a{color:#2c6ecb;text-decoration:none}.shell{max-width:1320px;margin:0 auto;padding:22px}.topbar{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}.brand{font-weight:950;font-size:24px;letter-spacing:-.04em;color:#101820}.muted{color:var(--muted)}.card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 1px 0 rgba(0,0,0,.04),0 10px 28px rgba(0,0,0,.05);padding:20px}.login-card{max-width:430px;margin:80px auto}.stack{display:grid;gap:12px}.three{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}.compact-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.info-card{border:1px solid var(--line);border-radius:14px;padding:14px;background:#fafafa}.info-card small{display:block;color:var(--muted);font-weight:800;text-transform:uppercase;letter-spacing:.05em}.info-card strong{display:block;margin-top:4px}input,select,textarea{width:100%;border:1px solid #c9cccf;border-radius:10px;padding:10px 12px;font:inherit;background:#fff}textarea{min-height:100px}label span{display:block;font-weight:750;margin-bottom:5px}.button{border:0;border-radius:10px;background:var(--dark);color:#fff;padding:10px 14px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:42px}.button.green{background:var(--green);color:#082115}.button.ghost{background:#fff;color:var(--ink);border:1px solid #c9cccf}.button.icon{width:38px;min-height:38px;padding:0;border-radius:999px}.button.subtle{background:#f1f2f3;color:#202223}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.stat strong{display:block;font-size:24px}.toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:13px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.badge{display:inline-flex;border-radius:999px;background:#f1f2f3;padding:5px 10px;font-size:12px;font-weight:800}.badge.green{background:#e9fbf2;color:#087443}.rush{background:#fff4e5;color:#8a4b00}.detail-grid{display:grid;grid-template-columns:1fr 390px;gap:18px}.file-link{display:block;margin:6px 0}.notice{padding:12px 14px;border-radius:14px;background:#ecfdf3;border:1px solid #bbf7d0;color:#166534;margin-bottom:14px}.message{padding:12px;border-radius:12px;background:#f6f6f7;border:1px solid var(--line)}.quote-tools{display:flex;justify-content:space-between;gap:12px;align-items:center;margin:14px 0}.quote-lines{display:grid;gap:10px}.quote-line{display:grid;grid-template-columns:1.15fr 1.25fr .55fr .65fr 40px;gap:8px;align-items:end;padding:12px;border:1px solid var(--line);border-radius:14px;background:#fafafa}.quote-line.is-empty{display:none}.total{display:flex;justify-content:space-between;align-items:center;padding-top:14px;border-top:1px solid var(--line);font-weight:950;font-size:20px}.total small{display:block;font-weight:600;font-size:12px;color:var(--muted)}details>summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:12px;align-items:center}details>summary::-webkit-details-marker{display:none}.summary-title{font-size:18px;font-weight:900}.edit-pill{border:1px solid var(--line);border-radius:999px;padding:6px 10px;background:#fff;font-weight:800}@media(max-width:850px){.grid,.detail-grid,.three,.quote-line,.compact-grid{grid-template-columns:1fr}.shell{padding:14px}table{font-size:14px}.button.icon{width:100%}}
  </style></head><body><main class="shell"><div class="topbar"><a class="brand" href="/admin">pr3nt Client Dashboard</a><div class="toolbar"><a class="button ghost" href="/admin">← Klantenoverzicht</a></div></div>${body}</main><script>
    const quoteTemplate=${JSON.stringify(quoteTemplate)};
    function parseMoney(value){var n=Number(String(value||'0').replace(',','.'));return Number.isFinite(n)?n:0}
    function formatMoney(value){return parseMoney(value).toLocaleString('nl-NL',{minimumFractionDigits:2,maximumFractionDigits:2})}
    function refreshQuoteEditor(){var total=0;document.querySelectorAll('[data-quote-line]:not(.is-empty)').forEach(function(row){var qty=row.querySelector('[name="lineQty"]');var unit=row.querySelector('[name="lineUnit"]');total+=parseMoney(qty&&qty.value?qty.value:1)*parseMoney(unit&&unit.value?unit.value:0)});var target=document.querySelector('[data-quote-total]');if(target)target.textContent='€ '+formatMoney(total)}
    function showNextLine(){var hidden=document.querySelector('[data-quote-line].is-empty');if(hidden){hidden.classList.remove('is-empty');return hidden}return null}
    document.addEventListener('input',function(e){if(e.target.closest('[data-quote-line]'))refreshQuoteEditor()});
    document.addEventListener('click',function(e){var add=e.target.closest('[data-add-line]');if(add){var row=showNextLine();if(row){var first=row.querySelector('input');if(first)first.focus()}refreshQuoteEditor()}var template=e.target.closest('[data-template-lines]');if(template){document.querySelectorAll('[data-quote-line]').forEach(function(row){row.querySelectorAll('input').forEach(function(i){i.value=''});row.classList.add('is-empty')});quoteTemplate.forEach(function(values){var row=showNextLine();if(!row)return;row.querySelector('[name="lineLabel"]').value=values[0];row.querySelector('[name="lineDescription"]').value=values[1];row.querySelector('[name="lineQty"]').value=values[2];row.querySelector('[name="lineUnit"]').value=values[3]});refreshQuoteEditor()}var remove=e.target.closest('[data-remove-line]');if(remove){var row=remove.closest('[data-quote-line]');if(row){row.querySelectorAll('input').forEach(function(i){i.value='' });row.classList.add('is-empty')}refreshQuoteEditor()}});
    refreshQuoteEditor();
  </script></body></html>`;
}

function quoteFilesHtml(quote) {
  if (Array.isArray(quote.files) && quote.files.length) return quote.files.map((file) => `<a class="file-link" href="${escapeHtml(file.url)}">${escapeHtml(file.originalName || file.storedName || 'Bestand downloaden')}</a>`).join('');
  if (quote.fileUrl) return `<a class="file-link" href="${escapeHtml(quote.fileUrl)}">${escapeHtml(quote.fileOriginalName || 'Bestand downloaden')}</a>`;
  return '<span class="muted">Geen bestand gevonden</span>';
}

function renderMessages(quote) {
  const messages = Array.isArray(quote.messages) ? quote.messages : [];
  if (!messages.length) return '<p class="muted">Nog geen berichten.</p>';
  return messages.map((m) => `<div class="message"><strong>${escapeHtml(m.from === 'klant' ? 'Klant' : 'pr3nt')}</strong><br>${escapeHtml(m.text || '')}<br><small class="muted">${escapeHtml(new Date(m.createdAt || Date.now()).toLocaleString('nl-NL'))}</small></div>`).join('<br>');
}

function renderQuoteLineInputs(quote) {
  const lines = quoteLines(quote);
  const visibleLines = lines.length ? lines : [{ label: '', description: '', qty: '', unit: '' }];
  const allLines = [...visibleLines, ...Array.from({ length: 12 - visibleLines.length }, () => ({ label: '', description: '', qty: '', unit: '', hidden: true }))];
  return `<div class="quote-tools"><p class="muted" style="margin:0">Start met één regel, of laad de standaard pr3nt-offerte in.</p><div class="toolbar"><button class="button ghost" type="button" data-template-lines>Offerte-template laden</button><button class="button ghost" type="button" data-add-line>+ Regel toevoegen</button></div></div><div class="quote-lines">${allLines.map((line) => {
    const empty = line.hidden;
    return `<div class="quote-line ${empty ? 'is-empty' : ''}" data-quote-line><label><span>Regel</span><input name="lineLabel" form="quote-form" value="${escapeHtml(line.label || '')}"></label><label><span>Omschrijving</span><input name="lineDescription" form="quote-form" value="${escapeHtml(line.description || '')}"></label><label><span>Aantal</span><input name="lineQty" form="quote-form" value="${escapeHtml(line.qty || '')}"></label><label><span>Prijs</span><input name="lineUnit" form="quote-form" value="${escapeHtml(line.unit || '')}"></label><button class="button ghost icon" type="button" data-remove-line aria-label="Regel verwijderen">−</button></div>`;
  }).join('')}</div>`;
}

function renderAdminList(quotes) {
  const total = quotes.length;
  const open = quotes.filter((q) => !['delivered', 'shipped'].includes(q.status)).length;
  const quoteSent = quotes.filter((q) => q.status === 'quote_sent').length;
  const paid = quotes.filter((q) => q.status === 'paid').length;
  const rows = quotes.map((quote) => `<tr><td><strong>${escapeHtml(quote.name)}</strong><br><span class="muted">${escapeHtml(quote.email)}</span></td><td>${escapeHtml(quote.material)} · ${escapeHtml(quote.color)}${quote.rush === 'Ja' ? '<br><span class="badge rush">Spoed</span>' : ''}</td><td><span class="badge ${quote.status === 'accepted' || quote.status === 'paid' ? 'green' : ''}">${escapeHtml(statusLabel(quote.status))}</span></td><td>${quoteTotal(quote) ? `€ ${fmt(quoteTotal(quote))}` : '-'}</td><td>${escapeHtml(new Date(quote.createdAt || Date.now()).toLocaleDateString('nl-NL'))}</td><td><a class="button ghost" href="/admin/quotes/${encodeURIComponent(quote.id)}">Openen</a></td></tr>`).join('');
  return renderPage('Aanvragen', `<div class="grid"><div class="card stat"><span class="muted">Totaal</span><strong>${total}</strong></div><div class="card stat"><span class="muted">Actief</span><strong>${open}</strong></div><div class="card stat"><span class="muted">Offerte verstuurd</span><strong>${quoteSent}</strong></div><div class="card stat"><span class="muted">Betaald</span><strong>${paid}</strong></div></div><section class="card"><div class="toolbar"><div><h1 style="margin:0">Klantenoverzicht</h1><p class="muted" style="margin:4px 0 0">Alle offerte-aanvragen en actieve projecten.</p></div></div><div class="table-wrap"><table><thead><tr><th>Klant</th><th>Print</th><th>Status</th><th>Offerte</th><th>Datum</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">Nog geen aanvragen gevonden.</td></tr>'}</tbody></table></div></section>`);
}

function renderQuoteDetail(quote, saved = false) {
  ensurePortalToken(quote);
  applyAutomaticStatus(quote);
  const pUrl = portalUrl(quote);
  return renderPage(`Aanvraag ${quote.id}`, `${saved ? '<div class="notice">Aanvraag bijgewerkt.</div>' : ''}<div class="toolbar"><div><h1 style="margin:0">Project van ${escapeHtml(quote.name || 'klant')}</h1><p class="muted" style="margin:4px 0 0">${escapeHtml(quote.id)} · <span class="badge">${escapeHtml(statusLabel(quote.status))}</span></p></div><div class="toolbar"><a class="button ghost" href="/admin">← Overzicht</a><a class="button ghost" href="${escapeHtml(pUrl)}" target="_blank">Klantportaal</a></div></div><div class="detail-grid"><section class="stack"><div class="card"><div class="compact-grid"><div class="info-card"><small>Klant</small><strong>${escapeHtml(quote.name || '-')}</strong><span class="muted">${escapeHtml(quote.email || '')}</span></div><div class="info-card"><small>Telefoon</small><strong>${escapeHtml(quote.phone || '-')}</strong></div><div class="info-card"><small>Print</small><strong>${escapeHtml(quote.material || '-')} · ${escapeHtml(quote.color || '-')}</strong><span class="muted">Spoed: ${escapeHtml(quote.rush || 'Nee')}</span></div><div class="info-card"><small>Totaal</small><strong>€ ${fmt(quoteTotal(quote))}</strong></div></div></div><details class="card"><summary><span class="summary-title">Algemene gegevens</span><span class="edit-pill">✎ Bewerken</span></summary><div class="three" style="margin-top:16px"><label><span>Naam</span><input name="name" form="quote-form" value="${escapeHtml(quote.name || '')}"></label><label><span>E-mail</span><input name="email" form="quote-form" value="${escapeHtml(quote.email || '')}"></label><label><span>Telefoon</span><input name="phone" form="quote-form" value="${escapeHtml(quote.phone || '')}"></label><label><span>Materiaal</span><input name="material" form="quote-form" value="${escapeHtml(quote.material || '')}"></label><label><span>Kleur</span><input name="color" form="quote-form" value="${escapeHtml(quote.color || '')}"></label><label><span>Spoed</span><select name="rush" form="quote-form"><option value="Nee" ${quote.rush !== 'Ja' ? 'selected' : ''}>Nee</option><option value="Ja" ${quote.rush === 'Ja' ? 'selected' : ''}>Ja</option></select></label></div><label style="display:block;margin-top:12px"><span>Opmerking klant</span><textarea name="note" form="quote-form">${escapeHtml(quote.note || '')}</textarea></label></details><div class="card"><h2>Offerte-regels</h2>${renderQuoteLineInputs(quote)}<div class="total"><span><small>Automatisch berekend</small>Totaal offerte</span><span data-quote-total>€ ${fmt(quoteTotal(quote))}</span></div></div><div class="card"><h2>Bestand(en)</h2>${quoteFilesHtml(quote)}</div><div class="card"><h2>Berichten</h2>${renderMessages(quote)}<label style="display:block;margin-top:12px"><span>Nieuw bericht aan klant</span><textarea name="newMessage" form="quote-form"></textarea></label></div></section><aside class="card"><form id="quote-form" class="stack" method="post" action="/admin/quotes/${encodeURIComponent(quote.id)}"><h2 style="margin-top:0">Beheer</h2><p class="muted">Bij opslaan van een offerte wordt de klant automatisch gemaild. Na akkoord ziet de klant de betaalknop.</p><label><span>Status overschrijven</span><select name="status">${statusOptions(quote.status)}</select></label><label><span>Shopify betaallink</span><input name="paymentUrl" value="${escapeHtml(quote.paymentUrl || '')}"></label><label><span>Track & trace</span><input name="trackingCode" value="${escapeHtml(quote.trackingCode || '')}"></label><label><span>Shopify klant-ID</span><input name="customerId" value="${escapeHtml(quote.customerId || '')}"></label><label><span>Interne notitie</span><textarea name="internalNote">${escapeHtml(quote.internalNote || '')}</textarea></label><button class="button green" type="submit">Opslaan en klant informeren</button><a class="button ghost" href="${escapeHtml(pUrl)}" target="_blank">Klantportaal openen</a><input readonly value="${escapeHtml(pUrl)}"><a class="button ghost" href="/admin">Terug naar overzicht</a></form></aside></div>`);
}

export function registerAdminRoutes(app) {
  app.get('/admin', requireAdmin, async (_req, res) => {
    const quotes = await readQuotes();
    res.send(renderAdminList(quotes));
  });

  app.get('/admin/quotes/:id', requireAdmin, async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id);
    if (!quote) return res.status(404).send(renderPage('Niet gevonden', '<section class="card"><h1>Aanvraag niet gevonden</h1><a class="button" href="/admin">Terug</a></section>'));
    ensurePortalToken(quote);
    applyAutomaticStatus(quote);
    await writeQuotes(quotes);
    res.send(renderQuoteDetail(quote, req.query.saved === '1'));
  });

  app.post('/admin/quotes/:id', requireAdmin, async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    ensurePortalToken(quote);
    quote.name = clean(req.body.name, 200);
    quote.email = clean(req.body.email, 200);
    quote.phone = clean(req.body.phone, 80);
    quote.customerId = clean(req.body.customerId, 200);
    quote.material = clean(req.body.material, 50);
    quote.color = clean(req.body.color, 120);
    quote.rush = req.body.rush === 'Ja' ? 'Ja' : 'Nee';
    quote.status = statuses.some(([value]) => value === req.body.status) ? req.body.status : quote.status;
    quote.note = clean(req.body.note, 3000);
    quote.quoteLines = normalizeQuoteLines(req.body);
    quote.quoteAmount = fmt(quoteTotal(quote));
    quote.paymentUrl = clean(req.body.paymentUrl, 1000);
    quote.trackingCode = clean(req.body.trackingCode, 200);
    quote.internalNote = clean(req.body.internalNote, 3000);
    const newMessage = clean(req.body.newMessage, 2000);
    if (newMessage) {
      quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
      quote.messages.push({ from: 'pr3nt', text: newMessage, createdAt: new Date().toISOString() });
    }
    applyAutomaticStatus(quote);
    if (quote.status === 'quote_sent') await notifyCustomerQuoteSent(quote);
    quote.updatedAt = new Date().toISOString();
    await writeQuotes(quotes);
    res.redirect(`/admin/quotes/${encodeURIComponent(quote.id)}?saved=1`);
  });
}
