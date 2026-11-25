// Wie heeft welke order? Eén klein bestand per order in data/claims/.
// Het bestand wordt met de vlag 'wx' gemaakt: het besturingssysteem laat dat maar één keer slagen,
// ook als twee producenten op exact hetzelfde moment op Accepteren drukken (of de app in meerdere processen draait).
// quotes.json wordt door veel onderdelen in zijn geheel herschreven; raakt de producent daar ooit kwijt,
// dan zet readQuotes() hem vanuit de claim terug, zodat een order nooit opnieuw 'nieuw' wordt.
import { mkdir, open, readFile, readdir, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '..', process.env.DATA_DIR || 'data');
const claimsDir = path.join(dataDir, 'claims');

function fileFor(id) {
  const safe = String(id || '').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120);
  if (!safe) throw new Error('Geen order-id.');
  return path.join(claimsDir, `${safe}.json`);
}

export async function readClaim(id) {
  try { return JSON.parse(await readFile(fileFor(id), 'utf8')); } catch { return null; }
}

// Probeert de order te claimen. Geeft { ok: true } of { ok: false, claim } (de bestaande claim) terug.
// releasedAt: wanneer de beheerder de order voor het laatst weer vrijgaf; oudere claims tellen dan niet meer.
export async function claimOrder(id, data, { releasedAt = '' } = {}) {
  await mkdir(claimsDir, { recursive: true });
  const record = { id, ...data, at: data.at || new Date().toISOString() };
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(fileFor(id), 'wx');
      try { await handle.writeFile(JSON.stringify(record, null, 2)); } finally { await handle.close(); }
      return { ok: true, claim: record };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readClaim(id);
      if (existing && existing.producer === record.producer) return { ok: true, claim: existing };
      const stale = !existing || existing.released || (releasedAt && String(existing.at || '') < String(releasedAt));
      if (!stale || attempt) return { ok: false, claim: existing };
      await unlink(fileFor(id)).catch(() => {});
    }
  }
  return { ok: false, claim: null };
}

// Beheerder kiest zelf een producent (of zichzelf): dat overschrijft een bestaande claim.
export async function setClaim(id, data) {
  await mkdir(claimsDir, { recursive: true });
  const record = { id, ...data, at: data.at || new Date().toISOString() };
  await writeFile(fileFor(id), JSON.stringify(record, null, 2));
  return record;
}

export async function releaseClaim(id) {
  await unlink(fileFor(id)).catch(() => {});
}

export async function readClaims() {
  let names = [];
  try { names = await readdir(claimsDir); } catch { return new Map(); }
  const claims = new Map();
  await Promise.all(names.filter((name) => name.endsWith('.json')).map(async (name) => {
    try { const claim = JSON.parse(await readFile(path.join(claimsDir, name), 'utf8')); if (claim?.id && claim.producer) claims.set(String(claim.id), claim); } catch { /* half geschreven: volgende keer */ }
  }));
  return claims;
}

// Zet een kwijtgeraakte producent terug vanuit zijn claim. Geeft true als er iets veranderde.
export function applyClaims(quotes = [], claims = new Map()) {
  let changed = false;
  for (const quote of quotes) {
    if (!quote || quote.producer) continue;
    const claim = claims.get(String(quote.id));
    if (!claim || (quote.producerReleasedAt && String(claim.at || '') < String(quote.producerReleasedAt))) continue;
    quote.producer = claim.producer;
    quote.producerAcceptedAt = claim.at;
    if (claim.fee && claim.fee.total) quote.producerFee = claim.fee;
    if (quote.status === 'paid') quote.status = 'print_queue';
    changed = true;
  }
  return changed;
}
