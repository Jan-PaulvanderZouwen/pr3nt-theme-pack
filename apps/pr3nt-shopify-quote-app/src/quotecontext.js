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

function requestLabel(quote = {}) {
  return quote.requestType === 'no_model' ? 'Nog geen 3D-bestand' : '3D-bestand aanwezig';
}

function contextHtml(quote) {
  const label = requestLabel(quote);
  const description = quote.description || '';
  const hasNoModel = quote.requestType === 'no_model';
  return `<div class="pr3nt-request-context" data-pr3nt-request-context>
    <h2>Aanvraagcontext</h2>
    <div class="pr3nt-request-context-grid">
      <div><small>Aanvraagtype</small><strong>${escapeHtml(label)}</strong></div>
      <div><small>Bestanden</small><strong>${escapeHtml(Array.isArray(quote.files) && quote.files.length ? `${quote.files.length} bestand(en)` : 'Geen bestand')}</strong></div>
    </div>
    ${hasNoModel ? '<p class="pr3nt-request-alert">Deze klant heeft nog geen 3D-bestand. Beoordeel eerst of tekenen/aanpassen nodig is voordat je de printprijs bepaalt.</p>' : ''}
    ${description ? `<div class="pr3nt-request-description"><small>Omschrijving / referentie</small><p>${escapeHtml(description).replaceAll('\n', '<br>')}</p></div>` : ''}
  </div>`;
}

function css() {
  return `<style id="pr3nt-request-context-css">
    .pr3nt-request-context{background:#fff;border:1px solid #e1e3e5;border-radius:16px;box-shadow:0 1px 0 rgba(0,0,0,.04),0 10px 28px rgba(0,0,0,.05);padding:20px;margin:0 0 18px;color:#202223}
    .pr3nt-request-context h2{margin:0 0 14px;font-size:21px;line-height:1.15;letter-spacing:-.02em;color:#202223}
    .pr3nt-request-context-grid{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px}
    .pr3nt-request-context-grid div,.pr3nt-request-description{border:1px solid #e1e3e5;background:#fafafa;border-radius:14px;padding:13px}
    .pr3nt-request-context small{display:block;color:#6d7175;font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.06em;margin-bottom:4px}
    .pr3nt-request-context strong{display:block;color:#202223;font-size:15px}
    .pr3nt-request-alert{margin:12px 0;border:1px solid rgba(0,208,132,.28);background:rgba(0,208,132,.12);border-radius:14px;padding:12px 13px;color:#0f3d2b;font-weight:760;line-height:1.45}
    .pr3nt-request-description p{margin:0;color:#202223;line-height:1.55;white-space:normal}
    .portal-request-context{margin:18px 0 0}
    @media(max-width:760px){.pr3nt-request-context{padding:16px;border-radius:14px}.pr3nt-request-context-grid{grid-template-columns:1fr}}
  </style>`;
}

function script(quote) {
  const html = JSON.stringify(contextHtml(quote));
  const label = JSON.stringify(requestLabel(quote));
  const description = JSON.stringify(quote.description || '');
  return `<script id="pr3nt-request-context-js">
    (function(){
      var html = ${html};
      var label = ${label};
      var description = ${description};
      function addAdminContext(){
        if(!location.pathname.match(/^\/admin\/quotes\//)) return;
        if(document.querySelector('[data-pr3nt-request-context]')) return;
        var target = document.querySelector('.detail-grid section.stack');
        if(target) target.insertAdjacentHTML('afterbegin', html);
      }
      function addPortalContext(){
        if(!location.pathname.match(/^\/portal\//) || location.pathname.indexOf('/account') !== -1) return;
        var projectTitle = Array.from(document.querySelectorAll('.card h2')).find(function(h){ return (h.textContent || '').trim() === 'Projectgegevens'; });
        var projectCard = projectTitle && projectTitle.closest('.card');
        var kv = projectCard && projectCard.querySelector('.kv');
        if(kv && !kv.querySelector('[data-request-type-row]')){
          kv.insertAdjacentHTML('afterbegin', '<div class="muted" data-request-type-row>Aanvraagtype</div><div>'+label+'</div>');
          if(description) kv.insertAdjacentHTML('beforeend', '<div class="muted">Omschrijving</div><div>'+String(description).replace(/[&<>"']/g,function(c){return {"&":"&amp;","<":"&lt;",">":"&gt;","\\\"":"&quot;","\\'":"&#039;"}[c]||c;}).replace(/\n/g,'<br>')+'</div>');
        }
      }
      addAdminContext();
      addPortalContext();
      if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function(){ addAdminContext(); addPortalContext(); });
      setTimeout(function(){ addAdminContext(); addPortalContext(); }, 150);
    })();
  </script>`;
}

export function registerQuoteContextRoutes(app) {
  app.use(async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const isAdminQuote = /^\/admin\/quotes\/[^/]+$/.test(req.path);
    const isPortal = /^\/portal\/[^/]+$/.test(req.path);
    if (!isAdminQuote && !isPortal) return next();

    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const quotes = await readQuotes();
        const key = decodeURIComponent(req.path.split('/').filter(Boolean).pop() || '');
        const quote = quotes.find((item) => !item.archivedAt && (item.id === key || item.portalToken === key));
        if (!quote) return originalSend(body);
        let html = body.replace(/<style id="pr3nt-request-context-css">[\s\S]*?<\/style>/g, '').replace(/<script id="pr3nt-request-context-js">[\s\S]*?<\/script>/g, '');
        html = html.replace('</head>', `${css()}</head>`);
        html = html.replace('</body>', `${script(quote)}</body>`);
        return originalSend(html);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });
}
