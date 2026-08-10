#!/usr/bin/env bash
#
# ReadyPackets Portal — backup
#
# Produces a single compressed, optionally encrypted archive containing the
# database dump, the uploaded files, and the environment file. Retention is
# enforced locally; nothing is uploaded anywhere by default.
#
# Usage:
#   sudo ./backup.sh                       # nightly default
#   sudo ./backup.sh --output /mnt/backups # alternative destination
#   sudo ./backup.sh --encrypt             # age/gpg encryption if available
#   sudo ./backup.sh --db-only
#
# IMPORTANT: the archive contains DATA_ENCRYPTION_KEY. Without that key the
# encrypted columns in the dump are unrecoverable, and with it the dump is
# fully readable. Store backups accordingly.

set -Eeuo pipefail

ENV_FILE="${RP_ENV_FILE:-/etc/readypackets/portal.env}"
DATA_DIR="${RP_DATA_DIR:-/var/lib/readypackets}"
OUTPUT_DIR="/var/backups/readypackets"
RETENTION_DAYS=30
DB_ONLY="false"
ENCRYPT="false"
GPG_RECIPIENT="${RP_GPG_RECIPIENT:-}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m warn\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merror\033[0m %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)    OUTPUT_DIR="${2:?}"; shift 2 ;;
    --retention) RETENTION_DAYS="${2:?}"; shift 2 ;;
    --db-only)   DB_ONLY="true"; shift ;;
    --encrypt)   ENCRYPT="true"; shift ;;
    --recipient) GPG_RECIPIENT="${2:?}"; ENCRYPT="true"; shift 2 ;;
    --env-file)  ENV_FILE="${2:?}"; shift 2 ;;
    -h|--help)   sed -n '2,18p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)           die "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root: the environment file and storage are not world-readable."
[[ -r "$ENV_FILE" ]] || die "Cannot read ${ENV_FILE}"

# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a

: "${DB_NAME:?DB_NAME missing from the environment file}"
: "${DB_USER:?DB_USER missing from the environment file}"
: "${DB_PASSWORD:?DB_PASSWORD missing from the environment file}"

TIMESTAMP="$(date -u '+%Y%m%dT%H%M%SZ')"
STAGING="$(mktemp -d /tmp/rp-backup.XXXXXXXX)"
chmod 0700 "$STAGING"
# The staging directory holds plaintext secrets; remove it whatever happens.
trap 'rm -rf "$STAGING"' EXIT INT TERM

install -d -m 0700 "$OUTPUT_DIR"

# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
log "Dumping database '${DB_NAME}'"
# The password is passed through the environment rather than the command line so
# it does not appear in the process table.
MYSQL_PWD="$DB_PASSWORD" mysqldump \
  --host=127.0.0.1 \
  --user="$DB_USER" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 \
  --no-tablespaces \
  "$DB_NAME" > "${STAGING}/database.sql"

DUMP_BYTES="$(stat -c '%s' "${STAGING}/database.sql")"
[[ "$DUMP_BYTES" -gt 1024 ]] || die "The dump is suspiciously small (${DUMP_BYTES} bytes); aborting."
log "Dump size: $(numfmt --to=iec "$DUMP_BYTES")"

# ---------------------------------------------------------------------------
# Uploaded files and configuration
# ---------------------------------------------------------------------------
if [[ "$DB_ONLY" == "false" ]]; then
  if [[ -d "${DATA_DIR}/storage" ]]; then
    log "Archiving uploaded files"
    tar -C "$DATA_DIR" -cf "${STAGING}/storage.tar" storage
  else
    warn "No storage directory at ${DATA_DIR}/storage"
  fi

  # Included because the encryption keys are required to read the dump.
  cp "$ENV_FILE" "${STAGING}/portal.env"
fi

# A manifest makes a restore verifiable rather than hopeful.
cat > "${STAGING}/MANIFEST.txt" <<MANIFEST
ReadyPackets Portal backup
Created:        ${TIMESTAMP}
Host:           $(hostname -f 2>/dev/null || hostname)
Database:       ${DB_NAME}
Dump bytes:     ${DUMP_BYTES}
Includes files: $([[ "$DB_ONLY" == "false" ]] && echo yes || echo no)
Schema version: $(MYSQL_PWD="$DB_PASSWORD" mysql --host=127.0.0.1 --user="$DB_USER" \
                    --batch --skip-column-names -e \
                    "SELECT COALESCE(MAX(name),'none') FROM \`${DB_NAME}\`.schema_migrations" 2>/dev/null || echo unknown)

WARNING: this archive contains DATA_ENCRYPTION_KEY and EMAIL_INDEX_KEY.
Treat it as equivalent to the full customer database in plaintext.
MANIFEST

(cd "$STAGING" && sha256sum ./* > SHA256SUMS 2>/dev/null || true)

# ---------------------------------------------------------------------------
# Package
# ---------------------------------------------------------------------------
ARCHIVE="${OUTPUT_DIR}/readypackets-${TIMESTAMP}.tar.gz"
log "Writing ${ARCHIVE}"
tar -C "$STAGING" -czf "$ARCHIVE" .
chmod 0600 "$ARCHIVE"

if [[ "$ENCRYPT" == "true" ]]; then
  if command -v age >/dev/null 2>&1 && [[ -n "${RP_AGE_RECIPIENT:-}" ]]; then
    log "Encrypting with age"
    age -r "$RP_AGE_RECIPIENT" -o "${ARCHIVE}.age" "$ARCHIVE"
    shred -u "$ARCHIVE" 2>/dev/null || rm -f "$ARCHIVE"
    ARCHIVE="${ARCHIVE}.age"
  elif command -v gpg >/dev/null 2>&1 && [[ -n "$GPG_RECIPIENT" ]]; then
    log "Encrypting with gpg for ${GPG_RECIPIENT}"
    gpg --batch --yes --trust-model always --encrypt \
        --recipient "$GPG_RECIPIENT" --output "${ARCHIVE}.gpg" "$ARCHIVE"
    shred -u "$ARCHIVE" 2>/dev/null || rm -f "$ARCHIVE"
    ARCHIVE="${ARCHIVE}.gpg"
  else
    warn "Encryption requested but neither age (RP_AGE_RECIPIENT) nor gpg (--recipient) is available; the archive is unencrypted."
  fi
fi

chmod 0600 "$ARCHIVE"

# ---------------------------------------------------------------------------
# Retention
# ---------------------------------------------------------------------------
log "Removing archives older than ${RETENTION_DAYS} days"
find "$OUTPUT_DIR" -maxdepth 1 -type f -name 'readypackets-*.tar.gz*' \
  -mtime "+${RETENTION_DAYS}" -print -delete || true

REMAINING="$(find "$OUTPUT_DIR" -maxdepth 1 -type f -name 'readypackets-*' | wc -l)"

log "Backup complete: ${ARCHIVE} ($(numfmt --to=iec "$(stat -c '%s' "$ARCHIVE")")), ${REMAINING} archive(s) retained"

# A backup that has never been restored is not a backup. Restore into a scratch
# database periodically:  ./restore.sh --archive <file> --database rp_restore_test
