#!/usr/bin/env bash
# Download the latest encrypted ReadyPackets configuration-vault bundle from a
# private GitHub repository. This helper never decrypts the bundle and never
# prints the repository token or recovery passphrase.
set -Eeuo pipefail
umask 077

REPOSITORY=""
BRANCH="main"
FOLDER="readypackets-platform-config"
TOKEN_FILE=""
OUTPUT=""

fail() { printf '[github-config-vault-restore] %s\n' "$*" >&2; exit 1; }
usage() {
  cat <<'USAGE'
Usage:
  sudo bash deploy/github-config-vault-restore.sh \
    --repository owner/private-vault \
    --branch main \
    --folder readypackets-platform-config \
    --token-file /root/github-vault.token \
    --output /root/readypackets-config.rpconfig

The repository must be private. The downloaded .rpconfig bundle remains
passphrase-encrypted and must be restored through config-migration.sh.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repository) REPOSITORY="${2:-}"; shift 2 ;;
    --branch) BRANCH="${2:-}"; shift 2 ;;
    --folder) FOLDER="${2:-}"; shift 2 ;;
    --token-file) TOKEN_FILE="${2:-}"; shift 2 ;;
    --output) OUTPUT="${2:-}"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) fail "Unknown option: $1" ;;
  esac
done

[[ $EUID -eq 0 ]] || fail "Run as root."
[[ "$REPOSITORY" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]] || fail "Repository must be owner/repository."
[[ "$BRANCH" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$ && "$BRANCH" != *".."* && "$BRANCH" != *"//"* ]] || fail "Branch is invalid."
[[ "$FOLDER" =~ ^[A-Za-z0-9][A-Za-z0-9._/-]{0,239}$ && "$FOLDER" != *".."* && "$FOLDER" != *"//"* ]] || fail "Folder is invalid."
[[ -f "$TOKEN_FILE" ]] || fail "Token file was not found."
[[ -n "$OUTPUT" && "$OUTPUT" != *$'\n'* ]] || fail "Output path is required."
mode="$(stat -c '%a' "$TOKEN_FILE")"
[[ "$mode" =~ ^[67]00$ ]] || fail "Token file must be owner-only (mode 600 or 700)."
for command in curl python3 sha256sum install; do command -v "$command" >/dev/null 2>&1 || fail "Required command not found: $command"; done

TOKEN="$(head -n 1 "$TOKEN_FILE" | tr -d '\r\n')"
[[ ${#TOKEN} -ge 20 ]] || fail "GitHub token is empty or too short."
trap 'unset TOKEN' EXIT

api() {
  curl -fsS --connect-timeout 10 --max-time 45 --retry 2 --retry-delay 1 \
    -H "Accept: application/vnd.github+json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" "$@"
}
api_raw() {
  curl -fsS --connect-timeout 10 --max-time 45 --retry 2 --retry-delay 1 \
    -H "Accept: application/vnd.github.raw+json" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "X-GitHub-Api-Version: 2022-11-28" "$@"
}

repo_json="$(api "https://api.github.com/repos/${REPOSITORY}")" || fail "Could not read the GitHub repository. Check the repository and token."
printf '%s' "$repo_json" | python3 -c 'import json,sys; data=json.load(sys.stdin); raise SystemExit(0 if data.get("private") is True else 1)' || fail "Configuration vault repository must be private."

root_json="$(api --get "https://api.github.com/repos/${REPOSITORY}/contents/${FOLDER}" --data-urlencode "ref=${BRANCH}")" || fail "Could not list the configured vault folder."
latest_day="$(printf '%s' "$root_json" | python3 -c 'import json,sys; rows=json.load(sys.stdin); days=sorted(x.get("name","") for x in rows if x.get("type")=="dir" and len(x.get("name", ""))==10 and x["name"][4:5]=="-" and x["name"][7:8]=="-"); print(days[-1] if days else "")')"
[[ "$latest_day" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail "No dated encrypted vault backup was found."

archive_dir="${FOLDER}/${latest_day}"
archive_json="$(api --get "https://api.github.com/repos/${REPOSITORY}/contents/${archive_dir}" --data-urlencode "ref=${BRANCH}")" || fail "Could not list the latest vault backup."
archive_name="$(printf '%s' "$archive_json" | python3 -c 'import json,sys; rows=json.load(sys.stdin); names=sorted(x.get("name","") for x in rows if x.get("type")=="file" and x.get("name", "").startswith("readypackets-config-github-secrets-") and x.get("name", "").endswith(".rpconfig")); print(names[-1] if names else "")')"
[[ "$archive_name" =~ ^readypackets-config-github-secrets-[0-9TZ-]+\.rpconfig$ ]] || fail "Latest vault archive name is invalid."
manifest_name="${archive_name}.manifest.json"

staging="$(mktemp -d)"; trap 'rm -rf "$staging"; unset TOKEN' EXIT
archive_path="${archive_dir}/${archive_name}"
manifest_path="${archive_dir}/${manifest_name}"
api_raw --get "https://api.github.com/repos/${REPOSITORY}/contents/${archive_path}" --data-urlencode "ref=${BRANCH}" -o "$staging/archive.rpconfig" || fail "Could not download the encrypted vault archive."
api_raw --get "https://api.github.com/repos/${REPOSITORY}/contents/${manifest_path}" --data-urlencode "ref=${BRANCH}" -o "$staging/manifest.json" || fail "Could not download the vault integrity manifest."

expected_sha="$(python3 - "$staging/manifest.json" "$archive_name" <<'PY'
import json, sys
with open(sys.argv[1], encoding="utf-8") as handle:
    value = json.load(handle)
if value.get("format") != "readypackets-github-configuration-vault" or value.get("formatVersion") != 1 or value.get("encrypted") is not True or value.get("archive") != sys.argv[2]:
    raise SystemExit(1)
sha = value.get("sha256", "")
if len(sha) != 64 or any(character not in "0123456789abcdef" for character in sha.lower()):
    raise SystemExit(1)
print(sha.lower())
PY
)" || fail "Vault manifest is invalid."
actual_sha="$(sha256sum "$staging/archive.rpconfig" | awk '{print $1}')"
[[ "$actual_sha" == "$expected_sha" ]] || fail "Vault archive checksum does not match its manifest."

install -d -m 0700 -o root -g root "$(dirname "$OUTPUT")"
install -m 0600 -o root -g root "$staging/archive.rpconfig" "$OUTPUT"
printf '%s\n' "$OUTPUT"
