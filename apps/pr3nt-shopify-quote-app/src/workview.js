// Werkplaats: productiebord, planning, filament, instellingen en cijfers in de pr3nt-huisstijl. De website beheer je in src/cms/.
// Opslaan gaat via de bestaande POST-routes in myparcel.js, filament.js en sitecontent.js.
import { randomUUID } from 'node:crypto';
import { e } from './ui/layout.js';
import {
  staffOnly, teamOnly, adminOnly, renderAdmin, pageHead, notice, emptyState, dot, swatch, euro, ago, plural, clockText, timeOnly, hoursText, initials, displayName,
  nowWallClock, wallClock, dayLabel, shortDay, addDays, dateFromKey,
} from './ui/adminshell.js';
import {
  adminContext, productionOrders, printHours, printerOf, nextFreeSlot, needsPlanning, isRush, lowStockGrams, statusText, wallMs,
} from './ui/orders.js';
import { isAdmin, isProducer, readSettings, chargedShipping, isPickup, fillTrackingFromMyParcel } from './myparcel.js';
import { readQuotes, writeQuotes } from './admin.js';
import { sendCustomerMail } from './statusmails.js';
import { phaseOf, inProduction, canSee, isMine, producerFee, blockedReason, contactRule, producerConversation, offeredTo } from './producers.js';
import { claimOrder } from './claims.js';
import { notifyProducerAccepted } from './producermail.js';
import { readPayouts, balanceOf, isEarned, feeLine } from './payouts.js';
import { updateMissingProductionPrices } from './productionpricing.js';
import { stockRows, workerLabel } from './filament.js';
import { humanize } from './sitecontent.js';
import { quoteTotalInclVat, money } from './vat.js';

const baseUrl = String(process.env.APP_BASE_URL || 'https://app.pr3nt.nl').replace(/\/$/, '');

function durationText(minutes) {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const rest = total % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours}u ${String(rest).padStart(2, '0')}m` : `${hours} uur`;
}

function grams(value) {
  const number = money(value);
  return Math.abs(number) >= 1000 ? `${(number / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kg` : `${Math.round(number).toLocaleString('nl-NL')} g`;
}

// ---------- Productie: gewoon regels ----------
// Drie blokken onder elkaar: nieuwe orders (accepteren), in productie (klaar melden) en klaar voor verzending (label + verzonden).
// Externe producenten zien alleen nieuwe orders en hun eigen orders. De klant ziet nooit wie er print.

const phases = [
  ['new', 'Nieuwe orders', 'Betaald, nog geen producent'],
  ['making', 'In productie', 'Wordt geprint'],
  ['ship', 'Klaar voor verzending', 'Label erop en wegbrengen'],
];

function producerName(username, settings) {
  if (!username) return '';
  const account = (settings.users || []).find((item) => item.username === username);
  return account?.name || username;
}

function orderTitle(quote, user) {
  const first = String(quote.name || '').trim().split(/\s+/)[0] || 'Klant';
  return isProducer(user) ? `Order voor ${first}` : (quote.name || 'Order');
}

function orderLink(quote, user) {
  const id = encodeURIComponent(quote.id);
  return isAdmin(user) ? `/admin/quotes/${id}` : `/admin/work/orders/${id}`;
}

function feeText(quote) {
  const fee = producerFee(quote);
  if (!fee.total) return '';
  return fee.ship ? `${euro(fee.total)} <small>(${euro(fee.print)} printen + ${euro(fee.ship)} verzenden)</small>` : `${euro(fee.total)} <small>(printen)</small>`;
}

// Moet er nog een label komen voordat het pakket weg kan? Dat label maakt Pr3nt (bij Verzenden), niet de producent.
function waitsForLabel(quote) {
  return chargedShipping(quote) && !isPickup(quote) && !quote.myParcelShipmentId && !String(quote.trackingCode || '').trim();
}

function rowAction(quote, user) {
  const action = `/admin/work/orders/${encodeURIComponent(quote.id)}`;
  const phase = phaseOf(quote);
  if (phase === 'new') return `<form method="post" action="${action}/accept"><button class="btn btn-dark" type="submit">Accepteren</button></form>`;
  if (!isMine(user, quote)) return '';
  if (phase === 'making') return `<form method="post" action="${action}/status"><button class="btn btn-primary" type="submit" name="status" value="ready_to_ship">Klaar ✓</button></form>`;
  if (waitsForLabel(quote)) return isAdmin(user) ? '<a class="btn" href="/admin/verzenden">Label maken</a>' : '<span class="muted small">Wacht op label</span>';
  const label = quote.myParcelShipmentId ? `<a class="btn" href="/admin/quotes/${encodeURIComponent(quote.id)}/label" target="_blank" rel="noopener">Label</a>` : '';
  return `${label}<form method="post" action="${action}/status"><button class="btn btn-dark" type="submit" name="status" value="shipped">Verzonden</button></form>`;
}

function productionRow(quote, user, settings, moved) {
  const who = isProducer(user)
    ? (phaseOf(quote) === 'new' ? `<strong>${feeText(quote) || 'Vergoeding volgt'}</strong><small>Voor jou</small>` : `<strong>${feeText(quote)}</strong><small>Geaccepteerd ${e(ago(quote.producerAcceptedAt))}</small>`)
    : (() => { const fee = producerFee(quote).total; const pay = fee ? `<small>Vergoeding ${euro(fee)}</small>` : ''; return quote.producer ? `<strong>${e(producerName(quote.producer, settings))}</strong>${pay}` : `<strong class="muted">Nog niemand</strong>${pay}`; })();
  const meta = [quote.material, quote.color].filter(Boolean).join(' · ') || 'Print';
  return `<article class="job-row${isRush(quote) ? ' is-rush' : ''}${moved ? ' is-moved' : ''}" id="q-${e(quote.id)}" style="--c:${swatch(quote.color)}"><div class="row-main"><strong><a href="${orderLink(quote, user)}">${e(orderTitle(quote, user))}</a>${isRush(quote) ? ' <em class="tag-rush">Spoed</em>' : ''}</strong><small>${dot(quote.color)}${e(meta)} · <span class="mono">${e(quote.id)}</span></small></div><div class="row-when">${who}</div><div class="row-hours num">${e(hoursText(printHours(quote)))}</div><div class="row-action">${rowAction(quote, user)}</div></article>`;
}

function workPage({ context, user, moved, flash: flashText = '', balance = null }) {
  const { quotes, settings } = context;
  const orders = quotes.filter((quote) => inProduction(quote) && offeredTo(user, quote, settings))
    .sort((a, b) => (isRush(b) - isRush(a)) || String(a.paidAt || a.createdAt).localeCompare(String(b.paidAt || b.createdAt)));
  const groups = phases.map(([key, label, hint]) => {
    const rows = orders.filter((quote) => phaseOf(quote) === key);
    if (!rows.length) return '';
    return `<section class="work-group group-${key}"><header><h2>${label}</h2><span class="lane-count num">${rows.length}</span><small>${hint}</small></header>${rows.map((quote) => productionRow(quote, user, settings, quote.id === moved)).join('')}</section>`;
  }).join('');
  const fresh = orders.filter((quote) => phaseOf(quote) === 'new').length;
  const text = isProducer(user)
    ? (fresh ? `${plural(fresh, 'nieuwe order wacht', 'nieuwe orders wachten')} op een producent. Wie het eerst accepteert, krijgt hem.` : 'Er zijn nu geen nieuwe orders. Je krijgt ze hier te zien zodra er een betaald is.')
    : (orders.length ? `${plural(orders.length, 'order', 'orders')} in productie${fresh ? `, waarvan ${fresh} nog zonder producent` : ''}.` : 'Niks in productie. Zodra er een order betaald is, verschijnt hij hier.');
  const movedQuote = moved ? quotes.find((quote) => quote.id === moved) : null;
  const flash = flashText ? notice(flashText, 'warn') : movedQuote ? (movedQuote.status === 'shipped' ? notice('Verzonden! De klant krijgt een mail met de track & trace.', 'party') : notice(`${orderTitle(movedQuote, user)} staat nu bij ${statusText(movedQuote).toLowerCase()}.`)) : '';
  const toShip = orders.filter((quote) => phaseOf(quote) === 'ship' && quote.myParcelShipmentId && isMine(user, quote));
  const allLabels = toShip.length > 1 ? `<a class="btn btn-dark" href="/admin/labels?ids=${encodeURIComponent(toShip.map((quote) => quote.id).join(','))}" target="_blank" rel="noopener">${toShip.length} labels printen</a>` : '';
  const earned = isProducer(user) && balance ? `<a class="btn" href="/admin/work/vergoeding">Te ontvangen ${e(euro(balance.total + balance.waitingTotal))}</a>` : '';
  const head = pageHead({ eyebrow: isProducer(user) ? 'Producent' : 'Werkplaats', title: 'Productie', text: e(text), actions: `${allLabels}${earned}` });
  const body = orders.length ? `<div class="work-list">${groups}</div>` : `<section class="panel">${emptyState(isProducer(user) ? 'Even niks te doen' : 'Niks in productie', 'Tijd om de printbedden schoon te maken.')}</section>`;
  return renderAdmin({ title: 'Productie', user, active: 'work', context, body: `<div data-work-live data-refresh="45">${flash}${head}${body}</div>` });
}

// ---------- Order voor producent of medewerker ----------

function orderPage({ quote, context, user, flash = '', draft = '' }) {
  const { settings } = context;
  const phase = phaseOf(quote);
  const mine = isMine(user, quote) && phase !== 'new';
  const fee = producerFee(quote);
  const action = `/admin/work/orders/${encodeURIComponent(quote.id)}`;
  const first = String(quote.name || '').trim().split(/\s+/)[0] || 'de klant';
  const lines = (Array.isArray(quote.quoteLines) ? quote.quoteLines : []).filter((line) => !/verzend|verwerking|korting|toeslag/i.test(`${line.label || ''}`));
  const spec = `<dl class="spec"><dt>Materiaal</dt><dd>${e(quote.material || '-')}</dd><dt>Kleur</dt><dd>${dot(quote.color)} ${e(quote.color || '-')}</dd><dt>Printtijd</dt><dd>${e(hoursText(printHours(quote)))}</dd>${isRush(quote) ? '<dt>Spoed</dt><dd><em class="tag-rush">Ja, graag snel</em></dd>' : ''}${quote.description ? `<dt>Toelichting</dt><dd>${e(quote.description)}</dd>` : ''}${lines.length ? `<dt>Regels</dt><dd>${lines.map((line) => `${e(line.qty || 1)} × ${e(line.label || '')}${line.description ? ` <span class="muted small">${e(line.description)}</span>` : ''}`).join('<br>')}</dd>` : ''}</dl>`;
  const files = (Array.isArray(quote.files) ? quote.files : []).filter((file) => file?.url);
  const fileList = files.length
    ? (mine ? `<ul class="files">${files.map((file) => `<li class="file"><span class="file-ext">${e(String(file.originalName || file.url).split('.').pop().slice(0, 4).toUpperCase())}</span><div class="file-main"><strong>${e(file.originalName || 'Bestand')}</strong></div><div class="file-actions"><a class="btn btn-quiet" href="${e(file.url)}" download>Download</a></div></li>`).join('')}</ul>` : `<p class="muted small">${plural(files.length, 'bestand', 'bestanden')}. Downloaden kan na accepteren.</p>`)
    : '<p class="muted small">Geen bestanden bij deze order.</p>';
  const feeState = isEarned(quote) ? '<p class="muted small">Verdiend: telt mee in je volgende uitbetaling. <a href="/admin/work/vergoeding">Bekijk vergoeding</a></p>' : phase === 'new' ? '<p class="muted small">Dit bedrag staat vast zodra je accepteert.</p>' : '<p class="muted small">Je verdient dit zodra de order verzonden is.</p>';
  const feePanel = `<section class="panel"><div class="panel-head"><h2>Vergoeding</h2><strong class="num">${fee.total ? euro(fee.total) : '-'}</strong></div><div class="panel-body"><dl class="spec"><dt>Printen</dt><dd>${euro(fee.print)}</dd>${fee.ship ? `<dt>Verzenden</dt><dd>${euro(fee.ship)} <span class="muted small">inpakken en wegbrengen; het label betaalt Pr3nt</span></dd>` : '<dt>Verzenden</dt><dd class="muted">Niet nodig (afhalen of geen verzendkosten)</dd>'}</dl>${quote.producer && !isProducer(user) ? `<p class="muted small">Producent: ${e(producerName(quote.producer, settings))}</p>` : ''}${feeState}</div></section>`;
  let next = '';
  if (phase === 'new') next = `<form method="post" action="${action}/accept"><button class="btn btn-dark" type="submit">Order accepteren</button></form><p class="muted small">Na accepteren is de order van jou en zien andere producenten hem niet meer.</p>`;
  else if (mine && phase === 'making') next = `<form method="post" action="${action}/status"><button class="btn btn-primary" type="submit" name="status" value="ready_to_ship">Print is klaar ✓</button></form>`;
  else if (mine && phase === 'ship' && waitsForLabel(quote)) next = isAdmin(user) ? '<div class="btn-row"><a class="btn btn-dark" href="/admin/verzenden">Label maken bij Verzenden</a></div>' : '<p class="muted small">Pr3nt maakt het verzendlabel. Je krijgt een mail zodra het klaarstaat; daarna print je het hier.</p>';
  else if (mine && phase === 'ship') next = `<div class="btn-row">${quote.myParcelShipmentId ? `<a class="btn" href="/admin/quotes/${encodeURIComponent(quote.id)}/label" target="_blank" rel="noopener">Label printen</a>` : ''}<form method="post" action="${action}/status"><button class="btn btn-dark" type="submit" name="status" value="shipped">Verzonden</button></form></div>${quote.myParcelShipmentId ? '<p class="muted small">Print het label, plak het op het pakket en breng het naar een PostNL-punt. Bij Verzonden krijgt de klant de track & trace.</p>' : (chargedShipping(quote) && !isPickup(quote) ? '<p class="muted small">Track & trace is al ingevuld.</p>' : '<p class="muted small">Geen label nodig: deze klant haalt op of betaalde geen verzending. Overleg met Pr3nt hoe de print bij de klant komt.</p>')}`;
  const nextPanel = next ? `<section class="next" aria-label="Volgende stap"><span class="label">Volgende stap</span><div class="next-main"><div><h2>${e(statusText(quote))}</h2></div><div>${next}</div></div></section>` : '';
  const thread = producerConversation(quote, user).map((message) => {
    const me = message.from !== 'klant';
    const by = message.from === 'klant' ? first : message.producer ? (isProducer(user) && message.producer === user.username ? 'jij, als Pr3nt' : `${producerName(message.producer, settings)}, als Pr3nt`) : 'Pr3nt';
    return `<div class="msg${me ? ' me' : ''}">${e(message.text)}<small>${e(by)} · ${e(ago(message.createdAt))}</small></div>`;
  }).join('') || `<p class="empty">Nog geen berichten. Heb je een vraag voor ${e(first)}? Stel hem hier.</p>`;
  const chat = mine ? `<section class="panel" id="gesprek"><div class="panel-head"><h2>Contact met ${e(first)}</h2></div><div class="panel-body"><p class="callout"><strong>Je bent Pr3nt</strong>${e(contactRule)}</p><div class="thread">${thread}</div><form method="post" action="${action}/message" class="form"><label class="field"><span>Bericht aan ${e(first)} <small>(komt in het klantportaal, afzender Pr3nt)</small></span><textarea name="text" required maxlength="2000" data-autosize>${e(draft)}</textarea></label><div class="btn-row"><button class="btn btn-dark" type="submit">Versturen</button></div></form></div></section>` : '';
  const head = pageHead({ eyebrow: `<a href="/admin/work">Productie</a>`, title: e(orderTitle(quote, user)), text: `<span class="mono">${e(quote.id)}</span> · ${e(statusText(quote))}` });
  const body = `${flash ? notice(flash, /niet|mag/i.test(flash) ? 'warn' : '') : ''}${head}${nextPanel}<div class="grid-2"><div class="stack"><section class="panel"><div class="panel-head"><h2>Wat moet er geprint worden</h2></div><div class="panel-body">${spec}</div></section><section class="panel"><div class="panel-head"><h2>Bestanden</h2></div><div class="panel-body">${fileList}</div></section></div><div class="stack">${feePanel}${chat}</div></div>`;
  return renderAdmin({ title: orderTitle(quote, user), user, active: 'work', context, body });
}

// ---------- Filament ----------

function filamentPage({ context, user, saved }) {
  const { filament, quotes, settings } = context;
  const admin = isAdmin(user);
  const rows = stockRows(filament, quotes, settings, user);
  const all = [...filament.deliveries, ...filament.usage, ...filament.requests];
  const available = rows.reduce((sum, row) => sum + Math.max(0, row.availableGrams), 0);
  const low = rows.filter((row) => row.deliveredGrams > 0 && row.availableGrams < lowStockGrams);
  const options = (key, extra = []) => [...new Set([...extra, ...all.map((item) => String(item[key] || '').trim())].filter(Boolean))].sort((a, b) => a.localeCompare(b, 'nl')).map((value) => `<option value="${e(value)}">`).join('');
  const datalists = `<datalist id="fil-colors">${options('color', ['Zwart', 'Wit', 'Grijs', 'Rood', 'Blauw', 'Groen'])}</datalist><datalist id="fil-types">${options('type', ['PLA', 'PETG', 'ABS', 'ASA', 'TPU'])}</datalist><datalist id="fil-suppliers">${options('supplier', ['TM3D', 'Bambu Lab'])}</datalist>`;
  const accounts = [{ username: 'admin', name: 'Admin' }, ...settings.users];
  const workerSelect = (selected = '') => `<label class="field"><span>Medewerker</span><select name="worker">${accounts.map((account) => `<option value="${e(account.username)}" ${selected === account.username ? 'selected' : ''}>${e(account.name || account.username)}</option>`).join('')}</select></label>`;
  const filamentFields = (gramsLabel = 'Aantal gram') => `<div class="form-grid"><label class="field"><span>Kleur</span><input name="color" list="fil-colors" required></label><label class="field"><span>Type</span><input name="type" list="fil-types" required></label><label class="field"><span>${gramsLabel}</span><input name="grams" inputmode="decimal" required placeholder="1000"></label><label class="field"><span>Leverancier</span><input name="supplier" list="fil-suppliers" value="TM3D"></label></div>`;
  const dialog = (id, title, action, inner, submit) => `<dialog id="${id}" aria-labelledby="${id}-title"><div class="panel-head"><h2 id="${id}-title">${title}</h2><button class="btn btn-quiet" type="button" data-close>Sluiten</button></div><form class="panel-body form" method="post" action="${action}">${inner}<div class="btn-row"><button class="btn btn-dark" type="submit">${submit}</button><button class="btn btn-quiet" type="button" data-close>Annuleren</button></div></form></dialog>`;
  const activeOrders = productionOrders(quotes).map((quote) => `<option value="${e(quote.id)}">${e(quote.name || '')}</option>`).join('');
  const dialogs = [
    dialog('dlg-use', 'Verbruik registreren', '/admin/filament/use', `${admin ? workerSelect(user.username) : ''}${filamentFields('Verbruikt (gram)')}<label class="field"><span>Order <small>(optioneel)</small></span><input name="orderId" list="fil-orders" placeholder="Bijv. PR-2026-1044"></label><datalist id="fil-orders">${activeOrders}</datalist>`, 'Verbruik opslaan'),
    dialog('dlg-request', 'Filament aanvragen', '/admin/filament/request', `${filamentFields()}<label class="field"><span>Opmerking <small>(optioneel)</small></span><textarea name="note" placeholder="Bijv. voor de order van volgende week"></textarea></label>`, 'Aanvragen'),
    admin ? dialog('dlg-delivery', 'Levering registreren', '/admin/filament/delivery', `${workerSelect()}${filamentFields('Geleverd (gram)')}<label class="field"><span>Referentie <small>(optioneel)</small></span><input name="reference" placeholder="Bestelnummer of factuur"></label>`, 'Levering opslaan') : '',
  ].join('');
  // Voorraadsleutels zijn kleine letters; toon de schrijfwijze zoals hij is ingevoerd.
  const original = (key, value) => {
    const found = all.map((item) => String(item[key] || '').trim()).find((text) => text.toLowerCase() === value);
    if (found) return found;
    return value.length <= 4 ? value.toUpperCase() : value.charAt(0).toUpperCase() + value.slice(1);
  };
  rows.forEach((row) => { row.color = original('color', row.color); row.type = original('type', row.type); row.supplier = row.supplier ? original('supplier', row.supplier) : ''; });
  const spools = rows.map((row, index) => {
    const pct = row.deliveredGrams > 0 ? Math.max(0, Math.min(100, Math.round((row.availableGrams / row.deliveredGrams) * 100))) : 0;
    const isLow = row.deliveredGrams > 0 && row.availableGrams < lowStockGrams;
    const fill = JSON.stringify({ color: row.color, type: row.type, supplier: row.supplier });
    return `<article class="spool${isLow ? ' is-low' : ''}" style="--c:${swatch(row.color)};--fill:${pct};--i:${index}"><div class="spool-art" aria-hidden="true"><span></span></div><div class="spool-main"><strong>${e(row.color || 'Onbekend')}</strong><small>${e([row.type, row.supplier].filter(Boolean).join(' · '))}${admin ? ` · ${e(workerLabel(row.worker, settings))}` : ''}</small><span class="spool-grams num">${e(grams(row.availableGrams))}<small> over</small></span><span class="muted small">${e(grams(row.usedGrams))} gebruikt van ${e(grams(row.deliveredGrams))}</span></div><div class="spool-actions"><button class="btn btn-quiet" type="button" data-open="dlg-use" data-fill='${e(fill)}'>Verbruik</button>${isLow ? `<button class="btn" type="button" data-open="dlg-request" data-fill='${e(fill)}'>Bijbestellen</button>` : ''}</div></article>`;
  }).join('');
  const visibleRequests = filament.requests.filter((request) => admin || request.worker === user.username);
  const open = visibleRequests.filter((request) => !['geleverd', 'afgewezen'].includes(request.status));
  const closed = visibleRequests.filter((request) => ['geleverd', 'afgewezen'].includes(request.status));
  const tone = { aangevraagd: 'wait', besteld: 'act', geleverd: 'ok', afgewezen: '' };
  const requestRow = (request) => {
    const buttons = admin && !['geleverd', 'afgewezen'].includes(request.status)
      ? `<form method="post" action="/admin/filament/request/${encodeURIComponent(request.id)}/status" class="btn-row">${request.status === 'aangevraagd' ? '<button class="btn" type="submit" name="status" value="besteld">Besteld</button>' : ''}<input type="hidden" name="registerDelivery" value="1"><button class="btn btn-primary" type="submit" name="status" value="geleverd" title="Zet de levering ook meteen op voorraad">Geleverd</button><button class="btn btn-quiet" type="submit" name="status" value="afgewezen">Afwijzen</button></form>`
      : request.note ? `<span class="muted small">${e(request.note)}</span>` : '';
    return `<li class="request">${dot(request.color)}<span><strong>${e(request.color)} ${e(request.type)} · ${e(grams(request.grams))}</strong><small>${e(workerLabel(request.worker, settings))} · ${e(request.supplier || '-')} · ${e(ago(request.createdAt))}</small></span><span class="pill ${tone[request.status] || ''}">${e(humanize(request.status || 'aangevraagd'))}</span>${buttons}</li>`;
  };
  const usage = [...filament.usage].filter((item) => admin || item.worker === user.username).slice(0, 12).map((item) => `<li class="request">${dot(item.color)}<span><strong>${e(item.color)} ${e(item.type)} · ${e(grams(item.grams))}</strong><small>${e(workerLabel(item.worker, settings))}${item.orderId ? ` · ${e(item.orderId)}` : ''} · ${e(ago(item.createdAt))}</small></span></li>`).join('');
  const text = rows.length ? `${grams(available)} op voorraad${low.length ? `. Bijna op: ${low.slice(0, 3).map((row) => `${row.color} ${row.type}`.trim()).join(', ')}` : '. Alles goed gevuld'}.` : 'Nog geen voorraad geregistreerd. Begin met een levering of een aanvraag.';
  const head = pageHead({ eyebrow: 'Voorraad', title: 'Filament', text: e(text), actions: `<button class="btn btn-primary" type="button" data-open="dlg-use">Verbruik registreren</button><button class="btn" type="button" data-open="dlg-request">Aanvragen</button>${admin ? '<button class="btn" type="button" data-open="dlg-delivery">Levering</button>' : ''}` });
  const stock = rows.length ? `<section class="spools" aria-label="Voorraad">${spools}</section>` : `<section class="panel">${emptyState('Nog geen spoelen', 'Registreer een levering, dan verschijnt hij hier.')}</section>`;
  const requests = `<section class="panel"><div class="panel-head"><h2>Aanvragen</h2><span class="muted small">${open.length} open</span></div><div class="panel-body">${open.length ? `<ul class="request-list">${open.map(requestRow).join('')}</ul>` : '<p class="empty">Geen open aanvragen.</p>'}${closed.length ? `<details class="reveal"><summary class="btn btn-quiet">Afgerond (${closed.length})</summary><ul class="request-list">${closed.slice(0, 20).map(requestRow).join('')}</ul></details>` : ''}</div></section>`;
  const history = usage ? `<section class="panel"><div class="panel-head"><h2>Laatst verbruikt</h2></div><div class="panel-body"><ul class="request-list">${usage}</ul></div></section>` : '';
  const flash = saved ? notice('Opgeslagen. Voorraad is bijgewerkt.') : '';
  return renderAdmin({ title: 'Filament', user, active: 'filament', context, body: `${flash}${head}${stock}<div class="grid-2">${requests}${history}</div>${datalists}${dialogs}` });
}

// ---------- Instellingen (printers, team, agenda) ----------

function settingsPage({ context, user, saved }) {
  const { settings } = context;
  const printers = Array.from({ length: settings.printerCount }, (_, index) => `<label class="field printer-name"><span>Printer ${index + 1}</span><input name="printerName" value="${e(settings.printers[index]?.name || `Printer ${index + 1}`)}"></label>`).join('');
  const userRow = (account, isNew = false) => {
    const username = String(account.username || '').toLowerCase();
    const name = account.name || username;
    return `<div class="member${isNew ? ' is-new' : ''}">${isNew ? '' : `<span class="avatar" aria-hidden="true">${e(initials(name))}</span>`}<label class="field"><span>Naam</span><input name="userDisplayName" value="${e(isNew ? '' : name)}" placeholder="Bijv. Sanne"></label><label class="field"><span>Gebruikersnaam</span><input name="userName" value="${e(username)}" autocomplete="off" ${isNew ? 'placeholder="sanne"' : ''}></label><label class="field"><span>Rol</span><select name="userRole"><option value="worker" ${account.role === 'worker' || !account.role ? 'selected' : ''}>Medewerker</option><option value="producer" ${account.role === 'producer' ? 'selected' : ''}>Producent (extern)</option><option value="admin" ${account.role === 'admin' ? 'selected' : ''}>Admin</option></select></label><label class="field"><span>${isNew ? 'Wachtwoord' : 'Nieuw wachtwoord'}</span><input name="userPassword" type="password" autocomplete="new-password" placeholder="${isNew ? 'Verplicht' : 'Leeg laten = houden'}"><input type="hidden" name="userPasswordHash" value="${e(account.passwordHash || '')}"></label><label class="field member-company"><span>Bedrijfsnaam <small>(alleen voor producenten: berichten met deze naam worden tegengehouden)</small></span><input name="userCompany" value="${e(account.company || '')}" placeholder="Bijv. Printwerk Jansen"></label>${isNew ? '' : `<button class="btn btn-quiet danger-link" type="submit" name="deleteUser" value="${e(username)}" data-confirm-click="${e(name)} verwijderen? Die kan daarna niet meer inloggen.">Verwijderen</button>`}</div>`;
  };
  const team = settings.users.map((account) => userRow(account)).join('');
  const head = pageHead({ eyebrow: 'Beheer', title: 'Instellingen', text: 'Printers, je team en producenten. Alles op één plek, met één keer opslaan.' });
  const body = `<form method="post" action="/admin/work/options" class="settings" data-dirty-form id="settings-form"><section class="panel" id="printers"><div class="panel-head"><h2>Printers</h2><label class="count-field"><span class="muted small">Aantal</span><input type="number" name="printerCount" min="1" max="20" value="${e(settings.printerCount)}" data-printer-count></label></div><div class="panel-body"><p class="muted small">Namen zie je terug in de planning, de zijbalk en de agenda.</p><div class="printer-names" data-printer-names>${printers}</div></div></section><section class="panel" id="team"><div class="panel-head"><h2>Team</h2><span class="muted small">${plural(settings.users.length, 'account', 'accounts')} naast de hoofdbeheerder</span></div><div class="panel-body"><div class="team">${team || '<p class="empty">Nog geen extra accounts. Voeg hieronder een collega toe.</p>'}</div><details class="reveal"><summary class="btn">+ Teamlid toevoegen</summary>${userRow({ role: 'worker' }, true)}</details><p class="muted small">Medewerkers zien productie en filament. Producenten (extern) zien alleen nieuwe orders en hun eigen orders. Admins zien alles.</p></div></section><div class="savebar" data-savebar><span class="savebar-text" data-save-text>Alles is opgeslagen</span><button class="btn btn-primary" type="submit">Opslaan</button></div></form>`;
  return renderAdmin({ title: 'Instellingen', user, active: 'options', context, body: (saved ? notice('Instellingen opgeslagen.') : '') + head + body });
}

// ---------- Cijfers ----------

function weekKey(date) {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}

function statsPage({ context, user }) {
  const { quotes, settings } = context;
  const all = quotes.filter((quote) => !quote.archivedAt);
  const paidList = all.filter((quote) => quote.paidAt);
  const now = new Date();
  const month = now.toISOString().slice(0, 7);
  const lastMonthDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const lastMonth = lastMonthDate.toISOString().slice(0, 7);
  const revenue = (list) => list.reduce((sum, quote) => sum + quoteTotalInclVat(quote), 0);
  const thisMonth = paidList.filter((quote) => String(quote.paidAt).slice(0, 7) === month);
  const prevMonth = paidList.filter((quote) => String(quote.paidAt).slice(0, 7) === lastMonth);
  const delta = revenue(prevMonth) > 0 ? Math.round(((revenue(thisMonth) - revenue(prevMonth)) / revenue(prevMonth)) * 100) : null;
  const since = Date.now() - 90 * 86400000;
  const recentPaid = paidList.filter((quote) => new Date(quote.paidAt).getTime() >= since);
  const sentRecent = all.filter((quote) => quote.quoteSentAt && new Date(quote.quoteSentAt).getTime() >= since);
  const conversion = sentRecent.length ? Math.round((sentRecent.filter((quote) => quote.paidAt).length / sentRecent.length) * 100) : null;
  const leadDays = recentPaid.map((quote) => (new Date(quote.paidAt) - new Date(quote.createdAt)) / 86400000).filter((days) => days >= 0).sort((a, b) => a - b);
  const median = leadDays.length ? leadDays[Math.floor(leadDays.length / 2)] : null;
  const avg = recentPaid.length ? revenue(recentPaid) / recentPaid.length : 0;
  const kpis = [
    ['Omzet deze maand', euro(revenue(thisMonth)), delta === null ? 'incl. btw' : `${delta >= 0 ? '+' : ''}${delta}% t.o.v. vorige maand`, delta === null ? '' : delta >= 0 ? 'up' : 'down'],
    ['Betaalde orders', String(thisMonth.length), 'deze maand'],
    ['Gemiddelde order', recentPaid.length ? euro(avg) : '-', 'laatste 90 dagen'],
    ['Offerte wordt order', conversion === null ? '-' : `${conversion}%`, 'van verstuurde offertes, 90 dagen'],
    ['Aanvraag tot betaling', median === null ? '-' : `${median < 1 ? '< 1' : Math.round(median)} ${median !== null && Math.round(median) === 1 ? 'dag' : 'dagen'}`, 'mediaan, 90 dagen'],
  ].map(([label, value, hint, trend], index) => `<div class="kpi" style="--i:${index}"><span class="label">${label}</span><strong class="num">${e(value)}</strong><small class="${trend || ''}">${e(hint)}</small></div>`).join('');
  const weeks = Array.from({ length: 8 }, (_, index) => weekKey(new Date(Date.now() - (7 - index) * 7 * 86400000)));
  const perWeek = weeks.map((week) => ({ week, created: all.filter((quote) => quote.createdAt && weekKey(new Date(quote.createdAt)) === week).length, paid: paidList.filter((quote) => weekKey(new Date(quote.paidAt)) === week).length }));
  const max = Math.max(1, ...perWeek.map((item) => Math.max(item.created, item.paid)));
  const best = [...perWeek].sort((a, b) => b.created - a.created)[0];
  const chart = `<div class="bars" role="img" aria-label="Aanvragen en betaalde orders per week">${perWeek.map((item, index) => `<div class="bar-col" style="--i:${index}"><div class="bar-pair"><i class="bar-a" style="--h:${(item.created / max) * 100}%" title="${item.created} aanvragen"></i><i class="bar-b" style="--h:${(item.paid / max) * 100}%" title="${item.paid} betaald"></i></div><span>${dateFromKey(item.week).getUTCDate()}/${dateFromKey(item.week).getUTCMonth() + 1}</span></div>`).join('')}</div><p class="legend"><span class="key-a">Aanvragen</span><span class="key-b">Betaald</span>${best?.created ? `<span class="muted">Drukste week: ${dateFromKey(best.week).getUTCDate()}/${dateFromKey(best.week).getUTCMonth() + 1} met ${plural(best.created, 'aanvraag', 'aanvragen')}</span>` : ''}</p>`;
  const tally = (key) => {
    const counts = new Map();
    all.forEach((quote) => { const value = String(quote[key] || '').trim(); if (value) counts.set(value, (counts.get(value) || 0) + 1); });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  };
  const tallyList = (entries, withDot) => {
    const top = Math.max(1, ...entries.map(([, count]) => count));
    return entries.length ? `<ul class="hbars">${entries.map(([label, count], index) => `<li style="--w:${(count / top) * 100}%;--i:${index}${withDot ? `;--c:${swatch(label)}` : ''}"><span>${withDot ? dot(label) : ''}${e(label)}</span><i></i><strong class="num">${count}</strong></li>`).join('')}</ul>` : '<p class="empty">Nog geen gegevens.</p>';
  };
  const production = productionOrders(quotes);
  const plannedHours = production.filter((quote) => quote.scheduledStartAt).reduce((sum, quote) => sum + printHours(quote), 0);
  const payout = quotes.filter((quote) => isEarned(quote) && String(quote.shippedAt || '').slice(0, 7) === month).reduce((sum, quote) => sum + feeLine(quote).total, 0);
  const workshop = `<dl class="spec"><dt>In de werkplaats</dt><dd>${plural(production.length, 'order', 'orders')}</dd><dt>Ingeplande printuren</dt><dd>${e(hoursText(plannedHours))} over ${plural(settings.printers.length, 'printer', 'printers')}</dd><dt>Productievergoeding</dt><dd>${e(euro(payout))} verdiend deze maand · <a href="/admin/uitbetalen">uitbetalen</a></dd><dt>Verzendlabels klaar</dt><dd>${all.filter((quote) => quote.myParcelShipmentId).length}</dd><dt>Spoedorders actief</dt><dd>${all.filter((quote) => isRush(quote) && !['shipped', 'delivered'].includes(quote.status)).length}</dd></dl>`;
  const head = pageHead({ eyebrow: 'Beheer', title: 'Cijfers', text: thisMonth.length ? `Deze maand ${plural(thisMonth.length, 'betaalde order', 'betaalde orders')}. ${delta !== null && delta > 0 ? 'Het gaat de goede kant op.' : 'Elke order telt.'}` : 'Nog geen betaalde orders deze maand. Die eerste komt eraan.' });
  const body = `<section class="kpis">${kpis}</section><div class="grid-2"><section class="panel"><div class="panel-head"><h2>Per week</h2><span class="muted small">laatste 8 weken</span></div><div class="panel-body">${chart}</div></section><section class="panel"><div class="panel-head"><h2>Werkplaats</h2></div><div class="panel-body">${workshop}</div></section></div><div class="grid-2 even"><section class="panel"><div class="panel-head"><h2>Populairste kleuren</h2></div><div class="panel-body">${tallyList(tally('color'), true)}</div></section><section class="panel"><div class="panel-head"><h2>Materialen</h2></div><div class="panel-body">${tallyList(tally('material'), false)}</div></section></div>`;
  return renderAdmin({ title: 'Cijfers', user, active: 'stats', context, body: head + body });
}

// Bedrijfsnaam van een producent staat in Instellingen > Team (niet in de inlog-cookie).
async function companyOf(user) {
  const settings = await readSettings();
  return settings.users.find((account) => account.username === user.username)?.company || '';
}

// ---------- Routes ----------

export function registerWorkViewRoutes(app) {
  const admin = adminOnly();

  app.get('/admin/work', teamOnly, async (req, res) => {
    await updateMissingProductionPrices().catch(() => {});
    const context = await adminContext(req.internalUser);
    const flash = req.query.taken === '1' ? 'Net te laat: die order is al door een andere producent geaccepteerd.' : '';
    const balance = isProducer(req.internalUser) ? balanceOf(req.internalUser.username, context.quotes, await readPayouts()) : null;
    res.send(workPage({ context, user: req.internalUser, moved: String(req.query.moved || ''), flash, balance }));
  });

  // De planning is weg: oude links komen gewoon op Productie uit.
  app.get('/admin/work/agenda', teamOnly, (req, res) => res.redirect('/admin/work'));

  const findVisible = async (req) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (!quote || !canSee(req.internalUser, quote)) return { quotes, quote: null };
    // Nieuwe orders die niet bij deze producent passen (pauze, ander materiaal) laten we niet zien.
    if (isProducer(req.internalUser) && phaseOf(quote) === 'new' && !offeredTo(req.internalUser, quote, await readSettings())) return { quotes, quote: null };
    return { quotes, quote };
  };
  const notFound = async (req, res) => {
    const context = await adminContext(req.internalUser);
    return res.status(404).send(renderAdmin({ title: 'Niet gevonden', user: req.internalUser, active: 'work', context, body: `${pageHead({ eyebrow: 'Productie', title: 'Deze order is er niet (meer)', text: 'Misschien heeft iemand anders hem al geaccepteerd.' })}<a class="btn btn-dark" href="/admin/work">Naar productie</a>` }));
  };

  app.get('/admin/work/orders/:id', teamOnly, async (req, res) => {
    const { quotes, quote } = await findVisible(req);
    if (!quote) return notFound(req, res);
    const context = await adminContext(req.internalUser, { quotes });
    const flash = req.query.sent === '1' ? 'Bericht verstuurd. De klant ziet het in het portaal, met Pr3nt als afzender.' : req.query.accepted === '1' ? 'Geaccepteerd. Deze order is nu van jou.' : '';
    res.send(orderPage({ quote, context, user: req.internalUser, flash }));
  });

  // Accepteren is 'wie het eerst komt': twee lagen bescherming tegen dubbele orders.
  // 1. Binnen dit proces één accept tegelijk (wachtrij).
  // 2. Een claimbestand dat het besturingssysteem maar één keer laat aanmaken (ook bij meerdere processen).
  let queue = Promise.resolve();
  const exclusive = (task) => { const run = queue.then(task, task); queue = run.catch(() => {}); return run; };

  app.post('/admin/work/orders/:id/accept', teamOnly, async (req, res) => {
    const user = req.internalUser;
    const result = await exclusive(async () => {
      const quotes = await readQuotes();
      const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
      if (quote && quote.producer === user.username) return { state: 'ok', quote, again: true };
      if (!quote || !inProduction(quote) || phaseOf(quote) !== 'new') return { state: 'taken' };
      if (isProducer(user) && !offeredTo(user, quote, await readSettings())) return { state: 'taken' };
      const now = new Date().toISOString();
      const fee = producerFee(quote);
      const claim = await claimOrder(quote.id, { producer: user.username, at: now, fee }, { releasedAt: quote.producerReleasedAt || '' });
      if (!claim.ok) return { state: 'taken' };
      quote.producer = user.username;
      quote.producerAcceptedAt = now;
      quote.producerFee = fee;
      quote.status = 'print_queue';
      quote.updatedAt = now;
      await writeQuotes(quotes);
      return { state: 'ok', quote };
    });
    if (result.state !== 'ok') return res.redirect('/admin/work?taken=1');
    if (isProducer(user) && !result.again) notifyProducerAccepted(user.username, result.quote).catch((error) => console.warn('[producent-mail] acceptmail niet verstuurd:', error.message));
    return res.redirect(`/admin/work/orders/${encodeURIComponent(req.params.id)}?accepted=1`);
  });

  app.post('/admin/work/orders/:id/status', teamOnly, async (req, res) => {
    const user = req.internalUser;
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (!quote || !isMine(user, quote) || phaseOf(quote) === 'new') return notFound(req, res);
    const next = String(req.body?.status || '');
    const allowed = { making: 'ready_to_ship', ship: 'shipped' }[phaseOf(quote)];
    if (next !== allowed) return res.redirect(`/admin/work/orders/${encodeURIComponent(quote.id)}`);
    if (next === 'shipped' && waitsForLabel(quote)) return res.redirect(`/admin/work/orders/${encodeURIComponent(quote.id)}`);
    const now = new Date().toISOString();
    // Orders in hetzelfde pakket (één label) gaan samen op Verzonden.
    const together = next === 'shipped' && quote.myParcelShipmentId
      ? quotes.filter((item) => item.id === quote.id || (item.myParcelShipmentId === quote.myParcelShipmentId && !item.archivedAt && item.status === 'ready_to_ship' && isMine(user, item)))
      : [quote];
    together.forEach((item) => {
      item.status = next;
      item.updatedAt = now;
      if (next === 'ready_to_ship') item.readyAt = now;
      if (next === 'shipped') {
        item.shippedAt = now;
        fillTrackingFromMyParcel(item);
        // Vergoeding vastzetten: dit bedrag komt in de uitbetaling.
        if (item.producer && !item.producerFee?.total) item.producerFee = producerFee(item);
      }
    });
    await writeQuotes(quotes);
    if (next === 'shipped') together.filter((item) => item.email).forEach((item) => sendCustomerMail(item, 'Je print is verzonden', 'Je pakket is verzonden. De track & trace staat in je klantportaal.', 'Bekijk verzending').catch((error) => console.warn('Verzendmail niet verstuurd:', error.message)));
    return res.redirect(`/admin/work?moved=${encodeURIComponent(quote.id)}#q-${encodeURIComponent(quote.id)}`);
  });

  app.post('/admin/work/orders/:id/message', teamOnly, async (req, res) => {
    const user = req.internalUser;
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (!quote || !isMine(user, quote) || phaseOf(quote) === 'new') return notFound(req, res);
    const text = String(req.body?.text || '').replace(/[<>]/g, '').trim().slice(0, 2000);
    if (!text) return res.redirect(`/admin/work/orders/${encodeURIComponent(quote.id)}#gesprek`);
    const reason = isProducer(user) ? blockedReason(text, user.company ? user : { company: await companyOf(user) }) : '';
    if (reason) {
      const context = await adminContext(user, { quotes });
      return res.status(422).send(orderPage({ quote, context, user, draft: text, flash: `Niet verstuurd: je bericht bevat ${reason}. Dat mag niet in contact met de klant. Pas het aan en probeer opnieuw.` }));
    }
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    quote.messages.push({ from: 'pr3nt', text, createdAt: new Date().toISOString(), producer: user.username });
    quote.updatedAt = new Date().toISOString();
    await writeQuotes(quotes);
    return res.redirect(`/admin/work/orders/${encodeURIComponent(quote.id)}?sent=1#gesprek`);
  });

  app.get('/admin/filament', staffOnly, async (req, res) => {
    const context = await adminContext(req.internalUser);
    res.send(filamentPage({ context, user: req.internalUser, saved: req.query.saved === '1' }));
  });

  app.get(['/admin/work/options', '/admin/users'], admin, async (req, res) => {
    const context = await adminContext(req.internalUser);
    res.send(settingsPage({ context, user: req.internalUser, saved: req.query.saved === '1' }));
  });

  app.get('/admin/work/stats', admin, async (req, res) => {
    const context = await adminContext(req.internalUser);
    res.send(statsPage({ context, user: req.internalUser }));
  });
}

