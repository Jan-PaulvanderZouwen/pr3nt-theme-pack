import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { registerPortalFileCarouselRoutes } from './portalfilecarousel.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';

const labels = {
  received: 'Aanvraag ontvangen',
  creating_quote: 'Prijs wordt berekend',
  quote_sent: 'Prijsopgaaf klaar',
  accepted: 'Prijsopgaaf akkoord',
  paid: 'Betaling ontvangen',
  print_queue: 'Je print is in productie',
  ready_to_ship: 'Je print is klaar voor verzending',
  shipped: 'Je print is verzonden',
  delivered: 'Je print is geleverd',
};

const messages = {
  creating_quote: 'We bekijken je bestand en berekenen de prijs. Verzending nemen we automatisch mee in de prijsopgaaf.',
  quote_sent: 'Je prijsopgaaf staat klaar in je klantportaal. Je kunt hem daar bekijken en akkoord geven.',
  accepted: 'Je prijsopgaaf is akkoord. We zetten de Shopify-betaallink voor je klaar.',
  paid: 'We hebben je betaling ontvangen. Je print wordt nu ingepland.',
  print_queue: 'Je print staat in de wachtrij of is in productie.',
  ready_to_ship: 'Je print is klaar en wordt voorbereid voor verzending.',
  shipped: 'Je pakket is verzonden. De track & trace staat in je klantportaal.',
  delivered: 'Je print is geleverd. We horen graag of alles naar wens is.',
};

function e(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

async function readQuotes() {
  try {
    const quotes = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    return Array.isArray(quotes) ? quotes : [];
  } catch {
    return [];
  }
}

function findQuote(quotes, id) {
  return quotes.find((quote) => quote.id === id);
}

function portalUrl(quote) {
  return `${baseUrl}/portal/${encodeURIComponent(quote.portalToken || quote.id)}`;
}

function mailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.transip.email',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function html(quote, title, message, cta = 'Open mijn klantportaal') {
  const url = portalUrl(quote);
  const tracking = quote.status === 'shipped' && quote.trackingCode ? `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:14px;margin:18px 0"><strong>Track & trace</strong><br>${e(quote.trackingCode)}</div>` : '';
  return `<div style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,sans-serif;color:#101820"><div style="max-width:640px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden"><div style="padding:28px;background:#101820;color:#fff"><div style="font-size:24px;font-weight:900">pr3nt.nl</div><h1 style="margin:22px 0 8px;font-size:30px;line-height:1.08">${e(title)}</h1><p style="margin:0;color:#d7dde0">Project ${e(quote.id)}</p></div><div style="padding:28px"><p>Hoi ${e(quote.name || '')},</p><p style="line-height:1.6">${e(message)}</p>${tracking}<p style="margin:24px 0"><a href="${url}" style="display:inline-block;background:#00d084;color:#082115;text-decoration:none;padding:14px 20px;border-radius:999px;font-weight:800">${e(cta)}</a></p><p style="font-size:14px;color:#667085;line-height:1.5">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${url}</span></p><p>Groet,<br><strong>pr3nt.nl</strong></p></div></div></div></div>`;
}

async function sendCustomerMail(quote, title, message, cta) {
  if (!quote?.email) return;
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  await mailer().sendMail({
    from,
    to: quote.email,
    subject: `${title} · pr3nt.nl`,
    html: html(quote, title, message, cta),
  });
}

function sendLater(quote, title, message, cta) {
  Promise.resolve().then(() => sendCustomerMail(quote, title, message, cta)).catch((error) => console.warn('Statusmail kon niet worden verzonden:', error.message));
}

export function registerStatusMailRoutes(app) {
  registerPortalFileCarouselRoutes(app);

  app.use('/admin/quotes/:id', async (req, res, next) => {
    if (req.method !== 'POST') return next();
    const before = findQuote(await readQuotes(), req.params.id);
    const originalRedirect = res.redirect.bind(res);
    res.redirect = function patchedRedirect(...args) {
      Promise.resolve().then(async () => {
        const after = findQuote(await readQuotes(), req.params.id);
        if (!after || after.archivedAt) return;
        const oldStatus = before?.status || '';
        const newStatus = after.status || '';
        const paymentAdded = !before?.paymentUrl && after.paymentUrl;
        if (paymentAdded) {
          sendLater(after, 'Je kunt je 3D-print betalen', 'De betaallink staat klaar in je klantportaal. Verzending is inbegrepen in de prijsopgaaf.', 'Nu betalen');
          return;
        }
        if (oldStatus !== newStatus && messages[newStatus]) {
          const cta = newStatus === 'quote_sent' ? 'Prijsopgaaf bekijken' : newStatus === 'shipped' ? 'Bekijk verzending' : 'Open mijn klantportaal';
          sendLater(after, labels[newStatus] || 'Status bijgewerkt', messages[newStatus], cta);
        }
      }).catch((error) => console.warn('Statusmail middleware fout:', error.message));
      return originalRedirect(...args);
    };
    next();
  });
}
