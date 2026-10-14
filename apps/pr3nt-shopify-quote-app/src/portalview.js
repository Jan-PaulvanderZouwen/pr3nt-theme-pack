// Klantportaal: één server-side opgebouwde pagina per project.
// Vervangt de oude opbouw waarin tien middleware-lagen de HTML achteraf aanpasten.
// De POST-routes (akkoord, berichten, uploads, verzendadres, account) blijven waar ze waren.
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { e, formatDate, logo, renderShell } from './ui/layout.js';
import { fmt, money, quoteLines, quoteSubtotalExVat, quoteVatAmount, quoteTotalInclVat, vatRatePercent } from './vat.js';
import { shippingOf } from './shippingcontext.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

const statuses = [
  ['received', 'Ontvangen'],
  ['creating_quote', 'Offerte in maak'],
  ['quote_sent', 'Offerte verstuurd'],
  ['accepted', 'Akkoord'],
  ['paid', 'Betaald'],
  ['print_queue', 'Printen'],
  ['ready_to_ship', 'Klaar voor verzending'],
  ['shipped', 'Verzonden'],
  ['delivered', 'Geleverd'],
];

async function readQuotes() {
  try {
    const quotes = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    return Array.isArray(quotes) ? quotes : [];
  } catch {
    return [];
  }
}

function findQuote(quotes, token) {
  return quotes.find((quote) => !quote.archivedAt && (quote.portalToken === token || quote.id === token));
}

function tokenOf(quote) {
  return encodeURIComponent(quote.portalToken || quote.id);
}

function statusIndex(status) {
  const index = statuses.findIndex(([value]) => value === status);
  return index < 0 ? 0 : index;
}

function accountProjects(current, allQuotes) {
  const email = String(current.email || '').toLowerCase();
  return allQuotes.filter((quote) => !quote.archivedAt && String(quote.email || '').toLowerCase() === email);
}

function quoteFiles(quote) {
  if (Array.isArray(quote.files) && quote.files.length) return quote.files.filter((file) => file && file.url);
  if (quote.fileUrl) return [{ url: quote.fileUrl, originalName: quote.fileOriginalName || 'model.stl' }];
  return [];
}

function fileName(file) {
  return String(file.originalName || file.safeOriginalName || file.storedName || 'Bestand');
}

function fileExt(file) {
  const match = fileName(file).match(/\.([a-z0-9]+)$/i);
  return match ? match[1].toUpperCase() : 'BESTAND';
}

function vatLabel() {
  return vatRatePercent().toLocaleString('nl-NL', { maximumFractionDigits: 2 });
}

function addressComplete(shipping) {
  return Boolean(shipping.name && shipping.address && shipping.postalCode && shipping.city);
}

// Alle afgeleide toestanden op één plek, zodat koptekst, actie en panelen hetzelfde verhaal vertellen.
function stateOf(quote) {
  const status = quote.status || 'received';
  const index = statusIndex(status);
  const payUrl = quote.paymentUrl || quote.molliePaymentUrl || '';
  const paid = Boolean(quote.paidAt) || index >= statusIndex('paid');
  const ready = quoteSubtotalExVat(quote) > 0;
  const accepted = Boolean(quote.acceptedAt || quote.customerAcceptedAt) || index >= statusIndex('accepted');
  const waiting = quote.manualStatus === 'waiting_customer';
  const canAccept = ready && !accepted && !paid && !waiting && index <= statusIndex('quote_sent');
  const canPay = Boolean(payUrl) && accepted && !paid;
  return { status, index, payUrl, paid, ready, accepted, waiting, canAccept, canPay, total: quoteTotalInclVat(quote) };
}

function heading(quote, state) {
  if (state.waiting) return ['We wachten op je reactie', 'We hebben je iets gevraagd voordat we verder kunnen. Lees het laatste bericht en laat het ons weten.'];
  if (state.canPay) return ['Betaling staat nog open', 'Je hebt de offerte geaccepteerd. Rond de betaling af, dan plannen we je print in.'];
  if (state.accepted && !state.paid) return ['Akkoord ontvangen', 'We zetten de betaallink voor je klaar. We starten met printen zodra de betaling binnen is.'];
  const map = {
    received: ['Aanvraag ontvangen', 'We bekijken je bestand. Binnen 1 werkdag krijg je een prijsopgaaf, inclusief verzending.'],
    creating_quote: ['We maken je offerte', 'We controleren materiaal, printtijd en haalbaarheid. Je hoeft nu niets te doen.'],
    quote_sent: state.ready
      ? ['Je offerte staat klaar', state.payUrl ? 'Kijk de regels na. Klopt alles, accepteer dan de offerte en betaal direct via Mollie.' : 'Kijk de regels na en geef akkoord als alles klopt.']
      : ['We maken je offerte', 'We controleren materiaal, printtijd en haalbaarheid. Je hoeft nu niets te doen.'],
    accepted: ['Akkoord ontvangen', 'We zetten de betaallink voor je klaar. We starten met printen zodra de betaling binnen is.'],
    paid: ['Betaling ontvangen', 'Bedankt. We plannen je print in en laten het weten zodra hij op de printer ligt.'],
    print_queue: ['Je print wordt gemaakt', 'Je model staat in de wachtrij of ligt op de printer.'],
    ready_to_ship: ['Klaar voor verzending', 'Je print is klaar en wordt verpakt.'],
    shipped: ['Je pakket is onderweg', quote.trackingCode ? 'Volg je pakket met de track & trace-code hieronder.' : 'Je pakket is aan de vervoerder meegegeven.'],
    delivered: ['Geleverd', 'Veel plezier met je print. We horen graag hoe hij is bevallen.'],
  };
  return map[state.status] || map.received;
}

function statusPill(state) {
  if (state.waiting) return '<span class="pill wait">Wacht op jouw reactie</span>';
  if (state.canAccept) return '<span class="pill wait">Wacht op jouw akkoord</span>';
  if (state.canPay) return '<span class="pill wait">Betaling open</span>';
  if (state.status === 'delivered') return '<span class="pill ok">Afgerond</span>';
  if (state.paid) return '<span class="pill ok">Betaald</span>';
  return '<span class="pill act">Wij zijn aan zet</span>';
}

function acceptForm(quote, state, label) {
  return `<form method="post" action="/portal/${tokenOf(quote)}/accept"><button class="btn btn-primary btn-block" type="submit">${e(label || (state.payUrl ? 'Accepteren en betalen' : 'Offerte accepteren'))}</button></form>`;
}

function actionPanel(quote, state) {
  const token = tokenOf(quote);
  const amount = state.ready ? `<div class="amount">€ ${fmt(state.total)}<small>Totaal incl. ${vatLabel()}% btw en verzending</small></div>` : '';
  if (state.waiting) {
    return `<div class="action"><span class="label">Volgende stap</span><p>Beantwoord onze vraag bij Berichten, dan gaan we verder.</p><a class="btn btn-dark" href="#berichten">Naar berichten</a></div>`;
  }
  if (state.canAccept) {
    return `<div class="action"><span class="label">Jouw offerte</span>${amount}${acceptForm(quote, state)}<p>Printen start na betaling. Vragen over de offerte? Stuur ons een <a href="#berichten">bericht</a>.</p></div>`;
  }
  if (state.canPay) {
    return `<div class="action"><span class="label">Openstaand bedrag</span>${amount}<a class="btn btn-primary" href="${e(state.payUrl)}">Betaal veilig via Mollie</a><p>Je betaalt met iDEAL of Bancontact.</p></div>`;
  }
  if (state.status === 'shipped' && quote.trackingCode) {
    return `<div class="action"><span class="label">Track & trace</span><div class="code"><span>${e(quote.trackingCode)}</span></div><p>Gebruik deze code op de site van de vervoerder.</p></div>`;
  }
  if (state.status === 'ready_to_ship' && !addressComplete(shippingOf(quote))) {
    return `<div class="action"><span class="label">Nog nodig</span><p>We hebben je verzendadres nodig om je print te versturen.</p><a class="btn btn-dark" href="#verzending">Verzendadres invullen</a></div>`;
  }
  if (state.status === 'delivered') {
    return `<div class="action"><span class="label">Afgerond</span><p>Dezelfde print nog een keer nodig? Je start in één klik een nieuwe aanvraag.</p><form method="post" action="/portal/${token}/reorder"><button class="btn btn-dark btn-block" type="submit">Opnieuw bestellen</button></form>${quote.review ? '' : '<a class="btn" href="#beoordeling">Beoordeling geven</a>'}</div>`;
  }
  if (state.paid) {
    return `<div class="action"><span class="label">Betaald</span>${amount}<a class="btn" href="/portal/${token}/invoice" target="_blank" rel="noopener">Factuur bekijken</a></div>`;
  }
  if (state.accepted && !state.paid) {
    return `<div class="action"><span class="label">Volgende stap</span>${amount}<p>De Mollie-betaallink wordt automatisch klaargezet. Je krijgt een mail zodra je kunt betalen.</p></div>`;
  }
  return `<div class="action"><span class="label">Volgende stap</span><p>Je krijgt binnen 1 werkdag een prijsopgaaf per mail en hier in je portaal.</p><a class="btn" href="#berichten">Iets toevoegen of vragen</a></div>`;
}

function statusSection(quote, state) {
  const [title, text] = heading(quote, state);
  const step = state.index + 1;
  const layers = statuses.map((_, index) => `<span class="${index < state.index ? 'done' : index === state.index ? 'now' : ''}"></span>`).join('');
  const facts = [quote.material, quote.color, String(quote.rush || '').toLowerCase().startsWith('j') ? 'Spoed' : ''].filter(Boolean).map((fact) => `<span>${e(fact)}</span>`).join('');
  return `<section class="status" aria-labelledby="status-title"><div class="status-text"><div class="btn-row"><span class="label">Stap ${step} van ${statuses.length} · ${e(statuses[state.index][1])}</span>${statusPill(state)}</div><h1 id="status-title">${e(title)}</h1><p>${e(text)}</p><div class="layers" role="img" aria-label="Voortgang: stap ${step} van ${statuses.length}">${layers}</div><div class="layers-legend" aria-hidden="true"><span>Ontvangen</span><span>Printen</span><span>Geleverd</span></div>${facts ? `<div class="facts">${facts}</div>` : ''}</div>${actionPanel(quote, state)}</section>`;
}

function quotePanel(quote, state) {
  const lines = quoteLines(quote);
  let body;
  if (!lines.length || !state.ready) {
    body = '<p class="empty">We maken je offerte. Zodra hij klaarstaat, zie je hier de regels en krijg je een mail.</p>';
  } else {
    const rows = lines.map((line) => {
      const qty = money(line.qty || 1);
      const unit = money(line.unit || 0);
      return `<tr><td>${e(line.label || 'Regel')}${line.description ? `<small>${e(line.description)}</small>` : ''}</td><td class="r">${e(String(line.qty || 1))}</td><td class="r hide-sm">€ ${fmt(unit)}</td><td class="r">€ ${fmt(qty * unit)}</td></tr>`;
    }).join('');
    body = `<div style="overflow-x:auto"><table class="lines"><thead><tr><th>Omschrijving</th><th class="r">Aantal</th><th class="r hide-sm">Prijs</th><th class="r">Bedrag</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="2">Subtotaal excl. btw</td><td class="hide-sm"></td><td class="r">€ ${fmt(quoteSubtotalExVat(quote))}</td></tr><tr><td colspan="2">Btw ${vatLabel()}%</td><td class="hide-sm"></td><td class="r">€ ${fmt(quoteVatAmount(quote))}</td></tr><tr class="total"><td colspan="2">Totaal incl. btw</td><td class="hide-sm"></td><td class="r">€ ${fmt(state.total)}</td></tr></tfoot></table></div>${state.canAccept ? '<div class="callout"><strong>Printen start na betaling</strong>Na je akkoord ga je door naar de betaling via Mollie.</div>' : ''}`;
  }
  const meta = quote.quoteSentAt ? `<span class="muted small">Verstuurd ${e(formatDate(quote.quoteSentAt))}</span>` : '';
  return `<section class="panel" aria-labelledby="offerte-title"><div class="panel-head"><h2 id="offerte-title">Offerte</h2>${meta}</div><div class="panel-body">${body}</div></section>`;
}

function detailsPanel(quote) {
  const rows = [
    ['Aanvraag', `<span class="mono">${e(quote.id)}</span>`],
    ['Ingediend', e(formatDate(quote.createdAt))],
    ['Type', quote.requestType === 'no_model' ? 'Nog geen 3D-bestand' : '3D-bestand aanwezig'],
    ['Materiaal', e(quote.material || '-')],
    ['Kleur', e(quote.color || '-')],
    ['Spoed', e(quote.rush || 'Nee')],
  ];
  const text = [quote.description, quote.note].filter(Boolean).join('\n\n');
  const dl = rows.map(([label, value]) => `<dt>${label}</dt><dd>${value}</dd>`).join('') + (text ? `<dt>Omschrijving</dt><dd class="text">${e(text)}</dd>` : '');
  return `<section class="panel" aria-labelledby="print-title"><div class="panel-head"><h2 id="print-title">Je print</h2></div><div class="panel-body"><dl class="spec">${dl}</dl></div></section>`;
}

function filesPanel(quote, state) {
  const files = quoteFiles(quote);
  const token = tokenOf(quote);
  const list = files.length
    ? `<ul class="files">${files.map((file, index) => `<li class="file${index === 0 ? ' is-active' : ''}" data-file="${index}"><span class="file-ext">${e(fileExt(file))}</span><div class="file-main"><strong title="${e(fileName(file))}">${e(fileName(file))}</strong><small>${file.createdAt ? e(formatDate(file.createdAt)) : 'Bij aanvraag'}${file.uploadedBy === 'pr3nt' ? ' · van pr3nt' : ''}</small></div><div class="file-actions">${/\.(stl|obj)$/i.test(fileName(file)) ? `<button class="btn btn-quiet" type="button" data-preview="${index}">Bekijken</button>` : ''}<a class="btn btn-quiet" href="${e(file.url)}" download>Download</a></div></li>`).join('')}</ul>`
    : '<p class="empty">Er is nog geen bestand bij deze aanvraag.</p>';
  const viewer = files.length ? '<div class="viewer" id="viewer"><div class="viewer-msg">3D-voorbeeld wordt geladen</div></div>' : '';
  const replace = state.accepted ? '' : '<button class="btn" type="button" data-open="dlg-replace">Bestand vervangen</button>';
  return `<section class="panel" aria-labelledby="files-title"><div class="panel-head"><h2 id="files-title">Bestanden</h2><div class="btn-row">${replace}<button class="btn" type="button" data-open="dlg-upload">Toevoegen</button></div></div><div class="panel-body">${viewer}${list}</div></section>${uploadDialogs(quote, state, token)}`;
}

function uploadDialogs(quote, state, token) {
  const accept = '.stl,.3mf,.obj,.step,.stp';
  const extra = `<dialog id="dlg-upload" aria-labelledby="dlg-upload-title"><div class="panel-head"><h2 id="dlg-upload-title">Bestand toevoegen</h2><button class="btn btn-quiet" type="button" data-close>Sluiten</button></div><form class="panel-body form" method="post" action="/portal/${token}/upload" enctype="multipart/form-data"><input id="upload-file" type="file" name="file" accept="${accept}" multiple required><div class="form-grid"><label class="field"><span>Materiaal <small>(optioneel)</small></span><input id="upload-material" name="material" value="${e(quote.material || '')}"></label><label class="field"><span>Kleur <small>(optioneel)</small></span><input id="upload-color" name="color" value="${e(quote.color || '')}"></label></div><label class="field"><span>Toelichting <small>(optioneel)</small></span><textarea id="upload-description" name="description" placeholder="Bijvoorbeeld: dit onderdeel graag 2 keer"></textarea></label><div class="btn-row"><button class="btn btn-dark" type="submit">Uploaden</button><button class="btn btn-quiet" type="button" data-close>Annuleren</button></div></form></dialog>`;
  if (state.accepted) return extra;
  const material = String(quote.material || 'PLA').toUpperCase();
  const replace = `<dialog id="dlg-replace" aria-labelledby="dlg-replace-title"><div class="panel-head"><h2 id="dlg-replace-title">Bestand vervangen</h2><button class="btn btn-quiet" type="button" data-close>Sluiten</button></div><form class="panel-body form" method="post" action="/portal/${token}/selfservice-upload" enctype="multipart/form-data"><p class="muted">Upload de nieuwste versie van je model. We maken de prijsopgaaf dan op basis van dit bestand.</p><input id="replace-file" type="file" name="file" accept="${accept}" multiple required><div class="field"><span>Materiaal</span><div class="choice"><label><input type="radio" name="material" value="PLA" ${material !== 'PETG' ? 'checked' : ''}><span>PLA</span></label><label><input type="radio" name="material" value="PETG" ${material === 'PETG' ? 'checked' : ''}><span>PETG</span></label></div></div><label class="field"><span>Kleur</span><input id="replace-color" name="color" value="${e(quote.color || '')}"></label><label class="field"><span>Wat is er veranderd? <small>(optioneel)</small></span><textarea id="replace-description" name="description"></textarea></label><div class="btn-row"><button class="btn btn-dark" type="submit">Uploaden en vervangen</button><button class="btn btn-quiet" type="button" data-close>Annuleren</button></div></form></dialog>`;
  return extra + replace;
}

function isHiddenSystemMessage(message) {
  if (message.from === 'klant') return false;
  const text = String(message.text || '').toLowerCase();
  return text.includes('betaallink') && (text.includes('automatisch') || text.includes('kon niet') || text.includes('aangemaakt'));
}

function messagesPanel(quote) {
  const messages = (Array.isArray(quote.messages) ? quote.messages : []).filter((message) => !isHiddenSystemMessage(message));
  const list = messages.length
    ? messages.map((message) => {
      const mine = message.from === 'klant';
      return `<div class="msg${mine ? ' me' : ''}">${e(message.text || '')}<small>${mine ? 'Jij' : 'pr3nt'} · ${e(formatDate(message.createdAt, true))}</small></div>`;
    }).join('')
    : '<p class="empty">Nog geen berichten. Stel hier gerust je vraag.</p>';
  return `<section class="panel" id="berichten" aria-labelledby="msg-title"><div class="panel-head"><h2 id="msg-title">Berichten</h2></div><div class="panel-body"><div class="thread" data-thread>${list}</div><form class="form" method="post" action="/portal/${tokenOf(quote)}/message"><label class="field"><span>Bericht aan pr3nt</span><textarea id="message" name="message" required placeholder="Typ je vraag of toelichting"></textarea></label><div><button class="btn btn-dark" type="submit">Versturen</button></div></form></div></section>`;
}

function shippingPanel(quote, state) {
  const shipping = shippingOf(quote);
  const complete = addressComplete(shipping);
  const locked = state.index >= statusIndex('shipped');
  if (locked && !complete) return '';
  const country = shipping.country || 'Nederland';
  const summary = complete
    ? `<div class="address"><strong>${e(shipping.name)}</strong>${shipping.company ? `<span>${e(shipping.company)}</span>` : ''}<span>${e(shipping.address)}</span><span>${e(shipping.postalCode)} ${e(shipping.city)}</span><span>${e(country)}</span></div>`
    : '<p class="empty">Vul je verzendadres in, dan kunnen we je print direct versturen zodra hij klaar is.</p>';
  const form = `<form class="form" method="post" action="/portal/${tokenOf(quote)}/shipping"><div class="form-grid"><label class="field"><span>Naam ontvanger</span><input id="ship-name" name="shippingName" value="${e(shipping.name || quote.name || '')}" autocomplete="shipping name" required></label><label class="field"><span>Bedrijf <small>(optioneel)</small></span><input id="ship-company" name="shippingCompany" value="${e(shipping.company || '')}" autocomplete="shipping organization"></label><label class="field span-2"><span>Straat en huisnummer</span><input id="ship-address" name="shippingAddress" value="${e(shipping.address || '')}" autocomplete="shipping street-address" required></label><label class="field"><span>Postcode</span><input id="ship-postal" name="shippingPostalCode" value="${e(shipping.postalCode || '')}" autocomplete="shipping postal-code" required></label><label class="field"><span>Plaats</span><input id="ship-city" name="shippingCity" value="${e(shipping.city || '')}" autocomplete="shipping address-level2" required></label><label class="field span-2"><span>Land</span><input id="ship-country" name="shippingCountry" value="${e(country)}" autocomplete="shipping country-name"></label></div><div><button class="btn btn-dark" type="submit">Adres opslaan</button></div></form>`;
  const badge = locked ? '' : complete ? '<span class="pill ok">Ingevuld</span>' : '<span class="pill wait">Nog nodig</span>';
  return `<section class="panel" id="verzending" aria-labelledby="ship-title"><div class="panel-head"><h2 id="ship-title">Verzendadres</h2>${badge}</div><div class="panel-body">${summary}${locked ? '' : complete ? `<details class="reveal"><summary class="btn">Adres wijzigen</summary>${form}</details>` : form}</div></section>`;
}

function moreActionsPanel(quote, state) {
  const token = tokenOf(quote);
  const items = [];
  if (state.paid) items.push(`<li><div><strong>Factuur</strong><span>Met btw-specificatie, te printen of op te slaan als pdf.</span></div><a class="btn" href="/portal/${token}/invoice" target="_blank" rel="noopener">Bekijken</a></li>`);
  const invoices = Array.isArray(quote.invoices) ? quote.invoices.filter((invoice) => invoice && invoice.url) : [];
  invoices.forEach((invoice) => items.push(`<li><div><strong>${e(invoice.number || 'Factuur')}</strong><span>${e(formatDate(invoice.createdAt))} · pdf</span></div><a class="btn" href="${e(invoice.url)}">Downloaden</a></li>`));
  if (state.status !== 'delivered') items.push(`<li><div><strong>Nog een keer printen</strong><span>Start een nieuwe aanvraag met dezelfde bestanden.</span></div><form method="post" action="/portal/${token}/reorder"><button class="btn" type="submit">Opnieuw bestellen</button></form></li>`);
  return `<section class="panel" aria-labelledby="more-title"><div class="panel-head"><h2 id="more-title">Overig</h2></div><div class="panel-body"><ul class="actions-list">${items.join('')}</ul></div></section>`;
}

function reviewPanel(quote) {
  if (quote.status !== 'delivered') return '';
  const token = tokenOf(quote);
  if (quote.review) {
    return `<section class="panel" id="beoordeling"><div class="panel-head"><h2>Je beoordeling</h2><span class="pill ok">${e(quote.review.rating || '-')}/5</span></div><div class="panel-body"><p class="muted">${e(quote.review.review || 'Bedankt voor je beoordeling.')}</p></div></section>`;
  }
  const stars = [5, 4, 3, 2, 1].map((value) => `<input type="radio" id="star-${value}" name="rating" value="${value}" ${value === 5 ? 'required' : ''}><label for="star-${value}" title="${value} van 5">★</label>`).join('');
  return `<section class="panel" id="beoordeling" aria-labelledby="review-title"><div class="panel-head"><h2 id="review-title">Hoe is je print bevallen?</h2></div><form class="panel-body form" method="post" action="/portal/${token}/review"><div class="stars" role="radiogroup" aria-label="Score">${stars}</div><label class="field"><span>Toelichting <small>(optioneel)</small></span><textarea id="review" name="review"></textarea></label><div><button class="btn btn-dark" type="submit">Versturen</button></div></form></section>`;
}

function topbar(quote, allQuotes, active) {
  const token = tokenOf(quote);
  const projects = accountProjects(quote, allQuotes);
  const project = projects.length > 1
    ? `<label class="switcher"><span class="muted">Project</span><select aria-label="Kies project" onchange="if(this.value) location.href=this.value">${projects.map((item) => `<option value="/portal/${tokenOf(item)}" ${item.id === quote.id ? 'selected' : ''}>${e(item.id)} · ${e(item.material || 'Print')} ${e(item.color || '')}</option>`).join('')}</select></label>`
    : `<a href="/portal/${token}" ${active === 'project' ? 'aria-current="page"' : ''}>Project <span class="mono">${e(quote.id)}</span></a>`;
  return `<header class="topbar">${logo(`/portal/${token}`)}<nav class="topnav" aria-label="Portaal">${project}${projects.length > 1 ? `<a href="/portal/${token}" ${active === 'project' ? 'aria-current="page"' : ''}>Overzicht</a>` : ''}<a href="/portal/${token}/account" ${active === 'account' ? 'aria-current="page"' : ''}>Account</a></nav></header>`;
}

function footer() {
  return '<footer class="footer-note"><span>pr3nt · 3D-printservice</span><span>Vragen? Mail <a href="mailto:bestellingen@pr3nt.nl">bestellingen@pr3nt.nl</a></span></footer>';
}

function notice(saved) {
  return saved ? `<div class="notice" role="status">${e(saved)}</div>` : '';
}

function viewerScript(quote) {
  const files = quoteFiles(quote).map((file, index) => ({ index, name: fileName(file), url: file.url }));
  if (!files.length) return '';
  return `<script type="importmap">{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}</script><script type="module">
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
const files = ${JSON.stringify(files).replace(/</g, '\\u003c')};
const mount = document.getElementById('viewer');
let renderer = null, frame = null;
function message(text, url) {
  mount.innerHTML = '';
  const box = document.createElement('div'); box.className = 'viewer-msg';
  const p = document.createElement('p'); p.textContent = text; box.appendChild(p);
  if (url) { const a = document.createElement('a'); a.className = 'btn'; a.href = url; a.textContent = 'Bestand downloaden'; box.appendChild(a); }
  mount.appendChild(box);
}
function reset() { if (frame) cancelAnimationFrame(frame); frame = null; if (renderer) { renderer.dispose(); renderer = null; } }
async function show(file) {
  if (!mount) return;
  document.querySelectorAll('.file').forEach((item) => item.classList.toggle('is-active', Number(item.dataset.file) === file.index));
  reset();
  if (!/\\.(stl|obj)$/i.test(file.name)) return message('Een 3D-voorbeeld kan alleen van STL- en OBJ-bestanden. Dit bestand kun je wel downloaden.', file.url);
  message('3D-voorbeeld wordt geladen');
  try {
    const isObj = /\\.obj$/i.test(file.name);
    const mod = await import(isObj ? 'three/addons/loaders/OBJLoader.js' : 'three/addons/loaders/STLLoader.js');
    const loader = isObj ? new mod.OBJLoader() : new mod.STLLoader();
    loader.load(file.url, (loaded) => {
      const width = Math.max(mount.clientWidth, 280), height = Math.max(mount.clientHeight, 240);
      const scene = new THREE.Scene(); scene.background = new THREE.Color(0xefebe3);
      const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 5000); camera.position.set(140, 120, 170);
      renderer = new THREE.WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.setSize(width, height);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8a8478, 2.2));
      const light = new THREE.DirectionalLight(0xffffff, 1.8); light.position.set(120, 200, 120); scene.add(light);
      const object = isObj ? loaded : new THREE.Mesh(loaded, new THREE.MeshStandardMaterial({ color: 0x9aa3ac, roughness: .6 }));
      const box = new THREE.Box3().setFromObject(object); object.position.sub(box.getCenter(new THREE.Vector3()));
      object.scale.multiplyScalar(135 / Math.max(box.getSize(new THREE.Vector3()).length(), 1)); scene.add(object);
      const controls = new OrbitControls(camera, renderer.domElement); controls.enableDamping = true;
      mount.innerHTML = ''; mount.appendChild(renderer.domElement);
      const tick = () => { frame = requestAnimationFrame(tick); controls.update(); renderer.render(scene, camera); }; tick();
    }, undefined, () => message('Het 3D-voorbeeld kon niet worden geladen.', file.url));
  } catch (error) { console.error(error); message('Het 3D-voorbeeld is tijdelijk niet beschikbaar.', file.url); }
}
document.addEventListener('click', (event) => { const button = event.target.closest('[data-preview]'); if (button) show(files[Number(button.dataset.preview)]); });
show(files.find((file) => /\\.(stl|obj)$/i.test(file.name)) || files[0]);
</script>`;
}

const pageScript = `<script>
document.addEventListener('click', function (event) {
  var opener = event.target.closest('[data-open]');
  if (opener) { var dialog = document.getElementById(opener.getAttribute('data-open')); if (dialog && dialog.showModal) dialog.showModal(); }
  var closer = event.target.closest('[data-close]');
  if (closer) { var parent = closer.closest('dialog'); if (parent) parent.close(); }
});
document.querySelectorAll('[data-thread]').forEach(function (thread) { thread.scrollTop = thread.scrollHeight; });
</script>`;

export function renderPortalPage(quote, allQuotes, saved = '') {
  const state = stateOf(quote);
  const body = `${notice(saved)}${statusSection(quote, state)}<div class="grid-2"><div class="stack">${quotePanel(quote, state)}${filesPanel(quote, state)}${reviewPanel(quote)}</div><div class="stack">${detailsPanel(quote)}${messagesPanel(quote)}${shippingPanel(quote, state)}${moreActionsPanel(quote, state)}</div></div>${footer()}`;
  return renderShell({ title: `Project ${quote.id}`, topbar: topbar(quote, allQuotes, 'project'), body, scripts: pageScript + viewerScript(quote) });
}

export function renderAccountPage(quote, allQuotes, saved = '') {
  const token = tokenOf(quote);
  const billing = quote.billing || {};
  const shipping = shippingOf(quote);
  const projects = accountProjects(quote, allQuotes);
  const contact = `<section class="panel" aria-labelledby="contact-title"><div class="panel-head"><h2 id="contact-title">Gegevens</h2></div><form class="panel-body form" method="post" action="/portal/${token}/account"><div class="form-grid"><label class="field"><span>Naam</span><input id="acc-name" name="name" value="${e(quote.name || '')}" autocomplete="name"></label><label class="field"><span>E-mail</span><input id="acc-email" type="email" name="email" value="${e(quote.email || '')}" autocomplete="email"></label><label class="field"><span>Telefoon</span><input id="acc-phone" type="tel" name="phone" value="${e(quote.phone || '')}" autocomplete="tel"></label><label class="field"><span>Bedrijf <small>(optioneel)</small></span><input id="acc-company" name="company" value="${e(billing.company || '')}" autocomplete="organization"></label></div><h3>Factuuradres</h3><div class="form-grid"><label class="field"><span>Naam op factuur</span><input id="acc-billing-name" name="billingName" value="${e(billing.name || quote.name || '')}"></label><label class="field"><span>Btw-nummer <small>(optioneel)</small></span><input id="acc-vat" name="vat" value="${e(billing.vat || '')}"></label><label class="field span-2"><span>Straat en huisnummer</span><input id="acc-address" name="address" value="${e(billing.address || shipping.address || '')}" autocomplete="street-address"></label><label class="field"><span>Postcode</span><input id="acc-postal" name="postalCode" value="${e(billing.postalCode || shipping.postalCode || '')}" autocomplete="postal-code"></label><label class="field"><span>Plaats</span><input id="acc-city" name="city" value="${e(billing.city || shipping.city || '')}" autocomplete="address-level2"></label><label class="field span-2"><span>Land</span><input id="acc-country" name="country" value="${e(billing.country || shipping.country || 'Nederland')}" autocomplete="country-name"></label></div><p class="muted small">Deze gegevens gelden voor al je projecten met dit e-mailadres.</p><div><button class="btn btn-dark" type="submit">Opslaan</button></div></form></section>`;
  const projectList = `<section class="panel" aria-labelledby="projects-title"><div class="panel-head"><h2 id="projects-title">Je projecten</h2><span class="muted small">${projects.length}</span></div><div class="panel-body"><ul class="projects">${projects.map((item) => `<li><a href="/portal/${tokenOf(item)}"><strong class="mono">${e(item.id)}</strong><span class="muted small">${e(formatDate(item.createdAt))}</span><small>${e([item.material, item.color].filter(Boolean).join(' · ') || 'Print')}</small><small>${e((statuses[statusIndex(item.status)] || statuses[0])[1])}</small></a></li>`).join('')}</ul></div></section>`;
  const invoices = projects.flatMap((item) => (Array.isArray(item.invoices) ? item.invoices : []).filter((invoice) => invoice && invoice.url).map((invoice) => ({ ...invoice, project: item.id })));
  const paid = projects.filter((item) => item.paidAt || item.status === 'paid' || statusIndex(item.status) > statusIndex('paid'));
  const invoiceItems = [
    ...paid.map((item) => `<li><div><strong class="mono">${e(item.id)}</strong><span>Factuur met btw-specificatie</span></div><a class="btn" href="/portal/${tokenOf(item)}/invoice" target="_blank" rel="noopener">Bekijken</a></li>`),
    ...invoices.map((invoice) => `<li><div><strong>${e(invoice.number || 'Factuur')}</strong><span>${e(invoice.project)} · ${e(formatDate(invoice.createdAt))} · € ${fmt(invoice.total || 0)}</span></div><a class="btn" href="${e(invoice.url)}">Downloaden</a></li>`),
  ];
  const invoicePanel = `<section class="panel" aria-labelledby="inv-title"><div class="panel-head"><h2 id="inv-title">Facturen</h2></div><div class="panel-body">${invoiceItems.length ? `<ul class="actions-list">${invoiceItems.join('')}</ul>` : '<p class="empty">Na je betaling staat hier je factuur.</p>'}</div></section>`;
  const intro = `<section class="status-text"><span class="label">Account</span><h1>${e(quote.name || 'Je account')}</h1><p>Je contact- en factuurgegevens, je projecten en je facturen.</p></section>`;
  const body = `${notice(saved)}${intro}<div class="grid-2"><div class="stack">${contact}</div><div class="stack">${projectList}${invoicePanel}</div></div>${footer()}`;
  return renderShell({ title: 'Account', topbar: topbar(quote, allQuotes, 'account'), body });
}

function notFound() {
  const body = `<section class="status-text"><span class="label">Klantportaal</span><h1>Project niet gevonden</h1><p>Controleer de link uit je mail. Kom je er niet uit, mail dan naar bestellingen@pr3nt.nl.</p></section>`;
  return renderShell({ title: 'Niet gevonden', topbar: `<header class="topbar">${logo('https://pr3nt.nl')}</header>`, body });
}

function savedText(value) {
  return String(value || '').replace(/[<>]/g, '').slice(0, 120);
}

export function registerPortalViewRoutes(app) {
  app.get('/portal/:token', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send(notFound());
    res.send(renderPortalPage(quote, quotes, savedText(req.query.saved)));
  });

  app.get('/portal/:token/account', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send(notFound());
    res.send(renderAccountPage(quote, quotes, savedText(req.query.saved)));
  });
}
