#!/usr/bin/env bash
# ReadyPackets Portal — factory reset script
# Usage: sudo bash deploy/factory-reset.sh --confirm
#
# WARNING: This script destroys all data. It:
#   1. Stops the service
#   2. Drops and recreates the database
#   3. Deletes all uploaded files
#   4. Removes the configuration file (secrets)
#   5. Removes the application directory
#   6. Removes nginx and systemd configuration
#
# Use this to start completely fresh. It does NOT uninstall MySQL, Node, or nginx.
# Run the installer again after this to set up a new instance.

set -euo pipefail

CONFIRMED=false
RED='\033[0;31m'; YELLOW='\033[1;33m'; NC='\033[0m'
warn()  { echo -e "${YELLOW}[reset]${NC} $*"; }
error() { echo -e "${RED}[reset]${NC} $*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --confirm) CONFIRMED=true; shift ;;
    *) error "Unknown argument: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || error "Run as root: sudo bash deploy/factory-reset.sh --confirm"
[[ "$CONFIRMED" == true ]] || error "Pass --confirm to acknowledge that all data will be permanently destroyed."

warn "============================================================"
warn "  FACTORY RESET — ALL DATA WILL BE PERMANENTLY DESTROYED"
warn "============================================================"
warn ""
warn "This will:"
warn "  - Drop the readypackets database (all orders, customers, files)"
warn "  - Delete /var/lib/readypackets/storage (all uploaded files)"
warn "  - Delete /etc/readypackets/portal.env (all secrets and keys)"
warn "  - Remove /opt/readypackets (application files)"
warn "  - Remove nginx and systemd configuration"
warn ""
warn "Proceeding in 10 seconds. Press Ctrl+C to abort."
sleep 10

# Stop services
warn "Stopping services…"
systemctl stop readypackets 2>/dev/null || true
systemctl disable readypackets 2>/dev/null || true
systemctl stop readypackets-backup.timer 2>/dev/null || true
systemctl disable readypackets-backup.timer 2>/dev/null || true

# Remove systemd units
rm -f /etc/systemd/system/readypackets.service
rm -f /etc/systemd/system/readypackets-backup.service
rm -f /etc/systemd/system/readypackets-backup.timer
systemctl daemon-reload

# Drop database
warn "Dropping database…"
mysql -u root -e "DROP DATABASE IF EXISTS readypackets;" 2>/dev/null || true
mysql -u root -e "DROP USER IF EXISTS 'readypackets'@'localhost';" 2>/dev/null || true
mysql -u root -e "DROP USER IF EXISTS 'readypackets'@'127.0.0.1';" 2>/dev/null || true
mysql -u root -e "FLUSH PRIVILEGES;" 2>/dev/null || true

# Remove files
warn "Removing application files…"
rm -rf /opt/readypackets
rm -rf /var/lib/readypackets
rm -rf /etc/readypackets
rm -rf /var/backups/readypackets

# Remove nginx configuration
warn "Removing nginx configuration…"
rm -f /etc/nginx/sites-enabled/readypackets
rm -f /etc/nginx/sites-available/readypackets
nginx -t 2>/dev/null && nginx -s reload 2>/dev/null || true

# Remove system user
userdel readypackets 2>/dev/null || true

warn ""
warn "Factory reset complete."
warn "To reinstall, run: sudo bash deploy/install.sh --domain YOUR_DOMAIN --email YOUR_EMAIL --tls"
