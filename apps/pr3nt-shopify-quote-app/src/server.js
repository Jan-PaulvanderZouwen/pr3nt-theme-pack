import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import helmet from 'helmet';
import multer from 'multer';
import nodemailer from 'nodemailer';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { registerAdminRoutes } from './admin.js';
import { registerPortalRoutes } from './portal.js';
import { registerSelfServiceRoutes } from './selfservice.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');

const config = {
  port: Number(process.env.PORT || 3000),
  baseUrl: process.env.APP_BASE_URL || 'http://localhost:3000',
  allowedOrigin: process.env.ALLOWED_ORIGIN || 'https://pr3nt.nl',
  shop: process.env.SHOPIFY_SHOP || 'pr3nd.myshopify.com',
  shopifyToken: process.env.SHOPIFY_ADMIN_ACCESS_TOKEN || '',
  shopifyClientId: process.env.SHOPIFY_CLIENT_ID || '',
  shopifyClientSecret: process.env.SHOPIFY_CLIENT_SECRET || '',
  shopifyVersion: process.env.SHOPIFY_API_VERSION || '2025-10',
  customersEnabled: String(process.env.SHOPIFY_CUSTOMERS_ENABLED || 'false') === 'true',
  metaobjectsEnabled: String(process.env.SHOPIFY_METAOBJECTS_ENABLED || 'false') === 'true',
  successUrl: process.env.SUCCESS_URL || 'https://pr3nt.nl/pages/offerte-aanvraag-ontvangen',
  maxFileSizeMb: Number(process.env.MAX_FILE_SIZE_MB || 50),
  uploadDir: path.resolve(appRoot, process.env.UPLOAD_DIR || 'uploads/quotes'),
  dataDir: path.resolve(appRoot, process.env.DATA_DIR || 'data'),
  metaobjectType: process.env.QUOTE_METAOBJECT_TYPE || 'pr3nt_quote_request',
};

let cachedAdminToken = null;
let cachedAdminTokenExpiresAt = 0;
const allowedExtensions = new Set(['.stl', '.3mf', '.obj', '.step', '.stp']);

await mkdir(config.uploadDir, { recursive: true });
await mkdir(config.dataDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${randomUUID()}${path.extname(file.originalname || '').toLowerCase()}`),
  }),
  limits: { fileSize: config.maxFileSizeMb * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedExtensions.has(ext)) return cb(new Error('Ongeldig bestandstype. Upload STL, 3MF, OBJ, STEP of STP.'));
    cb(null, true);
  },
});

const app = express();
app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
app.use(cors({ origin: config.allowedOrigin, methods: ['POST', 'GET', 'OPTIONS'] }));
app.use(cookieParser());
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

function clean(value, max = 2000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function quoteStatusLabel(status = 'received') {
  const labels = { received: 'Order ontvangen', creating_quote: 'Offerte wordt aangemaakt', quote_sent: 'Offerte verstuurd', accepted: 'Offerte akkoord', paid: 'Betaling voltooid', print_queue: 'Print in queue', ready_to_ship: 'Print is klaar voor verzending', shipped: 'Print is verzonden', delivered: 'Print is geleverd' };
  return labels[status] || labels.received;
}

function isShopifyAccessDenied(error) {
  return String(error?.message || '').toLowerCase().includes('access denied');
}

async function getShopifyAdminToken() {
  if (config.shopifyToken) return config.shopifyToken;
  if (!config.shopifyClientId || !config.shopifyClientSecret) throw new Error('Shopify token ontbreekt. Vul SHOPIFY_ADMIN_ACCESS_TOKEN of SHOPIFY_CLIENT_ID + SHOPIFY_CLIENT_SECRET in.');
  const now = Date.now();
  if (cachedAdminToken && cachedAdminTokenExpiresAt > now + 60_000) return cachedAdminToken;
  const response = await fetch(`https://${config.shop}/admin/oauth/access_token`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grant_type: 'client_credentials', client_id: config.shopifyClientId, client_secret: config.shopifyClientSecret }) });
  const body = await response.json().catch(() => ({}));
  if (!response.ok || !body.access_token) throw new Error(`Shopify client credentials token ophalen mislukt: ${JSON.stringify(body)}`);
  cachedAdminToken = body.access_token;
  cachedAdminTokenExpiresAt = now + Number(body.expires_in || 86400) * 1000;
  return cachedAdminToken;
}

async function shopifyGraphQL(query, variables = {}) {
  const token = await getShopifyAdminToken();
  const response = await fetch(`https://${config.shop}/admin/api/${config.shopifyVersion}/graphql.json`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': token }, body: JSON.stringify({ query, variables }) });
  const body = await response.json();
  if (!response.ok || body.errors) throw new Error(`Shopify API error: ${JSON.stringify(body.errors || body)}`);
  return body.data;
}

async function findCustomerByEmail(email) {
  const data = await shopifyGraphQL(`query FindCustomer($query: String!) { customers(first: 1, query: $query) { nodes { id email firstName lastName } } }`, { query: `email:${email}` });
  return data.customers.nodes[0] || null;
}

async function createCustomer({ name, email, phone }) {
  const parts = name.split(/\s+/).filter(Boolean);
  const firstName = parts.shift() || name;
  const lastName = parts.join(' ');
  const data = await shopifyGraphQL(`mutation CustomerCreate($input: CustomerInput!) { customerCreate(input: $input) { customer { id email firstName lastName } userErrors { field message } } }`, { input: { email, phone: phone || null, firstName, lastName, tags: ['pr3nt-offerte'], emailMarketingConsent: { marketingState: 'NOT_SUBSCRIBED', marketingOptInLevel: 'SINGLE_OPT_IN' } } });
  const errors = data.customerCreate.userErrors;
  if (errors.length) throw new Error(errors.map(e => e.message).join(', '));
  return data.customerCreate.customer;
}

async function findOrCreateCustomer(input) {
  if (!config.customersEnabled) return null;
  try {
    const existing = await findCustomerByEmail(input.email);
    if (existing) return existing;
    return createCustomer(input);
  } catch (error) {
    if (isShopifyAccessDenied(error)) {
      console.warn('Shopify customer access denied. Offerte wordt zonder customer-koppeling verwerkt.');
      return null;
    }
    throw error;
  }
}

async function createQuoteMetaobject(quote) {
  if (!config.metaobjectsEnabled) return null;
  const fields = [
    { key: 'quote_id', value: quote.id }, { key: 'status', value: quote.status }, { key: 'status_label', value: quoteStatusLabel(quote.status) }, { key: 'customer_id', value: quote.customerId || '' }, { key: 'name', value: quote.name }, { key: 'email', value: quote.email }, { key: 'phone', value: quote.phone }, { key: 'material', value: quote.material }, { key: 'color', value: quote.color }, { key: 'rush', value: quote.rush }, { key: 'note', value: quote.note || '' }, { key: 'file_name', value: quote.fileOriginalName }, { key: 'file_url', value: quote.fileUrl }, { key: 'created_at', value: quote.createdAt },
  ];
  const data = await shopifyGraphQL(`mutation CreateQuoteMetaobject($metaobject: MetaobjectCreateInput!) { metaobjectCreate(metaobject: $metaobject) { metaobject { id handle type } userErrors { field message code } } }`, { metaobject: { type: config.metaobjectType, handle: quote.id, fields } });
  const errors = data.metaobjectCreate.userErrors;
  if (errors.length) throw new Error(`Metaobject niet aangemaakt: ${errors.map(e => e.message).join(', ')}`);
  return data.metaobjectCreate.metaobject;
}

async function saveQuoteLocally(quote) {
  const filePath = path.join(config.dataDir, 'quotes.json');
  let list = [];
  try { list = JSON.parse(await readFile(filePath, 'utf8')); } catch { list = []; }
  list.unshift(quote);
  await writeFile(filePath, JSON.stringify(list, null, 2));
}

function transporter() {
  return nodemailer.createTransport({ host: process.env.SMTP_HOST || 'smtp.transip.email', port: Number(process.env.SMTP_PORT || 465), secure: String(process.env.SMTP_SECURE || 'true') === 'true', auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
}

function adminEmailHtml(quote) {
  const adminUrl = `${config.baseUrl}/admin/quotes/${encodeURIComponent(quote.id)}`;
  const portalUrl = quote.portalToken ? `${config.baseUrl}/portal/${quote.portalToken}` : `${config.baseUrl}/portal/${quote.id}`;
  const rows = [['Quote ID', quote.id], ['Naam', quote.name], ['E-mail', quote.email], ['Telefoon', quote.phone], ['Materiaal', quote.material], ['Kleur', quote.color], ['Spoed', quote.rush], ['Bestand', quote.fileOriginalName], ['Download', quote.fileUrl], ['Open aanvraag', adminUrl], ['Klantportaal', portalUrl], ['Opmerking', quote.note || '-'], ['Shopify customer ID', quote.customerId || '-'], ['Metaobject ID', quote.metaobjectId || '-']];
  if (quote.customerNote) rows.push(['Klantkoppeling', quote.customerNote]);
  if (quote.metaobjectError) rows.push(['Shopify waarschuwing', quote.metaobjectError]);
  return `<div style="font-family:Arial,sans-serif;line-height:1.55;color:#101820"><h1>Nieuwe offerte-aanvraag via pr3nt.nl</h1><p><strong>Status:</strong> ${quoteStatusLabel(quote.status)}</p><p><a href="${adminUrl}" style="display:inline-block;background:#101820;color:#fff;text-decoration:none;padding:12px 18px;border-radius:999px;font-weight:700">Open in pr3nt Dashboard</a></p><table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:760px">${rows.map(([label, value]) => `<tr><td style="border-bottom:1px solid #eee;font-weight:bold;width:180px">${label}</td><td style="border-bottom:1px solid #eee">${value || '-'}</td></tr>`).join('')}</table></div>`;
}

function customerEmailHtml(quote) {
  const portalUrl = quote.portalToken ? `${config.baseUrl}/portal/${quote.portalToken}` : `${config.baseUrl}/portal/${quote.id}`;
  return `<div style="margin:0;padding:0;background:#f4f6f5;font-family:Arial,sans-serif;color:#101820"><div style="max-width:640px;margin:0 auto;padding:28px 16px"><div style="background:#ffffff;border-radius:24px;overflow:hidden;border:1px solid #e5e7eb"><div style="padding:28px;background:#101820;color:#ffffff"><div style="font-size:24px;font-weight:900;letter-spacing:-.04em">pr3nt.nl</div><h1 style="margin:22px 0 8px;font-size:32px;line-height:1.05">Je aanvraag is ontvangen</h1><p style="margin:0;color:#d7dde0;font-size:16px">We gaan je 3D-bestand bekijken en zetten de volgende stap klaar in je portaal.</p></div><div style="padding:28px"><p style="font-size:16px;line-height:1.6">Hoi ${quote.name},</p><p style="font-size:16px;line-height:1.6">Je 3D-print aanvraag is goed binnengekomen. Via je persoonlijke portaal kun je de status volgen, je offerte bekijken, berichten sturen en later je verzending volgen.</p><p style="margin:24px 0"><a href="${portalUrl}" style="display:inline-block;background:#00d084;color:#082115;text-decoration:none;padding:14px 20px;border-radius:999px;font-weight:800">Open mijn klantportaal</a></p><div style="background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:16px;margin-top:18px"><strong>Samenvatting</strong><br>Materiaal: ${quote.material}<br>Kleur: ${quote.color}<br>Spoed: ${quote.rush}<br>Bestand: ${quote.fileOriginalName}</div><p style="font-size:14px;color:#667085;line-height:1.5;margin-top:22px">Werkt de knop niet? Kopieer deze link naar je browser:<br><span style="word-break:break-all">${portalUrl}</span></p><p style="font-size:16px;line-height:1.6">Groet,<br><strong>pr3nt.nl</strong></p></div></div></div></div>`;
}

async function sendEmails(quote) {
  const mailer = transporter();
  const from = process.env.MAIL_FROM || process.env.SMTP_USER;
  const to = process.env.MAIL_TO || 'bestellingen@pr3nt.nl';
  await mailer.sendMail({ from, to, replyTo: quote.email, subject: `Nieuwe offerte-aanvraag van ${quote.name}`, html: adminEmailHtml(quote) });
  await mailer.sendMail({ from, to: quote.email, subject: 'Je pr3nt-aanvraag is ontvangen · volg je project in je portaal', html: customerEmailHtml(quote) });
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, app: 'pr3nt-shopify-quote-app', auth: config.shopifyToken ? 'admin-access-token' : 'client-credentials', customersEnabled: config.customersEnabled, metaobjectsEnabled: config.metaobjectsEnabled });
});

registerAdminRoutes(app);
registerSelfServiceRoutes(app);
registerPortalRoutes(app);

app.get('/files/:quoteId/:fileName', async (req, res) => {
  const { quoteId, fileName } = req.params;
  const safeQuoteId = quoteId.replace(/[^a-zA-Z0-9_-]/g, '');
  const safeFileName = fileName.replace(/[^a-zA-Z0-9._-]/g, '');
  res.download(path.join(config.uploadDir, `${safeQuoteId}-${safeFileName}`));
});

app.post('/api/quote', upload.single('file'), async (req, res) => {
  try {
    const uploadedFile = req.file;
    if (!uploadedFile) throw new Error('Upload een 3D-bestand.');
    const quoteId = `quote-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const ext = path.extname(uploadedFile.originalname).toLowerCase();
    const safeOriginalName = uploadedFile.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    const finalFileName = `${quoteId}-${safeOriginalName}`;
    await import('node:fs/promises').then(fs => fs.rename(uploadedFile.path, path.join(config.uploadDir, finalFileName)));
    const quote = { id: quoteId, portalToken: randomUUID(), status: 'received', createdAt: new Date().toISOString(), name: clean(req.body.name, 200), email: clean(req.body.email, 200), phone: clean(req.body.phone, 80), material: clean(req.body.material, 20) || 'PLA', color: clean(req.body.color, 120), rush: clean(req.body.rush, 10) || 'Nee', note: clean(req.body.note, 3000), messages: [], fileOriginalName: uploadedFile.originalname, fileStoredName: finalFileName, fileExtension: ext, fileUrl: `${config.baseUrl}/files/${quoteId}/${encodeURIComponent(safeOriginalName)}` };
    if (!quote.name || !quote.email || !quote.phone || !quote.color) throw new Error('Niet alle verplichte velden zijn ingevuld.');
    const customer = await findOrCreateCustomer(quote);
    if (customer) quote.customerId = customer.id;
    else { quote.customerId = ''; quote.customerNote = config.customersEnabled ? 'Klant kon niet automatisch worden gekoppeld.' : 'Klant wordt handmatig aangemaakt in Shopify.'; }
    if (config.metaobjectsEnabled) {
      try { const metaobject = await createQuoteMetaobject(quote); quote.metaobjectId = metaobject?.id || ''; } catch (error) { quote.metaobjectError = error.message; console.warn(error.message); }
    } else quote.metaobjectId = '';
    await saveQuoteLocally(quote);
    await sendEmails(quote);
    res.json({ ok: true, quoteId, redirect: config.successUrl, portalUrl: `${config.baseUrl}/portal/${quote.portalToken}` });
  } catch (error) {
    console.error(error);
    res.status(400).json({ ok: false, error: error.message || 'De aanvraag kon niet worden verwerkt.' });
  }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(400).json({ ok: false, error: error.message || 'Er ging iets mis.' });
});

app.listen(config.port, () => console.log(`pr3nt quote app running on port ${config.port}`));
