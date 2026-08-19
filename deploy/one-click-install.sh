#!/usr/bin/env bash
# ReadyPackets one-click installer for a fresh Ubuntu/Debian server.
# All required deployment choices are supplied through RP_* environment variables
# so the script never waits for an interactive prompt.
set -Eeuo pipefail
umask 077

readonly DEFAULT_REPOSITORY="readypackets/ReadyPackets"
REPOSITORY="${RP_REPOSITORY:-$DEFAULT_REPOSITORY}"
REF="${RP_REF:-main}"
COMMIT="${RP_COMMIT:-}"
DOMAIN="${RP_DOMAIN:-}"
EMAIL="${RP_EMAIL:-}"
MODE="${RP_MODE:-native}"
SITE_NAME="${RP_SITE_NAME:-ReadyPackets}"
TLS_PROVIDER="${RP_TLS_PROVIDER:-letsencrypt}"
PROJECT_DIR="${RP_PROJECT_DIR:-/srv/readypackets}"
CF_CERT="${RP_CLOUDFLARE_ORIGIN_CERT:-}"
CF_KEY="${RP_CLOUDFLARE_ORIGIN_KEY:-}"
CF_ROOT="${RP_CLOUDFLARE_ORIGIN_ROOT:-}"
VAULT_REPOSITORY="${RP_GITHUB_CONFIG_REPOSITORY:-}"
VAULT_BRANCH="${RP_GITHUB_CONFIG_BRANCH:-main}"
VAULT_FOLDER="${RP_GITHUB_CONFIG_FOLDER:-readypackets-platform-config}"
VAULT_TOKEN="${RP_GITHUB_CONFIG_TOKEN:-}"
VAULT_PASSPHRASE="${RP_GITHUB_CONFIG_PASSPHRASE:-}"
TEMP_FILES=()

step() { printf '\n\033[1;36m[ReadyPackets install]\033[0m %s\n' "$*"; }
fail() { printf '\n\033[1;31m[ReadyPackets install failed]\033[0m %s\n' "$*" >&2; exit 1; }
cleanup() { for item in "${TEMP_FILES[@]:-}"; do rm -rf -- "$item"; done; }
trap cleanup EXIT
trap 'fail "Stopped at line ${LINENO}. Review the message above, correct it, and rerun on this fresh server."' ERR

[[ $EUID -eq 0 ]] || fail "Run as root, for example: sudo env RP_DOMAIN=portal.example.com ... bash one-click-install.sh"
[[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "RP_REPOSITORY must be owner/repository."
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] || fail "Set RP_DOMAIN to the public hostname, for example portal.example.com."
[[ "$MODE" =~ ^(native|docker|docker-bootstrap)$ ]] || fail "RP_MODE must be native, docker, or docker-bootstrap."
[[ "$TLS_PROVIDER" =~ ^(letsencrypt|cloudflare-origin|none)$ ]] || fail "RP_TLS_PROVIDER must be letsencrypt, cloudflare-origin, or none."
[[ "$SITE_NAME" != *$'\n'* && -n "$SITE_NAME" && ${#SITE_NAME} -le 100 ]] || fail "RP_SITE_NAME must be 1 to 100 characters and contain no line breaks."
[[ -z "$COMMIT" || "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || fail "RP_COMMIT must be a reviewed 40-character Git SHA when supplied."
if [[ "$TLS_PROVIDER" == "letsencrypt" ]]; then [[ "$EMAIL" == *"@"* ]] || fail "Set RP_EMAIL for Let's Encrypt certificate notices."; fi
if [[ "$TLS_PROVIDER" == "cloudflare-origin" ]]; then [[ -f "$CF_CERT" && -f "$CF_KEY" ]] || fail "Set RP_CLOUDFLARE_ORIGIN_CERT and RP_CLOUDFLARE_ORIGIN_KEY to readable PEM files."; fi
if [[ -n "$VAULT_REPOSITORY" || -n "$VAULT_TOKEN" || -n "$VAULT_PASSPHRASE" ]]; then
  [[ "$VAULT_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "RP_GITHUB_CONFIG_REPOSITORY must be owner/private-repository."
  [[ ${#VAULT_TOKEN} -ge 20 && ${#VAULT_PASSPHRASE} -ge 16 ]] || fail "Set RP_GITHUB_CONFIG_TOKEN and a 16+ character RP_GITHUB_CONFIG_PASSPHRASE together."
fi
[[ ! -e "$PROJECT_DIR" ]] || fail "RP_PROJECT_DIR already exists: $PROJECT_DIR. This installer is for a fresh server; do not overwrite an existing installation."

step "Starting unattended ${MODE} installation for ${DOMAIN}."
step "Installing only bootstrap packages needed to retrieve the public source."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl git

step "Retrieving ReadyPackets source from https://github.com/${REPOSITORY}.git"
install -d -m 0755 "$(dirname "$PROJECT_DIR")"
git clone --depth 1 --branch "$REF" "https://github.com/${REPOSITORY}.git" "$PROJECT_DIR"
cd "$PROJECT_DIR"
if [[ -n "$COMMIT" ]]; then
  step "Verifying reviewed immutable source commit ${COMMIT}."
  git fetch --depth=1 origin "$COMMIT"
  resolved="$(git rev-parse FETCH_HEAD)"
  [[ "${resolved,,}" == "${COMMIT,,}" ]] || fail "Fetched source does not match RP_COMMIT."
  git checkout --detach "$resolved"
else
  resolved="$(git rev-parse HEAD)"
  printf '[ReadyPackets install] Using latest %s branch commit: %s\n' "$REF" "$resolved"
fi
git status --porcelain | grep -q . && fail "Downloaded source is unexpectedly modified."

installer=(bash deploy/unified-install.sh --mode "$MODE" --domain "$DOMAIN" --site-name "$SITE_NAME")
[[ -n "$EMAIL" ]] && installer+=(--email "$EMAIL")
case "$TLS_PROVIDER" in
  letsencrypt) installer+=(--tls-provider letsencrypt) ;;
  cloudflare-origin)
    installer+=(--tls-provider cloudflare-origin --cloudflare-origin-cert "$CF_CERT" --cloudflare-origin-key "$CF_KEY")
    [[ -n "$CF_ROOT" ]] && installer+=(--cloudflare-origin-root "$CF_ROOT")
    ;;
  none) installer+=(--no-tls) ;;
esac
if [[ "$MODE" != "native" ]]; then installer+=(--project-dir "$PROJECT_DIR"); fi
if [[ -n "$VAULT_REPOSITORY" ]]; then
  step "Preparing encrypted private GitHub configuration-vault recovery inputs."
  token_file="$(mktemp /root/readypackets-vault-token.XXXXXX)"; passphrase_file="$(mktemp /root/readypackets-vault-passphrase.XXXXXX)"
  TEMP_FILES+=("$token_file" "$passphrase_file")
  printf '%s\n' "$VAULT_TOKEN" > "$token_file"; printf '%s\n' "$VAULT_PASSPHRASE" > "$passphrase_file"
  unset VAULT_TOKEN VAULT_PASSPHRASE
  chmod 0600 "$token_file" "$passphrase_file"
  installer+=(--github-config-repository "$VAULT_REPOSITORY" --github-config-branch "$VAULT_BRANCH" --github-config-folder "$VAULT_FOLDER" --github-config-token-file "$token_file" --github-config-passphrase-file "$passphrase_file")
fi

step "Running the ReadyPackets unified installer. Progress will remain visible until completion."
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "${installer[@]}"

if [[ "$TLS_PROVIDER" == "cloudflare-origin" ]]; then
  step "Checking the local Cloudflare-origin listener."
  curl -fsS -H "Host: ${DOMAIN}" -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/api/health
elif [[ "$TLS_PROVIDER" == "letsencrypt" ]]; then
  step "Checking the public HTTPS health endpoint."
  curl -fsS "https://${DOMAIN}/api/health"
fi
printf '\n\033[1;32m[ReadyPackets install complete]\033[0m Source commit: %s\n' "$resolved"
printf '[ReadyPackets install complete] Open: https://%s\n' "$DOMAIN"
