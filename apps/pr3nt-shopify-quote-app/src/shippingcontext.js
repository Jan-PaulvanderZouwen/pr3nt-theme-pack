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

async function readQuotes() {
  try {
    const quotes = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    return Array.isArray(quotes) ? quotes : [];
  } catch {
    return [];
  }
}

function parseShippingFromNote(note = '') {
  const text = String(note || '');
  const get = (label) => {
    const match = text.match(new RegExp(`${label}:\\s*([^\\n]+)`, 'i'));
    return match ? match[1].trim() : '';
  };
  return {
    country: get('Land'),
    postalCode: get('Postcode'),
    houseNumber: get('Huisnummer'),
    city: get('Plaats'),
  };
}

function shippingOf(quote = {}) {
  const parsed = parseShippingFromNote(quote.note);
  const shipping = quote.shipping || {};
  return {
    country: shipping.country || parsed.country || '',
    postalCode: shipping.postalCode || parsed.postalCode || '',
    houseNumber: shipping.houseNumber || parsed.houseNumber || '',
    city: shipping.city || parsed.city || '',
  };
}

function hasShipping(shipping) {
  return !!(shipping.country || shipping.postalCode || shipping.houseNumber || shipping.city);
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
  const line = [shipping.postalCode, shipping.houseNumber].filter(Boolean).join(' ');
  return `<div class="pr3nt-shipping-card" data-pr3nt-shipping-card>
    <h2>Verzendadres</h2>
    <div class="pr3nt-shipping-kv">
      <div class="pr3nt-shipping-muted">Land</div><div>${escapeHtml(shipping.country || '-')}</div>
      <div class="pr3nt-shipping-muted">Postcode / huisnummer</div><div>${escapeHtml(line || '-')}</div>
      <div class="pr3nt-shipping-muted">Plaats</div><div>${escapeHtml(shipping.city || '-')}</div>
    </div>
  </div>`;
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
        var address = [shipping.postalCode, shipping.houseNumber].filter(Boolean).join(' ');
        setIfEmpty('country', shipping.country || 'Nederland');
        setIfEmpty('postalCode', shipping.postalCode || '');
        setIfEmpty('city', shipping.city || '');
        setIfEmpty('address', address || '');
      }
      addPortalShipping();
      prefillAccount();
      if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ addPortalShipping(); prefillAccount(); });
      setTimeout(function(){ addPortalShipping(); prefillAccount(); }, 150);
    })();
  </script>`;
}

export function registerShippingContextRoutes(app) {
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
