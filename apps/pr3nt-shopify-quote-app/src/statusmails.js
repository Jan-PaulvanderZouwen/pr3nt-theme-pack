import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import nodemailer from 'nodemailer';
import { registerPortalFileCarouselRoutes } from './portalfilecarousel.js';
import { registerShippingAddressRoutes } from './shippingaddress.js';
import { registerPortalMobileRoutes } from './portalmobile.js';
import { registerPortalCheckoutCopyRoutes } from './portalcheckoutcopy.js';
import { exportQuoteDesigns } from './designsync.js';
import { fmt, money, quoteLines, quoteSubtotalExVat, quoteVatAmount, quoteTotalInclVat, vatRatePercent } from './vat.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const uploadDir = path.resolve(appRoot, process.env.UPLOAD_DIR || 'uploads/quotes');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';

const labels = {
  received: 'Aanvraag ontvangen',
  creating_quote: 'Prijs wordt berekend',
  quote_sent: 'Prijsopgaaf klaar',
  waiting_customer: 'Wacht op klantreactie',
  paid: 'Betaling ontvangen',
  print_queue: 'Je print is in productie',
  ready_to_ship: 'Je print is klaar voor verzending',
  shipped: 'Je print is verzonden',
  delivered: 'Je print is geleverd',
};

const messages = {
  creating_quote: 'We bekijken je bestand en berekenen de prijs. Verzending nemen we mee in de prijsopgaaf.',
  quote_sent: 'We hebben je 3D-print aanvraag bekeken. Hieronder staat je prijsopgaaf met het totaalbedrag inclusief 21% btw. Via de knop onderaan kun je veilig betalen via Mollie.',
  waiting_customer: 'We wachten nog op je reactie voordat we verder kunnen.',
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

async function writeQuotes(quotes) {
  await writeFile(quotesFilePath, JSON.stringify(quotes, null, 2));
}

function findQuote(quotes, id) {
  return quotes.find((quote) => quote.id === id);
}

function findQuoteByToken(quotes, token) {
  return quotes.find((quote) => !quote.archivedAt && (quote.portalToken === token || quote.id === token));
}

function portalUrl(quote) {
  return `${baseUrl}/portal/${encodeURIComponent(quote.portalToken || quote.id)}`;
}

function paymentUrl(quote) {
  return quote.paymentUrl || quote.molliePaymentUrl || '';
}

function mailer() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.transip.email',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

function quoteRowsHtml(quote) {
  const rows = quoteLines(quote).map((line) => {
    const lineTotal = money(line.qty || 1) * money(line.unit || 0);
    return `<tr><td style="padding:10px;border-bottom:1px solid #e5e7eb"><strong>${e(line.label || 'Regel')}</strong>${line.description ? `<br><span style="color:#667085">${e(line.description)}</span>` : ''}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">${e(line.qty || 1)}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right">€ ${fmt(line.unit)}</td><td style="padding:10px;border-bottom:1px solid #e5e7eb;text-align:right"><strong>€ ${fmt(lineTotal)}</strong></td></tr>`;
  }).join('');
  return rows || '<tr><td colspan="4" style="padding:12px;color:#667085">De offerte-regels konden niet worden geladen. Bekijk je prijsopgaaf in het klantportaal.</td></tr>';
}

function vatRowsHtml(quote) {
  return `<tr><td colspan="3" style="padding:10px;text-align:right;color:#667085">Subtotaal excl. btw</td><td style="padding:10px;text-align:right">€ ${fmt(quoteSubtotalExVat(quote))}</td></tr><tr><td colspan="3" style="padding:10px;text-align:right;color:#667085">Btw ${fmt(vatRatePercent())}%</td><td style="padding:10px;text-align:right">€ ${fmt(quoteVatAmount(quote))}</td></tr><tr><td colspan="3" style="padding:12px;text-align:right;font-weight:900;border-top:1px solid #e5e7eb">Totaal incl. btw</td><td style="padding:12px;text-align:right;font-weight:900;border-top:1px solid #e5e7eb">€ ${fmt(quoteTotalInclVat(quote))}</td></tr>`;
}

function quoteSummaryHtml(quote) {
  if (quote.status !== 'quote_sent' || quote.manualStatus === 'waiting_customer') return '';
  return `<table style="width:100%;border-collapse:collapse;margin:18px 0"><thead><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #e5e7eb">Omschrijving</th><th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb">Aantal</th><th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb">Prijs excl. btw</th><th style="text-align:right;padding:10px;border-bottom:1px solid #e5e7eb">Totaal excl. btw</th></tr></thead><tbody>${quoteRowsHtml(quote)}</tbody><tfoot>${vatRowsHtml(quote)}</tfoot></table>`;
}

function html(quote, title, message, cta = 'Open mijn klantportaal') {
  const payUrl = paymentUrl(quote);
  const useMollieCta = quote.status === 'quote_sent' && payUrl && quote.manualStatus !== 'waiting_customer';
  const url = useMollieCta ? payUrl : portalUrl(quote);
  const ctaText = useMollieCta ? 'betaal veilig via Mollie' : cta;
  const fallbackUrl = useMollieCta ? portalUrl(quote) : url;
  const tracking = quote.status === 'shipped' && quote.trackingCode ? `<div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:14px;margin:18px 0"><strong>Track & trace</strong><br>${e(quote.trackingCode)}</div>` : '';
  const summary = quoteSummaryHtml(quote);
  const portalFallback = useMollieCta ? `<p style="font-size:14px;color:#667085;line-height:1.5">Je klantportaal blijft hier beschikbaar:<br><span style="word-break:break-all">${e(fallbackUrl)}</span></p>` : '';
  return `<div style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,sans-serif;color:#101820"><div style="max-width:680px;margin:0 auto;padding:28px 16px"><div style="background:#fff;border:1px solid #e5e7eb;border-radius:24px;overflow:hidden"><div style="padding:28px;background:#101820;color:#fff"><div style="font-size:24px;font-weight:900">pr3nt.nl</div><h1 style="margin:22px 0 8px;font-size:30px;line-height:1.08">${e(title)}</h1><p style="margin:0;color:#d7dde0">Project ${e(quote.id)}</p></div><div style="padding:28px"><p>Hoi ${e(quote.name || '')},</p><p style="line-height:1.6">${e(message)}</p>${summary}${tracking}<p style="margin:24px 0"><a href="${e(url)}" style="display:inline-block;background:#00d084;color:#082115;text-decoration:none;padding:14px 20px;border-radius:999px;font-weight:800">${e(ctaText)}</a></p><p style="font-size:14px;color:#667085;line-height:1.5">Werkt de knop niet? Kopieer deze link:<br><span style="word-break:break-all">${e(url)}</span></p>${portalFallback}<p>Groet,<br><strong>pr3nt.nl</strong></p></div></div></div></div>`;
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

async function sendQuoteReadyMailIfNeeded(quotes, quote) {
  if (!quote || quote.archivedAt || quote.manualStatus === 'waiting_customer') return false;
  const payUrl = paymentUrl(quote);
  if (quote.status !== 'quote_sent' || quoteSubtotalExVat(quote) <= 0 || !payUrl) return false;
  if (quote.mollieQuoteMailSentAt && quote.mollieQuoteMailSentUrl === payUrl) return false;

  await sendCustomerMail(quote, labels.quote_sent, messages.quote_sent, 'betaal veilig via Mollie');
  const now = new Date().toISOString();
  quote.mollieQuoteMailSentAt = now;
  quote.mollieQuoteMailSentUrl = payUrl;
  quote.quoteSentAt = quote.quoteSentAt || now;
  quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
  if (!quote.messages.some((message) => String(message.text || '').includes('De offerte is verstuurd naar je e-mailadres'))) {
    quote.messages.push({ from: 'pr3nt', text: 'De offerte is verstuurd naar je e-mailadres.', createdAt: now });
  }
  await writeQuotes(quotes);
  return true;
}

function addAcceptanceAudit(quote, req, now) {
  quote.acceptance = {
    method: quote.paymentUrl ? 'portal_accept_and_pay' : 'portal_accept_button',
    acceptedAt: now,
    ip: req.ip || req.get('x-forwarded-for') || '',
    userAgent: req.get('user-agent') || '',
    referer: req.get('referer') || '',
  };
}

function registerDesignExportAfterQuote(app) {
  app.use('/api/quote', (req, res, next) => {
    if (req.method !== 'POST') return next();
    res.on('finish', () => {
      if (res.statusCode < 200 || res.statusCode >= 300) return;
      Promise.resolve().then(async () => {
        const quotes = await readQuotes();
        let changed = false;
        for (const quote of quotes.slice(0, 5)) {
          if (quote.designExport || !Array.isArray(quote.files) || !quote.files.length) continue;
          await exportQuoteDesigns(quote, uploadDir);
          if (quote.designExport) changed = true;
        }
        if (changed) await writeQuotes(quotes);
      }).catch((error) => console.warn('Design export kon niet worden uitgevoerd:', error.message));
    });
    next();
  });
}

export function registerStatusMailRoutes(app) {
  registerDesignExportAfterQuote(app);
  registerPortalFileCarouselRoutes(app);
  registerShippingAddressRoutes(app);
  registerPortalMobileRoutes(app);
  registerPortalCheckoutCopyRoutes(app);

  app.post('/portal/:token/accept', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuoteByToken(quotes, req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');

    const now = new Date().toISOString();
    quote.customerAcceptedAt = quote.customerAcceptedAt || now;
    if (quote.manualStatus === 'waiting_customer') delete quote.manualStatus;
    if (quote.waitingCustomerAt) delete quote.waitingCustomerAt;
    if (quote.status !== 'paid') quote.status = 'quote_sent';
    addAcceptanceAudit(quote, req, now);
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    if (!quote.messages.some((message) => String(message.text || '').includes('Ik ga akkoord met de offerte'))) {
      quote.messages.push({ from: 'klant', text: quote.paymentUrl ? 'Ik ga akkoord met de offerte en ga door naar betalen.' : 'Ik ga akkoord met de offerte.', createdAt: now });
    }
    await writeQuotes(quotes);

    if (quote.paymentUrl) return res.redirect(quote.paymentUrl);
    return res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Reactie%20ontvangen`);
  });

  app.use('/admin/quotes/:id', async (req, res, next) => {
    if (req.method !== 'POST') return next();
    const before = findQuote(await readQuotes(), req.params.id);
    const originalRedirect = res.redirect.bind(res);
    res.redirect = function patchedRedirect(...args) {
      Promise.resolve().then(async () => {
        const quotes = await readQuotes();
        const after = findQuote(quotes, req.params.id);
        if (!after || after.archivedAt) return;

        const quoteMailSent = await sendQuoteReadyMailIfNeeded(quotes, after);
        if (quoteMailSent || after.manualStatus === 'waiting_customer') return;

        const oldStatus = before?.status || '';
        const newStatus = after.status || '';
        if (oldStatus !== newStatus && messages[newStatus]) {
          const cta = newStatus === 'shipped' ? 'Bekijk verzending' : 'Open mijn klantportaal';
          sendLater(after, labels[newStatus] || 'Status bijgewerkt', messages[newStatus], cta);
        }
      }).catch((error) => console.warn('Statusmail middleware fout:', error.message));
      return originalRedirect(...args);
    };
    next();
  });
}
