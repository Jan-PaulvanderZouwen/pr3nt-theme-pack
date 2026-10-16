// Oude site-inhoud (JSON) en geüploade site-media van vóór het website-CMS. Alleen nog lezen;
// beheren doe je in het CMS op /admin/website (src/cms/), dat rechtstreeks met pr3nt.nl praat.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const contentPath = path.join(dataDir, 'site-content.json');
const mediaDir = path.resolve(appRoot, process.env.SITE_MEDIA_DIR || 'uploads/site-media');
const seedPath = path.join(__dirname, 'site-content.seed.json');

export function humanize(value) {
  return String(value).replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

export async function readStore() {
  try {
    const parsed = JSON.parse(await readFile(contentPath, 'utf8'));
    if (parsed?.pages) return parsed;
  } catch {}
  let seed = {};
  try { seed = JSON.parse(await readFile(seedPath, 'utf8')); } catch { seed = {}; }
  const now = new Date().toISOString();
  const pages = Object.fromEntries(Object.entries(seed).map(([key, value]) => [key, { published: value, draft: value, revision: 1, updatedAt: now }]));
  const store = { version: 1, updatedAt: now, pages };
  await mkdir(dataDir, { recursive: true });
  await writeFile(contentPath, JSON.stringify(store, null, 2));
  return store;
}

function publicPage(entry) {
  return { published: entry.published, revision: entry.revision, updatedAt: entry.updatedAt };
}

export function registerSiteContentRoutes(app) {
  app.get('/api/site-content', async (_req, res) => {
    const store = await readStore();
    res.json({ ok: true, pages: Object.fromEntries(Object.entries(store.pages).map(([key, entry]) => [key, publicPage(entry)])), updatedAt: store.updatedAt });
  });

  app.get('/api/site-content/:key', async (req, res) => {
    const store = await readStore();
    const entry = store.pages[req.params.key];
    if (!entry) return res.status(404).json({ ok: false, error: 'Pagina niet gevonden' });
    res.json({ ok: true, key: req.params.key, ...publicPage(entry) });
  });

  app.get('/site-media/:filename', async (req, res) => {
    const safe = path.basename(req.params.filename);
    if (!safe || safe !== req.params.filename) return res.status(404).end();
    res.sendFile(path.join(mediaDir, safe), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }, (error) => { if (error && !res.headersSent) res.status(404).end(); });
  });
}
