// Website-CMS: blokkeneditor, webadressen, SEO-hulp, tekst-editor, herhaalrijen, marges en bulkacties.
(function () {
  'use strict';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var metaEl = document.getElementById('cms-meta');
  var META = {};
  try { META = metaEl ? JSON.parse(metaEl.textContent) : {}; } catch (e) { META = {}; }

  function slugify(text) {
    return String(text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/&/g, ' en ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  }
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (key) {
      var value = attrs[key];
      if (value == null || value === false) return;
      if (key === 'text') node.textContent = value;
      else if (key === 'class') node.className = value;
      else if (key.slice(0, 2) === 'on') node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    (children || []).forEach(function (child) { if (child) node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child); });
    return node;
  }
  function touch(form) {
    var any = form && $('[name]', form);
    if (any) any.dispatchEvent(new Event('input', { bubbles: true }));
  }

  // ---------- Webadres automatisch uit de titel ----------
  var slugSource = $('[data-slug-source]');
  var slugInput = $('[data-slug]');
  if (slugSource && slugInput) {
    var auto = slugInput.hasAttribute('data-slug-auto') && !slugInput.value;
    slugInput.addEventListener('input', function () { auto = false; });
    slugInput.addEventListener('blur', function () {
      slugInput.value = slugInput.value.split('/').map(slugify).filter(Boolean).join('/');
      updateSeo();
    });
    slugSource.addEventListener('input', function () {
      if (auto) { slugInput.value = slugify(slugSource.value); updateSeo(); }
    });
  }

  // ---------- Tekens tellen ----------
  function counter(out) {
    var field = $('[name="' + out.getAttribute('data-count-for') + '"]');
    if (!field) return;
    var min = Number(out.getAttribute('data-min')) || 0;
    var max = Number(out.getAttribute('data-max')) || 0;
    var update = function () {
      var length = (field.value || field.placeholder || '').length;
      var own = field.value.length;
      out.textContent = (own ? length : 'leeg, gebruikt ' + length) + ' tekens' + (max ? ' · ideaal ' + min + '–' + max : '');
      out.className = !length ? '' : length > max ? 'is-bad' : length < min ? 'is-warn' : 'is-good';
    };
    field.addEventListener('input', update);
    update();
  }
  $$('[data-count-for]').forEach(counter);

  // ---------- Google-voorbeeld en zoekwoord ----------
  var serpTitle = $('[data-serp-title]');
  var serpDesc = $('[data-serp-desc]');
  var seoTitle = $('[data-serp-input="title"]');
  var seoDesc = $('[data-serp-input="desc"]');
  var keyword = $('[data-keyword]');
  var keywordOut = $('[data-keyword-check]');
  var pageTitle = $('[data-slug-source]');
  var intro = $('[name="intro"]') || $('[name="description"]') || $('[name="summary"]');
  var brand = ' | Pr3nt';

  function bodyText() {
    var parts = [];
    $$('[data-md-editor], [data-blocks] textarea, [data-blocks] input[type="text"]').forEach(function (f) { parts.push(f.value); });
    return parts.join(' ');
  }
  function cut(text, max) { return text.length > max ? text.slice(0, max - 1).replace(/\s+\S*$/, '') + ' …' : text; }
  function updateSeo() {
    if (!serpTitle) return;
    var title = (seoTitle && seoTitle.value) || (pageTitle && pageTitle.value ? pageTitle.value + brand : '') || serpTitle.getAttribute('data-fallback') || 'Paginatitel';
    var desc = (seoDesc && seoDesc.value) || (intro && intro.value) || serpDesc.getAttribute('data-fallback') || 'Omschrijving die Google onder de titel toont.';
    serpTitle.textContent = cut(title, 62);
    serpDesc.textContent = cut(desc, 158);
    if (seoTitle && pageTitle) seoTitle.placeholder = pageTitle.value ? pageTitle.value + brand : seoTitle.placeholder;
    if (seoDesc && intro && intro !== seoDesc) seoDesc.placeholder = intro.value || seoDesc.placeholder;
    if (!keywordOut || !keyword) return;
    var kw = keyword.value.trim().toLowerCase();
    keywordOut.hidden = !kw;
    if (!kw) return;
    var slugText = slugInput ? slugInput.value.replace(/-/g, ' ') : '';
    var body = bodyText().toLowerCase();
    var words = body.split(/\s+/).filter(Boolean).length;
    var hits = body.split(kw).length - 1;
    var checks = [
      [title.toLowerCase().indexOf(kw) >= 0, 'Zoekwoord staat in de titel'],
      [title.toLowerCase().indexOf(kw) >= 0 && title.toLowerCase().indexOf(kw) < 30, 'Zoekwoord staat vooraan in de titel'],
      [desc.toLowerCase().indexOf(kw) >= 0, 'Zoekwoord staat in de omschrijving'],
      [!slugInput || slugText.indexOf(kw) >= 0 || kw.split(' ').every(function (w) { return slugText.indexOf(w) >= 0; }), 'Zoekwoord zit in het webadres'],
      [!$('[data-md-editor], [data-blocks]') || hits > 0, 'Zoekwoord komt voor in de tekst' + (hits ? ' (' + hits + '×)' : '')],
      [!$('[data-md-editor], [data-blocks]') || words >= 300, 'Minstens 300 woorden tekst (nu ' + words + ')'],
    ];
    keywordOut.innerHTML = '';
    checks.forEach(function (c) { keywordOut.appendChild(el('div', { class: c[0] ? 'is-good' : 'is-warn', text: (c[0] ? '✓ ' : '• ') + c[1] })); });
  }
  [seoTitle, seoDesc, keyword, pageTitle, intro].forEach(function (f) { if (f) f.addEventListener('input', updateSeo); });
  document.addEventListener('input', function (event) { if (event.target.closest && event.target.closest('[data-blocks], .md-wrap')) updateSeo(); });

  // ---------- Markdown-editor ----------
  function wrapSelection(area, before, after, placeholder) {
    var start = area.selectionStart, end = area.selectionEnd;
    var selected = area.value.slice(start, end) || placeholder;
    area.setRangeText(before + selected + after, start, end, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function linePrefix(area, prefix) {
    var start = area.value.lastIndexOf('\n', area.selectionStart - 1) + 1;
    area.setRangeText(prefix, start, start, 'end');
    area.focus();
    area.dispatchEvent(new Event('input', { bubbles: true }));
  }
  function mdAction(area, action) {
    if (action === 'h2') linePrefix(area, '## ');
    else if (action === 'h3') linePrefix(area, '### ');
    else if (action === 'bold') wrapSelection(area, '**', '**', 'vette tekst');
    else if (action === 'italic') wrapSelection(area, '_', '_', 'schuine tekst');
    else if (action === 'list') linePrefix(area, '- ');
    else if (action === 'link') { var href = window.prompt('Link naar (bijv. /bestellen of https://…)', '/'); if (href) wrapSelection(area, '[', '](' + href + ')', 'linktekst'); }
    else if (action === 'image') {
      var names = (META.media || []).slice(0, 12).map(function (n) { return '/media/' + n; }).join('\n');
      var src = window.prompt('Foto (link uit Foto’s, bijv. /media/foto.jpg)' + (names ? '\n\nRecent:\n' + names : ''), '/media/');
      if (src && src !== '/media/') wrapSelection(area, '![', '](' + src + ')', 'omschrijving van de foto');
    }
  }
  function renderMd(text) {
    if (window.marked && window.marked.parse) return window.marked.parse(text);
    return '<p>' + String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/\n\n/g, '</p><p>') + '</p>';
  }
  $$('[data-md-tools]').forEach(function (tools) {
    var area = $('[name="' + tools.getAttribute('data-md-tools') + '"]');
    if (!area) return;
    tools.addEventListener('click', function (event) {
      var button = event.target.closest('[data-md]');
      if (button) { event.preventDefault(); mdAction(area, button.getAttribute('data-md')); }
      var preview = event.target.closest('[data-md-preview]');
      if (preview) {
        var out = $('[data-md-preview-for="' + preview.getAttribute('data-md-preview') + '"]');
        if (!out) return;
        var show = out.hidden;
        out.hidden = !show;
        area.hidden = show;
        preview.textContent = show ? 'Bewerken' : 'Voorbeeld';
        if (show) out.innerHTML = renderMd(area.value);
      }
    });
    area.addEventListener('keydown', function (event) {
      if (!(event.ctrlKey || event.metaKey)) return;
      if (event.key === 'b') { event.preventDefault(); mdAction(area, 'bold'); }
      if (event.key === 'i') { event.preventDefault(); mdAction(area, 'italic'); }
      if (event.key === 'k') { event.preventDefault(); mdAction(area, 'link'); }
    });
  });
  $$('[data-wordcount-for]').forEach(function (out) {
    var area = $('[name="' + out.getAttribute('data-wordcount-for') + '"]');
    if (!area) return;
    var update = function () {
      var words = area.value.split(/\s+/).filter(Boolean).length;
      var heads = (area.value.match(/^#{2,3} /gm) || []).length;
      out.textContent = words + ' woorden · ' + Math.max(1, Math.round(words / 200)) + ' min lezen · ' + heads + ' tussenkopjes';
    };
    area.addEventListener('input', update);
    update();
  });

  // ---------- Herhaalrijen (vragen, inspiratie) ----------
  document.addEventListener('click', function (event) {
    var add = event.target.closest('[data-repeat-add]');
    if (add) {
      var list = $('[data-repeat="' + add.getAttribute('data-repeat-add') + '"]');
      var rows = list ? $$('[data-repeat-row]', list) : [];
      if (!rows.length) return;
      var copy = rows[rows.length - 1].cloneNode(true);
      $$('input, textarea', copy).forEach(function (f) { f.value = ''; });
      list.appendChild(copy);
      var first = $('input, textarea', copy);
      if (first) first.focus();
      touch(add.closest('form'));
      return;
    }
    var remove = event.target.closest('[data-repeat-remove]');
    if (remove) {
      var row = remove.closest('[data-repeat-row]');
      var form = row.closest('form');
      if ($$('[data-repeat-row]', row.parentNode).length > 1) row.remove();
      else $$('input, textarea', row).forEach(function (f) { f.value = ''; });
      touch(form);
    }
  });

  // ---------- Marge bij producten ----------
  var margin = $('[data-margin]');
  if (margin) {
    var markup = Number(String(margin.getAttribute('data-markup')).replace(',', '.')) || 0;
    var purchase = $('[data-purchase]', margin);
    var price = $('[data-price]', margin);
    var out = $('[data-margin-out]', margin);
    var parse = function (v) { var n = Number(String(v || '').replace(',', '.')); return String(v || '').trim() && isFinite(n) ? n : null; };
    var money = function (n) { return '€ ' + n.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); };
    var suggest = function (p) { var incl = p * (1 + markup / 100) * 1.21; var whole = Math.floor(incl); return incl - whole <= 0.45 ? whole + 0.45 : whole + 0.95; };
    var update = function () {
      var p = parse(purchase.value), s = parse(price.value);
      if (p == null || s == null) { out.textContent = p != null ? 'Advies met ' + markup + '% opslag: ' + money(suggest(p)) : 'Vul de inkoopprijs in, dan zie je je marge.'; out.className = 'span-2 cms-margin'; return; }
      var excl = s / 1.21;
      var earn = excl - p;
      var pct = excl ? Math.round((earn / excl) * 100) : 0;
      out.textContent = 'Je verdient ' + money(earn) + ' per stuk (' + pct + '% marge, excl. btw). Advies met ' + markup + '% opslag: ' + money(suggest(p)) + '.';
      out.className = 'span-2 cms-margin ' + (earn <= 0 ? 'is-bad' : pct < 20 ? 'is-warn' : 'is-good');
    };
    purchase.addEventListener('input', update);
    price.addEventListener('input', update);
    var calc = $('[data-calc-price]');
    if (calc) calc.addEventListener('click', function () {
      var p = parse(purchase.value);
      if (p == null) { purchase.focus(); return; }
      price.value = suggest(p).toFixed(2).replace('.', ',');
      price.dispatchEvent(new Event('input', { bubbles: true }));
    });
    update();
  }

  // ---------- Alles selecteren en bulkacties ----------
  var checkAll = $('[data-check-all]');
  var bulkCount = $('[data-bulk-count]');
  var bulkForm = $('[data-bulk]');
  function countSelected() {
    var n = $$('input[name="ids"]:checked').length;
    if (bulkCount) bulkCount.textContent = n ? n + ' geselecteerd' : 'Selecteer producten voor een actie';
    if (bulkForm) bulkForm.classList.toggle('is-active', n > 0);
    return n;
  }
  if (checkAll) checkAll.addEventListener('change', function () { $$('input[name="ids"]').forEach(function (c) { c.checked = checkAll.checked; }); countSelected(); });
  document.addEventListener('change', function (event) { if (event.target.name === 'ids') countSelected(); });
  if (bulkForm) bulkForm.addEventListener('submit', function (event) {
    var n = countSelected();
    var action = bulkForm.querySelector('select').value;
    if (!n || !action) { event.preventDefault(); return; }
    if (action === 'delete' && !window.confirm(n + ' producten definitief verwijderen?')) event.preventDefault();
  });

  // ---------- Bezig-tekst op knoppen ----------
  document.addEventListener('submit', function (event) {
    var button = event.submitter || $('[data-busy-text]', event.target);
    if (!button || !button.hasAttribute('data-busy-text') || event.defaultPrevented) return;
    setTimeout(function () { button.disabled = true; button.textContent = button.getAttribute('data-busy-text'); }, 0);
  });

  // ---------- Foto's slepen op een drop-vlak ----------
  $$('label.drop').forEach(function (drop) {
    ['dragenter', 'dragover'].forEach(function (type) { drop.addEventListener(type, function (event) { event.preventDefault(); drop.classList.add('is-over'); }); });
    ['dragleave', 'drop'].forEach(function (type) { drop.addEventListener(type, function () { drop.classList.remove('is-over'); }); });
    drop.addEventListener('drop', function (event) {
      var input = $('input[type="file"]', drop);
      if (!input || !event.dataTransfer || !event.dataTransfer.files.length) return;
      event.preventDefault();
      input.files = event.dataTransfer.files;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  });

  // ---------- Blokkeneditor voor pagina's ----------
  var editor = $('[data-page-editor]');
  var holder = $('[data-blocks]');
  if (!editor || !holder) { updateSeo(); return; }
  var hidden = editor.querySelector('input[name="blocks"]');
  var blocks = [];
  try { blocks = JSON.parse(hidden.value || '[]'); } catch (e) { blocks = []; }

  var catOptions = function () { return [['', 'Alle producten']].concat((META.categories || []).map(function (c) { return [c.slug, c.name]; })); };
  var artOptions = function () { return [['', 'Alle artikelen']].concat(Object.keys(META.articleCategories || {}).map(function (k) { return [k, META.articleCategories[k]]; })); };
  var TYPES = {
    hero: { label: 'Kop met foto', help: 'Grote titel bovenaan, met knop en foto.', fields: [['eyebrow', 'Klein kopje boven de titel'], ['title', 'Titel', 'text', true], ['text', 'Tekst', 'textarea'], ['buttonLabel', 'Knoptekst'], ['buttonHref', 'Knop gaat naar', 'link'], ['image', 'Foto', 'media'], ['imageAlt', 'Omschrijving foto']] },
    text: { label: 'Tekst', help: 'Gewone tekst. ## voor een kopje, - voor een opsomming.', fields: [['markdown', 'Tekst', 'markdown']] },
    image: { label: 'Foto', help: 'Een foto over de volle breedte.', fields: [['image', 'Foto', 'media', true], ['alt', 'Omschrijving foto (voor Google en blinden)'], ['caption', 'Onderschrift']] },
    imageText: { label: 'Foto + tekst', help: 'Foto naast een tekst.', fields: [['title', 'Kopje'], ['markdown', 'Tekst', 'markdown'], ['image', 'Foto', 'media', true], ['alt', 'Omschrijving foto'], ['imageRight', 'Foto rechts', 'check']] },
    cards: { label: 'Kaarten', help: 'Een rij kaarten, bijv. diensten of voordelen.', fields: [['title', 'Kopje boven de kaarten']], items: { label: 'Kaart', fields: [['title', 'Titel'], ['text', 'Tekst', 'textarea'], ['image', 'Foto', 'media'], ['href', 'Link', 'link']], empty: { title: '', text: '', image: '', href: '' } } },
    faq: { label: 'Vragen', help: 'Uitklapvragen; Google toont ze ook als vraag en antwoord.', fields: [['title', 'Kopje']], items: { label: 'Vraag', fields: [['q', 'Vraag'], ['a', 'Antwoord', 'textarea']], empty: { q: '', a: '' } } },
    cta: { label: 'Oproep', help: 'Opvallend vlak met een knop.', fields: [['title', 'Titel', 'text', true], ['text', 'Tekst', 'textarea'], ['buttonLabel', 'Knoptekst'], ['buttonHref', 'Knop gaat naar', 'link']] },
    quoteForm: { label: 'Offerteformulier', help: 'Het bestelformulier, direct op de pagina.', fields: [['title', 'Kopje'], ['text', 'Tekst', 'textarea']] },
    products: { label: 'Producten', help: 'Producten uit de webshop.', fields: [['title', 'Kopje'], ['category', 'Categorie', 'select', false, catOptions], ['limit', 'Aantal', 'number']] },
    original: { label: 'Vaste sectie', help: 'Een onderdeel dat al op deze pagina stond. Verplaats het, of haal het weg en zet er een eigen blok voor in de plaats.', fields: [] },
    articles: { label: 'Artikelen', help: 'Artikelen uit de kennisbank.', fields: [['title', 'Kopje'], ['category', 'Categorie', 'select', false, artOptions], ['limit', 'Aantal', 'number']] },
  };
  var DEFAULTS = { hero: { title: '', text: '' }, text: { markdown: '' }, image: { image: '', alt: '' }, imageText: { markdown: '', image: '', alt: '' }, cards: { items: [{ title: '', text: '' }] }, faq: { items: [{ q: '', a: '' }] }, cta: { title: '', buttonLabel: 'Offerte aanvragen', buttonHref: '/bestellen' }, quoteForm: { title: 'Vraag direct een offerte aan' }, products: { limit: 4 }, articles: { limit: 3 } };

  function save() {
    hidden.value = JSON.stringify(blocks);
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function field(target, def, onChange) {
    var key = def[0], label = def[1], kind = def[2] || 'text', required = def[3], options = def[4];
    var value = target[key];
    var set = function (v) { if (v === '' || v == null || v === false) delete target[key]; else target[key] = v; onChange(); };
    var control;
    if (kind === 'textarea' || kind === 'markdown') {
      control = el('textarea', { rows: kind === 'markdown' ? 8 : 3, class: kind === 'markdown' ? 'md-editor is-small' : '', oninput: function () { set(control.value); } });
      control.value = value || '';
    } else if (kind === 'check') {
      control = el('input', { type: 'checkbox', onchange: function () { set(control.checked); } });
      control.checked = !!value;
      return el('label', { class: 'toggle' }, [control, el('span', { text: label })]);
    } else if (kind === 'select') {
      control = el('select', { onchange: function () { set(control.value); } }, options().map(function (o) { var opt = el('option', { value: o[0], text: o[1] }); if (String(o[0]) === String(value || '')) opt.selected = true; return opt; }));
    } else {
      control = el('input', { type: kind === 'number' ? 'number' : 'text', min: kind === 'number' ? 1 : null, max: kind === 'number' ? 12 : null, list: kind === 'media' ? 'cms-media' : null, placeholder: kind === 'media' ? '/media/foto.jpg' : kind === 'link' ? '/bestellen' : '', required: required ? true : null,
        oninput: function () { set(kind === 'number' ? (control.value ? Number(control.value) : '') : control.value); } });
      control.value = value == null ? '' : value;
    }
    var children = [el('span', { text: label + (required ? ' *' : '') }), control];
    if (kind === 'media') {
      var thumb = el('img', { class: 'pblock-thumb', alt: '', hidden: !value });
      var refresh = function () { var v = control.value.trim(); thumb.hidden = !v; if (v) thumb.src = (/^https?:/.test(v) ? '' : META.site || '') + (v.charAt(0) === '/' ? v : '/media/' + v); };
      control.addEventListener('input', refresh);
      thumb.addEventListener('error', function () { thumb.hidden = true; });
      refresh();
      children.push(thumb);
    }
    return el('label', { class: 'field' + (kind === 'textarea' || kind === 'markdown' || kind === 'media' ? ' span-2' : '') }, children);
  }

  function summary(block) {
    if (block.type === 'original') return (META.sections || [])[block.part] || 'Sectie ' + (Number(block.part) + 1);
    var text = block.title || block.markdown || block.caption || block.alt || (block.items && block.items[0] && (block.items[0].title || block.items[0].q)) || '';
    return String(text).replace(/[#*_\[\]()>-]/g, '').trim().slice(0, 70);
  }

  function render() {
    holder.innerHTML = '';
    if (!blocks.length) holder.appendChild(el('p', { class: 'muted small pblocks-empty', text: 'Nog geen blokken. Kies hieronder wat je wilt toevoegen.' }));
    blocks.forEach(function (block, index) {
      var type = TYPES[block.type] || { label: block.type, fields: [] };
      var sum = el('small', { class: 'muted', text: summary(block) });
      var changed = function () { sum.textContent = summary(block); save(); };
      var grid = el('div', { class: 'form-grid' }, type.fields.map(function (def) { return field(block, def, changed); }));
      var body = el('div', { class: 'pblock-body' }, [type.help ? el('p', { class: 'muted small', text: type.help }) : null, grid]);
      if (type.items) {
        if (!Array.isArray(block.items)) block.items = [];
        var list = el('div', { class: 'pblock-items' });
        var drawItems = function () {
          list.innerHTML = '';
          block.items.forEach(function (item, i) {
            var itemGrid = el('div', { class: 'form-grid' }, type.items.fields.map(function (def) { return field(item, def, changed); }));
            list.appendChild(el('fieldset', { class: 'pblock-item' }, [
              el('legend', { text: type.items.label + ' ' + (i + 1) }),
              itemGrid,
              el('div', { class: 'btn-row' }, [
                i > 0 ? el('button', { type: 'button', class: 'btn btn-quiet', text: '↑', title: 'Omhoog', onclick: function () { block.items.splice(i - 1, 0, block.items.splice(i, 1)[0]); drawItems(); changed(); } }) : null,
                el('button', { type: 'button', class: 'btn btn-quiet cms-danger', text: 'Verwijderen', onclick: function () { block.items.splice(i, 1); drawItems(); changed(); } }),
              ]),
            ]));
          });
          list.appendChild(el('button', { type: 'button', class: 'btn btn-quiet', text: '+ ' + type.items.label + ' toevoegen', onclick: function () { block.items.push(JSON.parse(JSON.stringify(type.items.empty))); drawItems(); changed(); } }));
        };
        drawItems();
        body.appendChild(list);
      }
      var move = function (to) { if (to < 0 || to >= blocks.length) return; blocks.splice(to, 0, blocks.splice(index, 1)[0]); save(); render(); };
      var head = el('div', { class: 'pblock-head' }, [
        el('span', { class: 'pblock-handle', text: '⋮⋮', title: 'Slepen om te verplaatsen', 'aria-hidden': 'true' }),
        el('strong', { text: type.label }), sum,
        el('div', { class: 'btn-row' }, [
          el('button', { type: 'button', class: 'btn btn-quiet', text: '↑', title: 'Omhoog', disabled: index === 0, onclick: function () { move(index - 1); } }),
          el('button', { type: 'button', class: 'btn btn-quiet', text: '↓', title: 'Omlaag', disabled: index === blocks.length - 1, onclick: function () { move(index + 1); } }),
          el('button', { type: 'button', class: 'btn btn-quiet', text: 'Kopie', title: 'Dupliceren', onclick: function () { blocks.splice(index + 1, 0, JSON.parse(JSON.stringify(block))); save(); render(); } }),
          el('button', { type: 'button', class: 'btn btn-quiet cms-danger', text: '✕', title: 'Blok verwijderen', onclick: function () { if (window.confirm('Dit blok verwijderen?')) { blocks.splice(index, 1); save(); render(); } } }),
        ]),
      ]);
      var sumEl = el('summary', {}, [head]);
      // Knoppen in de kop klappen het blok niet in of uit
      sumEl.addEventListener('click', function (event) { if (event.target.closest('button')) event.preventDefault(); });
      var card = el('details', { class: 'pblock', open: block.__open !== false ? true : null, 'data-index': index }, [sumEl, body]);
      var handle = head.firstChild;
      handle.addEventListener('mousedown', function () { card.draggable = true; });
      card.addEventListener('toggle', function () { block.__open = card.open; });
      card.addEventListener('dragstart', function (event) { if (event.target !== card) return; event.dataTransfer.setData('text/plain', String(index)); card.classList.add('is-dragging'); });
      card.addEventListener('dragend', function () { card.classList.remove('is-dragging'); card.draggable = false; });
      card.addEventListener('dragover', function (event) { event.preventDefault(); card.classList.add('is-drop'); });
      card.addEventListener('dragleave', function () { card.classList.remove('is-drop'); });
      card.addEventListener('drop', function (event) {
        event.preventDefault();
        card.classList.remove('is-drop');
        var from = Number(event.dataTransfer.getData('text/plain'));
        if (!isNaN(from) && from !== index) { blocks.splice(index, 0, blocks.splice(from, 1)[0]); save(); render(); }
      });
      holder.appendChild(card);
    });
    if (typeof drawOriginalChips === 'function') drawOriginalChips();
    updateSeo();
  }

  document.addEventListener('mouseup', function () { $$('.pblock[draggable="true"]', holder).forEach(function (c) { c.draggable = false; }); });

  var addBar = $('[data-block-add]');
  var originalBar = el('div', { class: 'chips', hidden: true });
  addBar.parentNode.appendChild(originalBar);
  // Vaste pagina: weggehaalde vaste secties kun je terugzetten
  function drawOriginalChips() {
    if (!META.fixed) return;
    originalBar.innerHTML = '';
    var used = blocks.filter(function (b) { return b.type === 'original'; }).map(function (b) { return Number(b.part); });
    (META.sections || []).forEach(function (label, part) {
      if (used.indexOf(part) >= 0) return;
      originalBar.appendChild(el('button', { type: 'button', class: 'chip', text: '+ Vaste sectie: ' + label, onclick: function () { blocks.push({ type: 'original', part: part }); save(); render(); } }));
    });
    originalBar.hidden = !originalBar.children.length;
  }
  Object.keys(TYPES).forEach(function (key) {
    if (key === 'original') return;
    addBar.appendChild(el('button', { type: 'button', class: 'chip', text: '+ ' + TYPES[key].label, title: TYPES[key].help, onclick: function () {
      blocks.push(Object.assign({ type: key }, JSON.parse(JSON.stringify(DEFAULTS[key] || {}))));
      save();
      render();
      var last = holder.lastElementChild;
      if (last) { last.scrollIntoView({ behavior: 'smooth', block: 'center' }); var f = $('input, textarea', last); if (f) f.focus(); }
    } }));
  });

  // Interne vlag __open niet meesturen
  editor.addEventListener('submit', function () {
    hidden.value = JSON.stringify(blocks, function (k, v) { return k === '__open' ? undefined : v; });
  });
  render();
})();
