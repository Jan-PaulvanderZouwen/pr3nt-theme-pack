// Routes van het website-CMS op /admin/website. Elke actie gaat via de JSON-API van pr3nt.nl (client.js).
import multer from 'multer';
import { adminOnly } from '../ui/adminshell.js';
import { get, post, put, del, raw } from './client.js';
import { BASE, url, cmsError } from './ui.js';
import * as v from './views.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024, files: 30 } });

// Meldingen na een actie (via ?ok=), zodat er geen vrije tekst in de adresbalk staat.
const FLASH = {
  opgeslagen: 'Opgeslagen.',
  concept: 'Concept opgeslagen. Bekijk het voorbeeld voordat je publiceert.',
  live: 'Opgeslagen en live op pr3nt.nl.',
  offline: 'Pagina is offline gehaald.',
  verwijderd: 'Verwijderd.',
  gekopieerd: 'Kopie gemaakt. Je bewerkt nu de kopie.',
  teruggezet: 'Versie teruggezet.',
  geupload: 'Foto’s geüpload.',
  gescand: 'Scan klaar.',
  toegevoegd: 'Toegevoegd.',
  bijgewerkt: 'Bijgewerkt.',
  herprijsd: 'Verkoopprijzen opnieuw berekend.',
  mail: 'Mail verstuurd.',
  testmail: 'Testmail verstuurd. Kijk in je inbox.',
};
const flashOf = (req) => FLASH[req.query.ok] || '';
const go = (res, path, ok) => res.redirect(303, url(`${path}${ok ? `${path.includes('?') ? '&' : '?'}ok=${ok}` : ''}`));

const arr = (x) => (x == null ? [] : Array.isArray(x) ? x : [x]);
const str = (x) => (x == null ? '' : String(x));
const on = (x) => x === '1' || x === 'on' || x === 'true' || x === true;
const lines = (x) => str(x).split('\n').map((l) => l.trim()).filter(Boolean);
const num = (x) => { const n = Number(str(x).replace(',', '.')); return str(x).trim() && Number.isFinite(n) ? n : null; };
const enc = encodeURIComponent;
const seoOf = (b) => ({ title: str(b.seo_title), description: str(b.seo_description), keyword: str(b.seo_keyword), image: str(b.seo_image), canonical: str(b.seo_canonical), noindex: on(b.seo_noindex) });

/** Vangt fouten van de website af en toont ze netjes in het beheer. */
const wrap = (active, fn) => async (req, res) => {
  try { await fn(req, res); } catch (error) {
    if (!res.headersSent) res.status(error.status === 404 ? 404 : error.status >= 500 ? 502 : 200).send(cmsError(req.internalUser, active, error));
  }
};

let metaCache = { at: 0, data: null };
async function meta(fresh = false) {
  if (fresh || !metaCache.data || Date.now() - metaCache.at > 30_000) metaCache = { at: Date.now(), data: await get('meta') };
  return metaCache.data;
}
const forget = () => { metaCache.at = 0; };

// ---------- Formulieren omzetten naar API-gegevens ----------

function pageFromBody(b) {
  let blocks = [];
  try { blocks = JSON.parse(str(b.blocks) || '[]'); } catch { blocks = []; }
  return { title: str(b.title).trim(), slug: str(b.slug).trim(), intro: str(b.intro), breadcrumbs: on(b.breadcrumbs), blocks: Array.isArray(blocks) ? blocks : [] };
}

function articleFromBody(b) {
  const qs = arr(b.faq_q), as = arr(b.faq_a);
  return {
    title: str(b.title).trim(), slug: str(b.slug).trim(), description: str(b.description).trim(), body: str(b.body), category: str(b.category),
    published: str(b.published), draft: on(b.draft), featured: on(b.featured),
    faq: qs.map((q, i) => ({ q: str(q).trim(), a: str(as[i]).trim() })).filter((f) => f.q && f.a),
  };
}

const PS_KEYS = ['nozzle', 'bed', 'speed', 'fan', 'enclosure', 'drying', 'plate'];
function productFromBody(b) {
  const ps = Object.fromEntries(PS_KEYS.map((k) => [k, str(b[`ps_${k}`]).trim()]).filter(([, x]) => x));
  const tips = lines(b.ps_tips);
  if (tips.length) ps.tips = tips;
  return {
    name: str(b.name).trim(), brand: str(b.brand).trim(), sku: str(b.sku).trim(), category_id: str(b.category_id) || null,
    material: str(b.material), weight: str(b.weight), diameter: str(b.diameter), sort: str(b.sort), slug: str(b.slug).trim(),
    purchase_price: str(b.purchase_price), price: str(b.price), summary: str(b.summary), description: str(b.description),
    highlights: lines(b.highlights), colors: lines(b.colors), colors_out: arr(b.colors_out).map(str),
    in_stock: on(b.in_stock) ? 1 : 0, featured: on(b.featured) ? 1 : 0, print_profile: str(b.print_profile), print_settings: ps,
  };
}

const EMPTY_PRODUCT = { name: '', brand: '', sku: '', category_id: '', material: 'PLA', weight: '1 kg', diameter: '1,75 mm', sort: 0, slug: '', price: '', purchase_price: '', summary: '', description: '', highlights: [], colors: [], colors_out: [], in_stock: 1, featured: 0, print_profile: '', print_settings: {}, images: [] };

const SETTING_KEY = { bedrijf: 'site', homepage: 'usecases', faq: 'faq', inspiratie: 'inspiratie', prijzen: 'pricing' };

function settingFromBody(tab, b, current) {
  if (tab === 'bedrijf') {
    return {
      name: str(b.name).trim(), kvk: str(b.kvk).trim(), tagline: str(b.tagline).trim(), email: str(b.email).trim(), phone: str(b.phone).trim(),
      address: { ...(current.address || {}), street: str(b.street).trim(), postalCode: str(b.postalCode).trim().toUpperCase(), city: str(b.city).trim() },
      showAddress: on(b.showAddress), printer: str(b.printer).trim(), maxUploadMb: num(b.maxUploadMb) ?? current.maxUploadMb,
      social: { ...(current.social || {}), instagram: str(b.instagram).trim(), tiktok: str(b.tiktok).trim(), youtube: str(b.youtube).trim() },
    };
  }
  if (tab === 'homepage') {
    return [0, 1, 2, 3].map((i) => ({ title: str(b[`u${i}_title`]).trim(), text: str(b[`u${i}_text`]).trim(), image: str(b[`u${i}_image`]).trim().replace(/^\/media\//, ''), alt: str(b[`u${i}_alt`]).trim(), href: str(b[`u${i}_href`]).trim() })).filter((c) => c.title);
  }
  if (tab === 'faq') {
    const as = arr(b.a);
    return arr(b.q).map((q, i) => ({ q: str(q).trim(), a: str(as[i]).trim() })).filter((f) => f.q && f.a);
  }
  if (tab === 'inspiratie') {
    const f = (k) => arr(b[k]);
    return f('i_title').map((title, i) => ({ title: str(title).trim(), slug: str(f('i_slug')[i]).trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, ''), emoji: str(f('i_emoji')[i]).trim(), material: str(f('i_material')[i]).trim(), description: str(f('i_description')[i]).trim(), ideas: lines(f('i_ideas')[i]) }))
      .filter((d) => d.title).map((d) => ({ ...d, slug: d.slug || d.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') }));
  }
  if (tab === 'prijzen') {
    const out = {};
    for (const k of ['startup', 'packaging', 'shipping', 'perGram', 'perHour', 'rush', 'platformFeePercent']) out[k] = num(b[k]) ?? current[k];
    out.platformFeeUitleg = str(b.platformFeeUitleg).trim();
    const colors = lines(b.colors).map((l) => { const m = l.match(/^(.*?)\s*(#[0-9a-f]{3,8})$/i); return m ? { name: m[1].trim(), hex: m[2].toLowerCase() } : null; }).filter((c) => c?.name);
    if (colors.length) out.colors = colors;
    return out;
  }
  return null;
}

// ---------- Routes ----------

export function registerCmsRoutes(app) {
  const admin = adminOnly();
  const r = (method, path, active, ...handlers) => app[method](`${BASE}${path}`, admin, ...handlers.slice(0, -1), wrap(active, handlers.at(-1)));
  const user = (req) => req.internalUser;

  // Overzicht
  r('get', '', 'cms', async (req, res) => res.send(v.overviewView({ user: user(req), data: await get('overview'), flash: flashOf(req) })));

  // ----- Pagina's -----
  r('get', '/paginas', 'cms-pages', async (req, res) => res.send(v.pagesView({ user: user(req), pages: (await get('pages')).pages, flash: flashOf(req) })));

  r('get', '/paginas/nieuw', 'cms-pages', async (req, res) => {
    res.send(v.pageEditView({ user: user(req), page: { data: { title: '', slug: '', intro: '', breadcrumbs: true, blocks: [{ type: 'hero', title: '', text: '' }, { type: 'text', markdown: '' }] }, seo: null }, meta: await meta() }));
  });
  r('post', '/paginas/nieuw', 'cms-pages', async (req, res) => {
    const data = pageFromBody(req.body);
    const publish = req.body.action === 'publiceren';
    try {
      const { page } = await post('pages', { ...data, publish, seo: seoOf(req.body) });
      go(res, `/paginas/${page.id}`, publish ? 'live' : 'concept');
    } catch (error) {
      res.send(v.pageEditView({ user: user(req), page: { data, seo: seoOf(req.body) }, meta: await meta(), error: error.message }));
    }
  });

  r('get', '/paginas/:id(\\d+)', 'cms-pages', async (req, res) => {
    const [{ page, revisions }, m] = await Promise.all([get(`pages/${req.params.id}`), meta()]);
    res.send(v.pageEditView({ user: user(req), page, meta: m, revisions, flash: flashOf(req) }));
  });
  r('post', '/paginas/:id(\\d+)', 'cms-pages', async (req, res) => {
    const id = req.params.id;
    const action = str(req.body.action);
    if (action === 'dupliceren') { const { page } = await post(`pages/${id}/duplicate`); return go(res, `/paginas/${page.id}`, 'gekopieerd'); }
    if (action === 'offline') { await post(`pages/${id}/unpublish`); return go(res, `/paginas/${id}`, 'offline'); }
    if (action === 'verwijderen') { await del(`pages/${id}`); return go(res, '/paginas', 'verwijderd'); }
    const data = pageFromBody(req.body);
    const publish = action === 'publiceren';
    try {
      await put(`pages/${id}`, { ...data, publish, seo: seoOf(req.body) });
      go(res, `/paginas/${id}`, publish ? 'live' : 'concept');
    } catch (error) {
      const [{ page, revisions }, m] = await Promise.all([get(`pages/${id}`), meta()]);
      res.send(v.pageEditView({ user: user(req), page: { ...page, data, seo: seoOf(req.body) }, meta: m, revisions, error: error.message }));
    }
  });

  // ----- Kennisbank -----
  r('get', '/kennisbank', 'cms-articles', async (req, res) => {
    const { articles, categories } = await get('articles');
    res.send(v.articlesView({ user: user(req), articles, categories, flash: flashOf(req), q: str(req.query.q), cat: str(req.query.categorie) }));
  });
  r('get', '/kennisbank/nieuw', 'cms-articles', async (req, res) => {
    const today = new Date().toISOString().slice(0, 10);
    res.send(v.articleEditView({ user: user(req), article: { title: '', slug: '', description: '', body: '', category: 'beginnen', published: today, draft: 1, featured: 0, faq: [], seo: null }, meta: await meta() }));
  });
  r('post', '/kennisbank/nieuw', 'cms-articles', async (req, res) => {
    const a = articleFromBody(req.body);
    try {
      const { article } = await post('articles', { ...a, seo: seoOf(req.body) });
      go(res, `/kennisbank/${enc(article.slug)}`, article.draft ? 'concept' : 'live');
    } catch (error) {
      res.send(v.articleEditView({ user: user(req), article: { ...a, seo: seoOf(req.body) }, meta: await meta(), error: error.message }));
    }
  });
  r('get', '/kennisbank/:slug', 'cms-articles', async (req, res) => {
    const [{ article, revisions }, m] = await Promise.all([get(`articles/${enc(req.params.slug)}`), meta()]);
    res.send(v.articleEditView({ user: user(req), article, meta: m, revisions, flash: flashOf(req) }));
  });
  r('post', '/kennisbank/:slug', 'cms-articles', async (req, res) => {
    const slug = req.params.slug;
    if (req.body.action === 'verwijderen') { await del(`articles/${enc(slug)}`); return go(res, '/kennisbank', 'verwijderd'); }
    const a = articleFromBody(req.body);
    try {
      const { article } = await put(`articles/${enc(slug)}`, { ...a, seo: seoOf(req.body) });
      go(res, `/kennisbank/${enc(article.slug)}`, article.draft ? 'concept' : 'live');
    } catch (error) {
      const [{ article, revisions }, m] = await Promise.all([get(`articles/${enc(slug)}`), meta()]);
      res.send(v.articleEditView({ user: user(req), article: { ...article, ...a, slug: a.slug || slug, seo: seoOf(req.body) }, meta: m, revisions, error: error.message }));
    }
  });

  // ----- Webshop -----
  r('get', '/producten', 'cms-shop', async (req, res) => {
    const { products, categories, shop } = await get('products');
    res.send(v.productsView({ user: user(req), products, categories, shop, query: { q: str(req.query.q), cat: str(req.query.cat), voorraad: str(req.query.voorraad) }, flash: flashOf(req) }));
  });
  r('post', '/producten/herprijzen', 'cms-shop', async (_req, res) => { await post('products/reprice'); go(res, '/producten', 'herprijsd'); });
  r('post', '/producten/bulk', 'cms-shop', async (req, res) => {
    const [action, value = ''] = str(req.body.bulk).split(':');
    const ids = arr(req.body.ids);
    if (action && ids.length) await post('products/bulk', { ids, action, value });
    go(res, '/producten', action && ids.length ? (action === 'delete' ? 'verwijderd' : 'bijgewerkt') : '');
  });

  r('get', '/producten/categorieen', 'cms-shop', async (req, res) => res.send(v.categoriesView({ user: user(req), categories: (await get('categories')).categories, flash: flashOf(req) })));
  r('post', '/producten/categorieen', 'cms-shop', async (req, res) => {
    const b = req.body;
    const data = { name: str(b.name), slug: str(b.slug), description: str(b.description), sort: str(b.sort) };
    try {
      if (b.action === 'nieuw') await post('categories', data);
      else if (b.action === 'verwijderen') await del(`categories/${enc(str(b.id))}`);
      else await put(`categories/${enc(str(b.id))}`, data);
      forget();
      go(res, '/producten/categorieen', b.action === 'nieuw' ? 'toegevoegd' : b.action === 'verwijderen' ? 'verwijderd' : 'opgeslagen');
    } catch (error) {
      res.send(v.categoriesView({ user: user(req), categories: (await get('categories')).categories, error: error.message }));
    }
  });

  r('get', '/producten/instellingen', 'cms-shop', async (req, res) => res.send(v.shopSettingsView({ user: user(req), shop: (await get('settings/shop')).value, flash: flashOf(req) })));
  r('post', '/producten/instellingen', 'cms-shop', async (req, res) => {
    const b = req.body;
    const value = { marginPercent: num(b.marginPercent) ?? 0, shipping: num(b.shipping) ?? 0, freeShippingFrom: num(b.freeShippingFrom) ?? 0, pickup: on(b.pickup), deliveryText: str(b.deliveryText).trim(), returnsText: str(b.returnsText).trim() };
    try { await put('settings/shop', { value }); forget(); go(res, '/producten/instellingen', 'opgeslagen'); } catch (error) {
      res.send(v.shopSettingsView({ user: user(req), shop: { ...(await get('settings/shop')).value, ...value }, error: error.message }));
    }
  });

  r('get', '/producten/nieuw', 'cms-shop', async (req, res) => res.send(v.productEditView({ user: user(req), product: { ...EMPTY_PRODUCT }, meta: await meta() })));
  r('post', '/producten/nieuw', 'cms-shop', async (req, res) => {
    const p = productFromBody(req.body);
    try { const { product } = await post('products', p); go(res, `/producten/${product.id}`, 'opgeslagen'); } catch (error) {
      res.send(v.productEditView({ user: user(req), product: { ...EMPTY_PRODUCT, ...p }, meta: await meta(), error: error.message }));
    }
  });
  r('get', '/producten/:id(\\d+)', 'cms-shop', async (req, res) => {
    const [{ product }, m] = await Promise.all([get(`products/${req.params.id}`), meta()]);
    res.send(v.productEditView({ user: user(req), product, meta: m, flash: flashOf(req) }));
  });
  r('post', '/producten/:id(\\d+)', 'cms-shop', async (req, res) => {
    const id = req.params.id;
    const action = str(req.body.action);
    if (action === 'dupliceren') { const { product } = await post(`products/${id}/duplicate`); return go(res, `/producten/${product.id}`, 'gekopieerd'); }
    if (action === 'verwijderen') { await del(`products/${id}`); return go(res, '/producten', 'verwijderd'); }
    const { product: cur } = await get(`products/${id}`);
    const p = productFromBody(req.body);
    let images = cur.images;
    if (action.startsWith('foto-eerst:')) { const src = action.slice(11); images = [src, ...images.filter((x) => x !== src)]; }
    if (action.startsWith('foto-weg:')) { const src = action.slice(9); images = images.filter((x) => x !== src); }
    try {
      await put(`products/${id}`, { ...p, images, seo: seoOf(req.body) });
      go(res, `/producten/${id}`, 'opgeslagen');
    } catch (error) {
      res.send(v.productEditView({ user: user(req), product: { ...cur, ...p, seo: seoOf(req.body) }, meta: await meta(), error: error.message }));
    }
  });
  r('post', '/producten/:id(\\d+)/fotos', 'cms-shop', upload.array('files', 10), async (req, res) => {
    const form = new FormData();
    for (const f of req.files || []) form.append('files', new Blob([f.buffer], { type: f.mimetype }), f.originalname);
    const { errors = [] } = await post(`products/${req.params.id}/photos`, form);
    if (errors.length) {
      const [{ product }, m] = await Promise.all([get(`products/${req.params.id}`), meta()]);
      return res.send(v.productEditView({ user: user(req), product, meta: m, error: errors.join(' ') }));
    }
    go(res, `/producten/${req.params.id}`, 'geupload');
  });

  // ----- Bestellingen -----
  r('get', '/bestellingen', 'cms-orders', async (req, res) => {
    const query = { q: str(req.query.q), soort: str(req.query.soort), status: str(req.query.status), open: str(req.query.open) };
    const [{ orders }, m] = await Promise.all([get(`orders?${new URLSearchParams(query)}`), meta()]);
    res.send(v.ordersView({ user: user(req), orders, statuses: m.orderStatuses, query, flash: flashOf(req) }));
  });
  r('get', '/bestellingen/:id', 'cms-orders', async (req, res) => res.send(v.orderView({ user: user(req), order: (await get(`orders/${enc(req.params.id)}`)).order, flash: flashOf(req) })));
  r('get', '/bestellingen/:id/bestand', 'cms-orders', async (req, res) => {
    const upstream = await raw(`orders/${enc(req.params.id)}/file`);
    if (!upstream.ok) { const data = await upstream.json().catch(() => ({})); throw Object.assign(new Error(data.error || 'Bestand niet gevonden.'), { status: 404 }); }
    res.set('Content-Type', 'application/octet-stream');
    res.set('Content-Disposition', upstream.headers.get('content-disposition') || 'attachment');
    res.send(Buffer.from(await upstream.arrayBuffer()));
  });
  r('post', '/bestellingen/:id', 'cms-orders', async (req, res) => {
    const id = enc(req.params.id);
    const b = req.body;
    try {
      if (b.action === 'verwijderen') { await del(`orders/${id}`); return go(res, '/bestellingen', 'verwijderd'); }
      if (b.action === 'status') await post(`orders/${id}/status`, { status: str(b.status), note: str(b.note), notify: on(b.notify) });
      else if (b.action === 'notitie') await post(`orders/${id}/note`, { note: str(b.note), visible: on(b.visible) });
      else if (b.action === 'producent') await put(`orders/${id}`, { producer_id: str(b.producer_id), producer_paid: on(b.producer_paid) });
      else await put(`orders/${id}`, { amount: str(b.amount), track_trace: str(b.track_trace), payment_url: str(b.payment_url), invoice_url: str(b.invoice_url), internal_notes: str(b.internal_notes) });
      go(res, `/bestellingen/${id}`, 'opgeslagen');
    } catch (error) {
      res.send(v.orderView({ user: user(req), order: (await get(`orders/${id}`)).order, error: error.message }));
    }
  });

  // ----- Klanten -----
  r('get', '/klanten', 'cms-customers', async (req, res) => {
    const query = { q: str(req.query.q), rol: str(req.query.rol) };
    res.send(v.customersView({ user: user(req), customers: (await get(`customers?${new URLSearchParams(query)}`)).customers, query, flash: flashOf(req) }));
  });
  r('get', '/klanten/:id(\\d+)', 'cms-customers', async (req, res) => {
    const { customer, orders } = await get(`customers/${req.params.id}`);
    res.send(v.customerView({ user: user(req), customer, orders, flash: flashOf(req) }));
  });
  r('post', '/klanten/:id(\\d+)', 'cms-customers', async (req, res) => {
    const id = req.params.id;
    const b = req.body;
    try {
      if (b.action === 'link') {
        const { sent } = await post(`customers/${id}/reset-link`);
        if (!sent) throw new Error('De mail kon niet worden verstuurd. Werkt e-mail van de website? (Instellingen › E-mail)');
        return go(res, `/klanten/${id}`, 'mail');
      }
      const fields = ['name', 'email', 'phone', 'company', 'street', 'house_number', 'postal_code', 'city', 'country', 'role', 'notes'];
      await put(`customers/${id}`, { ...Object.fromEntries(fields.map((k) => [k, str(b[k])])), active: on(b.active) });
      go(res, `/klanten/${id}`, 'opgeslagen');
    } catch (error) {
      const { customer, orders } = await get(`customers/${id}`);
      res.send(v.customerView({ user: user(req), customer, orders, error: error.message }));
    }
  });

  // ----- Berichten -----
  r('get', '/berichten', 'cms-messages', async (req, res) => {
    const showAll = req.query.alles === '1';
    res.send(v.messagesView({ user: user(req), messages: (await get(`messages${showAll ? '?alles=1' : ''}`)).messages, showAll, flash: flashOf(req) }));
  });
  r('post', '/berichten', 'cms-messages', async (req, res) => {
    const id = enc(str(req.body.id));
    if (req.body.action === 'verwijderen') await del(`messages/${id}`);
    else await post(`messages/${id}/toggle`);
    res.redirect(303, req.get('referer')?.includes(`${BASE}/berichten`) ? req.get('referer') : url('/berichten'));
  });

  // ----- Producenten -----
  r('get', '/producenten', 'cms-producers', async (req, res) => {
    const { applications, producers } = await get('producers');
    res.send(v.producersView({ user: user(req), applications, producers, flash: flashOf(req) }));
  });
  r('post', '/producenten/:id(\\d+)/:action(goedkeuren|afwijzen|verwijderen)', 'cms-producers', async (req, res) => {
    await post(`producers/applications/${req.params.id}/${req.params.action}`);
    go(res, '/producenten', req.params.action === 'verwijderen' ? 'verwijderd' : 'bijgewerkt');
  });

  // ----- Foto's -----
  const mediaPage = async (req, res, extra = {}) => {
    const { files, spots } = await get('media');
    res.send(v.mediaView({ user: user(req), files, spots, flash: flashOf(req), ...extra }));
  };
  r('get', '/media', 'cms-media', (req, res) => mediaPage(req, res));
  r('post', '/media/upload', 'cms-media', upload.array('files', 30), async (req, res) => {
    const form = new FormData();
    if (req.body.target) form.append('target', str(req.body.target));
    for (const f of req.files || []) form.append('files', new Blob([f.buffer], { type: f.mimetype }), f.originalname);
    try {
      const { errors = [] } = await post('media', form);
      forget();
      if (errors.length) return mediaPage(req, res, { flash: FLASH.geupload, error: errors.join(' ') });
      go(res, '/media', 'geupload');
    } catch (error) {
      await mediaPage(req, res, { error: error.message });
    }
  });
  r('post', '/media/:name/verwijderen', 'cms-media', async (req, res) => { await del(`media/${enc(req.params.name)}`); forget(); go(res, '/media', 'verwijderd'); });

  // ----- SEO -----
  r('get', '/seo', 'cms-seo', async (req, res) => {
    const { urls, extra, scannedAt } = await get('seo');
    res.send(v.seoView({ user: user(req), urls, extra, scannedAt, flash: flashOf(req) }));
  });
  r('post', '/seo/scan', 'cms-seo', async (_req, res) => { await post('seo/scan'); go(res, '/seo', 'gescand'); });
  r('get', '/seo/pagina', 'cms-seo', async (req, res) => {
    const path = str(req.query.path) || '/';
    const [{ seo }, scan, m] = await Promise.all([get(`seo?path=${enc(path)}`), post('seo/scan', { paths: [path] }).then((x) => x.pages?.[0] ?? null).catch(() => null), meta()]);
    res.send(v.seoEditView({ user: user(req), path: seo.path || path, seo, scan, meta: m, flash: flashOf(req) }));
  });
  r('post', '/seo/pagina', 'cms-seo', async (req, res) => {
    const path = str(req.body.path) || '/';
    try { await put('seo', { path, ...seoOf(req.body) }); go(res, `/seo/pagina?path=${enc(path)}`, 'opgeslagen'); } catch (error) {
      res.send(v.seoEditView({ user: user(req), path, seo: { path, ...seoOf(req.body) }, scan: null, meta: await meta(), error: error.message }));
    }
  });
  r('get', '/seo/doorverwijzingen', 'cms-seo', async (req, res) => {
    const { redirects, notFound } = await get('redirects');
    res.send(v.redirectsView({ user: user(req), redirects, notFound, flash: flashOf(req) }));
  });
  r('post', '/seo/doorverwijzingen', 'cms-seo', async (req, res) => {
    const b = req.body;
    try {
      if (b.action === 'verwijderen') await del(`redirects/${enc(str(b.id))}`);
      else if (b.action === 'negeren') await del(`not-found?path=${enc(str(b.path))}`);
      else { await post('redirects', { from: str(b.from), to: str(b.to), code: str(b.code) || '301' }); await del(`not-found?path=${enc(str(b.from))}`).catch(() => {}); }
      go(res, '/seo/doorverwijzingen', b.action === 'verwijderen' ? 'verwijderd' : b.action === 'negeren' ? 'bijgewerkt' : 'toegevoegd');
    } catch (error) {
      const { redirects, notFound } = await get('redirects');
      res.send(v.redirectsView({ user: user(req), redirects, notFound, error: error.message }));
    }
  });
  r('get', '/seo/google', 'cms-seo', async (req, res) => res.send(v.googleView({ user: user(req) })));

  // ----- Versies -----
  r('post', '/versies/:id(\\d+)/terugzetten', 'cms', async (req, res) => {
    const out = await post(`revisions/${req.params.id}/restore`);
    if (out.page) return go(res, `/paginas/${out.page.id}`, 'teruggezet');
    if (out.article) return go(res, `/kennisbank/${enc(out.article.slug)}`, 'teruggezet');
    const tab = Object.entries(SETTING_KEY).find(([, k]) => k === out.key)?.[0];
    if (out.key === 'shop') return go(res, '/producten/instellingen', 'teruggezet');
    go(res, `/instellingen?tab=${tab || 'bedrijf'}`, 'teruggezet');
  });

  // ----- Instellingen -----
  const settingsPage = async (req, res, tab, extra = {}) => {
    const key = SETTING_KEY[tab];
    const [data, m] = await Promise.all([key ? get(`settings/${key}`) : Promise.resolve({ value: null, revisions: [] }), meta(tab === 'email')]);
    res.send(v.settingsView({ user: user(req), tab, value: extra.value ?? data.value, revisions: data.revisions, meta: m, flash: flashOf(req), ...extra }));
  };
  const tabOf = (req) => (SETTING_KEY[req.query.tab] || req.query.tab === 'email' ? str(req.query.tab) : 'bedrijf');
  r('get', '/instellingen', 'cms-settings', (req, res) => settingsPage(req, res, tabOf(req)));
  r('post', '/instellingen', 'cms-settings', async (req, res) => {
    const tab = tabOf(req);
    if (tab === 'email') {
      try { await post('testmail', { to: str(req.body.to) }); return go(res, '/instellingen?tab=email', 'testmail'); } catch (error) { return settingsPage(req, res, tab, { error: error.message }); }
    }
    const key = SETTING_KEY[tab];
    const current = (await get(`settings/${key}`)).value;
    const value = settingFromBody(tab, req.body, current);
    try {
      await put(`settings/${key}`, { value });
      forget();
      go(res, `/instellingen?tab=${tab}`, 'opgeslagen');
    } catch (error) {
      await settingsPage(req, res, tab, { value: Array.isArray(current) ? value : { ...current, ...value }, error: error.message });
    }
  });
}
