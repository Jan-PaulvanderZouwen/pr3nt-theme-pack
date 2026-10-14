// Beheer: inloggen, orderoverzicht, archief en orderdetail in de pr3nt-huisstijl.
// De opslaan-routes (POST) blijven in admin.js, mollie.js, statusmails.js en myparcel.js; deze module toont alleen.
import { e, logo, renderDocument, assetVersion } from './ui/layout.js';
import {
  staffOnly, adminOnly, renderAdmin, pageHead, notice, emptyState, dot, euro, ago, greeting, displayName, initials, plural, clockText, timeOnly, swatch, hoursText,
} from './ui/adminshell.js';
import {
  steps, stepIndex, statusPill, statusText, groups, groupsOf, isRush, isPaid, isAccepted, isWaiting, isSystemMessage, conversation, waitsForReply, lastActivity,
  needsQuote, needsPlanning, adminContext, printHours, printerOf, statusTone,
} from './ui/orders.js';
import {
  readQuotes, writeQuotes, ensurePortalToken, applyAutomaticStatus, portalUrl, archiveRetentionDays, archiveDeleteDate,
} from './admin.js';
import { authenticateUser, setInternalSession, sessionUser, isAdmin, isWorker, canCreateShipment } from './myparcel.js';
import { updateMissingProductionPrices } from './productionpricing.js';
import { carriers, carrierOf, carrierName, trackingUrl } from './carriers.js';
import { shippingOf } from './shippingcontext.js';
import { quoteLines, quoteSubtotalExVat, quoteVatAmount, quoteTotalInclVat, vatRatePercent, money, fmt } from './vat.js';
import { viewerScript, quoteFiles, fileName, fileExt } from './portalview.js';

// ---------- Inloggen ----------

const loginTips = [
  'Tip: druk op / in het orderoverzicht om meteen te zoeken.',
  'Tip: Ctrl + S slaat een order op, waar je ook staat.',
  'Tip: vul een track & trace in en de klant krijgt vanzelf een mail.',
  'Tip: de eerstvolgende vrije printer staat al klaar bij inplannen.',
];

function safeNext(value = '', user = null) {
  const next = String(value || '');
  if (!next.startsWith('/admin') || next.startsWith('//') || next.startsWith('/admin/login')) return '';
  if (!isAdmin(user) && !/^\/admin\/(work|filament)/.test(next)) return '';
  return next;
}

function homeFor(user) {
  return isAdmin(user) ? '/admin' : '/admin/work';
}

function loginPage({ error = '', next = '', username = '' } = {}) {
  const tip = loginTips[Math.floor(Date.now() / 3600000) % loginTips.length];
  const stack = Array.from({ length: 7 }, (_, index) => `<span style="--i:${index}"></span>`).join('');
  const body = `<div class="login"><section class="login-art" aria-hidden="true">${logo()}<div class="login-print"><div class="login-stack">${stack}</div><div class="login-head"><i></i></div><div class="login-bed"></div></div><p class="login-quote">Elke print begint met één laag.</p></section><section class="login-form"><div class="login-card"><div class="login-mobile-logo">${logo()}</div><span class="label">Werkplaats en beheer</span><h1>Welkom terug</h1><p class="muted">Log in om orders, productie en planning te openen.</p>${error ? `<div class="callout warn" role="alert">${e(error)}</div>` : ''}<form class="form" method="post" action="/admin/login"><input type="hidden" name="next" value="${e(next)}"><label class="field"><span>Gebruikersnaam</span><input name="username" autocomplete="username" value="${e(username)}" required ${username ? '' : 'autofocus'}></label><label class="field"><span>Wachtwoord</span><input name="password" type="password" autocomplete="current-password" required ${username ? 'autofocus' : ''}></label><button class="btn btn-dark btn-block" type="submit">Inloggen</button></form><p class="muted small">${e(tip)}</p></div></section></div>`;
  return renderDocument({ title: 'Inloggen', bodyClass: 'is-login', body, scripts: `<script src="/assets/portal.js?v=${assetVersion}" defer></script>` });
}

// ---------- Orderoverzicht ----------

function firstName(quote) {
  return String(quote.name || '').trim().split(/\s+/)[0] || 'de klant';
}

function sortOrders(list) {
  const weight = (quote) => (isRush(quote) && !['shipped', 'delivered'].includes(quote.status) ? 0 : 2) + (statusTone(quote) === 'wait' || waitsForReply(quote) ? 0 : 1);
  return [...list].sort((a, b) => weight(a) - weight(b) || lastActivity(b).localeCompare(lastActivity(a)));
}

function orderRow(quote, tab) {
  const total = quoteTotalInclVat(quote);
  const groupList = groupsOf(quote);
  const search = [quote.name, quote.email, quote.id, quote.material, quote.color, quote.phone].filter(Boolean).join(' ').toLowerCase();
  const reply = waitsForReply(quote) ? '<span class="msg-flag">Nieuw bericht</span>' : '';
  const rush = isRush(quote) && !['shipped', 'delivered'].includes(quote.status) ? '<em class="tag-rush">Spoed</em>' : '';
  return `<a class="order-row${rush ? ' is-rush' : ''}" href="/admin/quotes/${encodeURIComponent(quote.id)}" data-groups="${groupList.join(' ')}" data-search="${e(search)}"${groupList.includes(tab) ? '' : ' hidden'}><span class="order-who"><span class="avatar sm" aria-hidden="true">${e(initials(quote.name))}</span><span><strong>${e(quote.name || 'Onbekend')}</strong><small class="mono">${e(quote.id)}</small></span></span><span class="order-what">${dot(quote.color)}<span>${e([quote.material, quote.color].filter(Boolean).join(' · ') || 'Print')}</span>${rush}</span><span class="order-status">${statusPill(quote)}${reply}</span><span class="order-amount num">${total > 0 ? euro(total) : '<span class="muted">Nog geen prijs</span>'}</span><span class="order-when">${e(ago(lastActivity(quote)))}</span><span class="order-go" aria-hidden="true">→</span></a>`;
}

function todoCards(active) {
  const fresh = active.filter(needsQuote);
  const replies = active.filter(waitsForReply);
  const plan = active.filter(needsPlanning);
  const ship = active.filter((quote) => quote.status === 'ready_to_ship');
  const oldest = fresh.map((quote) => quote.createdAt).filter(Boolean).sort()[0];
  const names = (list) => list.slice(0, 2).map(firstName).join(' en ') + (list.length > 2 ? ` en ${list.length - 2} meer` : '');
  const cards = [
    { tab: 'nieuw', tone: 'orange', count: fresh.length, title: fresh.length === 1 ? 'Offerte maken' : 'Offertes maken', hint: oldest ? `Oudste: ${ago(oldest)}` : 'Alles is beantwoord' },
    { tab: 'berichten', tone: 'blue', count: replies.length, title: replies.length === 1 ? 'Klant wacht op antwoord' : 'Klanten wachten op antwoord', hint: replies.length ? names(replies) : 'Geen open vragen' },
    { href: '/admin/work', tone: 'green', count: plan.length, title: 'Inplannen', hint: plan.length ? 'Nog niet op een printer' : 'Alles staat ingepland' },
    { tab: 'verzenden', tone: 'ink', count: ship.length, title: ship.length === 1 ? 'Pakket versturen' : 'Pakketten versturen', hint: ship.length ? `${ship.filter((quote) => quote.myParcelLabelUrl).length} van ${ship.length} met label` : 'Niks klaar om te versturen' },
  ];
  return `<section class="todo" aria-label="Wacht op jou">${cards.map((card, index) => {
    const href = card.href || `/admin?tab=${card.tab}`;
    return `<a class="todo-card tone-${card.tone}${card.count ? '' : ' is-done'}" href="${href}"${card.tab ? ` data-tab-link="${card.tab}"` : ''} style="--i:${index}"><span class="todo-count num" data-count-int="${card.count}">${card.count || '✓'}</span><span class="todo-text"><strong>${e(card.title)}</strong><small>${e(card.hint)}</small></span></a>`;
  }).join('')}</section>`;
}

function summaryLine(active) {
  const parts = [];
  const fresh = active.filter(needsQuote).length;
  const replies = active.filter(waitsForReply).length;
  const plan = active.filter(needsPlanning).length;
  const ship = active.filter((quote) => quote.status === 'ready_to_ship').length;
  if (fresh) parts.push(`${plural(fresh, 'offerte', 'offertes')} te maken`);
  if (replies) parts.push(`${replies === 1 ? '1 klant wacht' : `${replies} klanten wachten`} op antwoord`);
  if (plan) parts.push(`${plural(plan, 'order', 'orders')} in te plannen`);
  if (ship) parts.push(`${plural(ship, 'pakket', 'pakketten')} te versturen`);
  if (!parts.length) return 'Er wacht niks op je. De printers mogen het werk doen.';
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} en ${parts[parts.length - 1]}` : parts[0];
  return `Op je lijstje: ${list}.`;
}

function monthLine(quotes) {
  const month = new Date().toISOString().slice(0, 7);
  const paid = quotes.filter((quote) => String(quote.paidAt || '').slice(0, 7) === month);
  if (!paid.length) return '';
  const total = paid.reduce((sum, quote) => sum + quoteTotalInclVat(quote), 0);
  return ` Deze maand ${euro(total)} binnen uit ${plural(paid.length, 'betaalde order', 'betaalde orders')}.`;
}

function ordersPage({ quotes, user, context, tab, flash }) {
  const active = quotes.filter((quote) => !quote.archivedAt);
  const archived = quotes.length - active.length;
  const tabs = [...groups];
  const replies = active.filter(waitsForReply).length;
  if (replies) tabs.splice(1, 0, ['berichten', 'Berichten']);
  const current = tabs.some(([key]) => key === tab) ? tab : 'actief';
  const count = (key) => active.filter((quote) => groupsOf(quote).includes(key)).length;
  const tabBar = `<div class="tabs" role="tablist" aria-label="Filter orders">${tabs.map(([key, label]) => `<a role="tab" href="/admin?tab=${key}" data-tab="${key}" aria-selected="${key === current}">${label}<span class="num">${count(key)}</span></a>`).join('')}</div>`;
  const rows = sortOrders(active).map((quote) => orderRow(quote, current)).join('');
  const name = displayName(user);
  const head = pageHead({
    eyebrow: new Date().toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', weekday: 'long', day: 'numeric', month: 'long' }),
    title: `${greeting()}${name ? `, ${e(name)}` : ''}`,
    text: e(summaryLine(active) + monthLine(quotes)),
    actions: `<label class="search"><span class="sr-only">Zoeken</span><input type="search" placeholder="Zoek op naam, mail of ordernummer" data-search-input autocomplete="off"><kbd class="kbd-hint">/</kbd></label>`,
  });
  const list = active.length
    ? `<section class="panel orders" aria-label="Orders">${tabBar}<div class="order-list" data-order-list><div class="order-row order-head" aria-hidden="true"><span>Klant</span><span>Print</span><span>Status</span><span>Bedrag</span><span>Laatste actie</span><span></span></div>${rows}<p class="empty order-empty" data-order-empty hidden>Niks gevonden. Probeer een andere naam of een ordernummer.</p></div></section>`
    : `<section class="panel">${emptyState('Nog geen aanvragen', 'Zodra er een aanvraag via pr3nt.nl binnenkomt, staat hij hier.')}</section>`;
  const footer = `<p class="muted small page-foot"><a href="/admin/archive">Archief</a>${archived ? ` · ${plural(archived, 'aanvraag', 'aanvragen')}, ${archiveRetentionDays} dagen bewaard` : ''}</p>`;
  return renderAdmin({ title: 'Orders', user, active: 'orders', context, body: `${notice(flash)}${head}${todoCards(active)}${list}${footer}` });
}

function archivePage({ quotes, user, context }) {
  const archived = quotes.filter((quote) => quote.archivedAt).sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
  const rows = archived.map((quote) => {
    const until = new Date(quote.deleteAfter || archiveDeleteDate(quote.archivedAt));
    const days = Math.max(0, Math.ceil((until.getTime() - Date.now()) / 86400000));
    return `<li class="archive-row"><span class="avatar sm" aria-hidden="true">${e(initials(quote.name))}</span><span><strong>${e(quote.name || 'Gearchiveerde aanvraag')}</strong><small class="mono">${e(quote.id)}</small></span><span class="muted small">Gearchiveerd ${e(ago(quote.archivedAt))}</span><span class="pill ${days < 7 ? 'wait' : ''}">Nog ${plural(days, 'dag', 'dagen')}</span></li>`;
  }).join('');
  const head = pageHead({ eyebrow: '<a class="back" href="/admin">← Orders</a>', title: 'Archief', text: `Gearchiveerde aanvragen verdwijnen na ${archiveRetentionDays} dagen vanzelf, inclusief bestanden.` });
  const body = archived.length ? `<section class="panel"><ul class="archive-list">${rows}</ul></section>` : `<section class="panel">${emptyState('Het archief is leeg', 'Niks weggegooid. Netjes.')}</section>`;
  return renderAdmin({ title: 'Archief', user, active: 'orders', context, body: head + body });
}

// ---------- Orderdetail ----------

const quoteTemplate = [
  ['Filament', '€ 0,12 per gram', '', '0,12'],
  ['Print-uren', '€ 0,35 per uur', '', '0,35'],
  ['Verwerkingskosten', '', '1', '7,50'],
  ['Verzendkosten', 'incl. track & trace', '1', '7,95'],
  ['Verpakkingskosten', '', '1', '3,50'],
];

function lineRow(line = {}) {
  const total = money(line.qty || (line.unit ? 1 : 0)) * money(line.unit || 0);
  return `<div class="qline" data-line><div class="qline-desc"><input name="lineLabel" form="quote-form" value="${e(line.label || '')}" placeholder="Omschrijving" aria-label="Omschrijving"><input name="lineDescription" form="quote-form" class="qline-sub" value="${e(line.description || '')}" placeholder="Toelichting (optioneel)" aria-label="Toelichting"></div><input name="lineQty" form="quote-form" inputmode="decimal" value="${e(line.qty || '')}" placeholder="1" aria-label="Aantal"><input name="lineUnit" form="quote-form" inputmode="decimal" value="${e(line.unit || '')}" placeholder="0,00" aria-label="Prijs excl. btw"><output class="qline-total num" data-line-total>${total ? euro(total) : ''}</output><button class="btn btn-quiet qline-remove" type="button" data-remove-line aria-label="Regel verwijderen">×</button></div>`;
}

function quoteEditor(quote) {
  const lines = quoteLines(quote);
  const rows = (lines.length ? lines : [{}]).map(lineRow).join('');
  const sent = quote.quoteSentAt ? `<span class="pill act">Gemaild ${e(ago(quote.quoteSentAt))}</span>` : lines.length ? '<span class="pill">Nog niet gemaild</span>' : '';
  const locked = isPaid(quote) ? '<p class="callout">Deze order is betaald. Pas de regels alleen aan als je dat ook met de klant hebt afgesproken.</p>' : '';
  return `<section class="panel" id="offerte" aria-labelledby="quote-title"><div class="panel-head"><h2 id="quote-title">Offerte</h2>${sent}</div><div class="panel-body">${locked}<div class="qlines" data-lines><div class="qline qline-head" aria-hidden="true"><span>Omschrijving</span><span>Aantal</span><span>Prijs excl.</span><span class="r">Totaal</span><span></span></div>${rows}</div><template id="qline-template">${lineRow({})}</template><div class="qline-tools"><div class="btn-row"><button class="btn" type="button" data-add-line>+ Regel</button><button class="btn btn-quiet" type="button" data-template-lines data-template='${e(JSON.stringify(quoteTemplate))}'>Standaardofferte laden</button></div><dl class="totals" data-vat="${vatRatePercent()}"><dt>Subtotaal excl. btw</dt><dd class="num" data-sum="sub">${euro(quoteSubtotalExVat(quote))}</dd><dt>Btw ${vatRatePercent().toLocaleString('nl-NL', { maximumFractionDigits: 2 })}%</dt><dd class="num" data-sum="vat">${euro(quoteVatAmount(quote))}</dd><dt class="grand">Klant betaalt</dt><dd class="num grand" data-sum="total">${euro(quoteTotalInclVat(quote))}</dd></dl></div></div></section>`;
}

function messageList(quote) {
  const messages = conversation(quote);
  if (!messages.length) return `<p class="empty">Nog geen berichten. Stuur ${e(firstName(quote))} gerust een berichtje.</p>`;
  return messages.map((message) => {
    if (isSystemMessage(message)) return `<div class="msg-sys"><span>${e(message.text)}</span><small>${e(clockOrDate(message.createdAt))}</small></div>`;
    const mine = message.from !== 'klant';
    return `<div class="msg${mine ? ' me' : ''}">${e(message.text)}<small>${mine ? 'pr3nt' : e(firstName(quote))} · ${e(clockOrDate(message.createdAt))}</small></div>`;
  }).join('');
}

function clockOrDate(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime()) || !date.getTime()) return '';
  return date.toLocaleString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function messagesPanel(quote) {
  const waiting = waitsForReply(quote) ? '<span class="pill wait">Wacht op antwoord</span>' : '';
  return `<section class="panel" id="gesprek" aria-labelledby="msg-title"><div class="panel-head"><h2 id="msg-title">Gesprek met ${e(firstName(quote))}</h2>${waiting}</div><div class="panel-body"><div class="thread" data-thread>${messageList(quote)}</div><label class="field"><span>Bericht aan ${e(firstName(quote))} <small>(verschijnt in het klantportaal)</small></span><textarea name="newMessage" form="quote-form" placeholder="Typ je bericht" data-autosize></textarea></label><div class="btn-row"><button class="btn btn-dark" type="submit" form="quote-form">Versturen</button><span class="muted small kbd-hint">of Ctrl + Enter</span></div></div></section>`;
}

function filesPanel(quote) {
  const files = quoteFiles(quote);
  if (!files.length) {
    const noModel = quote.requestType === 'no_model';
    return `<section class="panel" aria-labelledby="files-title"><div class="panel-head"><h2 id="files-title">Bestanden</h2></div><div class="panel-body"><p class="empty">${noModel ? 'Deze klant heeft nog geen 3D-bestand. Beoordeel eerst of tekenen of aanpassen nodig is.' : 'Er zit geen bestand bij deze aanvraag.'}</p></div></section>`;
  }
  const list = `<ul class="files">${files.map((file, index) => `<li class="file${index === 0 ? ' is-active' : ''}" data-file="${index}"><span class="file-ext">${e(fileExt(file))}</span><div class="file-main"><strong title="${e(fileName(file))}">${e(fileName(file))}</strong><small>${file.createdAt ? e(ago(file.createdAt)) : 'Bij aanvraag'}${file.uploadedBy === 'pr3nt' ? ' · van pr3nt' : ''}</small></div><div class="file-actions">${/\.(stl|obj)$/i.test(fileName(file)) ? `<button class="btn btn-quiet" type="button" data-preview="${index}">Bekijken</button>` : ''}<a class="btn btn-quiet" href="${e(file.url)}" download>Download</a></div></li>`).join('')}</ul>`;
  const viewer = '<div class="viewer-wrap"><div class="viewer" id="viewer"><div class="viewer-msg">3D-voorbeeld wordt geladen</div></div><div class="viewer-tools" hidden><button class="btn btn-quiet" type="button" data-viewer="spin" aria-pressed="true">Draaien</button><button class="btn btn-quiet" type="button" data-viewer="reset">Beginpositie</button><button class="btn btn-quiet" type="button" data-viewer="full">Volledig scherm</button></div></div>';
  return `<section class="panel" aria-labelledby="files-title"><div class="panel-head"><h2 id="files-title">Bestanden</h2><span class="muted small">${plural(files.length, 'bestand', 'bestanden')}</span></div><div class="panel-body">${viewer}${list}</div></section>`;
}

function customerPanel(quote, allQuotes) {
  const email = String(quote.email || '').toLowerCase();
  const history = email ? allQuotes.filter((item) => String(item.email || '').toLowerCase() === email) : [quote];
  const position = [...history].sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt))).findIndex((item) => item.id === quote.id) + 1;
  const loyalty = history.length > 1 ? `<span class="pill ok">Vaste klant · ${position}e bestelling</span>` : '<span class="pill">Eerste bestelling</span>';
  const others = history.filter((item) => item.id !== quote.id && !item.archivedAt).slice(0, 4).map((item) => `<li><a href="/admin/quotes/${encodeURIComponent(item.id)}"><span class="mono">${e(item.id)}</span><span class="muted small">${e(statusText(item))}</span></a></li>`).join('');
  return `<section class="panel" aria-labelledby="customer-title"><div class="panel-head"><h2 id="customer-title">Klant</h2>${loyalty}</div><div class="panel-body"><div class="person"><span class="avatar" aria-hidden="true">${e(initials(quote.name))}</span><div><strong>${e(quote.name || 'Onbekend')}</strong>${quote.email ? `<a href="mailto:${e(quote.email)}">${e(quote.email)}</a>` : ''}${quote.phone ? `<a href="tel:${e(String(quote.phone).replace(/\s+/g, ''))}">${e(quote.phone)}</a>` : ''}</div></div>${others ? `<ul class="mini-list">${others}</ul>` : ''}<details class="reveal"><summary class="btn btn-quiet">Gegevens wijzigen</summary><div class="form-grid"><label class="field span-2"><span>Naam</span><input name="name" form="quote-form" value="${e(quote.name || '')}"></label><label class="field span-2"><span>E-mail</span><input name="email" type="email" form="quote-form" value="${e(quote.email || '')}"></label><label class="field"><span>Telefoon</span><input name="phone" type="tel" form="quote-form" value="${e(quote.phone || '')}"></label><label class="field"><span>Shopify klant-ID</span><input name="customerId" form="quote-form" value="${e(quote.customerId || '')}"></label></div></details></div></section>`;
}

function requestPanel(quote) {
  const noModel = quote.requestType === 'no_model';
  const rush = isRush(quote);
  return `<section class="panel" aria-labelledby="request-title"><div class="panel-head"><h2 id="request-title">Aanvraag</h2>${rush ? '<em class="tag-rush">Spoed</em>' : ''}</div><div class="panel-body"><dl class="spec"><dt>Type</dt><dd>${noModel ? 'Nog geen 3D-bestand' : '3D-bestand aanwezig'}</dd><dt>Materiaal</dt><dd>${e(quote.material || '-')}</dd><dt>Kleur</dt><dd>${dot(quote.color)} ${e(quote.color || '-')}</dd>${quote.description ? `<dt>Omschrijving</dt><dd class="text">${e(quote.description)}</dd>` : ''}${quote.note ? `<dt>Opmerking</dt><dd class="text">${e(quote.note)}</dd>` : ''}</dl>${noModel ? '<p class="callout warn"><strong>Geen 3D-bestand</strong>Beoordeel eerst of tekenen of aanpassen nodig is voordat je de printprijs bepaalt.</p>' : ''}<details class="reveal"><summary class="btn btn-quiet">Aanvraag wijzigen</summary><div class="form-grid"><label class="field"><span>Materiaal</span><input name="material" form="quote-form" value="${e(quote.material || '')}" list="materials"></label><label class="field"><span>Kleur</span><input name="color" form="quote-form" value="${e(quote.color || '')}"></label><div class="field span-2"><span>Spoed</span><div class="choice"><label><input type="radio" name="rush" value="Nee" form="quote-form" ${rush ? '' : 'checked'}><span>Nee</span></label><label><input type="radio" name="rush" value="Ja" form="quote-form" ${rush ? 'checked' : ''}><span>Ja, spoed</span></label></div></div><label class="field span-2"><span>Opmerking klant</span><textarea name="note" form="quote-form" data-autosize>${e(quote.note || '')}</textarea></label></div><datalist id="materials"><option value="PLA"><option value="PETG"><option value="ABS"><option value="ASA"><option value="TPU"></datalist></details></div></section>`;
}

function paymentPanel(quote) {
  const url = quote.paymentUrl || quote.molliePaymentUrl || '';
  const total = quoteTotalInclVat(quote);
  const token = encodeURIComponent(quote.portalToken || quote.id);
  let state;
  if (isPaid(quote)) state = `<p class="pay-state ok"><strong>Betaald</strong>${quote.paidAt ? ` op ${e(new Date(quote.paidAt).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'long' }))}` : ''}</p><a class="btn" href="/portal/${token}/invoice" target="_blank" rel="noopener">Factuur bekijken</a>`;
  else if (url) state = `<p class="pay-state act"><strong>Betaallink klaar</strong>${isAccepted(quote) ? ' · klant heeft akkoord gegeven' : ' · wacht op akkoord'}</p><div class="code"><span>${e(url.replace(/^https?:\/\//, '').slice(0, 42))}${url.length > 50 ? '…' : ''}</span><button class="btn btn-quiet" type="button" data-copy="${e(url)}">Kopiëren</button></div>`;
  else state = `<p class="pay-state"><strong>${total > 0 ? 'Betaallink volgt' : 'Nog geen offerte'}</strong> · Mollie maakt de link vanzelf bij opslaan</p>`;
  return `<section class="panel" aria-labelledby="pay-title"><div class="panel-head"><h2 id="pay-title">Betaling</h2><span class="amount-sm num">${total > 0 ? euro(total) : ''}</span></div><div class="panel-body">${state}<details class="reveal"><summary class="btn btn-quiet">Eigen betaallink gebruiken</summary><label class="field"><span>Betaallink <small>(gaat voor op de Mollie-link)</small></span><input name="paymentUrl" form="quote-form" value="${e(quote.paymentUrl || '')}" placeholder="https://" autocomplete="off"></label></details></div></section>`;
}

function shippingPanel(quote) {
  const shipping = shippingOf(quote);
  const complete = shipping.name && shipping.address && shipping.postalCode && shipping.city;
  const address = complete ? `<div class="address"><strong>${e(shipping.name)}</strong>${shipping.company ? `<span>${e(shipping.company)}</span>` : ''}<span>${e(shipping.address)}</span><span>${e(shipping.postalCode)} ${e(shipping.city)}</span><span>${e(shipping.country || 'Nederland')}</span></div>` : '<p class="empty">De klant heeft nog geen verzendadres ingevuld.</p>';
  let label = '';
  if (quote.myParcelLabelUrl) label = `<a class="btn" href="${e(quote.myParcelLabelUrl)}" target="_blank" rel="noopener">Verzendlabel openen</a>`;
  else if (quote.myParcelShipmentId) label = `<p class="muted small">MyParcel-zending ${e(quote.myParcelShipmentId)} staat klaar.</p>`;
  else if (isPaid(quote)) {
    const check = canCreateShipment(quote);
    const problem = quote.myParcelStatus === 'error' ? `<p class="callout warn"><strong>MyParcel gaf een fout</strong>${e(String(quote.myParcelError || '').slice(0, 220))}</p>` : '';
    label = check.ok
      ? `${problem}<form method="post" action="/admin/quotes/${encodeURIComponent(quote.id)}/myparcel"><button class="btn" type="submit">Verzendlabel maken</button></form>`
      : `${problem}<p class="muted small">Label lukt nog niet: ${e(check.reason)}</p>`;
  }
  const code = String(quote.trackingCode || '').trim();
  const link = code ? trackingUrl(quote, shipping) : '';
  return `<section class="panel" id="verzending" aria-labelledby="ship-title"><div class="panel-head"><h2 id="ship-title">Verzending</h2>${link ? `<a class="btn btn-quiet" href="${e(link)}" target="_blank" rel="noopener">Volg pakket ↗</a>` : ''}</div><div class="panel-body">${address}${label}<div class="form-grid"><label class="field"><span>Track & trace</span><input name="trackingCode" form="quote-form" value="${e(code)}" placeholder="Bijv. 3SABCD1234567" data-tracking autocomplete="off"></label><label class="field"><span>Vervoerder</span><select name="trackingCarrier" form="quote-form">${carriers.map((carrier) => `<option value="${carrier.id}" ${carrierOf(quote).id === carrier.id ? 'selected' : ''}>${e(carrier.name)}</option>`).join('')}</select></label></div><p class="muted small" data-tracking-hint hidden>Bij opslaan gaat de status naar Verzonden en krijgt ${e(firstName(quote))} een mail met de track & trace.</p></div></section>`;
}

function productionPanel(quote, settings) {
  const printer = printerOf(quote, settings);
  const planned = quote.scheduledStartAt
    ? `<p class="plan-line">${dot(quote.color)}<span><strong>${e(printer?.name || 'Printer')}</strong> · ${e(clockText(quote.scheduledStartAt))} tot ${e(timeOnly(quote.scheduledEndAt))}<small>${e(hoursText(printHours(quote)))} printen</small></span></p>`
    : `<p class="muted small">${isPaid(quote) ? 'Nog niet ingepland.' : 'Inplannen kan zodra er betaald is.'}</p>`;
  const value = quote.productionAmount || quote.productionOfferAmount || quote.productionPrice || '';
  const auto = quote.productionAmountSource === 'auto';
  return `<section class="panel" aria-labelledby="prod-title"><div class="panel-head"><h2 id="prod-title">Productie</h2>${isPaid(quote) ? `<a class="btn btn-quiet" href="/admin/work#q-${encodeURIComponent(quote.id)}">${quote.scheduledStartAt ? 'Naar productie' : 'Inplannen'} →</a>` : ''}</div><div class="panel-body">${planned}<label class="field"><span>Productievergoeding <small>${auto ? '(automatisch berekend)' : '(excl. btw)'}</small></span><input name="productionAmount" form="quote-form" value="${e(value)}" inputmode="decimal" placeholder="Bijv. 12,50"></label></div></section>`;
}

function morePanel(quote) {
  const current = isWaiting(quote) ? 'waiting_customer' : quote.status || 'received';
  const options = [...steps.slice(0, 3), ['waiting_customer', 'Wacht op klantreactie'], ...steps.slice(3)].map(([value, label]) => `<option value="${value}" ${value === current ? 'selected' : ''}>${value === 'accepted' ? 'Akkoord, wacht op betaling' : label}</option>`).join('');
  return `<section class="panel" aria-labelledby="more-title"><div class="panel-head"><h2 id="more-title">Intern</h2></div><div class="panel-body"><label class="field"><span>Notitie voor jezelf <small>(klant ziet dit niet)</small></span><textarea name="internalNote" form="quote-form" data-autosize placeholder="Bijv. eerst testprint op 0,16 mm">${e(quote.internalNote || '')}</textarea></label><details class="reveal"><summary class="btn btn-quiet">Status handmatig wijzigen</summary><label class="field"><span>Status <small>(gaat normaal vanzelf, klant krijgt een mail bij wijziging)</small></span><select name="status" form="quote-form" data-status-select>${options}</select></label></details><form method="post" action="/admin/quotes/${encodeURIComponent(quote.id)}/delete" data-confirm="Deze aanvraag naar het archief verplaatsen? Na ${archiveRetentionDays} dagen worden de gegevens en bestanden definitief verwijderd."><button class="btn btn-quiet danger-link" type="submit">Naar archief</button></form></div></section>`;
}

function nextStep(quote, settings) {
  const name = firstName(quote);
  const lines = quoteLines(quote).length;
  const shipping = shippingOf(quote);
  const link = String(quote.trackingCode || '').trim() ? trackingUrl(quote, shipping) : '';
  const step = (title, text, actions = '') => `<section class="next" aria-label="Volgende stap"><span class="label">Volgende stap</span><div class="next-main"><div><h2>${title}</h2><p>${text}</p></div>${actions ? `<div class="btn-row">${actions}</div>` : ''}</div></section>`;
  if (isWaiting(quote)) return step('Wacht op reactie van de klant', `Je hebt ${e(name)} iets gevraagd. Zodra er antwoord is, zie je het in het gesprek.`, '<a class="btn" href="#gesprek">Naar gesprek</a>');
  if (needsQuote(quote)) return step(lines ? 'Offerte afmaken en versturen' : 'Maak de offerte', `Vul de regels in of laad de standaardofferte. Bij opslaan krijgt ${e(name)} automatisch een mail met de prijs en een betaallink.`, '<a class="btn btn-dark" href="#offerte">Naar offerte</a>');
  if (quote.status === 'quote_sent' && !isAccepted(quote)) return step(`Wacht op akkoord van ${e(name)}`, quote.quoteSentAt ? `De offerte is ${e(ago(quote.quoteSentAt))} gemaild. Je hoeft nu niks te doen.` : 'De offerte staat in het portaal, maar is nog niet gemaild. Sla op om hem te versturen.');
  if (isAccepted(quote) && !isPaid(quote)) return step('Wacht op betaling', `${e(name)} heeft akkoord gegeven. Zodra Mollie de betaling meldt, gaat de order vanzelf naar Betaald.`);
  if (quote.status === 'paid' && !quote.scheduledStartAt) return step('Plan de print in', 'Betaald en klaar voor de printer. Bij inplannen staat de eerstvolgende vrije plek al klaar.', `<a class="btn btn-dark" href="/admin/work#q-${encodeURIComponent(quote.id)}">Inplannen</a>`);
  if (['paid', 'print_queue'].includes(quote.status)) {
    const printer = printerOf(quote, settings);
    return step(quote.status === 'print_queue' ? 'Ligt op de printer' : 'Ingepland', `${e(printer?.name || 'Printer')}, ${e(clockText(quote.scheduledStartAt))} tot ${e(timeOnly(quote.scheduledEndAt))}. ${e(name)} ziet in het portaal wanneer het klaar is.`, '<a class="btn" href="/admin/work/agenda">Naar planning</a>');
  }
  if (quote.status === 'ready_to_ship') return step('Klaar om te versturen', `Vul de track & trace in en sla op. ${e(name)} krijgt dan vanzelf een mail.`, `${quote.myParcelLabelUrl ? `<a class="btn" href="${e(quote.myParcelLabelUrl)}" target="_blank" rel="noopener">Label openen</a>` : ''}<a class="btn btn-dark" href="#verzending">Naar verzending</a>`);
  if (quote.status === 'shipped') return step(`Onderweg met ${e(carrierName(quote))}`, link ? 'Het pakket is verstuurd. Je kunt het zelf ook volgen.' : 'Het pakket is verstuurd.', link ? `<a class="btn" href="${e(link)}" target="_blank" rel="noopener">Volg pakket ↗</a>` : '');
  if (quote.status === 'delivered') {
    const review = quote.review ? ` ${e(name)} gaf een ${e(quote.review.rating)}/5${quote.review.review ? `: “${e(String(quote.review.review).slice(0, 140))}”` : '.'}` : '';
    return step('Geleverd', `Klaar, mooi werk.${review}`);
  }
  return '';
}

function statusBar(quote) {
  const index = stepIndex(quote.status);
  const activeNow = quote.status !== 'delivered';
  const layers = steps.map(([, label], i) => `<span class="${i < index ? 'done' : i === index ? `now${activeNow ? ' active' : ''}` : ''}" style="--i:${i}" data-label="${i + 1}. ${e(label)}"></span>`).join('');
  return `<div class="layers" role="img" aria-label="Stap ${index + 1} van ${steps.length}: ${e(statusText(quote))}">${layers}</div>`;
}

function savedNotice(quote, saved) {
  if (!saved) return '';
  const recent = (value) => value && Date.now() - new Date(value).getTime() < 90 * 1000;
  if (recent(quote.myParcelCreatedAt)) return notice('Verzendlabel aangemaakt bij MyParcel.');
  if (quote.myParcelStatus === 'error' && recent(quote.myParcelTriedAt)) return notice('MyParcel kon geen label maken. De foutmelding staat bij Verzending.', 'warn');
  if (recent(quote.quoteSentAt)) return notice(`Opgeslagen. De offerte is gemaild naar ${quote.email}.`);
  if (quote.status === 'shipped' && recent(quote.updatedAt)) return notice(`Verzonden! ${firstName(quote)} krijgt een mail met de track & trace.`, 'party');
  return notice('Opgeslagen.');
}

function detailPage({ quote, quotes, settings, user, context, saved }) {
  const portal = portalUrl(quote);
  const created = quote.createdAt ? `aangevraagd ${ago(quote.createdAt)}` : '';
  const head = pageHead({
    eyebrow: '<a class="back" href="/admin">← Orders</a>',
    title: e(quote.name || 'Order'),
    text: `<span class="mono">${e(quote.id)}</span>${created ? ` · ${e(created)}` : ''}`,
    actions: `${statusPill(quote)}<a class="btn" href="${e(portal)}" target="_blank" rel="noopener">Klantportaal ↗</a><button class="btn btn-quiet" type="button" data-copy="${e(portal)}">Link kopiëren</button>`,
  });
  const paid = isPaid(quote) ? '1' : '0';
  const sent = quote.quoteSentAt ? '1' : '0';
  const savebar = `<div class="savebar" data-savebar><span class="savebar-text" data-save-text>Alles is opgeslagen</span><span class="muted small kbd-hint">Ctrl + S</span><form id="quote-form" method="post" action="/admin/quotes/${encodeURIComponent(quote.id)}" data-dirty-form data-paid="${paid}" data-sent="${sent}"><button class="btn btn-primary" type="submit" data-save-label>Opslaan</button></form></div>`;
  const main = `<div class="stack">${quoteEditor(quote)}${messagesPanel(quote)}${filesPanel(quote)}</div>`;
  const side = `<div class="stack">${customerPanel(quote, quotes)}${requestPanel(quote)}${paymentPanel(quote)}${shippingPanel(quote)}${productionPanel(quote, settings)}${morePanel(quote)}</div>`;
  const body = `${savedNotice(quote, saved)}${head}<div class="detail-status">${statusBar(quote)}${nextStep(quote, settings)}</div><div class="detail-layout">${main}${side}</div>${savebar}`;
  return renderAdmin({ title: quote.name || quote.id, user, active: 'orders', context, body, scripts: viewerScript(quote) });
}

function notFoundPage(user, context) {
  return renderAdmin({ title: 'Niet gevonden', user, active: 'orders', context, body: `${pageHead({ eyebrow: '<a class="back" href="/admin">← Orders</a>', title: 'Deze order bestaat niet (meer)', text: 'Misschien is hij gearchiveerd of verwijderd.' })}<div><a class="btn btn-dark" href="/admin">Naar orders</a></div>` });
}

// ---------- Routes ----------

export function registerAdminViewRoutes(app) {
  app.get('/admin/login', (req, res) => {
    const user = sessionUser(req);
    if (isWorker(user)) return res.redirect(safeNext(req.query.next, user) || homeFor(user));
    res.send(loginPage({ next: String(req.query.next || '').slice(0, 300) }));
  });

  app.post('/admin/login', async (req, res) => {
    const username = String(req.body?.username || '').slice(0, 80);
    const user = await authenticateUser(username, req.body?.password || '');
    if (!user) return res.status(401).send(loginPage({ error: 'Die combinatie kennen we niet. Check je gebruikersnaam en wachtwoord.', next: String(req.body?.next || '').slice(0, 300), username }));
    setInternalSession(res, user);
    res.clearCookie?.('pr3nt_worker_key');
    return res.redirect(safeNext(req.body?.next, user) || homeFor(user));
  });

  const admin = adminOnly({ allowOpen: true });

  app.get('/admin', (req, res, next) => {
    const user = sessionUser(req);
    if (isWorker(user) && !isAdmin(user)) return res.redirect('/admin/work');
    return next();
  }, admin, async (req, res) => {
    await updateMissingProductionPrices().catch(() => {});
    const context = await adminContext(req.internalUser);
    const flash = req.query.deleted === '1' ? 'Aanvraag naar het archief verplaatst.' : '';
    res.send(ordersPage({ quotes: context.quotes, user: req.internalUser, context, tab: String(req.query.tab || 'actief'), flash }));
  });

  app.get('/admin/archive', admin, async (req, res) => {
    const context = await adminContext(req.internalUser);
    res.send(archivePage({ quotes: context.quotes, user: req.internalUser, context }));
  });

  app.get('/admin/quotes/:id', admin, async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    const context = await adminContext(req.internalUser, { quotes });
    if (!quote) return res.status(404).send(notFoundPage(req.internalUser, context));
    ensurePortalToken(quote);
    applyAutomaticStatus(quote);
    await writeQuotes(quotes);
    res.send(detailPage({ quote, quotes, settings: context.settings, user: req.internalUser, context, saved: req.query.saved === '1' }));
  });
}

