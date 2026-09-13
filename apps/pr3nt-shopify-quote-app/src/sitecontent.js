import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from './admin.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const contentPath = path.join(dataDir, 'site-content.json');
const mediaDir = path.resolve(appRoot, process.env.SITE_MEDIA_DIR || 'uploads/site-media');
const baseUrl = String(process.env.APP_BASE_URL || 'https://app.pr3nt.nl').replace(/\/$/, '');
const seedPath = path.join(__dirname, 'site-content.seed.json');
const maxContentBytes = 750_000;
let writeQueue = Promise.resolve();

const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => { mkdir(mediaDir, { recursive: true }).then(() => cb(null, mediaDir)).catch(cb); },
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname || '').toLowerCase().replace(/[^a-z0-9.]/g, '');
      cb(null, `${Date.now()}-${randomUUID()}${ext || '.bin'}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['.jpg', '.jpeg', '.png', '.webp', '.avif', '.gif', '.svg']);
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, allowed.has(ext));
  },
});

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}

function humanize(value) {
  return String(value).replace(/[-_]/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (char) => char.toUpperCase());
}

function isLongField(key, value) {
  return typeof value === 'string' && (value.length > 100 || /text|description|intro|answer|caption|note|headline|title|body|seo/i.test(key));
}

function pathAttr(pathValue) {
  return escapeHtml(JSON.stringify(pathValue));
}

function renderFields(value, currentPath = []) {
  if (Array.isArray(value)) {
    return `<div class="repeat-list">${value.map((item, index) => `<fieldset class="repeat-item"><legend>${escapeHtml(`${humanize(currentPath.at(-1) || 'Onderdeel')} ${index + 1}`)}</legend>${renderFields(item, [...currentPath, index])}</fieldset>`).join('')}</div>`;
  }
  if (value && typeof value === 'object') {
    return `<div class="field-grid">${Object.entries(value).map(([key, item]) => {
      const nextPath = [...currentPath, key];
      if (item && typeof item === 'object') return `<fieldset class="group"><legend>${escapeHtml(humanize(key))}</legend>${renderFields(item, nextPath)}</fieldset>`;
      const long = isLongField(key, item);
      const image = typeof item === 'string' && /image|photo|logo|icon|og/i.test(key);
      const control = long ? `<textarea data-site-field data-site-path="${pathAttr(nextPath)}" rows="5">${escapeHtml(item ?? '')}</textarea>` : `<input data-site-field data-site-path="${pathAttr(nextPath)}" type="${image ? 'url' : 'text'}" value="${escapeHtml(item ?? '')}">`;
      return `<label class="field ${long ? 'wide' : ''}"><span>${escapeHtml(humanize(key))}</span>${control}${image ? '<small>Gebruik een volledige afbeeldings-URL of een eerder geüploade mediakoppeling.</small>' : ''}</label>`;
    }).join('')}</div>`;
  }
  return '';
}

async function readStore() {
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

async function writeStore(store) {
  store.updatedAt = new Date().toISOString();
  await mkdir(dataDir, { recursive: true });
  const temporary = `${contentPath}.tmp`;
  await writeFile(temporary, JSON.stringify(store, null, 2));
  await rename(temporary, contentPath);
}

function queueWrite(store) {
  writeQueue = writeQueue.then(() => writeStore(store));
  return writeQueue;
}

function publicPage(entry) {
  return { published: entry.published, revision: entry.revision, updatedAt: entry.updatedAt };
}

function pageOptions(pages, selected) {
  return Object.keys(pages).map((key) => `<option value="${escapeHtml(key)}" ${key === selected ? 'selected' : ''}>${escapeHtml(pages[key].published?.label || humanize(key))}</option>`).join('');
}

function renderPage(title, body) {
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · pr3nt</title><style>
:root{--ink:#103f31;--muted:#60756b;--green:#087654;--mint:#eaf6ef;--line:#d7e4dc;--paper:#f6faf7;--white:#fff;--shadow:0 18px 50px rgba(16,63,49,.08)}*{box-sizing:border-box}body{margin:0;background:var(--paper);color:var(--ink);font:15px/1.55 Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}.shell{max-width:1180px;margin:0 auto;padding:28px 22px 70px}.topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}.brand{font-size:23px;font-weight:950;letter-spacing:-.04em;color:var(--ink);text-decoration:none}.brand span{color:#1bb879}.nav{display:flex;gap:10px;align-items:center;flex-wrap:wrap}.card{background:var(--white);border:1px solid var(--line);border-radius:22px;box-shadow:var(--shadow);padding:24px}.hero{display:grid;grid-template-columns:1fr 340px;gap:24px;align-items:end;margin-bottom:20px}.eyebrow{font-size:12px;text-transform:uppercase;letter-spacing:.12em;color:var(--green);font-weight:900}.muted{color:var(--muted)}h1{font-size:clamp(30px,5vw,54px);line-height:1.02;letter-spacing:-.055em;margin:8px 0 12px}h2{font-size:22px;letter-spacing:-.03em;margin:0 0 6px}.button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:10px 15px;border:0;border-radius:999px;background:var(--ink);color:#fff;text-decoration:none;font-weight:850;cursor:pointer}.button.green{background:var(--green)}.button.ghost{background:#fff;color:var(--ink);border:1px solid var(--line)}select,input,textarea{width:100%;border:1px solid #cbdad1;border-radius:12px;padding:11px 13px;background:#fff;color:var(--ink);font:inherit}textarea{resize:vertical}.field-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:15px}.field{display:block}.field.wide,.group,.repeat-item{grid-column:1/-1}.field span{display:block;font-size:13px;font-weight:850;margin-bottom:6px}.field small{display:block;color:var(--muted);font-size:12px;margin-top:5px}.group,.repeat-item{border:1px solid var(--line);border-radius:16px;padding:16px;margin:0}.group legend,.repeat-item legend{font-size:13px;font-weight:900;padding:0 7px}.stack{display:grid;gap:16px}.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap}.notice{background:#e8f7ed;border:1px solid #bfe8cc;color:#17633f;padding:12px 14px;border-radius:14px;margin-bottom:16px}.editor-actions{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:22px}.check{display:flex;gap:9px;align-items:center;font-weight:800}.check input{width:auto}.media-result{margin-top:14px;padding:12px;background:var(--mint);border-radius:12px;word-break:break-all} @media(max-width:800px){.hero,.field-grid{grid-template-columns:1fr}.shell{padding:18px 14px 45px}.card{padding:18px}}
</style></head><body><main class="shell"><div class="topbar"><a class="brand" href="/admin"><span>pr</span>3nt beheer</a><nav class="nav"><a class="button ghost" href="/admin">Aanvragen</a><a class="button ghost" href="/admin/website">Website</a></nav></div>${body}</main></body></html>`;
}

function renderEditor(store, key, saved = false) {
  const entry = store.pages[key] || Object.values(store.pages)[0];
  const selected = entry ? key : Object.keys(store.pages)[0];
  const value = entry?.draft ?? entry?.published ?? {};
  return renderPage('Websitebeheer', `<section class="hero"><div><div class="eyebrow">PR3NT WEBSITEBEHEER</div><h1>Pas je website aan vanuit je eigen portaal.</h1><p class="muted">Beheer teksten, SEO-velden en afbeeldingskoppelingen. Concepten blijven apart totdat je ze publiceert.</p></div><div class="card"><strong>Publicatie</strong><p class="muted" style="margin:5px 0 14px">Laat de preview eerst controleren door het concept op te slaan.</p><a class="button ghost" href="https://pr3nt.nl" target="_blank" rel="noreferrer">Website openen ↗</a></div></section>${saved ? '<div class="notice">De pagina is opgeslagen en gepubliceerd.</div>' : ''}<section class="card stack"><div class="toolbar"><div><h2>Pagina-inhoud</h2><p class="muted" style="margin:0">Kies een pagina en wijzig alleen wat nodig is.</p></div><form method="get" action="/admin/website"><select name="key" onchange="this.form.submit()">${pageOptions(store.pages, selected)}</select></form></div><form id="content-form" method="post" action="/admin/website/${encodeURIComponent(selected)}"><input type="hidden" name="content" id="content-json"><input type="hidden" name="revision" value="${escapeHtml(entry?.revision || 0)}">${renderFields(value)}<div class="editor-actions"><label class="check"><input type="checkbox" name="publish" value="1" checked> Direct publiceren</label><button class="button green" type="submit">Wijzigingen opslaan</button></div></form></section><section class="card" style="margin-top:18px"><div class="toolbar"><div><h2>Media uploaden</h2><p class="muted" style="margin:0">Upload een logo of foto en plak de URL in een afbeeldingsveld.</p></div><form method="post" action="/admin/website/media" enctype="multipart/form-data" class="nav"><input type="file" name="file" accept=".jpg,.jpeg,.png,.webp,.avif,.gif,.svg" required><button class="button" type="submit">Uploaden</button></form></div></section><script>
const template=${JSON.stringify(value)};const form=document.getElementById('content-form');form.addEventListener('submit',()=>{const out=structuredClone(template);document.querySelectorAll('[data-site-field]').forEach((field)=>{const path=JSON.parse(field.dataset.sitePath);let target=out;path.forEach((part,index)=>{if(index===path.length-1){target[part]=field.value}else target=target[part]});});document.getElementById('content-json').value=JSON.stringify(out)});
</script>`);
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

  app.get('/admin/website', requireAdmin, async (req, res) => {
    const store = await readStore();
    const key = store.pages[req.query.key] ? req.query.key : Object.keys(store.pages)[0];
    res.send(renderEditor(store, key, req.query.saved === '1'));
  });

  app.post('/admin/website/:key', requireAdmin, async (req, res) => {
    const store = await readStore();
    const entry = store.pages[req.params.key];
    if (!entry) return res.status(404).send('Pagina niet gevonden');
    const raw = String(req.body.content || '');
    if (!raw || Buffer.byteLength(raw, 'utf8') > maxContentBytes) return res.status(400).send('Inhoud is leeg of te groot');
    let next;
    try { next = JSON.parse(raw); } catch { return res.status(400).send('Ongeldige JSON-inhoud'); }
    const expectedRevision = Number(req.body.revision || 0);
    if (expectedRevision && expectedRevision !== entry.revision) return res.status(409).send('Deze pagina is intussen gewijzigd. Open de pagina opnieuw en probeer het nogmaals.');
    const now = new Date().toISOString();
    entry.draft = next;
    if (req.body.publish === '1') entry.published = next;
    entry.revision += 1;
    entry.updatedAt = now;
    await queueWrite(store);
    res.redirect(`/admin/website?key=${encodeURIComponent(req.params.key)}&saved=1`);
  });

  app.post('/admin/website/media', requireAdmin, mediaUpload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).send('Bestandstype niet toegestaan');
    const url = `${baseUrl}/site-media/${encodeURIComponent(req.file.filename)}`;
    res.send(renderPage('Media geüpload', `<section class="card"><div class="eyebrow">MEDIA</div><h1>Upload geslaagd</h1><p class="muted">Kopieer deze URL naar een afbeeldingsveld in Websitebeheer.</p><div class="media-result"><strong>${escapeHtml(req.file.originalname)}</strong><br>${escapeHtml(url)}</div><div class="nav" style="margin-top:18px"><a class="button green" href="/admin/website">Terug naar websitebeheer</a></div></section>`));
  });

  app.get('/site-media/:filename', async (req, res) => {
    const safe = path.basename(req.params.filename);
    if (!safe || safe !== req.params.filename) return res.status(404).end();
    res.sendFile(path.join(mediaDir, safe), { headers: { 'Cache-Control': 'public, max-age=31536000, immutable' } }, (error) => { if (error && !res.headersSent) res.status(404).end(); });
  });
}
