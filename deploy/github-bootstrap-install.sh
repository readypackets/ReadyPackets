#!/usr/bin/env bash
# Secure non-interactive bootstrap for a fresh self-hosted ReadyPackets server.
# Retrieves an explicitly approved immutable Git commit over a read-only SSH
# deploy key, then delegates to the supported unified installer.
set -euo pipefail
umask 077

REPOSITORY=""
COMMIT=""
DOMAIN=""
EMAIL=""
MODE="native"
TLS_PROVIDER="letsencrypt"
PROJECT_DIR="/srv/readypackets"
SSH_KEY="/root/.ssh/readypackets_deploy"
CLOUDFLARE_CERT=""
CLOUDFLARE_KEY=""
CLOUDFLARE_ROOT=""
SITE_NAME=""
GITHUB_CONFIG_REPOSITORY=""
GITHUB_CONFIG_BRANCH="main"
GITHUB_CONFIG_FOLDER="readypackets-platform-config"
GITHUB_CONFIG_TOKEN_FILE=""
GITHUB_CONFIG_PASSPHRASE_FILE=""

usage() {
  cat <<'USAGE'
Usage:
  sudo bash deploy/github-bootstrap-install.sh \
    --repository owner/repository \
    --commit <40-character Git SHA> \
    --domain portal.example.com \
    --email operations@example.com \
    [--mode native|docker|docker-bootstrap] \
    [--tls-provider letsencrypt|cloudflare-origin] \
    [--project-dir /srv/readypackets] \
    [--ssh-key /root/.ssh/readypackets_deploy] \
    [--site-name "Website name"] \
    [--github-config-repository owner/private-vault \
     --github-config-branch main --github-config-folder readypackets-platform-config \
     --github-config-token-file /root/vault.token --github-config-passphrase-file /root/vault.pass]

For Cloudflare Origin CA also provide:
  --cloudflare-origin-cert /secure/origin-cert.pem
  --cloudflare-origin-key /secure/origin-key.pem
  [--cloudflare-origin-root /secure/origin-root.pem]

Requirements:
  * Run as root or through sudo on Ubuntu.
  * Install a read-only GitHub SSH deploy key at --ssh-key first.
  * Pin a reviewed immutable 40-character commit SHA; branch tips are rejected.
USAGE
}

fail() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repository) REPOSITORY="${2:-}"; shift 2 ;;
    --commit) COMMIT="${2:-}"; shift 2 ;;
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --mode) MODE="${2:-}"; shift 2 ;;
    --tls-provider) TLS_PROVIDER="${2:-}"; shift 2 ;;
    --project-dir) PROJECT_DIR="${2:-}"; shift 2 ;;
    --ssh-key) SSH_KEY="${2:-}"; shift 2 ;;
    --cloudflare-origin-cert) CLOUDFLARE_CERT="${2:-}"; shift 2 ;;
    --cloudflare-origin-key) CLOUDFLARE_KEY="${2:-}"; shift 2 ;;
    --cloudflare-origin-root) CLOUDFLARE_ROOT="${2:-}"; shift 2 ;;
    --site-name) SITE_NAME="${2:-}"; shift 2 ;;
    --github-config-repository) GITHUB_CONFIG_REPOSITORY="${2:-}"; shift 2 ;;
    --github-config-branch) GITHUB_CONFIG_BRANCH="${2:-}"; shift 2 ;;
    --github-config-folder) GITHUB_CONFIG_FOLDER="${2:-}"; shift 2 ;;
    --github-config-token-file) GITHUB_CONFIG_TOKEN_FILE="${2:-}"; shift 2 ;;
    --github-config-passphrase-file) GITHUB_CONFIG_PASSPHRASE_FILE="${2:-}"; shift 2 ;;
    --help|-h) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || fail "Run through sudo or as root."
[[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "--repository must be owner/repository."
[[ "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || fail "--commit must be a reviewed 40-character Git SHA."
[[ "$DOMAIN" =~ ^[A-Za-z0-9.-]+$ ]] || fail "--domain is invalid."
[[ "$EMAIL" == *"@"* ]] || fail "--email must be an operational email address."
[[ "$MODE" =~ ^(native|docker|docker-bootstrap)$ ]] || fail "--mode must be native, docker, or docker-bootstrap."
[[ "$TLS_PROVIDER" =~ ^(letsencrypt|cloudflare-origin)$ ]] || fail "--tls-provider must be letsencrypt or cloudflare-origin."
[[ -r "$SSH_KEY" ]] || fail "Read-only GitHub deploy key not readable: $SSH_KEY"
if [[ -n "$GITHUB_CONFIG_REPOSITORY" || -n "$GITHUB_CONFIG_TOKEN_FILE" || -n "$GITHUB_CONFIG_PASSPHRASE_FILE" ]]; then
  [[ "$GITHUB_CONFIG_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "--github-config-repository must be owner/repository."
  [[ -f "$GITHUB_CONFIG_TOKEN_FILE" && -f "$GITHUB_CONFIG_PASSPHRASE_FILE" ]] || fail "GitHub configuration restore requires token and passphrase files."
fi

if [[ "$TLS_PROVIDER" == "cloudflare-origin" ]]; then
  [[ -r "$CLOUDFLARE_CERT" ]] || fail "--cloudflare-origin-cert must be readable."
  [[ -r "$CLOUDFLARE_KEY" ]] || fail "--cloudflare-origin-key must be readable."
fi

export GIT_SSH_COMMAND="ssh -i $SSH_KEY -o IdentitiesOnly=yes -o StrictHostKeyChecking=accept-new"

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git openssh-client

if [[ -e "$PROJECT_DIR" ]]; then
  fail "Project directory already exists: $PROJECT_DIR. Use the approved update workflow for an existing deployment."
fi

remote="git@github.com:${REPOSITORY}.git"
mkdir -p "$(dirname "$PROJECT_DIR")"
git clone --no-checkout "$remote" "$PROJECT_DIR"
cd "$PROJECT_DIR"
git fetch --depth=1 origin "$COMMIT"
resolved="$(git rev-parse FETCH_HEAD)"
[[ "${resolved,,}" == "${COMMIT,,}" ]] || fail "Fetched revision does not match requested immutable commit."
git checkout --detach "$resolved"
git status --porcelain | grep -q . && fail "Checked-out source is unexpectedly modified."

installer=(
  bash deploy/unified-install.sh
  --mode "$MODE"
  --domain "$DOMAIN"
  --email "$EMAIL"
  --tls-provider "$TLS_PROVIDER"
)
if [[ "$MODE" != "native" ]]; then
  installer+=(--project-dir "$PROJECT_DIR")
fi
installer+=(--site-name "${SITE_NAME:-ReadyPackets}")
if [[ -n "$GITHUB_CONFIG_REPOSITORY" ]]; then
  installer+=(--github-config-repository "$GITHUB_CONFIG_REPOSITORY" --github-config-branch "$GITHUB_CONFIG_BRANCH" --github-config-folder "$GITHUB_CONFIG_FOLDER" --github-config-token-file "$GITHUB_CONFIG_TOKEN_FILE" --github-config-passphrase-file "$GITHUB_CONFIG_PASSPHRASE_FILE")
fi
if [[ "$TLS_PROVIDER" == "cloudflare-origin" ]]; then
  installer+=(--cloudflare-origin-cert "$CLOUDFLARE_CERT" --cloudflare-origin-key "$CLOUDFLARE_KEY")
  [[ -n "$CLOUDFLARE_ROOT" ]] && installer+=(--cloudflare-origin-root "$CLOUDFLARE_ROOT")
fi

COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "${installer[@]}"

if [[ "$TLS_PROVIDER" == "cloudflare-origin" ]]; then
  # Origin CA certificates are normally not browser-trusted directly. Validate
  # the application listener locally; Cloudflare then provides public TLS.
  curl -fsS -H "Host: ${DOMAIN}" -H "X-Forwarded-Proto: https" http://127.0.0.1:3000/api/health
else
  curl -fsS "https://${DOMAIN}/api/health"
fi
printf '\nInstalled ReadyPackets commit: %s\n' "$resolved"
