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
const waitingCustomerStatus = 'waiting_customer';
const waitingCustomerLabel = 'Wacht op klantreactie';

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

function configuredProfileId() {
  return String(process.env.MOLLIE_PROFILE_ID || '').trim();
}

function checkoutUrl(body) {
  return body?._links?.checkout?.href || body?.checkoutUrl || '';
}

function paymentPayload(quote, amount) {
  const token = encodeURIComponent(ensurePortalToken(quote));
  const payload = {
    description: `Pr3nt offerte ${quote.id}`.slice(0, 255),
    amount: { currency: 'EUR', value: amount },
    redirectUrl: `${baseUrl}/portal/${token}?saved=Betaling%20wordt%20verwerkt`,
    webhookUrl: `${baseUrl}/api/mollie/webhook`,
    metadata: { quoteId: quote.id },
  };
  const profileId = configuredProfileId();
  if (profileId) payload.profileId = profileId;
  return payload;
}

async function postPayment(payload) {
  const response = await fetch('https://api.mollie.com/v2/payments', {
    method: 'POST',
    headers: mollieHeaders(),
    body: JSON.stringify(payload),
  });
  const body = await response.json().catch(() => ({}));
  return { response, body };
}

function safePayloadForLog(payload) {
  return {
    amount: payload?.amount,
    profileId: payload?.profileId || '',
    redirectUrl: payload?.redirectUrl || '',
    webhookUrl: payload?.webhookUrl || '',
  };
}

async function createMollieCheckoutPayment(quote, amount) {
  const payload = paymentPayload(quote, amount);
  const result = await postPayment(payload);
  if (!result.response.ok) {
    throw new Error(`Mollie betaling kon niet worden aangemaakt: ${JSON.stringify(result.body)} payload=${JSON.stringify(safePayloadForLog(payload))}`);
  }

  const url = checkoutUrl(result.body);
  if (!url) {
    throw new Error(`Mollie gaf geen checkout-link terug: ${JSON.stringify(result.body)}`);
  }

  return {
    molliePaymentId: result.body.id || '',
    molliePaymentLinkId: '',
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
  return payment?.metadata?.quoteId || String(payment?.description || '').match(/Pr3nt offerte\s+(quote-[a-zA-Z0-9_-]+)/)?.[1] || '';
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
  return quote?.paymentUrl || quote?.molliePaymentUrl || '';
}

function isWaitingCustomer(quote) {
  return quote?.manualStatus === waitingCustomerStatus;
}

function markWaitingCustomer(quote, now) {
  quote.manualStatus = waitingCustomerStatus;
  quote.waitingCustomerAt = quote.waitingCustomerAt || now;
  quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
  if (!messageExists(quote, waitingCustomerLabel)) {
    quote.messages.push({ from: 'pr3nt', text: `${waitingCustomerLabel}: er wordt gewacht op een reactie van de klant.`, createdAt: now });
  }
}

function clearWaitingCustomer(quote) {
  if (quote.manualStatus === waitingCustomerStatus) delete quote.manualStatus;
  if (quote.waitingCustomerAt) delete quote.waitingCustomerAt;
}

function resetQuoteMailForManualLink(quote, manualUrl, now) {
  if (!quote || !manualUrl || manualUrl === paymentUrl(quote)) return false;
  quote.paymentUrl = manualUrl;
  delete quote.mollieQuoteMailSentAt;
  delete quote.quoteSentAt;
  quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
  quote.messages.push({ from: 'pr3nt', text: 'Handmatige betaallink ingesteld. De offertemail kan opnieuw worden verstuurd.', createdAt: now });
  return true;
}

function adminPaymentInfoHtml(quote) {
  const url = paymentUrl(quote);
  const link = url ? `<strong><a href="${e(url)}" target="_blank" rel="noopener">Open huidige betaallink</a></strong>` : '<strong>Automatisch via Mollie</strong>';
  const note = url ? 'De huidige link wordt gebruikt in de mail en het portaal.' : 'Laat dit leeg voor automatisch aanmaken via Mollie.';
  return `<div class="info-card"><small>Betaallink</small>${link}<span class="muted">${note}</span><details style="margin-top:10px"><summary style="cursor:pointer;font-size:13px;color:#6d7175;font-weight:750">Handmatige betaallink gebruiken</summary><label style="display:block;margin-top:10px"><span style="font-size:13px;color:#6d7175">Eigen betaallink / overschrijven</span><input name="paymentUrl" value="${e(quote?.paymentUrl || '')}" placeholder="https://..." autocomplete="off"></label><span class="muted" style="display:block;margin-top:6px;font-size:12px">Alleen invullen als je bewust een eigen betaallink wilt meesturen. Deze link krijgt voorrang op de automatische Mollie-link.</span></details></div>`;
}

function replaceStatusOption(html, quote) {
  const waiting = isWaitingCustomer(quote);
  const quoteSentSelected = quote.status === 'quote_sent' && !waiting ? 'selected' : '';
  const waitingSelected = waiting ? 'selected' : '';
  return html.replace(
    /<option value="quote_sent"[^>]*>Offerte verstuurd<\/option><option value="accepted"[^>]*>Offerte akkoord<\/option>/,
    `<option value="quote_sent" ${quoteSentSelected}>Offerte verstuurd</option><option value="${waitingCustomerStatus}" ${waitingSelected}>${waitingCustomerLabel}</option>`
  );
}

function decorateAdminHtml(html, quote) {
  let output = html.replace(/<label><span>Shopify betaallink<\/span><input name="paymentUrl" value="[^"]*"><\/label>/, adminPaymentInfoHtml(quote));
  output = replaceStatusOption(output, quote);
  if (isWaitingCustomer(quote)) output = output.replace(/<span class="badge">Offerte verstuurd<\/span>/, `<span class="badge">${waitingCustomerLabel}</span>`);
  return output.replace(/Offerte akkoord/g, waitingCustomerLabel).replace(/Prijsopgaaf akkoord/g, waitingCustomerLabel);
}

function decoratePortalHtml(html, quote) {
  let output = html.replace(/Offerte akkoord/g, waitingCustomerLabel).replace(/Prijsopgaaf akkoord/g, waitingCustomerLabel);
  if (!isWaitingCustomer(quote)) return output;
  return output
    .replace(/<h1>Offerte staat klaar<\/h1>/, '<h1>In afwachting van reactie</h1>')
    .replace(/Bekijk de regels en geef akkoord als alles klopt\./g, 'We wachten nog op je reactie voordat we verder kunnen.')
    .replace(/<span>Offerte accepteren<\/span>/g, '<span>Reactie gevraagd</span>');
}

function mollieErrorHtml(error) {
  const detail = e(error?.message || 'Onbekende Mollie-fout.');
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Mollie betaallink niet aangemaakt</title><style>body{margin:0;background:#f6f6f7;color:#202223;font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.card{max-width:720px;margin:70px auto;background:#fff;border:1px solid #e1e3e5;border-radius:18px;padding:24px;box-shadow:0 10px 28px rgba(0,0,0,.05)}.button{display:inline-flex;margin-top:18px;border-radius:10px;background:#111827;color:#fff;text-decoration:none;padding:11px 15px;font-weight:800}.error{background:#fff1f0;border:1px solid #fed3d1;color:#9f1f12;border-radius:12px;padding:14px;white-space:pre-wrap}</style></head><body><section class="card"><h1>Mollie-betaallink kon niet worden aangemaakt</h1><p>De offerte is daarom niet opgeslagen als verstuurd en er is geen offertemail naar de klant gestuurd. Zo voorkomen we dat een klant een mail zonder betaallink krijgt.</p><div class="error">${detail}</div><p>Controleer je Mollie API-key, websiteprofiel en of iDEAL/Bancontact actief zijn. Probeer daarna opnieuw op te slaan.</p><a class="button" href="/admin">Terug naar dashboard</a></section></body></html>`;
}

export function registerMollieRoutes(app) {
  app.use('/admin/quotes/:id', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const quote = (await readQuotes()).find((item) => item.id === req.params.id && !item.archivedAt);
        return originalSend(quote ? decorateAdminHtml(body, quote) : body);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });

  app.use('/portal/:token', async (req, res, next) => {
    if (req.method !== 'GET' || req.path.split('/').filter(Boolean).length !== 2) return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const quote = (await readQuotes()).find((item) => !item.archivedAt && (item.portalToken === req.params.token || item.id === req.params.token));
        return originalSend(quote ? decoratePortalHtml(body, quote) : body);
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });

  app.use('/admin/quotes/:id', async (req, res, next) => {
    if (req.method !== 'POST') return next();

    try {
      const quotes = await readQuotes();
      const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
      if (!quote || quote.paidAt || quote.status === 'paid') return next();

      const now = new Date().toISOString();
      const manualUrl = String(req.body?.paymentUrl || '').trim();
      if (manualUrl) {
        if (resetQuoteMailForManualLink(quote, manualUrl, now)) await writeQuotes(quotes);
        return next();
      }

      let manualChanged = false;
      if (req.body.status === waitingCustomerStatus) {
        markWaitingCustomer(quote, now);
        req.body.status = 'quote_sent';
        manualChanged = true;
      } else if (quote.manualStatus === waitingCustomerStatus && req.body.status && req.body.status !== waitingCustomerStatus) {
        clearWaitingCustomer(quote);
        manualChanged = true;
      }

      const amount = amountValue(quoteTotalFromBody(req.body));
      if (money(amount) <= 0) {
        if (manualChanged) await writeQuotes(quotes);
        return next();
      }

      if (quote.molliePaymentUrl && quote.molliePaymentAmount === amount && quote.molliePaymentStatus !== 'paid') {
        if (manualChanged) await writeQuotes(quotes);
        req.body.paymentUrl = quote.paymentUrl || quote.molliePaymentUrl;
        return next();
      }

      const payment = await createMollieCheckoutPayment(quote, amount);
      Object.assign(quote, {
        paymentUrl: payment.molliePaymentUrl,
        molliePaymentId: payment.molliePaymentId,
        molliePaymentLinkId: payment.molliePaymentLinkId,
        molliePaymentUrl: payment.molliePaymentUrl,
        molliePaymentStatus: payment.molliePaymentStatus,
        molliePaymentAmount: payment.molliePaymentAmount,
        molliePaymentCreatedAt: payment.molliePaymentCreatedAt,
        updatedAt: now,
      });
      quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
      if (!messageExists(quote, 'Mollie-betaallink aangemaakt')) quote.messages.push({ from: 'pr3nt', text: 'Mollie-betaallink aangemaakt.', createdAt: now });
      await writeQuotes(quotes);
      req.body.paymentUrl = payment.molliePaymentUrl;
      return next();
    } catch (error) {
      console.warn('Mollie betaallink kon niet automatisch worden aangemaakt:', error.message);
      return res.status(400).send(mollieErrorHtml(error));
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
      const quote = quotes.find((item) => !item.archivedAt && ((quoteId && item.id === quoteId) || item.molliePaymentId === paymentId || (paymentLinkId && item.molliePaymentLinkId === paymentLinkId)));
      if (!quote) return res.status(200).send('OK');
      const now = new Date().toISOString();
      quote.molliePaymentId = payment.id || paymentId;
      quote.molliePaymentStatus = payment.status || quote.molliePaymentStatus || 'open';
      quote.molliePaymentMethod = payment.method || quote.molliePaymentMethod || '';
      quote.molliePaymentUpdatedAt = now;
      if (payment.status === 'paid') {
        clearWaitingCustomer(quote);
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
