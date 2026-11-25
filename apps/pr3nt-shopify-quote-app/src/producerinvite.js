// Producenten die via pr3nt.nl/producent-worden zijn goedgekeurd, krijgen een account op app.pr3nt.nl.
// Ze krijgen een mail met een link om zelf een wachtwoord te kiezen en komen daarna direct in Productie.
import { randomBytes } from 'node:crypto';
import nodemailer from 'nodemailer';
import { readSettings, updateUsers, passwordHash, setInternalSession } from './myparcel.js';
import { transactionalMailOptions } from './mailutils.js';
import { e, renderDocument, logo } from './ui/layout.js';

const baseUrl = () => String(process.env.APP_BASE_URL || 'https://app.pr3nt.nl').replace(/\/$/, '');
const inviteDays = 14;

function clean(value = '', max = 160) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, max); }

// Bedrijfsnaam uit een aanmelding: de website gebruikt Nederlandse of Engelse veldnamen.
export function companyFromApplication(data = {}) {
  const key = Object.keys(data).find((name) => /bedrijf|company|onderneming|handelsnaam/i.test(name));
  return clean(key ? data[key] : '', 120);
}

// Maakt (of ververst) een producent-account en geeft de uitnodigingslink terug.
export async function inviteProducer({ email, name, company = '' }) {
  const address = clean(email, 160).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(address)) throw new Error('Geen geldig e-mailadres bij deze producent.');
  const token = randomBytes(24).toString('base64url');
  const expires = new Date(Date.now() + inviteDays * 86400000).toISOString();
  let account;
  await updateUsers((users) => {
    account = users.find((user) => user.username === address || (user.email || '').toLowerCase() === address);
    if (account && account.role !== 'producer') throw new Error(`${address} heeft al een account als ${account.role === 'admin' ? 'admin' : 'medewerker'}.`);
    if (!account) { account = { username: address, role: 'producer', passwordHash: '' }; users.push(account); }
    account.name = clean(name, 120) || account.name || address;
    account.email = address;
    if (company) account.company = company;
    account.source = 'website';
    account.inviteToken = token;
    account.inviteExpires = expires;
    return users;
  });
  return { link: `${baseUrl()}/producent/welkom/${token}`, account, hasPassword: Boolean(account.passwordHash) };
}

async function findInvite(token) {
  if (!token || token.length < 20) return null;
  const settings = await readSettings();
  const account = settings.users.find((user) => user.inviteToken && user.inviteToken === token);
  if (!account || account.role !== 'producer') return null;
  if (account.inviteExpires && account.inviteExpires < new Date().toISOString()) return null;
  return account;
}

function mailer() {
  return nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.transip.email', port: Number(process.env.SMTP_PORT || 465), secure: String(process.env.SMTP_SECURE || 'true') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}

export async function sendInviteMail({ account, link, hasPassword }) {
  const first = String(account.name || '').split(/\s+/)[0] || 'daar';
  const html = `<div style="margin:0;padding:0;background:#F7F4EF;font-family:Inter,Arial,sans-serif;color:#101820"><div style="max-width:560px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border-radius:20px;padding:28px;border:1px solid #e9e4dc">
<p style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#00A86B;margin:0 0 6px">Pr3nt producenten</p>
<h1 style="font-size:24px;margin:0 0 14px">Welkom, ${e(first)}!</h1>
<p style="line-height:1.6">Je aanmelding als producent is goedgekeurd. Al je orders lopen via <strong>app.pr3nt.nl</strong>: daar zie je nieuwe orders (je krijgt er ook een mail van), accepteer je wat je wilt printen en download je de bestanden. Per order zie je vooraf wat je eraan verdient. Het verzendlabel maakt Pr3nt; jij print het, plakt het op het pakket en brengt het weg.</p>
<p style="line-height:1.6">Vul na het inloggen bij Account je IBAN in, dan kunnen we je uitbetalen.</p>
<p style="line-height:1.6">${hasPassword ? 'Je had al een account. Met de knop hieronder stel je een nieuw wachtwoord in.' : 'Kies eerst je wachtwoord. Daarna kom je meteen in je omgeving.'}</p>
<p style="margin:24px 0"><a href="${e(link)}" style="display:inline-block;background:#101820;color:#fff;text-decoration:none;padding:13px 20px;border-radius:12px;font-weight:600">${hasPassword ? 'Nieuw wachtwoord kiezen' : 'Wachtwoord kiezen en starten'}</a></p>
<p style="line-height:1.6;color:#5b6470;font-size:14px">Inloggen doe je later met je e-mailadres (${e(account.email)}) op ${e(baseUrl())}/admin/login. De link is ${inviteDays} dagen geldig.</p>
</div></div></div>`;
  await mailer().sendMail(transactionalMailOptions({ to: account.email, subject: 'Welkom als producent bij Pr3nt', html }));
}

function page(title, inner) {
  return renderDocument({ title, bodyClass: 'is-admin', body: `<main class="invite-page" style="min-height:100vh;display:grid;place-items:center;padding:24px 16px"><section class="panel" style="width:100%;max-width:440px"><div class="panel-body" style="display:grid;gap:14px">${logo('')}${inner}</div></section></main>` });
}

function formPage(account, token, error = '') {
  return page('Welkom bij Pr3nt', `<div><span class="label">Producent</span><h1 style="margin:4px 0 6px">Welkom, ${e(String(account.name || '').split(/\s+/)[0] || 'producent')}</h1><p class="muted">Kies een wachtwoord. Je logt voortaan in met <strong>${e(account.email || account.username)}</strong>.</p></div>${error ? `<p class="callout warn">${e(error)}</p>` : ''}<form method="post" action="/producent/welkom/${e(token)}" class="form" style="display:grid;gap:12px"><label class="field"><span>Wachtwoord <small>(minimaal 10 tekens)</small></span><input type="password" name="password" minlength="10" required autocomplete="new-password"></label><label class="field"><span>Nog een keer</span><input type="password" name="again" minlength="10" required autocomplete="new-password"></label><button class="btn btn-dark" type="submit">Opslaan en naar mijn orders</button></form>`);
}

const expiredPage = () => page('Link verlopen', '<h1 style="margin:0">Deze link werkt niet meer</h1><p class="muted">De link is al gebruikt of verlopen. Vraag Pr3nt om een nieuwe uitnodiging, of log in als je al een wachtwoord hebt.</p><a class="btn btn-dark" href="/admin/login">Naar inloggen</a>');

export function registerProducerInviteRoutes(app) {
  app.get('/producent/welkom/:token', async (req, res) => {
    const account = await findInvite(req.params.token);
    if (!account) return res.status(404).send(expiredPage());
    res.send(formPage(account, req.params.token));
  });

  app.post('/producent/welkom/:token', async (req, res) => {
    const account = await findInvite(req.params.token);
    if (!account) return res.status(404).send(expiredPage());
    const password = String(req.body?.password || '');
    if (password.length < 10) return res.status(400).send(formPage(account, req.params.token, 'Kies een wachtwoord van minimaal 10 tekens.'));
    if (password !== String(req.body?.again || '')) return res.status(400).send(formPage(account, req.params.token, 'De twee wachtwoorden zijn niet hetzelfde.'));
    await updateUsers((users) => users.map((user) => (user.username === account.username ? { ...user, passwordHash: passwordHash(password), inviteToken: '', inviteExpires: '' } : user)));
    setInternalSession(res, { username: account.username, name: account.name || account.username, role: 'producer' });
    res.redirect('/admin/work/overzicht');
  });
}
