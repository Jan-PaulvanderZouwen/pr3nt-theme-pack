import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";

export function briefingFilename(title: string) {
  return `briefing-${title.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "project"}.pdf`;
}

/** Text-only A4 briefing. Never renders or embeds the illustrative website preview. */
export async function briefingPdf(markdown: string, title: string) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Projectbriefing · ${title}`); pdf.setAuthor("Bouwr"); pdf.setLanguage("nl-NL");
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const ink = rgb(.15, .20, .28), muted = rgb(.43, .49, .57), blue = rgb(.09, .36, .87), border = rgb(.88, .91, .95);
  const width = 595.28, height = 841.89, margin = 52, usable = width - margin * 2;
  // Helvetica's WinAnsi covers Dutch punctuation, accents and the euro sign.
  const clean = (text: string) => Array.from(text.normalize("NFC").replace(/\t/g, "  ").replace(/[\x00-\x08\x0b-\x1f]/g, "")).map(character => {
    try { regular.encodeText(character); return character; } catch {
      return character.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\x20-\x7e]/g, "?") || "?";
    }
  }).join("");
  const wrap = (text: string, font: PDFFont, size: number, available: number) => {
    const lines: string[] = []; let line = "";
    for (const word of clean(text).split(/\s+/).filter(Boolean)) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= available) { line = candidate; continue; }
      if (line) { lines.push(line); line = ""; }
      for (const character of word) {
        if (line && font.widthOfTextAtSize(line + character, size) > available) { lines.push(line); line = ""; }
        line += character;
      }
    }
    if (line) lines.push(line);
    return lines;
  };
  let page = pdf.addPage([width, height]), y = height - margin;
  const newPage = () => {
    page = pdf.addPage([width, height]); y = height - margin;
    page.drawText("BOUWR  /  PROJECTBRIEFING", { x: margin, y, size: 8, font: bold, color: blue });
    y -= 24;
  };
  page.drawText("BOUWR  /  PROJECTBRIEFING", { x: margin, y, size: 9, font: bold, color: blue }); y -= 36;
  for (const line of wrap(title || "Nieuw project", bold, 25, usable)) {
    if (y < 100) newPage();
    page.drawText(line, { x: margin, y, font: bold, size: 25, color: ink }); y -= 32;
  }
  page.drawText("Scope, afspraken en oplevering", { x: margin, y, size: 10, font: regular, color: muted }); y -= 21;
  page.drawLine({ start: { x: margin, y }, end: { x: width - margin, y }, thickness: 1, color: border }); y -= 24;
  const blocks = markdown.replace(/\r/g, "").split("\n");
  for (const [index, raw] of blocks.entries()) {
    if (index === 0 && /^# /.test(raw)) continue;
    if (!raw.trim()) { y -= 6; continue; }
    const heading = raw.match(/^(#{2,3})\s+(.*)$/);
    const checklist = /^- \[[ x]\] /.test(raw), bullet = /^- /.test(raw) && !checklist;
    const text = (heading ? heading[2] : raw.replace(/^- \[[ x]\] /, "").replace(/^- /, "")).replace(/\*\*/g, "");
    const font = heading ? bold : regular, size = heading ? heading[1].length === 2 ? 14 : 11 : 10;
    const leading = heading ? 19 : 15, indent = checklist || bullet ? 15 : 0;
    const lines = wrap(text, font, size, usable - indent);
    if (heading) { if (y < 130) newPage(); y -= heading[1].length === 2 ? 13 : 5; }
    for (let i = 0; i < lines.length; i++) {
      if (y < 82) newPage();
      if (i === 0 && checklist) page.drawRectangle({ x: margin, y: y - 1, width: 7, height: 7, borderWidth: .7, borderColor: muted });
      if (i === 0 && bullet) page.drawText("•", { x: margin + 1, y, font: regular, size, color: muted });
      page.drawText(lines[i], { x: margin + indent, y, font, size, color: heading ? blue : ink }); y -= leading;
    }
    if (heading) y -= 3;
  }
  pdf.getPages().forEach((current, index, pages) => {
    current.drawLine({ start: { x: margin, y: 54 }, end: { x: width - margin, y: 54 }, thickness: .6, color: border });
    current.drawText("Bouwr · Projectbriefing", { x: margin, y: 37, font: regular, size: 8, color: muted });
    const counter = `${index + 1} / ${pages.length}`;
    current.drawText(counter, { x: width - margin - regular.widthOfTextAtSize(counter, 8), y: 37, font: regular, size: 8, color: muted });
  });
  return pdf.save();
}
