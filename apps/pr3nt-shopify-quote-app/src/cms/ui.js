// Bouwstenen voor de CMS-schermen: velden, panelen, tabellen, SEO-blok en versies.
import { e } from '../ui/layout.js';
import { renderAdmin, pageHead, notice, emptyState, ago } from '../ui/adminshell.js';
import { assetVersion } from '../ui/layout.js';
import { siteUrl } from './client.js';

export { e, pageHead, notice, emptyState, ago };

export const BASE = '/admin/website';
export const url = (path = '') => `${BASE}${path}`;

const json = (v) => JSON.stringify(v ?? null).replace(/</g, '\\u003c');
export const dataScript = (id, value) => `<script type="application/json" id="${e(id)}">${json(value)}</script>`;

/** Pagina in de beheer-schil, met de CMS-scripts. */
export function cmsPage({ title, user, active, body, flash = '', error = '', scripts = '' }) {
  const messages = `${flash ? notice(flash) : ''}${error ? notice(error, 'warn') : ''}`;
  return renderAdmin({
    title, user, active, body: messages + body,
    scripts: `<script src="/assets/cms.js?v=${assetVersion}" defer></script>${scripts}`,
  });
}

export function cmsError(user, active, error) {
  const text = error?.message || String(error);
  const setup = /CMS_TOKEN|niet bereikbaar/.test(text);
  const body = pageHead({ eyebrow: 'Website', title: setup ? 'Koppeling met pr3nt.nl' : 'Er ging iets mis', text: e(text) }) +
    (setup ? `<section class="panel"><div class="panel-body"><ol class="cms-steps">
      <li>Maak een geheime sleutel: <code>openssl rand -hex 32</code></li>
      <li>Zet in <code>/opt/pr3nt/.env</code> (de website) een regel <code>CMS_TOKEN=</code> met die sleutel en deploy de website.</li>
      <li>Zet dezelfde regel <code>CMS_TOKEN=</code> in de <code>.env</code> van app.pr3nt.nl en herstart de app.</li>
    </ol></div></section>` : `<p><a class="btn" href="${url()}">Terug naar het overzicht</a></p>`);
  return renderAdmin({ title: 'Website', user, active, body });
}

// ---------- Velden ----------

const attrs = (a = {}) => Object.entries(a).filter(([, v]) => v !== false && v != null).map(([k, v]) => (v === true ? ` ${k}` : ` ${k}="${e(v)}"`)).join('');

export function input({ label, name, value = '', type = 'text', hint = '', wide = false, ...rest }) {
  return `<label class="field${wide ? ' span-2' : ''}"><span>${e(label)}${hint ? ` <small>${e(hint)}</small>` : ''}</span><input type="${type}" name="${e(name)}" value="${e(value ?? '')}"${attrs(rest)}></label>`;
}

export function textarea({ label, name, value = '', hint = '', wide = true, rows = 4, ...rest }) {
  return `<label class="field${wide ? ' span-2' : ''}"><span>${e(label)}${hint ? ` <small>${e(hint)}</small>` : ''}</span><textarea name="${e(name)}" rows="${rows}"${attrs(rest)}>${e(value ?? '')}</textarea></label>`;
}

export function select({ label, name, value = '', options = [], hint = '', wide = false, ...rest }) {
  const opts = options.map((o) => (Array.isArray(o) ? o : [o, o])).map(([v, l]) => `<option value="${e(v)}"${String(v) === String(value ?? '') ? ' selected' : ''}>${e(l)}</option>`).join('');
  return `<label class="field${wide ? ' span-2' : ''}"><span>${e(label)}${hint ? ` <small>${e(hint)}</small>` : ''}</span><select name="${e(name)}"${attrs(rest)}>${opts}</select></label>`;
}

export function toggle({ label, name, checked = false, value = '1', ...rest }) {
  return `<label class="toggle"><input type="checkbox" name="${e(name)}" value="${e(value)}"${checked ? ' checked' : ''}${attrs(rest)}><span>${e(label)}</span></label>`;
}

export const hidden = (name, value) => `<input type="hidden" name="${e(name)}" value="${e(value ?? '')}">`;

export function panel(title, body, { actions = '', cls = '', id = '' } = {}) {
  return `<section class="panel ${cls}"${id ? ` id="${e(id)}"` : ''}>${title || actions ? `<div class="panel-head">${title ? `<h2>${title}</h2>` : '<span></span>'}${actions ? `<div class="btn-row">${actions}</div>` : ''}</div>` : ''}<div class="panel-body">${body}</div></section>`;
}

export function table(head, rows, { empty = 'Nog niets hier.', cls = '' } = {}) {
  if (!rows.length) return emptyState(empty);
  return `<div class="cms-table-wrap"><table class="cms-table ${cls}"><thead><tr>${head.map((h) => `<th${/^(Prijs|Bedrag|Inkoop|Marge|Score|Hits|Orders|Totaal|Bezoekers|Aanvragen|Conversie|Weergaven)/.test(h) ? ' class="num"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table></div>`;
}

export function tabs(items, active) {
  return `<nav class="tabs cms-tabs" aria-label="Onderdelen">${items.map(([key, href, label, count]) => `<a href="${e(href)}"${key === active ? ' aria-selected="true"' : ''}>${e(label)}${count ? ` <span>${e(count)}</span>` : ''}</a>`).join('')}</nav>`;
}

export const pill = (text, tone = '') => `<span class="pill ${tone}">${e(text)}</span>`;

export const euro = (v) => (v == null || v === '' ? '–' : `€ ${Number(v).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);

export function dateText(v, time = false) {
  if (!v) return '';
  const d = new Date(String(v).includes('T') || String(v).endsWith('Z') ? v : `${String(v).replace(' ', 'T')}Z`);
  if (Number.isNaN(d.getTime())) return String(v);
  return d.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', year: 'numeric', ...(time ? { hour: '2-digit', minute: '2-digit' } : {}) });
}

export const agoText = (v) => (v ? ago(String(v).includes('T') ? v : `${String(v).replace(' ', 'T')}Z`) : '');

export const statusPill = (status) => {
  if (status === 'live') return pill('Live', 'ok');
  if (status === 'gewijzigd') return pill('Live, met wijzigingen', 'wait');
  return pill('Concept', '');
};

// ---------- SEO-blok (met Google-voorbeeld) ----------

export function seoPanel({ seo = {}, path = '', fallbackTitle = '', fallbackDescription = '', prefix = 'seo_' }) {
  const s = seo || {};
  const full = `${siteUrl()}${path === '/' ? '' : path}`;
  return panel('SEO en delen', `
    <div class="serp" data-serp>
      <span class="serp-url">${e(full.replace(/^https?:\/\//, '').replace(/\//g, ' › '))}</span>
      <strong class="serp-title" data-serp-title data-fallback="${e(fallbackTitle)}">${e(s.title || fallbackTitle || 'Paginatitel')}</strong>
      <p class="serp-desc" data-serp-desc data-fallback="${e(fallbackDescription)}">${e(s.description || fallbackDescription || 'Omschrijving die Google onder de titel toont.')}</p>
    </div>
    <label class="field"><span>Titel in Google <small data-count-for="${prefix}title" data-min="30" data-max="60"></small></span><input name="${prefix}title" value="${e(s.title || '')}" placeholder="${e(fallbackTitle)}" maxlength="120" data-serp-input="title"></label>
    <label class="field"><span>Omschrijving in Google <small data-count-for="${prefix}description" data-min="120" data-max="155"></small></span><textarea name="${prefix}description" rows="3" maxlength="320" placeholder="${e(fallbackDescription)}" data-serp-input="desc">${e(s.description || '')}</textarea></label>
    <label class="field"><span>Zoekwoord <small>waar moet deze pagina op gevonden worden?</small></span><input name="${prefix}keyword" value="${e(s.keyword || '')}" placeholder="bijv. 3d printen laten doen" data-keyword></label>
    <div class="keyword-check" data-keyword-check hidden></div>
    <label class="field"><span>Deelafbeelding <small>WhatsApp, Facebook, LinkedIn · 1200 × 630</small></span><input name="${prefix}image" value="${e(s.image || '')}" placeholder="/media/foto.jpg" list="cms-media"></label>
    <details class="cms-more"><summary>Geavanceerd</summary>
      <label class="field"><span>Canonieke link <small>alleen invullen bij dubbele inhoud</small></span><input name="${prefix}canonical" value="${e(s.canonical || '')}" placeholder="${e(full)}"></label>
      ${toggle({ label: 'Niet laten indexeren door Google (noindex)', name: `${prefix}noindex`, checked: !!s.noindex })}
    </details>
    <p class="muted small">Leeg laten = de titel en omschrijving van de pagina zelf.</p>`, { cls: 'cms-seo' });
}

export const seoFromBody = (body, prefix = 'seo_') => ({
  title: body[`${prefix}title`] ?? '', description: body[`${prefix}description`] ?? '', keyword: body[`${prefix}keyword`] ?? '',
  image: body[`${prefix}image`] ?? '', canonical: body[`${prefix}canonical`] ?? '', noindex: body[`${prefix}noindex`] === '1',
});

/** Versies met een knop om terug te zetten. `inForm`: het paneel staat in een ander formulier (geen geneste forms). */
export function revisionsPanel(revisions = [], { inForm = false } = {}) {
  if (!revisions.length) return panel('Versies', '<p class="muted small">Elke keer dat je opslaat, bewaren we de vorige versie. Je kunt dan altijd terug.</p>');
  const ask = 'Deze versie terugzetten? De huidige versie wordt eerst bewaard. Wat je nu nog niet hebt opgeslagen, gaat verloren.';
  const button = (r) => (inForm
    ? `<button class="btn btn-quiet" type="submit" formaction="${url(`/versies/${r.id}/terugzetten`)}" formnovalidate data-confirm-click="${e(ask)}">Terugzetten</button>`
    : `<form method="post" action="${url(`/versies/${r.id}/terugzetten`)}" data-confirm="${e(ask)}"><button class="btn btn-quiet" type="submit">Terugzetten</button></form>`);
  return panel('Versies', `<ul class="cms-revisions">${revisions.slice(0, 12).map((r) => `<li><span><strong>${e(r.note || 'Versie')}</strong><small>${e(dateText(r.created_at, true))}</small></span>${button(r)}</li>`).join('')}</ul>`);
}

export const mediaDatalist = (names = []) => `<datalist id="cms-media">${names.map((n) => `<option value="/media/${e(n)}"></option>`).join('')}</datalist>`;

/** Opslaan-balk onderaan een formulier (gebruikt de bestaande 'niet opgeslagen'-logica van het beheer). */
export function savebar(buttons, text = 'Alles is opgeslagen') {
  return `<div class="savebar" data-savebar><span class="savebar-text" data-save-text>${e(text)}</span>${buttons}</div>`;
}
