import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const filePath = path.resolve('src/portaldomfix.js');
let source = await readFile(filePath, 'utf8');

const replacements = [
  ['<span class="eyebrow">Prijsopgaaf</span><h2>Prijs wordt berekend</h2><p class="muted">We bekijken je bestand en berekenen de prijs. Verzending is automatisch inbegrepen.</p>', '<span class="eyebrow">Volgende stap</span><h2>Binnen 1 werkdag je prijsopgaaf</h2><p class="muted">Je aanvraag is binnen. We bekijken je 3D-bestand en sturen je een duidelijke prijsopgaaf inclusief verzending.</p>'],
  ['<span class="eyebrow">Betaling</span><h2>€ ${fmt(total)}</h2><p class="muted">Je prijsopgaaf is klaar. Verzending is inbegrepen.</p><a class="btn btn-primary" href="${e(quote.paymentUrl)}">Direct betalen</a>', '<span class="eyebrow">Klaar om te betalen</span><h2>€ ${fmt(total)}</h2><p class="muted">Je prijsopgaaf staat klaar. Het bedrag is inclusief verzending, zodat je direct weet waar je aan toe bent.</p><a class="btn btn-primary" href="${e(quote.paymentUrl)}">Veilig betalen</a>'],
  ['<span class="eyebrow">Betaling</span><h2>€ ${fmt(total)}</h2><p class="muted">De betaling is verwerkt. Verzending is inbegrepen.</p>', '<span class="eyebrow">Betaald</span><h2>€ ${fmt(total)}</h2><p class="muted">Je betaling is ontvangen. We houden je hier op de hoogte van de volgende stap.</p>'],
  ['<span class="eyebrow">Betaling</span><h2>€ ${fmt(total)}</h2><p class="muted">Prijsopgaaf akkoord. We zetten de Shopify-betaallink handmatig klaar.</p>', '<span class="eyebrow">Akkoord ontvangen</span><h2>€ ${fmt(total)}</h2><p class="muted">Bedankt voor je akkoord. We zetten de betaallink klaar en laten je weten zodra je kunt betalen.</p>'],
  ['<span class="eyebrow">Prijsopgaaf</span><h2>€ ${fmt(total)}</h2><p class="muted">Verzending is inbegrepen. Controleer je prijsopgaaf en geef akkoord, daarna zetten wij de betaallink klaar.</p><form method="post" action="/portal/${encodeURIComponent(quote.portalToken || quote.id)}/accept"><button class="btn btn-primary" type="submit">Prijsopgaaf akkoord</button></form>', '<span class="eyebrow">Prijsopgaaf klaar</span><h2>€ ${fmt(total)}</h2><p class="muted">Dit bedrag is inclusief verzending. Geef akkoord, dan zetten wij de betaallink voor je klaar.</p><form method="post" action="/portal/${encodeURIComponent(quote.portalToken || quote.id)}/accept"><button class="btn btn-primary" type="submit">Akkoord met prijsopgaaf</button></form>'],
  ['<span class="eyebrow">Snel regelen</span><strong>Herhaalbestelling</strong><p class="muted">Vraag dezelfde print opnieuw aan.</p>', '<span class="eyebrow">Snel opnieuw</span><strong>Nog een keer printen</strong><p class="muted">Wil je dezelfde print opnieuw bestellen? Start in één klik een nieuwe aanvraag.</p>'],
  ['<span class="eyebrow">Bestand</span><strong>Bestand vervangen</strong><p class="muted">Upload een nieuwe versie en kies PLA of PETG.</p>', '<span class="eyebrow">Nieuw bestand</span><strong>Bestand vervangen</strong><p class="muted">Heb je je model aangepast? Upload hier de nieuwste versie, dan werken we daarmee verder.</p>'],
  ['<span class="eyebrow">Hulp nodig?</span><strong>Supportvraag</strong><p class="muted">Koppel een vraag aan dit project.</p>', '<span class="eyebrow">Vraag of toelichting</span><strong>Bericht sturen</strong><p class="muted">Heb je een vraag of extra informatie? Stuur je bericht hier, dan blijft alles netjes bij dit project.</p>'],
  ['placeholder="Waar kunnen we mee helpen?"', 'placeholder="Typ hier je vraag of toelichting"'],
  ['<span class="eyebrow">Na levering</span><strong>Beoordeling</strong><p class="muted">Laat weten hoe de print is bevallen.</p>', '<span class="eyebrow">Na levering</span><strong>Hoe is je print bevallen?</strong><p class="muted">Met je beoordeling help je ons én toekomstige klanten.</p>'],
  ['placeholder="Korte review"', 'placeholder="Schrijf eventueel een korte toelichting"'],
  ['<button class="btn btn-light" type="submit">Review versturen</button>', '<button class="btn btn-light" type="submit">Beoordeling versturen</button>'],
  ['<span>Je print wordt gemaakt</span><small>De printer is bezig met jouw model. Zodra hij klaar is, werken we de status bij.</small>', '<span>Je print is in productie</span><small>We zijn met je model aan de slag. Zodra je print klaar is, zie je hier de volgende stap.</small>'],
  ['<span>Pakket volgen</span><small>Track & trace: ${e(quote.trackingCode)}</small>', '<span>Je pakket is onderweg</span><small>Track & trace: ${e(quote.trackingCode)}</small>'],
  ['<span>Betaallink wordt klaargezet</span><small>Wij maken de Shopify-betaallink handmatig aan en plaatsen hem hier.</small>', '<span>Betaallink wordt klaargezet</span><small>Je prijsopgaaf is akkoord. We plaatsen de betaallink hier zodra hij klaarstaat.</small>'],
];

for (const [from, to] of replacements) {
  source = source.replaceAll(from, to);
}

source = source.replace(
  '.status-info-toggle{position:absolute;left:20px;bottom:20px;z-index:25;display:block}',
  '.status-info-toggle{position:absolute;right:14px;top:14px;left:auto;bottom:auto;z-index:30;display:block}'
);
source = source.replace(
  '.status-info-toggle summary{list-style:none;width:28px;height:28px;border-radius:999px;background:#eef2f1;color:#101820;display:grid;place-items:center;font-weight:900;cursor:pointer}',
  '.status-info-toggle summary{list-style:none;width:30px;height:30px;border-radius:999px;background:rgba(255,255,255,.96);color:#101820;display:grid;place-items:center;font-weight:900;cursor:pointer;box-shadow:0 8px 24px rgba(16,24,32,.12)}'
);
source = source.replace(
  '.status-popover{position:absolute;left:0;top:38px;right:auto;z-index:50;width:min(340px,calc(100vw - 48px));',
  '.status-popover{position:absolute;right:0;top:40px;left:auto;z-index:50;width:min(340px,calc(100vw - 48px));'
);
source = source.replace(
  '.status-info-toggle{left:16px;bottom:16px}',
  '.status-info-toggle{right:12px;top:12px;left:auto;bottom:auto}'
);

source = source.replace(
  "if (relevantCard) relevantCard.innerHTML = '<h2>Relevante informatie</h2>' + priceBlock;",
  "if (relevantCard) relevantCard.innerHTML = '<h2>Wat is nu belangrijk?</h2>' + priceBlock;"
);

source = source.replace(/Aanvraag/g, 'Aanvraagnummer');
source = source.replace(/Offerte meestal binnen 1 werkdag/g, 'Prijsopgaaf binnen 1 werkdag');
source = source.replace(/We bekijken je bestand en maken een passende offerte\./g, 'Je aanvraag is binnen. Binnen 1 werkdag ontvang je een heldere prijsopgaaf, inclusief verzending.');
source = source.replace(/Bestand uploaden of bericht sturen/g, 'Iets aanpassen of aanvullen?');

await writeFile(filePath, source);
console.log('Portal copy updated to friendly professional tone.');
