import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

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

export function registerQuoteCheckoutRoutes(app) {
  app.post('/portal/:token/accept', async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => !item.archivedAt && (item.portalToken === req.params.token || item.id === req.params.token));
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');

    const now = new Date().toISOString();
    if (!quote.acceptedAt) quote.acceptedAt = now;
    quote.status = 'accepted';
    quote.acceptance = {
      method: quote.paymentUrl ? 'portal_accept_and_pay' : 'portal_accept_button',
      acceptedAt: quote.acceptedAt,
      ip: req.ip || req.get('x-forwarded-for') || '',
      userAgent: req.get('user-agent') || '',
      referer: req.get('referer') || '',
    };
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    if (!quote.messages.some((message) => String(message.text || '').includes('Ik ga akkoord met de offerte'))) {
      quote.messages.push({ from: 'klant', text: quote.paymentUrl ? 'Ik ga akkoord met de offerte en ga door naar betalen.' : 'Ik ga akkoord met de offerte.', createdAt: now });
    }
    await writeQuotes(quotes);

    if (quote.paymentUrl) return res.redirect(quote.paymentUrl);
    return res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Offerte%20akkoord%20gegeven`);
  });
}
