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

function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function fmt(value) {
  return money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quoteLines(quote) {
  if (Array.isArray(quote.quoteLines) && quote.quoteLines.length) return quote.quoteLines;
  if (quote.quoteAmount) return [{ label: 'Prijsopgaaf', qty: 1, unit: quote.quoteAmount }];
  return [];
}

function quoteTotal(quote) {
  return quoteLines(quote).reduce((sum, line) => sum + money(line.qty || 1) * money(line.unit || 0), 0);
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

function priceBlockHtml(quote) {
  const total = quoteTotal(quote);
  if (!total) {
    return `<div class="price-card"><span class="eyebrow">Prijsopgaaf</span><h2>Prijs wordt berekend</h2><p class="muted">We bekijken je bestand en berekenen de prijs. Verzending is automatisch inbegrepen in je prijsopgaaf.</p></div>`;
  }
  if (quote.paymentUrl) {
    return `<div class="price-card"><span class="eyebrow">Betaling</span><h2>€ ${fmt(total)}</h2><p class="muted">Je prijsopgaaf is klaar. Verzending is inbegrepen.</p><a class="btn btn-primary" href="${e(quote.paymentUrl)}">Direct betalen</a></div>`;
  }
  if (quote.acceptedAt) {
    return `<div class="price-card"><span class="eyebrow">Betaling</span><h2>€ ${fmt(total)}</h2><p class="muted">Prijsopgaaf akkoord. We zetten de Shopify-betaallink handmatig klaar.</p></div>`;
  }
  return `<div class="price-card"><span class="eyebrow">Prijsopgaaf</span><h2>€ ${fmt(total)}</h2><p class="muted">Verzending is inbegrepen. Controleer je prijsopgaaf en ga akkoord, daarna zetten wij de betaallink klaar.</p><form method="post" action="/portal/${encodeURIComponent(quote.portalToken || quote.id)}/accept"><button class="btn btn-primary" type="submit">Prijsopgaaf akkoord</button></form></div>`;
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
    cards.push(`<div class="self-card"><span class="eyebrow">Na levering</span><strong>Beoordeling</strong><form method="post" action="/portal/${token}/review" class="self-form"><div class="star-rating"><label><input type="radio" name="rating" value="5" required><span>★</span></label><label><input type="radio" name="rating" value="4"><span>★</span></label><label><input type="radio" name="rating" value="3"><span>★</span></label><label><input type="radio" name="rating" value="2"><span>★</span></label><label><input type="radio" name="rating" value="1"><span>★</span></label></div><textarea name="review" placeholder="Korte review"></textarea><button class="btn btn-light" type="submit">Review versturen</button></form></div>`);
  }
  const modal = quoteAccepted(quote) ? '' : `<input class="modal-toggle" type="checkbox" id="self-upload-modal"><div class="modal"><div class="modal-card"><h2>Bestand vervangen</h2><form method="post" action="/portal/${token}/selfservice-upload" enctype="multipart/form-data" class="self-form"><input type="file" name="file" accept=".stl,.3mf,.obj,.step,.stp" multiple required><div class="material-switch"><label><input type="radio" name="material" value="PLA" checked><span>PLA</span></label><label><input type="radio" name="material" value="PETG"><span>PETG</span></label></div><input name="color" placeholder="Kleur"><textarea name="description" placeholder="Wat is er veranderd?"></textarea><div class="action-row"><button class="btn btn-primary" type="submit">Uploaden en vervangen</button><label class="btn btn-light" for="self-upload-modal">Annuleren</label></div></form></div></div>`;
  return `<section class="self-grid cards-${Math.min(cards.length, 4)}">${cards.join('')}</section>${modal}`;
}

function statusCardHtml(quote) {
  if (quote.status === 'print_queue') {
    return `<div class="status-inner-card pr3nt-final-status"><div class="mini-printer"><div class="mini-rail"></div><div class="mini-head"></div><div class="mini-bed"><div class="mini-object"></div></div></div><div><span>Je print wordt gemaakt</span><small>De printer is bezig met jouw model. Zodra hij klaar is, werken we de status bij.</small></div></div>`;
  }
  if (quote.status === 'shipped' && quote.trackingCode) {
    return `<div class="status-inner-card pr3nt-final-status"><div class="tracking-icon-small">🚚</div><div><span>Pakket volgen</span><small>Track & trace: ${e(quote.trackingCode)}</small></div></div>`;
  }
  if (quote.acceptedAt && !quote.paymentUrl) {
    return `<div class="status-inner-card pr3nt-final-status"><div class="tracking-icon-small">💳</div><div><span>Betaallink wordt klaargezet</span><small>Wij maken de Shopify-betaallink handmatig aan en plaatsen hem hier.</small></div></div>`;
  }
  return '';
}

function css() {
  return `<style id="pr3nt-final-portal-css">
    .portal-nav{display:flex!important;align-items:center!important}.project-switcher,.nav-pill{order:50!important}.account-icon{font-size:0!important;width:44px!important;height:44px!important;padding:0!important;display:inline-grid!important;place-items:center!important;order:9999!important;margin-left:auto!important}.account-icon::after{content:'👤';font-size:20px}
    .grid.one-card{grid-template-columns:1fr!important}.project-info-grid{display:grid!important;grid-template-columns:1.15fr .85fr!important;gap:18px!important;margin-bottom:18px!important}.project-info-grid .card{margin:0!important}.self-grid{display:grid!important;gap:14px!important;margin:28px 0 18px!important}.self-grid.cards-1{grid-template-columns:1fr!important}.self-grid.cards-2{grid-template-columns:repeat(2,minmax(0,1fr))!important}.self-grid.cards-3{grid-template-columns:repeat(3,minmax(0,1fr))!important}.self-grid.cards-4{grid-template-columns:repeat(4,minmax(0,1fr))!important}.self-card{background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:22px;padding:18px;box-shadow:0 12px 36px rgba(16,24,32,.06)}.self-card strong{display:block;font-size:18px;margin:8px 0}.self-form{display:grid;gap:10px}
    .price-card{background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:22px;padding:20px;box-shadow:0 12px 36px rgba(16,24,32,.06)}.price-card h2{font-size:34px;letter-spacing:-.04em;margin:8px 0 8px}.price-card form{margin-top:12px}.quote-table,.quote-table+ .action-row{display:none!important}.next-action form[action$="/accept"],.next-action a[href="#tracking"]{display:none!important}
    .status-inner-card{display:flex;gap:12px;align-items:center;margin-top:14px;padding:4px 0 0;border:0;border-radius:0;background:transparent;color:inherit}.status-inner-card span{display:block;font-weight:500;color:inherit}.status-inner-card small{display:block;color:rgba(255,255,255,.72);font-size:14px;line-height:1.45}.tracking-icon-small{width:40px;height:40px;border-radius:14px;background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center;flex:0 0 40px}.mini-printer{position:relative;width:98px;height:62px;flex:0 0 98px}.mini-rail{position:absolute;top:10px;left:4px;right:4px;height:5px;background:rgba(255,255,255,.7);border-radius:999px}.mini-head{position:absolute;top:2px;left:8px;width:24px;height:22px;background:#00d084;border-radius:7px;animation:pr3ntminihead 2s infinite alternate ease-in-out}.mini-bed{position:absolute;bottom:6px;left:8px;right:8px;height:7px;background:rgba(255,255,255,.7);border-radius:999px}.mini-object{position:absolute;bottom:7px;left:28px;width:32px;height:10px;background:#00d084;border-radius:8px 8px 3px 3px;animation:pr3ntminigrow 2s infinite alternate ease-in-out}@keyframes pr3ntminihead{from{left:8px}to{left:64px}}@keyframes pr3ntminigrow{from{height:6px}to{height:24px}}
    .material-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px}.material-switch input{display:none}.material-switch span{display:block;text-align:center;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:14px;font-weight:900;background:#f8fafc}.material-switch input:checked+span{background:#101820;color:#fff}.rating{display:none!important}.star-rating{display:flex;flex-direction:row-reverse;justify-content:flex-end;gap:3px}.star-rating input{display:none}.star-rating span{font-size:28px;color:#d0d5dd;cursor:pointer}.star-rating label:hover span,.star-rating label:hover~label span,.star-rating input:checked~span,.star-rating label:has(input:checked) span,.star-rating label:has(input:checked)~label span{color:#101820}.status-info-toggle{position:relative;display:inline-flex;margin-left:8px}.status-info-toggle summary{list-style:none;width:24px;height:24px;border-radius:999px;background:#eef2f1;display:grid;place-items:center;font-weight:900;cursor:pointer}.status-info-toggle summary::-webkit-details-marker{display:none}.status-popover{position:absolute;right:0;top:32px;z-index:40;width:min(360px,88vw);background:#fff;color:#101820;border:1px solid var(--line,#e5e7eb);border-radius:18px;padding:14px;box-shadow:0 18px 60px rgba(16,24,32,.14)}.status-popover .step{font-size:13px}.status-overview-hidden{display:none!important}
    @media(max-width:850px){.self-grid,.self-grid.cards-2,.self-grid.cards-3,.self-grid.cards-4,.project-info-grid{grid-template-columns:1fr!important}.account-icon{margin-left:0!important}}
  </style>`;
}

function script(quote) {
  const statusCard = JSON.stringify(statusCardHtml(quote));
  const selfService = JSON.stringify(selfServiceHtml(quote));
  const priceBlock = JSON.stringify(priceBlockHtml(quote));
  return `<script id="pr3nt-final-portal-js">
    (function(){
      var statusCard = ${statusCard};
      var selfService = ${selfService};
      var priceBlock = ${priceBlock};
      var nav = document.querySelector('.portal-nav');
      if (nav) {
        var account = nav.querySelector('a[href$="/account"]');
        if (account) { account.classList.add('account-icon'); account.setAttribute('aria-label', 'Account'); nav.appendChild(account); }
      }
      document.querySelectorAll('.printer-card').forEach(function(el){ el.remove(); });
      var trackingCard = document.querySelector('#tracking');
      if (trackingCard) {
        var parent = trackingCard.closest('section.grid');
        trackingCard.remove();
        if (parent) { parent.classList.add('one-card'); if (!parent.querySelector('.card')) parent.remove(); }
      }
      document.querySelectorAll('.pr3nt-final-status').forEach(function(el){ el.remove(); });
      if (statusCard) {
        var target = document.querySelector('.status-hero .next-action') || document.querySelector('.status-hero');
        if (target) target.insertAdjacentHTML('beforeend', statusCard);
      }
      document.querySelectorAll('a[href="#tracking"]').forEach(function(el){ el.remove(); });
      document.querySelectorAll('section.self-grid').forEach(function(el){ el.remove(); });
      var oldModal = document.querySelector('#self-upload-modal');
      if (oldModal) { var modal = oldModal.nextElementSibling; oldModal.remove(); if (modal && modal.classList.contains('modal')) modal.remove(); }
      var statusOverviewCard = Array.from(document.querySelectorAll('.card')).find(function(card){ return /Statusoverzicht/i.test(card.textContent || ''); });
      if (statusOverviewCard) {
        var html = statusOverviewCard.innerHTML;
        statusOverviewCard.classList.add('status-overview-hidden');
        var headline = document.querySelector('.status-hero h1');
        if (headline && !document.querySelector('.status-info-toggle')) headline.insertAdjacentHTML('afterend','<details class="status-info-toggle"><summary>i</summary><div class="status-popover">'+html+'</div></details>');
      }
      var relevantCard = Array.from(document.querySelectorAll('.card')).find(function(card){ return /^Relevante informatie/i.test((card.textContent || '').trim()); });
      if (relevantCard) {
        relevantCard.innerHTML = '<h2>Relevante informatie</h2>' + priceBlock;
        var projectCard = Array.from(document.querySelectorAll('.card')).find(function(card){ return /^Projectgegevens/i.test((card.textContent || '').trim()); });
        if (projectCard && !relevantCard.parentElement.classList.contains('project-info-grid')) {
          var wrap = document.createElement('section'); wrap.className = 'project-info-grid';
          relevantCard.parentNode.insertBefore(wrap, relevantCard); wrap.appendChild(relevantCard); wrap.appendChild(projectCard);
        }
      }
      var insertBefore = document.querySelector('.project-info-grid') || document.querySelector('section.grid.one-card') || document.querySelector('section.grid') || document.querySelector('.account-section');
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
        html = html.replace(/<style id="pr3nt-final-portal-css">[\s\S]*?<\/style>/g, '');
        html = html.replace(/<script id="pr3nt-final-portal-js">[\s\S]*?<\/script>/g, '');
        html = html.replace('</head>', `${css()}</head>`);
        html = html.replace('</body>', `${script(quote)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
