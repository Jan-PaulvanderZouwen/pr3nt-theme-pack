import { readFile, writeFile, unlink } from 'node:fs/promises';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import PDFDocument from 'pdfkit';
import nodemailer from 'nodemailer';

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

function e(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
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

async function readQuotesRaw() {
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

function findQuote(quotes, token) {
  return quotes.find((item) => !item.archivedAt && (item.portalToken === token || item.id === token));
}

function quoteStoredFileNames(quote) {
  const names = new Set();
  if (quote.fileStoredName) names.add(quote.fileStoredName);
  if (Array.isArray(quote.files)) quote.files.forEach((file) => file?.storedName && names.add(file.storedName));
  if (Array.isArray(quote.invoices)) quote.invoices.forEach((invoice) => {
    const name = String(invoice.url || '').split('/').pop();
    if (name) names.add(`invoice:${name}`);
  });
  return [...names];
}

async function deleteQuoteDataFiles(quote) {
  await Promise.all(quoteStoredFileNames(quote).map((name) => {
    if (name.startsWith('invoice:')) return unlink(path.join(invoiceDir, name.replace('invoice:', ''))).catch(() => {});
    return unlink(path.join(uploadDir, name)).catch(() => {});
  }));
}

async function maintainDeliveredArchives() {
  const quotes = await readQuotesRaw();
  const now = Date.now();
  let changed = false;
  const keep = [];
  for (const quote of quotes) {
    if (quote.archivedAt && quote.deleteAfter && new Date(quote.deleteAfter).getTime() <= now) {
      await deleteQuoteDataFiles(quote);
      changed = true;
      continue;
    }
    if (quote.status === 'delivered' && !quote.archivedAt) {
      if (!quote.deliveredAt) {
        quote.deliveredAt = new Date().toISOString();
        changed = true;
      }
      const deliveredAt = new Date(quote.deliveredAt).getTime();
      if (now - deliveredAt >= 10 * 24 * 60 * 60 * 1000) {
        const archivedAt = new Date().toISOString();
        quote.archivedAt = archivedAt;
        quote.deleteAfter = archivedAt;
        quote.previousStatus = 'delivered';
        quote.status = 'archived';
        quote.portalToken = `archived-${quote.id}`;
        await deleteQuoteDataFiles(quote);
        changed = true;
        continue;
      }
    }
    keep.push(quote);
  }
  if (changed) await writeQuotes(keep);
  return keep;
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
      html: `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#101820"><h1>${e(title)}</h1><p>${e(message)}</p><p><a href="${adminUrl}" style="display:inline-block;background:#101820;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700">Open aanvraag</a></p></div>`,
    });
  } catch (error) {
    console.warn('Admin notificatie kon niet worden verzonden:', error.message);
  }
}

async function createDraftOrderPaymentLink(quote) {
  if (quote.paymentUrl) return quote.paymentUrl;
  if (!shopifyToken) throw new Error('SHOPIFY_ADMIN_ACCESS_TOKEN ontbreekt. Betaallink kan niet automatisch worden aangemaakt.');
  const lineItems = quoteLines(quote).map((line) => ({
    title: line.label || '3D print',
    price: Number(money(line.unit || 0).toFixed(2)),
    quantity: Math.max(1, Math.round(money(line.qty || 1))),
    requires_shipping: false,
    taxable: true,
    properties: line.description ? [{ name: 'Omschrijving', value: String(line.description) }] : [],
  })).filter((line) => line.price > 0);
  if (!lineItems.length) throw new Error('Geen offerteregels met bedrag gevonden.');
  const payload = {
    draft_order: {
      email: quote.email || undefined,
      note: `pr3nt offerte ${quote.id}`,
      tags: `pr3nt-offerte,${quote.id}`,
      line_items: lineItems,
      use_customer_default_address: true,
    },
  };
  const response = await fetch(`https://${shop}/admin/api/${shopifyVersion}/draft_orders.json`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': shopifyToken },
    body: JSON.stringify(payload),
  });
  const bodyText = await response.text();
  let body;
  try { body = JSON.parse(bodyText); } catch { body = { raw: bodyText }; }
  if (!response.ok || !body.draft_order) {
    throw new Error(`Shopify Draft Order error ${response.status}: ${JSON.stringify(body)}`);
  }
  quote.shopifyDraftOrderId = body.draft_order.admin_graphql_api_id || String(body.draft_order.id || '');
  quote.shopifyDraftOrderName = body.draft_order.name || '';
  quote.paymentUrl = body.draft_order.invoice_url || body.draft_order.invoiceUrl || '';
  if (!quote.paymentUrl) throw new Error(`Draft order aangemaakt, maar Shopify gaf geen invoice_url terug: ${JSON.stringify(body.draft_order)}`);
  return quote.paymentUrl;
}

function invoiceNumber(quote) {
  return `PR3NT-${String(quote.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-10).toUpperCase()}`;
}

async function generateInvoicePdf(quote) {
  await fs.promises.mkdir(invoiceDir, { recursive: true });
  const fileName = `${quote.id}.pdf`;
  const filePath = path.join(invoiceDir, fileName);
  if (fs.existsSync(filePath)) return `/portal/${encodeURIComponent(quote.portalToken || quote.id)}/invoices/${fileName}`;
  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 48, size: 'A4' });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);
    doc.fontSize(22).font('Helvetica-Bold').text('pr3nt.nl');
    doc.fontSize(10).font('Helvetica').fillColor('#667085').text('3D print offerte / factuur');
    doc.fillColor('#101820').moveDown(1.2).fontSize(18).font('Helvetica-Bold').text(`Factuur ${invoiceNumber(quote)}`);
    doc.fontSize(10).font('Helvetica').moveDown(0.5).text(`Datum: ${new Date(quote.acceptedAt || Date.now()).toLocaleDateString('nl-NL')}`);
    doc.text(`Project: ${quote.id}`);
    doc.moveDown(1.2).fontSize(12).font('Helvetica-Bold').text('Klantgegevens');
    const billing = quote.billing || {};
    doc.font('Helvetica').fontSize(10).text(billing.name || quote.name || '-');
    if (billing.company) doc.text(billing.company);
    if (billing.address) doc.text(billing.address);
    if (billing.postalCode || billing.city) doc.text(`${billing.postalCode || ''} ${billing.city || ''}`.trim());
    if (billing.country) doc.text(billing.country);
    if (billing.vat) doc.text(`BTW: ${billing.vat}`);
    if (quote.email) doc.text(quote.email);
    doc.moveDown(1.2).fontSize(12).font('Helvetica-Bold').text('Specificatie');
    let y = doc.y + 12;
    doc.fontSize(9).text('Omschrijving', 48, y).text('Aantal', 300, y, { width: 60, align: 'right' }).text('Prijs', 370, y, { width: 70, align: 'right' }).text('Totaal', 455, y, { width: 90, align: 'right' });
    y += 22;
    doc.font('Helvetica');
    for (const line of quoteLines(quote)) {
      const qty = money(line.qty || 1);
      const unit = money(line.unit || 0);
      doc.text(line.label || 'Regel', 48, y, { width: 230 });
      if (line.description) doc.fillColor('#667085').text(line.description, 48, y + 12, { width: 230 }).fillColor('#101820');
      doc.text(String(line.qty || 1), 300, y, { width: 60, align: 'right' }).text(`EUR ${fmt(unit)}`, 370, y, { width: 70, align: 'right' }).text(`EUR ${fmt(qty * unit)}`, 455, y, { width: 90, align: 'right' });
      y += line.description ? 40 : 28;
      if (y > 700) { doc.addPage(); y = 70; }
    }
    doc.font('Helvetica-Bold').fontSize(13).text('Totaal', 370, y + 12, { width: 70, align: 'right' }).text(`EUR ${fmt(quoteTotal(quote))}`, 455, y + 12, { width: 90, align: 'right' });
    doc.end();
    stream.on('finish', resolve);
    stream.on('error', reject);
  });
  return `/portal/${encodeURIComponent(quote.portalToken || quote.id)}/invoices/${fileName}`;
}

function selfServiceHtml(quote) {
  const token = encodeURIComponent(quote.portalToken || quote.id);
  const canReplaceFile = !quote.acceptedAt && !['accepted', 'paid', 'print_queue', 'ready_to_ship', 'shipped', 'delivered'].includes(quote.status);
  const replaceCard = canReplaceFile ? `<div class="self-card"><span class="eyebrow">Bestand</span><strong>Bestand vervangen</strong><p class="muted">Upload een nieuwe versie en kies PLA of PETG.</p><label class="btn btn-light" for="self-upload-modal">Bestand vervangen</label></div>` : '';
  const reviewCard = quote.status === 'delivered' ? `<div class="self-card"><span class="eyebrow">Na levering</span><strong>Beoordeling achterlaten</strong><p class="muted">Laat weten hoe de print is bevallen.</p><form method="post" action="/portal/${token}/review" class="self-form"><div class="rating"><label><input type="radio" name="rating" value="5" required> 5</label><label><input type="radio" name="rating" value="4"> 4</label><label><input type="radio" name="rating" value="3"> 3</label></div><textarea name="review" placeholder="Korte review"></textarea><button class="btn btn-light" type="submit">Review versturen</button></form></div>` : '';
  return `<section class="self-grid"><div class="self-card"><span class="eyebrow">Snel regelen</span><strong>Herhaalbestelling</strong><p class="muted">Vraag dezelfde print opnieuw aan. We maken automatisch een nieuw project aan.</p><form method="post" action="/portal/${token}/reorder"><button class="btn btn-light" type="submit">Nog een keer printen</button></form></div>${replaceCard}<div class="self-card"><span class="eyebrow">Hulp nodig?</span><strong>Supportvraag</strong><p class="muted">Koppel een vraag direct aan dit project.</p><form method="post" action="/portal/${token}/support" class="self-form"><textarea name="message" placeholder="Waar kunnen we mee helpen?" required></textarea><button class="btn btn-light" type="submit">Vraag versturen</button></form></div>${reviewCard}</section>${canReplaceFile ? `<input class="modal-toggle" type="checkbox" id="self-upload-modal"><div class="modal"><div class="modal-card"><h2>Bestand vervangen</h2><p class="muted">Upload een nieuw model. Wij gebruiken deze versie voor de verdere beoordeling/offerte.</p><form method="post" action="/portal/${token}/selfservice-upload" enctype="multipart/form-data" class="self-form"><input type="file" name="file" accept=".stl,.3mf,.obj,.step,.stp" multiple required><div class="material-switch"><label><input type="radio" name="material" value="PLA" checked><span>PLA</span></label><label><input type="radio" name="material" value="PETG"><span>PETG</span></label></div><input name="color" placeholder="Kleur"><textarea name="description" placeholder="Wat is er veranderd aan dit bestand?"></textarea><div class="action-row"><button class="btn btn-primary" type="submit">Uploaden en vervangen</button><label class="btn btn-light" for="self-upload-modal">Annuleren</label></div></form></div></div>` : ''}`;
}

function statusExtras(quote) {
  const parts = [`<span class="delivery-pill">${e(deliveryEstimate(quote))}</span>`];
  if (quote.status === 'shipped' && quote.trackingCode) parts.push(`<div class="tracking-mini"><div class="tracking-mini-icon">🚚</div><div><strong>Pakket volgen</strong><br><span>Track & trace: ${e(quote.trackingCode)}</span></div></div>`);
  if (quote.status === 'print_queue') parts.push(`<div class="printer-mini"><div class="mini-printer"><div class="mini-rail"></div><div class="mini-head"></div><div class="mini-bed"><div class="mini-object"></div></div></div><div><strong>Productie loopt</strong><br><span>Je print wordt gemaakt.</span></div></div>`);
  return parts.join('');
}

function enhanceHeader(output) {
  output = output.replace(/<a class="nav-link ([^"]*)" href="([^"]*)\/account">Account<\/a>/, '<a class="nav-link account-icon $1" href="$2/account" aria-label="Account">Account</a>');
  output = output.replace(/(<a class="nav-link account-icon[\s\S]*?<\/a>)(<label class="project-switcher">[\s\S]*?<\/label>)/, '$2$1');
  output = output.replace(/(<a class="nav-link account-icon[\s\S]*?<\/a>)(<span class="nav-pill">[\s\S]*?<\/span>)/, '$2$1');
  return output;
}

function enhancePortalHtml(html, quote) {
  if (typeof html !== 'string' || !html.includes('</body>')) return html;
  const css = `<style>.self-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;margin-bottom:18px}.self-card{background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:22px;padding:18px;box-shadow:0 12px 36px rgba(16,24,32,.06)}.self-card strong{display:block;font-size:18px;margin:8px 0}.self-form{display:grid;gap:10px}.rating{display:flex;gap:8px;flex-wrap:wrap}.rating label{background:#f5f7f6;border:1px solid var(--line,#e5e7eb);border-radius:999px;padding:8px 12px;font-weight:850}.delivery-pill{display:inline-flex;background:#f5f7f6;border:1px solid var(--line,#e5e7eb);padding:7px 10px;border-radius:999px;font-weight:850;font-size:13px;margin:4px 6px 0 0}.account-icon{font-size:0!important;width:44px;height:44px;padding:0!important;display:inline-grid!important;place-items:center;order:999}.account-icon::after{content:'👤';font-size:20px}.one-card{grid-template-columns:1fr!important}.tracking-mini,.printer-mini{display:flex;gap:12px;align-items:center;margin-top:12px;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:18px;background:#fff}.tracking-mini-icon{width:42px;height:42px;border-radius:14px;background:#101820;color:#fff;display:grid;place-items:center}.material-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px}.material-switch input{display:none}.material-switch span{display:block;text-align:center;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:14px;font-weight:900;background:#f8fafc}.material-switch input:checked+span{background:#101820;color:#fff}.mini-printer{position:relative;width:92px;height:58px}.mini-rail{position:absolute;top:10px;left:4px;right:4px;height:5px;background:#101820;border-radius:999px;opacity:.7}.mini-head{position:absolute;top:2px;left:8px;width:24px;height:22px;background:#00d084;border-radius:7px;animation:minihead 2s infinite alternate ease-in-out}.mini-bed{position:absolute;bottom:6px;left:8px;right:8px;height:7px;background:#101820;border-radius:999px}.mini-object{position:absolute;bottom:7px;left:28px;width:32px;height:10px;background:#00d084;border-radius:8px 8px 3px 3px;animation:minigrow 2s infinite alternate ease-in-out}@keyframes minihead{from{left:8px}to{left:60px}}@keyframes minigrow{from{height:6px}to{height:24px}}@media(max-width:850px){.self-grid{grid-template-columns:1fr}}</style>`;
  let output = html.replace('</head>', `${css}</head>`);
  output = enhanceHeader(output);
  output = output.replace('</div></div><div class="next-action">', `${statusExtras(quote)}</div></div><div class="next-action">`);
  output = output.replace(/<div class="printer-card">[\s\S]*?<\/div><\/div>(?=<section class="self-grid">|<section class="grid">)/, '');
  output = output.replace(/<section class="self-grid">[\s\S]*?<\/section>(?:<input class="modal-toggle"[\s\S]*?<\/div><\/div>)?/, selfServiceHtml(quote));
  output = output.replace(/<section class="grid"><aside class="card"><h2>Relevante informatie<\/h2>([\s\S]*?)<\/aside><div class="card" id="tracking">[\s\S]*?<\/div><\/section>/, '<section class="grid one-card"><aside class="card"><h2>Relevante informatie</h2>$1</aside></section>');
  return output;
}

function enhanceAccountHtml(html, quote) {
  if (typeof html !== 'string' || !html.includes('</body>')) return html;
  const invoices = Array.isArray(quote.invoices) ? quote.invoices : [];
  const rows = invoices.length ? invoices.map((invoice) => `<div class="invoice-item"><div><strong>${e(invoice.number || 'Factuur')}</strong><br><span class="muted">${e(new Date(invoice.createdAt || Date.now()).toLocaleDateString('nl-NL'))} · EUR ${fmt(invoice.total || quoteTotal(quote))}</span></div><a class="btn btn-light" href="${e(invoice.url)}">Download PDF</a></div>`).join('') : '<p class="muted">Er zijn nog geen facturen beschikbaar. Na akkoord wordt automatisch een PDF-factuur klaargezet.</p>';
  const invoiceBlock = `<section class="card" style="margin-top:18px"><h2>Facturen</h2><div class="invoice-list">${rows}</div></section>`;
  const selfBlock = `<section style="margin-top:18px">${selfServiceHtml(quote)}</section>`;
  let output = html.replace('</head>', '<style>.invoice-list{display:grid;gap:10px}.invoice-item{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:16px;background:#f8fafc}.account-icon{font-size:0!important;width:44px;height:44px;padding:0!important;display:inline-grid!important;place-items:center;order:999}.account-icon::after{content:\'👤\';font-size:20px}.self-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}.self-card{background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:22px;padding:18px}.material-switch{display:grid;grid-template-columns:1fr 1fr;gap:8px}.material-switch input{display:none}.material-switch span{display:block;text-align:center;padding:12px;border:1px solid var(--line,#e5e7eb);border-radius:14px;font-weight:900;background:#f8fafc}.material-switch input:checked+span{background:#101820;color:#fff}</style></head>');
  output = enhanceHeader(output);
  return output.replace('</form></section>', `</form></section>${invoiceBlock}${selfBlock}`);
}

export function registerPortalFixRoutes(app) {
  app.use(async (_req, _res, next) => {
    try { await maintainDeliveredArchives(); } catch (error) { console.warn('Archive maintenance failed:', error.message); }
    next();
  });

  app.use('/portal/:token', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        const quotes = await readQuotesRaw();
        const quote = findQuote(quotes, req.params.token);
        if (!quote) return originalSend(body);
        originalSend(req.path.endsWith('/account') ? enhanceAccountHtml(body, quote) : enhancePortalHtml(body, quote));
      }).catch(() => originalSend(body));
      return res;
    };
    next();
  });

  app.post('/portal/:token/accept', async (req, res) => {
    const quotes = await readQuotesRaw();
    const quote = findQuote(quotes, req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    quote.acceptedAt = quote.acceptedAt || new Date().toISOString();
    quote.status = 'accepted';
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    if (!quote.messages.some((message) => message.text === 'Ik ga akkoord met de offerte.')) {
      quote.messages.push({ from: 'klant', text: 'Ik ga akkoord met de offerte.', createdAt: quote.acceptedAt });
    }
    try {
      await createDraftOrderPaymentLink(quote);
      quote.messages.push({ from: 'pr3nt', text: 'De Shopify betaallink is automatisch klaargezet.', createdAt: new Date().toISOString() });
    } catch (error) {
      quote.paymentLinkError = error.message;
      quote.messages.push({ from: 'pr3nt', text: `Betaallink kon niet automatisch worden aangemaakt: ${error.message}`, createdAt: new Date().toISOString() });
      await notifyAdmin(quote, 'Betaallink kon niet automatisch worden aangemaakt', error.message);
    }
    try {
      const invoiceUrl = await generateInvoicePdf(quote);
      quote.invoices = Array.isArray(quote.invoices) ? quote.invoices : [];
      if (!quote.invoices.some((invoice) => invoice.url === invoiceUrl)) quote.invoices.push({ number: invoiceNumber(quote), url: invoiceUrl, total: quoteTotal(quote), createdAt: new Date().toISOString() });
    } catch (error) {
      quote.invoiceError = error.message;
      await notifyAdmin(quote, 'Factuur kon niet automatisch worden gegenereerd', error.message);
    }
    await writeQuotes(quotes);
    await notifyAdmin(quote, 'Offerte akkoord gegeven', 'De klant heeft akkoord gegeven op de offerte.');
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Offerte%20akkoord%20gegeven`);
  });
}
