import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const uploadDir = path.resolve(appRoot, process.env.UPLOAD_DIR || 'uploads/quotes');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';
const allowedExtensions = new Set(['.stl', '.3mf', '.obj', '.step', '.stp']);

await mkdir(uploadDir, { recursive: true });

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
    accepted: quote.paymentUrl ? 'Na betaling plannen we de print in' : 'Betaallink wordt klaargezet',
    paid: 'Print wordt ingepland',
    print_queue: 'Productie loopt',
    ready_to_ship: 'Verzending wordt voorbereid',
    shipped: 'Onderweg met track & trace',
    delivered: 'Project afgerond',
  };
  return estimates[status] || estimates.received;
}

function selfServiceHtml(quote) {
  const token = encodeURIComponent(quote.portalToken || quote.id);
  const reviewCard = quote.status === 'delivered' ? `<div class="self-card"><span class="eyebrow">Na levering</span><strong>Beoordeling achterlaten</strong><p class="muted">Laat weten hoe de print is bevallen.</p><form method="post" action="/portal/${token}/review" class="self-form"><div class="rating"><label><input type="radio" name="rating" value="5" required> 5</label><label><input type="radio" name="rating" value="4"> 4</label><label><input type="radio" name="rating" value="3"> 3</label></div><textarea name="review" placeholder="Korte review"></textarea><button class="btn btn-light" type="submit">Review versturen</button></form></div>` : '';
  return `<section class="self-grid"><div class="self-card"><span class="eyebrow">Snel regelen</span><strong>Herhaalbestelling</strong><p class="muted">Vraag dezelfde print opnieuw aan. We maken automatisch een nieuw project aan.</p><form method="post" action="/portal/${token}/reorder"><button class="btn btn-light" type="submit">Nog een keer printen</button></form></div><div class="self-card"><span class="eyebrow">Bestand</span><strong>Bestand vervangen</strong><p class="muted">Upload een nieuwe versie en kies direct je materiaaladvies.</p><label class="btn btn-light" for="self-upload-modal">Bestand vervangen</label></div><div class="self-card"><span class="eyebrow">Hulp nodig?</span><strong>Supportvraag</strong><p class="muted">Koppel een vraag direct aan dit project.</p><form method="post" action="/portal/${token}/support" class="self-form"><textarea name="message" placeholder="Waar kunnen we mee helpen?" required></textarea><button class="btn btn-light" type="submit">Vraag versturen</button></form></div>${reviewCard}</section><input class="modal-toggle" type="checkbox" id="self-upload-modal"><div class="modal"><div class="modal-card"><h2>Bestand vervangen</h2><p class="muted">Upload een nieuw model. Wij gebruiken deze versie voor de verdere beoordeling/offerte.</p><form method="post" action="/portal/${token}/selfservice-upload" enctype="multipart/form-data" class="self-form"><input type="file" name="file" accept=".stl,.3mf,.obj,.step,.stp" multiple required><div class="form-grid"><input name="material" placeholder="Materiaal"><input name="color" placeholder="Kleur"></div><label><span>Materiaaladvies</span><select name="materialAdvice"><option value="">Geen voorkeur</option><option value="goedkoopste optie">Goedkoopste optie</option><option value="sterkste optie">Sterkste optie</option><option value="mooiste afwerking">Mooiste afwerking</option><option value="snelste levertijd">Snelste levertijd</option></select></label><textarea name="description" placeholder="Wat is er veranderd aan dit bestand?"></textarea><div class="action-row"><button class="btn btn-primary" type="submit">Uploaden en vervangen</button><label class="btn btn-light" for="self-upload-modal">Annuleren</label></div></form></div></div>`;
}

function enhancePortalHtml(html, quote) {
  if (typeof html !== 'string' || !html.includes('</body>')) return html;
  const css = `<style>.self-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:18px}.self-card{background:#fff;border:1px solid var(--line,#e5e7eb);border-radius:22px;padding:18px;box-shadow:0 12px 36px rgba(16,24,32,.06)}.self-card strong{display:block;font-size:18px;margin:8px 0}.self-form{display:grid;gap:10px}.rating{display:flex;gap:8px;flex-wrap:wrap}.rating label{background:#f5f7f6;border:1px solid var(--line,#e5e7eb);border-radius:999px;padding:8px 12px;font-weight:850}.delivery-pill{background:#f5f7f6;border:1px solid var(--line,#e5e7eb);padding:7px 10px;border-radius:999px;font-weight:850;font-size:13px}@media(max-width:850px){.self-grid{grid-template-columns:1fr}}</style>`;
  let output = html.replace('</head>', `${css}</head>`);
  output = output.replace('</div></div><div class="next-action">', `<span class="delivery-pill">${e(deliveryEstimate(quote))}</span></div></div><div class="next-action">`);
  output = output.replace('<section class="grid"><aside class="card"><h2>Relevante informatie</h2>', `${selfServiceHtml(quote)}<section class="grid"><aside class="card"><h2>Relevante informatie</h2>`);
  return output;
}

export function registerSelfServiceRoutes(app) {
  app.use('/portal/:token', async (req, res, next) => {
    if (req.method !== 'GET' || req.path.endsWith('/account')) return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        const quotes = await readQuotes();
        const quote = findQuote(quotes, req.params.token);
        originalSend(quote ? enhancePortalHtml(body, quote) : body);
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
    const newQuote = {
      ...quote,
      id: `quote-${Date.now()}-${randomUUID().slice(0, 8)}`,
      portalToken: randomUUID(),
      status: 'received',
      createdAt: now,
      updatedAt: now,
      originalQuoteId: quote.id,
      quoteLines: [],
      quoteAmount: '',
      acceptedAt: '',
      paidAt: '',
      quoteSentAt: '',
      paymentUrl: '',
      trackingCode: '',
      messages: [{ from: 'klant', text: `Herhaalbestelling aangevraagd op basis van ${quote.id}.`, createdAt: now }],
    };
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
}
