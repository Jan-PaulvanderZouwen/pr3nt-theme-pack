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
        text: "Je ziet lopende projecten, werk voor review en recente activiteit. Klik op Overzicht bewerken om widgets toe te voegen, te verslepen, van formaat te veranderen of te verwijderen. Je kunt ook eigen notities en links maken. Klik op Opslaan om jouw indeling te bewaren. Via Mijn projecten open je de details van een opdracht. In Marktplaats vind je opdrachten waarop je kunt bieden.",
      },
      {
        title: "Start je eerste project",
        text: "Kies Nieuw project en stel de website samen in de configurator. Selecteer pagina’s, secties, functies en stijl. De briefing en checklist worden automatisch gemaakt. Voeg planning en afspraken toe. Je kunt ook eerst de visuele rondleiding doorlopen met de knop bovenaan dit helpvenster.",
      },
    ],
    note: "Je moet ingelogd zijn voordat je het portaal kunt bekijken. Na registratie start je met je eigen projecten.",
  },
  {
    id: "projecten",
    title: "Websiteconfigurator",
    description: "Leg de opdracht en je werkwijze helder vast.",
    sections: [
      {
        title: "Bepaal pagina’s en secties",
        text: "Open Configurator of Nieuw project. Kies een type project en voeg pagina’s toe. Je bepaalt per pagina welke secties nodig zijn en in welke volgorde ze staan. In het voorbeeld ernaast zie je de gekozen structuur. Wissel tussen desktop- en mobiel voorbeeld.",
      },
      {
        title: "Vul de projectbriefing in",
        text: "Vul doel en doelgroep in en kies functies, talen, stijl, CMS en kwaliteitseisen. Geef budget, deadline en eventuele betaalfases op. In Documentatie controleer je de automatisch samengestelde briefing en download je die als Markdown. Sla een concept op om later verder te gaan. Na Opdracht plaatsen kunnen developers bieden.",
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
    id: "mailbox",
    title: "Mailbox & Outlook",
    description: "Lees projectberichten en e-mail op één plek.",
    sections: [
      { title: "Gebruik de postvakken", text: "Open Berichten. Je vindt Postvak IN, Met ster, Verzonden, Concepten en Archief. Zoek op onderwerp of berichtvoorbeeld. Open een gesprek, markeer het met een ster of archiveer het. Projectgesprekken blijven gescheiden in developer- en klantgesprekken volgens de bestaande projectrechten." },
      { title: "Reageer of maak een concept", text: "Klik op Reageren of Nieuw bericht. Kies het juiste projectgesprek of de gekoppelde Outlook-mailbox. Met Concept opslaan bewaar je een bericht voor later. Er wordt alleen verstuurd wanneer je op Versturen klikt. Gebruik de hostingkluis voor wachtwoorden." },
      { title: "Koppel jouw Outlook-mailbox", text: "De beheerder registreert Bouwr eerst in Microsoft Entra en vult de clientgegevens op de VPS in. Via Mailboxinstellingen kies je Outlook-account koppelen, meld je je aan bij Microsoft en geef je toestemming. Ondersteund zijn je eigen Microsoft 365- of Outlook.com-mailbox; gedeelde mailboxen worden in deze versie niet gekoppeld." },
      { title: "Synchroniseer", text: "Klik op Synchroniseren om mail op te halen. Terwijl de mailboxpagina openstaat, worden wijzigingen iedere minuut opgehaald. Postvak IN, Verzonden, Concepten en Archief worden meegenomen. Gelezen, sterren en archiveren worden ook naar Outlook bijgewerkt. Oudere berichten worden stapsgewijs opgehaald. Bekijk e-mailbijlagen via Open in Outlook." },
      { title: "Ontkoppel", text: "In Mailboxinstellingen klik je op Ontkoppelen. De lokale Outlook-berichten en toegangstokens worden uit Bouwr verwijderd. Je mailbox bij Microsoft blijft bestaan. Je kunt de toestemming van Bouwr ook bij Microsoft intrekken." },
    ],
    note: "De Outlook-mailbox is alleen voor de gekoppelde developer zichtbaar. Mail wordt als tekst weergegeven; externe afbeeldingen en scripts worden niet geladen.",
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
        text: "Nieuwe platformbetalingen bevatten een platformvergoeding van 5%. Je vindt de toelichting bij Betaaldetails. Eerder gestarte betalingen houden hun oorspronkelijke vergoeding.",
      },
      {
        title: "Betaal per fase",
        text: "Kies in de configurator Betalen per fase en verdeel samen 100%. Je kunt een bestaand betaalplan aanpassen zolang nog geen betaling is gestart. Na acceptatie van het bod biedt de uitvoerder een fase aan voor akkoord. De opdrachtgever keurt de fase goed en start daarna de Mollie-checkout. Het projecttotaal wordt verdeeld over de fases; een fase wordt niet opnieuw betaald nadat betaling is ontvangen.",
      },
      {
        title: "Eigen facturatie",
        text: "Voor opdrachten die de beheerder rechtstreeks met eigen klanten afrekent, is er een aparte route voor eigen facturatie. Stem die af met de beheerder voordat je een betaling start.",
      },
    ],
    note: "Betalen wordt beschikbaar nadat Mollie is geactiveerd en de uitvoerder zijn account heeft gekoppeld. De beheerder kan ook eigen facturatie kiezen.",
  },
];

export function guideMarkdown(guide: HelpGuide) {
  return `# Bouwr · ${guide.title}\n\n${guide.description}\n\n${guide.sections.map((section, index) => `## ${index + 1}. ${section.title}\n\n${section.text}`).join("\n\n")}\n\n## Goed om te weten\n\n${guide.note}\n`;
}
