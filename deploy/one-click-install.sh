#!/usr/bin/env bash
# ReadyPackets guided fresh-server installer.
#
# With a terminal this script asks for the approved deployment settings, displays
# a redacted review, and requires an explicit confirmation before any server
# change. Without a terminal it retains RP_* environment-variable automation.
set -Eeuo pipefail
umask 077

readonly DEFAULT_REPOSITORY="readypackets/ReadyPackets"
REPOSITORY="${RP_REPOSITORY:-$DEFAULT_REPOSITORY}"
REF="${RP_REF:-main}"
COMMIT="${RP_COMMIT:-}"
DOMAIN="${RP_DOMAIN:-}"
EMAIL="${RP_EMAIL:-}"
MODE="${RP_MODE:-}"
SITE_NAME="${RP_SITE_NAME:-ReadyPackets}"
TLS_PROVIDER="${RP_TLS_PROVIDER:-}"
PROJECT_DIR="${RP_PROJECT_DIR:-/srv/readypackets}"
CF_CERT="${RP_CLOUDFLARE_ORIGIN_CERT:-}"
CF_KEY="${RP_CLOUDFLARE_ORIGIN_KEY:-}"
CF_ROOT="${RP_CLOUDFLARE_ORIGIN_ROOT:-}"
VAULT_REPOSITORY="${RP_GITHUB_CONFIG_REPOSITORY:-}"
VAULT_BRANCH="${RP_GITHUB_CONFIG_BRANCH:-main}"
VAULT_FOLDER="${RP_GITHUB_CONFIG_FOLDER:-readypackets-platform-config}"
VAULT_TOKEN="${RP_GITHUB_CONFIG_TOKEN:-}"
VAULT_PASSPHRASE="${RP_GITHUB_CONFIG_PASSPHRASE:-}"
BACKUP_ENABLED="${RP_ENABLE_NIGHTLY_BACKUPS:-yes}"
PROVISION_ADMIN="${RP_PROVISION_ADMIN:-auto}"
ADMIN_EMAIL="${RP_ADMIN_EMAIL:-}"
ADMIN_NAME="${RP_ADMIN_NAME:-}"
ADMIN_PASSWORD="${RP_ADMIN_PASSWORD:-}"
ADMIN_GENERATE_PASSWORD="${RP_ADMIN_GENERATE_PASSWORD:-yes}"
AUTO_CONFIRM="${RP_AUTO_CONFIRM:-}"
RESUME_FAILED_INSTALL="${RP_RESUME_FAILED_INSTALL:-no}"
TEMP_FILES=()

step() { printf '\n\033[1;36m[ReadyPackets install]\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33m[ReadyPackets install warning]\033[0m %s\n' "$*" >&2; }
fail() { printf '\n\033[1;31m[ReadyPackets install failed]\033[0m %s\n' "$*" >&2; exit 1; }
cleanup() {
  unset VAULT_TOKEN VAULT_PASSPHRASE ADMIN_PASSWORD || true
  for item in "${TEMP_FILES[@]:-}"; do rm -rf -- "$item"; done
}
trap cleanup EXIT
trap 'fail "Stopped at line ${LINENO}. Review the message above, correct it, and rerun on this fresh server."' ERR

is_interactive() { [[ -t 0 && -t 1 && "${RP_NONINTERACTIVE:-false}" != "true" ]]; }
INTERACTIVE_MODE="false"
if is_interactive; then INTERACTIVE_MODE="true"; fi
prompt_value() {
  local label="$1" variable="$2" default_value="$3" answer
  [[ -n "${!variable-}" ]] && return 0
  read -r -p "${label} [${default_value}]: " answer
  printf -v "$variable" '%s' "${answer:-$default_value}"
}
prompt_required() {
  local label="$1" variable="$2" answer
  while [[ -z "${!variable-}" ]]; do
    read -r -p "${label}: " answer
    [[ -n "$answer" ]] && printf -v "$variable" '%s' "$answer" || printf 'A value is required.\n' >&2
  done
}
prompt_secret() {
  local label="$1" variable="$2" confirmation_variable="$3" first second
  [[ -n "${!variable-}" ]] && return 0
  while true; do
    read -r -s -p "${label}: " first; printf '\n' >&2
    read -r -s -p "Confirm ${label,,}: " second; printf '\n' >&2
    if [[ -n "$first" && "$first" == "$second" ]]; then
      printf -v "$variable" '%s' "$first"
      return 0
    fi
    printf 'Values did not match or were empty. Please try again.\n' >&2
  done
}
prompt_yes_no() {
  local label="$1" variable="$2" default_value="$3" answer normalized
  [[ -n "${!variable-}" ]] && return 0
  read -r -p "${label} [${default_value}]: " answer
  normalized="${answer:-$default_value}"
  case "${normalized,,}" in
    y|yes) printf -v "$variable" '%s' "yes" ;;
    n|no) printf -v "$variable" '%s' "no" ;;
    *) fail "Answer yes or no for: ${label}" ;;
  esac
}
write_secret_file() {
  local value="$1" prefix="$2" file
  file="$(mktemp "/root/${prefix}.XXXXXX")"
  TEMP_FILES+=("$file")
  printf '%s\n' "$value" > "$file"
  chmod 0600 "$file"
  printf '%s' "$file"
}

[[ $EUID -eq 0 ]] || fail "Run this installer as root, for example: sudo bash one-click-install.sh"

if [[ "$INTERACTIVE_MODE" == "true" ]]; then
  printf '\nReadyPackets guided fresh-server installation\n'
  printf 'This installer retrieves the latest public %s commit by default, asks for required settings, then shows a review before it changes this server.\n' "$REF"

  if [[ -z "$MODE" ]]; then
    printf '\nInstallation type:\n'
    printf '  1) Native VPS (recommended: systemd, nginx, MySQL, protected backup/update helpers)\n'
    printf '  2) Existing Docker Engine + Docker Compose\n'
    printf '  3) Install Docker Engine, then deploy with Docker Compose\n'
    read -r -p "Choose [1-3] (default 1): " install_choice
    case "${install_choice:-1}" in
      1) MODE="native" ;;
      2) MODE="docker" ;;
      3) MODE="docker-bootstrap" ;;
      *) fail "Choose 1, 2, or 3." ;;
    esac
  fi

  prompt_required "Public website hostname (for example www.example.com)" DOMAIN
  prompt_value "Website display name" SITE_NAME "ReadyPackets"

  if [[ -z "$TLS_PROVIDER" ]]; then
    printf '\nTLS certificate method:\n'
    printf '  1) Let\x27s Encrypt (public certificate with automatic renewal)\n'
    printf '  2) Cloudflare Origin CA (for a Cloudflare-proxied site using Full strict)\n'
    printf '  3) HTTP only / configure a certificate later (not recommended for production)\n'
    read -r -p "Choose [1-3] (default 1): " tls_choice
    case "${tls_choice:-1}" in
      1) TLS_PROVIDER="letsencrypt" ;;
      2) TLS_PROVIDER="cloudflare-origin" ;;
      3) TLS_PROVIDER="none" ;;
      *) fail "Choose 1, 2, or 3." ;;
    esac
  fi
  if [[ "$TLS_PROVIDER" == "letsencrypt" ]]; then
    prompt_required "Let's Encrypt contact email" EMAIL
  elif [[ "$TLS_PROVIDER" == "cloudflare-origin" ]]; then
    prompt_required "Cloudflare Origin certificate PEM file path" CF_CERT
    prompt_required "Cloudflare Origin private-key PEM file path" CF_KEY
    prompt_value "Optional Cloudflare Origin CA root PEM path (enter - to omit)" CF_ROOT "-"
    [[ "$CF_ROOT" == "-" ]] && CF_ROOT=""
  elif [[ "$TLS_PROVIDER" == "none" ]]; then
    read -r -p "Type HTTP ONLY to confirm an insecure non-production installation: " tls_danger
    [[ "$tls_danger" == "HTTP ONLY" ]] || fail "HTTP-only installation was not confirmed."
  fi

  prompt_yes_no "Use the default public source (${DEFAULT_REPOSITORY}, latest ${REF})" use_default_source "yes"
  if [[ "$use_default_source" == "no" ]]; then
    prompt_required "Public GitHub repository (owner/repository)" REPOSITORY
    prompt_value "Source branch" REF "main"
    read -r -p "Optional reviewed 40-character commit SHA (leave blank for latest ${REF}): " COMMIT
  fi

  prompt_yes_no "Restore the latest encrypted GitHub configuration vault backup" restore_vault "no"
  if [[ "$restore_vault" == "yes" ]]; then
    prompt_required "Private GitHub vault repository (owner/repository)" VAULT_REPOSITORY
    prompt_value "Vault branch" VAULT_BRANCH "main"
    prompt_value "Vault folder" VAULT_FOLDER "readypackets-platform-config"
    while [[ -z "$VAULT_TOKEN" ]]; do read -r -s -p "Fine-grained GitHub token: " VAULT_TOKEN; printf '\n' >&2; done
    prompt_secret "Vault recovery passphrase" VAULT_PASSPHRASE unused_confirmation
  fi

  if [[ "$MODE" == "native" ]]; then
    prompt_yes_no "Enable nightly local encrypted backups" BACKUP_ENABLED "yes"
  fi

  if [[ -n "$VAULT_REPOSITORY" ]]; then
    prompt_yes_no "Provision or reset a local administrator after recovery" provision_after_restore "no"
    [[ "$provision_after_restore" == "yes" ]] && PROVISION_ADMIN="yes" || PROVISION_ADMIN="no"
  elif [[ "$PROVISION_ADMIN" == "auto" ]]; then
    PROVISION_ADMIN="yes"
  fi
  if [[ "$PROVISION_ADMIN" == "yes" ]]; then
    prompt_required "Initial administrator email" ADMIN_EMAIL
    prompt_required "Initial administrator full name" ADMIN_NAME
    prompt_yes_no "Generate a one-time administrator password instead of typing one" ADMIN_GENERATE_PASSWORD "yes"
    if [[ "$ADMIN_GENERATE_PASSWORD" == "no" ]]; then
      prompt_secret "Initial administrator password" ADMIN_PASSWORD unused_confirmation
    fi
  fi
fi

# Safe defaults for values not set by a guided terminal flow.
MODE="${MODE:-native}"
TLS_PROVIDER="${TLS_PROVIDER:-letsencrypt}"
PROVISION_ADMIN="${PROVISION_ADMIN:-auto}"

[[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "RP_REPOSITORY must be owner/repository."
[[ "$DOMAIN" =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?(\.[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?)+$ ]] || fail "Set a valid public website hostname."
[[ "$MODE" =~ ^(native|docker|docker-bootstrap)$ ]] || fail "Installation type must be native, docker, or docker-bootstrap."
[[ "$TLS_PROVIDER" =~ ^(letsencrypt|cloudflare-origin|none)$ ]] || fail "TLS provider must be letsencrypt, cloudflare-origin, or none."
[[ "$SITE_NAME" != *$'\n'* && -n "$SITE_NAME" && ${#SITE_NAME} -le 100 ]] || fail "Website display name must be 1 to 100 characters and contain no line breaks."
[[ -z "$COMMIT" || "$COMMIT" =~ ^[0-9a-fA-F]{40}$ ]] || fail "Optional source commit must be a reviewed 40-character Git SHA."
if [[ "$TLS_PROVIDER" == "letsencrypt" ]]; then [[ "$EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || fail "A valid Let\x27s Encrypt contact email is required."; fi
if [[ "$TLS_PROVIDER" == "cloudflare-origin" ]]; then [[ -f "$CF_CERT" && -f "$CF_KEY" ]] || fail "Cloudflare Origin CA needs readable certificate and key files."; fi
if [[ -n "$VAULT_REPOSITORY" || -n "$VAULT_TOKEN" || -n "$VAULT_PASSPHRASE" ]]; then
  [[ "$VAULT_REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "GitHub vault repository must be owner/private-repository."
  [[ ${#VAULT_TOKEN} -ge 20 && ${#VAULT_PASSPHRASE} -ge 16 ]] || fail "GitHub vault recovery needs a fine-grained token and a 16+ character passphrase."
fi
if [[ "$PROVISION_ADMIN" == "auto" ]]; then
  [[ -z "$VAULT_REPOSITORY" ]] && PROVISION_ADMIN="yes" || PROVISION_ADMIN="no"
fi
[[ "$PROVISION_ADMIN" =~ ^(yes|no)$ ]] || fail "RP_PROVISION_ADMIN must be yes, no, or auto."
if [[ "$PROVISION_ADMIN" == "yes" ]]; then
  [[ "$ADMIN_EMAIL" =~ ^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$ ]] || fail "A valid initial administrator email is required."
  [[ -n "$ADMIN_NAME" && ${#ADMIN_NAME} -le 120 ]] || fail "Initial administrator full name is required."
  [[ "$ADMIN_GENERATE_PASSWORD" =~ ^(yes|no)$ ]] || fail "RP_ADMIN_GENERATE_PASSWORD must be yes or no."
  if [[ "$ADMIN_GENERATE_PASSWORD" == "no" ]]; then [[ ${#ADMIN_PASSWORD} -ge 12 ]] || fail "Initial administrator password must meet the password policy."; fi
fi
[[ "$BACKUP_ENABLED" =~ ^(yes|no)$ ]] || fail "RP_ENABLE_NIGHTLY_BACKUPS must be yes or no."
if [[ -e "$PROJECT_DIR" ]]; then
  if [[ "$INTERACTIVE_MODE" == "true" && "$RESUME_FAILED_INSTALL" == "no" ]]; then
    prompt_yes_no "An existing ReadyPackets project directory was found. Resume a previously failed fresh installation" RESUME_FAILED_INSTALL "no"
  fi
  [[ "$RESUME_FAILED_INSTALL" == "yes" ]] || fail "Project directory already exists: $PROJECT_DIR. This script will not overwrite an existing installation. Set RP_RESUME_FAILED_INSTALL=yes only for a failed fresh installation."
  [[ -d "$PROJECT_DIR/.git" ]] || fail "The existing project directory is not a Git checkout and cannot be safely resumed."
  if systemctl is-active --quiet readypackets 2>/dev/null; then
    fail "The ReadyPackets service is active. This resume path is restricted to failed fresh installations and will not modify a live portal."
  fi
else
  RESUME_FAILED_INSTALL="no"
fi

if [[ "$INTERACTIVE_MODE" == "true" ]]; then
  printf '\n\033[1;36mReadyPackets installation review\033[0m\n'
  printf '  Installation type: %s\n' "$MODE"
  printf '  Public hostname:    %s\n' "$DOMAIN"
  printf '  Website name:       %s\n' "$SITE_NAME"
  printf '  TLS method:         %s\n' "$TLS_PROVIDER"
  printf '  Source:             https://github.com/%s.git (%s%s)\n' "$REPOSITORY" "$REF" "${COMMIT:+, pinned ${COMMIT}}"
  printf '  Config recovery:    %s\n' "$( [[ -n "$VAULT_REPOSITORY" ]] && printf 'enabled (secrets hidden)' || printf 'not requested' )"
  printf '  Nightly backup:     %s\n' "$BACKUP_ENABLED"
  printf '  Initial admin:      %s\n' "$( [[ "$PROVISION_ADMIN" == "yes" ]] && printf '%s (%s password)' "$ADMIN_EMAIL" "$ADMIN_GENERATE_PASSWORD" || printf 'not provisioned by installer' )"
  printf '  Failed-install resume: %s\n' "$RESUME_FAILED_INSTALL"
  printf '\nNo secrets will be displayed or stored in shell history by this guided flow.\n'
  read -r -p "Type INSTALL READY PACKETS to begin: " final_confirmation
  [[ "$final_confirmation" == "INSTALL READY PACKETS" ]] || fail "Installation cancelled before any server changes."
elif [[ "$AUTO_CONFIRM" != "INSTALL_READY_PACKETS" ]]; then
  fail "Non-interactive execution requires RP_AUTO_CONFIRM=INSTALL_READY_PACKETS. Run from a terminal to use guided prompts."
fi

step "Starting guided ${MODE} installation for ${DOMAIN}."
step "Installing only bootstrap packages needed to retrieve the public source."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y --no-install-recommends ca-certificates curl git

step "Retrieving ReadyPackets source from https://github.com/${REPOSITORY}.git"
if [[ "$RESUME_FAILED_INSTALL" == "yes" ]]; then
  step "Resuming the failed fresh installation with the latest selected source."
  cd "$PROJECT_DIR"
  git remote set-url origin "https://github.com/${REPOSITORY}.git"
  git fetch --depth 1 origin "$REF"
  git reset --hard FETCH_HEAD
  git clean -fd
else
  install -d -m 0755 "$(dirname "$PROJECT_DIR")"
  git clone --depth 1 --branch "$REF" "https://github.com/${REPOSITORY}.git" "$PROJECT_DIR"
  cd "$PROJECT_DIR"
fi
if [[ -n "$COMMIT" ]]; then
  step "Verifying reviewed immutable source commit ${COMMIT}."
  git fetch --depth=1 origin "$COMMIT"
  resolved="$(git rev-parse FETCH_HEAD)"
  [[ "${resolved,,}" == "${COMMIT,,}" ]] || fail "Fetched source does not match the reviewed commit."
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
  token_file="$(write_secret_file "$VAULT_TOKEN" readypackets-vault-token)"
  passphrase_file="$(write_secret_file "$VAULT_PASSPHRASE" readypackets-vault-passphrase)"
  unset VAULT_TOKEN VAULT_PASSPHRASE
  installer+=(--github-config-repository "$VAULT_REPOSITORY" --github-config-branch "$VAULT_BRANCH" --github-config-folder "$VAULT_FOLDER" --github-config-token-file "$token_file" --github-config-passphrase-file "$passphrase_file")
fi

step "Running the ReadyPackets unified installer. Progress will remain visible until completion."
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 "${installer[@]}"

if [[ "$MODE" == "native" ]]; then
  if [[ "$BACKUP_ENABLED" == "yes" ]]; then
    step "Ensuring the nightly encrypted local backup timer is enabled."
    systemctl enable --now readypackets-backup.timer >/dev/null 2>&1 || warn "The backup timer is not available yet; configure backups in the Admin portal after first sign-in."
  else
    step "Leaving the nightly local backup timer disabled by operator choice."
    systemctl disable --now readypackets-backup.timer >/dev/null 2>&1 || true
  fi
fi

if [[ "$PROVISION_ADMIN" == "yes" ]]; then
  step "Provisioning the initial administrator account."
  admin_args=(--email "$ADMIN_EMAIL" --name "$ADMIN_NAME")
  if [[ "$ADMIN_GENERATE_PASSWORD" == "yes" ]]; then
    admin_args+=(--generate-password)
  else
    admin_args+=(--password-stdin)
  fi
  if [[ "$MODE" == "native" ]]; then
    if [[ "$ADMIN_GENERATE_PASSWORD" == "yes" ]]; then
      runuser -u readypackets -- env $(grep -v '^#' /etc/readypackets/portal.env | xargs) node /opt/readypackets/dist/create-admin.js "${admin_args[@]}"
    else
      printf '%s\n' "$ADMIN_PASSWORD" | runuser -u readypackets -- env $(grep -v '^#' /etc/readypackets/portal.env | xargs) node /opt/readypackets/dist/create-admin.js "${admin_args[@]}"
    fi
  else
    if [[ "$ADMIN_GENERATE_PASSWORD" == "yes" ]]; then
      (cd "$PROJECT_DIR" && docker compose exec -T app node dist/create-admin.js "${admin_args[@]}")
    else
      printf '%s\n' "$ADMIN_PASSWORD" | (cd "$PROJECT_DIR" && docker compose exec -T app node dist/create-admin.js "${admin_args[@]}")
    fi
  fi
  unset ADMIN_PASSWORD
fi

if [[ "$TLS_PROVIDER" == "cloudflare-origin" ]]; then
  step "Checking the local Cloudflare-origin listener."
  curl -fsS -H "Host: ${DOMAIN}" -H 'X-Forwarded-Proto: https' http://127.0.0.1:3000/api/health
elif [[ "$TLS_PROVIDER" == "letsencrypt" ]]; then
  step "Checking the public HTTPS health endpoint."
  curl -fsS "https://${DOMAIN}/api/health"
fi
printf '\n\033[1;32m[ReadyPackets install complete]\033[0m Source commit: %s\n' "$resolved"
printf '[ReadyPackets install complete] Open: %s://%s\n' "$([[ "$TLS_PROVIDER" == "none" ]] && printf http || printf https)" "$DOMAIN"
