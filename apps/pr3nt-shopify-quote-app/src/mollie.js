import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';

function e(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function amountValue(value) {
  return money(value).toFixed(2);
}

function list(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function quoteTotalFromBody(body = {}) {
  const labels = list(body.lineLabel);
  const qtys = list(body.lineQty);
  const units = list(body.lineUnit);
  const descriptions = list(body.lineDescription);
  return labels.reduce((sum, label, index) => {
    const unit = money(units[index] || 0);
    if (!label && !descriptions[index] && unit <= 0) return sum;
    return sum + money(qtys[index] || 1) * unit;
  }, 0);
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

function ensurePortalToken(quote) {
  if (!quote.portalToken) quote.portalToken = randomUUID();
  return quote.portalToken;
}

function mollieHeaders() {
  const apiKey = process.env.MOLLIE_API_KEY || '';
  if (!apiKey) throw new Error('MOLLIE_API_KEY ontbreekt.');
  return { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' };
}

function normalizePaymentMethod(method = '') {
  const normalized = String(method).trim().toLowerCase();
  if (normalized === 'bankcontact') return 'bancontact';
  return normalized;
}

function configuredAllowedMethods() {
  const raw = String(process.env.MOLLIE_ALLOWED_METHODS || 'ideal,bancontact').trim();
  const methods = raw.split(',').map(normalizePaymentMethod).filter(Boolean);
  return methods.length ? [...new Set(methods)] : ['ideal', 'bancontact'];
}

function paymentLinkUrl(body) {
  return body?._links?.paymentUrl?.href || body?._links?.checkout?.href || body?.paymentUrl || '';
}

function paymentLinkPayload(quote, amount) {
  const token = encodeURIComponent(ensurePortalToken(quote));
  return {
    description: `Pr3nt offerte ${quote.id}`.slice(0, 255),
    amount: { currency: 'EUR', value: amount },
    reusable: false,
    redirectUrl: `${baseUrl}/portal/${token}?saved=Betaling%20wordt%20verwerkt`,
    webhookUrl: `${baseUrl}/api/mollie/webhook`,
    allowedMethods: configuredAllowedMethods(),
  };
}

async function postPaymentLink(payload) {
  const response = await fetch('https://api.mollie.com/v2/payment-links', {
    method: 'POST',
    headers: mollieHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

async function createPaymentLink(quote, amount) {
  const payload = paymentLinkPayload(quote, amount);
  const result = await postPaymentLink(payload);
  if (!result.response.ok) throw new Error(`Mollie betaallink kon niet worden aangemaakt: ${JSON.stringify(result.body)}`);
  const url = paymentLinkUrl(result.body);
  if (!url) throw new Error('Mollie gaf geen paymentUrl terug.');
  return {
    molliePaymentLinkId: result.body.id || '',
    molliePaymentUrl: url,
    molliePaymentStatus: result.body.status || 'open',
    molliePaymentAmount: amount,
    molliePaymentCreatedAt: new Date().toISOString(),
  };
}

function extractPaymentLinkId(payment) {
  const direct = payment?.paymentLinkId || payment?.paymentLink?.id || '';
  if (direct) return direct;
  const href = payment?._links?.paymentLink?.href || payment?._links?.paymentlink?.href || '';
  return href.match(/payment-links\/([^/?#]+)/)?.[1] || '';
}

function extractQuoteId(payment) {
  return String(payment?.description || '').match(/Pr3nt offerte\s+(quote-[a-zA-Z0-9_-]+)/)?.[1] || '';
}

async function getMolliePayment(paymentId) {
  const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, { headers: mollieHeaders() });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mollie betaling ophalen mislukt: ${JSON.stringify(body)}`);
  return body;
}

function messageExists(quote, text) {
  return Array.isArray(quote.messages) && quote.messages.some((message) => String(message.text || '').includes(text));
}

function paymentUrl(quote) {
  return quote?.molliePaymentUrl || quote?.paymentUrl || '';
}

function adminPaymentInfoHtml(quote) {
  const url = paymentUrl(quote);
  if (url) return `<div class="info-card"><small>Mollie betaallink</small><strong><a href="${e(url)}" target="_blank" rel="noopener">Open betaallink</a></strong><span class="muted">De betaallink wordt automatisch aangemaakt op basis van de offerte-regels.</span></div>`;
  return '<div class="info-card"><small>Mollie betaallink</small><strong>Automatisch</strong><span class="muted">Vul offerte-regels in en sla op. De Mollie-link wordt automatisch aangemaakt.</span></div>';
}

function removeManualPaymentField(html, quote) {
  return html.replace(/<label><span>Shopify betaallink<\/span><input name="paymentUrl" value="[^"]*"><\/label>/, adminPaymentInfoHtml(quote));
}

export function registerMollieRoutes(app) {
  app.use('/admin/quotes/:id', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const quote = (await readQuotes()).find((item) => item.id === req.params.id && !item.archivedAt);
        return originalSend(quote ? removeManualPaymentField(body, quote) : body);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });

  app.use('/admin/quotes/:id', async (req, _res, next) => {
    if (req.method !== 'POST' || !process.env.MOLLIE_API_KEY || req.body?.paymentUrl) return next();
    try {
      const quotes = await readQuotes();
      const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
      if (!quote || quote.paidAt || quote.status === 'paid') return next();
      const amount = amountValue(quoteTotalFromBody(req.body));
      if (money(amount) <= 0) return next();
      const now = new Date().toISOString();
      if (quote.molliePaymentUrl && quote.molliePaymentAmount === amount && quote.molliePaymentStatus !== 'paid') {
        req.body.paymentUrl = quote.molliePaymentUrl;
        if (!quote.quoteSentAt) {
          quote.quoteSentAt = now;
          await writeQuotes(quotes);
        }
        return next();
      }
      const paymentLink = await createPaymentLink(quote, amount);
      Object.assign(quote, {
        paymentUrl: paymentLink.molliePaymentUrl,
        molliePaymentLinkId: paymentLink.molliePaymentLinkId,
        molliePaymentUrl: paymentLink.molliePaymentUrl,
        molliePaymentStatus: paymentLink.molliePaymentStatus,
        molliePaymentAmount: paymentLink.molliePaymentAmount,
        molliePaymentCreatedAt: paymentLink.molliePaymentCreatedAt,
        quoteSentAt: quote.quoteSentAt || now,
        updatedAt: now,
      });
      quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
      if (!messageExists(quote, 'Mollie-betaallink aangemaakt')) quote.messages.push({ from: 'pr3nt', text: 'Mollie-betaallink aangemaakt.', createdAt: now });
      await writeQuotes(quotes);
      req.body.paymentUrl = paymentLink.molliePaymentUrl;
    } catch (error) {
      console.warn('Mollie betaallink kon niet automatisch worden aangemaakt:', error.message);
    }
    return next();
  });

  app.post('/api/mollie/webhook', async (req, res) => {
    try {
      const paymentId = req.body?.id || req.query?.id;
      if (!paymentId || !process.env.MOLLIE_API_KEY) return res.status(200).send('OK');
      const payment = await getMolliePayment(paymentId);
      const quoteId = extractQuoteId(payment);
      const paymentLinkId = extractPaymentLinkId(payment);
      const quotes = await readQuotes();
      const quote = quotes.find((item) => !item.archivedAt && ((quoteId && item.id === quoteId) || (paymentLinkId && item.molliePaymentLinkId === paymentLinkId)));
      if (!quote) return res.status(200).send('OK');
      const now = new Date().toISOString();
      quote.molliePaymentId = payment.id || paymentId;
      quote.molliePaymentStatus = payment.status || quote.molliePaymentStatus || 'open';
      quote.molliePaymentMethod = payment.method || quote.molliePaymentMethod || '';
      quote.molliePaymentUpdatedAt = now;
      if (payment.status === 'paid') {
        quote.status = 'paid';
        quote.paidAt = payment.paidAt || now;
        quote.molliePaymentPaidAt = payment.paidAt || now;
        quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
        if (!messageExists(quote, 'Betaling ontvangen via Mollie')) quote.messages.push({ from: 'pr3nt', text: 'Betaling ontvangen via Mollie.', createdAt: quote.paidAt });
      }
      await writeQuotes(quotes);
    } catch (error) {
      console.warn('Mollie webhook kon niet worden verwerkt:', error.message);
    }
    return res.status(200).send('OK');
  });
}
