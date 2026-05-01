import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import nodemailer from 'nodemailer';
import PDFDocument from 'pdfkit';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const uploadDir = path.resolve(appRoot, process.env.UPLOAD_DIR || 'uploads/quotes');
const invoiceDir = path.resolve(appRoot, process.env.INVOICE_DIR || 'data/invoices');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';
const shop = process.env.SHOPIFY_SHOP || 'pr3nd.myshopify.com';
const shopifyToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '';
const shopifyVersion = process.env.SHOPIFY_API_VERSION || '2025-10';
const allowedExtensions = new Set(['.stl', '.3mf', '.obj', '.step', '.stp']);

await mkdir(uploadDir, { recursive: true });
await mkdir(invoiceDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname || '').toLowerCase()}`),
  }),
  limits: { fileSize: Number(process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024, files: Number(process.env.MAX_FILES || 8) },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions.has(ext)) return cb(new Error('Upload STL, 3MF, OBJ, STEP of STP.'));
    cb(null, true);
  },
});

function e(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function clean(value = '', max = 3000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function fmt(value) {
  return money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quoteLines(quote) {
  if (Array.isArray(quote.quoteLines) && quote.quoteLines.length) return quote.quoteLines;
  if (quote.quoteAmount) return [{ label: 'Offertebedrag', qty: 1, unit: quote.quoteAmount }];
  return [];
}

function quoteTotal(quote) {
  return quoteLines(quote).reduce((sum, line) => sum + money(line.qty || 1) * money(line.unit || 0), 0);
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

function transporter() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.transip.email',
    port: Number(process.env.SMTP_PORT || 465),
    secure: String(process.env.SMTP_SECURE || 'true') === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function notifyAdmin(quote, title, message) {
  try {
    const mailer = transporter();
    const from = process.env.MAIL_FROM || process.env.SMTP_USER;
    const to = process.env.MAIL_TO || 'bestellingen@pr3nt.nl';
    const adminUrl = `${baseUrl}/admin/quotes/${encodeURIComponent(quote.id)}`;
    await mailer.sendMail({
      from,
      to,
      replyTo: quote.email || from,
      subject: `${title} · ${quote.name || quote.id}`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#101820"><h1>${e(title)}</h1><p>${e(message)}</p><p><strong>Klant:</strong> ${e(quote.name || '-')}<br><strong>E-mail:</strong> ${e(quote.email || '-')}<br><strong>Aanvraag:</strong> ${e(quote.id)}</p><p><a href="${adminUrl}" style="display:inline-block;background:#101820;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700">Open aanvraag</a></p></div>`,
    });
  } catch (error) {
    console.warn('Admin notificatie kon niet worden verzonden:', error.message);
  }
}

function findQuote(quotes, token) {
  return quotes.find((item) => !item.archivedAt && (item.portalToken === token || item.id === token));
}

function deliveryEstimate(quote) {
  const status = quote.status || 'received';
  const estimates = {
    received: 'Offerte meestal binnen 1 werkdag',
    creating_quote: 'Offerte wordt voorbereid',
    quote_sent: 'Wacht op jouw akkoord',
    accepted: quote.paymentUrl ? 'Betaallink staat klaar' : 'Betaallink wordt aangemaakt',
    paid: 'Print wordt ingepland',
    print_queue: 'Productie loopt',
    ready_to_ship: 'Verzending wordt voorbereid',
    shipped: quote.trackingCode ? `Verzonden · ${quote.trackingCode}` : 'Onderweg',
    delivered: 'Project afgerond',
  };
  return estimates[status] || estimates.received;
}

async function shopifyGraphQL(query, variables = {}) {
  if (!shopifyToken) throw new Error('SHOPIFY_ADMIN_ACCESS_TOKEN ontbreekt');
  const response = await fetch(`https://${shop}/admin/api/${shopifyVersion}/graphql.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
    body: JSON.stringify({ query, variables }),
  });
  const body = await response.json();
  if (!response.ok || body.errors) throw new Error(`Shopify API error: ${JSON.stringify(body.errors || body)}`);
  return body.data;
}

async function createShopifyPaymentLink(quote) {
  if (quote.paymentUrl) return quote.paymentUrl;
  const total = quoteTotal(quote);
  if (!total) throw new Error('Geen offertebedrag beschikbaar voor betaallink');
  const lineItems = quoteLines(quote).map((line) => ({
    title: line.label || '3D print regel',
    quantity: Math.max(1, Math.round(money(line.qty || 1))),
    originalUnitPrice: String(money(line.unit || 0).toFixed(2)),
    customAttributes: line.description ? [{ key: 'Omschrijving', value: String(line.description) }] : [],
  })).filter((line) => Number(line.originalUnitPrice) > 0);
  const data = await shopifyGraphQL(`mutation CreateDraftOrder($input: DraftOrderInput!) { draftOrderCreate(input: $input) { draftOrder { id invoiceUrl name } userErrors { field message } } }`, {
    input: {
      email: quote.email || undefined,
      tags: ['pr3nt-offerte', quote.id],
      note: `Offerte ${quote.id}`,
      lineItems,
      customAttributes: [{ key: 'pr3nt_quote_id', value: quote.id }],
      useCustomerDefaultAddress: true,
    },
  });
  const errors = data.draftOrderCreate.userErrors || [];
  if (errors.length) throw new Error(errors.map((error) => error.message).join(', '));
  quote.shopifyDraftOrderId = data.draftOrderCreate.draftOrder.id;
  quote.shopifyDraftOrderName = data.draftOrderCreate.draftOrder.name;
  quote.paymentUrl = data.draftOrderCreate.draftOrder.invoiceUrl;
  return quote.paymentUrl;
}

function invoiceNumber(quote) {
  return `PR3NT-${String(quote.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()}`;
}

async function generateInvoicePdf(quote) {
  const fileName = `${quote.id}.pdf`;
  const filePath = path.join(invoiceDir, fileName);
  if (fs.existsSync(filePath)) return `/portal/${encodeURIComponent(quote.portalToken || quote.id)}/invoices/${fileName}`;
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(22).font('Helvetica-Bold').text('pr3nt.nl', { continued: false });
    doc.moveDown(0.4);
    doc.fontSize(10).font('Helvetica').fillColor('#667085').text('3D print offerte / factuur');
    doc.fillColor('#101820').moveDown(1.5);
    doc.fontSize(18).font('Helvetica-Bold').text(`Factuur ${invoiceNumber(quote)}`);
    doc.fontSize(10).font('Helvetica').moveDown(0.5).text(`Datum: ${new Date(quote.acceptedAt || Date.now()).toLocaleDateString('nl-NL')}`);
    doc.text(`Project: ${quote.id}`);
    doc.moveDown(1.2);
    const billing = quote.billing || {};
    doc.fontSize(12).font('Helvetica-Bold').text('Klantgegevens');
    doc.font('Helvetica').fontSize(10).text(billing.name || quote.name || '-');
    if (billing.company) doc.text(billing.company);
    if (billing.address) doc.text(billing.address);
    if (billing.postalCode || billing.city) doc.text(`${billing.postalCode || ''} ${billing.city || ''}`.trim());
    if (billing.country) doc.text(billing.country);
    if (billing.vat) doc.text(`BTW: ${billing.vat}`);
    doc.text(quote.email || '');
    doc.moveDown(1.4);
    doc.fontSize(12).font('Helvetica-Bold').text('Specificatie');
    doc.moveDown(0.4);
    const startY = doc.y;
    doc.fontSize(9).font('Helvetica-Bold');
    doc.text('Omschrijving', 48, startY);
    doc.text('Aantal', 300, startY, { width: 60, align: 'right' });
    doc.text('Prijs', 370, startY, { width: 70, align: 'right' });
    doc.text('Totaal', 455, startY, { width: 90, align: 'right' });
    doc.moveTo(48, startY + 16).lineTo(545, startY + 16).strokeColor('#e5e7eb').stroke();
    let y = startY + 28;
    doc.font('Helvetica').fontSize(9).fillColor('#101820');
    for (const line of quoteLines(quote)) {
      const qty = money(line.qty || 1);
      const unit = money(line.unit || 0);
      const total = qty * unit;
      doc.text(line.label || 'Regel', 48, y, { width: 230 });
      if (line.description) doc.fillColor('#667085').text(line.description, 48, y + 12, { width: 230 }).fillColor('#101820');
      doc.text(String(line.qty || 1), 300, y, { width: 60, align: 'right' });
      doc.text(`EUR ${fmt(unit)}`, 370, y, { width: 70, align: 'right' });
      doc.text(`EUR ${fmt(total)}`, 455, y, { width: 90, align: 'right' });
      y += line.description ? 40 : 28;
      if (y > 700) { doc.addPage(); y = 70; }
    }
    doc.moveTo(48, y).lineTo(545, y).strokeColor('#e5e7eb').stroke();
    y += 14;
    doc.font('Helvetica-Bold').fontSize(13).text('Totaal', 370, y, { width: 70, align: 'right' });
    doc.text(`EUR ${fmt(quoteTotal(quote))}`, 455, y, { width: 90, align: 'right' });
    doc.moveDown(3);
    doc.font('Helvetica').fontSize(9).fillColor('#667085').text('Deze factuur is automatisch gegenereerd vanuit het pr3nt klantportaal. Betaling verloopt via de Shopify betaallink zodra beschikbaar.');
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  return `/portal/${encodeURIComponent(quote.portalToken || quote.id)}/invoices/${fileName}`;
}

function selfServiceHtml(quote) {
  const token = encodeURIComponent(quote.portalToken || quote.id);
  const reviewCard = quote.status === 'delivered' ? `<div class="self-card"><span class="eyebrow">Na levering</span><strong>Beoordeling achterlaten</strong><p class="muted">Laat weten hoe de print is bevallen.</p><form method="post" action="/portal/${token}/review" class="self-form"><div class="rating"><label><input type="radio" name="rating" value="5" required> 5</label><label><input type="radio" name="rating" value="4"> 4</label><label><input type="radio" name="rating" value="3"> 3</label></div><textarea name="review" placeholder="Korte review"></textarea><button class="btn btn-light" type="submit">Review versturen</button></form></div>` : '';
  return `<section class="self-grid"><div class="self-card"><span class="eyebrow">Snel regelen</span><strong>Herhaalbestelling</strong><p class="muted">Vraag dezelfde print opnieuw aan. We maken automatisch een nieuw project aan.</p><form method="post" action="/portal/${token}/reorder"><button class="btn btn-light" type="submit">Nog een keer printen</button></form></div><div class="self-card"><span class="eyebrow">Bestand</span><strong>Bestand vervangen</strong><p class="muted">Upload een nieuwe versie en kies direct je materiaaladvies.</p><label class="btn btn-light" for="self-upload-modal">Bestand vervangen</label></div><div class="self-card"><span class="eyebrow">Hulp nodig?</span><strong>Supportvraag</strong><p class="muted">Koppel een vraag direct aan dit project.</p><form method="post" action="/portal/${token}/support" class="self-form"><textarea name="message" placeholder="Waar kunnen we mee helpen?" required></textarea><button class="btn btn-light" type="submit">Vraag versturen</button></form></div>${reviewCard}</section><input class="modal-toggle" type="checkbox" id="self-upload-modal"><div class="modal"><div class="modal-card"><h2>Bestand vervangen</h2><p class="muted">Upload een nieuw model. Wij gebruiken deze versie voor de verdere beoordeling/offerte.</p><form method="post" action="/portal/${token}/selfservice-upload" enctype="multipart/form-data" class="self-form"><input type="file" name="file" accept=".stl,.3mf,.obj,.step,.stp" multiple required><div class="form-grid"><input name="material" placeholder="Materiaal"><input name="color" placeholder="Kleur"></div><label><span>Materiaaladvies</span><select name="materialAdvice"><option value="">Geen voorkeur</option><option value="goedkoopste optie">Goedkoopste optie</option><option value="sterkste optie">Sterkste optie</option><option value="mooiste afwerking">Mooiste afwerking</option><option value="snelste levertijd">Snelste levertijd</option></select></label><textarea name="description" placeholder="Wat is er veranderd aan dit bestand?"></textarea><div class="action-row"><button class="btn btn-primary" type="submit">Uploaden en vervangen</button><label class="btn btn-light" for="self-upload-modal">Annuleren</label></div></form></div></div>`;
}

function enhancePortalHtml(html, quote) {
  if (typeof html !== 'string' || !html.includes('</body>')) return html;
  const css = `<style>.self-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}.self-card{background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:22px;padding:18px;box-shadow:0 12px 36px rgba(16,24,32,.06)}.self-card strong{display:block;font-size:18px;margin:8px 0}.self-form{display:grid;gap:10px}.rating{display:flex;gap:8px;flex-wrap:wrap}.rating label{background:#f5f7f6;border:1px solid var(--line,#e5e7eb);border-radius:999px;padding:8px 12px;font-weight:850}.delivery-pill{background:#f5f7f6;border:1px solid var(--line,#e5e7eb);padding:7px 10px;border-radius:999px;font-weight:850;font-size:13px}.account-icon{font-size:0!important;width:44px;height:44px;padding:0!important;display:inline-grid!important;place-items:center}.account-icon::after{content:'👤';font-size:20px}.invoice-list{display:grid;gap:10px}.invoice-item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:16px;background:#f8fafc}@media(max-width:850px){.self-grid{grid-template-columns:1fr}}</style>`;
  let output = html.replace('</head>', `${css}</head>`);
  output = output.replace(/<a class="nav-link ([^"]*)" href="([^"]*)\/account">Account<\/a>/, '<a class="nav-link account-icon $1" href="$2/account" aria-label="Account">Account</a>');
  output = output.replace('</div></div><div class="next-action">', `<span class="delivery-pill">${e(deliveryEstimate(quote))}</span>${quote.status === 'shipped' && quote.trackingCode ? `<span class="delivery-pill">Track & trace: ${e(quote.trackingCode)}</span>` : ''}</div></div><div class="next-action">`);
  output = output.replace(/<section class="grid"><aside class="card"><h2>Relevante informatie<\/h2>/, `${selfServiceHtml(quote)}<section class="grid"><aside class="card"><h2>Relevante informatie</h2>`);
  output = output.replace(/<div class="card" id="tracking">[\s\S]*?<\/div><\/section>/, '</section>');
  return output;
}

function enhanceAccountHtml(html, quote) {
  if (typeof html !== 'string' || !html.includes('</body>')) return html;
  const invoices = Array.isArray(quote.invoices) ? quote.invoices : [];
  const rows = invoices.length ? invoices.map((invoice) => `<div class="invoice-item"><div><strong>${e(invoice.number || 'Factuur')}</strong><br><span class="muted">${e(new Date(invoice.createdAt || Date.now()).toLocaleDateString('nl-NL'))} · EUR ${fmt(invoice.total || quoteTotal(quote))}</span></div><a class="btn btn-light" href="${e(invoice.url)}">Download PDF</a></div>`).join('') : '<p class="muted">Er zijn nog geen facturen beschikbaar. Na akkoord wordt automatisch een PDF-factuur klaargezet.</p>';
  const invoiceBlock = `<section class="card" style="margin-top:18px"><h2>Facturen</h2><div class="invoice-list">${rows}</div></section>`;
  return html.replace('</head>', '<style>.invoice-list{display:grid;gap:10px}.invoice-item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:16px;background:#f8fafc}.account-icon{font-size:0!important;width:44px;height:44px;padding:0!important;display:inline-grid!important;place-items:center}.account-icon::after{content:\'👤\';font-size:20px}</style></head>').replace(/<a class="nav-link ([^"]*)" href="([^"]*)\/account">Account<\/a>/, '<a class="nav-link account-icon $1" href="$2/account" aria-label="Account">Account</a>').replace('</form></section>', `</form></section>${invoiceBlock}`);
}

export function registerSelfServiceRoutes(app) {
  app.use('/portal/:token', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        const quotes = await readQuotes();
        const quote = findQuote(quotes, req.params.token);
        if (!quote) return originalSend(body);
        originalSend(req.path.endsWith('/account') ? enhanceAccountHtml(body, quote) : enhancePortalHtml(body, quote));
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });

  app.post('/portal/:token/support', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    const message = clean(req.body.message, 2000);
    if (message) {
      quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
      quote.messages.push({ from: 'klant', text: `Supportvraag: ${message}`, createdAt: new Date().toISOString() });
      quote.updatedAt = new Date().toISOString();
      await writeQuotes(quotes);
      await notifyAdmin(quote, 'Nieuwe supportvraag', message);
    }
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Supportvraag%20verstuurd`);
  });

  app.post('/portal/:token/review', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    const rating = clean(req.body.rating, 10);
    const review = clean(req.body.review, 1200);
    quote.review = { rating, review, createdAt: new Date().toISOString() };
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    quote.messages.push({ from: 'klant', text: `Review (${rating}/5): ${review || '-'}`, createdAt: new Date().toISOString() });
    await writeQuotes(quotes);
    await notifyAdmin(quote, 'Nieuwe review ontvangen', `Score: ${rating}/5. ${review}`);
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Review%20verstuurd`);
  });

  app.post('/portal/:token/reorder', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    const now = new Date().toISOString();
    const newQuote = { ...quote, id: `quote-${Date.now()}-${randomUUID().slice(0, 8)}`, portalToken: randomUUID(), status: 'received', createdAt: now, updatedAt: now, originalQuoteId: quote.id, quoteLines: [], quoteAmount: '', acceptedAt: '', paidAt: '', quoteSentAt: '', paymentUrl: '', trackingCode: '', invoices: [], messages: [{ from: 'klant', text: `Herhaalbestelling aangevraagd op basis van ${quote.id}.`, createdAt: now }] };
    delete newQuote.archivedAt;
    delete newQuote.deleteAfter;
    quotes.unshift(newQuote);
    await writeQuotes(quotes);
    await notifyAdmin(newQuote, 'Herhaalbestelling aangevraagd', `Klant wil project ${quote.id} opnieuw laten printen.`);
    res.redirect(`/portal/${encodeURIComponent(newQuote.portalToken)}?saved=Herhaalbestelling%20aangemaakt`);
  });

  app.post('/portal/:token/selfservice-upload', upload.array('file', Number(process.env.MAX_FILES || 8)), async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    const files = req.files || [];
    quote.files = Array.isArray(quote.files) ? quote.files : [];
    const description = clean(req.body.description, 1000);
    const material = clean(req.body.material, 80);
    const color = clean(req.body.color, 80);
    const materialAdvice = clean(req.body.materialAdvice, 120);
    const uploaded = [];
    for (const file of files) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storedSafeName = `${Date.now()}-${safeName}`;
      const storedName = `${quote.id}-${storedSafeName}`;
      await rename(file.path, path.join(uploadDir, storedName));
      uploaded.push({ originalName: file.originalname, storedName, url: `${baseUrl}/files/${quote.id}/${encodeURIComponent(storedSafeName)}`, uploadedBy: 'klant', description, material, color, materialAdvice, replaceExisting: true, createdAt: new Date().toISOString() });
    }
    quote.files = [...uploaded, ...quote.files];
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    const text = `${files.length} vervangend bestand(en) geüpload.${description ? ` Toelichting: ${description}` : ''}${material ? ` Materiaal: ${material}.` : ''}${color ? ` Kleur: ${color}.` : ''}${materialAdvice ? ` Advieskeuze: ${materialAdvice}.` : ''}`;
    quote.messages.push({ from: 'klant', text, createdAt: new Date().toISOString() });
    await writeQuotes(quotes);
    await notifyAdmin(quote, 'Klant heeft bestand vervangen', text);
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Bestand%20vervangen`);
  });

  app.post('/portal/:token/accept', async (req, res, next) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return next();
    if (quote.acceptedAt) return next();
    quote.acceptedAt = new Date().toISOString();
    quote.status = 'accepted';
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    quote.messages.push({ from: 'klant', text: 'Ik ga akkoord met de offerte.', createdAt: quote.acceptedAt });
    try {
      await createShopifyPaymentLink(quote);
      quote.messages.push({ from: 'pr3nt', text: 'De betaallink is automatisch klaargezet.', createdAt: new Date().toISOString() });
    } catch (error) {
      quote.paymentLinkError = error.message;
      quote.messages.push({ from: 'pr3nt', text: 'Betaallink kon niet automatisch worden aangemaakt. We zetten deze handmatig klaar.', createdAt: new Date().toISOString() });
      await notifyAdmin(quote, 'Betaallink kon niet automatisch worden aangemaakt', error.message);
    }
    try {
      const invoiceUrl = await generateInvoicePdf(quote);
      quote.invoices = Array.isArray(quote.invoices) ? quote.invoices : [];
      if (!quote.invoices.some((invoice) => invoice.url === invoiceUrl)) {
        quote.invoices.push({ number: invoiceNumber(quote), url: invoiceUrl, total: quoteTotal(quote), createdAt: new Date().toISOString() });
      }
    } catch (error) {
      quote.invoiceError = error.message;
      await notifyAdmin(quote, 'Factuur kon niet automatisch worden gegenereerd', error.message);
    }
    await writeQuotes(quotes);
    await notifyAdmin(quote, 'Offerte akkoord gegeven', 'De klant heeft akkoord gegeven op de offerte.');
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Offerte%20akkoord%20gegeven`);
  });

  app.get('/portal/:token/invoices/:fileName', async (req, res) => {
    const quotes = await readQuotes();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send('Factuur niet gevonden');
    const fileName = req.params.fileName.replace(/[^a-zA-Z0-9._-]/g, '');
    const allowed = Array.isArray(quote.invoices) && quote.invoices.some((invoice) => String(invoice.url || '').endsWith(`/${fileName}`));
    if (!allowed) return res.status(404).send('Factuur niet gevonden');
    res.download(path.join(invoiceDir, fileName));
  });
}
