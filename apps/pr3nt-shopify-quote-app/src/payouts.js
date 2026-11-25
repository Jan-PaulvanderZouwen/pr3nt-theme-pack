// Uitbetalen aan producenten.
// Een order telt als verdiend zodra hij verzonden is. Jij zet per producent een uitbetaling klaar (alles wat open staat),
// maakt het geld over (los of in één keer met een SEPA-bestand voor je bank) en markeert hem als betaald. De producent krijgt dan een mail.
// Filament dat een producent bij Pr3nt koopt, gaat van de eerstvolgende uitbetaling af.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { producerFee } from './producers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', process.env.DATA_DIR || 'data');
const payoutsFile = path.join(dataDir, 'payouts.json');

function money(value) { const number = Number(String(value ?? '0').replace(',', '.')); return Number.isFinite(number) ? number : 0; }
export function round(value) { return Math.round(money(value) * 100) / 100; }
function clean(value = '', max = 200) { return String(value || '').replace(/[<>]/g, '').trim().slice(0, max); }

export async function readPayouts() {
  try {
    const data = JSON.parse(await readFile(payoutsFile, 'utf8'));
    return { payouts: Array.isArray(data.payouts) ? data.payouts : [], charges: Array.isArray(data.charges) ? data.charges : [] };
  } catch { return { payouts: [], charges: [] }; }
}

// Alle wijzigingen na elkaar, zodat twee klikken tegelijk elkaar niet overschrijven.
let queue = Promise.resolve();
export function updatePayouts(change) {
  const run = queue.then(async () => {
    const data = await readPayouts();
    const result = await change(data);
    await mkdir(dataDir, { recursive: true });
    await writeFile(payoutsFile, JSON.stringify(data, null, 2));
    return result;
  });
  queue = run.catch(() => {});
  return run;
}

// ---------- IBAN ----------

export function normalizeIban(value = '') { return String(value || '').replace(/[\s.-]/g, '').toUpperCase(); }
export function validIban(value = '') {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  const moved = `${iban.slice(4)}${iban.slice(0, 4)}`.replace(/[A-Z]/g, (letter) => String(letter.charCodeAt(0) - 55));
  let rest = 0;
  for (const digit of moved) rest = (rest * 10 + Number(digit)) % 97;
  return rest === 1;
}
export function formatIban(value = '') { return normalizeIban(value).replace(/(.{4})/g, '$1 ').trim(); }

// ---------- Wat is verdiend ----------

const doneStatuses = new Set(['shipped', 'delivered']);
export function isEarned(quote = {}) {
  if (!quote.producer) return false;
  if (doneStatuses.has(quote.status)) return true;
  return quote.status === 'archived' && doneStatuses.has(quote.previousStatus);
}
export const earnedAt = (quote = {}) => String(quote.shippedAt || quote.deliveredAt || quote.updatedAt || quote.producerAcceptedAt || '');
export const orderLabel = (quote = {}) => [quote.material, quote.color].filter(Boolean).join(' ') || 'Print';

export function feeLine(quote = {}) {
  const fee = quote.producerFee?.total ? quote.producerFee : producerFee(quote);
  return { id: quote.id, label: orderLabel(quote), print: round(fee.print), ship: round(fee.ship), total: round(fee.total), shippedAt: earnedAt(quote) };
}

function paidOutIds(data) {
  const orders = new Set();
  const charges = new Set();
  data.payouts.forEach((payout) => { (payout.orders || []).forEach((order) => orders.add(order.id)); (payout.charges || []).forEach((charge) => charges.add(charge.id)); });
  return { orders, charges };
}

// Saldo van één producent: verdiend en nog niet in een uitbetaling, min verstuurd filament.
export function balanceOf(username, quotes = [], data = { payouts: [], charges: [] }) {
  const used = paidOutIds(data);
  const orders = quotes.filter((quote) => quote.producer === username && isEarned(quote) && !used.orders.has(quote.id)).map(feeLine).sort((a, b) => a.shippedAt.localeCompare(b.shippedAt));
  const charges = data.charges.filter((charge) => charge.producer === username && charge.status === 'verstuurd' && !used.charges.has(charge.id)).map((charge) => ({ id: charge.id, label: charge.label, amount: round(charge.amount) }));
  const ordersTotal = round(orders.reduce((sum, order) => sum + order.total, 0));
  const chargesTotal = round(charges.reduce((sum, charge) => sum + charge.amount, 0));
  const making = quotes.filter((quote) => quote.producer === username && !quote.archivedAt && ['paid', 'print_queue', 'ready_to_ship'].includes(quote.status));
  const coming = round(making.reduce((sum, quote) => sum + feeLine(quote).total, 0));
  const waiting = data.payouts.filter((payout) => payout.producer === username && payout.status === 'open');
  const paid = data.payouts.filter((payout) => payout.producer === username && payout.status === 'paid');
  return {
    orders, charges, ordersTotal, chargesTotal, total: round(ordersTotal - chargesTotal),
    making, coming,
    waiting, waitingTotal: round(waiting.reduce((sum, payout) => sum + money(payout.total), 0)),
    paid, paidTotal: round(paid.reduce((sum, payout) => sum + money(payout.total), 0)),
  };
}

function nextReference(data, date = new Date()) {
  const prefix = `UB-${date.toISOString().slice(0, 7)}`;
  const count = data.payouts.filter((payout) => String(payout.reference || '').startsWith(prefix)).length;
  return `${prefix}-${String(count + 1).padStart(3, '0')}`;
}

// Zet alles wat open staat voor deze producent in één uitbetaling.
export async function createPayout(account, quotes) {
  return updatePayouts((data) => {
    const balance = balanceOf(account.username, quotes, data);
    if (!balance.orders.length && !balance.charges.length) throw new Error('Er staat niks open voor deze producent.');
    if (balance.total <= 0) throw new Error('Het saldo is nul of negatief (meer filament dan verdiend). Wacht tot er meer orders verzonden zijn.');
    const now = new Date();
    const payout = {
      id: randomUUID(),
      reference: nextReference(data, now),
      producer: account.username,
      name: account.name || account.username,
      iban: normalizeIban(account.iban || ''),
      accountName: account.accountName || account.name || '',
      from: balance.orders[0]?.shippedAt || '',
      to: balance.orders[balance.orders.length - 1]?.shippedAt || '',
      orders: balance.orders,
      charges: balance.charges,
      ordersTotal: balance.ordersTotal,
      chargesTotal: balance.chargesTotal,
      total: balance.total,
      status: 'open',
      createdAt: now.toISOString(),
    };
    data.payouts.push(payout);
    return payout;
  });
}

export async function markPayoutPaid(id) {
  return updatePayouts((data) => {
    const payout = data.payouts.find((item) => item.id === id);
    if (!payout) throw new Error('Uitbetaling niet gevonden.');
    if (payout.status === 'paid') return { payout, already: true };
    payout.status = 'paid';
    payout.paidAt = new Date().toISOString();
    return { payout, already: false };
  });
}

export async function cancelPayout(id) {
  return updatePayouts((data) => {
    const index = data.payouts.findIndex((item) => item.id === id && item.status === 'open');
    if (index < 0) throw new Error('Alleen een uitbetaling die nog niet betaald is, kun je annuleren.');
    return data.payouts.splice(index, 1)[0];
  });
}

// ---------- Filament kopen bij Pr3nt ----------

export function filamentPricePerKg() { const value = money(process.env.PRODUCER_FILAMENT_PRICE_KG); return value > 0 ? value : 22.5; }

export async function requestFilament(account, { color, type, kilos, note }) {
  const kg = Math.max(1, Math.min(20, Math.round(money(kilos) || 1)));
  const amount = round(kg * filamentPricePerKg());
  const charge = { id: randomUUID(), producer: account.username, name: account.name || account.username, kind: 'filament', color: clean(color, 60), type: clean(type, 30), kilos: kg, note: clean(note, 300), amount, label: `Filament ${clean(type, 30)} ${clean(color, 60)} · ${kg} kg`.replace(/\s+/g, ' '), status: 'aangevraagd', createdAt: new Date().toISOString() };
  await updatePayouts((data) => { data.charges.push(charge); });
  return charge;
}

export async function setChargeStatus(id, status) {
  if (!['verstuurd', 'afgewezen', 'aangevraagd'].includes(status)) throw new Error('Onbekende status.');
  return updatePayouts((data) => {
    const charge = data.charges.find((item) => item.id === id);
    if (!charge) throw new Error('Aanvraag niet gevonden.');
    const used = paidOutIds(data);
    if (used.charges.has(charge.id)) throw new Error('Deze aanvraag is al verrekend.');
    charge.status = status;
    charge.updatedAt = new Date().toISOString();
    return charge;
  });
}

// ---------- Export ----------

function csvCell(value) { const text = String(value ?? ''); return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text; }
const nl = (value) => round(value).toFixed(2).replace('.', ',');

export function payoutsCsv(payouts = []) {
  const rows = [['Kenmerk', 'Producent', 'IBAN', 'Tenaamstelling', 'Status', 'Order/regel', 'Omschrijving', 'Printen', 'Verzenden', 'Bedrag']];
  payouts.forEach((payout) => {
    payout.orders.forEach((order) => rows.push([payout.reference, payout.name, formatIban(payout.iban), payout.accountName, payout.status === 'paid' ? 'Betaald' : 'Open', order.id, order.label, nl(order.print), nl(order.ship), nl(order.total)]));
    (payout.charges || []).forEach((charge) => rows.push([payout.reference, payout.name, formatIban(payout.iban), payout.accountName, payout.status === 'paid' ? 'Betaald' : 'Open', 'filament', charge.label, '', '', nl(-charge.amount)]));
    rows.push([payout.reference, payout.name, formatIban(payout.iban), payout.accountName, payout.status === 'paid' ? 'Betaald' : 'Open', 'TOTAAL', '', '', '', nl(payout.total)]);
  });
  return `﻿${rows.map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`;
}

function xml(value = '') { return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;'); }
// SEPA staat alleen een beperkte tekenset toe.
function sepaText(value = '', max = 70) { return String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9/\-?:().,'+ ]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max); }

export function sepaSettings() {
  return { iban: normalizeIban(process.env.PAYOUT_IBAN || ''), name: process.env.PAYOUT_NAME || 'Pr3nt', bic: String(process.env.PAYOUT_BIC || '').replace(/\s+/g, '').toUpperCase() };
}

// pain.001.001.03: het batchbestand dat elke Nederlandse bank (Rabobank, ING, ABN AMRO, bunq, Knab) accepteert.
export function sepaXml(payouts = [], now = new Date()) {
  const debtor = sepaSettings();
  if (!validIban(debtor.iban)) throw new Error('Zet PAYOUT_IBAN (je eigen zakelijke rekening) en PAYOUT_NAME in .env om een SEPA-bestand te maken.');
  const list = payouts.filter((payout) => payout.status === 'open' && money(payout.total) > 0);
  if (!list.length) throw new Error('Er zijn geen open uitbetalingen.');
  const missing = list.filter((payout) => !validIban(payout.iban));
  if (missing.length) throw new Error(`Geen geldig IBAN bij: ${missing.map((payout) => payout.name).join(', ')}. Laat de producent het invullen bij Account en zet de uitbetaling opnieuw klaar.`);
  const msgId = `PR3NT-${now.toISOString().replace(/\D/g, '').slice(0, 14)}`;
  const sum = round(list.reduce((total, payout) => total + money(payout.total), 0)).toFixed(2);
  const date = now.toISOString().slice(0, 10);
  const agent = debtor.bic ? `<FinInstnId><BIC>${xml(debtor.bic)}</BIC></FinInstnId>` : '<FinInstnId><Othr><Id>NOTPROVIDED</Id></Othr></FinInstnId>';
  const tx = list.map((payout) => `<CdtTrfTxInf><PmtId><EndToEndId>${xml(sepaText(payout.reference, 35))}</EndToEndId></PmtId><Amt><InstdAmt Ccy="EUR">${round(payout.total).toFixed(2)}</InstdAmt></Amt><Cdtr><Nm>${xml(sepaText(payout.accountName || payout.name))}</Nm></Cdtr><CdtrAcct><Id><IBAN>${xml(normalizeIban(payout.iban))}</IBAN></Id></CdtrAcct><RmtInf><Ustrd>${xml(sepaText(`Pr3nt vergoeding ${payout.reference} ${payout.orders.length} orders`, 140))}</Ustrd></RmtInf></CdtTrfTxInf>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><CstmrCdtTrfInitn><GrpHdr><MsgId>${msgId}</MsgId><CreDtTm>${now.toISOString().slice(0, 19)}</CreDtTm><NbOfTxs>${list.length}</NbOfTxs><CtrlSum>${sum}</CtrlSum><InitgPty><Nm>${xml(sepaText(debtor.name))}</Nm></InitgPty></GrpHdr><PmtInf><PmtInfId>${msgId}-1</PmtInfId><PmtMtd>TRF</PmtMtd><BtchBookg>true</BtchBookg><NbOfTxs>${list.length}</NbOfTxs><CtrlSum>${sum}</CtrlSum><PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf><ReqdExctnDt>${date}</ReqdExctnDt><Dbtr><Nm>${xml(sepaText(debtor.name))}</Nm></Dbtr><DbtrAcct><Id><IBAN>${xml(debtor.iban)}</IBAN></Id></DbtrAcct><DbtrAgt>${agent}</DbtrAgt><ChrgBr>SLEV</ChrgBr>${tx}</PmtInf></CstmrCdtTrfInitn></Document>
`;
}
