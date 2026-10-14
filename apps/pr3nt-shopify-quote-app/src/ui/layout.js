// Gedeelde paginaopbouw voor app.pr3nt.nl. Alle opmaak staat in public/app.css.
import { statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public');
// Versie in de URL zodat browsers na een deploy direct de nieuwe opmaak en scripts laden.
export const assetVersion = (() => {
  try { return ['app.css', 'portal.js'].map((file) => Math.round(statSync(path.join(publicDir, file)).mtimeMs).toString(36)).join(''); } catch { return '1'; }
})();

export function e(value = '') {
  return String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

export function formatDate(value, withTime = false) {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) return '';
  const options = withTime
    ? { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }
    : { day: 'numeric', month: 'short', year: 'numeric' };
  return date.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', ...options });
}

export function logo(href = '') {
  const inner = '<span class="logo-mark" aria-hidden="true">3</span><span class="logo-text">pr<span>3</span>nt</span>';
  return href ? `<a class="logo" href="${e(href)}" aria-label="pr3nt">${inner}</a>` : `<span class="logo">${inner}</span>`;
}

const fonts = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap';

export function renderShell({ title = 'pr3nt', topbar = '', body = '', scripts = '' } = {}) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="robots" content="noindex"><title>${e(title)} · pr3nt</title><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link rel="stylesheet" href="${fonts}"><link rel="stylesheet" href="/assets/app.css?v=${assetVersion}"></head><body><div class="app">${topbar}${body}</div>${scripts}</body></html>`;
}
