// Geheime sleutel waarmee de inlog-cookie van het beheer wordt ondertekend.
// Volgorde: INTERNAL_SESSION_SECRET, ADMIN_KEY of PRINT_WORKER_KEY uit .env. Staat daar niets, dan maken we
// eenmalig een willekeurige sleutel in de datamap. Nooit een vaste tekst: die staat in de code en is dus openbaar.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes } from 'node:crypto';

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const secretFile = path.join(path.resolve(appRoot, process.env.DATA_DIR || 'data'), '.session-secret');
let generated = '';

function storedSecret() {
  if (generated) return generated;
  try {
    if (existsSync(secretFile)) generated = readFileSync(secretFile, 'utf8').trim();
    if (generated.length < 32) {
      generated = randomBytes(32).toString('hex');
      mkdirSync(path.dirname(secretFile), { recursive: true });
      writeFileSync(secretFile, generated, { mode: 0o600 });
    }
  } catch (error) {
    // Kan de datamap niet beschreven worden, dan geldt de sleutel tot de volgende herstart.
    generated = generated.length >= 32 ? generated : randomBytes(32).toString('hex');
    console.error('[sessie] kon geen sleutel opslaan:', error.message);
  }
  return generated;
}

export function sessionSecret() {
  return process.env.INTERNAL_SESSION_SECRET || process.env.ADMIN_KEY || process.env.PRINT_WORKER_KEY || storedSecret();
}
