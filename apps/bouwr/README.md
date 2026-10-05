# Bouwr installeren op jouw VPS

Deze handleiding publiceert Bouwr op **https://bouwr.jpvanderzouwen.nl** naast PR3NT. Het dashboard, projectgegevens en bestanden vereisen een geldige login met een bevestigd e-mailadres. Alleen de aanmeldpagina's en gezondheidscontrole zijn openbaar.

De commando's hieronder zijn bedoeld voor een VPS met Debian 12/13 of Ubuntu 22.04/24.04/26.04, Nginx en roottoegang. Voer de blokken **in deze volgorde** uit. Ga bij een foutmelding niet door naar het volgende blok. De daadwerkelijke Docker- en Nginx-installatie kon nog niet op jouw VPS worden uitgevoerd; SSH was vanuit de bouwomgeving niet bereikbaar.

## 1. Verbinden met de VPS

Voer op jouw eigen computer uit, met dezelfde verbinding die je voor PR3NT gebruikt:

```bash
ssh janpaulvdzouwen@37.97.184.191
```

Dit is het laatst bekende VPS-adres. Als je normaal via `ssh root@app` verbindt, kun je die verbinding gebruiken. Alleen als je niet al root bent:

```bash
sudo -i
```

Controleer daarna op de VPS:

```bash
whoami
cat /etc/os-release
node --version
free -h
df -h /var/www
ss -ltnp 'sport = :3100'
```

`whoami` moet `root` tonen. Poort 3100 moet vrij zijn: bij `ss` mag alleen de kopregel verschijnen. Bouwr heeft een containerlimiet van 1 GB; de bouw vraagt daarnaast tijdelijk geheugen en schijfruimte. Het instelscript vereist Node 20.12 of hoger; de laatst bekende VPS-versie 20.20.2 voldoet. De app zelf draait op Node 24 in Docker.

## 2. Benodigde programma's controleren

Installeer de kleine hulpprogramma's:

```bash
apt-get update
apt-get install -y git curl ca-certificates dnsutils nano openssl
```

Controleer de bestaande Nginx-installatie:

```bash
nginx -t
systemctl is-active nginx
certbot --version
certbot plugins
```

Nginx moet een geldige configuratie hebben en `active` tonen. Bij Certbot moet de plugin `nginx` vermeld staan. PR3NT gebruikt deze programma's al. Alleen wanneer Nginx of Certbot nog ontbreekt, installeer je die met:

```bash
apt-get install -y nginx certbot python3-certbot-nginx
systemctl enable --now nginx
nginx -t
certbot plugins
```

Als Certbot wel bestaat maar zijn Nginx-plugin ontbreekt, stop dan hier: de plugin moet passen bij de bestaande installatie via apt, snap of pip. Vervang een bestaande installatie niet zomaar.

### Docker en Compose

Plak dit blok in zijn geheel. Een bestaande werkende Docker-installatie wordt gebruikt. Het blok stopt bij een afwijkende bestaande installatie of conflicterende pakketten, zodat bestaande containers behouden blijven.

```bash
bash <<'BASH'
set -euo pipefail
if command -v docker >/dev/null 2>&1; then
  docker --version
  docker compose version
  docker info >/dev/null
  echo 'Bestaande Docker en Compose zijn klaar voor gebruik.'
  exit 0
fi
for package in docker.io docker-compose docker-doc docker-buildx podman-docker containerd runc; do
  if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q '^install ok installed$'; then
    echo "Stop: bestaand pakket $package vereist eerst controle. Er is niets verwijderd."
    exit 1
  fi
done
. /etc/os-release
case "$ID:$VERSION_ID" in
  ubuntu:22.04|ubuntu:24.04|ubuntu:26.04)
    bouwr_os=ubuntu
    bouwr_suite="${UBUNTU_CODENAME:-$VERSION_CODENAME}"
    ;;
  debian:12|debian:13)
    bouwr_os=debian
    bouwr_suite="$VERSION_CODENAME"
    ;;
  *) echo "Stop: deze handleiding ondersteunt $ID $VERSION_ID niet."; exit 1 ;;
esac
install -m 0755 -d /etc/apt/keyrings
curl -fsSL "https://download.docker.com/linux/$bouwr_os/gpg" -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/$bouwr_os
Suites: $bouwr_suite
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
systemctl enable --now docker
docker compose version
docker info >/dev/null
BASH
```

Als Docker al aanwezig is en alleen Compose ontbreekt, geeft dit blok een foutmelding. Controleer dan eerst `apt-cache policy docker-ce docker.io docker-compose-plugin docker-compose-v2`. Bij een bestaande Docker CE-installatie kun je `apt-get install -y docker-compose-plugin` gebruiken; bij Ubuntu's `docker.io` gebruik je `apt-get install -y docker-compose-v2` als dat pakket een kandidaat heeft. Voer daarna het Docker-blok opnieuw uit. Verwijder geen Docker-pakketten of containers om deze stap te forceren.

Officiële installatiebronnen: https://docs.docker.com/engine/install/ubuntu/ en https://docs.docker.com/engine/install/debian/.

## 3. DNS instellen

Vraag het huidige IPv4-adres van PR3NT op:

```bash
dig +short A app.pr3nt.nl
```

Voeg in het DNS-beheer van **jpvanderzouwen.nl** dit record toe. Dit is één handeling in het beheerportaal van jouw domeinprovider; de terminalcommando's veranderen jouw DNS niet.

| Type | Naam | Waarde |
| --- | --- | --- |
| A | bouwr | Het VPS-IPv4-adres dat ook bij app.pr3nt.nl staat |

Het laatst bekende adres is `37.97.184.191`. Gebruik dit alleen als het nog overeenkomt met jouw VPS en het DNS-record van PR3NT. Een eventueel AAAA-record voor `bouwr` moet naar het juiste VPS-IPv6-adres wijzen; verwijder een verkeerd AAAA-record voor dit subdomein. Gebruik voor deze installatie een rechtstreeks DNS-record zonder CDN-proxy.

Controleer na het opslaan:

```bash
dig +short A bouwr.jpvanderzouwen.nl @1.1.1.1
dig +short A bouwr.jpvanderzouwen.nl @8.8.8.8
dig +short AAAA bouwr.jpvanderzouwen.nl @1.1.1.1
```

De eerste twee commando's moeten het juiste VPS-IPv4-adres tonen. De derde mag leeg zijn als je geen IPv6 gebruikt. Wacht op DNS-verspreiding als het adres nog niet klopt. Poorten 80 en 443 moeten vanaf internet bereikbaar zijn voor HTTPS en certificaatuitgifte; PR3NT gebruikt deze poorten al. Poort 3100 hoeft niet openbaar te worden geopend.

## 4. Bouwr downloaden

Voor de eerste installatie:

```bash
git clone --branch bouwr-vps --single-branch https://github.com/Jan-PaulvanderZouwen/pr3nt-theme-pack.git /var/www/bouwr
cd /var/www/bouwr/apps/bouwr
```

Als `/var/www/bouwr` al bestaat en een eerdere Bouwr-checkout bevat, gebruik dan dit blok in plaats van opnieuw klonen:

```bash
cd /var/www/bouwr
git status --short
git branch --show-current
git remote get-url origin
```

Alleen wanneer er geen lokale wijzigingen zijn, de branch `bouwr-vps` is en de remote bovenstaande repository is:

```bash
git pull --ff-only origin bouwr-vps
cd /var/www/bouwr/apps/bouwr
```

Gebruik voor deze installatie de aparte map `/var/www/bouwr`, niet de bestaande PR3NT-checkout.

## 5. Beheerder en e-mail instellen

```bash
cd /var/www/bouwr/apps/bouwr
node scripts/setup-env.mjs
stat -c '%a %n' .env
```

Vul bij **E-mailadres van de Bouwr-beheerder** het e-mailadres in waarmee je straks registreert. Het account wordt pas aangemaakt tijdens registratie in de browser. `stat` moet `600 .env` tonen.

Het script genereert automatisch beveiligingssleutels en leest de bestaande SMTP-instellingen uit `/var/www/pr3nt/pr3nt-theme-pack/apps/pr3nt-shopify-quote-app/.env`. Het accepteert `SMTP_PASS` of `SMTP_PASSWORD`. Het wijzigt de PR3NT-instellingen niet en overschrijft geen bestaande Bouwr-`.env`. De SMTP-mailbox moet verificatie- en herstelmails kunnen versturen.

### Alleen wanneer automatisch overnemen niet lukt

Maak een nieuwe configuratie vanuit het voorbeeld; dit blok weigert een bestaande `.env` te overschrijven en toont de sleutels niet:

```bash
cd /var/www/bouwr/apps/bouwr
node <<'NODE'
const fs = require('node:fs');
const crypto = require('node:crypto');
let text = fs.readFileSync('.env.example', 'utf8');
text = text.replace(/^BETTER_AUTH_SECRET=$/m, 'BETTER_AUTH_SECRET=' + crypto.randomBytes(48).toString('base64'));
text = text.replace(/^VAULT_KEY=$/m, 'VAULT_KEY=' + crypto.randomBytes(32).toString('base64'));
fs.writeFileSync('.env', text, { flag: 'wx', mode: 0o600 });
console.log('Configuratie aangemaakt; vul de mailgegevens en het beheeradres in.');
NODE
nano .env
chmod 600 .env
```

Vul in nano `ADMIN_EMAIL`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD` en `MAIL_FROM` in. Voor TransIP SMTP is dit doorgaans `smtp.transip.email`, poort `465` en `SMTP_SECURE=true`; neem de werkende mailboxgegevens over van PR3NT. Gebruik voor `MAIL_FROM` bijvoorbeeld `"Bouwr <jouw-mailbox@jouwdomein.nl>"`. Bewaar met **Ctrl+O**, Enter en sluit met **Ctrl+X**. Laat de gegenereerde sleutels, `APP_ORIGIN`, `DATA_DIR` en de uitgeschakelde Mollie-instellingen staan. Zet waarden met speciale tekens tussen quotes volgens de bestaande .env-opmaak. Deel dit bestand of de wachtwoorden niet in chat.

## 6. Installeren en HTTPS activeren

```bash
cd /var/www/bouwr/apps/bouwr
bash scripts/deploy.sh
```

Dit kan enkele minuten duren. Het script bouwt de container, controleert configuratie en SMTP zonder een e-mail te versturen, maakt de database en de aparte Nginx-site `bouwr`, vraagt een HTTPS-certificaat aan en controleert de loginomleiding. De app draait op `127.0.0.1:3100`; gegevens staan in `/var/lib/bouwr`.

Als Certbot daarom vraagt: vul jouw e-mailadres voor certificaatmeldingen in en lees/accepteer de voorwaarden wanneer je daarmee akkoord gaat. Een eventueel verzoek om informatie met EFF te delen is optioneel. Bij succes verschijnt:

```text
Bouwr is beschikbaar op https://bouwr.jpvanderzouwen.nl. Registreer en bevestig je e-mailadres voordat je inlogt.
```

Het script beheert uitsluitend de Nginx-site `bouwr`; het past het PM2-proces van PR3NT niet aan. Bij een fout: los eerst de aangegeven oorzaak op en voer hetzelfde installatiescript opnieuw uit. Een bestaande `.env` en de database blijven daarbij behouden.

## 7. Werking en verplichte login controleren

```bash
cd /var/www/bouwr/apps/bouwr
docker compose ps
curl -fsS https://bouwr.jpvanderzouwen.nl/api/health
curl -sS -o /dev/null -w '%{http_code}\n' https://bouwr.jpvanderzouwen.nl/
curl -sS -o /dev/null -w '%{http_code}\n' https://bouwr.jpvanderzouwen.nl/api/workspace
curl -sSI https://bouwr.jpvanderzouwen.nl/
```

Verwacht: container `healthy`, gezondheidscontrole `{"status":"ok"}`, vervolgens **307** voor de hoofdpagina en **401** voor de project-API. De laatste controle toont een `location` naar `/inloggen`. Gebruik geen `curl -k`: HTTPS moet met een geldig certificaat werken.

Controleer vervolgens [Bouwr](https://bouwr.jpvanderzouwen.nl/) in een privévenster:

1. Je moet eerst de loginpagina zien.
2. Kies **Registreren** en gebruik hetzelfde e-mailadres als `ADMIN_EMAIL` voor jouw beheerdersaccount.
3. Kies een wachtwoord van minimaal 12 tekens.
4. Open de bevestigingsmail en bevestig je e-mailadres. Controleer ook je spammap.
5. Log in en voltooi jouw profiel.
6. Log uit en bezoek de hoofdpagina opnieuw. Je moet weer de loginpagina zien.

Nieuwe gebruikers registreren zelf en moeten hun e-mailadres bevestigen. Het beheerrecht wordt op de server bepaald door `ADMIN_EMAIL`, niet door een vrij te kiezen rolveld. Projectrechten en bestandstoegang worden ook na de login per aanvraag gecontroleerd. Hostinggegevens zijn versleuteld en worden pas toegankelijk voor de geaccepteerde uitvoerder.

## 8. Bij een foutmelding

```bash
cd /var/www/bouwr/apps/bouwr
docker compose ps
docker compose logs --tail=80 bouwr
nginx -t
```

- **Certificaat/DNS-fout:** herhaal de DNS-controles uit stap 3 en controleer bereikbaarheid van poort 80.
- **SMTP-fout:** controleer mailbox, wachtwoord, poort en TLS-instelling met `nano .env`; voer daarna stap 6 opnieuw uit.
- **Geen bevestigingsmail:** controleer spam en de containerlogs; laat de loginbescherming ingeschakeld.
- **Poort 3100 bezet:** stop geen onbekende service; identificeer eerst welke applicatie de poort gebruikt.
- **Een bestaande Nginx-configuratie bouwr wordt geweigerd:** controleer die eerst; het script overschrijft geen configuratie die niet door Bouwr wordt beheerd.

Deel eventueel de foutmelding en bovenstaande statusuitvoer, nadat je persoonsgegevens en tokens hebt verwijderd. Deel geen `.env`, mailwachtwoorden, verificatielinks of beveiligingssleutels.

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

