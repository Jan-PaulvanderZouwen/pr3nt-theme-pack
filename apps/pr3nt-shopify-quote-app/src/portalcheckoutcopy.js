import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

async function readQuotes() {
  try {
    const quotes = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    return Array.isArray(quotes) ? quotes : [];
  } catch {
    return [];
  }
}

function quoteTotal(quote) {
  const lines = Array.isArray(quote.quoteLines) && quote.quoteLines.length ? quote.quoteLines : quote.quoteAmount ? [{ qty: 1, unit: quote.quoteAmount }] : [];
  return lines.reduce((sum, line) => {
    const qty = Number(String(line.qty || 1).replace(',', '.')) || 1;
    const unit = Number(String(line.unit || 0).replace(',', '.')) || 0;
    return sum + qty * unit;
  }, 0);
}

function script(quote) {
  const hasPaymentUrl = Boolean(quote.paymentUrl || quote.molliePaymentUrl);
  const isQuoteReady = quoteTotal(quote) > 0;
  return `<style id="pr3nt-accept-pay-copy-css">
    .pr3nt-payment-note{margin:14px 0 0;padding:14px 16px;border:1px solid rgba(0,208,132,.28);background:rgba(0,208,132,.12);border-radius:18px;color:#0f3d2b;font-weight:760;line-height:1.45}
    .pr3nt-payment-note strong{display:block;color:#082115;margin-bottom:3px}
  </style>
  <script id="pr3nt-accept-pay-copy-js">
    (function(){
      var hasPaymentUrl = ${JSON.stringify(hasPaymentUrl)};
      var isQuoteReady = ${JSON.stringify(isQuoteReady)};
      function update(){
        document.querySelectorAll('button,a').forEach(function(el){
          var t = (el.textContent || '').trim().toLowerCase();
          if(t === 'akkoord met offerte' || t === 'offerte accepteren') el.textContent = hasPaymentUrl ? 'Offerte accepteren en betalen' : 'Offerte accepteren';
          if(t === 'nu betalen' || t === 'betalen') el.textContent = 'betaal veilig via Mollie';
        });
        document.querySelectorAll('.next-action span').forEach(function(el){
          var t = (el.textContent || '').trim().toLowerCase();
          if(t === 'offerte accepteren') el.textContent = hasPaymentUrl ? 'Accepteren en betalen' : 'Offerte accepteren';
          if(t === 'betaal je print' || t === 'betaling afronden') el.textContent = 'betaal veilig via Mollie';
          if(t === 'betaallink volgt') el.textContent = 'Betaling wordt handmatig klaargezet';
        });
        document.querySelectorAll('.status-hero p').forEach(function(el){
          var t = (el.textContent || '').trim();
          if(t === 'Bekijk de regels en geef akkoord als alles klopt.') el.textContent = hasPaymentUrl ? 'Bekijk de offerte-regels. Als alles klopt, accepteer je de offerte en ga je direct door naar betalen.' : 'Bekijk de offerte-regels en geef akkoord als alles klopt.';
          if(t === 'We zetten de betaallink voor je klaar.') el.textContent = 'We starten pas met printen zodra de betaling is ontvangen.';
        });
        document.querySelectorAll('.bubble,.message').forEach(function(node){
          var t = (node.textContent || '').toLowerCase();
          if(t.indexOf('betaallink') !== -1 && (t.indexOf('automatisch') !== -1 || t.indexOf('kon niet') !== -1 || t.indexOf('aangemaakt') !== -1)) node.remove();
        });
        if(isQuoteReady && !document.querySelector('[data-pr3nt-payment-note]')){
          var table = document.querySelector('.quote-table');
          if(table) table.insertAdjacentHTML('afterend','<div class="pr3nt-payment-note" data-pr3nt-payment-note><strong>Printen start na betaling</strong>Controleer de offerte-regels goed. Na akkoord word je doorgestuurd naar de betaling. We starten met printen zodra de betaling is ontvangen.</div>');
        }
      }
      update();
      if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', update);
      setTimeout(update, 250);
    })();
  </script>`;
}

export function registerPortalCheckoutCopyRoutes(app) {
  app.use(async (req, res, next) => {
    if (req.method !== 'GET' || !/^\/portal\/[^/]+$/.test(req.path)) return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const token = decodeURIComponent(req.path.split('/').filter(Boolean).pop() || '');
        const quote = (await readQuotes()).find((item) => !item.archivedAt && (item.portalToken === token || item.id === token));
        if (!quote) return originalSend(body);
        let html = body.replace(/<style id="pr3nt-accept-pay-copy-css">[\s\S]*?<\/script>/g, '');
        html = html.replace('</body>', `${script(quote)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
