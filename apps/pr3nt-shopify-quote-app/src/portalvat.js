import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fmt, quoteSubtotalExVat, quoteVatAmount, quoteTotalInclVat, vatRatePercent } from './vat.js';

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

function vatData(quote) {
  return {
    subtotal: fmt(quoteSubtotalExVat(quote)),
    vat: fmt(quoteVatAmount(quote)),
    total: fmt(quoteTotalInclVat(quote)),
    rate: fmt(vatRatePercent()),
  };
}

function script(quote) {
  const data = JSON.stringify(vatData(quote));
  return `<script id="pr3nt-vat-js">
    (function(){
      var vat=${data};
      function updateVat(){
        var table=document.querySelector('.quote-table table');
        if(table && !table.querySelector('[data-pr3nt-vat-total]')){
          var foot=table.querySelector('tfoot') || table.createTFoot();
          foot.innerHTML='<tr><td colspan="3">Subtotaal excl. btw</td><td>€ '+vat.subtotal+'</td></tr><tr><td colspan="3">Btw '+vat.rate+'%</td><td>€ '+vat.vat+'</td></tr><tr data-pr3nt-vat-total><td colspan="3"><strong>Totaal incl. btw</strong></td><td><strong>€ '+vat.total+'</strong></td></tr>';
          table.querySelectorAll('thead th').forEach(function(th){
            if((th.textContent||'').trim()==='Prijs') th.textContent='Prijs excl. btw';
            if((th.textContent||'').trim()==='Totaal') th.textContent='Totaal excl. btw';
          });
        }
        document.querySelectorAll('.inline-facts span').forEach(function(span){
          var text=(span.textContent||'').trim();
          if(text.indexOf('€')===0) span.textContent='€ '+vat.total+' incl. btw';
        });
      }
      updateVat();
      if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', updateVat);
      setTimeout(updateVat,100);
      setTimeout(updateVat,500);
    })();
  </script>`;
}

export function registerPortalVatRoutes(app) {
  app.use('/portal/:token', async (req, res, next) => {
    if (req.method !== 'GET' || req.path.split('/').filter(Boolean).length !== 2) return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const token = decodeURIComponent(req.params.token || '');
        const quote = (await readQuotes()).find((item) => !item.archivedAt && (item.portalToken === token || item.id === token));
        if (!quote || quoteSubtotalExVat(quote) <= 0) return originalSend(body);
        const html = body.replace(/<script id="pr3nt-vat-js">[\s\S]*?<\/script>/g, '').replace('</body>', `${script(quote)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
