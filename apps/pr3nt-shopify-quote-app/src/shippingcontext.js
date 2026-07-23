import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
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

function getLabeledValue(text = '', labels = []) {
  const lines = String(text || '').split(/\r?\n/);
  for (const line of lines) {
    const cleaned = line.trim();
    if (!cleaned) continue;
    for (const label of labels) {
      const pattern = new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[:=-]\\s*(.+)$`, 'i');
      const match = cleaned.match(pattern);
      if (match?.[1]) return match[1].trim();
    }
  }
  return '';
}

function parseShippingFromNote(note = '') {
  const text = String(note || '');
  const street = getLabeledValue(text, ['Straat', 'Straatnaam', 'Street']);
  const houseNumber = getLabeledValue(text, ['Huisnummer', 'Nummer', 'House number']);
  const address = getLabeledValue(text, ['Adres', 'Straat en huisnummer', 'Verzendadres', 'Address']);
  return {
    name: getLabeledValue(text, ['Naam ontvanger', 'Ontvanger']),
    company: getLabeledValue(text, ['Bedrijf', 'Company']),
    address: address || [street, houseNumber].filter(Boolean).join(' '),
    street,
    country: getLabeledValue(text, ['Land', 'Country']),
    postalCode: getLabeledValue(text, ['Postcode', 'Postal code', 'Zip']),
    houseNumber,
    city: getLabeledValue(text, ['Plaats', 'Woonplaats', 'Stad', 'City']),
  };
}

function looksLikeHouseNumberOnly(value = '') {
  const text = String(value || '').trim();
  return !!text && /^[0-9]+\s*[a-zA-Z]{0,4}(?:\s*[-/]\s*[0-9a-zA-Z]+)?$/.test(text);
}

function fullAddress(shipping = {}, parsed = {}) {
  const street = shipping.street || parsed.street || '';
  const houseNumber = shipping.houseNumber || shipping.house || shipping.number || parsed.houseNumber || '';
  const address = shipping.address || parsed.address || '';
  if (street && houseNumber) return `${street} ${houseNumber}`.trim();
  if (street) return street;
  if (address && looksLikeHouseNumberOnly(address) && houseNumber && address !== houseNumber) return [address, houseNumber].filter(Boolean).join(' ');
  return address || houseNumber || '';
}

function shippingOf(quote = {}) {
  const parsed = parseShippingFromNote(`${quote.description || ''}\n${quote.note || ''}`);
  const shipping = quote.shipping || {};
  const address = fullAddress(shipping, parsed);
  const houseNumber = shipping.houseNumber || shipping.house || shipping.number || parsed.houseNumber || '';
  return {
    name: shipping.name || parsed.name || quote.name || '',
    company: shipping.company || parsed.company || '',
    address,
    street: shipping.street || parsed.street || '',
    country: shipping.country || parsed.country || '',
    postalCode: shipping.postalCode || parsed.postalCode || '',
    houseNumber,
    city: shipping.city || parsed.city || '',
  };
}

function hasShipping(shipping) {
  return !!(shipping.address || shipping.country || shipping.postalCode || shipping.houseNumber || shipping.city);
}

function css() {
  return `<style id="pr3nt-shipping-context-css">
    .pr3nt-shipping-card{background:rgba(255,255,255,.94);border:1px solid #e5e7eb;border-radius:26px;box-shadow:0 18px 60px rgba(16,24,32,.08);padding:24px;margin-bottom:18px}
    .pr3nt-shipping-card h2{margin:0 0 12px}
    .pr3nt-shipping-kv{display:grid;grid-template-columns:150px 1fr;gap:8px 12px}
    .pr3nt-shipping-kv div{padding:9px 0;border-bottom:1px solid #e5e7eb}
    .pr3nt-shipping-muted{color:#667085}
    @media(max-width:850px){.pr3nt-shipping-kv{grid-template-columns:1fr}.pr3nt-shipping-card{padding:18px;border-radius:20px}}
  </style>`;
}

function portalCardHtml(shipping) {
  if (!hasShipping(shipping)) return '';
  return `<div class="pr3nt-shipping-card" data-pr3nt-shipping-card>
    <h2>Verzendadres</h2>
    <div class="pr3nt-shipping-kv">
      <div class="pr3nt-shipping-muted">Naam</div><div>${escapeHtml(shipping.name || '-')}</div>
      ${shipping.company ? `<div class="pr3nt-shipping-muted">Bedrijf</div><div>${escapeHtml(shipping.company)}</div>` : ''}
      <div class="pr3nt-shipping-muted">Adres</div><div>${escapeHtml(shipping.address || '-')}</div>
      <div class="pr3nt-shipping-muted">Postcode</div><div>${escapeHtml(shipping.postalCode || '-')}</div>
      <div class="pr3nt-shipping-muted">Plaats</div><div>${escapeHtml(shipping.city || '-')}</div>
      <div class="pr3nt-shipping-muted">Land</div><div>${escapeHtml(shipping.country || '-')}</div>
    </div>
  </div>`;
}

function normaliseIncomingQuoteShipping(req) {
  if (req.method !== 'POST' || req.path !== '/api/quote' || !req.body) return;
  const body = req.body;
  const read = (...names) => {
    for (const name of names) {
      const value = body[name];
      if (Array.isArray(value) && value[0]) return clean(value[0]);
      if (value) return clean(value);
    }
    return '';
  };

  const description = read('description', 'omschrijving', 'message', 'bericht', 'contact[body]', 'body');
  const parsed = parseShippingFromNote(description);
  const street = read('shipping_street', 'shippingStreet', 'shipping_street_name', 'shippingStreetName', 'street', 'streetName', 'street_name', 'straat', 'straatnaam', 'adres_straat', 'address_street') || parsed.street;
  const houseNumber = read('shipping_house', 'shippingHouse', 'shipping_house_number', 'shippingHouseNumber', 'houseNumber', 'house_number', 'huisnummer', 'nummer', 'number', 'nr') || parsed.houseNumber;
  const currentAddress = read('shipping_address', 'shippingAddress', 'shipping_address1', 'shippingAddress1', 'address', 'adres', 'street_address', 'straat_huisnummer') || parsed.address;
  const combinedAddress = street ? [street, houseNumber].filter(Boolean).join(' ') : currentAddress;

  if (combinedAddress) body.shipping_address = combinedAddress;
  if (street) body.shipping_street = street;
  if (houseNumber) body.shipping_house = houseNumber;
  body.shipping_postal = read('shipping_postal', 'shippingPostal', 'shipping_postal_code', 'shippingPostalCode', 'postalCode', 'postal_code', 'postcode', 'zip') || parsed.postalCode || body.shipping_postal;
  body.shipping_city = read('shipping_city', 'shippingCity', 'city', 'plaats', 'woonplaats', 'stad') || parsed.city || body.shipping_city;
  body.shipping_country = read('shipping_country', 'shippingCountry', 'country', 'land') || parsed.country || body.shipping_country || 'Nederland';
  body.shipping_name = read('shipping_name', 'shippingName', 'shipping_recipient', 'shippingRecipient', 'recipient', 'ontvanger') || parsed.name || body.shipping_name || body.name;
  body.shipping_company = read('shipping_company', 'shippingCompany', 'company', 'bedrijf') || parsed.company || body.shipping_company;
}

function script(quote) {
  const shipping = shippingOf(quote);
  const card = JSON.stringify(portalCardHtml(shipping));
  const data = JSON.stringify(shipping);
  return `<script id="pr3nt-shipping-context-js">
    (function(){
      var shipping = ${data};
      var card = ${card};
      function setIfEmpty(name, value){
        var input = document.querySelector('[name="'+name+'"]');
        if(input && !String(input.value || '').trim() && value) input.value = value;
      }
      function addPortalShipping(){
        if(!location.pathname.match(/^\/portal\//) || location.pathname.indexOf('/account') !== -1) return;
        if(!card || document.querySelector('[data-pr3nt-shipping-card]')) return;
        var projectTitle = Array.from(document.querySelectorAll('.card h2')).find(function(h){ return (h.textContent || '').trim() === 'Projectgegevens'; });
        var projectCard = projectTitle && projectTitle.closest('.card');
        if(projectCard) projectCard.insertAdjacentHTML('afterend', card);
      }
      function prefillAccount(){
        if(location.pathname.indexOf('/account') === -1) return;
        setIfEmpty('country', shipping.country || 'Nederland');
        setIfEmpty('postalCode', shipping.postalCode || '');
        setIfEmpty('city', shipping.city || '');
        setIfEmpty('address', shipping.address || '');
        setIfEmpty('shippingAddress', shipping.address || '');
        setIfEmpty('shippingStreet', shipping.street || '');
        setIfEmpty('shippingHouse', shipping.houseNumber || '');
      }
      addPortalShipping();
      prefillAccount();
      if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ addPortalShipping(); prefillAccount(); });
      setTimeout(function(){ addPortalShipping(); prefillAccount(); }, 150);
    })();
  </script>`;
}

export function registerShippingContextRoutes(app) {
  app.use((req, _res, next) => {
    normaliseIncomingQuoteShipping(req);
    next();
  });

  app.use(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const isPortal = /^\/portal\/[^/]+(?:\/account)?$/.test(req.path);
    if (!isPortal) return next();

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const quotes = await readQuotes();
        const parts = req.path.split('/').filter(Boolean);
        const key = decodeURIComponent(parts[1] || '');
        const quote = quotes.find((item) => !item.archivedAt && (item.id === key || item.portalToken === key));
        if (!quote) return originalSend(body);
        let html = body.replace(/<style id="pr3nt-shipping-context-css">[\s\S]*?<\/style>/g, '').replace(/<script id="pr3nt-shipping-context-js">[\s\S]*?<\/script>/g, '');
        html = html.replace('</head>', `${css()}</head>`);
        html = html.replace('</body>', `${script(quote)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
