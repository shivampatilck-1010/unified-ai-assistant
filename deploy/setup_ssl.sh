#!/usr/bin/env bash
# ==============================================================================
# Automated HTTPS & SSL Setup for Unified AI Assistant (Linux VPS)
# ==============================================================================
set -euo pipefail

if [ "$#" -lt 2 ]; then
    echo "Usage: $0 <DOMAIN> <EMAIL>"
    echo "Example: $0 assistant.example.com admin@example.com"
    exit 1
fi

DOMAIN="$1"
EMAIL="$2"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

echo "=== Initializing SSL Certificate Issuance for: ${DOMAIN} ==="

# 1. Locate Docker Compose project volume names
WWW_VOLUME=$(docker volume ls -q --filter name=certbot_www | head -n 1)
CERTS_VOLUME=$(docker volume ls -q --filter name=certbot_certs | head -n 1)

if [ -z "$WWW_VOLUME" ] || [ -z "$CERTS_VOLUME" ]; then
    echo "ERROR: Docker volumes for certbot (certbot_www and certbot_certs) not found." >&2
    echo "Ensure 'docker compose -f docker-compose.prod.yml up -d web' is running first." >&2
    exit 1
fi

# 2. Run Certbot via official container
echo "Running Certbot webroot verification for domain: ${DOMAIN}..."
docker run --rm \
  -v "${WWW_VOLUME}:/var/www/certbot" \
  -v "${CERTS_VOLUME}:/etc/letsencrypt" \
  certbot/certbot certonly --webroot \
  -w /var/www/certbot \
  -d "${DOMAIN}" \
  --email "${EMAIL}" \
  --agree-tos --no-eff-email

# 3. Verify that certificate fullchain.pem and privkey.pem were successfully generated
echo "Verifying certificate and private key presence..."
docker run --rm \
  -v "${CERTS_VOLUME}:/etc/letsencrypt:ro" \
  alpine test -s "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" || {
    echo "ERROR: Certificate fullchain.pem was not generated." >&2
    exit 1
}

docker run --rm \
  -v "${CERTS_VOLUME}:/etc/letsencrypt:ro" \
  alpine test -s "/etc/letsencrypt/live/${DOMAIN}/privkey.pem" || {
    echo "ERROR: Private key privkey.pem was not generated." >&2
    exit 1
}

# 4. Generate SSL Nginx configuration from template
echo "Applying HTTPS Nginx configuration..."
sed "s/\${DOMAIN}/${DOMAIN}/g" "${SCRIPT_DIR}/nginx-ssl.conf.template" > "${SCRIPT_DIR}/nginx-active.conf"

# Copy active configuration into the running web container
docker compose -f "${ROOT_DIR}/docker-compose.prod.yml" cp "${SCRIPT_DIR}/nginx-active.conf" web:/etc/nginx/conf.d/default.conf

# 5. Reload Nginx without downtime
echo "Testing Nginx configuration and reloading..."
docker compose -f "${ROOT_DIR}/docker-compose.prod.yml" exec web nginx -t
docker compose -f "${ROOT_DIR}/docker-compose.prod.yml" exec web nginx -s reload

echo "=== HTTPS is now active at: https://${DOMAIN} ==="
echo ""
echo "To ensure automatic renewal, add the following cron job (e.g. to /etc/cron.d/certbot-renew):"
echo "0 3 * * * root docker run --rm -v ${WWW_VOLUME}:/var/www/certbot -v ${CERTS_VOLUME}:/etc/letsencrypt certbot/certbot renew --quiet && docker compose -f ${ROOT_DIR}/docker-compose.prod.yml exec web nginx -s reload"
