#!/usr/bin/env bash
#
# ReadyPackets Portal — restore
#
# Restores a database dump, and optionally the uploaded files, from an archive
# produced by backup.sh. Destructive by nature, so it refuses to proceed without
# an explicit confirmation and takes a safety dump of the current state first.
#
# Usage:
#   sudo ./restore.sh --archive /var/backups/readypackets/readypackets-....tar.gz
#   sudo ./restore.sh --archive <file> --database rp_restore_test --no-files
#   sudo ./restore.sh --archive <file> --yes
#
# Verifying a backup without touching production:
#   sudo ./restore.sh --archive <file> --database rp_restore_test --no-files --yes

set -Eeuo pipefail

ENV_FILE="${RP_ENV_FILE:-/etc/readypackets/portal.env}"
DATA_DIR="${RP_DATA_DIR:-/var/lib/readypackets}"
ARCHIVE=""
TARGET_DB=""
RESTORE_FILES="true"
ASSUME_YES="false"
SERVICE="readypackets"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m warn\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --archive)   ARCHIVE="${2:?}"; shift 2 ;;
    --database)  TARGET_DB="${2:?}"; shift 2 ;;
    --no-files)  RESTORE_FILES="false"; shift ;;
    --yes)       ASSUME_YES="true"; shift ;;
    --env-file)  ENV_FILE="${2:?}"; shift 2 ;;
    -h|--help)   sed -n '2,18p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)           die "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root."
[[ -n "$ARCHIVE" ]] || die "--archive is required."
[[ -r "$ARCHIVE" ]] || die "Cannot read ${ARCHIVE}"
[[ -r "$ENV_FILE" ]] || die "Cannot read ${ENV_FILE}"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${DB_NAME:?}" ; : "${DB_USER:?}" ; : "${DB_PASSWORD:?}"

TARGET_DB="${TARGET_DB:-$DB_NAME}"
IS_PRODUCTION="false"
[[ "$TARGET_DB" == "$DB_NAME" ]] && IS_PRODUCTION="true"

STAGING="$(mktemp -d /tmp/rp-restore.XXXXXXXX)"
chmod 0700 "$STAGING"
trap 'rm -rf "$STAGING"' EXIT INT TERM

# ---------------------------------------------------------------------------
# Unpack
# ---------------------------------------------------------------------------
log "Unpacking archive"
case "$ARCHIVE" in
  *.age)
    command -v age >/dev/null 2>&1 || die "age is required to decrypt this archive."
    age --decrypt -o "${STAGING}/archive.tar.gz" "$ARCHIVE"
    tar -C "$STAGING" -xzf "${STAGING}/archive.tar.gz"
    ;;
  *.gpg)
    command -v gpg >/dev/null 2>&1 || die "gpg is required to decrypt this archive."
    gpg --batch --yes --decrypt --output "${STAGING}/archive.tar.gz" "$ARCHIVE"
    tar -C "$STAGING" -xzf "${STAGING}/archive.tar.gz"
    ;;
  *.tar.gz)
    tar -C "$STAGING" -xzf "$ARCHIVE"
    ;;
  *)
    die "Unrecognised archive format: ${ARCHIVE}"
    ;;
esac

[[ -f "${STAGING}/database.sql" ]] || die "The archive contains no database.sql"

if [[ -f "${STAGING}/MANIFEST.txt" ]]; then
  log "Archive manifest:"
  sed 's/^/    /' "${STAGING}/MANIFEST.txt"
fi

if [[ -f "${STAGING}/SHA256SUMS" ]]; then
  log "Verifying checksums"
  (cd "$STAGING" && sha256sum -c --ignore-missing --quiet SHA256SUMS) \
    || die "Checksum verification failed; the archive is corrupt."
fi

# ---------------------------------------------------------------------------
# The encryption key must match, or the restored rows are unreadable
# ---------------------------------------------------------------------------
if [[ -f "${STAGING}/portal.env" ]]; then
  ARCHIVE_KEY="$(grep -E '^DATA_ENCRYPTION_KEY=' "${STAGING}/portal.env" | cut -d= -f2- || true)"
  if [[ -n "$ARCHIVE_KEY" && "$ARCHIVE_KEY" != "${DATA_ENCRYPTION_KEY:-}" ]]; then
    warn "The archive was created with a DIFFERENT DATA_ENCRYPTION_KEY than the one"
    warn "currently configured. Encrypted columns (names, emails, company details)"
    warn "will not decrypt after this restore unless you also restore the key from"
    warn "${STAGING}/portal.env into ${ENV_FILE}."
    if [[ "$ASSUME_YES" != "true" ]]; then
      read -r -p "Continue anyway? [y/N] " reply
      [[ "$reply" == "y" || "$reply" == "Y" ]] || die "Aborted."
    fi
  fi
fi

# ---------------------------------------------------------------------------
# Confirmation
# ---------------------------------------------------------------------------
if [[ "$ASSUME_YES" != "true" ]]; then
  echo
  if [[ "$IS_PRODUCTION" == "true" ]]; then
    warn "This will OVERWRITE the live database '${TARGET_DB}'."
  else
    log "This will overwrite the database '${TARGET_DB}' (not the live database)."
  fi
  [[ "$RESTORE_FILES" == "true" ]] && warn "Uploaded files in ${DATA_DIR}/storage will also be replaced."
  read -r -p "Type the database name to confirm: " reply
  [[ "$reply" == "$TARGET_DB" ]] || die "Confirmation did not match; nothing was changed."
fi

# ---------------------------------------------------------------------------
# Safety dump of the current state
# ---------------------------------------------------------------------------
if MYSQL_PWD="$DB_PASSWORD" mysql --host=127.0.0.1 --user="$DB_USER" \
     -e "USE \`${TARGET_DB}\`" 2>/dev/null; then
  SAFETY="/var/backups/readypackets/pre-restore-${TARGET_DB}-$(date -u '+%Y%m%dT%H%M%SZ').sql.gz"
  install -d -m 0700 /var/backups/readypackets
  log "Taking a safety dump of the current '${TARGET_DB}' to ${SAFETY}"
  MYSQL_PWD="$DB_PASSWORD" mysqldump --host=127.0.0.1 --user="$DB_USER" \
    --single-transaction --quick --no-tablespaces "$TARGET_DB" | gzip > "$SAFETY"
  chmod 0600 "$SAFETY"
fi

# ---------------------------------------------------------------------------
# Restore
# ---------------------------------------------------------------------------
if [[ "$IS_PRODUCTION" == "true" ]]; then
  log "Stopping ${SERVICE}"
  systemctl stop "$SERVICE" 2>/dev/null || docker compose stop app 2>/dev/null || \
    warn "Could not stop the service automatically; ensure it is not writing during the restore."
fi

log "Restoring the database into '${TARGET_DB}'"
MYSQL_PWD="$DB_PASSWORD" mysql --host=127.0.0.1 --user="$DB_USER" <<SQL
CREATE DATABASE IF NOT EXISTS \`${TARGET_DB}\`
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
SQL

# The dump recreates each table, so an existing schema is replaced rather than
# merged. Foreign key checks are disabled for the load and restored afterwards.
{
  echo "SET FOREIGN_KEY_CHECKS=0;"
  echo "SET UNIQUE_CHECKS=0;"
  cat "${STAGING}/database.sql"
  echo "SET UNIQUE_CHECKS=1;"
  echo "SET FOREIGN_KEY_CHECKS=1;"
} | MYSQL_PWD="$DB_PASSWORD" mysql --host=127.0.0.1 --user="$DB_USER" "$TARGET_DB"

TABLES="$(MYSQL_PWD="$DB_PASSWORD" mysql --host=127.0.0.1 --user="$DB_USER" \
  --batch --skip-column-names -e \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='${TARGET_DB}'")"
log "Restored ${TABLES} tables"
[[ "$TABLES" -gt 10 ]] || die "Only ${TABLES} tables were restored; the dump appears incomplete."

# ---------------------------------------------------------------------------
# Files
# ---------------------------------------------------------------------------
if [[ "$RESTORE_FILES" == "true" && -f "${STAGING}/storage.tar" ]]; then
  log "Restoring uploaded files"
  if [[ -d "${DATA_DIR}/storage" ]]; then
    mv "${DATA_DIR}/storage" "${DATA_DIR}/storage.replaced-$(date -u '+%Y%m%dT%H%M%SZ')"
  fi
  tar -C "$DATA_DIR" -xf "${STAGING}/storage.tar"
  chown -R readypackets:readypackets "${DATA_DIR}/storage" 2>/dev/null || true
  chmod -R go-rwx "${DATA_DIR}/storage"
elif [[ "$RESTORE_FILES" == "true" ]]; then
  warn "The archive contains no storage.tar; uploaded files were not restored."
fi

# ---------------------------------------------------------------------------
# Bring the service back
# ---------------------------------------------------------------------------
if [[ "$IS_PRODUCTION" == "true" ]]; then
  log "Applying any pending migrations"
  runuser -u readypackets -- env $(grep -v '^#' "$ENV_FILE" | xargs) \
    node /opt/readypackets/dist/migrate.js || warn "Migration step failed; review before serving traffic."

  log "Starting ${SERVICE}"
  systemctl start "$SERVICE" 2>/dev/null || docker compose start app 2>/dev/null || true
  sleep 3
  if curl -fsS -H "Host: localhost" http://127.0.0.1:3000/api/health/ready >/dev/null 2>&1; then
    log "The service is ready."
  else
    warn "The readiness probe failed. Check the service logs."
  fi
fi

log "Restore complete."
