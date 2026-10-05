# Bouwr op de VPS

Zelfstandige versie voor **https://bouwr.jpvanderzouwen.nl**, naast de bestaande PR3NT-app. React/Next.js, SQLite, private bestanden en Better Auth. De VPS-versie gebruikt geen Sites- of ChatGPT-identiteitsheaders.

## Wat is afgeschermd

- Het dashboard wordt op de server pas weergegeven na een geldige sessie en een bevestigd e-mailadres.
- Aanmelden met e-mail en wachtwoord, e-mailbevestiging, wachtwoordherstel en uitloggen.
- Een wachtwoord heeft minimaal 12 tekens. Authenticatie gebruikt Better Auth met scrypt, sessies in de database, beveiligde cookies en limieten op aanmeldpogingen.
- Iedere API-aanvraag en download controleert opnieuw de sessie en projectrechten. Alleen een link of een zelf ingevulde identiteit geeft geen toegang.
- Hostinggegevens zijn versleuteld met AES-256-GCM. De gekozen uitvoerder krijgt pas na acceptatie toegang.
- Klanten krijgen toegang op hun bevestigde e-mailadres. Ze zien alleen expliciet gedeelde bestanden en het klantgesprek.

## Voorbereiding

1. Voeg bij de DNS van `jpvanderzouwen.nl` een **A-record `bouwr`** toe met hetzelfde VPS-IP als `app.pr3nt.nl`. Een aanwezig AAAA-record moet naar het juiste IPv6-adres wijzen; laat geen verkeerd AAAA-record staan.
2. Op de VPS zijn Git, Docker Engine met Compose v2, Nginx, Certbot met Nginx-plugin en curl nodig. Docker houdt de Node-versie van Bouwr gescheiden van PR3NT. Installatie van Docker: https://docs.docker.com/engine/install/ (kies de distributie van de VPS).
3. Poort 80/443 moet bereikbaar zijn. Bouwr zelf luistert uitsluitend op `127.0.0.1:3100`; SQLite en uploads staan in `/var/lib/bouwr`, buiten de openbare website.
4. De bestaande PR3NT SMTP-instellingen worden lokaal gelezen bij het aanmaken van Bouwr-instellingen. De mailbox moet verificatie- en herstelmails kunnen verzenden. Ze worden niet in Git opgeslagen of naar ChatGPT gestuurd.

## Eerste installatie

Voer als root op de VPS uit:

```bash
git clone --branch bouwr-vps --single-branch https://github.com/Jan-PaulvanderZouwen/pr3nt-theme-pack.git /var/www/bouwr
cd /var/www/bouwr/apps/bouwr
node scripts/setup-env.mjs
bash scripts/deploy.sh
```

Vul het e-mailadres in waarmee je jezelf als beheerder registreert. Het instelscript verwacht bestaande mailinstellingen in `/var/www/pr3nt/pr3nt-theme-pack/apps/pr3nt-shopify-quote-app/.env` en accepteert daar `SMTP_PASS` of `SMTP_PASSWORD`. Bij ontbrekende SMTP-instellingen stopt het: maak dan `.env` vanuit `.env.example` en vul deze op de VPS in. De installatiescripts overschrijven een bestaande `.env` niet.

De uitrol controleert de configuratie en SMTP-verbinding, bouwt de eigen container, controleert de database en maakt uitsluitend de Nginx-site `bouwr` aan. Certbot vraagt om het e-mailadres voor certificaatmeldingen en de gebruikelijke voorwaarden. Daarna controleert het script dat een bezoek zonder sessie naar de login wordt doorgestuurd. De PR3NT-configuratie en het PM2-proces worden niet aangepast.

Open na succesvolle installatie de website, kies **Registreren**, bevestig je e-mailadres en log in. Vul daarna je naam, bedrijf en projectrol in. Beheer wordt bepaald door `ADMIN_EMAIL`, niet door een vrij invulbaar rolveld.

## Bestaande gegevens

Deze installatie begint met een nieuwe database. De bestaande Sites-versie blijft beschikbaar en wordt niet gewist. Er stond bij voorbereiding één opgeslagen project in die werkplek. Dat project en het bestaande profiel zijn niet automatisch geëxporteerd; de beschikbare databaselezer leverde een verkorte checklist. Er is bewust geen gedeeltelijk record geïmporteerd. Volledige gegevensoverdracht moet plaatsvinden voordat je de oude werkplek buiten gebruik stelt.

## Betalingen

De bestaande Mollie Connect-flow en 15% platformvergoeding zijn behouden. Mollie staat uit totdat de beheerder de OAuth-app, callback, webhook en accountkoppeling heeft ingesteld. Callback: `https://bouwr.jpvanderzouwen.nl/api/mollie/callback`; webhook: `https://bouwr.jpvanderzouwen.nl/api/mollie/webhook`. Activeer eerst testbetalingen. Live Mollie-transacties zijn niet getest.

## Updaten en controleren

```bash
cd /var/www/bouwr
git pull --ff-only origin bouwr-vps
cd apps/bouwr
sudo bash scripts/deploy.sh
docker compose ps
docker compose logs --tail=80
```

Zet mailwachtwoorden of beveiligingssleutels nooit in geplakte loguitvoer. Maak vóór updates een back-up van `/var/lib/bouwr` en `.env`. De `VAULT_KEY` is nodig om hostinggegevens uit een teruggezette back-up te kunnen lezen; genereer die niet opnieuw bij een update. Het instelscript houdt bestaande sleutels in stand.

Als een nieuwe versie niet gezond wordt, koppelt het script geen nieuwe Nginx-site. Bestaande Bouwr-updates kunnen kort onderbroken worden bij een containerwissel. Voor terugzetten: kies de vorige Git-commit en bouw die opnieuw, met dezelfde `.env` en data. Bij schemawijzigingen kan ook een vooraf gemaakte databaseback-up nodig zijn.

## Lokale ontwikkeling en validatie

Node 22.13 of hoger (Docker gebruikt Node 24), met SMTP-instellingen voor verificatiemails. Zet `DATA_DIR` lokaal op een private map en `APP_ORIGIN` op je lokale URL; uitsluitend ontwikkeling mag HTTP gebruiken.

```bash
npm ci
npm run db:migrate
npm run dev
```

Controles: `npm run check`, `npm run build`, `npm test`. De integratietests gebruiken een aparte tijdelijke database en onderscheppen verificatiemails zonder ze te versturen. Ze testen de echte productie-server voor login-afscherming, projectrollen, biedingen, kluis, uploads, klanttoegang, chat, voortgang, meldingen, CSRF en sessie-intrekking. Het container- en Nginx-pad moet nog op de VPS worden uitgevoerd; Docker en SSH waren niet beschikbaar in de bouwomgeving.

Technische bronnen: https://better-auth.com/docs/authentication/email-password, https://better-auth.com/docs/adapters/sqlite, https://better-auth.com/docs/integrations/next.
