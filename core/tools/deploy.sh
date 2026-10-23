#!/usr/bin/env bash
# Déploiement du frontend sur le VPS (exécuté sur le serveur lui-même).
#
#   bash core/tools/deploy.sh             tests + build + publication + nginx + vérification
#   bash core/tools/deploy.sh --rollback  restaure la version précédente
#   bash core/tools/deploy.sh --no-nginx  ne touche pas à la configuration nginx
#
# La racine web et le domaine sont lus dans deploy/nginx/<site>.conf.
set -euo pipefail
cd "$(dirname "$0")/../.."

CONF=$(ls deploy/nginx/*.conf | head -1)
NAME=$(basename "$CONF" .conf)
WWW=$(awk '$1 == "root" { gsub(";", "", $2); print $2; exit }' "$CONF")
DOMAIN=$(awk '$1 == "server_name" { gsub(";", "", $2); print $2; exit }' "$CONF")
BACKUPS="/var/backups/halal-frontend/$NAME"
STAMP=$(date +%Y%m%d-%H%M%S)
INSTALL_NGINX=true

log() { echo "▶ $*"; }
die() { echo "✖ $*" >&2; exit 1; }

[[ -n "$WWW" && -n "$DOMAIN" ]] || die "root / server_name introuvables dans $CONF"

if [[ "${1:-}" == "--rollback" ]]; then
    LAST=$(sudo ls -1d "$BACKUPS"/www-* 2>/dev/null | tail -1) || true
    [[ -n "$LAST" ]] || die "aucune sauvegarde dans $BACKUPS"
    log "Restauration de $LAST → $WWW"
    sudo rsync -a --delete "$LAST/" "$WWW/"
    if sudo test -f "$LAST.nginx.conf"; then
        sudo cp "$LAST.nginx.conf" "/etc/nginx/sites-available/$NAME"
        sudo nginx -t && sudo systemctl reload nginx
    fi
    log "Version précédente restaurée."
    exit 0
fi
[[ "${1:-}" == "--no-nginx" ]] && INSTALL_NGINX=false

log "Tests unitaires"
npm test --silent >/dev/null || die "tests unitaires en échec"
log "Build de production"
npm run build --silent

log "Sauvegarde de la version en ligne ($BACKUPS/www-$STAMP)"
sudo mkdir -p "$BACKUPS"
sudo rsync -a "$WWW/" "$BACKUPS/www-$STAMP/"
sudo cp "/etc/nginx/sites-available/$NAME" "$BACKUPS/www-$STAMP.nginx.conf"
# On garde les 5 dernières sauvegardes
sudo ls -1d "$BACKUPS"/www-* | grep -v '\.nginx\.conf$' | head -n -5 | while read -r old; do sudo rm -rf "$old" "$old.nginx.conf"; done

log "Publication dist/ → $WWW"
sudo rsync -a --delete --chown=www-data:www-data --chmod=D755,F644 dist/ "$WWW/"

if $INSTALL_NGINX; then
    log "Configuration nginx"
    sudo cp "$CONF" "/etc/nginx/sites-available/$NAME"
    if ! sudo nginx -t 2>/tmp/nginx-test.log; then
        sudo cp "$BACKUPS/www-$STAMP.nginx.conf" "/etc/nginx/sites-available/$NAME"
        cat /tmp/nginx-test.log >&2
        die "nginx -t en échec : ancienne configuration restaurée (fichiers web déjà publiés, --rollback pour revenir)"
    fi
    sudo systemctl reload nginx
fi

log "Vérification https://$DOMAIN"
for path in / /catalogue.html /proxy/stats "/proxy/v2/search?page_size=1" /service-worker.js; do
    code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN$path")
    # /proxy/stats peut répondre 503 « computing » juste après un recalcul : comportement prévu
    [[ "$code" == 200 || ( "$path" == /proxy/stats && "$code" == 503 ) ]] || die "https://$DOMAIN$path → HTTP $code (bash core/tools/deploy.sh --rollback pour revenir)"
    echo "  ✔ $path"
done
code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 "https://$DOMAIN/page-inexistante")
[[ "$code" == 404 ]] || die "les URL inconnues devraient renvoyer 404 (reçu $code)"
echo "  ✔ 404"
log "Déployé : https://$DOMAIN"
