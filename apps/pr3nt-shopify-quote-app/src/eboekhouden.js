import { fmt, money, quoteLines, quoteTotalInclVat } from './vat.js';

const apiBase = process.env.EBOEKHOUDEN_API_BASE || 'https://api.e-boekhouden.nl';
const source = process.env.EBOEKHOUDEN_SOURCE || 'PR3NT';
const vatCode = process.env.EBOEKHOUDEN_VAT_CODE || 'HOOG_VERK_21';
const termOfPayment = Number(process.env.EBOEKHOUDEN_TERM_OF_PAYMENT || 0);

let sessionToken = '';
let sessionTokenCreatedAt = 0;

function enabled() {
  return Boolean(process.env.EBOEKHOUDEN_ACCESS_TOKEN && process.env.EBOEKHOUDEN_INVOICE_TEMPLATE_ID && process.env.EBOEKHOUDEN_LEDGER_ID);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function clean(value = '', max = 150) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

async function jsonFetch(path, options = {}) {
  const response = await fetch(`${apiBase}${path}`, {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Content-Type': 'application/json',
    },
  });
  const text = await response.text();
  const body = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(`e-Boekhouden API fout ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function session() {
  const now = Date.now();
  if (sessionToken && now - sessionTokenCreatedAt < 20 * 60 * 1000) return sessionToken;
  const body = await jsonFetch('/v1/session', {
    method: 'POST',
    body: JSON.stringify({ accessToken: process.env.EBOEKHOUDEN_ACCESS_TOKEN, source }),
  });
  sessionToken = body.token || body.sessionToken || body.accessToken || '';
  if (!sessionToken) throw new Error(`e-Boekhouden gaf geen sessietoken terug: ${JSON.stringify(body)}`);
  sessionTokenCreatedAt = now;
  return sessionToken;
}

async function api(path, options = {}) {
  const token = await session();
  return jsonFetch(path, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: token,
    },
  });
}

function relationPayload(quote = {}) {
  const shipping = quote.shipping || {};
  const name = clean(quote.name || shipping.name || quote.email || 'Pr3nt klant', 100);
  return {
    type: 'P',
    name,
    contact: name,
    address: clean(shipping.address || [shipping.street, shipping.houseNumber].filter(Boolean).join(' '), 150),
    postalCode: clean(shipping.postalCode, 50),
    city: clean(shipping.city, 50),
    country: clean(shipping.country || 'Nederland', 50),
    phoneNumber: clean(quote.phone, 50),
    emailAddress: clean(quote.email, 150),
    emailAddressInvoice: clean(quote.email, 150),
    termOfPayment,
    freeText1: clean(`Pr3nt ${quote.id || ''}`, 100),
  };
}

async function findRelationIdByEmail(email = '') {
  const value = clean(email, 150);
  if (!value) return 0;
  const result = await api(`/v1/relation?email=${encodeURIComponent(value)}&limit=1`, { method: 'GET' });
  return Number(result?.items?.[0]?.id || 0);
}

async function ensureRelation(quote) {
  const existing = await findRelationIdByEmail(quote.email);
  if (existing) return existing;
  await api('/v1/relation', { method: 'POST', body: JSON.stringify(relationPayload(quote)) });
  const created = await findRelationIdByEmail(quote.email);
  if (!created) throw new Error('e-Boekhouden-relatie is aangemaakt, maar kon niet worden teruggevonden op e-mailadres.');
  return created;
}

function invoiceItems(quote) {
  const ledgerId = asNumber(process.env.EBOEKHOUDEN_LEDGER_ID);
  return quoteLines(quote).map((line) => ({
    quantity: money(line.qty || 1) || 1,
    description: clean([line.label || '3D-print', line.description].filter(Boolean).join(' - '), 500),
    pricePerUnit: money(line.unit || 0),
    vatCode,
    ledgerId,
  })).filter((line) => line.description && line.pricePerUnit > 0);
}

function invoicePayload(quote, relationId) {
  const templateId = asNumber(process.env.EBOEKHOUDEN_INVOICE_TEMPLATE_ID);
  const emailTemplateId = asNumber(process.env.EBOEKHOUDEN_EMAIL_TEMPLATE_ID);
  const ledgerId = asNumber(process.env.EBOEKHOUDEN_LEDGER_ID);
  const payload = {
    relationId,
    date: today(),
    termOfPayment,
    templateId,
    reference: clean(quote.id, 50),
    print: false,
    items: invoiceItems(quote),
  };
  if (emailTemplateId) payload.emailTemplateId = emailTemplateId;
  if (String(process.env.EBOEKHOUDEN_PROCESS_MUTATION || 'true') === 'true') {
    payload.mutation = {
      description: clean(`Pr3nt betaling ${quote.id}`, 200),
      checkPaymentReference: true,
      paymentReference: clean(quote.molliePaymentId || quote.id, 50),
      ledgerId,
    };
  }
  if (String(process.env.EBOEKHOUDEN_SEND_INVOICE_EMAIL || 'false') === 'true') {
    payload.email = {
      fromEmail: process.env.EBOEKHOUDEN_FROM_EMAIL || process.env.MAIL_FROM || process.env.SMTP_USER || '',
      fromName: process.env.EBOEKHOUDEN_FROM_NAME || 'pr3nt.nl',
      subject: `Factuur pr3nt.nl ${quote.id}`,
      body: `Beste ${clean(quote.name || 'klant')},<br><br>Bedankt voor je betaling. In de bijlage vind je de factuur van je 3D-print aanvraag.<br><br>Groet,<br>pr3nt.nl`,
      attachUbl: true,
    };
  }
  return payload;
}

export async function createInvoiceForPaidQuote(quote) {
  if (!enabled()) return { skipped: true, reason: 'EBOEKHOUDEN_ACCESS_TOKEN, EBOEKHOUDEN_INVOICE_TEMPLATE_ID of EBOEKHOUDEN_LEDGER_ID ontbreekt.' };
  if (!quote || quote.eboekhoudenInvoiceId) return { skipped: true, reason: 'Geen quote of factuur bestaat al.' };
  if (!quote.email) return { skipped: true, reason: 'Klant heeft geen e-mailadres.' };
  if (quoteTotalInclVat(quote) <= 0) return { skipped: true, reason: 'Factuurbedrag is 0.' };

  const relationId = await ensureRelation(quote);
  const payload = invoicePayload(quote, relationId);
  if (!payload.items.length) return { skipped: true, reason: 'Geen factuurregels.' };

  const invoice = await api('/v1/invoice', { method: 'POST', body: JSON.stringify(payload) });
  return {
    skipped: false,
    relationId,
    invoiceId: invoice.id || invoice.invoiceId || 0,
    invoiceNumber: invoice.invoiceNumber || '',
    totalInclVat: fmt(quoteTotalInclVat(quote)),
  };
}
