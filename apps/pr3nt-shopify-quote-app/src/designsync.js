import { mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

function cleanName(value) {
  return String(value || 'Onbekende klant')
    .replace(/[^a-zA-Z0-9 ._-]/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80) || 'Onbekende klant';
}

function cleanFileName(value, fallback) {
  return String(value || fallback || 'bestand')
    .replace(/[^a-zA-Z0-9._ -]/g, '-')
    .replace(/\s+/g, ' ')
    .trim() || fallback || 'bestand';
}

export async function exportQuoteDesigns(quote, uploadDir) {
  const baseDir = process.env.CUSTOM_DESIGN_EXPORT_DIR || process.env.ICLOUD_CUSTOM_DESIGN_DIR || '';
  if (!baseDir || !quote || !Array.isArray(quote.files) || !quote.files.length) return;

  const customerDir = path.join(baseDir, cleanName(quote.name || quote.email || quote.id));
  await mkdir(customerDir, { recursive: true });

  let copied = 0;
  for (let i = 0; i < quote.files.length; i += 1) {
    const file = quote.files[i];
    if (!file || !file.storedName) continue;
    const source = path.join(uploadDir, file.storedName);
    const target = path.join(customerDir, cleanFileName(file.originalName || file.safeOriginalName, `bestand-${i + 1}`));
    await copyFile(source, target);
    copied += 1;
  }

  quote.designExport = {
    copied,
    directory: customerDir,
    exportedAt: new Date().toISOString(),
  };
}
