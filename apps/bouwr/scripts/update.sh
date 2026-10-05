#!/usr/bin/env bash
# Existing installation: back up the data before pulling and deploying the update.
set -euo pipefail
umask 077
bouwr_checkout=${BOUWR_CHECKOUT:-/var/www/bouwr}
[[ ${EUID} -eq 0 ]] || { echo 'Voer dit script als root uit.'; exit 1; }
cd "$bouwr_checkout"
[[ $(git branch --show-current) == bouwr-vps ]] || { echo 'Stop: de checkout moet op branch bouwr-vps staan.'; exit 1; }
case "$(git remote get-url origin)" in
  https://github.com/Jan-PaulvanderZouwen/pr3nt-theme-pack.git|git@github.com:Jan-PaulvanderZouwen/pr3nt-theme-pack.git) ;;
  *) echo 'Stop: de origin is niet de Bouwr-repository.'; exit 1 ;;
esac
[[ -z $(git status --porcelain) ]] || { echo 'Stop: er zijn lokale wijzigingen. Bewaar en controleer die eerst.'; exit 1; }
[[ -f apps/bouwr/.env && -f /var/lib/bouwr/bouwr.sqlite ]] || { echo 'Stop: dit script verwacht een bestaande Bouwr-installatie.'; exit 1; }
for bouwr_command in docker nginx certbot curl tar; do command -v "$bouwr_command" >/dev/null || { echo "Programma ontbreekt: $bouwr_command"; exit 1; }; done
docker compose version >/dev/null
git fetch origin bouwr-vps
git merge-base --is-ancestor HEAD FETCH_HEAD || { echo 'Stop: de checkout kan niet zonder samenvoeging worden bijgewerkt.'; exit 1; }
install -d -m 700 /var/backups/bouwr
bouwr_backup=$(mktemp -d /var/backups/bouwr/update-XXXXXXXX)
git rev-parse HEAD > "$bouwr_backup/previous-commit.txt"
cp apps/bouwr/.env "$bouwr_backup/config.env"
cd apps/bouwr
bouwr_stopped=false
bouwr_cleanup() {
  if [[ $bouwr_stopped == true ]]; then docker compose start bouwr || true; fi
}
trap bouwr_cleanup EXIT
echo "Back-up maken in $bouwr_backup (korte onderbreking van Bouwr)."
docker compose stop bouwr
bouwr_stopped=true
tar -C /var/lib/bouwr -czf "$bouwr_backup/data.tar.gz" .
docker compose start bouwr
bouwr_stopped=false
cd "$bouwr_checkout"
git merge --ff-only FETCH_HEAD
cd apps/bouwr
if ! bash scripts/deploy.sh; then
  echo "De uitrol is niet geslaagd. Back-up en vorige commit: $bouwr_backup."
  echo 'Controleer de containerlogs en de instructies voor terugzetten in README.md.'
  exit 1
fi
docker compose ps
echo "Update gereed. Back-up: $bouwr_backup. Accounts, projecten en bestanden zijn behouden."
