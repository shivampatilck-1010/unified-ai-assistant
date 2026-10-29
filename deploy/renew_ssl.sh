#!/usr/bin/env bash
# ==============================================================================
# Automated SSL Certificate Renewal & Nginx Reload
# ==============================================================================
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${ROOT_DIR}/docker-compose.prod.yml"

WWW_VOLUME=$(docker volume ls -q --filter name=certbot_www | head -n 1)
CERTS_VOLUME=$(docker volume ls -q --filter name=certbot_certs | head -n 1)

if [ -z "$WWW_VOLUME" ] || [ -z "$CERTS_VOLUME" ]; then
    echo "ERROR: Certbot persistent volumes not found." >&2
    exit 1
fi

echo "Attempting Certbot renewal check..."
# Run certbot renew; returns 0 if certificates renewed or not yet due
docker run --rm \
  -v "${WWW_VOLUME}:/var/www/certbot" \
  -v "${CERTS_VOLUME}:/etc/letsencrypt" \
  certbot/certbot renew --quiet

# Verify Nginx configuration syntax before reloading
echo "Testing Nginx configuration syntax..."
docker compose -f "${COMPOSE_FILE}" exec web nginx -t

# Reload Nginx configuration to pick up any renewed certificates
echo "Reloading Nginx web proxy..."
docker compose -f "${COMPOSE_FILE}" exec web nginx -s reload
echo "Renewal check and reload completed successfully."
