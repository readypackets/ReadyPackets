#!/usr/bin/env bash
# ReadyPackets unified installer: native VPS, Docker, or Docker bootstrap.
set -Eeuo pipefail
umask 077

MODE=""
DOMAIN=""
EMAIL=""
PROJECT_DIR=""
TLS="true"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

usage() {
  cat <<'USAGE'
Usage:
  sudo bash deploy/unified-install.sh --mode native --domain portal.example.com --email ops@example.com
  sudo bash deploy/unified-install.sh --mode docker --domain portal.example.com --email ops@example.com [--project-dir /srv/readypackets]
  sudo bash deploy/unified-install.sh --mode docker-bootstrap --domain portal.example.com --email ops@example.com [--project-dir /srv/readypackets]

Modes:
  native             Installs directly on the VPS using systemd, nginx, and MySQL.
  docker             Uses an existing Docker Engine and Docker Compose installation.
  docker-bootstrap   Installs Docker Engine packages first, then performs Docker deployment.

The native path remains the supported choice for a small VPS that uses the full
backup, upgrade, and rollback control helpers. Docker deployment creates an
isolated app/database stack behind host nginx with TLS and does not expose MySQL.
USAGE
}
fail() { printf '[unified-install] %s\n' "$*" >&2; exit 1; }
log() { printf '[unified-install] %s\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --mode) MODE="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --project-dir) PROJECT_DIR="${2:-}"; shift 2 ;;
    --no-tls) TLS="false"; shift ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || fail "Run this installer as root."
[[ "$MODE" == "native" || "$MODE" == "docker" || "$MODE" == "docker-bootstrap" ]] || fail "Choose --mode native, docker, or docker-bootstrap."
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] || fail "A valid --domain is required."
[[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || fail "A valid --email is required."

if [[ "$MODE" == "native" ]]; then
  args=(--domain "$DOMAIN" --email "$EMAIL")
  [[ "$TLS" == "true" ]] && args+=(--tls)
  exec bash "$REPO_ROOT/deploy/install.sh" "${args[@]}"
fi

PROJECT_DIR="${PROJECT_DIR:-$REPO_ROOT}"
[[ -f "$PROJECT_DIR/docker-compose.yml" && -f "$PROJECT_DIR/.env.example" ]] || fail "Docker deployment requires a ReadyPackets project directory with docker-compose.yml and .env.example."

if [[ "$MODE" == "docker-bootstrap" ]]; then
  log "Installing Docker Engine and Compose plugin."
  apt-get update -qq
  apt-get install -y --no-install-recommends docker.io docker-compose-plugin
  systemctl enable --now docker
fi
command -v docker >/dev/null 2>&1 || fail "Docker is not installed. Use --mode docker-bootstrap or install Docker first."
docker compose version >/dev/null 2>&1 || fail "Docker Compose v2 is required."

ENV_FILE="$PROJECT_DIR/.env"
if [[ ! -f "$ENV_FILE" ]]; then
  log "Generating initial Docker environment file."
  session_secret="$(openssl rand -base64 48 | tr -d '\n=')"
  data_key="$(openssl rand -hex 32)"
  index_key="$(openssl rand -hex 32)"
  mysql_password="$(openssl rand -base64 32 | tr -d '\n=/+' | cut -c1-32)"
  mysql_root_password="$(openssl rand -base64 40 | tr -d '\n=/+' | cut -c1-40)"
  cat > "$ENV_FILE" <<ENV
APP_URL=https://${DOMAIN}
ALLOWED_ORIGINS=https://${DOMAIN}
HEALTHCHECK_HOST=${DOMAIN}
MYSQL_DATABASE=readypackets
MYSQL_USER=readypackets
MYSQL_PASSWORD=${mysql_password}
MYSQL_ROOT_PASSWORD=${mysql_root_password}
SESSION_SECRET=${session_secret}
DATA_ENCRYPTION_KEY=${data_key}
EMAIL_INDEX_KEY=${index_key}
TRUST_PROXY_HOPS=1
BEHIND_CLOUDFLARE=false
ENV
  chmod 0600 "$ENV_FILE"
  log "Created $ENV_FILE with generated secrets. Store an encrypted offline copy before continuing production use."
fi

log "Building and starting Docker services."
(cd "$PROJECT_DIR" && docker compose up --build -d)
log "Running schema migrations and base seed inside the application container."
(cd "$PROJECT_DIR" && docker compose exec -T app node dist/migrate.js && docker compose exec -T app node dist/seed.js)

log "Installing host nginx reverse proxy for loopback-only Docker application access."
apt-get update -qq
apt-get install -y --no-install-recommends nginx nginx-extras certbot
host_regex="${DOMAIN//./\\\\.}"
# Install HTTP-only ACME configuration first. The complete template references a
# certificate that does not exist until Certbot has issued it, so installing the
# TLS server block first would make nginx validation fail on a fresh host.
acme_config="$(mktemp)"
sed -n '1,50p' "$PROJECT_DIR/deploy/nginx.conf" > "$acme_config"
sed -e "s/portal\.readypackets\.com/${DOMAIN}/g" -e "s/__RP_HOST_REGEX__/${host_regex}/g" "$acme_config" > /etc/nginx/sites-available/readypackets
rm -f "$acme_config"
ln -sf /etc/nginx/sites-available/readypackets /etc/nginx/sites-enabled/readypackets
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
if [[ "$TLS" == "true" ]]; then
  certbot certonly --webroot --webroot-path /var/www/html --non-interactive --agree-tos --email "$EMAIL" -d "$DOMAIN"
fi
sed -e "s/portal\.readypackets\.com/${DOMAIN}/g" -e "s/__RP_HOST_REGEX__/${host_regex}/g" "$PROJECT_DIR/deploy/nginx.conf" > /etc/nginx/sites-available/readypackets
nginx -t && systemctl reload nginx
curl -fsS -H "Host: $DOMAIN" -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/api/health >/dev/null
log "Docker ReadyPackets installation is healthy at https://${DOMAIN}."
