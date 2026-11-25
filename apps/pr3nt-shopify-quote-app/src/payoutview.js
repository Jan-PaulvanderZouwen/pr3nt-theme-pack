// Beheer: Verzenden (labels zelf en gebundeld maken) en Uitbetalen (producenten betalen).
import { e } from './ui/layout.js';
import { adminOnly, renderAdmin, pageHead, notice, emptyState, euro, ago, plural, dot, swatch } from './ui/adminshell.js';
import { adminContext } from './ui/orders.js';
import { readQuotes, writeQuotes } from './admin.js';
import { chargedShipping, isPickup, canCreateShipment, createMyParcelShipmentForQuote, applyShipmentResult, addressKey, shippingAddress } from './myparcel.js';
import { inProduction } from './producers.js';
import { readPayouts, balanceOf, createPayout, markPayoutPaid, cancelPayout, setChargeStatus, payoutsCsv, sepaXml, sepaSettings, validIban, formatIban } from './payouts.js';
import { notifyLabelsReady, notifyPayoutPaid } from './producermail.js';

const dateText = (value) => (value ? new Date(value).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short' }) : '');
const kpi = (label, value, hint = '', index = 0) => `<div class="kpi" style="--i:${index}"><span class="label">${e(label)}</span><strong class="num">${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div>`;
const nameOf = (username, settings) => (settings.users || []).find((user) => user.username === username)?.name || username || '';

// ---------- Verzenden ----------

// Orders die een label nodig hebben: betaald, klant betaalde verzending, nog geen zending en geen track & trace.
export function needsLabel(quote = {}) {
  return inProduction(quote) && chargedShipping(quote) && !isPickup(quote) && !quote.myParcelShipmentId && !String(quote.trackingCode || '').trim();
}

// Zelfde producent + zelfde adres = één pakket.
export function labelGroups(quotes = []) {
  const groups = new Map();
  quotes.filter(needsLabel).forEach((quote) => {
    const key = `${quote.producer || ''}#${addressKey(quote)}`;
    groups.set(key, [...(groups.get(key) || []), quote]);
  });
  return [...groups.values()].map((list) => ({ list, ready: list.filter((quote) => quote.status === 'ready_to_ship'), producer: list[0].producer || '' }))
    .sort((a, b) => (b.ready.length > 0) - (a.ready.length > 0) || String(a.list[0].readyAt || a.list[0].paidAt).localeCompare(String(b.list[0].readyAt || b.list[0].paidAt)));
}

function labelForm(ids, text, style = 'btn-dark') {
  return `<form method="post" action="/admin/verzenden/label">${ids.map((id) => `<input type="hidden" name="ids" value="${e(id)}">`).join('')}<button class="btn ${style}" type="submit">${text}</button></form>`;
}

function shipPage({ context, user, flash = '', warn = '' }) {
  const { quotes, settings } = context;
  const groups = labelGroups(quotes);
  const readyGroups = groups.filter((group) => group.ready.length && canCreateShipment(group.ready[0]).ok);
  const row = (group) => {
    const first = group.list[0];
    const address = shippingAddress(first);
    const check = canCreateShipment(first);
    const waiting = group.list.length - group.ready.length;
    const what = group.list.length > 1 ? `<em class="tag-shop">${group.list.length} orders, 1 pakket</em>` : '';
    const state = group.ready.length ? (waiting ? `${group.ready.length} klaar, ${waiting} nog in productie` : 'Klaar om te versturen') : 'Nog in productie';
    let action;
    if (!check.ok) action = `<a class="btn" href="/admin/quotes/${encodeURIComponent(first.id)}#verzending">Adres aanvullen</a>`;
    else if (group.ready.length) action = `${labelForm(group.ready.map((quote) => quote.id), group.ready.length > 1 ? `1 label voor ${group.ready.length}` : 'Label maken')}${waiting ? labelForm(group.list.map((quote) => quote.id), 'Wacht, alles samen', 'btn-quiet') : ''}`;
    else action = labelForm(group.list.map((quote) => quote.id), 'Nu al maken', 'btn-quiet');
    const ids = group.list.map((quote) => `<a class="mono" href="/admin/quotes/${encodeURIComponent(quote.id)}">${e(quote.id)}</a>`).join(', ');
    return `<article class="job-row${group.ready.length ? '' : ' is-waiting'}" style="--c:${swatch(first.color)}"><div class="row-main"><strong>${e(first.name || address.person || 'Klant')} ${what}</strong><small>${e([address.postalCode, address.city].filter(Boolean).join(' '))} · ${ids}</small>${check.ok ? '' : `<small class="warn-text">${e(check.reason)}</small>`}</div><div class="row-when"><strong>${e(state)}</strong><small>${e(group.producer ? nameOf(group.producer, settings) : 'Nog geen producent')}</small></div><div class="row-hours num">${group.list.length > 1 ? `${group.list.length}×` : ''}</div><div class="row-action">${action}</div></article>`;
  };
  const readyRows = groups.filter((group) => group.ready.length).map(row).join('');
  const later = groups.filter((group) => !group.ready.length);
  const made = quotes.filter((quote) => quote.myParcelShipmentId && !quote.archivedAt && ['paid', 'print_queue', 'ready_to_ship'].includes(quote.status));
  const shipments = new Map();
  made.forEach((quote) => shipments.set(quote.myParcelShipmentId, [...(shipments.get(quote.myParcelShipmentId) || []), quote]));
  const madeRows = [...shipments.values()].map((list) => `<li class="request">${dot(list[0].color)}<span><strong>${e(list[0].name || 'Klant')}${list.length > 1 ? ` · ${list.length} orders` : ''}</strong><small>${e(list.map((quote) => quote.id).join(', '))} · ${e(list[0].producer ? nameOf(list[0].producer, settings) : 'zelf')} · ${list[0].myParcelBarcode ? 'geprint' : 'nog niet geprint'} · ${e(ago(list[0].myParcelCreatedAt))}</small></span><a class="btn btn-quiet" href="/admin/quotes/${encodeURIComponent(list[0].id)}/label" target="_blank" rel="noopener">PDF</a></li>`).join('');
  const bulk = readyGroups.length > 1 ? `<form method="post" action="/admin/verzenden/alle"><button class="btn btn-dark" type="submit">${plural(readyGroups.length, 'label', 'labels')} maken voor alles wat klaar is</button></form>` : '';
  const text = readyRows
    ? `${plural(groups.filter((group) => group.ready.length).length, 'pakket wacht', 'pakketten wachten')} op een label. Orders naar hetzelfde adres gaan samen in één pakket, met één label.`
    : 'Nog niks klaar om te versturen. Zodra een producent een order klaar meldt, maak je hier het label.';
  const head = pageHead({ eyebrow: 'Werk', title: 'Verzenden', text: e(text), actions: bulk });
  const laterList = later.length ? `<details class="reveal"><summary class="btn btn-quiet">Nog in productie (${later.length})</summary><div class="work-group">${later.map(row).join('')}</div></details>` : '';
  const list = `${readyRows ? `<section class="work-group"><header><h2>Klaar, wacht op een label</h2><span class="lane-count num">${groups.filter((group) => group.ready.length).length}</span></header>${readyRows}</section>` : `<section class="panel">${emptyState('Geen labels te maken', 'Lekker bezig.')}</section>`}${laterList}`;
  const madePanel = madeRows ? `<section class="panel"><div class="panel-head"><h2>Label gemaakt, nog niet verzonden</h2><span class="muted small">${shipments.size}</span></div><div class="panel-body"><ul class="request-list">${madeRows}</ul><p class="muted small">De producent print het label zelf in zijn omgeving en zet de order daarna op Verzonden.</p></div></section>` : '';
  const body = `${warn ? notice(warn, 'warn') : flash ? notice(flash, 'party') : ''}${head}<div class="work-list">${list}${madePanel}</div>`;
  return renderAdmin({ title: 'Verzenden', user, active: 'ship', context, body });
}

// Eén zending voor een setje orders (zelfde producent en adres). Geeft { quotes, error } terug.
async function makeLabel(ids = []) {
  const quotes = await readQuotes();
  const bundle = ids.map((id) => quotes.find((quote) => quote.id === id && !quote.archivedAt)).filter(Boolean);
  if (!bundle.length) return { error: 'Order niet gevonden.' };
  if (bundle.some((quote) => quote.myParcelShipmentId)) return { error: 'Een van deze orders heeft al een label.' };
  if (new Set(bundle.map((quote) => quote.producer || '')).size > 1) return { error: 'Deze orders liggen bij verschillende producenten, dus ze kunnen niet in één pakket.' };
  let outcome;
  try { outcome = await createMyParcelShipmentForQuote(bundle[0], bundle); } catch (error) { outcome = { error: error.message }; }
  if (!outcome.shipmentId) return { error: outcome.error || outcome.reason || 'MyParcel maakte geen zending.' };
  // Opnieuw inlezen en alleen de MyParcel-velden zetten, zodat niks anders verloren gaat.
  const latest = await readQuotes();
  const updated = [];
  latest.forEach((quote) => {
    if (!ids.includes(quote.id)) return;
    applyShipmentResult(quote, outcome);
    if (bundle.length > 1) quote.myParcelBundle = bundle.map((item) => item.id); else delete quote.myParcelBundle;
    updated.push(quote);
  });
  await writeQuotes(latest);
  notifyLabelsReady(updated).catch((error) => console.warn('[producent-mail] labelmail niet verstuurd:', error.message));
  return { quotes: updated };
}

// ---------- Uitbetalen ----------

function payPage({ context, payouts, user, flash = '', warn = '' }) {
  const { quotes, settings } = context;
  const producers = new Map((settings.users || []).filter((account) => account.role === 'producer').map((account) => [account.username, account]));
  const balances = [...producers.values()].map((account) => ({ account, balance: balanceOf(account.username, quotes, payouts) }));
  const openTotal = balances.reduce((sum, item) => sum + Math.max(0, item.balance.total), 0);
  const coming = balances.reduce((sum, item) => sum + item.balance.coming, 0);
  const waiting = payouts.payouts.filter((payout) => payout.status === 'open');
  const waitingTotal = waiting.reduce((sum, payout) => sum + Number(payout.total || 0), 0);
  const year = new Date().toISOString().slice(0, 4);
  const paidYear = payouts.payouts.filter((payout) => payout.status === 'paid' && String(payout.paidAt).startsWith(year));
  const kpis = `<section class="kpis kpis-4">${[
    kpi('Open bij producenten', e(euro(openTotal)), 'verzonden, nog niet klaargezet', 0),
    kpi('Klaar om over te maken', e(euro(waitingTotal)), plural(waiting.length, 'uitbetaling', 'uitbetalingen'), 1),
    kpi('Nog in productie', e(euro(coming)), 'komt er nog bij', 2),
    kpi(`Uitbetaald in ${year}`, e(euro(paidYear.reduce((sum, payout) => sum + Number(payout.total || 0), 0))), plural(paidYear.length, 'uitbetaling', 'uitbetalingen'), 3),
  ].join('')}</section>`;

  const producerRows = balances.sort((a, b) => b.balance.total - a.balance.total).map(({ account, balance }) => {
    const iban = validIban(account.iban) ? `<small class="mono">${e(formatIban(account.iban))}</small>` : '<small class="warn-text">Nog geen IBAN</small>';
    const detail = balance.orders.length || balance.charges.length ? `<details class="reveal"><summary class="btn btn-quiet">${plural(balance.orders.length, 'order', 'orders')}${balance.charges.length ? ` + ${plural(balance.charges.length, 'filamentaanvraag', 'filamentaanvragen')}` : ''}</summary><ul class="request-list">${balance.orders.map((order) => `<li class="request"><span><strong>${e(order.label)} · ${e(euro(order.total))}</strong><small><a class="mono" href="/admin/quotes/${encodeURIComponent(order.id)}">${e(order.id)}</a> · verzonden ${e(dateText(order.shippedAt))}${order.ship ? ` · ${e(euro(order.print))} + ${e(euro(order.ship))}` : ''}</small></span></li>`).join('')}${balance.charges.map((charge) => `<li class="request"><span><strong>− ${e(euro(charge.amount))} · ${e(charge.label)}</strong></span></li>`).join('')}</ul></details>` : '';
    const action = balance.total > 0 ? `<form method="post" action="/admin/uitbetalen/klaarzetten"><input type="hidden" name="producer" value="${e(account.username)}"><button class="btn btn-dark" type="submit">Klaarzetten</button></form>` : '';
    return `<article class="job-row pay-row"><div class="row-main"><strong>${e(account.name || account.username)}${account.paused === 'on' ? ' <em class="tag-rush">pauze</em>' : ''}</strong>${iban}${detail}</div><div class="row-when"><strong>${e(euro(balance.total))}</strong><small>${balance.making.length ? `${e(euro(balance.coming))} nog in productie` : 'niks in productie'}</small></div><div class="row-hours num">${balance.orders.length || ''}</div><div class="row-action">${action}</div></article>`;
  }).join('');
  const producerList = producerRows || `<section class="panel">${emptyState('Nog geen producenten', 'Keur een aanmelding goed bij Website › Producenten.')}</section>`;

  const sepa = sepaSettings();
  const waitingRows = waiting.map((payout) => `<article class="job-row pay-row"><div class="row-main"><strong>${e(payout.name)} · ${e(payout.reference)}</strong><small>${validIban(payout.iban) ? `<span class="mono">${e(formatIban(payout.iban))}</span>${payout.accountName ? ` t.n.v. ${e(payout.accountName)}` : ''}` : '<span class="warn-text">Geen IBAN</span>'} · ${plural(payout.orders.length, 'order', 'orders')}${payout.chargesTotal ? ` · − ${e(euro(payout.chargesTotal))} filament` : ''}</small></div><div class="row-when"><strong>${e(euro(payout.total))}</strong><small>klaargezet ${e(dateText(payout.createdAt))}</small></div><div class="row-hours"><a class="btn btn-quiet" href="/admin/uitbetalen/${encodeURIComponent(payout.id)}.csv">CSV</a></div><div class="row-action"><form method="post" action="/admin/uitbetalen/${encodeURIComponent(payout.id)}/betaald"><button class="btn btn-primary" type="submit">Betaald ✓</button></form><form method="post" action="/admin/uitbetalen/${encodeURIComponent(payout.id)}/annuleren"><button class="btn btn-quiet" type="submit" title="Orders gaan terug naar open">Annuleren</button></form></div></article>`).join('');
  const waitingActions = waiting.length ? `<div class="btn-row">${validIban(sepa.iban) ? `<a class="btn" href="/admin/uitbetalen/sepa.xml">SEPA-bestand voor je bank</a>` : '<span class="muted small">Zet PAYOUT_IBAN en PAYOUT_NAME in .env voor een SEPA-bestand.</span>'}${waiting.length > 1 ? '<form method="post" action="/admin/uitbetalen/alle-betaald"><button class="btn btn-quiet" type="submit">Alles betaald</button></form>' : ''}</div>` : '';
  const waitingSection = waiting.length ? `<section class="work-group"><header><h2>Klaar om over te maken</h2><span class="lane-count num">${waiting.length}</span><small>maak over en klik Betaald: de producent krijgt dan een mail</small></header>${waitingRows}${waitingActions}</section>` : '';

  const charges = payouts.charges.filter((charge) => charge.status === 'aangevraagd');
  const chargeRows = charges.map((charge) => `<li class="request">${dot(charge.color)}<span><strong>${e(charge.name)} · ${e(charge.label)}</strong><small>${e(euro(charge.amount))} · ${e(ago(charge.createdAt))}${charge.note ? ` · ${e(charge.note)}` : ''}</small></span><form method="post" action="/admin/uitbetalen/filament/${encodeURIComponent(charge.id)}" class="btn-row"><button class="btn btn-primary" type="submit" name="status" value="verstuurd" title="Gaat van de volgende uitbetaling af">Verstuurd</button><button class="btn btn-quiet" type="submit" name="status" value="afgewezen">Afwijzen</button></form></li>`).join('');
  const chargePanel = charges.length ? `<section class="panel"><div class="panel-head"><h2>Filament voor producenten</h2><span class="muted small">${charges.length} open</span></div><div class="panel-body"><ul class="request-list">${chargeRows}</ul><p class="muted small">Op Verstuurd gaat het bedrag van de volgende uitbetaling af.</p></div></section>` : '';

  const history = payouts.payouts.filter((payout) => payout.status === 'paid').sort((a, b) => String(b.paidAt).localeCompare(String(a.paidAt)));
  const historyPanel = history.length ? `<section class="panel"><div class="panel-head"><h2>Uitbetaald</h2><a class="btn btn-quiet" href="/admin/uitbetalen/alles.csv">Exporteer alles (CSV)</a></div><div class="panel-body"><ul class="request-list">${history.slice(0, 25).map((payout) => `<li class="request"><span><strong>${e(payout.name)} · ${e(euro(payout.total))}</strong><small>${e(payout.reference)} · ${plural(payout.orders.length, 'order', 'orders')} · betaald ${e(dateText(payout.paidAt))}</small></span><a class="btn btn-quiet" href="/admin/uitbetalen/${encodeURIComponent(payout.id)}.csv">CSV</a></li>`).join('')}</ul></div></section>` : '';

  const head = pageHead({ eyebrow: 'Beheer', title: 'Uitbetalen', text: 'Een order telt mee zodra hij verzonden is. Zet per producent alles wat open staat klaar, maak het over en klik op Betaald.' });
  const body = `${warn ? notice(warn, 'warn') : flash ? notice(flash, 'party') : ''}${head}${kpis}<div class="work-list">${waitingSection}<section class="work-group"><header><h2>Per producent</h2><span class="lane-count num">${balances.length}</span><small>open saldo</small></header>${producerList}</section><div class="grid-2 even">${chargePanel}${historyPanel}</div></div>`;
  return renderAdmin({ title: 'Uitbetalen', user, active: 'payouts', context, body });
}

const flashText = {
  made: 'Uitbetaling klaargezet. Maak het bedrag over en klik daarna op Betaald.',
  paid: 'Gemarkeerd als betaald. De producent heeft een mail met de specificatie.',
  cancelled: 'Uitbetaling geannuleerd. De orders staan weer open.',
  charge: 'Filamentaanvraag bijgewerkt.',
};

export function registerPayoutViewRoutes(app) {
  const admin = adminOnly();

  app.get('/admin/verzenden', admin, async (req, res) => {
    const context = await adminContext(req.internalUser);
    const made = Number(req.query.made || 0);
    res.send(shipPage({ context, user: req.internalUser, flash: made ? `${plural(made, 'label', 'labels')} gemaakt. De producent krijgt een mail dat het klaarstaat.` : '', warn: String(req.query.error || '').slice(0, 300) }));
  });

  app.post('/admin/verzenden/label', admin, async (req, res) => {
    const ids = [...new Set([].concat(req.body?.ids || []).flatMap((value) => String(value).split(',')).map((id) => id.trim()).filter(Boolean))].slice(0, 20);
    const result = await makeLabel(ids);
    if (result.error) return res.redirect(`/admin/verzenden?error=${encodeURIComponent(result.error)}`);
    return res.redirect('/admin/verzenden?made=1');
  });

  app.post('/admin/verzenden/alle', admin, async (req, res) => {
    const groups = labelGroups(await readQuotes()).filter((group) => group.ready.length && canCreateShipment(group.ready[0]).ok);
    let made = 0;
    const errors = [];
    for (const group of groups) {
      const result = await makeLabel(group.ready.map((quote) => quote.id));
      if (result.error) errors.push(result.error); else made += 1;
    }
    return res.redirect(`/admin/verzenden?made=${made}${errors.length ? `&error=${encodeURIComponent(`${errors.length} niet gelukt: ${errors[0]}`)}` : ''}`);
  });

  app.get('/admin/uitbetalen', admin, async (req, res) => {
    const [context, payouts] = await Promise.all([adminContext(req.internalUser), readPayouts()]);
    res.send(payPage({ context, payouts, user: req.internalUser, flash: flashText[req.query.done] || '', warn: String(req.query.error || '').slice(0, 300) }));
  });

  const back = (res, done, error) => res.redirect(`/admin/uitbetalen?${error ? `error=${encodeURIComponent(error)}` : `done=${done}`}`);

  app.post('/admin/uitbetalen/klaarzetten', admin, async (req, res) => {
    const context = await adminContext(req.internalUser);
    const account = context.settings.users.find((user) => user.username === String(req.body?.producer || '') && user.role === 'producer');
    if (!account) return back(res, '', 'Producent niet gevonden.');
    try { await createPayout(account, context.quotes); return back(res, 'made'); } catch (error) { return back(res, '', error.message); }
  });

  const pay = async (id, settings) => {
    const { payout, already } = await markPayoutPaid(id);
    if (!already) {
      const account = settings.users.find((user) => user.username === payout.producer);
      notifyPayoutPaid(account, payout).catch((error) => console.warn('[producent-mail] uitbetaalmail niet verstuurd:', error.message));
    }
  };

  app.post('/admin/uitbetalen/alle-betaald', admin, async (req, res) => {
    const [context, payouts] = await Promise.all([adminContext(req.internalUser), readPayouts()]);
    try { for (const payout of payouts.payouts.filter((item) => item.status === 'open')) await pay(payout.id, context.settings); return back(res, 'paid'); } catch (error) { return back(res, '', error.message); }
  });

  app.get('/admin/uitbetalen/sepa.xml', admin, async (req, res) => {
    const payouts = await readPayouts();
    try {
      const body = sepaXml(payouts.payouts);
      res.setHeader('Content-Type', 'application/xml; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="pr3nt-uitbetalingen-${new Date().toISOString().slice(0, 10)}.xml"`);
      return res.send(body);
    } catch (error) { return back(res, '', error.message); }
  });

  app.get('/admin/uitbetalen/alles.csv', admin, async (req, res) => {
    const payouts = await readPayouts();
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pr3nt-uitbetalingen.csv"');
    res.send(payoutsCsv(payouts.payouts));
  });

  app.get('/admin/uitbetalen/:id.csv', admin, async (req, res) => {
    const payout = (await readPayouts()).payouts.find((item) => item.id === req.params.id);
    if (!payout) return res.status(404).send('Niet gevonden');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${payout.reference}.csv"`);
    res.send(payoutsCsv([payout]));
  });

  app.post('/admin/uitbetalen/:id/betaald', admin, async (req, res) => {
    const context = await adminContext(req.internalUser);
    try { await pay(req.params.id, context.settings); return back(res, 'paid'); } catch (error) { return back(res, '', error.message); }
  });

  app.post('/admin/uitbetalen/:id/annuleren', admin, async (req, res) => {
    try { await cancelPayout(req.params.id); return back(res, 'cancelled'); } catch (error) { return back(res, '', error.message); }
  });

  app.post('/admin/uitbetalen/filament/:id', admin, async (req, res) => {
    try { await setChargeStatus(req.params.id, String(req.body?.status || '')); return back(res, 'charge'); } catch (error) { return back(res, '', error.message); }
  });
}

