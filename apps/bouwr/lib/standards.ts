export const standards = [
  {
    group: "Briefing & afspraken",
    items: [
      "Doel, doelgroep en succescriteria vastleggen",
      "Pagina’s, functies en integraties afbakenen",
      "Budget, planning, mijlpalen en revisierondes afspreken",
      "Eigendom van code, licenties en overdracht vastleggen",
    ],
  },
  {
    group: "Design & content",
    items: [
      "Logo, kleuren, typografie en merkbestanden verzamelen",
      "Wireframes en responsive ontwerp goedkeuren",
      "Teksten, afbeeldingen en gebruiksrechten controleren",
      "Toetsenbordbediening, contrast en WCAG 2.2 AA controleren",
    ],
  },
  {
    group: "Development",
    items: [
      "Git-repository, README en ontwikkelomgeving inrichten",
      "Componenten, codeconventies en dependencybeheer vastleggen",
      "Staging, productie en omgevingsvariabelen scheiden",
      "Formulieren valideren en fout-, laad- en lege toestanden bouwen",
    ],
  },
  {
    group: "Veiligheid & privacy",
    items: [
      "HTTPS, veilige sessies en rechten per rol toepassen",
      "Geheimen versleutelen en nooit in Git opnemen",
      "Uploads, invoer en misbruikbeperking controleren",
      "Privacyverklaring, bewaartermijnen en cookiekeuzes regelen",
    ],
  },
  {
    group: "SEO & kwaliteit",
    items: [
      "Titels, meta, sitemap, robots en redirects controleren",
      "Semantische HTML en structured data waar relevant toepassen",
      "Afbeeldingen, caching en Core Web Vitals optimaliseren",
      "Mobiel, browsers, formulieren en koppelingen testen",
    ],
  },
  {
    group: "Oplevering & beheer",
    items: [
      "Klantacceptatie en restpunten vastleggen",
      "Back-up en herstelprocedure testen",
      "DNS, hosting, monitoring en updates overdragen",
      "Documentatie, toegang en onderhoudsafspraken opleveren",
    ],
  },
];
export const defaultTemplates = [
  {
    id: "website",
    name: "Zakelijke website",
    category: "Website",
    description: "Van eerste briefing tot een snelle, toegankelijke website.",
    checklist: standards.flatMap((g) =>
      g.items.map((title) => ({ title, done: false, group: g.group })),
    ),
  },
  {
    id: "wordpress",
    name: "WordPress & ACF",
    category: "WordPress",
    description:
      "Een beheersbare website met custom velden en veilige updates.",
    checklist: [
      ...standards.flatMap((g) =>
        g.items.map((title) => ({ title, done: false, group: g.group })),
      ),
      {
        title: "ACF-velden, rollen en editor documenteren",
        done: false,
        group: "Development",
      },
      {
        title: "Plugins, updates en beveiligingsbeleid inrichten",
        done: false,
        group: "Oplevering & beheer",
      },
    ],
  },
  {
    id: "shopify",
    name: "Shopify webshop",
    category: "Shopify",
    description:
      "Producten, checkout, thema en koppelingen klaar voor verkoop.",
    checklist: [
      ...standards.flatMap((g) =>
        g.items.map((title) => ({ title, done: false, group: g.group })),
      ),
      {
        title: "Verzendzones, btw en betaalmethoden controleren",
        done: false,
        group: "Development",
      },
      {
        title: "Testbestelling, retouren en ordermails controleren",
        done: false,
        group: "SEO & kwaliteit",
      },
    ],
  },
  {
    id: "webapp",
    name: "Webapplicatie",
    category: "Webapp",
    description:
      "Een applicatie met accounts, data en betrouwbare integraties.",
    checklist: [
      ...standards.flatMap((g) =>
        g.items.map((title) => ({ title, done: false, group: g.group })),
      ),
      {
        title: "Datamodel, migraties en rollenmatrix vastleggen",
        done: false,
        group: "Development",
      },
      {
        title: "API-contracten, logging en autorisatietests uitvoeren",
        done: false,
        group: "Veiligheid & privacy",
      },
    ],
  },
];
export const folders = [
  "01 Briefing",
  "02 Huisstijl",
  "03 Content",
  "04 Ontwerp",
  "05 Development",
  "06 Oplevering",
];
