import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

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

function findQuote(quotes, token) {
  return quotes.find((quote) => !quote.archivedAt && (quote.portalToken === token || quote.id === token));
}

function quoteAccepted(quote) {
  return Boolean(quote.acceptedAt) || ['accepted', 'paid', 'print_queue', 'ready_to_ship', 'shipped', 'delivered'].includes(quote.status);
}

function selfServiceHtml(quote) {
  const token = encodeURIComponent(quote.portalToken || quote.id);
  const cards = [];
  cards.push(`<div class="self-card"><span class="eyebrow">Snel regelen</span><strong>Herhaalbestelling</strong><p class="muted">Vraag dezelfde print opnieuw aan.</p><form method="post" action="/portal/${token}/reorder"><button class="btn btn-light" type="submit">Nog een keer printen</button></form></div>`);
  if (!quoteAccepted(quote)) {
    cards.push(`<div class="self-card"><span class="eyebrow">Bestand</span><strong>Bestand vervangen</strong><p class="muted">Upload een nieuwe versie en kies PLA of PETG.</p><label class="btn btn-light" for="self-upload-modal">Bestand vervangen</label></div>`);
  }
  cards.push(`<div class="self-card"><span class="eyebrow">Hulp nodig?</span><strong>Supportvraag</strong><p class="muted">Koppel een vraag aan dit project.</p><form method="post" action="/portal/${token}/support" class="self-form"><textarea name="message" placeholder="Waar kunnen we mee helpen?" required></textarea><button class="btn btn-light" type="submit">Vraag versturen</button></form></div>`);
  if (quote.status === 'delivered') {
    cards.push(`<div class="self-card"><span class="eyebrow">Na levering</span><strong>Beoordeling</strong><form method="post" action="/portal/${token}/review" class="self-form"><div class="rating"><label><input type="radio" name="rating" value="5" required> 5</label><label><input type="radio" name="rating" value="4"> 4</label><label><input type="radio" name="rating" value="3"> 3</label></div><textarea name="review" placeholder="Korte review"></textarea><button class="btn btn-light" type="submit">Review versturen</button></form></div>`);
  }
  const modal = quoteAccepted(quote) ? '' : `<input class="modal-toggle" type="checkbox" id="self-upload-modal"><div class="modal"><div class="modal-card"><h2>Bestand vervangen</h2><form method="post" action="/portal/${token}/selfservice-upload" enctype="multipart/form-data" class="self-form"><input type="file" name="file" accept=".stl,.3mf,.obj,.step,.stp" multiple required><div class="material-switch"><label><input type="radio" name="material" value="PLA" checked><span>PLA</span></label><label><input type="radio" name="material" value="PETG"><span>PETG</span></label></div><input name="color" placeholder="Kleur"><textarea name="description" placeholder="Wat is er veranderd?"></textarea><div class="action-row"><button class="btn btn-primary" type="submit">Uploaden en vervangen</button><label class="btn btn-light" for="self-upload-modal">Annuleren</label></div></form></div></div>`;
  return `<section class="self-grid cards-${Math.min(cards.length, 4)}">${cards.join('')}</section>${modal}`;
}

function statusCardHtml(quote) {
  if (quote.status === 'print_queue') {
    return `<div class="status-inner-card pr3nt-final-status"><div class="mini-printer"><div class="mini-rail"></div><div class="mini-head"></div><div class="mini-bed"><div class="mini-object"></div></div></div><div><strong>Je print wordt gemaakt</strong><span>De printer is bezig met jouw model. Zodra hij klaar is, werken we de status bij.</span></div></div>`;
  }
  if (quote.status === 'shipped' && quote.trackingCode) {
    return `<div class="status-inner-card pr3nt-final-status"><div class="tracking-icon-small">🚚</div><div><strong>Pakket volgen</strong><span>Track & trace: ${e(quote.trackingCode)}</span></div></div>`;
  }
  if (quote.acceptedAt && !quote.paymentUrl) {
    return `<div class="status-inner-card pr3nt-final-status"><div class="tracking-icon-small">💳</div><div><strong>Betaallink wordt klaargezet</strong><span>Wij maken de Shopify betaallink handmatig aan en plaatsen hem hier.</span></div></div>`;
  }
  return '';
}

function css() {
  return `<style id="pr3nt-final-portal-css">
    .portal-nav{display:flex!important;align-items:center!important}.project-switcher,.nav-pill{order:50!important}.account-icon{font-size:0!important;width:44px!important;height:44px!important;padding:0!important;display:inline-grid!important;place-items:center!important;order:9999!important;margin-left:auto!important}.account-icon::after{content:'👤';font-size:20px}
    .grid.one-card{grid-template-columns:1fr!important}.self-grid{display:grid!important;gap:14px!important;margin-bottom:18px!important}.self-grid.cards-1{grid-template-columns:1fr!important}.self-grid.cards-2{grid-template-columns:repeat(2,minmax(0,1fr))!important}.self-grid.cards-3{grid-template-columns:repeat(3,minmax(0,1fr))!important}.self-grid.cards-4{grid-template-columns:repeat(4,minmax(0,1fr))!important}.self-card{background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:22px;padding:18px;box-shadow:0 12px 36px rgba(16,24,32,.06)}.self-card strong{display:block;font-size:18px;margin:8px 0}.self-form{display:grid;gap:10px}
    .status-inner-card{display:flex;gap:12px;align-items:center;margin-top:14px;padding:14px;border:1px solid var(--line,#e5e7eb);border-radius:18px;background:#fff;color:#101820}.status-inner-card strong{display:block}.status-inner-card span{display:block;color:#667085}.tracking-icon-small{width:44px;height:44px;border-radius:14px;background:#101820;color:#fff;display:grid;place-items:center}.mini-printer{position:relative;width:98px;height:62px;flex:0 0 98px}.mini-rail{position:absolute;top:10px;left:4px;right:4px;height:5px;background:#101820;border-radius:999px}.mini-head{position:absolute;top:2px;left:8px;width:24px;height:22px;background:#00d084;border-radius:7px;animation:pr3ntminihead 2s infinite alternate ease-in-out}.mini-bed{position:absolute;bottom:6px;left:8px;right:8px;height:7px;background:#101820;border-radius:999px}.mini-object{position:absolute;bottom:7px;left:28px;width:32px;height:10px;background:#00d084;border-radius:8px 8px 3px 3px;animation:pr3ntminigrow 2s infinite alternate ease-in-out}@keyframes pr3ntminihead{from{left:8px}to{left:64px}}@keyframes pr3ntminigrow{from{height:6px}to{height:24px}}
    .material-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px}.material-switch input{display:none}.material-switch span{display:block;text-align:center;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:14px;font-weight:900;background:#f8fafc}.material-switch input:checked+span{background:#101820;color:#fff}.rating{display:flex;gap:8px;flex-wrap:wrap}.rating label{background:#f5f7f6;border:1px solid var(--line,#e5e7eb);border-radius:999px;padding:8px 12px;font-weight:850}
    @media(max-width:850px){.self-grid,.self-grid.cards-2,.self-grid.cards-3,.self-grid.cards-4{grid-template-columns:1fr!important}.account-icon{margin-left:0!important}}
  </style>`;
}

function script(quote) {
  const statusCard = JSON.stringify(statusCardHtml(quote));
  const selfService = JSON.stringify(selfServiceHtml(quote));
  return `<script id="pr3nt-final-portal-js">
    (function(){
      var statusCard = ${statusCard};
      var selfService = ${selfService};
      var nav = document.querySelector('.portal-nav');
      if (nav) {
        var account = nav.querySelector('a[href$="/account"]');
        if (account) {
          account.classList.add('account-icon');
          account.setAttribute('aria-label', 'Account');
          nav.appendChild(account);
        }
      }
      document.querySelectorAll('.printer-card').forEach(function(el){ el.remove(); });
      var trackingCard = document.querySelector('#tracking');
      if (trackingCard) {
        var parent = trackingCard.closest('section.grid');
        trackingCard.remove();
        if (parent) {
          parent.classList.add('one-card');
          if (!parent.querySelector('.card')) parent.remove();
        }
      }
      document.querySelectorAll('.pr3nt-final-status').forEach(function(el){ el.remove(); });
      if (statusCard) {
        var target = document.querySelector('.status-hero .next-action') || document.querySelector('.status-hero');
        if (target) target.insertAdjacentHTML('beforeend', statusCard);
      }
      document.querySelectorAll('section.self-grid').forEach(function(el){ el.remove(); });
      var oldModal = document.querySelector('#self-upload-modal');
      if (oldModal) {
        var modal = oldModal.nextElementSibling;
        oldModal.remove();
        if (modal && modal.classList.contains('modal')) modal.remove();
      }
      var insertBefore = document.querySelector('section.grid.one-card') || document.querySelector('section.grid') || document.querySelector('.account-section');
      if (insertBefore && selfService) insertBefore.insertAdjacentHTML('beforebegin', selfService);
    })();
  </script>`;
}

export function registerPortalDomFixRoutes(app) {
  app.use('/portal/:token', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        const quote = findQuote(await readQuotes(), req.params.token);
        if (!quote || typeof body !== 'string') return originalSend(body);
        let html = body;
        if (!html.includes('pr3nt-final-portal-css')) html = html.replace('</head>', `${css()}</head>`);
        if (!html.includes('pr3nt-final-portal-js')) html = html.replace('</body>', `${script(quote)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
