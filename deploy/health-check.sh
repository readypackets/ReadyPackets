#!/usr/bin/env bash
# ReadyPackets Portal — health check script
# Usage: bash deploy/health-check.sh [--json] [--quiet]
#
# Checks: service status, database connectivity, disk space, memory,
# certificate expiry, backup recency, and the HTTP readiness probe.
# Exits 0 if all checks pass, 1 if any fail.

set -euo pipefail

JSON=false
QUIET=false
FAIL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)  JSON=true; shift ;;
    --quiet) QUIET=true; shift ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

ENV_FILE="/etc/readypackets/portal.env"
declare -A RESULTS

check() {
  local name="$1" status="$2" detail="$3"
  RESULTS["$name"]="$status|$detail"
  if [[ "$status" == "FAIL" ]]; then FAIL=1; fi
  if [[ "$QUIET" == false && "$JSON" == false ]]; then
    if [[ "$status" == "OK" ]]; then
      echo -e "\033[0;32m✓\033[0m $name: $detail"
    else
      echo -e "\033[0;31m✗\033[0m $name: $detail"
    fi
  fi
}

# ── Service status ────────────────────────────────────────────────────────────
if systemctl is-active --quiet readypackets 2>/dev/null; then
  check "service" "OK" "readypackets.service is active"
else
  check "service" "FAIL" "readypackets.service is not running"
fi

# ── HTTP readiness probe ──────────────────────────────────────────────────────
if [[ -f "$ENV_FILE" ]]; then
  PORT=$(grep "^PORT=" "$ENV_FILE" 2>/dev/null | cut -d= -f2 | tr -d '"' || echo 3000)
  DOMAIN=$(grep "^APP_URL=" "$ENV_FILE" 2>/dev/null | sed 's|.*://||' | tr -d '"/' || echo "localhost")
  READY=$(curl -s -m 8 \
    -H "Host: $DOMAIN" \
    -H "X-Forwarded-Proto: https" \
    "http://127.0.0.1:${PORT}/api/health/ready" 2>/dev/null || echo "failed")
  if echo "$READY" | grep -q '"ready"'; then
    check "http_ready" "OK" "readiness probe passed"
  else
    check "http_ready" "FAIL" "readiness probe failed: $READY"
  fi
else
  check "http_ready" "FAIL" "ENV_FILE not found, cannot determine port"
fi

# ── Database connectivity ─────────────────────────────────────────────────────
if systemctl is-active --quiet mysql 2>/dev/null; then
  if mysql -u root -e "SELECT 1" readypackets &>/dev/null; then
    TABLE_COUNT=$(mysql -u root readypackets -sNe "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='readypackets'" 2>/dev/null || echo 0)
    check "database" "OK" "MySQL active, $TABLE_COUNT tables"
  else
    check "database" "FAIL" "MySQL running but cannot connect to readypackets database"
  fi
else
  check "database" "FAIL" "MySQL service is not running"
fi

# ── Disk space ────────────────────────────────────────────────────────────────
DISK_USE=$(df -h / | awk 'NR==2{print $5}' | tr -d '%')
if [[ "$DISK_USE" -lt 85 ]]; then
  check "disk" "OK" "Root filesystem ${DISK_USE}% used"
else
  check "disk" "FAIL" "Root filesystem ${DISK_USE}% used (>85%)"
fi

# ── Memory ────────────────────────────────────────────────────────────────────
MEM_FREE=$(free -m | awk 'NR==2{print $7}')
if [[ "$MEM_FREE" -gt 100 ]]; then
  check "memory" "OK" "${MEM_FREE}MB available"
else
  check "memory" "FAIL" "Only ${MEM_FREE}MB available (<100MB)"
fi

# ── TLS certificate expiry ────────────────────────────────────────────────────
CERT_PATH="/etc/letsencrypt/live/$(ls /etc/letsencrypt/live/ 2>/dev/null | head -1)/cert.pem"
if [[ -f "$CERT_PATH" ]]; then
  EXPIRY=$(openssl x509 -enddate -noout -in "$CERT_PATH" 2>/dev/null | cut -d= -f2 || echo "")
  if [[ -n "$EXPIRY" ]]; then
    EXPIRY_EPOCH=$(date -d "$EXPIRY" +%s 2>/dev/null || date -j -f "%b %d %T %Y %Z" "$EXPIRY" +%s 2>/dev/null || echo 0)
    NOW_EPOCH=$(date +%s)
    DAYS_LEFT=$(( (EXPIRY_EPOCH - NOW_EPOCH) / 86400 ))
    if [[ "$DAYS_LEFT" -gt 14 ]]; then
      check "tls_cert" "OK" "Certificate expires in ${DAYS_LEFT} days"
    else
      check "tls_cert" "FAIL" "Certificate expires in ${DAYS_LEFT} days (renew soon)"
    fi
  else
    check "tls_cert" "FAIL" "Could not read certificate expiry"
  fi
else
  check "tls_cert" "FAIL" "No TLS certificate found"
fi

# ── Backup recency ────────────────────────────────────────────────────────────
BACKUP_DIR="/var/backups/readypackets"
if [[ -d "$BACKUP_DIR" ]]; then
  LATEST=$(find "$BACKUP_DIR" -name "*.tar.gz" -newer "$BACKUP_DIR" -mtime -2 2>/dev/null | head -1)
  if [[ -n "$LATEST" ]]; then
    check "backup" "OK" "Recent backup found: $(basename "$LATEST")"
  else
    LAST=$(find "$BACKUP_DIR" -name "*.tar.gz" 2>/dev/null | sort | tail -1)
    if [[ -n "$LAST" ]]; then
      AGE=$(( ($(date +%s) - $(stat -c %Y "$LAST")) / 3600 ))
      check "backup" "FAIL" "Last backup was ${AGE}h ago (>48h)"
    else
      check "backup" "FAIL" "No backups found in $BACKUP_DIR"
    fi
  fi
else
  check "backup" "FAIL" "Backup directory $BACKUP_DIR does not exist"
fi

# ── nginx ─────────────────────────────────────────────────────────────────────
if systemctl is-active --quiet nginx 2>/dev/null; then
  check "nginx" "OK" "nginx is active"
else
  check "nginx" "FAIL" "nginx is not running"
fi

# ── Output ────────────────────────────────────────────────────────────────────
if [[ "$JSON" == true ]]; then
  echo "{"
  echo "  \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\","
  echo "  \"overall\": \"$([ $FAIL -eq 0 ] && echo OK || echo FAIL)\","
  echo "  \"checks\": {"
  FIRST=true
  for name in "${!RESULTS[@]}"; do
    IFS='|' read -r status detail <<< "${RESULTS[$name]}"
    [[ "$FIRST" == false ]] && echo ","
    printf '    "%s": {"status": "%s", "detail": "%s"}' "$name" "$status" "$detail"
    FIRST=false
  done
  echo ""
  echo "  }"
  echo "}"
fi

if [[ "$QUIET" == false && "$JSON" == false ]]; then
  echo ""
  if [[ $FAIL -eq 0 ]]; then
    echo -e "\033[0;32mAll checks passed.\033[0m"
  else
    echo -e "\033[0;31mOne or more checks failed.\033[0m"
  fi
fi

exit $FAIL
