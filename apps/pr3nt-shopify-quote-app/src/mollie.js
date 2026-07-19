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

function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function amountValue(value) {
  return money(value).toFixed(2);
}

function normalizeList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [value];
}

function quoteTotalFromBody(body = {}) {
  const labels = normalizeList(body.lineLabel);
  const qtys = normalizeList(body.lineQty);
  const units = normalizeList(body.lineUnit);
  const descriptions = normalizeList(body.lineDescription);
  return labels.reduce((sum, label, index) => {
    const unit = money(units[index] || 0);
    const hasContent = label || descriptions[index] || unit > 0;
    if (!hasContent) return sum;
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
  return {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
}

function allowedMethods() {
  const configured = String(process.env.MOLLIE_ALLOWED_METHODS || 'ideal,bancontact,creditcard,paypal')
    .split(',')
    .map((method) => method.trim())
    .filter(Boolean);
  return configured.length ? configured : undefined;
}

function paymentLinkUrl(paymentLink) {
  return paymentLink?._links?.paymentUrl?.href || paymentLink?._links?.checkout?.href || paymentLink?.paymentUrl || '';
}

async function createMolliePaymentLink(quote, amount) {
  const token = encodeURIComponent(ensurePortalToken(quote));
  const response = await fetch('https://api.mollie.com/v2/payment-links', {
    method: 'POST',
    headers: mollieHeaders(),
    body: JSON.stringify({
      description: `Pr3nt offerte ${quote.id}`.slice(0, 255),
      amount: {
        currency: 'EUR',
        value: amount,
      },
      reusable: false,
      redirectUrl: `${baseUrl}/portal/${token}?saved=Betaling%20wordt%20verwerkt`,
      webhookUrl: `${baseUrl}/api/mollie/webhook`,
      allowedMethods: allowedMethods(),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mollie betaallink kon niet worden aangemaakt: ${JSON.stringify(body)}`);

  const url = paymentLinkUrl(body);
  if (!url) throw new Error('Mollie gaf geen paymentUrl terug.');

  return {
    molliePaymentLinkId: body.id || '',
    molliePaymentUrl: url,
    molliePaymentStatus: body.status || 'open',
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
  const metadata = payment?.metadata;
  if (metadata?.quoteId) return metadata.quoteId;
  const description = String(payment?.description || '');
  return description.match(/Pr3nt offerte\s+(quote-[a-zA-Z0-9_-]+)/)?.[1] || '';
}

async function getMolliePayment(paymentId) {
  const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`, {
    headers: mollieHeaders(),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`Mollie betaling ophalen mislukt: ${JSON.stringify(body)}`);
  return body;
}

function messageExists(quote, text) {
  return Array.isArray(quote.messages) && quote.messages.some((message) => String(message.text || '').includes(text));
}

export function registerMollieRoutes(app) {
  app.use('/admin/quotes/:id', async (req, _res, next) => {
    if (req.method !== 'POST') return next();
    if (!process.env.MOLLIE_API_KEY) return next();
    if (req.body?.paymentUrl) return next();

    try {
      const quotes = await readQuotes();
      const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
      if (!quote || quote.paidAt || quote.status === 'paid') return next();

      const amount = amountValue(quoteTotalFromBody(req.body));
      if (money(amount) <= 0) return next();

      if (quote.molliePaymentUrl && quote.molliePaymentAmount === amount && quote.molliePaymentStatus !== 'paid') {
        req.body.paymentUrl = quote.molliePaymentUrl;
        return next();
      }

      const paymentLink = await createMolliePaymentLink(quote, amount);
      const now = new Date().toISOString();
      quote.paymentUrl = paymentLink.molliePaymentUrl;
      quote.molliePaymentLinkId = paymentLink.molliePaymentLinkId;
      quote.molliePaymentUrl = paymentLink.molliePaymentUrl;
      quote.molliePaymentStatus = paymentLink.molliePaymentStatus;
      quote.molliePaymentAmount = paymentLink.molliePaymentAmount;
      quote.molliePaymentCreatedAt = paymentLink.molliePaymentCreatedAt;
      quote.updatedAt = now;
      quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
      if (!messageExists(quote, 'Mollie-betaallink aangemaakt')) {
        quote.messages.push({ from: 'pr3nt', text: 'Mollie-betaallink aangemaakt.', createdAt: now });
      }
      await writeQuotes(quotes);
      req.body.paymentUrl = paymentLink.molliePaymentUrl;
      return next();
    } catch (error) {
      console.warn('Mollie betaallink kon niet automatisch worden aangemaakt:', error.message);
      return next();
    }
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
        if (!messageExists(quote, 'Betaling ontvangen via Mollie')) {
          quote.messages.push({ from: 'pr3nt', text: 'Betaling ontvangen via Mollie.', createdAt: quote.paidAt });
        }
      }

      await writeQuotes(quotes);
      return res.status(200).send('OK');
    } catch (error) {
      console.warn('Mollie webhook kon niet worden verwerkt:', error.message);
      return res.status(200).send('OK');
    }
  });
}
