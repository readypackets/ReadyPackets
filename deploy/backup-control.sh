#!/usr/bin/env bash
# ReadyPackets backup operations control plane. Invoked through a narrowly scoped
# sudo rule by the application service; it never accepts shell fragments or paths.
set -Eeuo pipefail
umask 077

APP_ROOT="${RP_APP_ROOT:-/opt/readypackets}"
BACKUP_DIR="${RP_BACKUP_DIR:-/var/backups/readypackets}"
EXPORT_DIR="${RP_EXPORT_DIR:-/var/lib/readypackets/storage/admin-exports}"
TARGETS_FILE="${RP_BACKUP_SYNC_TARGETS_FILE:-/etc/readypackets/backup-sync-targets.conf}"
RESTORE_STATUS_FILE="${RP_BACKUP_RESTORE_STATUS_FILE:-/var/lib/readypackets/backup-restore-status.conf}"
TIMER_UNIT="readypackets-backup.timer"
SERVICE_UNIT="readypackets-backup.service"

[[ "$(id -u)" -eq 0 ]] || { echo "Must run as root" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemctl is unavailable" >&2; exit 1; }
# The daemon runs as root with the portal service group. New protected files use
# restrictive modes; do not call chown inside the hardened daemon namespace.
install -d -m 0750 "$BACKUP_DIR" "$EXPORT_DIR"
install -d -m 0700 "$(dirname "$RESTORE_STATUS_FILE")"

safe_name() {
  [[ "$1" =~ ^readypackets-[0-9TZ-]+\.tar\.gz(\.age|\.gpg)?$ ]] || { echo "Invalid backup filename" >&2; exit 1; }
}

archive_path() {
  safe_name "$1"
  local path="$BACKUP_DIR/$1"
  [[ -f "$path" ]] || { echo "Backup archive not found" >&2; exit 1; }
  printf '%s\n' "$path"
}

json_escape() { node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$1"; }

verify_archive() {
  local filename="$1" source staging
  source="$(archive_path "$filename")"
  [[ "$source" == *.tar.gz ]] || { echo "Browser verification supports unencrypted .tar.gz archives. Verify encrypted archives through the protected host restore procedure." >&2; exit 1; }
  staging="$(mktemp -d /tmp/rp-archive-check.XXXXXXXX)"
  trap 'rm -rf "$staging"' RETURN
  # Verification needs only content and checksums; preserving root ownership is
  # unnecessary and prohibited by the daemon's hardened syscall policy.
  tar --no-same-owner -C "$staging" -xzf "$source"
  [[ -s "$staging/database.sql" ]] || { echo "Archive is missing database.sql" >&2; exit 1; }
  [[ -f "$staging/MANIFEST.txt" ]] || { echo "Archive is missing MANIFEST.txt" >&2; exit 1; }
  if [[ -f "$staging/SHA256SUMS" ]]; then
    (cd "$staging" && sha256sum -c --ignore-missing --quiet SHA256SUMS) || { echo "Archive checksum verification failed" >&2; exit 1; }
  fi
  local dump_bytes has_files
  dump_bytes="$(stat -c '%s' "$staging/database.sql")"
  [[ "$dump_bytes" -gt 1024 ]] || { echo "Archive database dump is suspiciously small" >&2; exit 1; }
  has_files="false"; [[ -f "$staging/storage.tar" ]] && has_files="true"
  printf 'verified=true\narchive=%s\ndatabase_bytes=%s\nincludes_files=%s\n' "$filename" "$dump_bytes" "$has_files"
}

write_remote_config() {
  local remote="$1" body="$2" config_dir="/root/.config/rclone" config="/root/.config/rclone/rclone.conf"
  install -d -m 0700 "$config_dir"
  touch "$config"; chmod 0600 "$config"
  # Deleting a remote by name exposes no secret and lets this write a complete
  # replacement section without placing any credential in an argv string.
  rclone --config "$config" config delete "$remote" >/dev/null 2>&1 || true
  printf '\n[%s]\n%s\n' "$remote" "$body" >> "$config"
  chmod 0600 "$config"
}

configure_remote() {
  local provider="" remote="" destination="" access_key="" secret_key="" region="" endpoint="" account="" key="" client_id="" client_secret="" tenant="" token_b64=""
  while IFS='=' read -r field value; do
    case "$field" in
      provider) provider="$value" ;;
      remote) remote="$value" ;;
      destination) destination="$value" ;;
      access_key) access_key="$value" ;;
      secret_key) secret_key="$value" ;;
      region) region="$value" ;;
      endpoint) endpoint="$value" ;;
      account) account="$value" ;;
      key) key="$value" ;;
      client_id) client_id="$value" ;;
      client_secret) client_secret="$value" ;;
      tenant) tenant="$value" ;;
      token_b64) token_b64="$value" ;;
      "") ;;
      *) echo "Unsupported cloud configuration field" >&2; exit 1 ;;
    esac
  done
  [[ "$provider" =~ ^(Amazon\ S3|Wasabi\ S3|Backblaze\ B2|Azure\ Blob\ Storage|SharePoint|Google\ Drive|OneDrive|Dropbox)$ ]] || { echo "Unsupported backup provider" >&2; exit 1; }
  [[ "$remote" =~ ^[A-Za-z][A-Za-z0-9_-]{1,63}$ ]] || { echo "Remote name must begin with a letter and use letters, numbers, underscore, or hyphen." >&2; exit 1; }
  [[ "$destination" =~ ^[A-Za-z0-9._/-]{0,512}$ && "$destination" != *".."* ]] || { echo "Destination path is invalid." >&2; exit 1; }
  command -v rclone >/dev/null 2>&1 || { echo "rclone is not installed on this server." >&2; exit 1; }
  case "$provider" in
    "Amazon S3"|"Wasabi S3")
      [[ -n "$access_key" && -n "$secret_key" && -n "$region" ]] || { echo "S3-compatible storage requires access key, secret key, and region." >&2; exit 1; }
      local s3_provider="AWS"; [[ "$provider" == "Wasabi S3" ]] && s3_provider="Wasabi"
      write_remote_config "$remote" "type = s3
provider = $s3_provider
env_auth = false
access_key_id = $access_key
secret_access_key = $secret_key
region = $region
endpoint = $endpoint"
      ;;
    "Backblaze B2")
      [[ -n "$account" && -n "$key" ]] || { echo "Backblaze B2 requires key ID and application key." >&2; exit 1; }
      write_remote_config "$remote" "type = b2
account = $account
key = $key"
      ;;
    "Azure Blob Storage")
      [[ -n "$account" && -n "$key" ]] || { echo "Azure Blob Storage requires account name and account key." >&2; exit 1; }
      write_remote_config "$remote" "type = azureblob
account = $account
key = $key
endpoint = $endpoint"
      ;;
    "SharePoint"|"OneDrive")
      [[ -n "$client_id" && -n "$tenant" && -n "$token_b64" ]] || { echo "Microsoft cloud storage requires client ID, tenant ID, and OAuth token JSON." >&2; exit 1; }
      local token; token="$(printf '%s' "$token_b64" | base64 --decode)"
      write_remote_config "$remote" "type = onedrive
client_id = $client_id
client_secret = $client_secret
tenant = $tenant
token = $token
drive_type = business"
      ;;
    "Google Drive")
      [[ -n "$client_id" && -n "$token_b64" ]] || { echo "Google Drive requires client ID and OAuth token JSON." >&2; exit 1; }
      local drive_token; drive_token="$(printf '%s' "$token_b64" | base64 --decode)"
      write_remote_config "$remote" "type = drive
client_id = $client_id
client_secret = $client_secret
token = $drive_token"
      ;;
    "Dropbox")
      [[ -n "$client_id" && -n "$client_secret" && -n "$token_b64" ]] || { echo "Dropbox requires app key, app secret, and OAuth token JSON." >&2; exit 1; }
      local dropbox_token; dropbox_token="$(printf '%s' "$token_b64" | base64 --decode)"
      write_remote_config "$remote" "type = dropbox
client_id = $client_id
client_secret = $client_secret
token = $dropbox_token"
      ;;
  esac
  local target="${remote}:${destination}"
  tmp="$(mktemp)"; trap 'rm -f "$tmp"' RETURN
  [[ -r "$TARGETS_FILE" ]] && grep -Fv "|${target}" "$TARGETS_FILE" > "$tmp" || true
  printf '%s|%s\n' "$provider" "$target" >> "$tmp"
  install -m 0640 -o root -g readypackets "$tmp" "$TARGETS_FILE"
  printf 'provider=%s\ndestination=%s\n' "$provider" "$target"
}

test_target() {
  local target="$1"
  [[ "$target" =~ ^[A-Za-z0-9._-]+:.+$ ]] || { echo "Destination must be an rclone remote and path" >&2; exit 1; }
  command -v rclone >/dev/null 2>&1 || { echo "rclone is not installed on this server." >&2; exit 1; }
  rclone lsf "$target" --max-depth 1 --contimeout 10s --timeout 20s --retries 1 >/dev/null
  printf 'reachable=true\ndestination=%s\n' "$target"
}

restore_status() {
  if [[ ! -r "$RESTORE_STATUS_FILE" ]]; then
    printf 'status=idle\n'
    return 0
  fi
  # The state file is written only by this root-owned helper; restrict output to
  # plain metadata fields before it crosses the administrator API boundary.
  local unit archive mode started state result
  unit="$(sed -n 's/^unit=//p' "$RESTORE_STATUS_FILE" | head -n1)"
  archive="$(sed -n 's/^archive=//p' "$RESTORE_STATUS_FILE" | head -n1)"
  mode="$(sed -n 's/^mode=//p' "$RESTORE_STATUS_FILE" | head -n1)"
  started="$(sed -n 's/^started=//p' "$RESTORE_STATUS_FILE" | head -n1)"
  [[ "$unit" =~ ^readypackets-restore-[A-Za-z0-9@._-]+$ ]] || { printf 'status=unknown\n'; return 0; }
  state="$(systemctl show "$unit" -p ActiveState --value 2>/dev/null || true)"
  result="$(systemctl show "$unit" -p Result --value 2>/dev/null || true)"
  printf 'status=%s\nunit=%s\narchive=%s\nmode=%s\nstarted=%s\nresult=%s\n' "${state:-unknown}" "$unit" "$archive" "$mode" "$started" "${result:-unknown}"
}

case "${1:-}" in
  start)
    systemctl start "$SERVICE_UNIT"
    printf '%s\n' '{"ok":true,"message":"Backup job started"}'
    ;;
  status)
    time="$(systemctl show "$TIMER_UNIT" --property=NextElapseUSecRealtime --value 2>/dev/null || true)"
    printf 'next_run=%s\n' "${time:-}"
    [[ -r "$TARGETS_FILE" ]] && cat "$TARGETS_FILE" || true
    ;;
  schedule)
    clock="${2:-}"
    [[ "$clock" =~ ^([01][0-9]|2[0-3]):[0-5][0-9]$ ]] || { echo "Schedule must use 24-hour HH:MM" >&2; exit 1; }
    install -d -m 0755 "/etc/systemd/system/${TIMER_UNIT}.d"
    cat > "/etc/systemd/system/${TIMER_UNIT}.d/schedule.conf" <<EOF
[Timer]
OnCalendar=
OnCalendar=*-*-* ${clock}:00
RandomizedDelaySec=900
Persistent=true
EOF
    systemctl daemon-reload
    systemctl restart "$TIMER_UNIT"
    printf '%s\n' '{"ok":true,"message":"Backup schedule updated"}'
    ;;
  configure-remote)
    configure_remote
    ;;
  test-target)
    test_target "${2:-}"
    ;;
  configure-targets)
    tmp="$(mktemp)"; trap 'rm -f "$tmp"' EXIT
    cat > "$tmp"
    : > "$TARGETS_FILE"
    while IFS='|' read -r provider destination; do
      provider="${provider#${provider%%[![:space:]]*}}"; provider="${provider%${provider##*[![:space:]]}}"
      destination="${destination#${destination%%[![:space:]]*}}"; destination="${destination%${destination##*[![:space:]]}}"
      [[ -n "$provider" && "$provider" =~ ^[A-Za-z0-9][A-Za-z0-9._[:space:]-]{0,63}$ ]] || { echo "Invalid provider label" >&2; exit 1; }
      [[ "$destination" =~ ^[A-Za-z0-9._-]+:.+$ ]] || { echo "Destination must be an rclone remote and path" >&2; exit 1; }
      printf '%s|%s\n' "$provider" "$destination" >> "$TARGETS_FILE"
    done < "$tmp"
    chmod 0640 "$TARGETS_FILE"
    printf '%s\n' '{"ok":true,"message":"Cloud backup targets updated"}'
    ;;
  verify-archive)
    verify_archive "${2:-}"
    ;;
  start-restore)
    filename="${2:-}"; source="$(archive_path "$filename")"
    confirmation="$(head -n 1 | tr -d '\r\n')"
    [[ "$confirmation" == "RESTORE $filename" ]] || { echo "Type RESTORE $filename to confirm production recovery." >&2; exit 1; }
    unit="readypackets-restore-$(date -u +%Y%m%dT%H%M%SZ)"
    cat > "$RESTORE_STATUS_FILE" <<EOF
unit=$unit
archive=$filename
mode=production
started=$(date -u +%Y-%m-%dT%H:%M:%SZ)
EOF
    chmod 0600 "$RESTORE_STATUS_FILE"
    systemd-run --unit "$unit" --collect --property=Type=oneshot --property=Nice=15 --property=IOSchedulingClass=idle \
      "$APP_ROOT/deploy/restore.sh" --archive "$source" --yes >/dev/null
    printf 'unit=%s\narchive=%s\n' "$unit" "$filename"
    ;;
  restore-status)
    restore_status
    ;;
  export-config)
    passphrase="$(head -n 1 | tr -d '\r\n')"
    [[ ${#passphrase} -ge 16 ]] || { echo "Configuration export passphrase must be at least 16 characters" >&2; exit 1; }
    passfile="$(mktemp)"; trap 'rm -f "$passfile"' EXIT
    printf '%s\n' "$passphrase" > "$passfile"; chmod 0600 "$passfile"
    output="$EXPORT_DIR/readypackets-config-$(date -u +%Y%m%dT%H%M%SZ).rpconfig"
    RP_APP_ROOT="$APP_ROOT" RP_CONFIG_BACKUP_DIR="$EXPORT_DIR" bash "$APP_ROOT/deploy/config-migration.sh" export --output "$output" --passphrase-file "$passfile" >/dev/null
    chmod 0640 "$output"
    basename "$output"
    ;;
  prepare-download)
    safe_name "${2:-}"
    source="$(archive_path "$2")"
    output="$EXPORT_DIR/$2"
    cp --preserve=mode "$source" "$output"; chmod 0640 "$output"
    basename "$output"
    ;;
  *)
    echo "Usage: $0 {start|status|schedule HH:MM|configure-remote|test-target DESTINATION|configure-targets|verify-archive FILENAME|start-restore FILENAME|restore-status|export-config|prepare-download FILENAME}" >&2
    exit 2
    ;;
esac
