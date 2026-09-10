import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

const oldTemplate = `const quoteTemplate=[["Fillament","€0,12 per gram","","0,12"],["Print-uren","€0,35 per uur","","0,35"],["Verwerkingskosten","","1","7,50"],["Verzendkosten","incl. track & trace","1","6,55"],["Verpakkingskosten","","1","3,50"]];`;

const newTemplate = `const quoteTemplate=[["Fillament","€0,12 per gram","","0,12"],["Print-uren","€0,35 per uur","","0,35"],["Verwerkingskosten","","1","7,50"],["Verzendkosten","incl. track & trace","1","7,95"],["Verpakkingskosten","","1","3,50"],["BTW 21%","Wordt automatisch berekend over het subtotaal","",""]];`;

function escapeHtml(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function cleanMoney(value = '') {
  return String(value || '').replace(/[^0-9,.-]/g, '').replace(',', '.').trim().slice(0, 30);
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

function productionAmountField(quote = {}) {
  const value = quote.productionAmount || quote.productionOfferAmount || quote.productionPrice || '';
  return `<label><span>Productiebedrag</span><input name="productionAmount" value="${escapeHtml(value)}" placeholder="Bijv. 12,50"><small class="muted">Bedrag dat je aan productie biedt. Alleen zichtbaar in beheer en werkportaal.</small></label>`;
}

function decorateAdminQuotePage(html, quote) {
  let output = html;
  if (!output.includes('name="productionAmount"')) {
    output = output.replace(/<label><span>Interne notitie<\/span><textarea name="internalNote">/, `${productionAmountField(quote)}<label><span>Interne notitie</span><textarea name="internalNote">`);
  }
  output = output.replace(oldTemplate, newTemplate);
  output = output.replace('Start met één regel, of laad de standaard pr3nt-offerte in.', 'Start met één regel, of laad de standaard pr3nt-offerte in. Bedragen zijn excl. btw; 21% btw wordt automatisch apart berekend.');
  output = output.replace(/Verzendkosten([\s\S]{0,120}?)6,55/g, 'Verzendkosten$17,95');
  return output;
}

export function registerQuoteTemplateRoutes(app) {
  app.use('/admin/quotes/:id', async (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      Promise.resolve().then(async () => {
        if (typeof body !== 'string') return originalSend(body);
        const quotes = await readQuotes();
        const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt) || {};
        return originalSend(decorateAdminQuotePage(body, quote));
      }).catch(() => originalSend(body));
      return res;
    };
    return next();
  });

  app.use('/admin/quotes/:id', async (req, _res, next) => {
    if (req.method !== 'POST') return next();
    if (!Object.prototype.hasOwnProperty.call(req.body || {}, 'productionAmount')) return next();
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.id === req.params.id && !item.archivedAt);
    if (quote) {
      quote.productionAmount = cleanMoney(req.body.productionAmount);
      quote.updatedAt = new Date().toISOString();
      await writeQuotes(quotes);
    }
    return next();
  });

  app.use('/admin', (req, res, next) => {
    if (req.method !== 'GET') return next();
    const originalSend = res.send.bind(res);
    res.send = (body) => {
      if (typeof body === 'string') {
        let output = body.replace(oldTemplate, newTemplate);
        output = output.replace('Start met één regel, of laad de standaard pr3nt-offerte in.', 'Start met één regel, of laad de standaard pr3nt-offerte in. Bedragen zijn excl. btw; 21% btw wordt automatisch apart berekend.');
        output = output.replace(/Verzendkosten([\s\S]{0,120}?)6,55/g, 'Verzendkosten$17,95');
        return originalSend(output);
      }
      return originalSend(body);
    };
    return next();
  });
}
