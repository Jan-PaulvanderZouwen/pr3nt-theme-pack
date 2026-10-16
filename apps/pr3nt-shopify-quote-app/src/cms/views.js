// De schermen van het website-CMS. Alle gegevens komen van pr3nt.nl (zie client.js).
import {
  e, url, cmsPage, pageHead, panel, table, tabs, pill, euro, dateText, agoText, statusPill, input, textarea, select, toggle, hidden,
  seoPanel, revisionsPanel, mediaDatalist, savebar, dataScript, emptyState,
} from './ui.js';
import { siteUrl } from './client.js';

const site = () => siteUrl();
const ext = (href, label = 'Bekijk op pr3nt.nl ↗') => `<a class="btn" href="${e(href)}" target="_blank" rel="noopener">${label}</a>`;

// ---------- Overzicht ----------

export function overviewView({ user, data, flash }) {
  const c = data.counts;
  const kpi = (label, value, sub = '', href = '', i = 0) => `<a class="kpi cms-kpi" style="--i:${i}" href="${href}"><span class="label">${e(label)}</span><strong>${value}</strong>${sub ? `<small>${sub}</small>` : ''}</a>`;
  const kpis = `<section class="kpis">${[
    kpi('Open bestellingen', c.openOrders, c.ordersToday ? `${c.ordersToday} vandaag` : 'webshop en reserve-aanvragen', url('/bestellingen?open=1'), 0),
    kpi('Omzet webshop', euro(c.revenueMonth), 'betaald deze maand', url('/bestellingen'), 1),
    kpi('Berichten', c.messages, c.messages ? 'wachten op antwoord' : 'alles beantwoord', url('/berichten'), 2),
    kpi('SEO-score', data.seo ? `${data.seo.score}<small>/100</small>` : '–', data.seo ? `${data.seo.errors} fouten, ${data.seo.warnings} aandachtspunten` : 'nog niet gescand', url('/seo'), 3),
    kpi('Pagina’s in Google', c.urls, `${c.articles} artikelen · ${c.products} producten`, url('/seo'), 4),
  ].join('')}</section>`;

  const todo = [
    c.messages && [`${c.messages} ${c.messages === 1 ? 'bericht' : 'berichten'} beantwoorden`, url('/berichten')],
    c.applications && [`${c.applications} ${c.applications === 1 ? 'aanmelding' : 'aanmeldingen'} van producenten beoordelen`, url('/producenten')],
    c.pagesChanged && [`${c.pagesChanged} ${c.pagesChanged === 1 ? 'pagina heeft' : 'pagina’s hebben'} wijzigingen die nog niet live staan`, url('/paginas')],
    c.drafts && [`${c.drafts} ${c.drafts === 1 ? 'artikel staat' : 'artikelen staan'} nog als concept`, url('/kennisbank')],
    c.noPurchase && [`${c.noPurchase} ${c.noPurchase === 1 ? 'product heeft' : 'producten hebben'} nog geen inkoopprijs (dan zie je je marge niet)`, url('/producten')],
    c.outOfStock && [`${c.outOfStock} ${c.outOfStock === 1 ? 'product is' : 'producten zijn'} uitverkocht`, url('/producten?voorraad=0')],
    c.notFound && [`${c.notFound} ${c.notFound === 1 ? 'kapotte link wordt' : 'kapotte links worden'} bezocht: stuur ze door`, url('/seo/doorverwijzingen')],
    data.seo?.errors && [`${data.seo.errors} SEO-fouten oplossen`, url('/seo')],
    !data.seo && ['Laat de SEO van je site controleren', url('/seo')],
    !data.mail && ['E-mail van de website werkt nog niet: zet SMTP_URL in de .env van de website', url('/instellingen?tab=email')],
  ].filter(Boolean);
  const todoHtml = todo.length ? `<ul class="cms-todo">${todo.map(([t, h]) => `<li><a href="${h}"><span>${e(t)}</span><span aria-hidden="true">→</span></a></li>`).join('')}</ul>` : '<p class="muted">Niets te doen. Mooi zo.</p>';

  const orders = data.recentOrders.length ? `<ul class="cms-list">${data.recentOrders.map((o) => `<li><a href="${url(`/bestellingen/${encodeURIComponent(o.id)}`)}"><span><strong>${e(o.name)}</strong><small>${e(o.id)} · ${o.kind === 'filament' ? 'Webshop' : 'Print'} · ${e(agoText(o.created_at))}</small></span><span class="cms-list-end">${pill(o.status, /Geleverd|voltooid|Verzonden/.test(o.status) ? 'ok' : 'wait')}<small>${euro(o.amount)}</small></span></a></li>`).join('')}</ul>` : emptyState('Nog geen bestellingen');
  const kindLabel = { page: 'Pagina', article: 'Artikel', setting: 'Instelling' };
  const changes = data.recentChanges.length ? `<ul class="cms-list">${data.recentChanges.map((r) => `<li><span><strong>${e(kindLabel[r.kind] || r.kind)}: ${e(r.ref)}</strong><small>${e(r.note)} · ${e(agoText(r.created_at))}</small></span></li>`).join('')}</ul>` : '<p class="muted small">Wijzigingen die je hier doet, zie je in dit lijstje terug.</p>';

  const quick = `<div class="cms-quick">
    <a href="${url('/paginas/nieuw')}"><strong>Nieuwe pagina</strong><span>Bouw een pagina met blokken</span></a>
    <a href="${url('/kennisbank/nieuw')}"><strong>Nieuw artikel</strong><span>Schrijf voor de kennisbank</span></a>
    <a href="${url('/producten/nieuw')}"><strong>Nieuw product</strong><span>Voeg filament toe aan de shop</span></a>
    <a href="${url('/media')}"><strong>Foto’s</strong><span>Upload of vervang foto’s</span></a>
  </div>`;

  const head = pageHead({ eyebrow: 'Website', title: 'pr3nt.nl beheren', text: 'Pagina’s, kennisbank, webshop, foto’s en SEO. Wat je hier opslaat, staat direct op de website.', actions: ext(site(), 'pr3nt.nl openen ↗') });
  const body = `${head}${kpis}${quick}<div class="grid-2">${panel('Te doen', todoHtml)}${panel('Laatste bestellingen', orders, { actions: `<a class="btn btn-quiet" href="${url('/bestellingen')}">Alles</a>` })}</div>
    <div class="grid-2">${panel('Laatste wijzigingen', changes)}${panel('Koppelingen', `<dl class="spec"><dt>Website</dt><dd>${pill('Verbonden', 'ok')}</dd><dt>E-mail</dt><dd>${data.mail ? pill('Werkt', 'ok') : pill('Niet ingesteld', 'wait')}</dd><dt>Online betalen</dt><dd>${data.mollie ? pill('Mollie aan', 'ok') : pill('Uit: klant krijgt betaalverzoek per mail', 'wait')}</dd></dl>`)}</div>`;
  return cmsPage({ title: 'Website', user, active: 'cms', body, flash });
}

// ---------- Pagina's ----------

const FIXED = [
  ['/', 'Homepage'], ['/bestellen', 'Offerte aanvragen'], ['/prijzen', 'Prijzen'], ['/materialen', 'Materialen'], ['/3d-printen', '3D printen laten doen'],
  ['/voor-bedrijven', 'Voor bedrijven'], ['/filament', 'Filament (webshop)'], ['/kennisbank', 'Kennisbank'], ['/inspiratie', 'Inspiratie'],
  ['/producent-worden', 'Producent worden'], ['/faq', 'Veelgestelde vragen'], ['/contact', 'Contact'], ['/privacy', 'Privacy'], ['/voorwaarden', 'Voorwaarden'],
];

export function pagesView({ user, pages, flash }) {
  const rows = pages.map((p) => `<tr><td><a class="cms-strong" href="${url(`/paginas/${p.id}`)}">${e(p.data.title)}</a></td><td class="mono small">/${e(p.slug)}</td><td>${statusPill(p.status)}</td><td class="muted small">${e(agoText(p.updated_at))}</td><td class="cms-actions">${p.published ? `<a class="btn btn-quiet" href="${e(p.url)}" target="_blank" rel="noopener">Bekijk ↗</a>` : ''}<a class="btn btn-quiet" href="${url(`/paginas/${p.id}`)}">Bewerken</a></td></tr>`);
  const fixed = FIXED.map(([path, label]) => `<tr><td>${e(label)}</td><td class="mono small">${e(path)}</td><td class="cms-actions"><a class="btn btn-quiet" href="${e(site() + path)}" target="_blank" rel="noopener">Bekijk ↗</a><a class="btn btn-quiet" href="${url(`/seo/pagina?path=${encodeURIComponent(path)}`)}">SEO</a></td></tr>`);
  const head = pageHead({ eyebrow: 'Website', title: 'Pagina’s', text: 'Maak eigen pagina’s met blokken: tekst, foto’s, vragen, het offerteformulier of producten uit de shop.', actions: `<a class="btn btn-primary" href="${url('/paginas/nieuw')}">Nieuwe pagina</a>` });
  const body = head + panel('Eigen pagina’s', table(['Titel', 'Adres', 'Status', 'Bijgewerkt', ''], rows, { empty: 'Nog geen eigen pagina’s. Maak je eerste pagina, bijvoorbeeld “Over ons”.' }), { cls: 'flush-body' })
    + panel('Vaste pagina’s', `<p class="muted small">Deze pagina’s zijn onderdeel van de website. Je past hun teksten in Google aan via SEO, en hun foto’s via Foto’s.</p>${table(['Pagina', 'Adres', ''], fixed)}`);
  return cmsPage({ title: 'Pagina’s', user, active: 'cms-pages', body, flash });
}

export function pageEditView({ user, page, meta, revisions = [], error = '', flash = '' }) {
  const isNew = !page.id;
  const d = page.data;
  const status = isNew ? '' : statusPill(page.status);
  const head = pageHead({
    eyebrow: `<a href="${url('/paginas')}">Pagina’s</a>`, title: isNew ? 'Nieuwe pagina' : e(d.title),
    text: isNew ? 'Begin met een titel en voeg daarna blokken toe.' : `${status} <span class="mono small">${e(site())}/${e(page.slug)}</span>`,
    actions: isNew ? '' : `${page.published ? ext(page.url) : ''}<a class="btn" href="${e(page.preview)}" target="_blank" rel="noopener">Voorbeeld ↗</a>`,
  });
  const main = panel('', `<div class="form-grid">
      ${input({ label: 'Titel', name: 'title', value: d.title, required: true, wide: true, 'data-slug-source': true })}
      <label class="field span-2"><span>Webadres</span><div class="cms-slug"><span>${e(site().replace(/^https?:\/\//, ''))}/</span><input name="slug" value="${e(d.slug)}" data-slug ${isNew ? 'data-slug-auto' : ''} placeholder="over-ons"></div></label>
      ${textarea({ label: 'Introtekst', name: 'intro', value: d.intro, hint: 'onder de titel; ook de omschrijving voor Google als je die niet invult', rows: 2 })}
    </div>`) + `<section class="panel"><div class="panel-head"><h2>Blokken</h2><span class="muted small">Sleep of gebruik de pijltjes om de volgorde te wijzigen</span></div><div class="panel-body"><div class="pblocks" data-blocks></div>
      <div class="block-add"><span class="label">Blok toevoegen</span><div class="chips" data-block-add></div></div></div></section>`;
  const actions = isNew ? '' : `<div class="btn-row">
      <button class="btn btn-quiet" type="submit" name="action" value="dupliceren" formnovalidate>Dupliceren</button>
      ${page.published ? '<button class="btn btn-quiet" type="submit" name="action" value="offline" formnovalidate data-confirm-click="Pagina offline halen? Bezoekers krijgen dan een 404.">Offline halen</button>' : ''}
      <button class="btn btn-quiet cms-danger" type="submit" name="action" value="verwijderen" formnovalidate data-confirm-click="Pagina definitief verwijderen?">Verwijderen</button></div>`;
  const side = panel('Publiceren', `<p class="small muted">${isNew ? 'Sla op als concept om eerst een voorbeeld te bekijken.' : page.status === 'gewijzigd' ? 'Er staan wijzigingen klaar die nog niet live zijn.' : page.published ? `Live sinds ${e(dateText(page.published_at, true))}.` : 'Nog niet zichtbaar voor bezoekers.'}</p>${toggle({ label: 'Kruimelpad tonen', name: 'breadcrumbs', checked: d.breadcrumbs !== false })}${actions}`)
    + seoPanel({ seo: page.seo, path: `/${d.slug || ''}`, fallbackTitle: d.title, fallbackDescription: d.intro })
    + (isNew ? '' : revisionsPanel(revisions, { inForm: true }));
  const form = `<form method="post" class="cms-editor" data-dirty-form id="page-form" data-page-editor>
    ${hidden('blocks', JSON.stringify(d.blocks || []))}
    <div class="cms-editor-main">${main}</div><aside class="cms-editor-side">${side}</aside>
    ${savebar(`<button class="btn" type="submit" name="action" value="concept">Opslaan als concept</button><button class="btn btn-primary" type="submit" name="action" value="publiceren">${page.published ? 'Opslaan en publiceren' : 'Publiceren'}</button>`, isNew ? 'Nog niet opgeslagen' : 'Alles is opgeslagen')}
  </form>${mediaDatalist(meta.media)}${dataScript('cms-meta', { categories: meta.productCategories, articleCategories: meta.articleCategories, media: meta.media, site: site() })}`;
  return cmsPage({ title: isNew ? 'Nieuwe pagina' : d.title, user, active: 'cms-pages', body: head + form, error, flash });
}

// ---------- Kennisbank ----------

export function articlesView({ user, articles, categories, flash, q = '', cat = '' }) {
  const list = articles.filter((a) => (!cat || a.category === cat) && (!q || `${a.title} ${a.description}`.toLowerCase().includes(q.toLowerCase())));
  const rows = list.map((a) => `<tr><td><a class="cms-strong" href="${url(`/kennisbank/${encodeURIComponent(a.slug)}`)}">${e(a.title)}</a><div class="muted small">${e(a.description.slice(0, 110))}${a.description.length > 110 ? '…' : ''}</div></td><td class="small">${e(categories[a.category] || a.category)}</td><td>${a.draft ? pill('Concept') : pill('Live', 'ok')}${a.featured ? ' ' + pill('Uitgelicht', 'act') : ''}</td><td class="small muted">${e(dateText(a.updated || a.published))}</td><td class="cms-actions"><a class="btn btn-quiet" href="${e(a.preview)}" target="_blank" rel="noopener">${a.draft ? 'Voorbeeld' : 'Bekijk'} ↗</a></td></tr>`);
  const filters = `<form class="cms-filters" method="get"><input type="search" name="q" value="${e(q)}" placeholder="Zoek een artikel" data-search-input>${select({ label: 'Categorie', name: 'categorie', value: cat, options: [['', 'Alle categorieën'], ...Object.entries(categories)], onchange: 'this.form.submit()' })}</form>`;
  const head = pageHead({ eyebrow: 'Website', title: 'Kennisbank', text: `${articles.filter((a) => !a.draft).length} artikelen live${articles.some((a) => a.draft) ? `, ${articles.filter((a) => a.draft).length} concept` : ''}. Goede artikelen brengen bezoekers via Google.`, actions: `<a class="btn btn-primary" href="${url('/kennisbank/nieuw')}">Nieuw artikel</a>` });
  return cmsPage({ title: 'Kennisbank', user, active: 'cms-articles', body: head + filters + panel('', table(['Artikel', 'Categorie', 'Status', 'Datum', ''], rows, { empty: 'Geen artikelen gevonden.' })), flash });
}

export function articleEditView({ user, article: a, meta, revisions = [], error = '', flash = '' }) {
  const isNew = !a.url;
  const cats = Object.entries(meta.articleCategories);
  const head = pageHead({
    eyebrow: `<a href="${url('/kennisbank')}">Kennisbank</a>`, title: isNew ? 'Nieuw artikel' : e(a.title),
    text: isNew ? 'Schrijf in gewone tekst. Met ## maak je een kopje.' : `${a.draft ? pill('Concept') : pill('Live', 'ok')} <span class="mono small">${e(site())}/kennisbank/${e(a.slug)}</span>`,
    actions: isNew ? '' : `<a class="btn" href="${e(a.preview)}" target="_blank" rel="noopener">${a.draft ? 'Voorbeeld' : 'Bekijk op pr3nt.nl'} ↗</a>`,
  });
  const faq = (a.faq || []).concat([{ q: '', a: '' }]);
  const main = panel('', `<div class="form-grid">
      ${input({ label: 'Titel', name: 'title', value: a.title, required: true, wide: true, 'data-slug-source': true })}
      <label class="field span-2"><span>Webadres</span><div class="cms-slug"><span>/kennisbank/</span><input name="slug" value="${e(a.slug)}" data-slug ${isNew ? 'data-slug-auto' : ''}></div></label>
      <label class="field span-2"><span>Omschrijving <small>op de overzichtspagina en in Google · <span data-count-for="description" data-min="120" data-max="160"></span></small></span><textarea name="description" rows="2" maxlength="300" required>${e(a.description)}</textarea></label>
    </div>`) + `<section class="panel"><div class="panel-head"><h2>Tekst</h2><div class="md-tools" data-md-tools="body">
        <button type="button" data-md="h2" title="Kopje">H2</button><button type="button" data-md="h3" title="Subkopje">H3</button><button type="button" data-md="bold" title="Vet"><b>B</b></button><button type="button" data-md="italic" title="Schuin"><i>I</i></button><button type="button" data-md="list" title="Opsomming">• Lijst</button><button type="button" data-md="link" title="Link">Link</button><button type="button" data-md="image" title="Foto">Foto</button>
        <button type="button" data-md-preview="body" class="md-preview-btn">Voorbeeld</button></div></div>
      <div class="panel-body"><div class="md-wrap"><textarea name="body" class="md-editor" rows="24" data-md-editor>${e(a.body)}</textarea><div class="md-preview prose" data-md-preview-for="body" hidden></div></div>
      <p class="muted small" data-wordcount-for="body"></p></div></section>`
    + panel('Veelgestelde vragen bij dit artikel', `<p class="muted small">Komen als uitklapvragen onder het artikel en als vraag-antwoord in Google.</p><div class="repeat" data-repeat="faq">${faq.map((f, i) => `<div class="repeat-row" data-repeat-row><input name="faq_q" value="${e(f.q)}" placeholder="Vraag"><textarea name="faq_a" rows="2" placeholder="Antwoord">${e(f.a)}</textarea><button type="button" class="btn btn-quiet" data-repeat-remove aria-label="Verwijderen">✕</button></div>`).join('')}</div><button type="button" class="btn btn-quiet" data-repeat-add="faq">+ Vraag toevoegen</button>`);
  const side = panel('Publiceren', `${select({ label: 'Categorie', name: 'category', value: a.category, options: cats })}${input({ label: 'Publicatiedatum', name: 'published', type: 'date', value: a.published })}${toggle({ label: 'Concept (nog niet zichtbaar)', name: 'draft', checked: !!a.draft })}${toggle({ label: 'Uitlichten op de homepage', name: 'featured', checked: !!a.featured })}
      ${isNew ? '' : '<div class="btn-row"><button class="btn btn-quiet cms-danger" type="submit" name="action" value="verwijderen" formnovalidate data-confirm-click="Artikel definitief verwijderen?">Verwijderen</button></div>'}`)
    + seoPanel({ seo: a.seo, path: `/kennisbank/${a.slug || ''}`, fallbackTitle: a.title, fallbackDescription: a.description })
    + (isNew ? '' : revisionsPanel(revisions, { inForm: true }));
  const form = `<form method="post" class="cms-editor" data-dirty-form id="article-form">
    <div class="cms-editor-main">${main}</div><aside class="cms-editor-side">${side}</aside>
    ${savebar('<button class="btn btn-primary" type="submit" name="action" value="opslaan">Opslaan</button>', isNew ? 'Nog niet opgeslagen' : 'Alles is opgeslagen')}
  </form>${mediaDatalist(meta.media)}${dataScript('cms-meta', { media: meta.media, site: site() })}`;
  return cmsPage({ title: isNew ? 'Nieuw artikel' : a.title, user, active: 'cms-articles', body: head + form, error, flash, scripts: '<script src="https://cdn.jsdelivr.net/npm/marked@12.0.2/marked.min.js" defer></script>' });
}

// ---------- Webshop ----------

const shopTabs = (active) => tabs([['producten', url('/producten'), 'Producten'], ['categorieen', url('/producten/categorieen'), 'Categorieën'], ['instellingen', url('/producten/instellingen'), 'Shopinstellingen']], active);

export function productsView({ user, products, categories, shop, query, flash }) {
  const { q = '', cat = '', voorraad = '' } = query;
  const list = products.filter((p) => (!cat || String(p.category_id ?? 0) === cat) && (voorraad === '' || String(p.in_stock) === voorraad) && (!q || `${p.brand} ${p.name} ${p.sku} ${p.material}`.toLowerCase().includes(q.toLowerCase())));
  const catName = (id) => categories.find((c) => c.id === id)?.name ?? 'Overig';
  const margins = list.map((p) => p.margin?.pct).filter((x) => x != null);
  const rows = list.map((p) => `<tr>
    <td><input type="checkbox" name="ids" value="${p.id}" form="bulk-form" aria-label="Selecteer ${e(p.name)}"></td>
    <td><a class="cms-product" href="${url(`/producten/${p.id}`)}">${p.images[0] ? `<img src="${e(site() + p.images[0])}" alt="" loading="lazy">` : `<span class="cms-spool" style="--c:#9AA3AC"></span>`}<span><strong>${e(`${p.brand} ${p.name}`.trim())}</strong><small>${e(p.sku)} · ${e(p.material)} · ${p.colors.length} ${p.colors.length === 1 ? 'kleur' : 'kleuren'}</small></span></a></td>
    <td class="small">${e(catName(p.category_id))}</td>
    <td class="num">${euro(p.price)}</td><td class="num muted">${p.purchase_price ? euro(p.purchase_price) : '–'}</td>
    <td class="num">${p.margin ? `<span class="${p.margin.pct < 20 ? 'cms-low' : ''}">${p.margin.pct}%</span>` : '<span class="muted">–</span>'}</td>
    <td>${p.in_stock ? pill('Op voorraad', 'ok') : pill('Uitverkocht', 'wait')}${p.featured ? ' ' + pill('Favoriet', 'act') : ''}</td></tr>`);
  const filters = `<form class="cms-filters" method="get"><input type="search" name="q" value="${e(q)}" placeholder="Zoek op naam, merk of code" data-search-input>
    ${select({ label: 'Categorie', name: 'cat', value: cat, options: [['', 'Alle categorieën'], ...categories.map((c) => [String(c.id), c.name]), ['0', 'Overig']], onchange: 'this.form.submit()' })}
    ${select({ label: 'Voorraad', name: 'voorraad', value: voorraad, options: [['', 'Alles'], ['1', 'Op voorraad'], ['0', 'Uitverkocht']], onchange: 'this.form.submit()' })}</form>`;
  const bulk = `<form method="post" action="${url('/producten/bulk')}" id="bulk-form" class="cms-bulk" data-bulk><span class="small muted" data-bulk-count>Selecteer producten voor een actie</span>
    <select name="bulk"><option value="">Kies een actie</option><option value="stock:1">Op voorraad zetten</option><option value="stock:0">Uitverkocht zetten</option><option value="featured:1">Favoriet maken</option><option value="featured:0">Geen favoriet</option>${categories.map((c) => `<option value="category:${c.id}">Naar ${e(c.name)}</option>`).join('')}<option value="delete">Verwijderen</option></select><button class="btn btn-dark" type="submit">Toepassen</button></form>`;
  const head = pageHead({ eyebrow: 'Webshop', title: 'Producten', text: `${products.length} producten · gemiddelde marge ${margins.length ? Math.round(margins.reduce((a, b) => a + b, 0) / margins.length) + '%' : 'onbekend (vul inkoopprijzen in)'} · opslag ${e(shop.marginPercent)}%`, actions: `<form method="post" action="${url('/producten/herprijzen')}" data-confirm="Alle verkoopprijzen opnieuw berekenen uit de inkoopprijs en ${e(shop.marginPercent)}% opslag?"><button class="btn" type="submit">Prijzen herberekenen</button></form><a class="btn btn-primary" href="${url('/producten/nieuw')}">Nieuw product</a>` });
  return cmsPage({ title: 'Producten', user, active: 'cms-shop', body: head + shopTabs('producten') + filters + panel('', bulk + table(['<input type="checkbox" data-check-all aria-label="Alles selecteren">', 'Product', 'Categorie', 'Prijs', 'Inkoop', 'Marge', 'Status'], rows, { empty: 'Geen producten gevonden.' })), flash });
}

export function productEditView({ user, product: p, meta, error = '', flash = '' }) {
  const isNew = !p.id;
  const ps = p.print_settings || {};
  const def = p.printDefaults || {};
  const head = pageHead({ eyebrow: `<a href="${url('/producten')}">Producten</a>`, title: isNew ? 'Nieuw product' : e(`${p.brand} ${p.name}`.trim()), text: isNew ? '' : `<span class="mono small">${e(site())}/filament/${e(p.slug)}</span>`, actions: isNew ? '' : ext(p.url) });
  const psField = (k, l) => input({ label: l, name: `ps_${k}`, value: ps[k] || '', placeholder: def[k] || '' });
  const main = panel('Product', `<div class="form-grid">
      ${input({ label: 'Naam', name: 'name', value: p.name, required: true, 'data-slug-source': true })}${input({ label: 'Merk', name: 'brand', value: p.brand })}
      ${input({ label: 'Artikelcode', name: 'sku', value: p.sku, required: true })}${select({ label: 'Categorie', name: 'category_id', value: p.category_id ?? '', options: [['', 'Overig'], ...meta.productCategories.map((c) => [c.id, c.name])] })}
      ${input({ label: 'Materiaal', name: 'material', value: p.material })}${input({ label: 'Gewicht', name: 'weight', value: p.weight })}
      ${input({ label: 'Diameter', name: 'diameter', value: p.diameter })}${input({ label: 'Volgorde', name: 'sort', value: p.sort, type: 'number' })}
      <label class="field span-2"><span>Webadres</span><div class="cms-slug"><span>/filament/</span><input name="slug" value="${e(p.slug)}" data-slug ${isNew ? 'data-slug-auto' : ''}></div></label>
    </div>`)
    + panel('Prijs en marge', `<div class="form-grid" data-margin data-markup="${e(meta.shop.marginPercent)}">
      ${input({ label: 'Inkoopprijs excl. btw', name: 'purchase_price', value: p.purchase_price ?? '', inputmode: 'decimal', placeholder: '0,00', 'data-purchase': true })}
      ${input({ label: 'Verkoopprijs incl. btw', name: 'price', value: p.price ?? '', inputmode: 'decimal', required: true, 'data-price': true })}
      <div class="span-2 cms-margin" data-margin-out></div>
      <div class="span-2"><button class="btn" type="button" data-calc-price>Prijs berekenen met ${e(meta.shop.marginPercent)}% opslag</button></div></div>`)
    + panel('Teksten', `<div class="form-grid">${textarea({ label: 'Korte omschrijving', name: 'summary', value: p.summary, rows: 2, hint: 'onder de naam en op de productkaart' })}${textarea({ label: 'Omschrijving', name: 'description', value: p.description, rows: 8, hint: 'lege regel = nieuwe alinea' })}${textarea({ label: 'Voordelen', name: 'highlights', value: (p.highlights || []).join('\n'), rows: 4, hint: 'één per regel, als vinkjes naast de koopknop' })}</div>`)
    + panel('Kleuren en voorraad', `<div class="form-grid">${textarea({ label: 'Kleuren', name: 'colors', value: (p.colors || []).join('\n'), rows: 6, hint: 'één per regel. Geen kleurkeuze? Vul “Standaard” in.' })}
      ${(p.colors || []).length > 1 ? `<div class="span-2"><span class="label">Uitverkochte kleuren</span><div class="cms-checks">${p.colors.map((c) => `<label><input type="checkbox" name="colors_out" value="${e(c)}"${(p.colors_out || []).includes(c) ? ' checked' : ''}> ${e(c)}</label>`).join('')}</div></div>` : ''}
      <div class="span-2 btn-row">${toggle({ label: 'Op voorraad', name: 'in_stock', checked: !!p.in_stock })}${toggle({ label: 'Favoriet (bovenaan en met label)', name: 'featured', checked: !!p.featured })}</div></div>`)
    + panel('Zo print je het', `<div class="form-grid">${select({ label: 'Materiaalprofiel', name: 'print_profile', value: p.print_profile, options: [['', 'Geen (accessoire)'], ...meta.printProfiles.map((x) => [x.key, x.label])], hint: 'leeg veld = standaard van het profiel' })}<span></span>
      ${psField('nozzle', 'Nozzle')}${psField('bed', 'Printbed')}${psField('speed', 'Snelheid')}${psField('fan', 'Koelfan')}${psField('enclosure', 'Gesloten printer')}${psField('drying', 'Drogen')}${psField('plate', 'Printplaat')}
      ${textarea({ label: 'Tips', name: 'ps_tips', value: (ps.tips || []).join('\n'), rows: 3, placeholder: (def.tips || []).join('\n'), hint: 'één per regel' })}</div>`);
  const photos = isNew ? panel('Foto’s', '<p class="muted small">Sla het product eerst op; daarna kun je foto’s toevoegen.</p>') : panel('Foto’s', `
      <div class="cms-photos">${(p.images || []).map((src, i) => `<figure><img src="${e(site() + src)}" alt="" loading="lazy"><figcaption>${i === 0 ? pill('Hoofdfoto', 'ok') : `<button class="btn btn-quiet" type="submit" name="action" value="foto-eerst:${e(src)}" formnovalidate>Hoofdfoto</button>`}<button class="btn btn-quiet cms-danger" type="submit" name="action" value="foto-weg:${e(src)}" formnovalidate data-confirm-click="Foto verwijderen?">✕</button></figcaption></figure>`).join('') || '<p class="muted small">Nog geen foto’s. Zonder foto tekent de site een spoel in de gekozen kleur.</p>'}</div>
      <label class="drop"><input type="file" name="files" accept=".jpg,.jpeg,.png,.webp,.avif" multiple form="photo-form" data-autosubmit><span class="drop-text"><strong>Sleep foto’s hierheen</strong> of klik om te kiezen<small>Vierkant op een lichte achtergrond werkt het mooist. Grote foto’s worden verkleind.</small></span><span class="drop-files" aria-live="polite"></span></label>`);
  const side = photos + (isNew ? '' : panel('Acties', `<div class="btn-row"><button class="btn btn-quiet" type="submit" name="action" value="dupliceren" formnovalidate>Dupliceren</button><button class="btn btn-quiet cms-danger" type="submit" name="action" value="verwijderen" formnovalidate data-confirm-click="Product en foto’s definitief verwijderen?">Verwijderen</button></div>`))
    + (isNew ? '' : seoPanel({ seo: p.seo, path: `/filament/${p.slug}`, fallbackTitle: `${p.brand} ${p.name}`.trim(), fallbackDescription: p.summary }));
  const form = `<form method="post" class="cms-editor" data-dirty-form id="product-form">
    <div class="cms-editor-main">${main}</div><aside class="cms-editor-side">${side}</aside>
    ${savebar('<button class="btn btn-primary" type="submit" name="action" value="opslaan">Opslaan</button>', isNew ? 'Nog niet opgeslagen' : 'Alles is opgeslagen')}
  </form>${isNew ? '' : `<form method="post" action="${url(`/producten/${p.id}/fotos`)}" enctype="multipart/form-data" id="photo-form" hidden></form>`}${mediaDatalist(meta.media)}`;
  return cmsPage({ title: isNew ? 'Nieuw product' : p.name, user, active: 'cms-shop', body: head + form, error, flash });
}

export function categoriesView({ user, categories, flash, error }) {
  const rows = categories.map((c) => `<tr><td colspan="5"><form method="post" class="cms-inline" data-confirm-delete>${hidden('id', c.id)}
    <input name="name" value="${e(c.name)}" aria-label="Naam"><input name="slug" value="${e(c.slug)}" aria-label="Webadres" class="mono"><input name="description" value="${e(c.description)}" aria-label="Omschrijving" placeholder="Omschrijving (voor Google)"><input name="sort" value="${e(c.sort)}" type="number" aria-label="Volgorde" style="width:80px">
    <span class="muted small">${c.products} producten</span><button class="btn" name="action" value="opslaan">Opslaan</button><button class="btn btn-quiet cms-danger" name="action" value="verwijderen" data-confirm-click="Categorie verwijderen? De producten komen onder Overig.">✕</button></form></td></tr>`);
  const add = `<form method="post" class="cms-inline">${hidden('action', 'nieuw')}<input name="name" placeholder="Naam, bijv. PLA" required><input name="description" placeholder="Omschrijving (voor Google)"><input name="sort" type="number" placeholder="Volgorde" style="width:110px"><button class="btn btn-primary">Toevoegen</button></form>`;
  const head = pageHead({ eyebrow: 'Webshop', title: 'Categorieën', text: 'Categorieën zijn de filters in de shop en hebben elk een eigen pagina in Google.' });
  return cmsPage({ title: 'Categorieën', user, active: 'cms-shop', body: head + shopTabs('categorieen') + panel('Nieuwe categorie', add) + panel('Categorieën', table(['Naam · webadres · omschrijving · volgorde'], rows, { empty: 'Nog geen categorieën.' })), flash, error });
}

export function shopSettingsView({ user, shop, flash, error }) {
  const head = pageHead({ eyebrow: 'Webshop', title: 'Shopinstellingen', text: 'Verzending, afhalen, opslag op de inkoopprijs en de teksten op elke productpagina.' });
  const form = `<form method="post" data-dirty-form id="shop-form">${panel('Verzending en marge', `<div class="form-grid">
    ${input({ label: 'Opslag op inkoopprijs (%)', name: 'marginPercent', value: shop.marginPercent, inputmode: 'decimal' })}${input({ label: 'Verzendkosten (€)', name: 'shipping', value: shop.shipping, inputmode: 'decimal' })}
    ${input({ label: 'Gratis verzending vanaf (€)', name: 'freeShippingFrom', value: shop.freeShippingFrom, inputmode: 'decimal', hint: '0 = nooit gratis' })}<div class="field">${toggle({ label: 'Afhalen op afspraak mogelijk', name: 'pickup', checked: !!shop.pickup })}</div>
    ${textarea({ label: 'Tekst over levering', name: 'deliveryText', value: shop.deliveryText, rows: 2 })}${textarea({ label: 'Tekst over retourneren', name: 'returnsText', value: shop.returnsText, rows: 3 })}</div>`)}
    ${savebar('<button class="btn btn-primary" type="submit">Opslaan</button>')}</form>`;
  return cmsPage({ title: 'Shopinstellingen', user, active: 'cms-shop', body: head + shopTabs('instellingen') + form, flash, error });
}

// ---------- Bestellingen ----------

export function ordersView({ user, orders, statuses, query, flash }) {
  const { q = '', soort = '', status = '', open = '' } = query;
  const rows = orders.map((o) => `<tr><td><a class="cms-strong mono" href="${url(`/bestellingen/${encodeURIComponent(o.id)}`)}">${e(o.id)}</a></td><td class="small">${e(dateText(o.created_at))}</td><td>${e(o.customer.name)}<div class="muted small">${e(o.customer.email)}</div></td><td class="small">${o.kind === 'filament' ? 'Webshop' : 'Print (reserve)'}</td><td>${pill(o.status, /Geleverd|voltooid|Verzonden/.test(o.status) ? 'ok' : o.status === 'Geannuleerd' ? '' : 'wait')}${o.paid_at ? ' ' + pill('Betaald', 'ok') : ''}</td><td class="num">${euro(o.amount)}</td></tr>`);
  const all = [...new Set([...statuses.filament, ...statuses.print])];
  const filters = `<form class="cms-filters" method="get"><input type="search" name="q" value="${e(q)}" placeholder="Ordernummer, naam of e-mail" data-search-input>
    ${select({ label: 'Soort', name: 'soort', value: soort, options: [['', 'Alles'], ['filament', 'Webshop'], ['print', 'Print (reserve)']], onchange: 'this.form.submit()' })}
    ${select({ label: 'Status', name: 'status', value: status, options: [['', 'Alle statussen'], ...all], onchange: 'this.form.submit()' })}
    <label class="toggle"><input type="checkbox" name="open" value="1"${open === '1' ? ' checked' : ''} onchange="this.form.submit()"><span>Alleen open</span></label></form>`;
  const head = pageHead({ eyebrow: 'Webshop', title: 'Bestellingen', text: 'Filamentbestellingen uit de webshop. Offerte-aanvragen komen bij Orders binnen; alleen als app.pr3nt.nl even onbereikbaar was, staan ze hier als “Print (reserve)”.' });
  return cmsPage({ title: 'Bestellingen', user, active: 'cms-orders', body: head + filters + panel('', table(['Order', 'Datum', 'Klant', 'Soort', 'Status', 'Bedrag'], rows, { empty: 'Geen bestellingen gevonden.' })), flash });
}

export function orderView({ user, order: o, flash, error }) {
  const c = o.customer;
  const d = o.details || {};
  const items = o.items?.length ? `<table class="cms-table"><thead><tr><th>Product</th><th>Kleur</th><th class="num">Aantal</th><th class="num">Bedrag</th></tr></thead><tbody>${o.items.map((i) => `<tr><td>${e(i.name)}</td><td>${e(i.color || '')}</td><td class="num">${e(i.quantity)}</td><td class="num">${euro(i.price * i.quantity)}</td></tr>`).join('')}</tbody></table>` : '';
  const detailRows = Object.entries({ Materiaal: d.material, Kleur: d.color, Omschrijving: d.comment || d.description, Levering: d.delivery === 'afhalen' ? 'Afhalen op afspraak' : d.delivery ? `Verzenden (${euro(d.shipping)})` : '', Spoed: d.rush ? 'Ja' : '' }).filter(([, v]) => v);
  const next = o.statuses[Math.min(o.statuses.indexOf(o.status) + 1, o.statuses.length - 2)] ?? o.status;
  const events = o.events?.length ? `<ul class="cms-timeline">${o.events.map((ev) => `<li><strong>${e(ev.status || ev.note || '')}</strong>${ev.status && ev.note ? `<p>${e(ev.note)}</p>` : ''}<small>${e(dateText(ev.created_at, true))}${ev.visible === 0 ? ' · intern' : ''}</small></li>`).join('')}</ul>` : '<p class="muted small">Nog geen geschiedenis.</p>';
  const head = pageHead({ eyebrow: `<a href="${url('/bestellingen')}">Bestellingen</a>`, title: `<span class="mono">${e(o.id)}</span>`, text: `${pill(o.status, 'wait')} ${o.paid_at ? pill('Betaald', 'ok') : ''} · ${o.kind === 'filament' ? 'Webshop' : 'Print'} · ${e(dateText(o.created_at, true))}`,
    actions: `${o.file_name ? `<a class="btn" href="${url(`/bestellingen/${encodeURIComponent(o.id)}/bestand`)}">3D-bestand downloaden</a>` : ''}<a class="btn" href="mailto:${e(c.email)}?subject=${encodeURIComponent('Je bestelling ' + o.id)}">Mail klant</a>${o.customerUrl ? ext(o.customerUrl, 'Klantpagina ↗') : ''}` });
  const left = panel('Bestelling', `${items}${detailRows.length ? `<dl class="spec">${detailRows.map(([k, v]) => `<dt>${e(k)}</dt><dd class="text">${e(v)}</dd>`).join('')}</dl>` : ''}${o.amount != null ? `<p class="cms-total"><span>Totaal</span><strong>${euro(o.amount)}</strong></p>` : ''}`)
    + panel('Status wijzigen', `<form method="post" class="form">${hidden('action', 'status')}${select({ label: 'Nieuwe status', name: 'status', value: next, options: o.statuses })}${textarea({ label: 'Bericht aan de klant (optioneel)', name: 'note', rows: 2 })}${toggle({ label: 'Klant mailen', name: 'notify', checked: true })}<div><button class="btn btn-dark" type="submit">Status opslaan</button></div></form>`)
    + panel('Bedrag, links en verzending', `<form method="post" class="form-grid">${hidden('action', 'gegevens')}${input({ label: 'Bedrag (€ incl. btw)', name: 'amount', value: o.amount ?? '', inputmode: 'decimal' })}${input({ label: 'Track & trace', name: 'track_trace', value: o.track_trace ?? '' })}${input({ label: 'Betaallink', name: 'payment_url', value: o.payment_url ?? '', placeholder: 'https://', wide: true })}${input({ label: 'Factuurlink', name: 'invoice_url', value: o.invoice_url ?? '', placeholder: 'https://', wide: true })}${textarea({ label: 'Interne notities (ziet de klant niet)', name: 'internal_notes', value: o.internal_notes, rows: 3 })}<div class="span-2"><button class="btn btn-primary" type="submit">Opslaan</button></div></form>`)
    + (o.kind === 'print' ? panel('Producent', `<form method="post" class="form">${hidden('action', 'producent')}${select({ label: 'Wie print deze order?', name: 'producer_id', value: o.producer_id ?? '', options: [['', 'Pr3nt zelf / nog niet toegewezen'], ...o.producers.map((p) => [p.id, p.name || p.email])] })}${toggle({ label: 'Producent is uitbetaald', name: 'producer_paid', checked: !!o.producer_paid_at })}<div><button class="btn" type="submit">Opslaan</button></div></form>`) : '');
  const right = panel('Klant', `<dl class="spec"><dt>Naam</dt><dd>${e(c.name)}</dd><dt>E-mail</dt><dd><a href="mailto:${e(c.email)}">${e(c.email)}</a></dd>${c.phone ? `<dt>Telefoon</dt><dd>${e(c.phone)}</dd>` : ''}<dt>Adres</dt><dd class="text">${e([[c.street, c.houseNumber].filter(Boolean).join(' '), [c.postalCode, c.city].filter(Boolean).join(' '), c.country].filter(Boolean).join('\n'))}</dd></dl>${o.user_id ? `<a class="btn btn-quiet" href="${url(`/klanten/${o.user_id}`)}">Klantgegevens →</a>` : ''}`)
    + panel('Geschiedenis', `${events}<form method="post" class="form">${hidden('action', 'notitie')}${textarea({ label: 'Notitie toevoegen', name: 'note', rows: 2 })}${toggle({ label: 'Zichtbaar voor klant', name: 'visible' })}<div><button class="btn" type="submit">Toevoegen</button></div></form>`)
    + panel('Verwijderen', `<form method="post" class="form" data-confirm="Order ${e(o.id)} definitief verwijderen?">${hidden('action', 'verwijderen')}<p class="muted small">Alleen voor testorders. Dit kan niet ongedaan worden.</p><div><button class="btn btn-quiet cms-danger" type="submit">Order verwijderen</button></div></form>`, { cls: 'cms-danger-zone' });
  return cmsPage({ title: `Order ${o.id}`, user, active: 'cms-orders', body: `${head}<div class="cms-detail"><div class="stack">${left}</div><div class="stack">${right}</div></div>`, flash, error });
}

// ---------- Klanten, berichten, producenten ----------

const roleLabel = { customer: 'Klant', producer: 'Producent', admin: 'Beheerder' };

export function customersView({ user, customers, query, flash }) {
  const rows = customers.map((u) => `<tr><td><a class="cms-strong" href="${url(`/klanten/${u.id}`)}">${e(u.name || u.email)}</a><div class="muted small">${e(u.email)}${u.company ? ` · ${e(u.company)}` : ''}</div></td><td class="small">${e(u.city || '–')}</td><td>${u.active ? pill(roleLabel[u.role] || u.role, u.role === 'customer' ? '' : 'act') : pill('Uitgeschakeld', 'wait')}</td><td class="small muted">${e(dateText(u.created_at))}</td><td class="num">${u.orders}</td><td class="num">${euro(u.total)}</td></tr>`);
  const filters = `<form class="cms-filters" method="get"><input type="search" name="q" value="${e(query.q || '')}" placeholder="Zoek op naam, e-mail, plaats of bedrijf" data-search-input>${select({ label: 'Soort', name: 'rol', value: query.rol || '', options: [['', 'Iedereen'], ['customer', 'Klanten'], ['producer', 'Producenten'], ['admin', 'Beheerders']], onchange: 'this.form.submit()' })}</form>`;
  const head = pageHead({ eyebrow: 'Website', title: 'Klanten', text: 'Accounts op pr3nt.nl. Wie in de webshop bestelt, krijgt er automatisch een.' });
  return cmsPage({ title: 'Klanten', user, active: 'cms-customers', body: head + filters + panel('', table(['Klant', 'Plaats', 'Soort', 'Sinds', 'Orders', 'Totaal'], rows, { empty: 'Geen klanten gevonden.' })), flash });
}

export function customerView({ user, customer: u, orders, flash, error }) {
  const head = pageHead({ eyebrow: `<a href="${url('/klanten')}">Klanten</a>`, title: e(u.name || u.email), text: `${e(u.email)} · klant sinds ${e(dateText(u.created_at))}${u.last_login ? ` · laatst ingelogd ${e(agoText(u.last_login))}` : ''}`, actions: `<form method="post">${hidden('action', 'link')}<button class="btn" type="submit">Wachtwoordlink sturen</button></form>` });
  const form = `<form method="post" data-dirty-form id="customer-form">${hidden('action', 'opslaan')}${panel('Gegevens', `<div class="form-grid">
    ${input({ label: 'Naam', name: 'name', value: u.name })}${input({ label: 'E-mailadres', name: 'email', value: u.email, type: 'email' })}${input({ label: 'Telefoon', name: 'phone', value: u.phone })}${input({ label: 'Bedrijf', name: 'company', value: u.company })}
    ${input({ label: 'Straat', name: 'street', value: u.street })}${input({ label: 'Huisnummer', name: 'house_number', value: u.house_number })}${input({ label: 'Postcode', name: 'postal_code', value: u.postal_code })}${input({ label: 'Plaats', name: 'city', value: u.city })}
    ${select({ label: 'Land', name: 'country', value: u.country, options: ['Nederland', 'België'] })}${select({ label: 'Soort account', name: 'role', value: u.role, options: Object.entries(roleLabel) })}
    ${textarea({ label: 'Notities (ziet de klant niet)', name: 'notes', value: u.notes, rows: 3 })}<div class="span-2">${toggle({ label: 'Account actief', name: 'active', checked: !!u.active })}</div></div>`)}
    ${savebar('<button class="btn btn-primary" type="submit">Opslaan</button>')}</form>`;
  const list = orders.length ? `<ul class="cms-list">${orders.map((o) => `<li><a href="${url(`/bestellingen/${encodeURIComponent(o.id)}`)}"><span><strong class="mono">${e(o.id)}</strong><small>${e(dateText(o.created_at))}</small></span><span class="cms-list-end">${pill(o.status)}<small>${euro(o.amount)}</small></span></a></li>`).join('')}</ul>` : '<p class="muted small">Nog geen bestellingen.</p>';
  return cmsPage({ title: u.name || u.email, user, active: 'cms-customers', body: `${head}<div class="cms-detail"><div>${form}</div><div>${panel('Bestellingen', list)}</div></div>`, flash, error });
}

export function messagesView({ user, messages, showAll, flash }) {
  const list = messages.length ? messages.map((m) => `<article class="panel cms-message${m.handled ? ' is-done' : ''}"><div class="panel-head"><div><strong>${e(m.name)}</strong>${m.company ? ` <span class="muted">· ${e(m.company)}</span>` : ''}<div class="muted small">${e(dateText(m.created_at, true))} · ${e(m.topic)}</div></div>
    <div class="btn-row"><a class="btn" href="mailto:${e(m.email)}?subject=${encodeURIComponent('Re: je bericht aan Pr3nt')}">Beantwoorden</a><form method="post">${hidden('id', m.id)}${hidden('action', 'toggle')}<button class="btn btn-dark" type="submit">${m.handled ? 'Heropenen' : 'Afgehandeld'}</button></form>${m.handled ? `<form method="post" data-confirm="Bericht verwijderen?">${hidden('id', m.id)}${hidden('action', 'verwijderen')}<button class="btn btn-quiet cms-danger" type="submit">Verwijderen</button></form>` : ''}</div></div>
    <div class="panel-body"><p class="cms-pre">${e(m.message)}</p><p class="muted small">${e(m.email)}${m.phone ? ` · ${e(m.phone)}` : ''}</p></div></article>`).join('') : emptyState(showAll ? 'Nog geen berichten' : 'Geen openstaande berichten', 'Berichten van het contactformulier en de zakelijke aanvraag komen hier binnen.');
  const head = pageHead({ eyebrow: 'Website', title: 'Berichten', text: 'Van het contactformulier en de zakelijke aanvraag.', actions: `<a class="btn" href="${url(showAll ? '/berichten' : '/berichten?alles=1')}">${showAll ? 'Alleen open' : 'Ook afgehandelde'}</a>` });
  return cmsPage({ title: 'Berichten', user, active: 'cms-messages', body: head + `<div class="stack">${list}</div>`, flash });
}

export function producersView({ user, applications, producers, flash }) {
  const apps = applications.length ? applications.map((a) => `<article class="panel"><div class="panel-head"><div><strong>${e(a.data.name)}</strong> <span class="muted">· ${e(a.data.city || '')}</span><div class="muted small">${e(dateText(a.created_at))} · ${e(a.data.email)}</div></div>${pill(a.status, a.status === 'nieuw' ? 'wait' : a.status === 'goedgekeurd' ? 'ok' : '')}</div>
    <div class="panel-body"><dl class="spec">${Object.entries(a.data).filter(([k]) => !['name', 'email', 'city'].includes(k)).map(([k, v]) => `<dt>${e(k)}</dt><dd class="text">${e(Array.isArray(v) ? v.join(', ') : v)}</dd>`).join('')}</dl>
    <div class="btn-row">${a.status === 'nieuw' ? `<form method="post" action="${url(`/producenten/${a.id}/goedkeuren`)}"><button class="btn btn-primary">Goedkeuren en welkomstmail sturen</button></form><form method="post" action="${url(`/producenten/${a.id}/afwijzen`)}"><button class="btn">Afwijzen</button></form>` : ''}<form method="post" action="${url(`/producenten/${a.id}/verwijderen`)}" data-confirm="Aanmelding verwijderen?"><button class="btn btn-quiet cms-danger">Verwijderen</button></form></div></div></article>`).join('') : emptyState('Geen aanmeldingen');
  const rows = producers.map((p) => `<tr><td><a class="cms-strong" href="${url(`/klanten/${p.id}`)}">${e(p.name || p.email)}</a><div class="muted small">${e(p.email)}</div></td><td class="small">${e(p.city || '–')}</td><td class="num">${p.open}</td><td class="num">${euro(p.earned)}</td></tr>`);
  const head = pageHead({ eyebrow: 'Website', title: 'Producenten', text: 'Aanmeldingen via pr3nt.nl/producent-worden en de producenten die voor je printen.' });
  return cmsPage({ title: 'Producenten', user, active: 'cms-producers', body: head + panel('Actieve producenten', table(['Producent', 'Plaats', 'Orders', 'Totaal'], rows, { empty: 'Nog geen producenten.' })) + `<h2 class="cms-h2">Aanmeldingen</h2><div class="stack">${apps}</div>`, flash });
}

// ---------- Media ----------

export function mediaView({ user, files, spots, flash, error }) {
  const kb = (n) => (n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.round(n / 1024)} kB`);
  const v = Date.now().toString(36);
  const spotHtml = `<div class="cms-spots">${spots.map((s) => `<figure class="cms-spot"><a href="${e(site() + s.href)}" target="_blank" rel="noopener" class="cms-spot-img">${s.src ? `<img src="${e(site() + s.src)}?v=${v}" alt="" loading="lazy">` : '<span>Nog geen foto</span>'}</a><figcaption><strong>${e(s.label)}</strong><small>${e(s.where)}${s.hint ? ` · ${e(s.hint)}` : ''}</small>
    <form method="post" action="${url('/media/upload')}" enctype="multipart/form-data">${hidden('target', s.file)}<label class="btn btn-primary cms-file-btn">Vervangen<input type="file" name="files" accept="image/jpeg,image/png,image/webp,image/avif" hidden data-autosubmit></label></form></figcaption></figure>`).join('')}</div>`;
  const lib = files.length ? `<div class="cms-media">${files.map((f) => `<figure><a href="${e(f.url)}" target="_blank" rel="noopener"><img src="${e(f.url)}?v=${e(f.mtime.slice(11, 19).replace(/:/g, ''))}" alt="" loading="lazy"></a><figcaption><code>${e(f.name)}</code><small class="muted">${kb(f.size)}${f.inUse ? ' · in gebruik' : ''}</small>
    <div class="btn-row"><button type="button" class="btn btn-quiet" data-copy="/media/${e(f.name)}">Kopieer</button><form method="post" action="${url('/media/upload')}" enctype="multipart/form-data">${hidden('target', f.name)}<label class="btn btn-quiet cms-file-btn">Vervangen<input type="file" name="files" accept="image/*" hidden data-autosubmit></label></form><form method="post" action="${url(`/media/${encodeURIComponent(f.name)}/verwijderen`)}" data-confirm="${f.inUse ? 'Deze foto is in gebruik op de site. Toch verwijderen?' : 'Foto verwijderen?'}"><button class="btn btn-quiet cms-danger">✕</button></form></div></figcaption></figure>`).join('')}</div>` : emptyState('Nog geen foto’s', 'Upload je eerste foto hierboven.');
  const upload = `<form method="post" action="${url('/media/upload')}" enctype="multipart/form-data"><label class="drop"><input type="file" name="files" accept="image/jpeg,image/png,image/webp,image/avif,image/gif" multiple data-autosubmit><span class="drop-text"><strong>Sleep foto’s hierheen</strong> of klik om te kiezen<small>JPG, PNG, WebP · max 20 MB · grote foto’s worden automatisch verkleind</small></span><span class="drop-files" aria-live="polite"></span></label></form>`;
  const head = pageHead({ eyebrow: 'Website', title: 'Foto’s', text: 'Foto’s op vaste plekken van de site vervangen, en je bibliotheek voor pagina’s en artikelen. Productfoto’s beheer je bij het product.' });
  return cmsPage({ title: 'Foto’s', user, active: 'cms-media', body: head + panel('Foto’s op de site', spotHtml) + panel(`Bibliotheek (${files.length})`, upload + `<p class="muted small">Gebruik een foto in een pagina of artikel met de link <code>/media/naam.jpg</code>. Vervangen houdt de naam gelijk, dus de foto verandert overal mee.</p>` + lib), flash, error });
}

// ---------- SEO ----------

const seoTabs = (active, counts = {}) => tabs([['overzicht', url('/seo'), 'Overzicht'], ['redirects', url('/seo/doorverwijzingen'), 'Doorverwijzingen', counts.notFound || ''], ['google', url('/seo/google'), 'Google en sitemap']], active);
const scoreTone = (s) => (s >= 85 ? 'ok' : s >= 65 ? 'wait' : 'bad');

export function seoView({ user, urls, extra, scannedAt, flash, error }) {
  const scanned = urls.filter((u) => u.scan);
  const avg = scanned.length ? Math.round(scanned.reduce((t, u) => t + u.scan.score, 0) / scanned.length) : null;
  const errors = scanned.reduce((t, u) => t + u.scan.issues.filter((i) => i.level === 'fout').length, 0);
  const warns = scanned.reduce((t, u) => t + u.scan.issues.filter((i) => i.level === 'let op').length, 0);
  const sorted = [...urls].sort((a, b) => (a.scan?.score ?? 101) - (b.scan?.score ?? 101));
  const rows = sorted.map((u) => {
    const sc = u.scan;
    const title = u.seo?.title || sc?.title || '';
    const desc = u.seo?.description || sc?.description || '';
    return `<tr><td>${sc ? `<span class="cms-score ${scoreTone(sc.score)}">${sc.score}</span>` : '<span class="cms-score">–</span>'}</td>
      <td><a class="cms-strong" href="${url(`/seo/pagina?path=${encodeURIComponent(u.loc)}`)}">${e(title || u.loc)}</a><div class="mono small muted">${e(u.loc)}</div>${desc ? `<div class="small muted cms-clip">${e(desc)}</div>` : ''}</td>
      <td class="small">${e(u.kind)}${u.seo?.noindex ? ' · ' + pill('noindex', 'wait') : ''}${u.seo?.keyword ? `<div class="muted">“${e(u.seo.keyword)}”</div>` : ''}</td>
      <td class="small">${sc ? sc.issues.slice(0, 2).map((i) => `<div class="cms-issue ${i.level === 'fout' ? 'is-error' : i.level === 'let op' ? 'is-warn' : ''}">${e(i.text)}</div>`).join('') + (sc.issues.length > 2 ? `<div class="muted">+${sc.issues.length - 2} meer</div>` : '') : '<span class="muted">nog niet gescand</span>'}</td>
      <td class="cms-actions"><a class="btn btn-quiet" href="${url(`/seo/pagina?path=${encodeURIComponent(u.loc)}`)}">Bewerken</a></td></tr>`;
  });
  const kpis = `<section class="kpis cms-kpis-4">
    <div class="kpi"><span class="label">Gemiddelde score</span><strong>${avg ?? '–'}${avg != null ? '<small>/100</small>' : ''}</strong><small>${scannedAt ? `gescand ${e(agoText(scannedAt))}` : 'nog niet gescand'}</small></div>
    <div class="kpi"><span class="label">Fouten</span><strong>${errors}</strong><small>moet je oplossen</small></div>
    <div class="kpi"><span class="label">Aandachtspunten</span><strong>${warns}</strong><small>beter maken</small></div>
    <div class="kpi"><span class="label">Pagina’s</span><strong>${urls.length}</strong><small>in de sitemap</small></div></section>`;
  const head = pageHead({ eyebrow: 'Website', title: 'SEO', text: 'Hoe staat pr3nt.nl ervoor in Google? De scan bekijkt elke pagina zoals Google hem ziet: titel, omschrijving, koppen, foto’s, tekst en je zoekwoord.', actions: `<form method="post" action="${url('/seo/scan')}"><button class="btn btn-primary" type="submit" data-busy-text="Bezig met scannen…">${scannedAt ? 'Opnieuw scannen' : 'Site scannen'}</button></form>` });
  return cmsPage({ title: 'SEO', user, active: 'cms-seo', body: head + seoTabs('overzicht') + kpis + panel('Alle pagina’s', table(['Score', 'Pagina', 'Soort', 'Verbeterpunten', ''], rows), { cls: 'flush-body' }), flash, error });
}

export function seoEditView({ user, path, seo, scan, meta, flash, error }) {
  const sc = scan;
  const checks = sc ? `<div class="cms-scorecard"><span class="cms-score big ${scoreTone(sc.score)}">${sc.score}</span><div><strong>${sc.issues.length ? `${sc.issues.length} verbeterpunten` : 'Alles in orde'}</strong><p class="muted small">${sc.words} woorden · ${sc.images} foto’s · ${sc.internalLinks} interne links · H1: ${e(sc.h1[0] || 'geen')}</p></div></div>
    ${sc.issues.length ? `<ul class="cms-issues">${sc.issues.map((i) => `<li class="${i.level === 'fout' ? 'is-error' : i.level === 'let op' ? 'is-warn' : ''}"><span>${e(i.level)}</span>${e(i.text)}</li>`).join('')}</ul>` : '<p class="muted small">Deze pagina voldoet aan alle controles.</p>'}` : '<p class="muted small">De pagina kon niet worden gescand.</p>';
  const head = pageHead({ eyebrow: `<a href="${url('/seo')}">SEO</a>`, title: e(sc?.title || path), text: `<span class="mono small">${e(site() + path)}</span>`, actions: ext(site() + path) });
  const form = `<form method="post" data-dirty-form id="seo-form">${hidden('path', path)}<div class="cms-detail"><div class="stack">${seoPanel({ seo, path, fallbackTitle: sc?.title || '', fallbackDescription: sc?.description || '' })}</div><div class="stack">${panel('Controle', checks)}${panel('Wat werkt in Google', `<ul class="cms-tips"><li>Zet je zoekwoord vooraan in de titel.</li><li>Een omschrijving van 120 tot 155 tekens die uitnodigt om te klikken.</li><li>Eén duidelijke hoofdkop, en tussenkopjes met ## in je tekst.</li><li>Elke foto een omschrijving (alt-tekst).</li><li>Link naar andere pagina’s van je site.</li></ul>`)}</div></div>
    ${savebar('<button class="btn btn-primary" type="submit">Opslaan</button>')}</form>${mediaDatalist(meta.media)}`;
  return cmsPage({ title: `SEO ${path}`, user, active: 'cms-seo', body: head + form, flash, error });
}

export function redirectsView({ user, redirects, notFound, flash, error }) {
  const add = `<form method="post" class="cms-inline">${hidden('action', 'toevoegen')}<input name="from" placeholder="Van, bijv. /pages/oude-pagina" required><span aria-hidden="true">→</span><input name="to" placeholder="Naar, bijv. /bestellen" required><select name="code" aria-label="Soort"><option value="301">Permanent (301)</option><option value="302">Tijdelijk (302)</option></select><button class="btn btn-primary">Toevoegen</button></form>`;
  const rows = redirects.map((r) => `<tr><td class="mono small">${e(r.from_path)}</td><td class="mono small">${e(r.to_path)}</td><td class="small">${r.code}</td><td class="num">${r.hits}</td><td class="small muted">${r.last_hit ? e(agoText(r.last_hit)) : '–'}</td><td class="cms-actions"><form method="post">${hidden('action', 'verwijderen')}${hidden('id', r.id)}<button class="btn btn-quiet cms-danger" data-confirm-click="Doorverwijzing verwijderen?">✕</button></form></td></tr>`);
  const nf = notFound.map((x) => `<tr><td class="mono small">${e(x.path)}${x.referrer ? `<div class="muted">via ${e(x.referrer)}</div>` : ''}</td><td class="num">${x.hits}</td><td class="small muted">${e(agoText(x.last_hit))}</td><td><form method="post" class="cms-inline">${hidden('action', 'toevoegen')}${hidden('from', x.path)}<input name="to" placeholder="Doorsturen naar…" required><button class="btn">Doorsturen</button></form></td><td><form method="post">${hidden('action', 'negeren')}${hidden('path', x.path)}<button class="btn btn-quiet">Negeren</button></form></td></tr>`);
  const head = pageHead({ eyebrow: 'Website', title: 'Doorverwijzingen', text: 'Stuur oude of kapotte links door naar de juiste pagina. Zo verlies je geen bezoekers en blijft je plek in Google behouden. Hernoem je een pagina, artikel of product, dan maken we er automatisch een.' });
  return cmsPage({ title: 'Doorverwijzingen', user, active: 'cms-seo', body: head + seoTabs('redirects', { notFound: notFound.length }) + panel('Nieuwe doorverwijzing', add) + panel('Kapotte links die bezocht worden', `<p class="muted small">Adressen waar bezoekers of Google een “pagina niet gevonden” kregen.</p>${table(['Adres', 'Hits', 'Laatst', '', ''], nf, { empty: 'Geen kapotte links gevonden. Mooi.' })}`) + panel('Actieve doorverwijzingen', table(['Van', 'Naar', 'Soort', 'Hits', 'Laatst gebruikt', ''], rows, { empty: 'Nog geen doorverwijzingen.' })), flash, error });
}

export function googleView({ user }) {
  const s = site();
  const head = pageHead({ eyebrow: 'Website', title: 'Google en sitemap', text: 'De website maakt de sitemap en robots.txt automatisch. Nieuwe pagina’s, artikelen en producten staan er direct in.' });
  const body = head + seoTabs('google') + `<div class="grid-2">${panel('Automatisch geregeld', `<ul class="cms-tips"><li><a href="${e(s)}/sitemap.xml" target="_blank" rel="noopener">sitemap.xml</a>: alle pagina’s behalve die op noindex.</li><li><a href="${e(s)}/robots.txt" target="_blank" rel="noopener">robots.txt</a>: houdt account-, beheer- en voorbeeldpagina’s uit Google.</li><li>Gestructureerde gegevens voor bedrijf, artikelen, producten, veelgestelde vragen en kruimelpaden.</li><li>Deelafbeelding en titel voor WhatsApp, Facebook en LinkedIn.</li><li>Oude adressen van hernoemde pagina’s worden automatisch doorgestuurd.</li></ul>`)}
    ${panel('Zelf eenmalig doen', `<ol class="cms-steps"><li>Open <a href="https://search.google.com/search-console" target="_blank" rel="noopener">Google Search Console</a> en voeg <strong>pr3nt.nl</strong> toe als domein.</li><li>Kies bij Sitemaps: <code>${e(s)}/sitemap.xml</code> en klik op Indienen.</li><li>Kijk daar na een paar dagen welke zoekwoorden bezoekers opleveren en zet die als zoekwoord bij de juiste pagina.</li></ol>`)}</div>`;
  return cmsPage({ title: 'Google en sitemap', user, active: 'cms-seo', body });
}

// ---------- Instellingen ----------

const settingTabs = (active) => tabs([['bedrijf', url('/instellingen'), 'Bedrijfsgegevens'], ['homepage', url('/instellingen?tab=homepage'), 'Homepage'], ['faq', url('/instellingen?tab=faq'), 'Veelgestelde vragen'], ['inspiratie', url('/instellingen?tab=inspiratie'), 'Inspiratie'], ['prijzen', url('/instellingen?tab=prijzen'), 'Prijzen en kleuren'], ['email', url('/instellingen?tab=email'), 'E-mail']], active);

export function settingsView({ user, tab, value, revisions, meta, flash, error }) {
  let body = '';
  const save = savebar('<button class="btn btn-primary" type="submit">Opslaan</button>');
  if (tab === 'bedrijf') {
    const s = value;
    body = `<form method="post" data-dirty-form id="settings-form">${panel('Bedrijf', `<div class="form-grid">
      ${input({ label: 'Bedrijfsnaam', name: 'name', value: s.name })}${input({ label: 'KvK-nummer', name: 'kvk', value: s.kvk })}${input({ label: 'Slogan', name: 'tagline', value: s.tagline, wide: true })}
      ${input({ label: 'E-mailadres', name: 'email', value: s.email, type: 'email' })}${input({ label: 'Telefoon', name: 'phone', value: s.phone })}
      ${input({ label: 'Straat en huisnummer', name: 'street', value: s.address?.street, wide: true })}${input({ label: 'Postcode', name: 'postalCode', value: s.address?.postalCode })}${input({ label: 'Plaats', name: 'city', value: s.address?.city })}
      <div class="span-2">${toggle({ label: 'Adres en plaats tonen op de website (alleen als dit een bezoekadres is)', name: 'showAddress', checked: !!s.showAddress })}</div>
      ${input({ label: 'Printer (getoond op de site)', name: 'printer', value: s.printer })}${input({ label: 'Max. uploadgrootte (MB)', name: 'maxUploadMb', value: s.maxUploadMb, inputmode: 'numeric' })}
      ${input({ label: 'Instagram', name: 'instagram', value: s.social?.instagram, placeholder: 'https://instagram.com/…' })}${input({ label: 'TikTok', name: 'tiktok', value: s.social?.tiktok })}${input({ label: 'YouTube', name: 'youtube', value: s.social?.youtube })}</div>`)}${save}</form>`;
  } else if (tab === 'homepage') {
    const cards = [0, 1, 2, 3].map((i) => value[i] ?? { title: '', text: '', image: '', alt: '', href: '' });
    body = `<form method="post" data-dirty-form id="settings-form">${panel('Kaarten “Maak alles wat je maar wilt”', `<div class="cms-cards-edit">${cards.map((c, i) => `<fieldset><legend>Kaart ${i + 1}</legend>${input({ label: 'Titel', name: `u${i}_title`, value: c.title })}${textarea({ label: 'Tekst', name: `u${i}_text`, value: c.text, rows: 2 })}${input({ label: 'Foto', name: `u${i}_image`, value: c.image, list: 'cms-media-names', hint: 'naam uit Foto’s' })}${input({ label: 'Omschrijving foto', name: `u${i}_alt`, value: c.alt })}${input({ label: 'Link', name: `u${i}_href`, value: c.href })}</fieldset>`).join('')}</div>`)}${save}</form><datalist id="cms-media-names">${meta.media.map((n) => `<option value="${e(n)}"></option>`).join('')}</datalist>`;
  } else if (tab === 'faq') {
    const rows = value.concat([{ q: '', a: '' }]);
    body = `<form method="post" data-dirty-form id="settings-form">${panel('Veelgestelde vragen', `<p class="muted small">Staan op /faq, op de homepage en als vraag-antwoord in Google.</p><div class="repeat" data-repeat="faq">${rows.map((f) => `<div class="repeat-row" data-repeat-row><input name="q" value="${e(f.q)}" placeholder="Vraag"><textarea name="a" rows="2" placeholder="Antwoord">${e(f.a)}</textarea><button type="button" class="btn btn-quiet" data-repeat-remove aria-label="Verwijderen">✕</button></div>`).join('')}</div><button type="button" class="btn btn-quiet" data-repeat-add="faq">+ Vraag toevoegen</button>`)}${save}</form>`;
  } else if (tab === 'inspiratie') {
    const rows = value.concat([{ slug: '', emoji: '', title: '', description: '', material: '', ideas: [] }]);
    body = `<form method="post" data-dirty-form id="settings-form">${panel('Inspiratiepagina’s', `<p class="muted small">Elke inspiratiepagina staat op /inspiratie/webadres.</p><div class="repeat" data-repeat="insp">${rows.map((d) => `<div class="repeat-row cms-insp" data-repeat-row><input name="i_title" value="${e(d.title)}" placeholder="Titel, bijv. Modelbouw"><input name="i_slug" value="${e(d.slug)}" placeholder="webadres" class="mono"><input name="i_emoji" value="${e(d.emoji || '')}" placeholder="Emoji" style="max-width:90px"><input name="i_material" value="${e(d.material)}" placeholder="Aanbevolen materiaal"><textarea name="i_description" rows="2" placeholder="Omschrijving">${e(d.description)}</textarea><textarea name="i_ideas" rows="4" placeholder="Ideeën, één per regel">${e((d.ideas || []).join('\n'))}</textarea><button type="button" class="btn btn-quiet" data-repeat-remove aria-label="Verwijderen">✕</button></div>`).join('')}</div><button type="button" class="btn btn-quiet" data-repeat-add="insp">+ Pagina toevoegen</button>`)}${save}</form>`;
  } else if (tab === 'prijzen') {
    const p = value;
    const f = [['startup', 'Opstartkosten (€)'], ['packaging', 'Verpakking (€)'], ['shipping', 'Verzending (€)'], ['perGram', 'Filament per gram (€)'], ['perHour', 'Printtijd per uur (€)'], ['rush', 'Spoedtoeslag (€)'], ['platformFeePercent', 'Platformfee producenten (%)']];
    body = `<form method="post" data-dirty-form id="settings-form">${panel('Prijsopbouw', `<p class="muted small">Klanten zien geen richtprijs; je maakt offertes in Orders. Deze bedragen staan alleen in de uitleg op /prijzen en bij producenten.</p><div class="form-grid">${f.map(([k, l]) => input({ label: l, name: k, value: p[k], inputmode: 'decimal' })).join('')}${textarea({ label: 'Uitleg platformfee (voor producenten)', name: 'platformFeeUitleg', value: p.platformFeeUitleg, rows: 3 })}</div>`)}
      ${panel('Kleuren', `${textarea({ label: 'Kleuren in het offerteformulier', name: 'colors', value: (p.colors || []).map((c) => `${c.name} ${c.hex}`).join('\n'), rows: 10, hint: 'één per regel: naam en kleurcode, bijv. Groen #00b070' })}`)}${save}</form>`;
  } else if (tab === 'email') {
    body = panel('E-mail van de website', `<p>${meta.mail ? pill('E-mail werkt', 'ok') : pill('Niet ingesteld', 'wait')}</p><p class="muted small">De website stuurt bevestigingen, statusmails en wachtwoordlinks. Dat stel je in met <code>SMTP_URL</code> in <code>/opt/pr3nt/.env</code>.</p><form method="post" class="cms-inline">${hidden('action', 'testmail')}<input type="email" name="to" placeholder="jouw@email.nl" required><button class="btn">Testmail sturen</button></form>`);
  }
  const head = pageHead({ eyebrow: 'Website', title: 'Instellingen', text: 'Bedrijfsgegevens, teksten op de homepage, veelgestelde vragen en meer.' });
  const side = revisions?.length ? `<div class="cms-settings-revs">${revisionsPanel(revisions)}</div>` : '';
  return cmsPage({ title: 'Instellingen', user, active: 'cms-settings', body: head + settingTabs(tab) + `<div class="cms-settings">${body}${side}</div>`, flash, error });
}
