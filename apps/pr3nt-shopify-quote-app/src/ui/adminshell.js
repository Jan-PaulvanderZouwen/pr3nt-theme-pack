// Gedeelde opbouw voor het beheer: inloggen, zijbalk, paginakop en kleine hulpjes.
import { e, logo, renderDocument, assetVersion } from './layout.js';
import { sessionUser, isAdmin, isWorker, isProducer, isTeam } from '../myparcel.js';
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

// Productie: eigen team én externe producenten (die zien daar alleen nieuwe en eigen orders).
export function teamOnly(req, res, next) {
  const user = sessionUser(req);
  if (!isTeam(user)) return toLogin(req, res);
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

// ---------- Omgevingen, navigatie en zijbalk ----------
// Het beheer heeft twee losse omgevingen: Productie (orders, printen, verzenden, geld) en Website (pr3nt.nl zelf).
// Bovenin wissel je tussen de twee; links en onderin (mobiel) staat alleen het menu van de omgeving waar je bent.

const icons = {
  orders: '<path d="M4 5h16M4 12h16M4 19h10"/>',
  work: '<path d="M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>',
  ship: '<path d="M3 7h11v9H3zM14 10h4l3 3v3h-7"/><circle cx="7" cy="18" r="1.6"/><circle cx="17" cy="18" r="1.6"/>',
  filament: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/>',
  home: '<path d="M4 11l8-6 8 6v8H4z"/>',
  pages: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5"/>',
  shop: '<path d="M4 8h16l-1 12H5z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>',
  mail: '<path d="M3 6h18v12H3z"/><path d="M3 7l9 6 9-6"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
};
const icon = (name) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.orders}</svg>`;

// Deze schermen horen bij de website; de rest (ook Producenten) bij productie.
const websiteKeys = new Set(['cms', 'cms-stats', 'cms-mail', 'cms-pages', 'cms-articles', 'cms-shop', 'cms-unpaid', 'cms-media', 'cms-seo', 'cms-customers', 'cms-messages', 'cms-settings']);
export const environmentOf = (active = '') => (websiteKeys.has(active) ? 'website' : 'production');

function navGroups(user, env, counts = {}) {
  // Producenten hebben hun eigen menu: overzicht, productie, geld, cijfers, filament en account.
  if (isProducer(user)) {
    return [['', [
      ['p-home', '/admin/work/overzicht', 'Overzicht', 0, 'home'],
      ['work', '/admin/work', 'Productie', counts.work, 'work'],
      ['p-pay', '/admin/work/vergoeding', 'Vergoeding', 0, 'money'],
      ['p-stats', '/admin/work/statistieken', 'Statistieken'],
      ['p-filament', '/admin/work/filament', 'Filament', 0, 'filament'],
      ['p-account', '/admin/work/account', 'Account'],
    ]]];
  }
  if (env === 'website' && isAdmin(user)) {
    return [
      ['', [['cms', '/admin/website', 'Overzicht', 0, 'home'], ['cms-stats', '/admin/website/statistieken', 'Statistieken']]],
      ['Inhoud', [['cms-pages', '/admin/website/paginas', 'Pagina’s', 0, 'pages'], ['cms-articles', '/admin/website/kennisbank', 'Kennisbank'], ['cms-media', '/admin/website/media', 'Foto’s'], ['cms-seo', '/admin/website/seo', 'SEO']]],
      ['Webshop', [['cms-shop', '/admin/website/producten', 'Producten', 0, 'shop'], ['cms-unpaid', '/admin/website/niet-betaald', 'Niet betaald'], ['cms-customers', '/admin/website/klanten', 'Klanten']]],
      ['Contact', [['cms-messages', '/admin/website/berichten', 'Berichten', 0, 'mail'], ['cms-mail', '/admin/website/nieuwsbrief', 'Nieuwsbrief']]],
      ['', [['cms-settings', '/admin/website/instellingen', 'Instellingen']]],
    ];
  }
  const work = [
    ['orders', '/admin', 'Orders', counts.orders, 'orders'],
    ['work', '/admin/work', 'Productie', counts.work, 'work'],
    ['ship', '/admin/verzenden', 'Verzenden', counts.ship, 'ship'],
    ['filament', '/admin/filament', 'Filament', counts.filament, 'filament'],
  ].filter(([key]) => isAdmin(user) || !['orders', 'ship'].includes(key));
  const manage = isAdmin(user) ? [
    ['cms-producers', '/admin/website/producenten', 'Producenten'],
    ['payouts', '/admin/uitbetalen', 'Uitbetalen', 0, 'money'],
    ['stats', '/admin/work/stats', 'Cijfers'],
    ['options', '/admin/work/options', 'Instellingen'],
  ] : [];
  return [['', work], ...(manage.length ? [['Beheer', manage]] : [])];
}

function navLink([key, href, label, count], active) {
  const badge = count ? `<span class="nav-count">${count}</span>` : '';
  return `<a href="${href}" class="nav-link nav-${key}"${active === key ? ' aria-current="page"' : ''}><span>${label}</span>${badge}</a>`;
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

function homeHref(user) {
  return isAdmin(user) ? '/admin' : isProducer(user) ? '/admin/work/overzicht' : '/admin/work';
}

function topbar(user, env) {
  const named = displayName(user);
  const name = named || (isAdmin(user) ? 'Beheerder' : 'Productie');
  const role = isAdmin(user) ? 'Admin' : isProducer(user) ? 'Producent' : 'Medewerker';
  const switcher = isAdmin(user)
    ? `<nav class="env-switch" aria-label="Omgeving"><a href="/admin" class="env-production"${env === 'production' ? ' aria-current="true"' : ''}>Productie</a><a href="/admin/website" class="env-website"${env === 'website' ? ' aria-current="true"' : ''}>Website</a></nav>`
    : `<span class="env-role">${isProducer(user) ? 'Producent' : 'Werkplaats'}</span>`;
  const site = env === 'website' ? '<a class="btn btn-sm btn-top d-none d-md-inline-flex" href="https://pr3nt.nl" target="_blank" rel="noopener">pr3nt.nl bekijken</a>' : '';
  return `<header class="admin-top" data-bs-theme="dark"><div class="admin-top-in">${logo(homeHref(user))}${switcher}<div class="admin-top-end">${site}<div class="dropdown"><button class="user-btn" type="button" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Account"><span class="avatar" aria-hidden="true">${e(named ? initials(named) : '3')}</span><span class="d-none d-md-inline">${e(name)}</span></button><div class="dropdown-menu dropdown-menu-end shadow-sm" data-bs-theme="light"><div class="dropdown-header"><strong>${e(name)}</strong><br><small>${role}</small></div><div class="dropdown-divider"></div><form method="post" action="/admin/logout"><button class="dropdown-item" type="submit">Uitloggen</button></form></div></div></div></div></header>`;
}

function sidebar(user, active, env, groups, context = {}) {
  const nav = groups.map(([title, items]) => `${title ? `<span class="label">${title}</span>` : '<span class="nav-gap" aria-hidden="true"></span>'}${items.map((item) => navLink(item, active)).join('')}`).join('');
  const printers = env === 'production' ? printersNow(context.printers || []) : '';
  return `<aside class="side offcanvas-lg offcanvas-start" id="admin-menu" tabindex="-1" aria-label="Menu"><div class="offcanvas-header d-lg-none"><strong>${env === 'website' ? 'Website' : 'Menu'}</strong><button type="button" class="btn-close" data-bs-dismiss="offcanvas" data-bs-target="#admin-menu" aria-label="Sluiten"></button></div><div class="side-body"><nav class="side-nav" aria-label="Beheer" data-live-nav>${nav}</nav>${printers}</div></aside>`;
}

// Onderbalk op de telefoon: de vier belangrijkste plekken plus het volledige menu.
function bottomNav(groups, active) {
  const items = groups.flatMap(([, list]) => list).filter((item) => item[4]).slice(0, 4);
  const links = items.map(([key, href, label, count, ico]) => `<a href="${href}"${active === key ? ' aria-current="page"' : ''}>${icon(ico)}<span>${label}</span>${count ? `<b>${count}</b>` : ''}</a>`).join('');
  return `<nav class="bottom-nav" aria-label="Snel naar" data-live-bottom>${links}<button type="button" data-bs-toggle="offcanvas" data-bs-target="#admin-menu" aria-controls="admin-menu">${icon('menu')}<span>Menu</span></button></nav>`;
}

export function renderAdmin({ title, user, active, body, context = {}, scripts = '' }) {
  const env = isProducer(user) ? 'production' : environmentOf(active);
  const groups = navGroups(user, env, context.counts || {});
  const page = `${topbar(user, env)}<div class="admin env-${env}">${sidebar(user, active, env, groups, context)}<main class="admin-main" id="main">${body}</main></div>${bottomNav(groups, active)}`;
  return renderDocument({ title, bodyClass: `is-admin env-${env}`, body: page, scripts: `<script src="/assets/portal.js?v=${assetVersion}" defer></script><script src="/assets/admin.js?v=${assetVersion}" defer></script>${scripts}` });
}

function forbiddenPage(user) {
  return renderAdmin({ title: 'Geen toegang', user, active: '', body: `${pageHead({ eyebrow: 'Geen toegang', title: 'Deze pagina is voor beheerders', text: 'Je kunt wel bij productie.' })}<div><a class="btn btn-dark" href="/admin/work">Naar productie</a></div>` });
}
