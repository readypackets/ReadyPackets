#!/usr/bin/env bash
# ReadyPackets backup operations control plane. Invoked through a narrowly scoped
# sudo rule by the application service; it never accepts shell fragments or paths.
set -Eeuo pipefail
umask 077

APP_ROOT="${RP_APP_ROOT:-/opt/readypackets}"
BACKUP_DIR="${RP_BACKUP_DIR:-/var/backups/readypackets}"
EXPORT_DIR="${RP_EXPORT_DIR:-/var/lib/readypackets/storage/admin-exports}"
TARGETS_FILE="${RP_BACKUP_SYNC_TARGETS_FILE:-/etc/readypackets/backup-sync-targets.conf}"
TIMER_UNIT="readypackets-backup.timer"
SERVICE_UNIT="readypackets-backup.service"

[[ "$(id -u)" -eq 0 ]] || { echo "Must run as root" >&2; exit 1; }
command -v systemctl >/dev/null || { echo "systemctl is unavailable" >&2; exit 1; }
install -d -m 0750 -o root -g readypackets "$BACKUP_DIR" "$EXPORT_DIR"

safe_name() {
  [[ "$1" =~ ^readypackets-[0-9TZ-]+\.tar\.gz(\.age|\.gpg)?$ ]] || { echo "Invalid backup filename" >&2; exit 1; }
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
    install -d -m 0755 /etc/systemd/system/${TIMER_UNIT}.d
    cat > /etc/systemd/system/${TIMER_UNIT}.d/schedule.conf <<EOF
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
    chmod 0640 "$TARGETS_FILE"; chown root:readypackets "$TARGETS_FILE"
    printf '%s\n' '{"ok":true,"message":"Cloud backup targets updated"}'
    ;;
  export-config)
    passphrase="$(head -n 1 | tr -d '\r\n')"
    [[ ${#passphrase} -ge 16 ]] || { echo "Configuration export passphrase must be at least 16 characters" >&2; exit 1; }
    passfile="$(mktemp)"; trap 'rm -f "$passfile"' EXIT
    printf '%s\n' "$passphrase" > "$passfile"; chmod 0600 "$passfile"
    output="$EXPORT_DIR/readypackets-config-$(date -u +%Y%m%dT%H%M%SZ).rpconfig"
    RP_APP_ROOT="$APP_ROOT" RP_CONFIG_BACKUP_DIR="$EXPORT_DIR" bash "$APP_ROOT/deploy/config-migration.sh" export --output "$output" --passphrase-file "$passfile" >/dev/null
    chmod 0640 "$output"; chown root:readypackets "$output"
    basename "$output"
    ;;
  prepare-download)
    safe_name "${2:-}"
    source="$BACKUP_DIR/$2"
    [[ -f "$source" ]] || { echo "Backup archive not found" >&2; exit 1; }
    output="$EXPORT_DIR/$2"
    cp --preserve=mode "$source" "$output"; chmod 0640 "$output"; chown root:readypackets "$output"
    basename "$output"
    ;;
  *)
    echo "Usage: $0 {start|status|schedule HH:MM|configure-targets|export-config|prepare-download FILENAME}" >&2
    exit 2
    ;;
esac
