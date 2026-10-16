// Gedeelde opbouw voor het beheer: inloggen, zijbalk, paginakop en kleine hulpjes.
import { e, logo, renderDocument, assetVersion } from './layout.js';
import { sessionUser, isAdmin, isWorker } from '../myparcel.js';
import { money } from '../vat.js';

const zone = 'Europe/Amsterdam';

// ---------- Inloggen ----------

// Zonder ADMIN_KEY stond het oude orderbeheer open (lokaal testen). Dat mag alleen lokaal, nooit op de server.
function fallbackAdmin(allowOpen) {
  return allowOpen && !process.env.ADMIN_KEY && process.env.NODE_ENV !== 'production' ? { username: 'admin', role: 'admin', name: 'Admin' } : null;
}

function refreshAdminCookie(res, user) {
  if (isAdmin(user) && process.env.ADMIN_KEY) res.cookie?.('pr3nt_admin_key', process.env.ADMIN_KEY, { httpOnly: true, sameSite: 'lax', secure: true, maxAge: 1000 * 60 * 60 * 12 });
}

function toLogin(req, res) {
  const next = encodeURIComponent(req.originalUrl || '/admin');
  return res.redirect(`/admin/login?next=${next}`);
}

export function staffOnly(req, res, next) {
  const user = sessionUser(req);
  if (!isWorker(user)) return toLogin(req, res);
  req.internalUser = user;
  refreshAdminCookie(res, user);
  return next();
}

export function adminOnly({ allowOpen = false } = {}) {
  return (req, res, next) => {
    const user = sessionUser(req) || fallbackAdmin(allowOpen);
    if (!user) return toLogin(req, res);
    if (!isAdmin(user)) return res.status(403).send(forbiddenPage(user));
    req.internalUser = user;
    refreshAdminCookie(res, user);
    return next();
  };
}

// ---------- Tijd ----------

// Planning slaat 'wandkloktijd' op (2026-10-16T08:00). Die tonen we letterlijk, zonder tijdzone-omrekening.
export function wallClock(value = '') {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!match) return null;
  const [, y, m, d, hh, mm] = match.map(Number);
  return { y, m, d, hh, mm, date: `${match[1]}-${match[2]}-${match[3]}`, minutes: hh * 60 + mm, stamp: `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}` };
}

export function nowWallClock() {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date()).map((part) => [part.type, part.value]));
  return wallClock(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`);
}

const dayNames = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];
const monthNames = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export function dateFromKey(key = '') {
  const [y, m, d] = String(key).split('-').map(Number);
  return new Date(Date.UTC(y || 1970, (m || 1) - 1, d || 1));
}

export function keyFromDate(date) {
  return date.toISOString().slice(0, 10);
}

export function addDays(key, days) {
  const date = dateFromKey(key);
  date.setUTCDate(date.getUTCDate() + days);
  return keyFromDate(date);
}

export function dayLabel(key, { long = false } = {}) {
  const date = dateFromKey(key);
  const today = nowWallClock().date;
  if (key === today) return 'Vandaag';
  if (key === addDays(today, 1)) return 'Morgen';
  if (key === addDays(today, -1)) return 'Gisteren';
  const day = dayNames[date.getUTCDay()];
  return long ? `${day[0].toUpperCase()}${day.slice(1)} ${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}` : `${day.slice(0, 2)} ${date.getUTCDate()} ${monthNames[date.getUTCMonth()]}`;
}

export function shortDay(key) {
  return dayNames[dateFromKey(key).getUTCDay()].slice(0, 2);
}

export function clockText(value = '') {
  const clock = wallClock(value);
  if (!clock) return '';
  const time = `${String(clock.hh).padStart(2, '0')}:${String(clock.mm).padStart(2, '0')}`;
  const label = dayLabel(clock.date);
  return `${label === 'Vandaag' ? 'vandaag' : label === 'Morgen' ? 'morgen' : label === 'Gisteren' ? 'gisteren' : label} ${time}`;
}

export function timeOnly(value = '') {
  const clock = wallClock(value);
  return clock ? `${String(clock.hh).padStart(2, '0')}:${String(clock.mm).padStart(2, '0')}` : '';
}

export function ago(value) {
  const time = new Date(value || 0).getTime();
  if (!time) return '';
  const minutes = Math.round((Date.now() - time) / 60000);
  if (minutes < 1) return 'zojuist';
  if (minutes < 60) return `${minutes} min geleden`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} uur geleden`;
  const days = Math.round(hours / 24);
  if (days === 1) return 'gisteren';
  if (days < 14) return `${days} dagen geleden`;
  return new Date(time).toLocaleDateString('nl-NL', { timeZone: zone, day: 'numeric', month: 'short' });
}

export function greeting() {
  const hour = nowWallClock().hh;
  if (hour < 6) return 'Goedenacht';
  if (hour < 12) return 'Goedemorgen';
  if (hour < 18) return 'Goedemiddag';
  return 'Goedenavond';
}

// ---------- Kleine opmaakhulpjes ----------

export function euro(value) {
  return `€ ${money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function hoursText(value) {
  const hours = money(value);
  return `${hours.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} uur`;
}

export function displayName(user) {
  const name = String(user?.name || user?.username || '').trim();
  if (isAdmin(user) && (!name || name.toLowerCase() === 'admin')) return String(process.env.ADMIN_NAME || '').trim();
  return name;
}

export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return (parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : parts[0].slice(0, 2)).toUpperCase();
}

export function plural(count, one, many) {
  return `${count} ${count === 1 ? one : many}`;
}

// Kleur van het filament als CSS-kleur, voor stipjes, spoelen en planningblokken.
export function swatch(name = '') {
  const value = String(name).toLowerCase();
  const colors = [
    [/zwart|black/, '#2A2F35'], [/wit|white|naturel|natural/, '#ECE8E0'], [/grijs|grey|gray|zilver|silver/, '#8D949B'],
    [/rood|red/, '#C8321E'], [/oranje|orange/, '#FF8A3D'], [/geel|yellow/, '#F2C230'], [/groen|green/, '#00B070'],
    [/blauw|blue/, '#3D8BFF'], [/paars|purple/, '#7A4FD1'], [/roze|pink/, '#EC7FB0'], [/bruin|brown|hout|wood/, '#8A5A36'],
    [/goud|gold/, '#C9A24A'], [/transparant|clear/, '#CFE3E8'],
  ];
  const match = colors.find(([pattern]) => pattern.test(value));
  return match ? match[1] : '#9AA3AC';
}

export function dot(colorName, label = '') {
  return `<span class="swatch" style="--c:${swatch(colorName)}"${label ? ` title="${e(label)}"` : ''} aria-hidden="true"></span>`;
}

export function notice(text, tone = '') {
  return text ? `<div class="notice${tone ? ` ${tone}` : ''}" role="status" data-notice><span>${e(text)}</span><button class="btn btn-quiet" type="button" data-dismiss aria-label="Melding sluiten">Sluiten</button></div>` : '';
}

export function pageHead({ eyebrow = '', title = '', text = '', actions = '' } = {}) {
  return `<header class="page-head"><div class="page-title">${eyebrow ? `<span class="label">${eyebrow}</span>` : ''}<h1>${title}</h1>${text ? `<p>${text}</p>` : ''}</div>${actions ? `<div class="btn-row">${actions}</div>` : ''}</header>`;
}

export function emptyState(title, text = '') {
  return `<div class="empty-state"><div class="nozzle" aria-hidden="true"><i></i></div><strong>${e(title)}</strong>${text ? `<p>${e(text)}</p>` : ''}</div>`;
}

// ---------- Zijbalk ----------

function navItems(user, counts = {}) {
  const work = [
    ['orders', '/admin', 'Orders', counts.orders, true],
    ['work', '/admin/work', 'Productie', counts.work],
    ['agenda', '/admin/work/agenda', 'Planning'],
    ['filament', '/admin/filament', 'Filament', counts.filament],
  ].filter(([key]) => isAdmin(user) || key !== 'orders');
  // Website-CMS: alles van pr3nt.nl (zie src/cms/)
  const site = isAdmin(user) ? [
    ['cms', '/admin/website', 'Overzicht'],
    ['cms-stats', '/admin/website/statistieken', 'Statistieken'],
    ['cms-pages', '/admin/website/paginas', 'Pagina’s'],
    ['cms-articles', '/admin/website/kennisbank', 'Kennisbank'],
    ['cms-shop', '/admin/website/producten', 'Webshop'],
    ['cms-orders', '/admin/website/bestellingen', 'Bestellingen'],
    ['cms-media', '/admin/website/media', 'Foto’s'],
    ['cms-seo', '/admin/website/seo', 'SEO'],
    ['cms-customers', '/admin/website/klanten', 'Klanten'],
    ['cms-messages', '/admin/website/berichten', 'Berichten'],
    ['cms-producers', '/admin/website/producenten', 'Producenten'],
    ['cms-settings', '/admin/website/instellingen', 'Instellingen'],
  ] : [];
  const manage = isAdmin(user) ? [
    ['stats', '/admin/work/stats', 'Cijfers'],
    ['options', '/admin/work/options', 'Instellingen'],
  ] : [];
  return { work, site, manage };
}

function navLink([key, href, label, count], active) {
  const badge = count ? `<span class="nav-count">${count}</span>` : '';
  return `<a href="${href}" class="nav-${key}"${active === key ? ' aria-current="page"' : ''}><span>${label}</span>${badge}</a>`;
}

// Live-indicatie per printer: print er nu iets, en tot wanneer.
function printersNow(printers = []) {
  if (!printers.length) return '';
  const rows = printers.map((printer) => {
    const job = printer.job;
    const state = job ? `Print tot ${timeOnly(job.scheduledEndAt)}` : printer.next ? `Vrij, volgende ${clockText(printer.next.scheduledStartAt)}` : 'Vrij';
    return `<li class="${job ? 'is-busy' : ''}"><span class="printer-dot" aria-hidden="true"></span><span><strong>${e(printer.name)}</strong><small>${e(state)}</small></span></li>`;
  }).join('');
  return `<section class="side-printers" aria-label="Printers nu"><span class="label">Printers nu</span><ul>${rows}</ul></section>`;
}

function sidebar(user, active, context = {}) {
  const { work, site, manage } = navItems(user, context.counts || {});
  const named = displayName(user);
  const name = named || (isAdmin(user) ? 'Beheerder' : 'Productie');
  return `<aside class="side"><div class="side-top">${logo(isAdmin(user) ? '/admin' : '/admin/work')}<span class="side-role">${isAdmin(user) ? 'Beheer' : 'Werkplaats'}</span></div><nav class="side-nav" aria-label="Beheer"><span class="label">Werk</span>${work.map((item) => navLink(item, active)).join('')}${site.length ? `<span class="label">Website</span>${site.map((item) => navLink(item, active)).join('')}` : ''}${manage.length ? `<span class="label">Beheer</span>${manage.map((item) => navLink(item, active)).join('')}` : ''}</nav>${printersNow(context.printers)}<div class="side-user"><span class="avatar" aria-hidden="true">${e(named ? initials(named) : '3')}</span><span class="side-user-name"><strong>${e(name)}</strong><small>${isAdmin(user) ? 'Admin' : 'Medewerker'}</small></span><form method="post" action="/admin/logout"><button class="btn btn-quiet" type="submit" title="Uitloggen">Uitloggen</button></form></div></aside>`;
}

export function renderAdmin({ title, user, active, body, context = {}, scripts = '' }) {
  const page = `<div class="admin">${sidebar(user, active, context)}<main class="admin-main" id="main">${body}</main></div>`;
  return renderDocument({ title, bodyClass: 'is-admin', body: page, scripts: `<script src="/assets/portal.js?v=${assetVersion}" defer></script><script src="/assets/admin.js?v=${assetVersion}" defer></script>${scripts}` });
}

function forbiddenPage(user) {
  return renderAdmin({ title: 'Geen toegang', user, active: '', body: `${pageHead({ eyebrow: 'Geen toegang', title: 'Deze pagina is voor beheerders', text: 'Je kunt wel bij productie, planning en filament.' })}<div><a class="btn btn-dark" href="/admin/work">Naar productie</a></div>` });
}
