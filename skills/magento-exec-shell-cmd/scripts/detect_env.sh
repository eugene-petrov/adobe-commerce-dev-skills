#!/usr/bin/env bash
# Detect how commands must be run for a Magento project.
# Usage: detect_env.sh [magento_root]
# Prints two lines:
#   env=<name>        override | warden | ddev | docker-magento | docker-compose | local
#   wrapper=<prefix>  command prefix that runs a shell command inside the project's PHP runtime
#                     (empty for local). Use as: <prefix> sh -c '<command>'
# Override: export MAGENTO_EXEC="<prefix>" (e.g. "ddev exec", "docker compose exec -T php")
# to skip detection entirely.

root="${1:-.}"
cd "$root" 2>/dev/null || { echo "env=local"; echo "wrapper="; exit 0; }

if [ -n "${MAGENTO_EXEC:-}" ]; then
    echo "env=override"; echo "wrapper=$MAGENTO_EXEC"; exit 0
fi

if [ -f .env ] && grep -q '^WARDEN_ENV_NAME=' .env && command -v warden >/dev/null 2>&1; then
    echo "env=warden"; echo "wrapper=warden env exec -T php-fpm"; exit 0
fi

if [ -f .ddev/config.yaml ] && command -v ddev >/dev/null 2>&1; then
    echo "env=ddev"; echo "wrapper=ddev exec"; exit 0
fi

if [ -x bin/clinotty ]; then
    echo "env=docker-magento"; echo "wrapper=bin/clinotty"; exit 0
fi

for f in compose.yaml compose.yml docker-compose.yml docker-compose.yaml; do
    if [ -f "$f" ] && command -v docker >/dev/null 2>&1; then
        svc="$(grep -E '^  (php-fpm|phpfpm|php|fpm|app):' "$f" | head -1 | tr -d ' :')"
        if [ -n "$svc" ]; then
            echo "env=docker-compose"; echo "wrapper=docker compose exec -T $svc"; exit 0
        fi
    fi
done

echo "env=local"
echo "wrapper="
