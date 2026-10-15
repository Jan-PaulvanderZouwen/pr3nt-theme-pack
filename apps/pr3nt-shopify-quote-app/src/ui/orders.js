// Afgeleide orderinformatie voor het beheer: labels, groepen, wie is aan zet en wat er wacht.
import { readQuotes } from '../admin.js';
import { readSettings, estimatedPrintHours } from '../myparcel.js';
import { readFilament, stockRows } from '../filament.js';
import { money, quoteSubtotalExVat } from '../vat.js';
import { nowWallClock, wallClock } from './adminshell.js';

export const steps = [
  ['received', 'Nieuw'],
  ['creating_quote', 'Offerte in maak'],
  ['quote_sent', 'Offerte verstuurd'],
  ['accepted', 'Akkoord'],
  ['paid', 'Betaald'],
  ['print_queue', 'Printen'],
  ['ready_to_ship', 'Klaar voor verzending'],
  ['shipped', 'Verzonden'],
  ['delivered', 'Geleverd'],
];

export function stepIndex(status) {
  const index = steps.findIndex(([value]) => value === status);
  return index < 0 ? 0 : index;
}

export function isWaiting(quote) {
  return quote.manualStatus === 'waiting_customer';
}

export function isPaid(quote) {
  return Boolean(quote.paidAt) || stepIndex(quote.status) >= stepIndex('paid');
}

export function isAccepted(quote) {
  return Boolean(quote.acceptedAt || quote.customerAcceptedAt) || stepIndex(quote.status) >= stepIndex('accepted');
}

export function isRush(quote) {
  return String(quote.rush || '').toLowerCase().startsWith('j');
}

export function statusText(quote) {
  if (quote.archivedAt) return 'Gearchiveerd';
  if (isWaiting(quote)) return 'Wacht op klant';
  if (quote.status === 'paid') return quote.scheduledStartAt ? 'Ingepland' : 'Betaald, inplannen';
  if (isAccepted(quote) && !isPaid(quote)) return 'Wacht op betaling';
  return steps[stepIndex(quote.status)][1];
}

// Kleur van het statuslabel: oranje = jij bent aan zet, blauw = de klant, groen = loopt.
export function statusTone(quote) {
  if (isWaiting(quote)) return 'act';
  const status = quote.status || 'received';
  if (['received', 'creating_quote', 'ready_to_ship'].includes(status)) return 'wait';
  if (status === 'paid' && !quote.scheduledStartAt) return 'wait';
  if (['quote_sent', 'accepted'].includes(status)) return 'act';
  if (['paid', 'print_queue'].includes(status)) return 'ok';
  return '';
}

export function statusPill(quote) {
  return `<span class="pill ${statusTone(quote)}">${statusText(quote)}</span>`;
}

// Tabbladen op de orderpagina.
export const groups = [
  ['actief', 'Actief'],
  ['nieuw', 'Nieuw'],
  ['offerte', 'Offerte'],
  ['maak', 'In de maak'],
  ['verzenden', 'Verzenden'],
  ['afgerond', 'Afgerond'],
];

export function groupsOf(quote) {
  const status = quote.status || 'received';
  const list = [];
  if (!['shipped', 'delivered'].includes(status)) list.push('actief');
  if (['received', 'creating_quote'].includes(status) || (status === 'quote_sent' && quoteSubtotalExVat(quote) <= 0)) list.push('nieuw');
  else if (['quote_sent', 'accepted'].includes(status)) list.push('offerte');
  if (['paid', 'print_queue'].includes(status)) list.push('maak');
  if (status === 'ready_to_ship') list.push('verzenden');
  if (['shipped', 'delivered'].includes(status)) list.push('afgerond');
  if (waitsForReply(quote)) list.push('berichten');
  return list;
}

const systemPattern = /betaallink|mollie|myparcel|verzendlabel|offerte is verstuurd|wacht op klantreactie|gearchiveerd|status bijgewerkt/i;

export function isSystemMessage(message = {}) {
  return message.from !== 'klant' && systemPattern.test(String(message.text || ''));
}

export function conversation(quote) {
  return (Array.isArray(quote.messages) ? quote.messages : []).filter((message) => message && message.text);
}

// Laatste echte bericht is van de klant: die wacht op antwoord.
export function waitsForReply(quote) {
  const messages = conversation(quote).filter((message) => !isSystemMessage(message));
  const last = messages[messages.length - 1];
  if (!last || last.from !== 'klant') return false;
  if (!['shipped', 'delivered'].includes(quote.status)) return true;
  return Date.now() - new Date(last.createdAt || 0).getTime() < 1000 * 60 * 60 * 24 * 7;
}

export function lastActivity(quote) {
  const times = [quote.createdAt, quote.updatedAt, ...conversation(quote).map((message) => message.createdAt)].map((value) => new Date(value || 0).getTime()).filter(Boolean);
  return times.length ? new Date(Math.max(...times)).toISOString() : '';
}

export function needsQuote(quote) {
  return ['received', 'creating_quote'].includes(quote.status || 'received') || (quote.status === 'quote_sent' && quoteSubtotalExVat(quote) <= 0);
}

export function needsPlanning(quote) {
  return quote.status === 'paid' && !quote.scheduledStartAt;
}

export function productionOrders(quotes) {
  return quotes.filter((quote) => !quote.archivedAt && ['paid', 'print_queue', 'ready_to_ship'].includes(quote.status));
}

export function printHours(quote) {
  return money(quote.estimatedPrintHours || estimatedPrintHours(quote));
}

export function printerOf(quote, settings) {
  return settings.printers.find((printer) => printer.id === quote.assignedPrinter || printer.name === quote.assignedPrinter) || null;
}

// Per printer: wat ligt er nu op, en wat komt hierna.
export function printerStates(quotes, settings) {
  const now = nowWallClock().stamp;
  const planned = productionOrders(quotes).filter((quote) => wallClock(quote.scheduledStartAt) && wallClock(quote.scheduledEndAt));
  return settings.printers.map((printer) => {
    const mine = planned.filter((quote) => (printerOf(quote, settings) || settings.printers[0])?.id === printer.id).sort((a, b) => String(a.scheduledStartAt).localeCompare(String(b.scheduledStartAt)));
    const job = mine.find((quote) => wallClock(quote.scheduledStartAt).stamp <= now && wallClock(quote.scheduledEndAt).stamp > now && quote.status !== 'ready_to_ship');
    const next = mine.find((quote) => wallClock(quote.scheduledStartAt).stamp > now);
    return { ...printer, job, next, jobs: mine };
  });
}

export function wallMs(stamp) {
  const clock = wallClock(stamp);
  return clock ? Date.UTC(clock.y, clock.m - 1, clock.d, clock.hh, clock.mm) : 0;
}

function stampOf(ms) {
  return new Date(ms).toISOString().slice(0, 16);
}

// Eerstvolgende vrije plek waar deze print helemaal in past: per printer het eerste gat dat lang genoeg is.
// Standaard vanaf het volgende hele uur, met fromNow vanaf nu (voor 'Nu starten').
export function nextFreeSlot(quotes, settings, hours = 1, { fromNow = false } = {}) {
  const now = wallMs(nowWallClock().stamp);
  const base = fromNow ? now : Math.ceil(now / 3600000) * 3600000;
  const need = Math.max(0.25, hours) * 3600000;
  const options = printerStates(quotes, settings).map((printer) => {
    const busy = printer.jobs.filter((quote) => quote.status !== 'ready_to_ship').map((quote) => [wallMs(quote.scheduledStartAt), wallMs(quote.scheduledEndAt)]).filter(([, end]) => end > base).sort((a, b) => a[0] - b[0]);
    let start = base;
    for (const [from, to] of busy) {
      if (from - start >= need) break;
      start = Math.max(start, to);
    }
    return { printer, ms: start, start: stampOf(start) };
  });
  options.sort((a, b) => a.ms - b.ms);
  const best = options[0] || { printer: settings.printers[0], ms: base, start: stampOf(base) };
  return { ...best, isNow: best.ms === now };
}

export const lowStockGrams = 300;

// Alles wat de zijbalk nodig heeft: tellers en printers.
export async function adminContext(user, preloaded = {}) {
  const [quotes, settings, filament] = await Promise.all([
    preloaded.quotes || readQuotes(),
    preloaded.settings || readSettings(),
    preloaded.filament || readFilament(),
  ]);
  const active = quotes.filter((quote) => !quote.archivedAt);
  const ordersWaiting = active.filter((quote) => needsQuote(quote) || waitsForReply(quote) || quote.status === 'ready_to_ship').length;
  const toPlan = active.filter(needsPlanning).length;
  const stock = stockRows(filament, quotes, settings, user || { role: 'admin' });
  const openRequests = filament.requests.filter((request) => request.status === 'aangevraagd' && (user?.role === 'admin' || request.worker === user?.username)).length;
  const low = stock.filter((row) => row.deliveredGrams > 0 && row.availableGrams < lowStockGrams).length;
  return {
    quotes,
    settings,
    filament,
    counts: { orders: ordersWaiting, work: toPlan, filament: user?.role === 'admin' ? openRequests || low : low },
    printers: printerStates(quotes, settings),
  };
}
