export type HelpGuide = {
  id: string;
  title: string;
  description: string;
  sections: { title: string; text: string }[];
  note: string;
};

export const helpGuides: HelpGuide[] = [
  {
    id: "starten",
    title: "Snel aan de slag",
    description: "Van je eerste bezoek naar je eigen werkplek.",
    sections: [
      {
        title: "Maak je profiel aan",
        text: "Registreer met je e-mailadres en een wachtwoord. Bevestig je e-mailadres via de ontvangen mail, log in en vul je naam, bedrijf en rol in. Een developer kan projecten plaatsen én aannemen. Een klant bekijkt de projecten die met hem of haar zijn gedeeld.",
      },
      {
        title: "Verken je overzicht",
        text: "Je ziet lopende projecten, biedingen, werk voor review en recente activiteit. Via Mijn projecten open je de details van een opdracht. In Marktplaats vind je opdrachten waarop je kunt bieden.",
      },
      {
        title: "Start je eerste project",
        text: "Kies Nieuw project en begin met een standaardtemplate of een eigen template. Voeg de briefing, planning en afspraken toe. Je kunt ook eerst de visuele rondleiding doorlopen met de knop bovenaan dit helpvenster.",
      },
    ],
    note: "Je moet ingelogd zijn voordat je het portaal kunt bekijken. Na registratie start je met je eigen projecten.",
  },
  {
    id: "projecten",
    title: "Projecten & templates",
    description: "Leg de opdracht en je werkwijze helder vast.",
    sections: [
      {
        title: "Kies je bouwpakket",
        text: "Open Templates voor de standaardtemplates: zakelijke website, WordPress/ACF, Shopify en webapplicatie. Je kunt een template als uitgangspunt voor een eigen versie gebruiken en de briefing en checklist aanpassen. Sla deze op om hem later opnieuw te gebruiken.",
      },
      {
        title: "Vul de projectbriefing in",
        text: "Klik op Nieuw project. Kies een template en vul titel, klant of organisatie, beschrijving, budget en deadline in. Beschrijf wat moet worden opgeleverd, welke onderdelen buiten de opdracht vallen en hoe de oplevering wordt beoordeeld.",
      },
      {
        title: "Maak afspraken over hosting en contact",
        text: "Geef aan wie de hosting beheert en of de uitvoerder met de klant mag praten. Bij eigen hosting vul je de hostingkluis in nadat het project is geplaatst. Voeg huisstijl, content en overige documenten toe via Bestanden in het project.",
      },
      {
        title: "Volg de checklist",
        text: "Open het project en loop de checklist langs. Hier leg je afspraken vast over briefing, design, development, veiligheid, SEO en oplevering. Een vinkje helpt je het werk te volgen; controleer de daadwerkelijke uitvoering ook bij de review.",
      },
    ],
    note: "Je bent opdrachtgever op een project dat je plaatst. Op een andere opdracht kun je als uitvoerder werken met hetzelfde developerprofiel.",
  },
  {
    id: "samenwerken",
    title: "Bieden & samenwerken",
    description: "Van een passend bod naar een afgeronde opdracht.",
    sections: [
      {
        title: "Doe een bod",
        text: "Open een beschikbare opdracht in Marktplaats. Bekijk de briefing en vul bij Biedingen je prijs, doorlooptijd in dagen en aanpak in. Verstuur je bod. Als opdrachtgever kun je de ontvangen biedingen in je eigen project vergelijken.",
      },
      {
        title: "Kies een uitvoerder",
        text: "De opdrachtgever klikt op Bod accepteren en bevestigt de keuze. Er wordt één uitvoerder gekozen. Die krijgt daarna toegang tot de projectbestanden, developerchat en hostingkluis.",
      },
      {
        title: "Werk samen en deel voortgang",
        text: "Gebruik de developerchat voor afstemming binnen het projectteam. Werk de voortgang bij en lever bestanden aan in de juiste map. Projectupdates verschijnen bij Meldingen en Laatste activiteit; via Bekijk activiteiten open je het grotere overzicht.",
      },
      {
        title: "Lever op voor review",
        text: "Zet het project klaar voor review zodra het werk kan worden beoordeeld. De opdrachtgever controleert het resultaat, geeft feedback via het projectgesprek en accepteert de oplevering wanneer de afspraken zijn nagekomen.",
      },
    ],
    note: "Het klantgesprek is apart van de developerchat. De uitvoerder kan alleen met de klant chatten wanneer de opdrachtgever dit in Toegang toestaat.",
  },
  {
    id: "bestanden",
    title: "Bestanden & hosting",
    description:
      "Bewaar projectmateriaal en toegangsgegevens op de juiste plek.",
    sections: [
      {
        title: "Gebruik de projectmappen",
        text: "Open Bestanden in het project. Kies uit 01 Briefing, 02 Huisstijl, 03 Content, 04 Ontwerp, 05 Development en 06 Oplevering. Bewaar logo’s en merkbestanden onder Huisstijl en handleidingen voor de klant onder Oplevering.",
      },
      {
        title: "Upload en deel bewust",
        text: "Selecteer een bestand van maximaal 20 MB en upload het in de gekozen map. Vink Zichtbaar voor klant aan als de klant dit bestand mag zien. Zonder die keuze blijft het bestand binnen het projectteam.",
      },
      {
        title: "Vul de hostingkluis in",
        text: "De opdrachtgever voegt de benodigde hostinggegevens toe in de hostingkluis van het project en slaat ze op. De gekozen uitvoerder kan deze lezen zodra het bod is geaccepteerd. Klanten en andere developers krijgen deze gegevens niet te zien.",
      },
    ],
    note: "Plaats wachtwoorden en andere toegangsgeheimen in de hostingkluis, niet in chats, briefings of gedeelde bestanden.",
  },
  {
    id: "klantportaal",
    title: "Klantportaal & toegang",
    description: "Deel voortgang en documenten in jouw eigen huisstijl.",
    sections: [
      {
        title: "Stel je huisstijl in",
        text: "Ga naar Klantportaal. Vul de portaalnaam in, kies de accentkleur en upload je logo als PNG, JPG of WebP van maximaal 1 MB. Klik op Huisstijl opslaan.",
      },
      {
        title: "Geef de klant toegang",
        text: "Open het project en kies Toegang. Vul het e-mailadres in waarmee de klant inlogt en klik op Toegang geven. Gebruik Projectlink kopiëren en stuur die link zelf naar de klant. Er wordt geen uitnodigingsmail verstuurd.",
      },
      {
        title: "Bepaal wie mag chatten",
        text: "De klant kan met de opdrachtgever chatten. Schakel in Toegang het contact met de uitvoerder in als die ook rechtstreeks met de klant mag praten. De interne developerchat blijft apart.",
      },
      {
        title: "Pas toegang aan",
        text: "De klant ziet voortgang, het klantgesprek en expliciet gedeelde bestanden. Hostinggegevens en biedingen blijven afgeschermd. Met Intrekken trek je de eerder gegeven klanttoegang in.",
      },
    ],
    note: "De projectlink is geen toegangsbewijs. Het e-mailadres moet overeenkomen met het aangemelde account en de klant moet eerst zijn of haar e-mailadres bevestigen.",
  },
  {
    id: "betalingen",
    title: "Betalingen",
    description: "Bekijk de betaalroute en de platformvergoeding.",
    sections: [
      {
        title: "Bekijk de status",
        text: "In Betalingen zie je de betalingen die bij jouw projecten horen. Een betaalactie via Mollie is alleen beschikbaar nadat de betaalvoorziening door de beheerder is geactiveerd en het benodigde Mollie-account is gekoppeld.",
      },
      {
        title: "Koppel je account wanneer dit beschikbaar is",
        text: "De uitvoerder koppelt zijn Mollie-account via Instellingen. De opdrachtgever start de checkout vanuit het project. Na het betalen wordt de status gecontroleerd bij Mollie en bijgewerkt in Bouwr.",
      },
      {
        title: "Houd rekening met de vergoeding",
        text: "Bij betalingen via het platform gaat 15% van het transactiebedrag naar Bouwr. Bij een bedrag van € 1.000 is dit € 150; voor de uitvoerder blijft € 850 over vóór de kosten van Mollie.",
      },
      {
        title: "Eigen facturatie",
        text: "Voor opdrachten die de beheerder rechtstreeks met eigen klanten afrekent, is er een aparte route voor eigen facturatie. Stem die af met de beheerder voordat je een betaling start.",
      },
    ],
    note: "Mollie is in deze werkplek nog niet geactiveerd. De voorbeeldomgeving voert geen echte betalingen uit.",
  },
];

export function guideMarkdown(guide: HelpGuide) {
  return `# Bouwr · ${guide.title}\n\n${guide.description}\n\n${guide.sections.map((section, index) => `## ${index + 1}. ${section.title}\n\n${section.text}`).join("\n\n")}\n\n## Goed om te weten\n\n${guide.note}\n`;
}
