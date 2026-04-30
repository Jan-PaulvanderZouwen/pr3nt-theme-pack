import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const quotesFilePath = path.join(path.resolve(appRoot, process.env.DATA_DIR || 'data'), 'quotes.json');

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

function e(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function readQuotes() {
  try {
    const quotes = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    return Array.isArray(quotes) ? quotes : [];
  } catch {
    return [];
  }
}

function statusIndex(status) {
  const index = statuses.findIndex(([value]) => value === status);
  return index < 0 ? 0 : index;
}

function renderPage(title, body) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · pr3nt</title><style>
    :root{--bg:#f4f6f5;--card:#fff;--ink:#101820;--muted:#667085;--line:#e5e7eb;--green:#00d084;--dark:#111827}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,rgba(0,208,132,.16),transparent 34%),var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);line-height:1.5}.shell{max-width:1080px;margin:0 auto;padding:24px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.brand{font-weight:950;font-size:24px;letter-spacing:-.04em}.card{background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:26px;box-shadow:0 18px 60px rgba(16,24,32,.08);padding:24px}.hero{display:grid;grid-template-columns:1.2fr .8fr;gap:18px;margin-bottom:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}.muted{color:var(--muted)}h1{font-size:clamp(30px,5vw,52px);line-height:1;margin:10px 0 14px;letter-spacing:-.05em}h2{margin:0 0 12px}.badge{display:inline-flex;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:850;background:#e9fbf2;color:#087443}.button{display:inline-flex;border-radius:999px;padding:13px 18px;background:var(--dark);color:white;text-decoration:none;font-weight:850}.button.green{background:var(--green);color:#072016}.button.ghost{background:#eef2f1;color:var(--ink)}.kv{display:grid;grid-template-columns:150px 1fr;gap:8px 12px}.kv div{padding:9px 0;border-bottom:1px solid var(--line)}.progress{height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:18px 0}.bar{height:100%;background:var(--green);width:var(--progress)}.timeline{display:grid;gap:10px}.step{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center}.dot{width:34px;height:34px;border-radius:999px;background:#e5e7eb;display:grid;place-items:center;font-weight:900}.step.done .dot,.step.active .dot{background:var(--green);color:#052013}.message{padding:14px;border-radius:18px;background:#f8fafc;border:1px solid var(--line);margin-bottom:10px}.price{font-size:38px;font-weight:950;letter-spacing:-.04em}@media(max-width:780px){.hero,.grid{grid-template-columns:1fr}.shell{padding:14px}.kv{grid-template-columns:1fr}}
  </style></head><body><main class="shell"><div class="top"><div class="brand">pr3nt.nl</div><span class="badge">Klantportaal</span></div>${body}</main></body></html>`;
}

function renderPortal(quote) {
  const current = statusIndex(quote.status);
  const label = statuses[current][1];
  const progress = `${Math.max(8, ((current + 1) / statuses.length) * 100)}%`;
  const timeline = statuses.map(([value, text], index) => `<div class="step ${index < current ? 'done' : index === current ? 'active' : ''}"><div class="dot">${index + 1}</div><div><strong>${e(text)}</strong>${value === quote.status ? '<br><span class="muted">Huidige status</span>' : ''}</div></div>`).join('');
  const messages = Array.isArray(quote.messages) && quote.messages.length ? quote.messages.map((m) => `<div class="message"><strong>${e(m.from || 'pr3nt')}</strong><br>${e(m.text || '')}</div>`).join('') : '<p class="muted">Nog geen berichten.</p>';
  return renderPage(`Aanvraag ${quote.id}`, `<section class="hero"><div class="card"><span class="badge">${e(label)}</span><h1>Je 3D-print aanvraag</h1><p class="muted">Hier volg je je offerte, printstatus en verzending.</p><div class="progress" style="--progress:${progress}"><div class="bar"></div></div><div class="kv"><div class="muted">Aanvraag</div><div>${e(quote.id)}</div><div class="muted">Materiaal</div><div>${e(quote.material)}</div><div class="muted">Kleur</div><div>${e(quote.color)}</div><div class="muted">Spoed</div><div>${e(quote.rush || 'Nee')}</div></div></div><aside class="card"><h2>Offerte</h2>${quote.quoteAmount ? `<div class="price">€ ${e(quote.quoteAmount)}</div><p class="muted">Je betaalt pas nadat je akkoord bent.</p>${quote.paymentUrl ? `<a class="button green" href="${e(quote.paymentUrl)}">Offerte betalen</a>` : '<span class="button ghost">Betaallink volgt</span>'}` : '<p class="muted">De offerte wordt nog aangemaakt.</p>'}</aside></section><section class="grid"><div class="card"><h2>Status</h2><div class="timeline">${timeline}</div></div><div class="card"><h2>Berichten</h2>${messages}<h2 style="margin-top:22px">Track & trace</h2>${quote.trackingCode ? `<p><strong>${e(quote.trackingCode)}</strong></p>` : '<p class="muted">Nog geen track & trace beschikbaar.</p>'}</div></section>`);
}

export function registerPortalRoutes(app) {
  app.get('/portal/:token', async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.portalToken === req.params.token || item.id === req.params.token);
    if (!quote) return res.status(404).send(renderPage('Niet gevonden', '<section class="card"><h1>Aanvraag niet gevonden</h1><p class="muted">Controleer de portaal-link.</p></section>'));
    res.send(renderPortal(quote));
  });
}
