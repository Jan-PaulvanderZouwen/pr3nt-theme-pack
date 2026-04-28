const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set(['stl', '3mf', 'obj', 'step', 'stp']);

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200, env = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...corsHeaders(env),
    },
  });
}

function getExtension(filename = '') {
  return filename.split('.').pop().toLowerCase().trim();
}

function safeText(value, max = 2000) {
  return String(value || '').replace(/[<>]/g, '').trim().slice(0, max);
}

function adminHtml(data) {
  const rows = [
    ['Naam', data.name],
    ['E-mail', data.email],
    ['Telefoon', data.phone],
    ['Materiaal', data.material],
    ['Kleur', data.color],
    ['Spoed', data.rush === 'Ja' ? 'Ja' : 'Nee'],
    ['Bestand', data.fileName],
    ['Bestand link', data.fileUrl || 'Niet opgeslagen'],
    ['Opmerking', data.note || '-'],
  ];

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.55;color:#101820">
      <h1>Nieuwe offerte-aanvraag via pr3nt.nl</h1>
      <table cellpadding="8" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:760px">
        ${rows.map(([label, value]) => `
          <tr>
            <td style="border-bottom:1px solid #eee;font-weight:bold;width:160px">${label}</td>
            <td style="border-bottom:1px solid #eee">${value || '-'}</td>
          </tr>
        `).join('')}
      </table>
    </div>
  `;
}

function customerHtml(data) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#101820">
      <h1>Je offerte-aanvraag is ontvangen</h1>
      <p>Hoi ${data.name || 'maker'},</p>
      <p>Bedankt voor je aanvraag bij pr3nt.nl. We controleren je bestand en sturen je daarna een duidelijke offerte.</p>
      <p><strong>Samenvatting:</strong><br>
      Materiaal: ${data.material}<br>
      Kleur: ${data.color}<br>
      Spoed: ${data.rush === 'Ja' ? 'Ja' : 'Nee'}<br>
      Bestand: ${data.fileName}</p>
      <p>Je betaalt pas nadat je de offerte hebt goedgekeurd.</p>
      <p>Groet,<br>pr3nt.nl</p>
    </div>
  `;
}

async function sendEmail(env, payload) {
  if (!env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY ontbreekt');
  }

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Resend error ${response.status}: ${text}`);
  }

  return response.json();
}

async function saveFile(env, file) {
  if (!file) return { fileName: '', fileUrl: '' };

  const fileName = file.name || 'bestand';
  const extension = getExtension(fileName);

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    throw new Error('Ongeldig bestandstype. Upload STL, 3MF, OBJ, STEP of STP.');
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    throw new Error('Bestand is te groot. Maximaal 25 MB.');
  }

  if (!env.QUOTE_FILES) {
    return { fileName, fileUrl: 'Bestand ontvangen, R2 opslag nog niet gekoppeld.' };
  }

  const key = `quotes/${Date.now()}-${crypto.randomUUID()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
  await env.QUOTE_FILES.put(key, file.stream(), {
    httpMetadata: { contentType: file.type || 'application/octet-stream' },
  });

  const baseUrl = env.R2_PUBLIC_BASE_URL || '';
  return { fileName, fileUrl: baseUrl ? `${baseUrl.replace(/\/$/, '')}/${key}` : key };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (request.method !== 'POST') {
      return json({ ok: false, error: 'Method not allowed' }, 405, env);
    }

    try {
      const formData = await request.formData();
      const file = formData.get('file');
      const fileResult = await saveFile(env, file instanceof File ? file : null);

      const data = {
        name: safeText(formData.get('name'), 200),
        email: safeText(formData.get('email'), 200),
        phone: safeText(formData.get('phone'), 80),
        material: safeText(formData.get('material'), 20) || 'PLA',
        color: safeText(formData.get('color'), 120),
        rush: safeText(formData.get('rush'), 10) || 'Nee',
        note: safeText(formData.get('note'), 3000),
        fileName: fileResult.fileName,
        fileUrl: fileResult.fileUrl,
      };

      if (!data.name || !data.email || !data.phone || !data.color || !data.fileName) {
        return json({ ok: false, error: 'Niet alle verplichte velden zijn ingevuld.' }, 400, env);
      }

      await sendEmail(env, {
        from: env.FROM_EMAIL,
        to: [env.TO_EMAIL || 'bestellingen@pr3nt.nl'],
        subject: `Nieuwe offerte-aanvraag van ${data.name}`,
        html: adminHtml(data),
        reply_to: data.email,
      });

      await sendEmail(env, {
        from: env.FROM_EMAIL,
        to: [data.email],
        subject: 'Je offerte-aanvraag bij pr3nt.nl is ontvangen',
        html: customerHtml(data),
      });

      return json({ ok: true, redirect: env.SUCCESS_URL || '/pages/offerte-aanvraag-ontvangen' }, 200, env);
    } catch (error) {
      console.error(error);
      return json({ ok: false, error: error.message || 'Er ging iets mis.' }, 500, env);
    }
  },
};
