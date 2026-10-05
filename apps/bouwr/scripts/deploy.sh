#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ${EUID} -ne 0 ]]; then echo 'Voer dit script als root uit (sudo bash scripts/deploy.sh).'; exit 1; fi
for command in docker nginx certbot curl; do
  command -v "$command" >/dev/null || { echo "Benodigd programma ontbreekt: $command. Zie README.md."; exit 1; }
done
docker compose version >/dev/null
[[ -f .env ]] || { echo 'Maak eerst .env: zie README.md.'; exit 1; }
[[ -d /etc/nginx/sites-available && -d /etc/nginx/sites-enabled ]] || { echo 'Deze installatie verwacht Debian/Ubuntu met Nginx sites-available.'; exit 1; }
if [[ -f /etc/nginx/sites-available/bouwr && $(head -1 /etc/nginx/sites-available/bouwr) != '# Bouwr-managed' ]]; then
  echo 'Er bestaat al een niet door Bouwr beheerde Nginx-configuratie. Controleer deze eerst.'; exit 1
fi
install -d -o 1000 -g 1000 -m 700 /var/lib/bouwr
docker compose build
docker compose run --rm --no-deps bouwr node --import tsx scripts/check-config.ts
docker compose up -d --wait --wait-timeout 180
curl --fail --silent http://127.0.0.1:3100/api/health >/dev/null
curl --silent --output /dev/null --write-out '%{http_code}' http://127.0.0.1:3100/ | grep -q '^307$'
if [[ ! -f /etc/nginx/sites-available/bouwr ]]; then
  { echo '# Bouwr-managed'; cat deploy/nginx-http.conf; } > /etc/nginx/sites-available/bouwr
  ln -s /etc/nginx/sites-available/bouwr /etc/nginx/sites-enabled/bouwr
  if ! nginx -t; then rm /etc/nginx/sites-enabled/bouwr /etc/nginx/sites-available/bouwr; exit 1; fi
  systemctl reload nginx
fi
echo 'Zorg dat het A-record voor bouwr.jpvanderzouwen.nl naar deze VPS wijst. Een eventueel AAAA-record moet ook kloppen.'
certbot certonly --nginx --keep-until-expiring --cert-name bouwr.jpvanderzouwen.nl -d bouwr.jpvanderzouwen.nl
backup=$(mktemp)
cp /etc/nginx/sites-available/bouwr "$backup"
{ echo '# Bouwr-managed'; cat deploy/nginx.conf; } > /etc/nginx/sites-available/bouwr
if ! nginx -t; then cp "$backup" /etc/nginx/sites-available/bouwr; rm "$backup"; exit 1; fi
rm "$backup"
systemctl reload nginx
code=$(curl --silent --output /dev/null --write-out '%{http_code}' https://bouwr.jpvanderzouwen.nl/)
[[ $code == 307 ]] || { echo "Logincontrole geeft HTTP $code. Controleer docker compose logs --tail=80."; exit 1; }
echo 'Bouwr is beschikbaar op https://bouwr.jpvanderzouwen.nl. Registreer en bevestig je e-mailadres voordat je inlogt.'
