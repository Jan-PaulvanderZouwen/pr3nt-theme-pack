import { z } from "zod";
import { standards } from "./standards";
import { defaultPhases, phasePlanSchema, phaseAmounts } from "./payment-plan";

export const sections = {
  hero: "Intro & hoofdactie", services: "Diensten", features: "Voordelen", portfolio: "Portfolio",
  testimonials: "Reviews", stats: "Kerncijfers", faq: "Veelgestelde vragen", contact: "Contactformulier",
  pricing: "Pakketten & prijzen", blog: "Artikelen", products: "Producten", gallery: "Fotogalerij", cta: "Oproep tot actie",
} as const;
export const featureOptions = [
  { id: "contact-form", group: "Contact & conversie", label: "Contactformulier", detail: "Validatie, spambeperking en ontvangstbevestiging." },
  { id: "quote-form", group: "Contact & conversie", label: "Offerteaanvraag", detail: "Een aanvraag met projectdetails en een bevestiging." },
  { id: "booking", group: "Contact & conversie", label: "Afspraken boeken", detail: "Een boekingsflow of een afgesproken agendakoppeling." },
  { id: "newsletter", group: "Contact & conversie", label: "Nieuwsbrief", detail: "Aanmelden met toestemming en lijstkoppeling." },
  { id: "whatsapp", group: "Contact & conversie", label: "WhatsApp-knop", detail: "Een direct contactpunt met ingesteld telefoonnummer." },
  { id: "blog", group: "Content & beheer", label: "Blog / nieuws", detail: "Categorieën, artikelpagina’s en contentbeheer." },
  { id: "portfolio", group: "Content & beheer", label: "Portfolio / cases", detail: "Overzicht en detailpagina’s voor projecten." },
  { id: "search", group: "Content & beheer", label: "Zoekfunctie", detail: "Zoeken in de afgesproken openbare content." },
  { id: "multilingual", group: "Content & beheer", label: "Meertaligheid", detail: "Taalwissel en pagina’s per gekozen taal." },
  { id: "downloads", group: "Content & beheer", label: "Downloads", detail: "Beheerbare documenten en downloadlinks." },
  { id: "catalog", group: "Webshop", label: "Productcatalogus", detail: "Producten, categorieën, filters en detailpagina’s." },
  { id: "cart", group: "Webshop", label: "Winkelmand & checkout", detail: "Besteloverzicht en een afgeschermde checkout." },
  { id: "payments", group: "Webshop", label: "Online betalen", detail: "Betaalprovider, statuscontrole en testbetaling." },
  { id: "shipping", group: "Webshop", label: "Verzending & voorraad", detail: "Verzendregels en een afgesproken voorraadmodel." },
  { id: "accounts", group: "Accounts & portaal", label: "Gebruikersaccounts", detail: "Registratie, verificatie, login en wachtwoordherstel." },
  { id: "client-portal", group: "Accounts & portaal", label: "Klantportaal", detail: "Een persoonlijke omgeving met rechten per klant." },
  { id: "uploads", group: "Accounts & portaal", label: "Bestanden uploaden", detail: "Private opslag, type- en groottebeperking." },
  { id: "dashboard", group: "Accounts & portaal", label: "Dashboard", detail: "Overzicht van de afgesproken gegevens en acties." },
  { id: "crm", group: "Koppelingen & meten", label: "CRM-koppeling", detail: "Formuliergegevens naar het gekozen CRM." },
  { id: "analytics", group: "Koppelingen & meten", label: "Analytics", detail: "Metingen en doelen volgens de cookiekeuzes." },
  { id: "maps", group: "Koppelingen & meten", label: "Kaart & locatie", detail: "Locatie-informatie met passende privacykeuze." },
  { id: "api", group: "Koppelingen & meten", label: "Externe API", detail: "Authenticatie, foutafhandeling en afspraken over data." },
] as const;
export type SectionKind = keyof typeof sections;
const text = (max: number) => z.string().trim().max(max);
export const configurationSchema = z.object({
  title: text(180).default(""), client: text(180).default(""), purpose: text(1600).default(""), audience: text(800).default(""),
  category: z.enum(["Website", "WordPress", "Shopify", "Webapp"]).default("WordPress"),
  brandName: text(100).default("Jouw bedrijf"), headline: text(140).default("Een sterk verhaal. Een helder resultaat."),
  intro: text(400).default("Laat zien wat je doet en maak het bezoekers eenvoudig om de volgende stap te zetten."),
  actionLabel: text(50).default("Neem contact op"),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#175cff"),
  secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).default("#101828"),
  style: z.enum(["minimal", "editorial", "bold"]).default("minimal"),
  typography: z.enum(["sans", "serif"]).default("sans"),
  corners: z.enum(["soft", "square"]).default("soft"),
  pages: z.array(z.object({
    id: z.string().regex(/^[a-zA-Z0-9_-]{1,60}$/), title: text(80).min(1), slug: text(100).regex(/^\/[a-zA-Z0-9/_-]*$/),
    sections: z.array(z.enum(Object.keys(sections) as [SectionKind, ...SectionKind[]])).min(1).max(13),
  })).min(1).max(20).default([
    { id: "home", title: "Home", slug: "/", sections: ["hero", "services", "testimonials", "cta"] },
    { id: "about", title: "Over ons", slug: "/over-ons", sections: ["hero", "features", "stats"] },
    { id: "contact", title: "Contact", slug: "/contact", sections: ["hero", "contact", "faq"] },
  ]).refine(pages => new Set(pages.map(p => p.id)).size === pages.length && new Set(pages.map(p => p.slug)).size === pages.length, "Pagina’s moeten unieke adressen hebben.")
    .refine(pages => pages.some(p => p.slug === "/"), "Voeg een homepage met adres / toe."),
  features: z.array(z.enum(featureOptions.map(f => f.id) as [string, ...string[]])).max(30).default(["contact-form", "analytics"])
    .refine(v => new Set(v).size === v.length),
  languages: z.array(z.enum(["Nederlands", "Engels", "Duits", "Frans"])).min(1).max(4).default(["Nederlands"]),
  cms: z.enum(["WordPress / ACF", "Shopify", "Eigen CMS", "Geen CMS"]).default("WordPress / ACF"),
  contentBy: z.enum(["Klant levert aan", "Developer verzorgt", "Samen"]).default("Klant levert aan"),
  assets: z.array(z.enum(["Logo", "Kleuren", "Lettertypen", "Teksten", "Fotografie", "Productgegevens"])).max(6).default([]),
  integrations: text(1500).default(""), technicalNotes: text(2000).default(""), exclusions: text(1500).default(""),
  seo: z.enum(["Technische basis", "Basis + zoekwoordstructuur", "Uitgebreide SEO"]).default("Technische basis"),
  accessibility: z.enum(["WCAG 2.2 AA als doel", "WCAG 2.2 AA + audit"]).default("WCAG 2.2 AA als doel"),
  performance: z.enum(["Geoptimaliseerd responsive", "Core Web Vitals als acceptatiepunt"]).default("Geoptimaliseerd responsive"),
  maintenance: z.enum(["Alleen overdracht", "Onderhoudsafspraak maken", "Onderhoud inbegrepen"]).default("Onderhoudsafspraak maken"),
  revisions: z.number().int().min(0).max(20).default(2),
  budget: z.number().int().min(0).max(100000000).default(0), deadline: text(10).refine(s => !s || /^\d{4}-\d{2}-\d{2}$/.test(s)).default(""),
  hosting: z.enum(["Eigen hosting", "Hosting uitvoerder"]).default("Eigen hosting"), contact: z.boolean().default(false),
  paymentMode: z.enum(["platform", "direct"]).default("platform"),
  paymentSchedule: z.enum(["full", "phases"]).default("full"), phases: phasePlanSchema.default(defaultPhases),
}).superRefine((v, ctx) => {
  if (v.languages.length > 1 && !v.features.includes("multilingual")) ctx.addIssue({ code: "custom", path: ["features"], message: "Selecteer meertaligheid voor meerdere talen." });
  if (v.features.includes("cart") && !v.features.includes("catalog")) ctx.addIssue({ code: "custom", path: ["features"], message: "Een winkelmand vereist een productcatalogus." });
  if (v.features.includes("client-portal") && !v.features.includes("accounts")) ctx.addIssue({ code: "custom", path: ["features"], message: "Een klantportaal vereist gebruikersaccounts." });
});
export type WebsiteConfiguration = z.infer<typeof configurationSchema>;
export const newConfiguration = () => configurationSchema.parse({});
export function configurationSummary(c: WebsiteConfiguration) {
  const selected = featureOptions.filter(f => c.features.includes(f.id)).map(f => f.label);
  return [c.purpose || `Een ${c.category.toLowerCase()} met ${c.pages.length} pagina’s.`,
    `Pagina’s: ${c.pages.map(p => p.title).join(", ")}.`,
    selected.length ? `Functies: ${selected.join(", ")}.` : "", `Beheer: ${c.cms}. Talen: ${c.languages.join(", ")}.`].filter(Boolean).join("\n");
}
export function configurationChecklist(c: WebsiteConfiguration) {
  return [...standards.flatMap(g => g.items.map(title => ({ title, group: g.group, done: false }))),
    ...c.pages.map(p => ({ title: `Pagina ${p.title} (${p.slug}): ${p.sections.map(s => sections[s]).join(", ")}`, group: "Pagina’s & secties", done: false })),
    ...featureOptions.filter(f => c.features.includes(f.id)).map(f => ({ title: `${f.label}: ${f.detail}`, group: "Geselecteerde functies", done: false })),
    { title: `${c.cms}: beheer en overdracht controleren`, group: "Techniek & beheer", done: false },
    { title: `${c.seo}; ${c.accessibility}; ${c.performance}`, group: "Acceptatie", done: false },
    ...c.languages.map(language => ({ title: `${language}: content en navigatie controleren`, group: "Content", done: false })),
  ];
}
const euro = (v: number) => new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" }).format(v / 100);
const line = (v: string) => v.replace(/[\r\n]+/g, " ");
export function configurationDocument(c: WebsiteConfiguration, project?: Record<string, any>) {
  const budget = project?.budget ?? c.budget;
  const features = featureOptions.filter(f => c.features.includes(f.id));
  const checklist = configurationChecklist(c);
  return `# Projectbriefing · ${line(project?.title || c.title || "Nieuw project")}\n\n` +
    `## 1. Opdracht\n\n- Klant: ${line(project?.client || c.client || "Nog in te vullen")}\n- Platform: ${c.category}\n- Budget: ${euro(budget)}\n- Opleverdatum: ${project?.deadline || c.deadline || "Nog af te spreken"}\n\n${c.purpose || "Doel nog vastleggen."}\n\n**Doelgroep:** ${c.audience || "Nog vastleggen."}\n\n` +
    `## 2. Pagina’s & opbouw\n\n${c.pages.map((p, i) => `### ${i + 1}. ${p.title} · ${p.slug}\n\n${p.sections.map((s, j) => `${j + 1}. ${sections[s]}`).join("\n")}`).join("\n\n")}\n\n` +
    `## 3. Functies\n\n${features.length ? features.map(f => `- **${f.label}:** ${f.detail}`).join("\n") : "Geen aanvullende functies geselecteerd."}\n\n**Koppelingen:** ${c.integrations || "Geen aanvullende koppelingen afgesproken."}\n\n` +
    `## 4. Huisstijl & content\n\n- Merknaam: ${c.brandName}\n- Stijl: ${{ minimal: "Rustig & minimalistisch", editorial: "Redactioneel & verhalend", bold: "Krachtig & contrastrijk" }[c.style]}\n- Kleuren: ${c.primaryColor} en ${c.secondaryColor}\n- Typografie: ${c.typography === "serif" ? "Serif koppen" : "Sans-serif"}\n- Hoeken: ${c.corners === "soft" ? "Afgerond" : "Recht"}\n- Talen: ${c.languages.join(", ")}\n- Content: ${c.contentBy}\n- Beschikbaar materiaal: ${c.assets.join(", ") || "Nog aan te leveren"}\n- Hoofdkop: ${c.headline}\n- Introductie: ${c.intro}\n- Hoofdactie: ${c.actionLabel}\n\n` +
    `## 5. Techniek & acceptatie\n\n- CMS: ${c.cms}\n- Hosting: ${project?.hosting || c.hosting}\n- SEO: ${c.seo}\n- Toegankelijkheid: ${c.accessibility}\n- Performance: ${c.performance}\n- Revisierondes: ${c.revisions}\n- Beheer: ${c.maintenance}\n\n${c.technicalNotes || "Technische bijzonderheden worden tijdens de briefing afgestemd."}\n\n` +
    `## 6. Samenwerking & betaling\n\n- Klantcontact uitvoerder: ${(project?.contact ?? c.contact) ? "Toegestaan" : "Via de opdrachtgever"}\n- Afrekening: ${(project?.payment_mode || c.paymentMode) === "direct" ? "Eigen klantfacturatie" : "Via Mollie"}\n` +
    `${(project?.payment_schedule || c.paymentSchedule) === "phases" ? c.phases.map((p, i) => `- ${p.name}: ${p.percentage}% (${euro(phaseAmounts(budget, c.phases)[i])})`).join("\n") + "\n- De opdrachtgever keurt elke fase goed voordat de betaling wordt gestart.\n" : "- Eén projectbetaling na acceptatie van het bod.\n"}` +
    `\n## 7. Buiten de opdracht\n\n${c.exclusions || "Aanvullend werk buiten bovenstaande pagina’s, functies en afspraken wordt apart afgestemd."}\n\n` +
    `## 8. Opleverchecklist\n\n${checklist.map(item => `- [ ] ${item.group} · ${item.title}`).join("\n")}\n\n` +
    `Het visuele voorbeeld geeft de gekozen structuur en stijl weer. Het definitieve ontwerp en de implementatie worden tijdens het project uitgewerkt. Hostingwachtwoorden horen uitsluitend in de afgeschermde hostingkluis.\n`;
}
