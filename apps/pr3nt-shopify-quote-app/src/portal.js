import { readFile, writeFile, rename, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import multer from 'multer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const appRoot = path.resolve(__dirname, '..');
const dataDir = path.resolve(appRoot, process.env.DATA_DIR || 'data');
const uploadDir = path.resolve(appRoot, process.env.UPLOAD_DIR || 'uploads/quotes');
const quotesFilePath = path.join(dataDir, 'quotes.json');
const baseUrl = process.env.APP_BASE_URL || 'https://app.pr3nt.nl';
const allowedExtensions = new Set(['.stl', '.3mf', '.obj', '.step', '.stp']);

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

await mkdir(uploadDir, { recursive: true });

const statuses = [
  ['received', 'Order ontvangen'],
  ['creating_quote', 'Offerte wordt aangemaakt'],
  ['quote_sent', 'Offerte verstuurd'],
  ['accepted', 'Offerte akkoord'],
  ['paid', 'Betaling voltooid'],
  ['print_queue', 'Print in queue'],
  ['ready_to_ship', 'Klaar voor verzending'],
  ['shipped', 'Verzonden'],
  ['delivered', 'Geleverd'],
];

function e(value = '') {
  return String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#039;');
}

function clean(value = '', max = 3000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function money(value) {
  const number = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(number) ? number : 0;
}

function fmt(value) {
  return money(value).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function quoteLines(quote) {
  if (Array.isArray(quote.quoteLines) && quote.quoteLines.length) return quote.quoteLines;
  if (quote.quoteAmount) return [{ label: 'Offertebedrag', qty: 1, unit: quote.quoteAmount }];
  return [];
}

function quoteTotal(quote) {
  return quoteLines(quote).reduce((sum, line) => sum + money(line.qty || 1) * money(line.unit || 0), 0);
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

function statusIndex(status) {
  const index = statuses.findIndex(([value]) => value === status);
  return index < 0 ? 0 : index;
}

function primaryFile(quote) {
  if (Array.isArray(quote.files) && quote.files[0]) return quote.files[0];
  if (quote.fileUrl) return { url: quote.fileUrl, originalName: quote.fileOriginalName || 'model.stl' };
  return null;
}

function allProjectLinks(current, allQuotes) {
  const email = String(current.email || '').toLowerCase();
  const projects = allQuotes.filter((q) => String(q.email || '').toLowerCase() === email);
  if (projects.length <= 1) return '';
  return `<section class="card"><h2>Mijn projecten</h2><div class="project-list">${projects.map((q) => `<a class="project ${q.id === current.id ? 'active' : ''}" href="/portal/${encodeURIComponent(q.portalToken || q.id)}"><strong>${e(q.id)}</strong><span>${e(q.material || '')} · ${e(q.color || '')}</span><em>${e(statuses[statusIndex(q.status)][1])}</em></a>`).join('')}</div></section>`;
}

function quoteTable(quote) {
  const lines = quoteLines(quote);
  if (!lines.length) return '<p class="muted">De offerte wordt nog aangemaakt. Je krijgt bericht zodra deze klaarstaat.</p>';
  const rows = lines.map((line) => `<tr><td><strong>${e(line.label || 'Regel')}</strong>${line.description ? `<br><span class="muted">${e(line.description)}</span>` : ''}</td><td>${e(line.qty || 1)}</td><td>€ ${fmt(line.unit)}</td><td><strong>€ ${fmt(money(line.qty || 1) * money(line.unit || 0))}</strong></td></tr>`).join('');
  return `<div class="quote-table"><table><thead><tr><th>Omschrijving</th><th>Aantal</th><th>Prijs</th><th>Totaal</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="3">Totaal</td><td>€ ${fmt(quoteTotal(quote))}</td></tr></tfoot></table></div>${quote.acceptedAt ? '<span class="badge green">Offerte akkoord gegeven</span>' : `<form method="post" action="/portal/${encodeURIComponent(quote.portalToken || quote.id)}/accept"><button class="button green" type="submit">Akkoord met offerte</button></form>`}${quote.paymentUrl ? `<a class="button" href="${e(quote.paymentUrl)}">Betalen via Shopify</a>` : ''}`;
}

function renderPage(title, body, file = null) {
  const viewerScript = file ? `<script type="module">
    const fileUrl=${JSON.stringify(file.url)};
    const fileName=${JSON.stringify(file.originalName || '')};
    const mount=document.getElementById('viewer');
    if(mount && fileUrl && /\.(stl|obj)$/i.test(fileName)){
      try{
        const THREE=await import('https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js');
        const controlsMod=await import('https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js');
        const isObj=/\.obj$/i.test(fileName);
        const loaderMod=await import(isObj?'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/OBJLoader.js':'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/loaders/STLLoader.js');
        const scene=new THREE.Scene(); scene.background=new THREE.Color(0xf6f6f5);
        const camera=new THREE.PerspectiveCamera(45,mount.clientWidth/mount.clientHeight,0.1,5000); camera.position.set(120,100,160);
        const renderer=new THREE.WebGLRenderer({antialias:true}); renderer.setSize(mount.clientWidth,mount.clientHeight); mount.innerHTML=''; mount.appendChild(renderer.domElement);
        scene.add(new THREE.HemisphereLight(0xffffff,0x888888,2)); const light=new THREE.DirectionalLight(0xffffff,2); light.position.set(100,200,100); scene.add(light);
        const controls=new controlsMod.OrbitControls(camera,renderer.domElement); controls.enableDamping=true;
        const loader=isObj?new loaderMod.OBJLoader():new loaderMod.STLLoader();
        loader.load(fileUrl,(loaded)=>{ let object;if(isObj){object=loaded}else{const mat=new THREE.MeshStandardMaterial({color:0xdddddd,roughness:.55});object=new THREE.Mesh(loaded,mat)} const box=new THREE.Box3().setFromObject(object); const center=box.getCenter(new THREE.Vector3()); object.position.sub(center); const size=box.getSize(new THREE.Vector3()).length(); object.scale.multiplyScalar(120/Math.max(size,1)); scene.add(object); animate(); },undefined,()=>{mount.innerHTML='<p>3D preview kon niet worden geladen. Download het bestand om het model te bekijken.</p>'});
        function animate(){requestAnimationFrame(animate);controls.update();renderer.render(scene,camera)}
      }catch(e){mount.innerHTML='<p>3D preview is niet beschikbaar in deze browser.</p>'}
    } else if(mount){mount.innerHTML='<p>3D preview ondersteunt nu STL en OBJ. Andere bestanden kun je downloaden.</p>'}
  </script>` : '';
  return `<!doctype html><html lang="nl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${e(title)} · pr3nt</title><style>
    :root{--bg:#f4f6f5;--card:#fff;--ink:#101820;--muted:#667085;--line:#e5e7eb;--green:#00d084;--dark:#111827}*{box-sizing:border-box}body{margin:0;background:radial-gradient(circle at 20% 0%,rgba(0,208,132,.16),transparent 34%),var(--bg);font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink);line-height:1.5}.shell{max-width:1180px;margin:0 auto;padding:24px}.top{display:flex;justify-content:space-between;align-items:center;margin-bottom:24px}.brand{font-weight:950;font-size:24px;letter-spacing:-.04em}.card{background:rgba(255,255,255,.94);border:1px solid var(--line);border-radius:26px;box-shadow:0 18px 60px rgba(16,24,32,.08);padding:24px}.hero{display:grid;grid-template-columns:1.1fr .9fr;gap:18px;margin-bottom:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:18px}.muted{color:var(--muted)}h1{font-size:clamp(30px,5vw,52px);line-height:1;margin:10px 0 14px;letter-spacing:-.05em}h2{margin:0 0 12px}.badge{display:inline-flex;border-radius:999px;padding:7px 12px;font-size:13px;font-weight:850;background:#e9fbf2;color:#087443}.badge.green{background:#00d084;color:#072016}.button{display:inline-flex;border:0;border-radius:999px;padding:13px 18px;background:var(--dark);color:white;text-decoration:none;font-weight:850;margin-top:12px;cursor:pointer}.button.green{background:var(--green);color:#072016}.kv{display:grid;grid-template-columns:150px 1fr;gap:8px 12px}.kv div{padding:9px 0;border-bottom:1px solid var(--line)}.segmented{display:grid;grid-template-columns:repeat(9,1fr);gap:4px;margin:18px 0}.segment{height:10px;border-radius:999px;background:#dfe4e2}.segment.done{background:var(--green)}.timeline{display:grid;gap:10px}.step{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center}.dot{width:34px;height:34px;border-radius:999px;background:#e5e7eb;display:grid;place-items:center;font-weight:900}.step.done .dot,.step.active .dot{background:var(--green);color:#052013}.chat{display:grid;gap:10px}.bubble{max-width:86%;padding:12px 14px;border-radius:18px;border:1px solid var(--line);background:#f8fafc}.bubble.customer{margin-left:auto;background:#e9fbf2;border-color:#b8f2d1}.bubble.pr3nt{background:#fff}textarea,input{width:100%;border:1px solid var(--line);border-radius:14px;padding:12px 14px;font:inherit}.quote-table{overflow:auto}table{width:100%;border-collapse:collapse}th,td{padding:11px;border-bottom:1px solid var(--line);text-align:left}tfoot td{font-size:18px;font-weight:950}#viewer{height:360px;border-radius:18px;background:#f6f6f5;border:1px solid var(--line);display:grid;place-items:center;overflow:hidden}.project-list{display:grid;gap:10px}.project{display:grid;grid-template-columns:1fr auto;gap:4px;padding:12px;border-radius:16px;background:#f8fafc;border:1px solid var(--line);color:var(--ink);text-decoration:none}.project.active{border-color:#00d084;background:#e9fbf2}.project span,.project em{color:var(--muted);font-style:normal}@media(max-width:780px){.hero,.grid{grid-template-columns:1fr}.shell{padding:14px}.kv{grid-template-columns:1fr}.segmented{grid-template-columns:repeat(3,1fr)}}
  </style></head><body><main class="shell"><div class="top"><div class="brand">pr3nt.nl</div><span class="badge">Klantportaal</span></div>${body}</main>${viewerScript}</body></html>`;
}

function renderMessages(quote) {
  const messages = Array.isArray(quote.messages) ? quote.messages : [];
  const list = messages.length ? messages.map((m) => `<div class="bubble ${m.from === 'klant' ? 'customer' : 'pr3nt'}"><strong>${e(m.from === 'klant' ? 'Jij' : 'pr3nt')}</strong><br>${e(m.text || '')}<br><small class="muted">${e(new Date(m.createdAt || Date.now()).toLocaleString('nl-NL'))}</small></div>`).join('') : '<p class="muted">Nog geen berichten.</p>';
  return `<div class="chat">${list}</div><form method="post" action="/portal/${encodeURIComponent(quote.portalToken || quote.id)}/message" style="margin-top:14px"><textarea name="message" placeholder="Typ je bericht aan pr3nt..." required></textarea><button class="button" type="submit">Bericht versturen</button></form>`;
}

function renderPortal(quote, allQuotes, saved = '') {
  const current = statusIndex(quote.status);
  const label = statuses[current][1];
  const segments = statuses.map((_, index) => `<div class="segment ${index <= current ? 'done' : ''}"></div>`).join('');
  const timeline = statuses.map(([value, text], index) => `<div class="step ${index < current ? 'done' : index === current ? 'active' : ''}"><div class="dot">${index + 1}</div><div><strong>${e(text)}</strong>${value === quote.status ? '<br><span class="muted">Huidige status</span>' : ''}</div></div>`).join('');
  const file = primaryFile(quote);
  return renderPage(`Aanvraag ${quote.id}`, `${saved ? `<div class="card" style="margin-bottom:18px"><strong>${e(saved)}</strong></div>` : ''}<section class="hero"><div class="card"><span class="badge">${e(label)}</span><h1>Je 3D-print aanvraag</h1><p class="muted">Hier volg je je offerte, akkoord, printstatus en verzending.</p><div class="segmented">${segments}</div><div class="kv"><div class="muted">Aanvraag</div><div>${e(quote.id)}</div><div class="muted">Materiaal</div><div>${e(quote.material)}</div><div class="muted">Kleur</div><div>${e(quote.color)}</div><div class="muted">Spoed</div><div>${e(quote.rush || 'Nee')}</div></div></div><aside class="card"><h2>Offerte</h2>${quoteTable(quote)}</aside></section>${allProjectLinks(quote, allQuotes)}<section class="grid"><div class="card"><h2>3D model preview</h2><div id="viewer"><p class="muted">3D model wordt geladen...</p></div>${file ? `<a class="button" href="${e(file.url)}">Bestand downloaden</a>` : ''}<form method="post" action="/portal/${encodeURIComponent(quote.portalToken || quote.id)}/upload" enctype="multipart/form-data" style="margin-top:14px"><input type="file" name="file" accept=".stl,.3mf,.obj,.step,.stp" multiple required><button class="button" type="submit">Extra bestanden uploaden</button></form></div><div class="card"><h2>Status</h2><div class="timeline">${timeline}</div></div></section><section class="grid"><div class="card"><h2>Berichten</h2>${renderMessages(quote)}</div><div class="card"><h2>Track & trace</h2>${quote.trackingCode ? `<p><strong>${e(quote.trackingCode)}</strong></p>` : '<p class="muted">Nog geen track & trace beschikbaar.</p>'}</div></section>`, file);
}

export function registerPortalRoutes(app) {
  app.get('/portal/:token', async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.portalToken === req.params.token || item.id === req.params.token);
    if (!quote) return res.status(404).send(renderPage('Niet gevonden', '<section class="card"><h1>Aanvraag niet gevonden</h1><p class="muted">Controleer de portaal-link.</p></section>'));
    res.send(renderPortal(quote, quotes, req.query.saved || ''));
  });

  app.post('/portal/:token/message', async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.portalToken === req.params.token || item.id === req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    const message = clean(req.body.message, 2000);
    if (message) {
      quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
      quote.messages.push({ from: 'klant', text: message, createdAt: new Date().toISOString() });
      quote.updatedAt = new Date().toISOString();
      await writeQuotes(quotes);
    }
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Bericht%20verstuurd`);
  });

  app.post('/portal/:token/accept', async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.portalToken === req.params.token || item.id === req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    quote.acceptedAt = new Date().toISOString();
    quote.status = 'accepted';
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    quote.messages.push({ from: 'klant', text: 'Ik ga akkoord met de offerte.', createdAt: new Date().toISOString() });
    await writeQuotes(quotes);
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Offerte%20akkoord%20gegeven`);
  });

  app.post('/portal/:token/upload', upload.array('file', Number(process.env.MAX_FILES || 8)), async (req, res) => {
    const quotes = await readQuotes();
    const quote = quotes.find((item) => item.portalToken === req.params.token || item.id === req.params.token);
    if (!quote) return res.status(404).send('Aanvraag niet gevonden');
    const files = req.files || [];
    quote.files = Array.isArray(quote.files) ? quote.files : [];
    for (const file of files) {
      const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
      const storedName = `${quote.id}-${Date.now()}-${safeName}`;
      await rename(file.path, path.join(uploadDir, storedName));
      quote.files.push({ originalName: file.originalname, storedName, url: `${baseUrl}/files/${quote.id}/${encodeURIComponent(`${Date.now()}-${safeName}`)}`, uploadedBy: 'klant', createdAt: new Date().toISOString() });
    }
    quote.messages = Array.isArray(quote.messages) ? quote.messages : [];
    quote.messages.push({ from: 'klant', text: `${files.length} extra bestand(en) geüpload.`, createdAt: new Date().toISOString() });
    await writeQuotes(quotes);
    res.redirect(`/portal/${encodeURIComponent(req.params.token)}?saved=Bestand%20geüpload`);
  });
}
