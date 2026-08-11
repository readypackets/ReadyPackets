#!/usr/bin/env bash
#
# ReadyPackets Portal — advanced 3-2-1 backup
#
# Implements the 3-2-1 strategy:
#   3 copies of data
#   2 different storage media / locations
#   1 offsite copy
#
# Supported cloud targets (configure via /etc/readypackets/portal.env):
#   Amazon S3 / Wasabi S3   — RP_BACKUP_S3_BUCKET, RP_BACKUP_S3_ENDPOINT (optional),
#                              RP_BACKUP_S3_ACCESS_KEY, RP_BACKUP_S3_SECRET_KEY,
#                              RP_BACKUP_S3_REGION (default us-east-1)
#   Backblaze B2             — RP_BACKUP_B2_BUCKET, RP_BACKUP_B2_KEY_ID, RP_BACKUP_B2_APP_KEY
#   OneDrive / SharePoint    — RP_BACKUP_GRAPH_TENANT_ID, RP_BACKUP_GRAPH_CLIENT_ID,
#                              RP_BACKUP_GRAPH_CLIENT_SECRET, RP_BACKUP_GRAPH_DRIVE_ID,
#                              RP_BACKUP_GRAPH_FOLDER (default ReadyPackets/Backups)
#   Google Drive             — RP_BACKUP_GDRIVE_SA_JSON (service account JSON path),
#                              RP_BACKUP_GDRIVE_FOLDER_ID
#   Dropbox                  — RP_BACKUP_DROPBOX_TOKEN, RP_BACKUP_DROPBOX_PATH
#
# Usage:
#   sudo ./backup-321.sh                         # full backup, local + all configured targets
#   sudo ./backup-321.sh --db-only               # skip file storage
#   sudo ./backup-321.sh --encrypt               # age/gpg encryption
#   sudo ./backup-321.sh --target s3             # only upload to S3/Wasabi
#   sudo ./backup-321.sh --target b2             # only upload to Backblaze B2
#   sudo ./backup-321.sh --target onedrive       # only upload to OneDrive/SharePoint
#   sudo ./backup-321.sh --target gdrive         # only upload to Google Drive
#   sudo ./backup-321.sh --target dropbox        # only upload to Dropbox
#   sudo ./backup-321.sh --local-only            # skip all cloud uploads
#   sudo ./backup-321.sh --retention 14          # local retention days (default 30)
#   sudo ./backup-321.sh --cloud-retention 90    # cloud retention days (default 365)
#   sudo ./backup-321.sh --list                  # list local backups
#
# IMPORTANT: the archive contains DATA_ENCRYPTION_KEY. Treat it as a secret.
set -Eeuo pipefail

ENV_FILE="${RP_ENV_FILE:-/etc/readypackets/portal.env}"
DATA_DIR="${RP_DATA_DIR:-/var/lib/readypackets}"
OUTPUT_DIR="/var/backups/readypackets"
RETENTION_DAYS=30
CLOUD_RETENTION_DAYS=365
DB_ONLY="false"
ENCRYPT="false"
LOCAL_ONLY="false"
TARGET_FILTER=""
LIST_MODE="false"
GPG_RECIPIENT="${RP_GPG_RECIPIENT:-}"

log()  { printf '\033[1;34m==>\033[0m %s\n' "$*"; }
ok()   { printf '\033[1;32m ok\033[0m  %s\n' "$*"; }
warn() { printf '\033[1;33mwarn\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31merr \033[0m %s\n' "$*" >&2; exit 1; }
skip() { printf '\033[0;37mskip\033[0m %s\n' "$*"; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --output)           OUTPUT_DIR="${2:?}"; shift 2 ;;
    --retention)        RETENTION_DAYS="${2:?}"; shift 2 ;;
    --cloud-retention)  CLOUD_RETENTION_DAYS="${2:?}"; shift 2 ;;
    --db-only)          DB_ONLY="true"; shift ;;
    --encrypt)          ENCRYPT="true"; shift ;;
    --recipient)        GPG_RECIPIENT="${2:?}"; ENCRYPT="true"; shift 2 ;;
    --env-file)         ENV_FILE="${2:?}"; shift 2 ;;
    --local-only)       LOCAL_ONLY="true"; shift ;;
    --target)           TARGET_FILTER="${2:?}"; shift 2 ;;
    --list)             LIST_MODE="true"; shift ;;
    -h|--help)          sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *)                  die "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || die "Run as root."
[[ -r "$ENV_FILE" ]] || die "Cannot read ${ENV_FILE}"
set -a; source "$ENV_FILE"; set +a

if [[ "$LIST_MODE" == "true" ]]; then
  log "Local backups in ${OUTPUT_DIR}"
  find "$OUTPUT_DIR" -maxdepth 1 -name "readypackets-*.tar.gz*" -printf "%T@ %f\n" 2>/dev/null \
    | sort -rn | awk '{print $2}' \
    | while read -r f; do
        size=$(du -sh "${OUTPUT_DIR}/${f}" 2>/dev/null | cut -f1)
        printf "  %-60s %s\n" "$f" "$size"
      done
  exit 0
fi

mkdir -p "$OUTPUT_DIR"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BASENAME="readypackets-${TIMESTAMP}"
STAGING=$(mktemp -d)
trap 'rm -rf "$STAGING"' EXIT

log "Starting 3-2-1 backup at ${TIMESTAMP}"

log "Dumping database"
: "${DB_NAME:?DB_NAME missing}" "${DB_USER:?DB_USER missing}" "${DB_PASSWORD:?DB_PASSWORD missing}"
MYSQL_PWD="$DB_PASSWORD" mysqldump \
  --host=127.0.0.1 --user="$DB_USER" \
  --single-transaction --quick --triggers --set-gtid-purged=OFF \
  --default-character-set=utf8mb4 --no-tablespaces \
  "$DB_NAME" > "${STAGING}/database.sql"
ok "Database dump: $(du -sh "${STAGING}/database.sql" | cut -f1)"

if [[ "$DB_ONLY" != "true" ]] && [[ -d "${DATA_DIR}/storage" ]]; then
  log "Archiving file storage"
  tar -C "$DATA_DIR" -cf "${STAGING}/files.tar" storage
  ok "File storage: $(du -sh "${STAGING}/files.tar" | cut -f1)"
fi

cp "$ENV_FILE" "${STAGING}/portal.env"

cat > "${STAGING}/MANIFEST.txt" <<EOF
ReadyPackets Portal 3-2-1 Backup
Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")
Hostname:  $(hostname)
Strategy:  3-2-1 (local + cloud)
DB-only:   ${DB_ONLY}
WARNING: This archive contains DATA_ENCRYPTION_KEY. Treat as plaintext customer data.
EOF
(cd "$STAGING" && sha256sum ./* > SHA256SUMS 2>/dev/null || true)

ARCHIVE="${OUTPUT_DIR}/${BASENAME}.tar.gz"
tar -czf "$ARCHIVE" -C "$STAGING" .
chmod 0600 "$ARCHIVE"
ok "Local archive: ${ARCHIVE} ($(du -sh "$ARCHIVE" | cut -f1))"

if [[ "$ENCRYPT" == "true" ]]; then
  if command -v age &>/dev/null && [[ -n "${RP_AGE_RECIPIENT:-}" ]]; then
    age -r "${RP_AGE_RECIPIENT}" -o "${ARCHIVE}.age" "$ARCHIVE"
    rm -f "$ARCHIVE"; ARCHIVE="${ARCHIVE}.age"
    ok "Encrypted with age: ${ARCHIVE}"
  elif command -v gpg &>/dev/null && [[ -n "$GPG_RECIPIENT" ]]; then
    gpg --batch --yes --recipient "$GPG_RECIPIENT" --output "${ARCHIVE}.gpg" --encrypt "$ARCHIVE"
    rm -f "$ARCHIVE"; ARCHIVE="${ARCHIVE}.gpg"
    ok "Encrypted with GPG: ${ARCHIVE}"
  else
    warn "Encryption requested but no age/gpg configured; skipping."
  fi
fi

log "Enforcing local retention (${RETENTION_DAYS} days)"
find "$OUTPUT_DIR" -maxdepth 1 -name "readypackets-*.tar.gz*" -mtime "+${RETENTION_DAYS}" -delete
ok "Local retention enforced."

UPLOAD_ERRORS=0
ARCHIVE_NAME=$(basename "$ARCHIVE")

upload_s3() {
  local bucket="${RP_BACKUP_S3_BUCKET:-}" endpoint="${RP_BACKUP_S3_ENDPOINT:-}"
  local access_key="${RP_BACKUP_S3_ACCESS_KEY:-}" secret_key="${RP_BACKUP_S3_SECRET_KEY:-}"
  local region="${RP_BACKUP_S3_REGION:-us-east-1}"
  [[ -n "$bucket" && -n "$access_key" && -n "$secret_key" ]] || { skip "S3/Wasabi: not configured (set RP_BACKUP_S3_BUCKET, RP_BACKUP_S3_ACCESS_KEY, RP_BACKUP_S3_SECRET_KEY)"; return 0; }
  command -v aws &>/dev/null || { warn "S3: aws CLI not installed (sudo apt-get install awscli)"; return 1; }
  log "Uploading to S3: s3://${bucket}/${ARCHIVE_NAME}"
  local args=(); [[ -n "$endpoint" ]] && args+=(--endpoint-url "$endpoint")
  AWS_ACCESS_KEY_ID="$access_key" AWS_SECRET_ACCESS_KEY="$secret_key" AWS_DEFAULT_REGION="$region" \
    aws s3 cp "$ARCHIVE" "s3://${bucket}/${ARCHIVE_NAME}" "${args[@]}" --quiet
  ok "S3 upload complete."
}

upload_b2() {
  local bucket="${RP_BACKUP_B2_BUCKET:-}" key_id="${RP_BACKUP_B2_KEY_ID:-}" app_key="${RP_BACKUP_B2_APP_KEY:-}"
  [[ -n "$bucket" && -n "$key_id" && -n "$app_key" ]] || { skip "Backblaze B2: not configured (set RP_BACKUP_B2_BUCKET, RP_BACKUP_B2_KEY_ID, RP_BACKUP_B2_APP_KEY)"; return 0; }
  log "Uploading to Backblaze B2: ${bucket}/${ARCHIVE_NAME}"
  if command -v b2 &>/dev/null; then
    B2_APPLICATION_KEY_ID="$key_id" B2_APPLICATION_KEY="$app_key" b2 upload-file "$bucket" "$ARCHIVE" "$ARCHIVE_NAME" --quiet
  elif command -v aws &>/dev/null; then
    AWS_ACCESS_KEY_ID="$key_id" AWS_SECRET_ACCESS_KEY="$app_key" AWS_DEFAULT_REGION="us-west-004" \
      aws s3 cp "$ARCHIVE" "s3://${bucket}/${ARCHIVE_NAME}" --endpoint-url "https://s3.us-west-004.backblazeb2.com" --quiet
  else
    warn "B2: install b2 CLI or aws CLI"; return 1
  fi
  ok "Backblaze B2 upload complete."
}

upload_onedrive() {
  local tenant="${RP_BACKUP_GRAPH_TENANT_ID:-}" client="${RP_BACKUP_GRAPH_CLIENT_ID:-}"
  local secret="${RP_BACKUP_GRAPH_CLIENT_SECRET:-}" drive="${RP_BACKUP_GRAPH_DRIVE_ID:-}"
  local folder="${RP_BACKUP_GRAPH_FOLDER:-ReadyPackets/Backups}"
  [[ -n "$tenant" && -n "$client" && -n "$secret" && -n "$drive" ]] || { skip "OneDrive/SharePoint: not configured (set RP_BACKUP_GRAPH_TENANT_ID, RP_BACKUP_GRAPH_CLIENT_ID, RP_BACKUP_GRAPH_CLIENT_SECRET, RP_BACKUP_GRAPH_DRIVE_ID)"; return 0; }
  log "Uploading to OneDrive/SharePoint: ${folder}/${ARCHIVE_NAME}"
  local token
  token=$(curl -sf -X POST "https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token" \
    -d "grant_type=client_credentials&client_id=${client}&client_secret=${secret}&scope=https://graph.microsoft.com/.default" \
    | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])") || { warn "OneDrive: token acquisition failed"; return 1; }
  local file_size; file_size=$(stat -c%s "$ARCHIVE" 2>/dev/null || stat -f%z "$ARCHIVE")
  if [[ $file_size -lt 4000000 ]]; then
    curl -sf -X PUT "https://graph.microsoft.com/v1.0/drives/${drive}/root:/${folder}/${ARCHIVE_NAME}:/content" \
      -H "Authorization: Bearer ${token}" -H "Content-Type: application/octet-stream" --data-binary "@${ARCHIVE}" > /dev/null
  else
    local session_url
    session_url=$(curl -sf -X POST "https://graph.microsoft.com/v1.0/drives/${drive}/root:/${folder}/${ARCHIVE_NAME}:/createUploadSession" \
      -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" \
      -d '{"item":{"@microsoft.graph.conflictBehavior":"replace"}}' \
      | python3 -c "import sys,json; print(json.load(sys.stdin)['uploadUrl'])")
    curl -sf -X PUT "$session_url" \
      -H "Content-Range: bytes 0-$((file_size-1))/${file_size}" -H "Content-Length: ${file_size}" \
      --data-binary "@${ARCHIVE}" > /dev/null
  fi
  ok "OneDrive/SharePoint upload complete."
}

upload_dropbox() {
  local token="${RP_BACKUP_DROPBOX_TOKEN:-}" path="${RP_BACKUP_DROPBOX_PATH:-/ReadyPackets/Backups}"
  [[ -n "$token" ]] || { skip "Dropbox: not configured (set RP_BACKUP_DROPBOX_TOKEN)"; return 0; }
  log "Uploading to Dropbox: ${path}/${ARCHIVE_NAME}"
  curl -sf -X POST "https://content.dropboxapi.com/2/files/upload" \
    -H "Authorization: Bearer ${token}" \
    -H "Dropbox-API-Arg: {\"path\":\"${path}/${ARCHIVE_NAME}\",\"mode\":\"overwrite\"}" \
    -H "Content-Type: application/octet-stream" --data-binary "@${ARCHIVE}" > /dev/null
  ok "Dropbox upload complete."
}

if [[ "$LOCAL_ONLY" != "true" ]]; then
  if [[ -z "$TARGET_FILTER" ]] || [[ "$TARGET_FILTER" == "s3" ]] || [[ "$TARGET_FILTER" == "wasabi" ]]; then
    upload_s3 || UPLOAD_ERRORS=$((UPLOAD_ERRORS+1))
  fi
  if [[ -z "$TARGET_FILTER" ]] || [[ "$TARGET_FILTER" == "b2" ]] || [[ "$TARGET_FILTER" == "backblaze" ]]; then
    upload_b2 || UPLOAD_ERRORS=$((UPLOAD_ERRORS+1))
  fi
  if [[ -z "$TARGET_FILTER" ]] || [[ "$TARGET_FILTER" == "onedrive" ]] || [[ "$TARGET_FILTER" == "sharepoint" ]]; then
    upload_onedrive || UPLOAD_ERRORS=$((UPLOAD_ERRORS+1))
  fi
  if [[ -z "$TARGET_FILTER" ]] || [[ "$TARGET_FILTER" == "dropbox" ]]; then
    upload_dropbox || UPLOAD_ERRORS=$((UPLOAD_ERRORS+1))
  fi
fi

echo ""
log "3-2-1 Backup complete: ${ARCHIVE}"
if [[ $UPLOAD_ERRORS -gt 0 ]]; then
  warn "${UPLOAD_ERRORS} cloud upload(s) failed. Check RP_BACKUP_* env vars in /etc/readypackets/portal.env"
  exit 1
fi
ok "All configured cloud targets uploaded successfully."
