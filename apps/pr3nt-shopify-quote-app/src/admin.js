import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

const statuses = [
  ['received', 'Order ontvangen'],
  ['creating_quote', 'Offerte wordt aangemaakt'],
  ['quote_sent', 'Offerte verstuurd'],
  ['paid', 'Betaling voltooid'],
  ['print_queue', 'Print in queue'],
  ['ready_to_ship', 'Klaar voor verzending'],
  ['shipped', 'Verzonden'],
  ['delivered', 'Geleverd'],
];

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function statusLabel(status) {
  return statuses.find(([value]) => value === status)?.[1] || 'Order ontvangen';
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

function requireAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY || '';
  if (!adminKey) return next();

  const key = req.query.key || req.get('x-admin-key') || req.cookies?.pr3nt_admin_key;
  if (key === adminKey) {
    res.cookie?.('pr3nt_admin_key', adminKey, {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 1000 * 60 * 60 * 12,
    });
    return next();
  }

  res.status(401).send(renderPage('Inloggen', `
    <section class="card login-card">
      <h1>pr3nt Dashboard</h1>
      <p>Vul je admin sleutel in om aanvragen te beheren.</p>
      <form method="get" action="/admin" class="stack">
        <input name="key" type="password" placeholder="Admin sleutel" required>
        <button class="button" type="submit">Inloggen</button>
      </form>
    </section>
  `));
}

function renderPage(title, body) {
  return `<!doctype html>
<html lang="nl">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(title)} · pr3nt Dashboard</title>
  <style>
    :root{--bg:#f4f6f5;--card:#fff;--ink:#101820;--muted:#667085;--line:#e5e7eb;--green:#00d084;--dark:#111827;--radius:22px}
    *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;line-height:1.5}
    a{color:inherit}.shell{max-width:1180px;margin:0 auto;padding:22px}.topbar{display:flex;justify-content:space-between;gap:16px;align-items:center;margin-bottom:20px}.brand{font-weight:900;font-size:22px}.muted{color:var(--muted)}
    .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);box-shadow:0 14px 40px rgba(16,24,32,.07);padding:20px}.login-card{max-width:430px;margin:80px auto}.stack{display:grid;gap:12px}
    input,select,textarea{width:100%;border:1px solid var(--line);border-radius:14px;padding:12px 14px;font:inherit;background:#fff}textarea{min-height:110px}.button{border:0;border-radius:999px;background:var(--dark);color:#fff;padding:12px 18px;font-weight:800;cursor:pointer;text-decoration:none;display:inline-flex;align-items:center;justify-content:center;gap:8px}.button.green{background:var(--green);color:#082115}.button.ghost{background:#eef2f1;color:var(--ink)}
    .grid{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:18px}.stat{padding:16px;border-radius:18px;background:#fff;border:1px solid var(--line)}.stat strong{display:block;font-size:24px}.toolbar{display:flex;gap:10px;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap}
    table{width:100%;border-collapse:collapse}th,td{text-align:left;padding:13px;border-bottom:1px solid var(--line);vertical-align:top}th{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}.badge{display:inline-flex;border-radius:999px;background:#eef2f1;padding:5px 10px;font-size:12px;font-weight:800}.rush{background:#fff4e5;color:#8a4b00}.actions{display:flex;gap:8px;flex-wrap:wrap}.detail-grid{display:grid;grid-template-columns:1fr 360px;gap:18px}.kv{display:grid;grid-template-columns:160px 1fr;gap:8px 14px}.kv div{padding:8px 0;border-bottom:1px solid var(--line)}.file-link{display:block;margin:6px 0;color:#0066cc}.notice{padding:12px 14px;border-radius:14px;background:#ecfdf3;border:1px solid #bbf7d0;color:#166534;margin-bottom:14px}
    @media(max-width:800px){.grid{grid-template-columns:1fr 1fr}.detail-grid{grid-template-columns:1fr}.shell{padding:14px}table{font-size:14px}th:nth-child(4),td:nth-child(4){display:none}.kv{grid-template-columns:1fr}}
  </style>
</head>
<body><main class="shell"><div class="topbar"><a class="brand" href="/admin">pr3nt Dashboard</a><span class="muted">Offertes & prints beheren</span></div>${body}</main></body>
</html>`;
}

function quoteFilesHtml(quote) {
  if (Array.isArray(quote.files) && quote.files.length) {
    return quote.files.map((file) => `<a class="file-link" href="${escapeHtml(file.url)}">${escapeHtml(file.originalName || file.storedName || 'Bestand downloaden')}</a>`).join('');
  }
  if (quote.fileUrl) return `<a class="file-link" href="${escapeHtml(quote.fileUrl)}">${escapeHtml(quote.fileOriginalName || 'Bestand downloaden')}</a>`;
  return '<span class="muted">Geen bestand gevonden</span>';
}

function renderAdminList(quotes) {
  const total = quotes.length;
  const open = quotes.filter((q) => !['delivered', 'shipped'].includes(q.status)).length;
  const quoteSent = quotes.filter((q) => q.status === 'quote_sent').length;
  const paid = quotes.filter((q) => q.status === 'paid').length;

  const rows = quotes.map((quote) => `
    <tr>
      <td><strong>${escapeHtml(quote.name)}</strong><br><span class="muted">${escapeHtml(quote.email)}</span></td>
      <td>${escapeHtml(quote.material)} · ${escapeHtml(quote.color)}${quote.rush === 'Ja' ? '<br><span class="badge rush">Spoed</span>' : ''}</td>
      <td><span class="badge">${escapeHtml(statusLabel(quote.status))}</span></td>
      <td>${escapeHtml(new Date(quote.createdAt || Date.now()).toLocaleDateString('nl-NL'))}</td>
      <td><div class="actions"><a class="button ghost" href="/admin/quotes/${encodeURIComponent(quote.id)}">Openen</a></div></td>
    </tr>
  `).join('');

  return renderPage('Aanvragen', `
    <div class="grid">
      <div class="stat"><span class="muted">Totaal</span><strong>${total}</strong></div>
      <div class="stat"><span class="muted">Actief</span><strong>${open}</strong></div>
      <div class="stat"><span class="muted">Offerte verstuurd</span><strong>${quoteSent}</strong></div>
      <div class="stat"><span class="muted">Betaald</span><strong>${paid}</strong></div>
    </div>
    <section class="card">
      <div class="toolbar"><div><h1 style="margin:0">Offerte-aanvragen</h1><p class="muted" style="margin:4px 0 0">Beheer aanvragen, bestanden en statussen.</p></div></div>
      <table>
        <thead><tr><th>Klant</th><th>Print</th><th>Status</th><th>Datum</th><th></th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" class="muted">Nog geen aanvragen gevonden.</td></tr>'}</tbody>
      </table>
    </section>
  `);
}

function renderQuoteDetail(quote, saved = false) {
  const options = statuses.map(([value, label]) => `<option value="${value}" ${quote.status === value ? 'selected' : ''}>${label}</option>`).join('');

  return renderPage(`Aanvraag ${quote.id}`, `
    ${saved ? '<div class="notice">Aanvraag bijgewerkt.</div>' : ''}
    <div class="detail-grid">
      <section class="card">
        <h1 style="margin-top:0">${escapeHtml(quote.name)}</h1>
        <div class="kv">
          <div class="muted">E-mail</div><div>${escapeHtml(quote.email)}</div>
          <div class="muted">Telefoon</div><div>${escapeHtml(quote.phone)}</div>
          <div class="muted">Materiaal</div><div>${escapeHtml(quote.material)}</div>
          <div class="muted">Kleur</div><div>${escapeHtml(quote.color)}</div>
          <div class="muted">Spoed</div><div>${escapeHtml(quote.rush || 'Nee')}</div>
          <div class="muted">Bestand(en)</div><div>${quoteFilesHtml(quote)}</div>
          <div class="muted">Opmerking</div><div>${escapeHtml(quote.note || '-')}</div>
          <div class="muted">Aangemaakt</div><div>${escapeHtml(new Date(quote.createdAt || Date.now()).toLocaleString('nl-NL'))}</div>
        </div>
      </section>
      <aside class="card">
        <h2 style="margin-top:0">Beheer</h2>
        <form class="stack" method="post" action="/admin/quotes/${encodeURIComponent(quote.id)}">
          <label>Status<select name="status">${options}</select></label>
          <label>Offertebedrag<input name="quoteAmount" type="text" value="${escapeHtml(quote.quoteAmount || '')}" placeholder="Bijv. 24,95"></label>
          <label>Track & trace<input name="trackingCode" type="text" value="${escapeHtml(quote.trackingCode || '')}" placeholder="Bijv. 3S..."></label>
          <label>Interne notitie<textarea name="internalNote" placeholder="Alleen zichtbaar voor jou">${escapeHtml(quote.internalNote || '')}</textarea></label>
          <button class="button green" type="submit">Opslaan</button>
          <a class="button ghost" href="/admin">Terug naar overzicht</a>
        </form>
      </aside>
    </div>
  `);
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
    res.send(renderQuoteDetail(quote, req.query.saved === '1'));
  });

  app.post('/admin/quotes/:id', requireAdmin, async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');

    quote.status = statuses.some(([value]) => value === req.body.status) ? req.body.status : quote.status;
    quote.quoteAmount = escapeHtml(req.body.quoteAmount || '').trim();
    quote.trackingCode = escapeHtml(req.body.trackingCode || '').trim();
    quote.internalNote = escapeHtml(req.body.internalNote || '').trim();
    quote.updatedAt = new Date().toISOString();

    await writeQuotes(quotes);
    res.redirect(`/admin/quotes/${encodeURIComponent(quote.id)}?saved=1`);
  });
}
