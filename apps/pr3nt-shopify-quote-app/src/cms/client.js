// Verbinding met pr3nt.nl. De website bewaart alle inhoud; dit CMS leest en schrijft via /api/cms.
// Instellen in .env: CMS_TOKEN (dezelfde sleutel als in de .env van de website) en eventueel WEBSITE_URL.
const base = () => String(process.env.WEBSITE_URL || 'http://127.0.0.1:3200').replace(/\/$/, '');
export const siteUrl = () => String(process.env.WEBSITE_PUBLIC_URL || 'https://pr3nt.nl').replace(/\/$/, '');
export const cmsReady = () => String(process.env.CMS_TOKEN || '').trim().length >= 24;

export class CmsError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function request(method, path, body) {
  if (!cmsReady()) throw new CmsError(503, 'De koppeling met pr3nt.nl is nog niet ingesteld: zet CMS_TOKEN in de .env van app.pr3nt.nl én van de website.');
  const headers = { Authorization: `Bearer ${String(process.env.CMS_TOKEN).trim()}` };
  let payload;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
  let res;
  try {
    res = await fetch(`${base()}/api/cms/${path.replace(/^\//, '')}`, { method, headers, body: payload, signal: AbortSignal.timeout(60_000) });
  } catch (error) {
    throw new CmsError(502, `pr3nt.nl is niet bereikbaar (${error.cause?.code || error.message}). Draait de website?`);
  }
  return res;
}

export async function api(method, path, body) {
  const res = await request(method, path, body);
  const data = await res.json().catch(() => ({ ok: false, error: `Onverwacht antwoord van de website (${res.status}).` }));
  if (!res.ok || data.ok === false) throw new CmsError(res.status, data.error || `Fout ${res.status}`);
  return data;
}

export const get = (path) => api('GET', path);
export const post = (path, body = {}) => api('POST', path, body);
export const put = (path, body = {}) => api('PUT', path, body);
export const del = (path) => api('DELETE', path);
export const raw = (path) => request('GET', path);
