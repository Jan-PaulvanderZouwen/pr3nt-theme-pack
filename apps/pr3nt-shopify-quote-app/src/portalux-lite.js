import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

function esc(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function readQuotes() {
  try {
    const items = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}

async function writeQuotes(items) {
  await writeFile(quotesFilePath, JSON.stringify(items, null, 2));
}

function findQuote(items, key) {
  return items.find((item) => !item.archivedAt && (item.portalToken === key || item.id === key));
}

function quoteAccepted(quote) {
  return Boolean(quote.acceptedAt) || ['accepted', 'paid', 'print_queue', 'ready_to_ship', 'shipped', 'delivered'].includes(quote.status);
}

function css() {
  return `<style>
  .portal-nav{display:flex!important;align-items:center!important}.project-switcher,.nav-pill{order:50!important}.account-icon{font-size:0!important;width:44px!important;height:44px!important;padding:0!important;display:inline-grid!important;place-items:center!important;order:9999!important;margin-left:auto!important}.account-icon::after{content:'👤';font-size:20px}
  .grid.one-card{grid-template-columns:1fr!important}.self-grid{display:grid;gap:14px;margin-bottom:18px}.self-grid.cards-2{grid-template-columns:repeat(2,minmax(0,1fr))}.self-grid.cards-3{grid-template-columns:repeat(3,minmax(0,1fr))}.self-grid.cards-4{grid-template-columns:repeat(4,minmax(0,1fr))}.self-card{background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:22px;padding:18px;box-shadow:0 12px 36px rgba(16,24,32,.06)}.self-card strong{display:block;font-size:18px;margin:8px 0}.self-form{display:grid;gap:10px}
  .status-inner-card{display:flex;gap:12px;align-items:center;margin-top:14px;padding:14px;border:1px solid var(--line,#e5e7eb);border-radius:18px;background:#fff;color:#101820}.status-inner-card strong{display:block}.status-inner-card span{display:block;color:#667085}.tracking-icon-small{width:44px;height:44px;border-radius:14px;background:#101820;color:#fff;display:grid;place-items:center}.mini-printer{position:relative;width:98px;height:62px;flex:0 0 98px}.mini-rail{position:absolute;top:10px;left:4px;right:4px;height:5px;background:#101820;border-radius:999px}.mini-head{position:absolute;top:2px;left:8px;width:24px;height:22px;background:#00d084;border-radius:7px;animation:minihead 2s infinite alternate ease-in-out}.mini-bed{position:absolute;bottom:6px;left:8px;right:8px;height:7px;background:#101820;border-radius:999px}.mini-object{position:absolute;bottom:7px;left:28px;width:32px;height:10px;background:#00d084;border-radius:8px 8px 3px 3px;animation:minigrow 2s infinite alternate ease-in-out}@keyframes minihead{from{left:8px}to{left:64px}}@keyframes minigrow{from{height:6px}to{height:24px}}
  .material-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px}.material-switch input{display:none}.material-switch span{display:block;text-align:center;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:14px;font-weight:900;background:#f8fafc}.material-switch input:checked+span{background:#101820;color:#fff}.rating{display:flex;gap:8px;flex-wrap:wrap}.rating label{background:#f5f7f6;border:1px solid var(--line,#e5e7eb);border-radius:999px;padding:8px 12px;font-weight:850}
  @media(max-width:850px){.self-grid,.self-grid.cards-2,.self-grid.cards-3,.self-grid.cards-4{grid-template-columns:1fr}.account-icon{margin-left:0!important}}
  </style>`;
}

function accountIconRight(html) {
  let out = html.replace(/<a class="nav-link ([^"]*)" href="([^"]*)\/account">Account<\/a>/, '<a class="nav-link account-icon $1" href="$2/account" aria-label="Account">Account</a>');
  out = out.replace(/(<a class="nav-link account-icon[\s\S]*?<\/a>)(\s*<label class="project-switcher">[\s\S]*?<\/label>)/, '$2$1');
  out = out.replace(/(<a class="nav-link account-icon[\s\S]*?<\/a>)(\s*<span class="nav-pill">[\s\S]*?<\/span>)/, '$2$1');
  return out;
}

function statusCard(quote) {
  if (quote.status === 'print_queue') {
    return `<div class="status-inner-card"><div class="mini-printer"><div class="mini-rail"></div><div class="mini-head"></div><div class="mini-bed"><div class="mini-object"></div></div></div><div><strong>Je print wordt gemaakt</strong><span>De printer is bezig met jouw model. Zodra hij klaar is, werken we de status bij.</span></div></div>`;
  }
  if (quote.status === 'shipped' && quote.trackingCode) {
    return `<div class="status-inner-card"><div class="tracking-icon-small">🚚</div><div><strong>Pakket volgen</strong><span>Track & trace: ${esc(quote.trackingCode)}</span></div></div>`;
  }
  if (quote.acceptedAt && !quote.paymentUrl) {
    return `<div class="status-inner-card"><div class="tracking-icon-small">💳</div><div><strong>Betaallink wordt klaargezet</strong><span>Wij maken de Shopify betaallink handmatig aan en plaatsen hem hier.</span></div></div>`;
  }
  return '';
}

function selfService(quote) {
  const key = encodeURIComponent(quote.portalToken || quote.id);
  const cards = [];
  cards.push(`<div class="self-card"><span class="eyebrow">Snel regelen</span><strong>Herhaalbestelling</strong><p class="muted">Vraag dezelfde print opnieuw aan.</p><form method="post" action="/portal/${key}/reorder"><button class="btn btn-light" type="submit">Nog een keer printen</button></form></div>`);
  if (!quoteAccepted(quote)) cards.push(`<div class="self-card"><span class="eyebrow">Bestand</span><strong>Bestand vervangen</strong><p class="muted">Upload een nieuwe versie en kies PLA of PETG.</p><label class="btn btn-light" for="self-upload-modal">Bestand vervangen</label></div>`);
  cards.push(`<div class="self-card"><span class="eyebrow">Hulp nodig?</span><strong>Supportvraag</strong><p class="muted">Koppel een vraag aan dit project.</p><form method="post" action="/portal/${key}/support" class="self-form"><textarea name="message" placeholder="Waar kunnen we mee helpen?" required></textarea><button class="btn btn-light" type="submit">Vraag versturen</button></form></div>`);
  if (quote.status === 'delivered') cards.push(`<div class="self-card"><span class="eyebrow">Na levering</span><strong>Beoordeling</strong><form method="post" action="/portal/${key}/review" class="self-form"><div class="rating"><label><input type="radio" name="rating" value="5" required> 5</label><label><input type="radio" name="rating" value="4"> 4</label><label><input type="radio" name="rating" value="3"> 3</label></div><textarea name="review" placeholder="Korte review"></textarea><button class="btn btn-light" type="submit">Review versturen</button></form></div>`);
  const modal = quoteAccepted(quote) ? '' : `<input class="modal-toggle" type="checkbox" id="self-upload-modal"><div class="modal"><div class="modal-card"><h2>Bestand vervangen</h2><form method="post" action="/portal/${key}/selfservice-upload" enctype="multipart/form-data" class="self-form"><input type="file" name="file" accept=".stl,.3mf,.obj,.step,.stp" multiple required><div class="material-switch"><label><input type="radio" name="material" value="PLA" checked><span>PLA</span></label><label><input type="radio" name="material" value="PETG"><span>PETG</span></label></div><input name="color" placeholder="Kleur"><textarea name="description" placeholder="Wat is er veranderd?"></textarea><div class="action-row"><button class="btn btn-primary" type="submit">Uploaden en vervangen</button><label class="btn btn-light" for="self-upload-modal">Annuleren</label></div></form></div></div>`;
  return `<section class="self-grid cards-${Math.min(cards.length,4)}">${cards.join('')}</section>${modal}`;
}

function enhanceDashboard(html, quote) {
  let out = String(html).replace('</head>', `${css()}</head>`);
  out = accountIconRight(out);
  out = out.replace(/<div class="printer-card">[\s\S]*?<\/div><\/div>(?=<section|<div)/, '');
  out = out.replace(/<section class="self-grid[\s\S]*?<\/section>(?:<input class="modal-toggle"[\s\S]*?<\/div><\/div>)?/g, '');
  out = out.replace(/<section class="grid"><aside class="card"><h2>Relevante informatie<\/h2>([\s\S]*?)<\/aside><div class="card" id="tracking">[\s\S]*?<\/div><\/section>/, '<section class="grid one-card"><aside class="card"><h2>Relevante informatie</h2>$1</aside></section>');
  out = out.replace(/<div class="next-action">([\s\S]*?)<\/div><\/section>/, `<div class="next-action">$1${statusCard(quote)}</div></section>`);
  out = out.replace(/(<section class="grid one-card">|<section class="grid"><aside class="card"><h2>Relevante informatie<\/h2>)/, `${selfService(quote)}$1`);
  return out;
}

function enhanceAccount(html, quote) {
  let out = String(html).replace('</head>', `${css()}</head>`);
  out = accountIconRight(out);
  out = out.replace(/<section style="margin-top:18px"><section class="self-grid[\s\S]*?<\/section>(?:<input class="modal-toggle"[\s\S]*?<\/div><\/div>)?<\/section>/g, '');
  out = out.replace('</main>', `<section style="margin-top:18px">${selfService(quote)}</section></main>`);
  return out;
}

export function registerPortalUxLiteRoutes(app) {
  app.use('/portal/:key', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        const quote = findQuote(await readQuotes(), req.params.key);
        if (!quote) return originalSend(body);
        return originalSend(req.path.endsWith('/account') ? enhanceAccount(body, quote) : enhanceDashboard(body, quote));
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });

  app.post('/portal/:key/accept', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.key);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    quote.acceptedAt = quote.acceptedAt || new Date().toISOString();
    quote.status = 'accepted';
    quote.manualPaymentRequired = true;
    quote.paymentLinkError = '';
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    quote.messages.push({ from: 'klant', text: 'Ik ga akkoord met de offerte.', createdAt: quote.acceptedAt });
    quote.messages.push({ from: 'pr3nt', text: 'De offerte is akkoord. De Shopify betaallink wordt handmatig klaargezet.', createdAt: new Date().toISOString() });
    await writeQuotes(quotes);
    await notifyAdmin(quote, 'Offerte akkoord: Shopify betaallink handmatig aanmaken', 'De klant heeft akkoord gegeven. Maak in Shopify een Draft Order aan en plak de betaallink in het adminveld Shopify betaallink.');
    res.redirect(`/portal/${encodeURIComponent(req.params.key)}?saved=Offerte%20akkoord%20gegeven`);
  });
}
