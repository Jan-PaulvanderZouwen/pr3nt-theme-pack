import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const quotesFilePath = path.join(dataDir, 'quotes.json');

function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function fmt(value) {
  return money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function setting(name, fallback) {
  const value = money(process.env[name]);
  return value > 0 ? value : fallback;
}

function quoteLines(quote = {}) {
  if (Array.isArray(quote.quoteLines) && quote.quoteLines.length) return quote.quoteLines;
  if (quote.quoteAmount) return [{ label: 'Offertebedrag', qty: '1', unit: quote.quoteAmount }];
  return [];
}

function lineTotal(line = {}) {
  return money(line.qty || 1) * money(line.unit || 0);
}

function quoteSubtotal(quote = {}) {
  return quoteLines(quote).reduce((sum, line) => sum + lineTotal(line), 0);
}

function labelIncludes(line = {}, words = []) {
  const text = `${line.label || ''} ${line.description || ''}`.toLowerCase();
  return words.some((word) => text.includes(word));
}

function quotePrintHours(quote = {}) {
  const line = quoteLines(quote).find((item) => labelIncludes(item, ['print-uren', 'printuren', 'print uren', 'printtijd', 'print time']));
  return money(line?.qty || line?.quantity || 0);
}

function quoteMaterialGrams(quote = {}) {
  const line = quoteLines(quote).find((item) => labelIncludes(item, ['fillament', 'filament', 'materiaal', 'gram']));
  return money(line?.qty || line?.quantity || 0);
}

export function calculateProductionPrice(quote = {}) {
  const subtotal = quoteSubtotal(quote);
  if (subtotal <= 0) return { amount: 0, hours: 0, grams: 0, subtotal: 0, capped: false };

  const hours = quotePrintHours(quote);
  const grams = quoteMaterialGrams(quote);
  const hourlyRate = setting('PRODUCTION_HOUR_RATE', 0.20);
  const gramRate = setting('PRODUCTION_GRAM_RATE', 0.06);
  const startFee = setting('PRODUCTION_START_FEE', 2.50);
  const fallbackPercentage = setting('PRODUCTION_FALLBACK_PERCENTAGE', 0.45);
  const maxPercentage = setting('PRODUCTION_MAX_PERCENTAGE', 0.65);

  let calculated = (hours * hourlyRate) + (grams * gramRate) + startFee;
  if (!hours && !grams) calculated = subtotal * fallbackPercentage;

  const maxAmount = subtotal * maxPercentage;
  const amount = Math.max(0, Math.min(calculated, maxAmount));

  return {
    amount,
    hours,
    grams,
    subtotal,
    hourlyRate,
    gramRate,
    startFee,
    fallbackPercentage,
    maxPercentage,
    capped: calculated > maxAmount,
  };
}

export function applyAutomaticProductionPrice(quote = {}) {
  const current = String(quote.productionAmount || '').trim();
  if (current && quote.productionAmountSource !== 'auto') return false;

  const result = calculateProductionPrice(quote);
  if (result.amount <= 0) return false;

  const nextAmount = fmt(result.amount);
  const changed = quote.productionAmount !== nextAmount || quote.productionAmountSource !== 'auto';
  quote.productionAmount = nextAmount;
  quote.productionAmountSource = 'auto';
  quote.productionHours = String(result.hours || '');
  quote.productionGrams = String(result.grams || '');
  quote.productionPricing = {
    subtotal: fmt(result.subtotal),
    hourlyRate: fmt(result.hourlyRate),
    gramRate: fmt(result.gramRate),
    startFee: fmt(result.startFee),
    maxPercentage: result.maxPercentage,
    capped: result.capped,
  };
  return changed;
}

async function updateMissingProductionPrices() {
  let quotes = [];
  try {
    quotes = JSON.parse(await readFile(quotesFilePath, 'utf8'));
    if (!Array.isArray(quotes)) quotes = [];
  } catch {
    quotes = [];
  }

  let changed = false;
  for (const quote of quotes) {
    if (quote.archivedAt) continue;
    if (applyAutomaticProductionPrice(quote)) changed = true;
  }
  if (changed) await writeFile(quotesFilePath, JSON.stringify(quotes, null, 2));
  return changed;
}

export function registerProductionPricingRoutes(app) {
  app.use((req, res, next) => {
    const shouldUpdateBeforeRender = req.method === 'GET' && (
      req.path === '/admin' ||
      req.path.startsWith('/admin/work')
    );
    if (shouldUpdateBeforeRender) {
      updateMissingProductionPrices().catch((error) => console.warn('Productieprijs automatisch berekenen mislukt:', error.message)).finally(next);
      return;
    }
    next();
  });

  app.use((req, res, next) => {
    const shouldUpdateAfterSave = req.method === 'POST' && (
      req.path.startsWith('/admin/quotes/') ||
      req.path.startsWith('/admin/work/quotes/')
    );
    if (shouldUpdateAfterSave) {
      res.on('finish', () => {
        updateMissingProductionPrices().catch((error) => console.warn('Productieprijs automatisch berekenen mislukt:', error.message));
      });
    }
    next();
  });
}
