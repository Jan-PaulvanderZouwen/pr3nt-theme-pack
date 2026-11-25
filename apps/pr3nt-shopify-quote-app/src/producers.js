// Externe producenten: wie mag welke order zien, wat verdienen ze eraan en wat mogen ze tegen de klant zeggen.
// De klant ziet altijd alleen Pr3nt: berichten van een producent gaan als Pr3nt het gesprek in.
import { calculateProductionPrice } from './productionpricing.js';
import { isAdmin, isWorker, isProducer, chargedShipping, isPickup } from './myparcel.js';

function money(value) {
  const number = Number(String(value ?? '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

// Productiefase van een betaalde order.
export function phaseOf(quote = {}) {
  if (quote.status === 'ready_to_ship') return 'ship';
  if (quote.status === 'paid' && !quote.producer) return 'new';
  return 'making';
}

export function inProduction(quote = {}) {
  return !quote.archivedAt && ['paid', 'print_queue', 'ready_to_ship'].includes(quote.status);
}

// Eigen team ziet alles. Een producent ziet nieuwe orders (nog van niemand) en zijn eigen orders.
export function canSee(user, quote = {}) {
  if (isWorker(user)) return true;
  if (!isProducer(user)) return false;
  return quote.producer === user.username || (phaseOf(quote) === 'new' && inProduction(quote));
}

// Wat een producent kan en wil: pauze (geen nieuwe orders) en welke materialen hij print.
export function materialsOf(account = {}) {
  return String(account.materials || '').split(/[,;\n]/).map((item) => item.trim().toLowerCase()).filter(Boolean);
}
export function fitsProducer(account, quote = {}) {
  if (!account) return true;
  if (account.paused === 'on') return false;
  const list = materialsOf(account);
  if (!list.length || !quote.material) return true;
  const material = String(quote.material).toLowerCase();
  return list.some((item) => material.includes(item) || item.includes(material));
}
export function accountOf(user, settings = {}) {
  return (settings.users || []).find((account) => account.username === user?.username) || null;
}
// Mag deze producent deze nieuwe order zien en accepteren? Zijn eigen orders ziet hij altijd.
export function offeredTo(user, quote, settings) {
  if (!canSee(user, quote)) return false;
  if (!isProducer(user) || quote.producer === user.username) return true;
  return fitsProducer(accountOf(user, settings), quote);
}

export function isMine(user, quote = {}) {
  if (isWorker(user)) return true;
  return isProducer(user) && quote.producer === user.username;
}

// Vergoeding voor de producent: printen (automatisch berekend of door jou ingevuld) plus verzenden.
// Pr3nt betaalt het verzendlabel zelf; de producent krijgt een vast bedrag voor inpakken en wegbrengen.
export function shipFee() {
  const value = money(process.env.PRODUCTION_SHIP_FEE);
  return value > 0 ? value : 1.5;
}

export function producerFee(quote = {}) {
  if (quote.producerFee && quote.producerFee.total) return quote.producerFee;
  // Handmatig ingevuld bedrag wint; anders berekenen over de regels zonder verzendkosten (die betaalt Pr3nt zelf).
  const manual = quote.productionAmountSource !== 'auto' ? money(quote.productionAmount) : 0;
  const printLines = (Array.isArray(quote.quoteLines) ? quote.quoteLines : []).filter((line) => !/verzend|shipping|porto/i.test(`${line.label || ''}`));
  const print = manual || calculateProductionPrice({ ...quote, quoteLines: printLines }).amount || 0;
  const ships = chargedShipping(quote) && !isPickup(quote);
  const ship = ships ? shipFee() : 0;
  return { print: round(print), ship: round(ship), total: round(print + ship) };
}

function round(value) { return Math.round(money(value) * 100) / 100; }

// ---------- Berichten aan de klant ----------

const blockedWords = ['instagram', 'insta', 'facebook', 'tiktok', 'whatsapp', 'telegram', 'linkedin', 'youtube', 'pinterest', 'etsy', 'marktplaats', 'bol.com', 'kvk', 'mijn bedrijf', 'ons bedrijf', 'mijn zaak', 'mijn webshop', 'mijn website', 'onze website', 'rechtstreeks', 'buiten pr3nt', 'zonder pr3nt'];

function normalize(text = '') {
  return String(text).toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '');
}

// Geeft een reden terug als het bericht niet door mag, anders ''.
export function blockedReason(text = '', user = {}) {
  const raw = String(text);
  const plain = normalize(raw);
  if (/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/i.test(raw)) return 'een e-mailadres';
  const withoutOwn = raw.replace(/(https?:\/\/)?([a-z]+\.)?pr3nt\.nl\S*/gi, '');
  if (/https?:\/\/|www\.|\b[a-z0-9-]{2,}\.(nl|com|be|de|eu|net|org|shop|store|io|info)\b/i.test(withoutOwn)) return 'een website of link';
  if (/(\+|00)\d{2}[\s-]?\d|(^|\D)0\d([\s-]?\d){8}(\D|$)/.test(raw)) return 'een telefoonnummer';
  if (/(^|\s)@[a-z0-9_.]{3,}/i.test(raw)) return 'een social-media-account';
  const word = blockedWords.find((item) => plain.includes(item));
  if (word) return `het woord “${word}”`;
  const company = normalize(user.company || '').trim();
  if (company.length >= 3 && plain.includes(company)) return 'je bedrijfsnaam';
  const parts = company.split(/[^a-z0-9]+/).filter((part) => part.length >= 5 && !['print', 'prints', 'printing', 'studio', 'design'].includes(part));
  const hit = parts.find((part) => plain.includes(part));
  if (hit) return 'je bedrijfsnaam';
  return '';
}

export const contactRule = 'Je praat met de klant namens Pr3nt. Noem geen bedrijfsnaam, website, e-mailadres, telefoonnummer of social media. Berichten waarin dat staat, worden niet verstuurd.';

// Welke berichten een producent ziet: alleen het gesprek sinds hij de order heeft, zonder systeemregels en prijsonderhandeling.
export function producerConversation(quote = {}, user = {}) {
  const since = isAdmin(user) || isWorker(user) ? '' : String(quote.producerAcceptedAt || '9999');
  return (Array.isArray(quote.messages) ? quote.messages : []).filter((message) => {
    if (!message || !message.text) return false;
    if (since && String(message.createdAt || '') < since) return false;
    if (message.from === 'pr3nt' && !message.producer && /myparcel|verzendlabel|betaal|offerte|webshop ontvangen/i.test(message.text)) return false;
    return true;
  });
}
