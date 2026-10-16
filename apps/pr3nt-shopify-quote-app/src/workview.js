// Werkplaats: productiebord, planning, filament, instellingen en cijfers in de pr3nt-huisstijl. De website beheer je in src/cms/.
// Opslaan gaat via de bestaande POST-routes in myparcel.js, filament.js en sitecontent.js.
import { randomUUID } from 'node:crypto';
import { e } from './ui/layout.js';
import {
  staffOnly, adminOnly, renderAdmin, pageHead, notice, emptyState, dot, swatch, euro, ago, plural, clockText, timeOnly, hoursText, initials, displayName,
  nowWallClock, wallClock, dayLabel, shortDay, addDays, dateFromKey,
} from './ui/adminshell.js';
import {
  adminContext, productionOrders, printHours, printerOf, nextFreeSlot, needsPlanning, isRush, lowStockGrams, statusText, wallMs,
} from './ui/orders.js';
import { isAdmin } from './myparcel.js';
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

// ---------- Productiebord ----------

const columns = [
  ['plan', 'Inplannen', 'Betaald, nog geen printer'],
  ['planned', 'Ingepland', 'Staat klaar voor de printer'],
  ['printing', 'Printen', 'Ligt op de printer'],
  ['ship', 'Klaar voor verzending', 'Inpakken en versturen'],
];

function columnOf(quote) {
  if (quote.status === 'ready_to_ship') return 'ship';
  if (quote.status === 'print_queue') return 'printing';
  return quote.scheduledStartAt ? 'planned' : 'plan';
}

function printerSelect(settings, selected = '') {
  return `<select name="assignedPrinter">${settings.printers.map((printer) => `<option value="${e(printer.id)}" ${selected === printer.id || selected === printer.name ? 'selected' : ''}>${e(printer.name)}</option>`).join('')}</select>`;
}

function planFields(quote, settings, { start = '', printer = '' } = {}) {
  const hours = printHours(quote);
  return `<div class="plan-grid"><label class="field"><span>Printer</span>${printerSelect(settings, printer || quote.assignedPrinter || '')}</label><label class="field"><span>Start</span><input type="datetime-local" name="scheduledStartAt" value="${e(String(start || quote.scheduledStartAt || '').slice(0, 16))}"></label><label class="field"><span>Printuren</span><input name="estimatedPrintHours" inputmode="decimal" value="${e(String(quote.estimatedPrintHours || hours).replace('.', ','))}"></label></div>`;
}

function keepFields(quote) {
  return `<input type="hidden" name="assignedPrinter" value="${e(quote.assignedPrinter || '')}"><input type="hidden" name="scheduledStartAt" value="${e(String(quote.scheduledStartAt || '').slice(0, 16))}"><input type="hidden" name="estimatedPrintHours" value="${e(String(quote.estimatedPrintHours || printHours(quote)))}">`;
}

function progressOf(quote) {
  const start = wallMs(quote.scheduledStartAt);
  const end = wallMs(quote.scheduledEndAt);
  const now = wallMs(nowWallClock().stamp);
  if (!start || !end || end <= start || now < start) return null;
  const pct = Math.min(100, Math.round(((now - start) / (end - start)) * 100));
  return { pct, left: Math.max(0, (end - now) / 60000) };
}

// Wat een kaart nodig heeft om naar een andere kolom gesleept te worden (zie public/admin.js).
// Zonder planning: 'Ingepland' pakt de eerste vrije plek, 'Printen' start nu op de printer die het eerst vrij is.
function dragData(quote, quotes, settings, column) {
  const hours = printHours(quote);
  const planned = String(quote.scheduledStartAt || '').slice(0, 16);
  const slot = planned ? null : nextFreeSlot(quotes, settings, hours);
  const free = planned ? null : nextFreeSlot(quotes, settings, hours, { fromNow: true });
  const attrs = {
    'data-drag': quote.id,
    'data-action': `/admin/work/quotes/${encodeURIComponent(quote.id)}`,
    'data-lane': column,
    'data-printer': quote.assignedPrinter || '',
    'data-start': planned,
    'data-hours': String(quote.estimatedPrintHours || hours),
    'data-slot-printer': slot?.printer?.id || '',
    'data-slot-start': slot?.start || '',
    'data-now-printer': free?.printer?.id || '',
    'data-now-start': free ? nowWallClock().stamp.slice(0, 16) : '',
  };
  return Object.entries(attrs).map(([key, value]) => `${key}="${e(value)}"`).join(' ');
}

function boardCard(quote, quotes, settings, user, moved) {
  const column = columnOf(quote);
  const id = encodeURIComponent(quote.id);
  const action = `/admin/work/quotes/${id}`;
  const printer = printerOf(quote, settings);
  const amount = quote.productionAmount || quote.productionOfferAmount || quote.productionPrice || '';
  const files = (Array.isArray(quote.files) ? quote.files : []).filter((file) => file?.url);
  const fileLinks = files.slice(0, 2).map((file) => `<a href="${e(file.url)}" download title="${e(file.originalName || 'Bestand')}">${e(file.originalName || 'Bestand')}</a>`).join('') + (files.length > 2 ? `<span class="muted">+${files.length - 2}</span>` : '');
  const name = isAdmin(user) ? `<a href="/admin/quotes/${id}">${e(quote.name || 'Order')}</a>` : e(quote.name || 'Order');
  const when = quote.scheduledStartAt ? `<p class="card-plan">${e(printer?.name || 'Printer')} · ${e(clockText(quote.scheduledStartAt))}–${e(timeOnly(quote.scheduledEndAt))}</p>` : '';
  const progress = column === 'printing' ? progressOf(quote) : null;
  const bar = progress ? `<div class="card-progress" style="--p:${progress.pct}%"><i></i><span>${progress.pct >= 100 ? 'Zou klaar moeten zijn' : `Nog ${durationText(progress.left)}`}</span></div>` : '';
  let actions = '';
  if (column === 'plan') {
    const slot = nextFreeSlot(quotes, settings, printHours(quote));
    const free = nextFreeSlot(quotes, settings, printHours(quote), { fromNow: true });
    const freeNow = free.isNow ? free : null;
    const startNow = freeNow ? `<form method="post" action="${action}"><input type="hidden" name="status" value="print_queue"><input type="hidden" name="assignedPrinter" value="${e(freeNow.printer.id)}"><input type="hidden" name="scheduledStartAt" value="${e(freeNow.start)}"><input type="hidden" name="estimatedPrintHours" value="${e(String(quote.estimatedPrintHours || printHours(quote)))}"><button class="btn" type="submit">Nu starten op ${e(freeNow.printer.name)}</button></form>` : '';
    actions = `<details class="card-more"><summary class="btn btn-dark">Inplannen</summary><form class="form" method="post" action="${action}"><input type="hidden" name="status" value="paid">${planFields(quote, settings, { start: slot.start, printer: slot.printer?.id })}<p class="muted small">Voorgesteld: eerste plek waar deze ${e(hoursText(printHours(quote)))} in past, op ${e(slot.printer?.name || 'printer')} ${e(clockText(slot.start))}.</p><button class="btn btn-primary" type="submit">Inplannen</button></form></details>${startNow}`;
  } else {
    const next = { planned: ['print_queue', 'Start printen'], printing: ['ready_to_ship', 'Klaar ✓'], ship: ['shipped', 'Verzonden'] }[column];
    const label = column === 'ship' && quote.myParcelLabelUrl ? `<a class="btn" href="${e(quote.myParcelLabelUrl)}" target="_blank" rel="noopener">Label</a>` : '';
    actions = `<form method="post" action="${action}">${keepFields(quote)}<button class="btn ${column === 'ship' ? 'btn-dark' : 'btn-primary'}" type="submit" name="status" value="${next[0]}">${next[1]}</button></form>${label}${column !== 'ship' ? `<details class="card-more"><summary class="btn btn-quiet">Planning</summary><form class="form" method="post" action="${action}"><input type="hidden" name="status" value="${e(quote.status)}">${planFields(quote, settings)}<button class="btn" type="submit">Opslaan</button></form></details>` : ''}`;
  }
  return `<article class="job${isRush(quote) ? ' is-rush' : ''}${moved ? ' is-moved' : ''}" id="q-${e(quote.id)}" style="--c:${swatch(quote.color)}" ${dragData(quote, quotes, settings, column)}><div class="job-head"><strong>${name}</strong>${isRush(quote) ? '<em class="tag-rush">Spoed</em>' : ''}</div><p class="job-meta">${dot(quote.color)}<span>${e([quote.material, quote.color].filter(Boolean).join(' · ') || 'Print')}</span></p><p class="job-facts"><span>${e(hoursText(printHours(quote)))}</span>${amount ? `<span>${e(euro(amount))}</span>` : ''}<span class="mono">${e(quote.id)}</span></p>${when}${bar}${fileLinks ? `<div class="job-files">${fileLinks}</div>` : ''}<div class="job-actions">${actions}</div></article>`;
}

// Lijstweergave: dezelfde orders per fase onder elkaar, met één knop voor de volgende stap.
function listAction(quote, quotes, settings, column) {
  const action = `/admin/work/quotes/${encodeURIComponent(quote.id)}`;
  const hours = String(quote.estimatedPrintHours || printHours(quote));
  if (column === 'plan') {
    const slot = nextFreeSlot(quotes, settings, printHours(quote));
    return `<form method="post" action="${action}"><input type="hidden" name="status" value="paid"><input type="hidden" name="assignedPrinter" value="${e(slot.printer?.id || '')}"><input type="hidden" name="scheduledStartAt" value="${e(slot.start)}"><input type="hidden" name="estimatedPrintHours" value="${e(hours)}"><button class="btn btn-dark" type="submit" title="Eerste vrije plek waar deze print in past">Inplannen ${e(clockText(slot.start))}</button></form>`;
  }
  const next = { planned: ['print_queue', 'Start printen', 'btn-primary'], printing: ['ready_to_ship', 'Klaar ✓', 'btn-primary'], ship: ['shipped', 'Verzonden', 'btn-dark'] }[column];
  return `<form method="post" action="${action}">${keepFields(quote)}<button class="btn ${next[2]}" type="submit" name="status" value="${next[0]}">${next[1]}</button></form>`;
}

function listRow(quote, quotes, settings, user, moved) {
  const column = columnOf(quote);
  const id = encodeURIComponent(quote.id);
  const printer = printerOf(quote, settings);
  const name = isAdmin(user) ? `<a href="/admin/quotes/${id}">${e(quote.name || 'Order')}</a>` : e(quote.name || 'Order');
  const progress = column === 'printing' ? progressOf(quote) : null;
  const when = quote.scheduledStartAt
    ? `<strong>${e(printer?.name || 'Printer')}</strong><small>${e(clockText(quote.scheduledStartAt))}–${e(timeOnly(quote.scheduledEndAt))}</small>`
    : '<strong class="muted">Nog geen plek</strong><small>Betaald</small>';
  const bar = progress ? `<span class="row-progress" style="--p:${progress.pct}%" title="${progress.pct}%"><i></i></span>` : '';
  return `<article class="job-row${isRush(quote) ? ' is-rush' : ''}${moved ? ' is-moved' : ''}" id="q-${e(quote.id)}" style="--c:${swatch(quote.color)}"><div class="row-main"><strong>${name}${isRush(quote) ? ' <em class="tag-rush">Spoed</em>' : ''}</strong><small>${dot(quote.color)}${e([quote.material, quote.color].filter(Boolean).join(' · ') || 'Print')} · <span class="mono">${e(quote.id)}</span></small></div><div class="row-when">${when}${bar}</div><div class="row-hours num">${e(hoursText(printHours(quote)))}</div><div class="row-action">${listAction(quote, quotes, settings, column)}</div></article>`;
}

function workList(orders, quotes, settings, user, moved) {
  return `<div class="work-list">${columns.map(([key, label, hint]) => {
    const rows = orders.filter((quote) => columnOf(quote) === key);
    if (!rows.length) return '';
    return `<section class="work-group group-${key}"><header><h2>${label}</h2><span class="lane-count num">${rows.length}</span><small>${hint}</small></header>${rows.map((quote) => listRow(quote, quotes, settings, user, quote.id === moved)).join('')}</section>`;
  }).join('')}</div>`;
}

function viewToggle(view) {
  const item = (key, label, icon) => `<a href="/admin/work?view=${key}" ${view === key ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
  const boardIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2" width="3.5" height="12" rx="1"/><rect x="6.25" y="2" width="3.5" height="8" rx="1"/><rect x="11" y="2" width="3.5" height="10" rx="1"/></svg>';
  const listIcon = '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="2.5" width="13" height="2.5" rx="1"/><rect x="1.5" y="6.75" width="13" height="2.5" rx="1"/><rect x="1.5" y="11" width="13" height="2.5" rx="1"/></svg>';
  return `<nav class="view-toggle" aria-label="Weergave">${item('bord', 'Bord', boardIcon)}${item('lijst', 'Lijst', listIcon)}</nav>`;
}

function workPage({ context, user, moved, view = 'bord' }) {
  const { quotes, settings } = context;
  const orders = productionOrders(quotes).sort((a, b) => (isRush(b) - isRush(a)) || String(a.scheduledStartAt || 'z').localeCompare(String(b.scheduledStartAt || 'z')) || String(a.paidAt || a.createdAt).localeCompare(String(b.paidAt || b.createdAt)));
  const slot = nextFreeSlot(quotes, settings, 1);
  const plannedHours = orders.filter((quote) => quote.scheduledStartAt && quote.status !== 'ready_to_ship').reduce((sum, quote) => sum + printHours(quote), 0);
  const cols = columns.map(([key, label, hint], index) => {
    const cards = orders.filter((quote) => columnOf(quote) === key);
    return `<section class="lane lane-${key}" style="--i:${index}" data-lane="${key}" aria-labelledby="lane-${key}"><header class="lane-head"><h2 id="lane-${key}">${label}</h2><span class="lane-count num">${cards.length}</span><small>${hint}</small></header><div class="lane-body">${cards.map((quote) => boardCard(quote, quotes, settings, user, quote.id === moved)).join('') || '<p class="lane-empty">Leeg</p>'}</div></section>`;
  }).join('');
  const text = orders.length
    ? `${plural(orders.length, 'order', 'orders')} in de werkplaats, ${hoursText(plannedHours)} ingepland. ${slot.isNow ? `${slot.printer?.name || 'Een printer'} is nu vrij.` : `Eerstvolgende vrije printer: ${slot.printer?.name || 'printer'}, ${clockText(slot.start)}.`}`
    : 'De werkplaats is leeg. Zodra er een order betaald is, verschijnt hij hier.';
  const movedQuote = moved ? quotes.find((quote) => quote.id === moved) : null;
  const flash = movedQuote ? (movedQuote.status === 'shipped' ? notice(`Verzonden! ${movedQuote.name || 'De klant'} krijgt een mail.`, 'party') : notice(`${movedQuote.name || 'Order'} staat nu bij ${statusText(movedQuote).toLowerCase()}.`)) : '';
  const head = pageHead({ eyebrow: 'Werkplaats', title: 'Productie', text: e(text), actions: `${orders.length ? viewToggle(view) : ''}<a class="btn" href="/admin/work/agenda">Planning bekijken</a>` });
  const content = view === 'lijst' ? workList(orders, quotes, settings, user, moved) : `<div class="board" data-board>${cols}</div>`;
  const body = orders.length ? content : `<section class="panel">${emptyState('Niks op de planning', 'Tijd om de printbedden schoon te maken.')}</section>`;
  return renderAdmin({ title: 'Productie', user, active: 'work', context, body: `<div data-work-live>${flash}${head}${body}</div>` });
}

// ---------- Planning ----------

const hourHeight = 36;

function weekStrip(selected, quotes, settings) {
  const date = dateFromKey(selected);
  const monday = addDays(selected, -((date.getUTCDay() + 6) % 7));
  const capacity = 24 * Math.max(1, settings.printers.length);
  const orders = productionOrders(quotes).filter((quote) => wallClock(quote.scheduledStartAt) && wallClock(quote.scheduledEndAt));
  const today = nowWallClock().date;
  return `<nav class="week" aria-label="Week">${Array.from({ length: 7 }, (_, index) => {
    const key = addDays(monday, index);
    const dayStart = wallMs(`${key}T00:00`);
    const dayEnd = dayStart + 86400000;
    const minutes = orders.reduce((sum, quote) => sum + Math.max(0, Math.min(dayEnd, wallMs(quote.scheduledEndAt)) - Math.max(dayStart, wallMs(quote.scheduledStartAt))) / 60000, 0);
    const pct = Math.min(100, Math.round((minutes / 60 / capacity) * 100));
    return `<a href="/admin/work/agenda?date=${key}"${key === selected ? ' aria-current="date"' : ''}${key === today ? ' class="is-today"' : ''}><span>${shortDay(key)}</span><strong class="num">${dateFromKey(key).getUTCDate()}</strong><i style="--h:${pct}%" title="${Math.round(minutes / 60)} printuur"></i></a>`;
  }).join('')}</nav>`;
}

function agendaPage({ context, user, selected }) {
  const { quotes, settings } = context;
  const dayStart = wallMs(`${selected}T00:00`);
  const dayEnd = dayStart + 86400000;
  const now = nowWallClock();
  const isToday = now.date === selected;
  const orders = productionOrders(quotes).filter((quote) => wallClock(quote.scheduledStartAt));
  const hours = Array.from({ length: 24 }, (_, hour) => `<span style="top:${hour * hourHeight}px">${String(hour).padStart(2, '0')}:00</span>`).join('');
  const lanes = settings.printers.map((printer, index) => {
    const blocks = orders.filter((quote) => (printerOf(quote, settings) || settings.printers[0])?.id === printer.id).map((quote) => {
      const start = wallMs(quote.scheduledStartAt);
      const end = wallMs(quote.scheduledEndAt) || start + printHours(quote) * 3600000;
      if (end <= dayStart || start >= dayEnd) return '';
      const from = Math.max(start, dayStart);
      const to = Math.min(end, dayEnd);
      const top = ((from - dayStart) / 3600000) * hourHeight;
      const height = Math.max(30, ((to - from) / 3600000) * hourHeight - 2);
      const live = isToday && wallMs(now.stamp) >= start && wallMs(now.stamp) < end && quote.status !== 'ready_to_ship';
      const href = isAdmin(user) ? `/admin/quotes/${encodeURIComponent(quote.id)}` : `/admin/work#q-${encodeURIComponent(quote.id)}`;
      const state = quote.status === 'ready_to_ship' ? ' is-done' : live ? ' is-live' : '';
      return `<a class="block${state}" href="${href}" style="top:${top}px;height:${height}px;--c:${swatch(quote.color)}"><strong>${e(quote.name || 'Order')}</strong><span>${e(timeOnly(quote.scheduledStartAt))}–${e(timeOnly(quote.scheduledEndAt))} · ${e(hoursText(printHours(quote)))}</span><span>${e([quote.material, quote.color].filter(Boolean).join(' · '))}</span></a>`;
    }).join('');
    return `<section class="day-lane" style="--i:${index}"><header>${e(printer.name)}</header><div class="day-track" style="height:${24 * hourHeight}px">${blocks}</div></section>`;
  }).join('');
  const nowLine = isToday ? `<div class="now-line" style="top:${(now.minutes / 60) * hourHeight}px" data-now-line><span>${String(now.hh).padStart(2, '0')}:${String(now.mm).padStart(2, '0')}</span></div>` : '';
  const firstBlock = orders.map((quote) => wallMs(quote.scheduledStartAt)).filter((ms) => ms >= dayStart && ms < dayEnd).sort()[0];
  const scrollTo = isToday ? Math.max(0, now.hh - 2) : firstBlock ? Math.max(0, Math.floor((firstBlock - dayStart) / 3600000) - 1) : 7;
  const toPlan = productionOrders(quotes).filter(needsPlanning);
  const pending = toPlan.length ? `<section class="panel"><div class="panel-head"><h2>Nog in te plannen</h2><a class="btn btn-quiet" href="/admin/work">Naar productie →</a></div><div class="panel-body chips">${toPlan.map((quote) => `<a class="chip" href="/admin/work#q-${encodeURIComponent(quote.id)}">${dot(quote.color)}${e(quote.name || quote.id)}<small>${e(hoursText(printHours(quote)))}</small></a>`).join('')}</div></section>` : '';
  const nav = `<a class="btn btn-quiet" href="/admin/work/agenda?date=${addDays(selected, -1)}" aria-label="Vorige dag">‹</a>${isToday ? '' : `<a class="btn" href="/admin/work/agenda">Vandaag</a>`}<a class="btn btn-quiet" href="/admin/work/agenda?date=${addDays(selected, 1)}" aria-label="Volgende dag">›</a><form method="get" action="/admin/work/agenda" class="date-pick"><input type="date" name="date" value="${e(selected)}" aria-label="Kies datum" data-autosubmit></form>`;
  const head = pageHead({ eyebrow: 'Planning', title: e(dayLabel(selected, { long: true })), text: isToday ? 'De groene lijn is nu. Klik op een blok om de order te openen.' : 'Klik op een blok om de order te openen.', actions: nav });
  const calendar = `<section class="panel day"><div class="day-scroll" data-scroll-hour="${scrollTo}" data-hour-height="${hourHeight}"><div class="day-grid" style="--lanes:${settings.printers.length}"><div class="day-hours" style="height:${24 * hourHeight}px">${hours}</div>${lanes}${nowLine}</div></div></section>`;
  const ics = isAdmin(user) ? '<p class="muted small page-foot">Planning in je eigen agenda? De koppeling staat bij <a href="/admin/work/options#agenda">Instellingen</a>.</p>' : '';
  return renderAdmin({ title: 'Planning', user, active: 'agenda', context, body: head + weekStrip(selected, quotes, settings) + calendar + pending + ics });
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
  const token = settings.calendarToken || randomUUID();
  const feed = `${baseUrl}/admin/work/calendar.ics?token=${encodeURIComponent(token)}`;
  const printers = Array.from({ length: settings.printerCount }, (_, index) => `<label class="field printer-name"><span>Printer ${index + 1}</span><input name="printerName" value="${e(settings.printers[index]?.name || `Printer ${index + 1}`)}"></label>`).join('');
  const userRow = (account, isNew = false) => {
    const username = String(account.username || '').toLowerCase();
    const name = account.name || username;
    return `<div class="member${isNew ? ' is-new' : ''}">${isNew ? '' : `<span class="avatar" aria-hidden="true">${e(initials(name))}</span>`}<label class="field"><span>Naam</span><input name="userDisplayName" value="${e(isNew ? '' : name)}" placeholder="Bijv. Sanne"></label><label class="field"><span>Gebruikersnaam</span><input name="userName" value="${e(username)}" autocomplete="off" ${isNew ? 'placeholder="sanne"' : ''}></label><label class="field"><span>Rol</span><select name="userRole"><option value="worker" ${account.role !== 'admin' ? 'selected' : ''}>Medewerker</option><option value="admin" ${account.role === 'admin' ? 'selected' : ''}>Admin</option></select></label><label class="field"><span>${isNew ? 'Wachtwoord' : 'Nieuw wachtwoord'}</span><input name="userPassword" type="password" autocomplete="new-password" placeholder="${isNew ? 'Verplicht' : 'Leeg laten = houden'}"><input type="hidden" name="userPasswordHash" value="${e(account.passwordHash || '')}"></label>${isNew ? '' : `<button class="btn btn-quiet danger-link" type="submit" name="deleteUser" value="${e(username)}" data-confirm-click="${e(name)} verwijderen? Die kan daarna niet meer inloggen.">Verwijderen</button>`}</div>`;
  };
  const team = settings.users.map((account) => userRow(account)).join('');
  const head = pageHead({ eyebrow: 'Beheer', title: 'Instellingen', text: 'Printers, je team en de agenda-koppeling. Alles op één plek, met één keer opslaan.' });
  const body = `<form method="post" action="/admin/work/options" class="settings" data-dirty-form id="settings-form"><section class="panel" id="printers"><div class="panel-head"><h2>Printers</h2><label class="count-field"><span class="muted small">Aantal</span><input type="number" name="printerCount" min="1" max="20" value="${e(settings.printerCount)}" data-printer-count></label></div><div class="panel-body"><p class="muted small">Namen zie je terug in de planning, de zijbalk en de agenda.</p><div class="printer-names" data-printer-names>${printers}</div></div></section><section class="panel" id="team"><div class="panel-head"><h2>Team</h2><span class="muted small">${plural(settings.users.length, 'account', 'accounts')} naast de hoofdbeheerder</span></div><div class="panel-body"><div class="team">${team || '<p class="empty">Nog geen extra accounts. Voeg hieronder een collega toe.</p>'}</div><details class="reveal"><summary class="btn">+ Teamlid toevoegen</summary>${userRow({ role: 'worker' }, true)}</details><p class="muted small">Medewerkers zien productie, planning en filament. Admins zien ook orders, cijfers en instellingen.</p></div></section><section class="panel" id="agenda"><div class="panel-head"><h2>Agenda-koppeling</h2></div><div class="panel-body"><p class="muted small">Zet deze link in Google Agenda, Outlook of Apple Agenda (abonneren via URL). Alle ingeplande prints verschijnen dan vanzelf in je eigen agenda.</p><div class="code"><span>${e(feed)}</span><button class="btn btn-quiet" type="button" data-copy="${e(feed)}">Kopiëren</button></div><details class="reveal"><summary class="btn btn-quiet">Link vervangen</summary><label class="field"><span>Agenda-sleutel <small>(wijzig dit als de link gedeeld is met iemand die hem niet mag hebben)</small></span><input name="calendarToken" value="${e(token)}"></label></details></div></section><div class="savebar" data-savebar><span class="savebar-text" data-save-text>Alles is opgeslagen</span><button class="btn btn-primary" type="submit">Opslaan</button></div></form>`;
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
  const payout = paidList.filter((quote) => String(quote.paidAt).slice(0, 7) === month).reduce((sum, quote) => sum + money(quote.productionAmount || 0), 0);
  const workshop = `<dl class="spec"><dt>In de werkplaats</dt><dd>${plural(production.length, 'order', 'orders')}</dd><dt>Ingeplande printuren</dt><dd>${e(hoursText(plannedHours))} over ${plural(settings.printers.length, 'printer', 'printers')}</dd><dt>Productievergoeding</dt><dd>${e(euro(payout))} deze maand</dd><dt>Verzendlabels klaar</dt><dd>${all.filter((quote) => quote.myParcelShipmentId).length}</dd><dt>Spoedorders actief</dt><dd>${all.filter((quote) => isRush(quote) && !['shipped', 'delivered'].includes(quote.status)).length}</dd></dl>`;
  const head = pageHead({ eyebrow: 'Beheer', title: 'Cijfers', text: thisMonth.length ? `Deze maand ${plural(thisMonth.length, 'betaalde order', 'betaalde orders')}. ${delta !== null && delta > 0 ? 'Het gaat de goede kant op.' : 'Elke order telt.'}` : 'Nog geen betaalde orders deze maand. Die eerste komt eraan.' });
  const body = `<section class="kpis">${kpis}</section><div class="grid-2"><section class="panel"><div class="panel-head"><h2>Per week</h2><span class="muted small">laatste 8 weken</span></div><div class="panel-body">${chart}</div></section><section class="panel"><div class="panel-head"><h2>Werkplaats</h2></div><div class="panel-body">${workshop}</div></section></div><div class="grid-2 even"><section class="panel"><div class="panel-head"><h2>Populairste kleuren</h2></div><div class="panel-body">${tallyList(tally('color'), true)}</div></section><section class="panel"><div class="panel-head"><h2>Materialen</h2></div><div class="panel-body">${tallyList(tally('material'), false)}</div></section></div>`;
  return renderAdmin({ title: 'Cijfers', user, active: 'stats', context, body: head + body });
}

// ---------- Routes ----------

export function registerWorkViewRoutes(app) {
  const admin = adminOnly();

  app.get('/admin/work', staffOnly, async (req, res) => {
    await updateMissingProductionPrices().catch(() => {});
    const context = await adminContext(req.internalUser);
    // Bord of lijst: een keuze via ?view= wordt onthouden in een cookie
    const asked = ['bord', 'lijst'].includes(req.query.view) ? req.query.view : '';
    if (asked) res.cookie('pr3nt_work_view', asked, { httpOnly: true, sameSite: 'lax', secure: req.secure, maxAge: 1000 * 60 * 60 * 24 * 365 });
    const view = asked || (req.cookies?.pr3nt_work_view === 'lijst' ? 'lijst' : 'bord');
    res.send(workPage({ context, user: req.internalUser, moved: String(req.query.moved || ''), view }));
  });

  app.get('/admin/work/agenda', staffOnly, async (req, res) => {
    const context = await adminContext(req.internalUser);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(String(req.query.date || '')) ? String(req.query.date) : nowWallClock().date;
    res.send(agendaPage({ context, user: req.internalUser, selected: date }));
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

