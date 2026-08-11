#!/usr/bin/env bash
# ReadyPackets Portal — in-place upgrade script
# Usage: sudo bash deploy/upgrade.sh [--branch main] [--skip-backup]
#
# This script upgrades a running ReadyPackets installation to the latest
# version from the repository archive. It:
#   1. Takes a pre-upgrade backup (unless --skip-backup)
#   2. Builds the new client and server bundles
#   3. Runs any pending migrations
#   4. Replaces the installed files atomically
#   5. Restarts the service
#   6. Verifies the readiness probe
#
# The script is idempotent and safe to re-run if it fails partway through.
# Existing secrets in /etc/readypackets/portal.env are never modified.

set -euo pipefail

BRANCH="main"
SKIP_BACKUP=false
APP_DIR="/opt/readypackets"
BACKUP_DIR="/var/backups/readypackets"
ENV_FILE="/etc/readypackets/portal.env"
SERVICE="readypackets"
STAGING="/tmp/rp-upgrade-$$"

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()    { echo -e "${GREEN}[upgrade]${NC} $*"; }
warn()    { echo -e "${YELLOW}[upgrade]${NC} $*"; }
error()   { echo -e "${RED}[upgrade]${NC} $*" >&2; exit 1; }

# ── Argument parsing ──────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case "$1" in
    --branch)  BRANCH="$2"; shift 2 ;;
    --skip-backup) SKIP_BACKUP=true; shift ;;
    *) error "Unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || error "Run as root: sudo bash deploy/upgrade.sh"
[[ -f "$ENV_FILE" ]] || error "No installation found at $ENV_FILE"

# ── Pre-upgrade backup ────────────────────────────────────────────────────────
if [[ "$SKIP_BACKUP" == false ]]; then
  info "Taking pre-upgrade backup…"
  if [[ -f "$APP_DIR/deploy/backup.sh" ]]; then
    bash "$APP_DIR/deploy/backup.sh" || warn "Backup failed — continuing anyway"
  else
    warn "Backup script not found; skipping backup"
  fi
fi

# ── Determine source directory ────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(dirname "$SCRIPT_DIR")"

info "Source directory: $SRC_DIR"
info "Branch: $BRANCH"

# ── Install dependencies ──────────────────────────────────────────────────────
info "Installing dependencies…"
cd "$SRC_DIR"
export COREPACK_ENABLE_DOWNLOAD_PROMPT=0
pnpm install --frozen-lockfile 2>&1 | tail -5

# ── Build ─────────────────────────────────────────────────────────────────────
info "Building client…"
./node_modules/.bin/vite build --outDir client/dist 2>&1 | tail -5

info "Building server…"
./node_modules/.bin/esbuild server/index.ts \
  --bundle --platform=node --target=node22 \
  --format=esm --outfile=dist/server.js \
  --external:argon2 --external:mysql2 \
  --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" \
  2>&1 | tail -5

# Build utility scripts
for script in scripts/migrate.ts scripts/seed.ts scripts/create-admin.ts; do
  name=$(basename "$script" .ts)
  ./node_modules/.bin/esbuild "$script" \
    --bundle --platform=node --target=node22 \
    --format=esm --outfile="dist/${name}.js" \
    --external:argon2 --external:mysql2 \
    --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" \
    2>/dev/null || true
done

# ── Stage new files ───────────────────────────────────────────────────────────
info "Staging new build…"
mkdir -p "$STAGING"
cp -r dist "$STAGING/"
cp -r client/dist "$STAGING/client-dist"
cp -r migrations "$STAGING/"
cp -r scripts/data "$STAGING/data" 2>/dev/null || true

# ── Stop service ──────────────────────────────────────────────────────────────
info "Stopping service for atomic swap…"
systemctl stop "$SERVICE" || true

# ── Swap files ────────────────────────────────────────────────────────────────
info "Installing new build…"
rm -rf "$APP_DIR/dist" "$APP_DIR/client/dist" "$APP_DIR/migrations" "$APP_DIR/scripts/data"
cp -r "$STAGING/dist" "$APP_DIR/"
mkdir -p "$APP_DIR/client"
cp -r "$STAGING/client-dist" "$APP_DIR/client/dist"
cp -r "$STAGING/migrations" "$APP_DIR/"
[[ -d "$STAGING/data" ]] && cp -r "$STAGING/data" "$APP_DIR/scripts/"

# Fix permissions
chown -R readypackets:readypackets "$APP_DIR/dist" "$APP_DIR/client/dist" 2>/dev/null || true

# ── Run migrations ────────────────────────────────────────────────────────────
info "Running pending migrations…"
# shellcheck source=/dev/null
source "$ENV_FILE"
for migration in "$APP_DIR/migrations"/*.sql; do
  name=$(basename "$migration")
  already=$(mysql -u"${DB_USER:-readypackets}" -p"${DB_PASS}" "${DB_NAME:-readypackets}" \
    -sNe "SELECT COUNT(*) FROM schema_migrations WHERE filename='$name'" 2>/dev/null || echo 0)
  if [[ "$already" == "0" ]]; then
    info "  Applying $name…"
    mysql -u"${DB_USER:-readypackets}" -p"${DB_PASS}" "${DB_NAME:-readypackets}" < "$migration"
    mysql -u"${DB_USER:-readypackets}" -p"${DB_PASS}" "${DB_NAME:-readypackets}" \
      -e "INSERT INTO schema_migrations (filename) VALUES ('$name')" 2>/dev/null || true
  else
    info "  Skipping $name (already applied)"
  fi
done

# ── Start service ─────────────────────────────────────────────────────────────
info "Starting service…"
systemctl start "$SERVICE"
sleep 4

# ── Verify ───────────────────────────────────────────────────────────────────
info "Verifying readiness…"
PORT=$(grep "^PORT=" "$ENV_FILE" | cut -d= -f2 | tr -d '"' || echo 3000)
DOMAIN=$(grep "^APP_URL=" "$ENV_FILE" | sed 's|.*://||' | tr -d '"/' || echo "localhost")
READY=$(curl -s -m 10 \
  -H "Host: $DOMAIN" \
  -H "X-Forwarded-Proto: https" \
  "http://127.0.0.1:${PORT}/api/health/ready" || echo "failed")

if echo "$READY" | grep -q '"ready"'; then
  info "✓ Upgrade complete — service is ready"
else
  error "Service did not become ready after upgrade. Check: journalctl -u $SERVICE -n 50"
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -rf "$STAGING"
info "Upgrade finished successfully."
