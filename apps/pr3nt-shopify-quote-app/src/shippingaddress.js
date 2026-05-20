import { readFile, writeFile } from 'node:fs/promises';
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

function clean(value = '', max = 240) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
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

function findQuote(quotes, token) {
  return quotes.find((quote) => !quote.archivedAt && (quote.portalToken === token || quote.id === token));
}

function addressComplete(address = {}) {
  return Boolean(address.name && address.address && address.postalCode && address.city && address.country);
}

function addressHtml(address = {}) {
  if (!addressComplete(address)) return '<p class="muted">Vul je verzendadres in zodra je print verzonden mag worden.</p>';
  return `<div class="pr3nt-address-lines"><strong>${e(address.name)}</strong><span>${e(address.address)}</span><span>${e(address.postalCode)} ${e(address.city)}</span><span>${e(address.country)}</span></div>`;
}

function cardHtml(quote) {
  const token = encodeURIComponent(quote.portalToken || quote.id);
  const shipping = quote.shipping || {};
  const completed = addressComplete(shipping);
  return `<section class="card pr3nt-shipping-card"><div class="pr3nt-shipping-head"><div><span class="eyebrow">Verzending</span><h2>Verzendadres</h2></div><span class="badge ${completed ? 'green' : ''}">${completed ? 'Ingevuld' : 'Nog nodig'}</span></div>${addressHtml(shipping)}<details class="pr3nt-address-details" ${completed ? '' : 'open'}><summary class="btn btn-light">${completed ? 'Adres wijzigen' : 'Adres invullen'}</summary><form method="post" action="/portal/${token}/shipping" class="pr3nt-shipping-form"><div class="form-grid"><label><span>Naam ontvanger</span><input name="shippingName" value="${e(shipping.name || quote.name || '')}" required></label><label><span>Bedrijf <small>(optioneel)</small></span><input name="shippingCompany" value="${e(shipping.company || '')}"></label><label><span>Straat en huisnummer</span><input name="shippingAddress" value="${e(shipping.address || '')}" required></label><label><span>Postcode</span><input name="shippingPostalCode" value="${e(shipping.postalCode || '')}" required></label><label><span>Plaats</span><input name="shippingCity" value="${e(shipping.city || '')}" required></label><label><span>Land</span><input name="shippingCountry" value="${e(shipping.country || 'Nederland')}" required></label></div><button class="btn btn-primary" type="submit">Verzendadres opslaan</button></form></details></section>`;
}

function css() {
  return `<style id="pr3nt-shipping-css">
    .pr3nt-shipping-card{grid-column:1/-1!important}
    .pr3nt-shipping-head{display:flex;align-items:flex-start;justify-content:space-between;gap:14px;margin-bottom:12px}
    .pr3nt-shipping-head h2{margin:6px 0 0!important}
    .pr3nt-address-lines{display:grid;gap:4px;margin:10px 0 16px;color:#101820}
    .pr3nt-address-lines span{color:#667085;font-weight:700}
    .pr3nt-address-details{margin-top:14px}
    .pr3nt-address-details summary{width:max-content;list-style:none;cursor:pointer;margin-bottom:14px}
    .pr3nt-address-details summary::-webkit-details-marker{display:none}
    .pr3nt-shipping-form{display:grid;gap:14px}
    .pr3nt-shipping-form label span{display:block;margin:0 0 6px;font-size:13px;font-weight:900;color:#667085}
    .pr3nt-shipping-form small{font-weight:700;color:#98a2b3}
    @media(max-width:850px){.pr3nt-shipping-head{align-items:stretch;flex-direction:column}.pr3nt-address-details summary{width:100%}}
  </style>`;
}

function script(quote) {
  const html = JSON.stringify(cardHtml(quote));
  return `<script id="pr3nt-shipping-js">
    (function(){
      var cardHtml=${html};
      function addShippingCard(){
        if(document.querySelector('.pr3nt-shipping-card')) return;
        var projectGrid=document.querySelector('.project-info-grid');
        var target=projectGrid || document.querySelector('section.grid');
        if(!target) return;
        if(projectGrid) projectGrid.insertAdjacentHTML('afterend', cardHtml);
        else target.insertAdjacentHTML('afterend', cardHtml);
      }
      addShippingCard();
      if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', addShippingCard);
      setTimeout(addShippingCard, 100);
      setTimeout(addShippingCard, 500);
    })();
  </script>`;
}

export function registerShippingAddressRoutes(app) {
  app.post('/portal/:token/shipping', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');

    quote.shipping = {
      name: clean(req.body.shippingName, 200),
      company: clean(req.body.shippingCompany, 200),
      address: clean(req.body.shippingAddress, 240),
      postalCode: clean(req.body.shippingPostalCode, 40),
      city: clean(req.body.shippingCity, 120),
      country: clean(req.body.shippingCountry, 120) || 'Nederland',
      updatedAt: new Date().toISOString(),
    };
    quote.updatedAt = new Date().toISOString();
    await writeQuotes(quotes);
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Verzendadres%20opgeslagen`);
  });

  app.use('/portal/:token', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        const quote = findQuote(await readQuotes(), req.params.token);
        if (!quote || typeof body !== 'string') return originalSend(body);
        let html = body;
        html = html.replace(/<style id="pr3nt-shipping-css">[\s\S]*?<\/style>/g, '');
        html = html.replace(/<script id="pr3nt-shipping-js">[\s\S]*?<\/script>/g, '');
        html = html.replace('</head>', `${css()}</head>`);
        html = html.replace('</body>', `${script(quote)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
