// Het producentendashboard: Overzicht, Vergoeding, Statistieken, Filament en Account.
// Productie zelf (accepteren, klaar melden, verzenden) staat in workview.js.
import { e } from './ui/layout.js';
import { teamOnly, renderAdmin, pageHead, notice, emptyState, euro, ago, plural, dot, swatch, greeting, hoursText } from './ui/adminshell.js';
import { adminContext, printHours, isRush } from './ui/orders.js';
import { isProducer, updateUsers, authenticateUser, passwordHash, setInternalSession } from './myparcel.js';
import { inProduction, phaseOf, offeredTo, producerFee, accountOf } from './producers.js';
import { readPayouts, balanceOf, feeLine, isEarned, earnedAt, validIban, normalizeIban, formatIban, requestFilament, filamentPricePerKg } from './payouts.js';

const money = (value) => { const number = Number(String(value ?? '0').replace(',', '.')); return Number.isFinite(number) ? number : 0; };
const dateText = (value) => (value ? new Date(value).toLocaleDateString('nl-NL', { timeZone: 'Europe/Amsterdam', day: 'numeric', month: 'short', year: 'numeric' }) : '');
const firstOf = (name = '') => String(name || '').trim().split(/\s+/)[0] || '';
const orderHref = (quote) => `/admin/work/orders/${encodeURIComponent(quote.id || quote)}`;
const kpi = (label, value, hint = '', index = 0) => `<div class="kpi" style="--i:${index}"><span class="label">${e(label)}</span><strong class="num">${value}</strong>${hint ? `<small>${hint}</small>` : ''}</div>`;

// Alleen voor producenten; je eigen team gaat gewoon naar Productie.
function producerOnly(req, res, next) {
  teamOnly(req, res, () => {
    if (!isProducer(req.internalUser)) return res.redirect('/admin/work');
    return next();
  });
}

async function load(user) {
  const [context, payouts] = await Promise.all([adminContext(user), readPayouts()]);
  const account = accountOf(user, context.settings) || { username: user.username, name: user.name };
  return { context, payouts, account, balance: balanceOf(user.username, context.quotes, payouts) };
}

// Wat moet de producent nog regelen? Dat staat bovenaan.
function setupNotices(account) {
  const items = [];
  if (account.paused === 'on') items.push(`<div class="callout warn"><strong>Je staat op pauze</strong>Je krijgt geen nieuwe orders te zien en geen mails over nieuwe orders. <form method="post" action="/admin/work/pauze" style="display:inline"><input type="hidden" name="paused" value=""><button class="btn btn-quiet" type="submit">Pauze stoppen</button></form></div>`);
  if (!validIban(account.iban)) items.push('<div class="callout"><strong>Vul je IBAN in</strong>Zonder rekeningnummer kunnen we je niet uitbetalen. <a href="/admin/work/account#uitbetaling">Nu invullen →</a></div>');
  return items.join('');
}

function miniRow(quote, right, action = '') {
  const meta = [quote.material, quote.color].filter(Boolean).join(' · ') || 'Print';
  return `<article class="job-row mini-row${isRush(quote) ? ' is-rush' : ''}" style="--c:${swatch(quote.color)}"><div class="row-main"><strong><a href="${orderHref(quote)}">${e(`Order voor ${firstOf(quote.name) || 'klant'}`)}</a>${isRush(quote) ? ' <em class="tag-rush">Spoed</em>' : ''}</strong><small>${dot(quote.color)}${e(meta)} · <span class="mono">${e(quote.id)}</span></small></div><div class="row-when">${right}</div><div class="row-action">${action}</div></article>`;
}

// ---------- Overzicht ----------

function overviewPage({ context, account, balance, user }) {
  const { quotes, settings } = context;
  const fresh = quotes.filter((quote) => inProduction(quote) && phaseOf(quote) === 'new' && offeredTo(user, quote, settings));
  const making = balance.making;
  const toReceive = balance.total + balance.waitingTotal;
  const kpis = `<section class="kpis kpis-3">${[
    kpi('Te ontvangen', e(euro(toReceive)), balance.waiting.length ? `${e(euro(balance.waitingTotal))} wordt nu overgemaakt` : balance.orders.length ? `${plural(balance.orders.length, 'verzonden order', 'verzonden orders')}` : 'Verdiend zodra een order verzonden is', 0),
    kpi('Bij jou in productie', String(making.length), making.length ? `Goed voor ${e(euro(balance.coming))}` : 'Even niks', 1),
    kpi('Nieuwe orders', String(fresh.length), fresh.length ? 'Wie het eerst accepteert, krijgt hem' : account.paused === 'on' ? 'Je staat op pauze' : 'Je krijgt een mail bij een nieuwe', 2),
  ].join('')}</section>`;
  const stepText = (quote) => (quote.status === 'ready_to_ship' ? (quote.myParcelShipmentId ? '<strong>Label klaar</strong><small>Printen en wegbrengen</small>' : '<strong>Wacht op label</strong><small>Pr3nt maakt het label</small>') : `<strong>Printen</strong><small>${e(hoursText(printHours(quote)))} · ${e(ago(quote.producerAcceptedAt))} geaccepteerd</small>`);
  const mine = making.length
    ? making.map((quote) => miniRow(quote, stepText(quote), `<a class="btn" href="${orderHref(quote)}">Open</a>`)).join('')
    : `<div class="panel">${emptyState('Niks in productie', fresh.length ? 'Kijk hiernaast: er wachten nieuwe orders.' : 'Zodra je een order accepteert, staat hij hier.')}</div>`;
  const offers = fresh.length
    ? fresh.slice(0, 4).map((quote) => miniRow(quote, `<strong>${e(euro(producerFee(quote).total))}</strong><small>${e(hoursText(printHours(quote)))} printen</small>`, `<form method="post" action="${orderHref(quote)}/accept"><button class="btn btn-dark" type="submit">Accepteren</button></form>`)).join('') + (fresh.length > 4 ? `<a class="btn btn-quiet" href="/admin/work">Alle ${fresh.length} nieuwe orders →</a>` : '')
    : `<div class="panel">${emptyState('Geen nieuwe orders', account.paused === 'on' ? 'Je staat op pauze.' : 'We mailen je zodra er een binnenkomt.')}</div>`;
  const pause = account.paused === 'on' ? '' : '<form method="post" action="/admin/work/pauze"><input type="hidden" name="paused" value="on"><button class="btn btn-quiet" type="submit" title="Geen nieuwe orders en mails, bijvoorbeeld tijdens vakantie">Pauze nemen</button></form>';
  const head = pageHead({ eyebrow: 'Producent', title: `${greeting()}${firstOf(account.name) ? `, ${e(firstOf(account.name))}` : ''}`, text: making.length ? `Je hebt ${plural(making.length, 'order', 'orders')} lopen.` : fresh.length ? 'Er liggen nieuwe orders voor je klaar.' : 'Rustig moment. Tijd voor een kop koffie.', actions: `<a class="btn btn-dark" href="/admin/work">Naar productie</a>${pause}` });
  const body = `${head}${setupNotices(account)}${kpis}<div class="grid-2 even"><section class="work-group"><header><h2>Nu bij jou</h2><span class="lane-count num">${making.length}</span></header>${mine}</section><section class="work-group"><header><h2>Nieuwe orders</h2><span class="lane-count num">${fresh.length}</span><small>vergoeding vooraf bekend</small></header>${offers}</section></div>`;
  return renderAdmin({ title: 'Overzicht', user, active: 'p-home', context, body: `<div data-work-live data-refresh="60">${body}</div>` });
}

// ---------- Vergoeding ----------

function payoutPage({ context, balance, account, user, flash = '' }) {
  const kpis = `<section class="kpis kpis-3">${[
    kpi('Open saldo', e(euro(balance.total)), balance.chargesTotal ? `${e(euro(balance.ordersTotal))} verdiend − ${e(euro(balance.chargesTotal))} filament` : 'Verzonden, nog niet uitbetaald', 0),
    kpi('Wordt overgemaakt', e(euro(balance.waitingTotal)), balance.waiting.length ? plural(balance.waiting.length, 'uitbetaling', 'uitbetalingen') : 'Niks onderweg', 1),
    kpi('Totaal uitbetaald', e(euro(balance.paidTotal)), balance.paid.length ? `Laatste: ${e(dateText(balance.paid[balance.paid.length - 1].paidAt))}` : 'Nog geen uitbetalingen', 2),
  ].join('')}</section>`;
  const orderRows = balance.orders.map((order) => `<tr><td><a href="${orderHref(order.id)}">${e(order.label)}</a><small class="mono muted">${e(order.id)}</small></td><td>${e(dateText(order.shippedAt))}</td><td class="num">${e(euro(order.print))}</td><td class="num">${order.ship ? e(euro(order.ship)) : '-'}</td><td class="num"><strong>${e(euro(order.total))}</strong></td></tr>`).join('');
  const chargeRows = balance.charges.map((charge) => `<tr class="is-minus"><td>${e(charge.label)}</td><td>filament</td><td></td><td></td><td class="num"><strong>− ${e(euro(charge.amount))}</strong></td></tr>`).join('');
  const open = balance.orders.length || balance.charges.length
    ? `<div class="table-wrap"><table class="money-table"><thead><tr><th>Order</th><th>Verzonden</th><th class="num">Printen</th><th class="num">Verzenden</th><th class="num">Vergoeding</th></tr></thead><tbody>${orderRows}${chargeRows}</tbody><tfoot><tr><td colspan="4">Totaal open</td><td class="num"><strong>${e(euro(balance.total))}</strong></td></tr></tfoot></table></div>`
    : '<p class="empty">Niks open. Een order telt mee zodra je hem op Verzonden zet.</p>';
  const coming = balance.making.length ? `<p class="muted small">Nog in productie: ${plural(balance.making.length, 'order', 'orders')}, samen ${e(euro(balance.coming))}. Die komen erbij zodra ze verzonden zijn.</p>` : '';
  const history = [...balance.waiting, ...balance.paid].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const historyList = history.length ? `<ul class="request-list">${history.map((payout) => `<li class="request"><span><strong>${e(euro(payout.total))} · ${e(payout.reference)}</strong><small>${plural(payout.orders.length, 'order', 'orders')}${payout.charges?.length ? ` · ${e(euro(payout.chargesTotal))} filament verrekend` : ''} · ${e(payout.status === 'paid' ? `betaald ${dateText(payout.paidAt)}` : `klaargezet ${dateText(payout.createdAt)}`)}</small></span><span class="pill ${payout.status === 'paid' ? 'ok' : 'wait'}">${payout.status === 'paid' ? 'Betaald' : 'Wordt overgemaakt'}</span></li>`).join('')}</ul>` : '<p class="empty">Nog geen uitbetalingen.</p>';
  const iban = validIban(account.iban) ? `Uitbetaling naar <strong>${e(formatIban(account.iban))}</strong>${account.accountName ? ` t.n.v. ${e(account.accountName)}` : ''}. <a href="/admin/work/account#uitbetaling">Wijzigen</a>` : '<strong>Nog geen IBAN.</strong> <a href="/admin/work/account#uitbetaling">Vul hem in</a> zodat we je kunnen uitbetalen.';
  const head = pageHead({ eyebrow: 'Producent', title: 'Vergoeding', text: 'Per order zie je vooraf wat je krijgt: printen plus een vast bedrag voor inpakken en wegbrengen. Het verzendlabel betaalt Pr3nt.' });
  const body = `${flash ? notice(flash) : ''}${head}${kpis}<div class="grid-2"><section class="panel"><div class="panel-head"><h2>Nog te verrekenen</h2></div><div class="panel-body">${open}${coming}</div></section><div class="stack"><section class="panel"><div class="panel-head"><h2>Zo werkt uitbetalen</h2></div><div class="panel-body"><ol class="steps-list"><li>Een order telt mee zodra je hem op <strong>Verzonden</strong> zet.</li><li>Pr3nt zet periodiek alles wat open staat in één uitbetaling.</li><li>Je krijgt een mail met de specificatie zodra het geld is overgemaakt.</li></ol><p class="muted small">${iban}</p></div></section><section class="panel"><div class="panel-head"><h2>Uitbetalingen</h2></div><div class="panel-body">${historyList}</div></section></div></div>`;
  return renderAdmin({ title: 'Vergoeding', user, active: 'p-pay', context, body });
}

// ---------- Statistieken ----------

function monthKeys(count = 6) {
  const now = new Date();
  return Array.from({ length: count }, (_, index) => new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (count - 1 - index), 1)).toISOString().slice(0, 7));
}
const monthName = (key) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString('nl-NL', { month: 'short' }).replace('.', '');

function statsPage({ context, user }) {
  const mine = context.quotes.filter((quote) => quote.producer === user.username);
  const done = mine.filter(isEarned);
  const months = monthKeys(6).map((key) => { const list = done.filter((quote) => earnedAt(quote).slice(0, 7) === key); return { key, count: list.length, amount: list.reduce((sum, quote) => sum + feeLine(quote).total, 0) }; });
  const max = Math.max(1, ...months.map((month) => month.amount));
  const thisMonth = months[months.length - 1];
  const lastMonth = months[months.length - 2];
  const delta = lastMonth.amount > 0 ? Math.round(((thisMonth.amount - lastMonth.amount) / lastMonth.amount) * 100) : null;
  const lead = done.map((quote) => (new Date(quote.readyAt || quote.shippedAt) - new Date(quote.producerAcceptedAt)) / 3600000).filter((hours) => Number.isFinite(hours) && hours >= 0).sort((a, b) => a - b);
  const median = lead.length ? lead[Math.floor(lead.length / 2)] : null;
  const leadText = median === null ? '-' : median < 24 ? `${Math.max(1, Math.round(median))} uur` : `${(median / 24).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} dagen`;
  const ratings = done.map((quote) => money(quote.review?.rating)).filter((rating) => rating > 0);
  const rating = ratings.length ? (ratings.reduce((sum, value) => sum + value, 0) / ratings.length).toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : '-';
  const hours = done.reduce((sum, quote) => sum + printHours(quote), 0);
  const kpis = `<section class="kpis kpis-4">${[
    kpi('Deze maand', e(euro(thisMonth.amount)), delta === null ? plural(thisMonth.count, 'order', 'orders') : `${delta >= 0 ? '+' : ''}${delta}% t.o.v. vorige maand`, 0),
    kpi('Orders geleverd', String(done.length), `${e(hoursText(hours))} geprint`, 1),
    kpi('Accepteren tot klaar', e(leadText), 'mediaan', 2),
    kpi('Klantbeoordeling', e(rating), ratings.length ? `${plural(ratings.length, 'review', 'reviews')}` : 'nog geen reviews', 3),
  ].join('')}</section>`;
  const chart = `<div class="bars" style="grid-template-columns:repeat(6,minmax(0,1fr))" role="img" aria-label="Verdiend per maand">${months.map((month, index) => `<div class="bar-col" style="--i:${index}"><div class="bar-pair"><i class="bar-b" style="--h:${(month.amount / max) * 100}%" title="${e(euro(month.amount))} · ${month.count} orders"></i></div><span>${e(monthName(month.key))}</span></div>`).join('')}</div><p class="legend"><span class="key-b">Verdiend per maand</span>${thisMonth.count ? `<span class="muted">${plural(thisMonth.count, 'order', 'orders')} deze maand</span>` : ''}</p>`;
  const tally = new Map();
  done.forEach((quote) => { const key = String(quote.material || 'Onbekend').trim(); tally.set(key, (tally.get(key) || 0) + 1); });
  const top = [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topMax = Math.max(1, ...top.map(([, count]) => count));
  const materials = top.length ? `<ul class="hbars">${top.map(([label, count], index) => `<li style="--w:${(count / topMax) * 100}%;--i:${index}"><span>${e(label)}</span><i></i><strong class="num">${count}</strong></li>`).join('')}</ul>` : '<p class="empty">Nog geen geleverde orders.</p>';
  const head = pageHead({ eyebrow: 'Producent', title: 'Statistieken', text: done.length ? `Je hebt ${plural(done.length, 'order', 'orders')} geleverd via Pr3nt. Mooi werk.` : 'Zodra je eerste order verzonden is, zie je hier je cijfers.' });
  return renderAdmin({ title: 'Statistieken', user, active: 'p-stats', context, body: `${head}${kpis}<div class="grid-2"><section class="panel"><div class="panel-head"><h2>Verdiend</h2><span class="muted small">laatste 6 maanden</span></div><div class="panel-body">${chart}</div></section><section class="panel"><div class="panel-head"><h2>Wat je print</h2></div><div class="panel-body">${materials}</div></section></div>` });
}

// ---------- Filament ----------

function filamentPage({ context, payouts, user, flash = '' }) {
  const mine = payouts.charges.filter((charge) => charge.producer === user.username).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const tone = { aangevraagd: 'wait', verstuurd: 'ok', afgewezen: '' };
  const text = { aangevraagd: 'Aangevraagd', verstuurd: 'Verstuurd', afgewezen: 'Afgewezen' };
  const list = mine.length ? `<ul class="request-list">${mine.map((charge) => `<li class="request">${dot(charge.color)}<span><strong>${e(charge.label)}</strong><small>${e(euro(charge.amount))} · ${e(ago(charge.createdAt))}${charge.note ? ` · ${e(charge.note)}` : ''}</small></span><span class="pill ${tone[charge.status] || ''}">${text[charge.status] || e(charge.status)}</span></li>`).join('')}</ul>` : '<p class="empty">Nog geen aanvragen.</p>';
  const price = filamentPricePerKg();
  const form = `<form method="post" action="/admin/work/filament" class="form" style="display:grid;gap:12px"><div class="field-grid"><label class="field"><span>Type</span><select name="type">${['PLA', 'PETG', 'ABS', 'ASA', 'TPU'].map((type) => `<option>${type}</option>`).join('')}</select></label><label class="field"><span>Kleur</span><input name="color" required placeholder="Bijv. Zwart" list="fil-colors"></label><label class="field"><span>Aantal kg <small>(1 kg = 1 spoel)</small></span><input name="kilos" type="number" min="1" max="20" value="1" required data-kilos></label><label class="field"><span>Prijs</span><input value="${e(euro(price))} per kg" disabled></label><label class="field wide"><span>Opmerking <small>(optioneel)</small></span><input name="note" maxlength="300" placeholder="Bijv. graag Bambu Lab"></label></div><datalist id="fil-colors">${['Zwart', 'Wit', 'Grijs', 'Rood', 'Blauw', 'Groen', 'Oranje', 'Geel'].map((color) => `<option value="${color}">`).join('')}</datalist><div class="btn-row"><button class="btn btn-dark" type="submit">Aanvragen</button><span class="muted small">Gaat van je volgende uitbetaling af, je hoeft niks apart te betalen.</span></div></form>`;
  const head = pageHead({ eyebrow: 'Producent', title: 'Filament', text: `Filament via Pr3nt kost ${e(euro(price))} per kg. We sturen het op en verrekenen het met je volgende uitbetaling.` });
  return renderAdmin({ title: 'Filament', user, active: 'p-filament', context, body: `${flash ? notice(flash) : ''}${head}<div class="grid-2"><section class="panel"><div class="panel-head"><h2>Nieuwe aanvraag</h2></div><div class="panel-body">${form}</div></section><section class="panel"><div class="panel-head"><h2>Jouw aanvragen</h2></div><div class="panel-body">${list}</div></section></div>` });
}

// ---------- Account ----------

function accountPage({ context, account, user, flash = '', error = '' }) {
  const toggle = (name, checked, label, hint) => `<label class="toggle"><input type="checkbox" name="${name}" value="on" ${checked ? 'checked' : ''}><span>${label}${hint ? `<br><small class="muted">${hint}</small>` : ''}</span></label>`;
  const head = pageHead({ eyebrow: 'Producent', title: 'Account', text: 'Je gegevens, uitbetaling en meldingen.' });
  const form = `<form method="post" action="/admin/work/account" class="settings" data-dirty-form><div class="grid-2"><div class="stack">
<section class="panel"><div class="panel-head"><h2>Jij</h2></div><div class="panel-body"><div class="field-grid"><label class="field"><span>Naam</span><input name="name" value="${e(account.name || '')}" required maxlength="120"></label><label class="field"><span>Telefoon <small>(alleen voor Pr3nt)</small></span><input name="phone" value="${e(account.phone || '')}" maxlength="40" inputmode="tel"></label><label class="field wide"><span>E-mail voor meldingen</span><input name="email" type="email" value="${e(account.email || account.username)}" required maxlength="160"><small>Inloggen blijft met ${e(account.username)}.</small></label></div></div></section>
<section class="panel" id="uitbetaling"><div class="panel-head"><h2>Uitbetaling</h2>${validIban(account.iban) ? '<span class="pill ok">Ingevuld</span>' : '<span class="pill wait">Nog invullen</span>'}</div><div class="panel-body"><div class="field-grid"><label class="field wide"><span>IBAN</span><input name="iban" value="${e(formatIban(account.iban || ''))}" placeholder="NL00 BANK 0123 4567 89" autocomplete="off" spellcheck="false" maxlength="42"></label><label class="field wide"><span>Op naam van</span><input name="accountName" value="${e(account.accountName || '')}" placeholder="${e(account.name || 'Naam rekeninghouder')}" maxlength="120"></label></div></div></section>
</div><div class="stack">
<section class="panel"><div class="panel-head"><h2>Meldingen en beschikbaarheid</h2></div><div class="panel-body" style="display:grid;gap:14px">${toggle('notifyNew', account.notifyNew !== 'off', 'Mail me bij nieuwe orders', 'Mails over je eigen orders, labels en uitbetalingen krijg je altijd.')}${toggle('paused', account.paused === 'on', 'Pauze', 'Geen nieuwe orders en mails, bijvoorbeeld tijdens vakantie of als je printer stuk is.')}</div></section>
<section class="panel"><div class="panel-head"><h2>Wat kun je printen?</h2></div><div class="panel-body"><label class="field"><span>Materialen <small>(met komma's; leeg = alles)</small></span><input name="materials" value="${e(account.materials || '')}" placeholder="PLA, PETG" maxlength="200"></label><p class="muted small">Je ziet alleen nieuwe orders in deze materialen.</p></div></section>
<section class="panel"><div class="panel-head"><h2>Wachtwoord</h2></div><div class="panel-body"><details class="reveal"><summary class="btn">Wachtwoord wijzigen</summary><div class="field-grid"><label class="field wide"><span>Huidig wachtwoord</span><input name="current" type="password" autocomplete="current-password"></label><label class="field"><span>Nieuw <small>(min. 10 tekens)</small></span><input name="password" type="password" minlength="10" autocomplete="new-password"></label><label class="field"><span>Nog een keer</span><input name="again" type="password" minlength="10" autocomplete="new-password"></label></div></details></div></section>
</div></div><div class="savebar" data-savebar><span class="savebar-text" data-save-text>Alles is opgeslagen</span><button class="btn btn-primary" type="submit">Opslaan</button></div></form>`;
  return renderAdmin({ title: 'Account', user, active: 'p-account', context, body: `${error ? notice(error, 'warn') : flash ? notice(flash) : ''}${head}${form}` });
}

const cleanText = (value = '', max = 160) => String(value || '').replace(/[<>]/g, '').trim().slice(0, max);

export function registerProducerViewRoutes(app) {
  app.get('/admin/work/overzicht', producerOnly, async (req, res) => {
    const data = await load(req.internalUser);
    res.send(overviewPage({ ...data, user: req.internalUser }));
  });

  app.post('/admin/work/pauze', producerOnly, async (req, res) => {
    const paused = req.body?.paused === 'on' ? 'on' : '';
    await updateUsers((users) => users.map((user) => (user.username === req.internalUser.username ? { ...user, paused } : user)));
    res.redirect('/admin/work/overzicht');
  });

  app.get('/admin/work/vergoeding', producerOnly, async (req, res) => {
    const data = await load(req.internalUser);
    res.send(payoutPage({ ...data, user: req.internalUser }));
  });

  app.get('/admin/work/statistieken', producerOnly, async (req, res) => {
    const context = await adminContext(req.internalUser);
    res.send(statsPage({ context, user: req.internalUser }));
  });

  app.get('/admin/work/filament', producerOnly, async (req, res) => {
    const data = await load(req.internalUser);
    res.send(filamentPage({ ...data, user: req.internalUser, flash: req.query.sent === '1' ? 'Aangevraagd. Je ziet hier wanneer het verstuurd is.' : '' }));
  });

  app.post('/admin/work/filament', producerOnly, async (req, res) => {
    const { account } = await load(req.internalUser);
    const color = cleanText(req.body?.color, 60);
    if (!color) return res.redirect('/admin/work/filament');
    await requestFilament(account, { color, type: cleanText(req.body?.type, 30) || 'PLA', kilos: req.body?.kilos, note: req.body?.note });
    res.redirect('/admin/work/filament?sent=1');
  });

  app.get('/admin/work/account', producerOnly, async (req, res) => {
    const data = await load(req.internalUser);
    res.send(accountPage({ ...data, user: req.internalUser, flash: req.query.saved === '1' ? 'Opgeslagen.' : '' }));
  });

  app.post('/admin/work/account', producerOnly, async (req, res) => {
    const user = req.internalUser;
    const body = req.body || {};
    const data = await load(user);
    const fail = (error) => res.status(400).send(accountPage({ ...data, account: { ...data.account, ...body, iban: body.iban || '' }, user, error }));
    const iban = normalizeIban(body.iban);
    if (iban && !validIban(iban)) return fail('Dat IBAN klopt niet. Controleer het nog even.');
    const email = cleanText(body.email, 160).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail('Vul een geldig e-mailadres in.');
    let hash = '';
    if (body.password || body.current) {
      if (!(await authenticateUser(user.username, String(body.current || '')))) return fail('Je huidige wachtwoord klopt niet.');
      if (String(body.password || '').length < 10) return fail('Kies een nieuw wachtwoord van minimaal 10 tekens.');
      if (body.password !== body.again) return fail('De twee nieuwe wachtwoorden zijn niet hetzelfde.');
      hash = passwordHash(String(body.password));
    }
    const name = cleanText(body.name, 120) || data.account.name;
    await updateUsers((users) => users.map((account) => (account.username === user.username ? {
      ...account, name, email, phone: cleanText(body.phone, 40), iban, accountName: cleanText(body.accountName, 120),
      notifyNew: body.notifyNew === 'on' ? '' : 'off', paused: body.paused === 'on' ? 'on' : '', materials: cleanText(body.materials, 200),
      ...(hash ? { passwordHash: hash } : {}),
    } : account)));
    if (name !== user.name) setInternalSession(res, { username: user.username, name, role: 'producer' });
    res.redirect('/admin/work/account?saved=1');
  });
}

