import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const filePath = path.resolve('src/portaldomfix.js');
let source = await readFile(filePath, 'utf8');

source = source.replace(
  '.project-info-grid{display:grid!important;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr)!important;gap:18px!important;align-items:start!important;margin:24px 0 0!important}.project-info-grid .card{margin:0!important;min-height:0!important}.project-info-grid .card h2{font-size:24px!important;line-height:1.15!important}',
  '.project-info-grid{display:grid!important;grid-template-columns:minmax(0,1.15fr) minmax(300px,.85fr)!important;gap:18px!important;align-items:stretch!important;margin:24px 0 0!important}.project-info-grid .card{margin:0!important;min-height:0!important;height:100%!important;display:flex!important;flex-direction:column!important}.project-info-grid .card h2{font-size:24px!important;line-height:1.15!important}.project-info-grid .price-card{height:100%!important;display:flex!important;flex-direction:column!important;justify-content:flex-start!important}'
);

source = source.replace(
  '.status-info-toggle{position:absolute;left:20px;bottom:20px;z-index:25;display:block}.status-info-toggle summary{list-style:none;width:28px;height:28px;border-radius:999px;background:#eef2f1;color:#101820;display:grid;place-items:center;font-weight:900;cursor:pointer}.status-info-toggle summary::-webkit-details-marker{display:none}.status-popover{position:absolute;left:0;top:38px;right:auto;z-index:50;width:min(340px,calc(100vw - 48px));max-height:60vh;overflow:auto;background:#fff;color:#101820;border:1px solid var(--line,#e5e7eb);border-radius:18px;padding:14px;box-shadow:0 18px 60px rgba(16,24,32,.14)}',
  '.status-info-toggle{position:absolute;right:20px;top:20px;left:auto;bottom:auto;z-index:25;display:block}.status-info-toggle summary{list-style:none;width:30px;height:30px;border-radius:999px;background:rgba(255,255,255,.9);color:#101820;display:grid;place-items:center;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(16,24,32,.12)}.status-info-toggle summary::-webkit-details-marker{display:none}.status-popover{position:absolute;right:0;top:40px;left:auto;z-index:50;width:min(340px,calc(100vw - 48px));max-height:60vh;overflow:auto;background:#fff;color:#101820;border:1px solid var(--line,#e5e7eb);border-radius:18px;padding:14px;box-shadow:0 18px 60px rgba(16,24,32,.14)}'
);

source = source.replace(
  '@media(max-width:850px){.self-grid,.project-info-grid{grid-template-columns:1fr!important}.account-icon{margin-left:0!important}.status-info-toggle{left:16px;bottom:16px}.status-popover{width:min(320px,calc(100vw - 32px));top:36px}}',
  '.preview-messages-grid{grid-column:1 / -1!important;width:100%!important;display:grid!important;grid-template-columns:minmax(0,1.2fr) minmax(320px,.8fr)!important;gap:18px!important;align-items:start!important;margin:24px 0 0!important}.preview-messages-grid .card{margin:0!important;height:100%!important}.preview-messages-grid .model-card,.preview-messages-grid .preview-card{min-height:420px!important}@media(max-width:1100px){.preview-messages-grid{grid-template-columns:1fr!important}}@media(max-width:850px){.self-grid,.project-info-grid{grid-template-columns:1fr!important}.account-icon{margin-left:0!important}.status-info-toggle{right:16px;top:16px}.status-popover{width:min(320px,calc(100vw - 32px));top:36px}}'
);

const marker = "        removeOldSelfService();\n        var anchor = document.querySelector('.project-info-grid') || document.querySelector('section.grid.one-card') || document.querySelector('section.grid') || document.querySelector('.account-section');";
const insertion = "        var previewCard = Array.from(document.querySelectorAll('.card')).find(function(card){ return /3D model preview|3d model preview|model preview/i.test(card.textContent || ''); });\n        var messagesCard = Array.from(document.querySelectorAll('.card')).find(function(card){ return /Berichten|Reacties|Messages/i.test(card.textContent || ''); });\n        if (previewCard && messagesCard) {\n          var previewWrap = document.querySelector('.preview-messages-grid');\n          if (!previewWrap) { previewWrap = document.createElement('section'); previewWrap.className = 'preview-messages-grid'; previewCard.parentNode.insertBefore(previewWrap, previewCard); }\n          previewWrap.appendChild(previewCard);\n          previewWrap.appendChild(messagesCard);\n        }\n        removeOldSelfService();\n        var anchor = document.querySelector('.project-info-grid') || document.querySelector('section.grid.one-card') || document.querySelector('section.grid') || document.querySelector('.account-section');";
if (source.includes(marker) && !source.includes('preview-messages-grid')) {
  source = source.replace(marker, insertion);
} else if (source.includes(marker) && source.includes('preview-messages-grid') && !source.includes('var previewCard')) {
  source = source.replace(marker, insertion);
}

await writeFile(filePath, source);
console.log('Portal layout polish applied: equal info cards, better info button, preview/messages grid.');
