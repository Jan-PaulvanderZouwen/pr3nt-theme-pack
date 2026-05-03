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
  const alreadyFinished = ['paid', 'print_queue', 'ready_to_ship', 'shipped', 'delivered'].includes(quote.status);
  if (!total) return `<div class="price-card"><span class="eyebrow">Volgende stap</span><h2>Binnen 1 werkdag je prijsopgaaf</h2><p class="muted">Je aanvraag is binnen. We bekijken je 3D-bestand en sturen je een duidelijke prijsopgaaf inclusief verzending.</p></div>`;
  if (quote.paymentUrl && !alreadyFinished) return `<div class="price-card"><span class="eyebrow">Klaar om te betalen</span><h2>€ ${fmt(total)}</h2><p class="muted">Je prijsopgaaf staat klaar. Het bedrag is inclusief verzending, zodat je direct weet waar je aan toe bent.</p><a class="btn btn-primary" href="${e(quote.paymentUrl)}">Veilig betalen</a></div>`;
  if (quote.paymentUrl && alreadyFinished) return `<div class="price-card"><span class="eyebrow">Betaald</span><h2>€ ${fmt(total)}</h2><p class="muted">Je betaling is ontvangen. We houden je hier op de hoogte van de volgende stap.</p></div>`;
  if (quote.acceptedAt) return `<div class="price-card"><span class="eyebrow">Akkoord ontvangen</span><h2>€ ${fmt(total)}</h2><p class="muted">Bedankt voor je akkoord. We zetten de betaallink klaar en laten je weten zodra je kunt betalen.</p></div>`;
  return `<div class="price-card"><span class="eyebrow">Prijsopgaaf klaar</span><h2>€ ${fmt(total)}</h2><p class="muted">Dit bedrag is inclusief verzending. Geef akkoord, dan zetten wij de betaallink voor je klaar.</p><form method="post" action="/portal/${encodeURIComponent(quote.portalToken || quote.id)}/accept"><button class="btn btn-primary" type="submit">Akkoord met prijsopgaaf</button></form></div>`;
}

function selfServiceHtml(quote) {
  const token = encodeURIComponent(quote.portalToken || quote.id);
  const cards = [];
  cards.push(`<div class="self-card"><span class="eyebrow">Snel opnieuw</span><strong>Nog een keer printen</strong><p class="muted">Wil je dezelfde print opnieuw bestellen? Start in één klik een nieuwe aanvraag.</p><form method="post" action="/portal/${token}/reorder"><button class="btn btn-light" type="submit">Start nieuwe aanvraag</button></form></div>`);
  if (!quoteAccepted(quote)) cards.push(`<div class="self-card"><span class="eyebrow">Nieuw bestand</span><strong>Bestand vervangen</strong><p class="muted">Heb je je model aangepast? Upload hier de nieuwste versie, dan werken we daarmee verder.</p><label class="btn btn-light" for="self-upload-modal">Nieuw bestand uploaden</label></div>`);
  cards.push(`<div class="self-card"><span class="eyebrow">Vraag of toelichting</span><strong>Bericht sturen</strong><p class="muted">Heb je een vraag of extra informatie? Stuur je bericht hier, dan blijft alles netjes bij dit project.</p><form method="post" action="/portal/${token}/support" class="self-form"><textarea name="message" placeholder="Typ hier je vraag of toelichting" required></textarea><button class="btn btn-light" type="submit">Bericht versturen</button></form></div>`);
  if (quote.status === 'delivered') cards.push(`<div class="self-card review-card"><span class="eyebrow">Na levering</span><strong>Hoe is je print bevallen?</strong><p class="muted">Met je beoordeling help je ons én toekomstige klanten.</p><form method="post" action="/portal/${token}/review" class="self-form"><div class="star-rating"><label><input type="radio" name="rating" value="5" required><span>★</span></label><label><input type="radio" name="rating" value="4"><span>★</span></label><label><input type="radio" name="rating" value="3"><span>★</span></label><label><input type="radio" name="rating" value="2"><span>★</span></label><label><input type="radio" name="rating" value="1"><span>★</span></label></div><textarea name="review" placeholder="Schrijf eventueel een korte toelichting"></textarea><button class="btn btn-light" type="submit">Beoordeling versturen</button></form></div>`);
  const modal = quoteAccepted(quote) ? '' : `<input class="modal-toggle" type="checkbox" id="self-upload-modal"><div class="modal"><div class="modal-card"><h2>Bestand vervangen</h2><p class="muted">Upload de nieuwste versie van je model. Wij gebruiken vanaf nu dit bestand voor je prijsopgaaf.</p><form method="post" action="/portal/${token}/selfservice-upload" enctype="multipart/form-data" class="self-form"><input type="file" name="file" accept=".stl,.3mf,.obj,.step,.stp" multiple required><div class="material-switch"><label><input type="radio" name="material" value="PLA" checked><span>PLA</span></label><label><input type="radio" name="material" value="PETG"><span>PETG</span></label></div><input name="color" placeholder="Gewenste kleur"><textarea name="description" placeholder="Wat is er veranderd aan je bestand?"></textarea><div class="action-row"><button class="btn btn-primary" type="submit">Uploaden en vervangen</button><label class="btn btn-light" for="self-upload-modal">Annuleren</label></div></form></div></div>`;
  return `<section class="self-grid pr3nt-managed-selfservice cards-${Math.min(cards.length, 4)}">${cards.join('')}</section>${modal}`;
}

function statusCardHtml(quote) {
  if (quote.status === 'print_queue') return `<div class="status-inner-card pr3nt-final-status"><div class="mini-printer"><div class="mini-rail"></div><div class="mini-head"></div><div class="mini-bed"><div class="mini-object"></div></div></div><div><span>Je print is in productie</span><small>We zijn met je model aan de slag. Zodra je print klaar is, zie je hier de volgende stap.</small></div></div>`;
  if (quote.status === 'shipped' && quote.trackingCode) return `<div class="status-inner-card pr3nt-final-status"><div class="tracking-icon-small">🚚</div><div><span>Je pakket is onderweg</span><small>Track & trace: ${e(quote.trackingCode)}</small></div></div>`;
  if (quote.acceptedAt && !quote.paymentUrl) return `<div class="status-inner-card pr3nt-final-status"><div class="tracking-icon-small">💳</div><div><span>Betaallink wordt klaargezet</span><small>Je prijsopgaaf is akkoord. We plaatsen de betaallink hier zodra hij klaarstaat.</small></div></div>`;
  return '';
}

function css() {
  return `<style id="pr3nt-final-portal-css">
    :root{--pr3nt-ink:#101820;--pr3nt-muted:#667085;--pr3nt-line:#e5e7eb;--pr3nt-soft:#f6f8f7;--pr3nt-green:#00d084;--pr3nt-radius:24px;--pr3nt-shadow:0 18px 60px rgba(16,24,32,.08);--pr3nt-gap:20px}
    body{font-feature-settings:"kern" 1,"liga" 1;text-rendering:optimizeLegibility}.portal-shell,.portal-main,main{letter-spacing:-.01em}
    .portal-header{display:flex!important;align-items:center!important;justify-content:space-between!important;gap:16px!important}.portal-nav{display:flex!important;align-items:center!important;justify-content:flex-end!important;gap:8px!important;flex-wrap:nowrap!important;min-height:68px!important;padding:10px 14px!important;border-radius:28px!important;box-shadow:0 14px 44px rgba(16,24,32,.07)!important}.portal-nav .nav-link:not(.account-icon),.portal-nav .nav-pill{height:46px!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;padding:0 18px!important;border-radius:999px!important;font-size:14px!important;font-weight:900!important;letter-spacing:-.02em!important;white-space:nowrap!important;text-decoration:none!important}.portal-nav .nav-link.active{background:var(--pr3nt-ink)!important;color:#fff!important}.portal-nav .account-icon,.portal-nav a.account-icon,.portal-nav .nav-link.account-icon{font-size:0!important;line-height:0!important;width:46px!important;height:46px!important;min-width:46px!important;max-width:46px!important;flex:0 0 46px!important;padding:0!important;margin-left:4px!important;border-radius:999px!important;display:inline-grid!important;place-items:center!important;order:9999!important;background:#eef3f2!important;color:var(--pr3nt-ink)!important;text-decoration:none!important;overflow:hidden!important}.portal-nav .account-icon::after,.portal-nav a.account-icon::after,.portal-nav .nav-link.account-icon::after{content:'👤'!important;font-size:20px!important;line-height:1!important;display:block!important}.portal-nav .project-switcher{order:50!important;display:inline-flex!important;align-items:center!important;gap:10px!important;width:auto!important;max-width:min(520px,48vw)!important;height:46px!important;padding:0 10px 0 16px!important;border-radius:999px!important;background:#eef3f2!important;border:1px solid rgba(229,231,235,.9)!important;box-shadow:none!important;overflow:hidden!important;white-space:nowrap!important}.portal-nav .project-switcher span{flex:0 0 auto!important;font-size:12px!important;font-weight:950!important;letter-spacing:.11em!important;text-transform:uppercase!important;color:#667085!important;line-height:1!important}.portal-nav .project-switcher select{appearance:auto!important;-webkit-appearance:auto!important;width:auto!important;min-width:220px!important;max-width:360px!important;height:42px!important;border:0!important;background:transparent!important;box-shadow:none!important;padding:0 28px 0 0!important;margin:0!important;border-radius:0!important;font-size:16px!important;font-weight:900!important;letter-spacing:-.035em!important;color:var(--pr3nt-ink)!important;line-height:42px!important}.portal-nav .project-switcher select:focus{outline:none!important;border:0!important;box-shadow:none!important}
    .status-hero{position:relative!important;border-radius:30px!important;padding:34px 28px 24px!important;margin-top:12px!important;box-shadow:var(--pr3nt-shadow)!important;overflow:visible!important}.status-hero h1{font-size:clamp(36px,4.6vw,58px)!important;line-height:.96!important;letter-spacing:-.065em!important;margin:8px 0 16px!important;max-width:680px!important}.status-hero p{font-size:16px!important;line-height:1.55!important;max-width:680px!important;color:var(--pr3nt-ink)!important;margin:0 0 18px!important}
    .status-hero .eyebrow,.eyebrow{font-size:12px!important;line-height:1!important;font-weight:950!important;letter-spacing:.12em!important;text-transform:uppercase!important;color:#008a55!important}.status-hero .progress,.progress{height:10px!important;gap:6px!important;margin:16px 0!important}.status-hero .chips,.chips{display:flex!important;gap:8px!important;flex-wrap:wrap!important;margin-top:16px!important}.status-hero .chip,.chip{border-radius:999px!important;padding:9px 13px!important;font-size:13px!important;font-weight:850!important;background:#f3f6f5!important;border:1px solid var(--pr3nt-line)!important;color:var(--pr3nt-ink)!important}
    .status-hero .next-action{border-radius:26px!important;padding:28px!important;display:flex!important;align-items:center!important;justify-content:center!important;min-height:200px!important}.status-hero .next-action h2,.status-hero .next-action strong{font-size:22px!important;line-height:1.15!important;letter-spacing:-.035em!important}
    .grid{gap:var(--pr3nt-gap)!important;column-gap:var(--pr3nt-gap)!important;row-gap:var(--pr3nt-gap)!important}.grid.one-card{grid-template-columns:1fr!important}.project-info-grid,.self-grid.pr3nt-managed-selfservice,.preview-messages-grid{grid-column:1 / -1!important;width:100%!important;max-width:none!important;gap:var(--pr3nt-gap)!important;column-gap:var(--pr3nt-gap)!important;row-gap:var(--pr3nt-gap)!important}.project-info-grid{display:grid!important;grid-template-columns:minmax(0,1.18fr) minmax(340px,.82fr)!important;align-items:stretch!important;margin:var(--pr3nt-gap) 0 0!important}.project-info-grid .card,.self-card,.price-card,.preview-messages-grid .card{border-radius:26px!important;border:1px solid var(--pr3nt-line)!important;box-shadow:0 18px 56px rgba(16,24,32,.07)!important;background:#fff!important}.project-info-grid .card{margin:0!important;min-height:0!important;height:100%!important;display:flex!important;flex-direction:column!important;padding:24px!important}.project-info-grid .card h2,.preview-messages-grid .card h2{font-size:28px!important;line-height:1.08!important;letter-spacing:-.055em!important;margin:0 0 18px!important}
    .price-card{padding:20px!important;min-height:168px!important;height:100%!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important}.price-card h2{font-size:clamp(30px,3.2vw,44px)!important;line-height:1!important;letter-spacing:-.065em!important;margin:10px 0 12px!important}.price-card p,.self-card p,.project-info-grid td,.project-info-grid .muted,.preview-messages-grid .muted{font-size:15px!important;line-height:1.55!important;color:var(--pr3nt-muted)!important}.price-card form{margin-top:12px}.quote-table,.quote-table+ .action-row{display:none!important}.next-action form[action$="/accept"],.next-action a[href="#tracking"]{display:none!important}
    .project-info-grid table{width:100%!important;border-collapse:collapse!important}.project-info-grid td{padding:13px 0!important;border-bottom:1px solid var(--pr3nt-line)!important}.project-info-grid td:first-child{font-weight:650!important;color:var(--pr3nt-muted)!important;width:38%!important}.project-info-grid td:last-child{font-weight:750!important;color:var(--pr3nt-ink)!important;word-break:break-word!important}
    .self-grid.pr3nt-managed-selfservice{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))!important;margin:var(--pr3nt-gap) 0!important;align-items:stretch!important}.self-card{padding:22px!important;min-height:190px!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important}.self-card strong{display:block!important;font-size:20px!important;line-height:1.18!important;letter-spacing:-.035em!important;margin:10px 0 10px!important}.self-card form{margin-top:auto!important}.self-form{display:grid!important;gap:12px!important}.self-form textarea{min-height:86px!important;resize:vertical!important}
    .btn,button,.btn-light,.btn-primary,label.btn{border-radius:999px!important;min-height:46px!important;padding:12px 18px!important;font-size:14px!important;font-weight:900!important;letter-spacing:-.015em!important;border:0!important;box-shadow:none!important;display:inline-flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;transition:transform .15s ease,background .15s ease,opacity .15s ease!important}.btn:hover,button:hover,label.btn:hover{transform:translateY(-1px)!important}.btn-primary{background:var(--pr3nt-green)!important;color:#082115!important}.btn-light,.self-card button{background:#eef3f2!important;color:var(--pr3nt-ink)!important}
    textarea,input,select{border-radius:16px!important;border:1px solid var(--pr3nt-line)!important;background:#fff!important;padding:13px 14px!important;font-size:15px!important;line-height:1.4!important;color:var(--pr3nt-ink)!important}textarea:focus,input:focus,select:focus{outline:2px solid rgba(0,208,132,.22)!important;border-color:rgba(0,208,132,.6)!important}
    .preview-messages-grid{display:grid!important;grid-template-columns:minmax(0,1.18fr) minmax(340px,.82fr)!important;align-items:stretch!important;margin:var(--pr3nt-gap) 0 0!important}.preview-messages-grid .card{padding:24px!important;height:100%!important}.preview-messages-grid canvas,.preview-messages-grid model-viewer,.preview-messages-grid .viewer,.preview-messages-grid .model-viewer{border-radius:22px!important;background:#f7f8f8!important}.preview-messages-grid .model-card,.preview-messages-grid .preview-card{min-height:420px!important}
    .status-inner-card{display:flex!important;gap:14px!important;align-items:center!important;margin-top:16px!important;padding:4px 0 0!important;border:0!important;border-radius:0!important;background:transparent!important;color:inherit!important}.status-inner-card span{display:block!important;font-size:15px!important;font-weight:650!important;color:inherit!important}.status-inner-card small{display:block!important;color:rgba(255,255,255,.72)!important;font-size:14px!important;line-height:1.5!important}.tracking-icon-small{width:40px!important;height:40px!important;border-radius:14px!important;background:rgba(255,255,255,.12)!important;color:#fff!important;display:grid!important;place-items:center!important;flex:0 0 40px!important}
    .mini-printer{position:relative!important;width:98px!important;height:62px!important;flex:0 0 98px!important}.mini-rail{position:absolute!important;top:10px!important;left:4px!important;right:4px!important;height:5px!important;background:rgba(255,255,255,.7)!important;border-radius:999px!important}.mini-head{position:absolute!important;top:2px!important;left:8px!important;width:24px!important;height:22px!important;background:#00d084!important;border-radius:7px!important;animation:pr3ntminihead 2s infinite alternate ease-in-out!important}.mini-bed{position:absolute!important;bottom:6px!important;left:8px!important;right:8px!important;height:7px!important;background:rgba(255,255,255,.7)!important;border-radius:999px!important}.mini-object{position:absolute!important;bottom:7px!important;left:28px!important;width:32px!important;height:10px!important;background:#00d084!important;border-radius:8px 8px 3px 3px!important;animation:pr3ntminigrow 2s infinite alternate ease-in-out!important}@keyframes pr3ntminihead{from{left:8px}to{left:64px}}@keyframes pr3ntminigrow{from{height:6px}to{height:24px}}
    .material-switch{display:grid!important;grid-template-columns:1fr 1fr!important;gap:8px!important}.material-switch input{display:none!important}.material-switch span{display:block!important;text-align:center!important;padding:12px!important;border:1px solid var(--pr3nt-line)!important;border-radius:14px!important;font-weight:900!important;background:#f8fafc!important}.material-switch input:checked+span{background:var(--pr3nt-ink)!important;color:#fff!important}.rating{display:none!important}.star-rating{display:flex!important;flex-direction:row-reverse!important;justify-content:flex-end!important;gap:3px!important}.star-rating input{display:none!important}.star-rating span{font-size:30px!important;color:#d0d5dd!important;cursor:pointer!important}.star-rating label:hover span,.star-rating label:hover~label span,.star-rating input:checked~span,.star-rating label:has(input:checked) span,.star-rating label:has(input:checked)~label span{color:var(--pr3nt-ink)!important}
    .status-info-toggle{position:absolute!important;right:18px!important;top:18px!important;left:auto!important;bottom:auto!important;z-index:30!important;display:block!important}.status-info-toggle summary{list-style:none!important;width:32px!important;height:32px!important;border-radius:999px!important;background:rgba(255,255,255,.96)!important;color:var(--pr3nt-ink)!important;display:grid!important;place-items:center!important;font-size:14px!important;font-weight:900!important;cursor:pointer!important;box-shadow:0 8px 24px rgba(16,24,32,.12)!important}.status-info-toggle summary::-webkit-details-marker{display:none!important}.status-popover{position:absolute!important;right:0!important;top:42px!important;left:auto!important;z-index:50!important;width:min(340px,calc(100vw - 48px))!important;max-height:60vh!important;overflow:auto!important;background:#fff!important;color:var(--pr3nt-ink)!important;border:1px solid var(--pr3nt-line)!important;border-radius:20px!important;padding:16px!important;line-height:1.5!important;box-shadow:0 18px 60px rgba(16,24,32,.14)!important}.status-popover .step{font-size:13px!important;line-height:1.45!important}.status-overview-hidden{display:none!important}
    @media(max-width:1100px){.project-info-grid,.preview-messages-grid{grid-template-columns:1fr!important}.self-grid.pr3nt-managed-selfservice{grid-template-columns:repeat(2,minmax(220px,1fr))!important}.status-hero{padding:30px 24px!important}.status-hero .next-action{min-height:170px!important}}
    @media(max-width:850px){:root{--pr3nt-gap:16px}.portal-header{align-items:stretch!important;flex-direction:column!important}.portal-nav{border-radius:22px!important;flex-wrap:wrap!important;justify-content:stretch!important}.portal-nav .project-switcher{max-width:none!important;width:100%!important}.portal-nav .project-switcher select{min-width:0!important;max-width:none!important;flex:1 1 auto!important}.portal-nav .account-icon,.portal-nav a.account-icon,.portal-nav .nav-link.account-icon{margin-left:0!important}.status-hero{padding:26px 20px 22px!important;border-radius:26px!important}.status-hero h1{font-size:40px!important}.self-grid.pr3nt-managed-selfservice,.project-info-grid,.preview-messages-grid{grid-template-columns:1fr!important}.project-info-grid .card,.self-card,.preview-messages-grid .card{padding:20px!important}.status-info-toggle{right:14px!important;top:14px!important}.status-popover{right:0!important;left:auto!important;width:min(320px,calc(100vw - 32px))!important}}
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
      function textStarts(el, text){ return el && (el.textContent || '').trim().toLowerCase().indexOf(text.toLowerCase()) === 0; }
      function cardByTitle(text){ return Array.from(document.querySelectorAll('.card')).find(function(card){ return textStarts(card, text); }); }
      function removeOldSelfService(){
        document.querySelectorAll('section.self-grid').forEach(function(el){ el.remove(); });
        var oldModal = document.querySelector('#self-upload-modal');
        if (oldModal) { var modal = oldModal.nextElementSibling; oldModal.remove(); if (modal && modal.classList.contains('modal')) modal.remove(); }
      }
      function applyFinalLayout(){
        var nav = document.querySelector('.portal-nav');
        if (nav) { var account = nav.querySelector('a[href$="/account"]'); if (account) { account.classList.add('account-icon'); account.setAttribute('aria-label', 'Account'); nav.appendChild(account); } }
        document.querySelectorAll('.printer-card').forEach(function(el){ el.remove(); });
        var trackingCard = document.querySelector('#tracking');
        if (trackingCard) { var trackingParent = trackingCard.closest('section.grid'); trackingCard.remove(); if (trackingParent) { trackingParent.classList.add('one-card'); if (!trackingParent.querySelector('.card')) trackingParent.remove(); } }
        document.querySelectorAll('.pr3nt-final-status').forEach(function(el){ el.remove(); });
        if (statusCard) { var target = document.querySelector('.status-hero .next-action') || document.querySelector('.status-hero'); if (target) target.insertAdjacentHTML('beforeend', statusCard); }
        document.querySelectorAll('a[href="#tracking"]').forEach(function(el){ el.remove(); });
        var statusOverviewCard = cardByTitle('Statusoverzicht');
        if (statusOverviewCard) {
          var html = statusOverviewCard.innerHTML;
          statusOverviewCard.classList.add('status-overview-hidden');
          var hero = document.querySelector('.status-hero');
          if (hero && !document.querySelector('.status-info-toggle')) hero.insertAdjacentHTML('beforeend','<details class="status-info-toggle"><summary aria-label="Statusinformatie">i</summary><div class="status-popover">'+html+'</div></details>');
        }
        var relevantCard = cardByTitle('Relevante informatie') || cardByTitle('Wat is nu belangrijk?');
        var projectCard = cardByTitle('Projectgegevens');
        if (relevantCard) relevantCard.innerHTML = '<h2>Wat is nu belangrijk?</h2>' + priceBlock;
        if (projectCard) projectCard.innerHTML = projectCard.innerHTML.replace(/Aanvraag(?!nummer)/g, 'Aanvraagnummer');
        if (relevantCard && projectCard) {
          var existingWrap = document.querySelector('.project-info-grid');
          if (!existingWrap) { existingWrap = document.createElement('section'); existingWrap.className = 'project-info-grid'; relevantCard.parentNode.insertBefore(existingWrap, relevantCard); }
          existingWrap.appendChild(relevantCard);
          existingWrap.appendChild(projectCard);
        }
        var previewCard = Array.from(document.querySelectorAll('.card')).find(function(card){ return /3D model preview|3d model preview|model preview/i.test(card.textContent || ''); });
        var messagesCard = Array.from(document.querySelectorAll('.card')).find(function(card){ return /Berichten|Reacties|Messages/i.test(card.textContent || ''); });
        if (previewCard && messagesCard) {
          var previewWrap = document.querySelector('.preview-messages-grid');
          if (!previewWrap) { previewWrap = document.createElement('section'); previewWrap.className = 'preview-messages-grid'; previewCard.parentNode.insertBefore(previewWrap, previewCard); }
          previewWrap.appendChild(previewCard);
          previewWrap.appendChild(messagesCard);
        }
        removeOldSelfService();
        var anchor = document.querySelector('.project-info-grid') || document.querySelector('section.grid.one-card') || document.querySelector('section.grid') || document.querySelector('.account-section');
        if (anchor && selfService && !document.querySelector('.pr3nt-managed-selfservice')) anchor.insertAdjacentHTML('afterend', selfService);
      }
      applyFinalLayout();
      if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', applyFinalLayout);
      setTimeout(applyFinalLayout, 100);
      setTimeout(applyFinalLayout, 500);
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
        html = html.replace(/Offerte meestal binnen 1 werkdag/g, 'Prijsopgaaf binnen 1 werkdag');
        html = html.replace(/We bekijken je bestand en maken een passende offerte\./g, 'Je aanvraag is binnen. Binnen 1 werkdag ontvang je een heldere prijsopgaaf, inclusief verzending.');
        html = html.replace(/Bestand uploaden of bericht sturen/g, 'Iets aanpassen of aanvullen?');
        html = html.replace('</head>', `${css()}</head>`);
        html = html.replace('</body>', `${script(quote)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
