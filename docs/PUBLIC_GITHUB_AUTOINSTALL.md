# ReadyPackets Public GitHub Repository Autoinstall

This guide installs ReadyPackets on a **new Ubuntu 22.04 or 24.04 server** after the repository has been made public. It uses the repository’s supported non-interactive unified installer while pinning the installation to a reviewed immutable commit. Do not use this process to overwrite an existing ReadyPackets production server.

> **Security rule:** Even for a public repository, install a reviewed 40-character Git commit SHA rather than a moving branch such as `main`. This prevents a later unreviewed branch update from changing what the server installs.

## 1. Prerequisites

Prepare a fresh server with a public IPv4 address, SSH access, and at least 2 GB RAM recommended. Allow TCP ports **22**, **80**, and **443** in the VPS firewall or provider firewall. Do not open port 3000 or MySQL port 3306.

Create an `A` DNS record for the deployment hostname before installing. For example:

| Setting | Example |
|---|---|
| Hostname | `myportal.example.com` |
| DNS record | `A` |
| Value | Your VPS public IPv4 address |
| TLS method | Let’s Encrypt or Cloudflare Origin CA |

For Let’s Encrypt, the hostname must resolve to the server and port 80 must be reachable. If Cloudflare proxies the hostname, either temporarily set the record to **DNS only** during initial certificate issuance or use the Cloudflare Origin CA mode below with Cloudflare SSL/TLS set to **Full (strict)**.

## 2. Select and record an approved release

From a trusted workstation, find the commit you intend to install:

```bash
git ls-remote https://github.com/readypackets/ReadyPackets.git refs/heads/main
```

Copy the resulting **full 40-character SHA**. Review that commit before using it in production.

## 3. Native VPS autoinstall with Let’s Encrypt

SSH to the new server, replace the four values at the top, and run this complete block:

```bash
sudo -i

export RP_REPOSITORY="https://github.com/readypackets/ReadyPackets.git"
export RP_COMMIT="REPLACE_WITH_REVIEWED_40_CHARACTER_COMMIT_SHA"
export RP_DOMAIN="myportal.example.com"
export RP_EMAIL="operations@example.com"
export RP_PROJECT_DIR="/srv/readypackets"

apt-get update
apt-get install -y --no-install-recommends ca-certificates curl git

if [ -e "$RP_PROJECT_DIR" ]; then
  echo "Refusing to overwrite existing project directory: $RP_PROJECT_DIR" >&2
  exit 1
fi

install -d -m 0755 /srv
git clone --no-checkout "$RP_REPOSITORY" "$RP_PROJECT_DIR"
git -C "$RP_PROJECT_DIR" fetch --depth=1 origin "$RP_COMMIT"
git -C "$RP_PROJECT_DIR" checkout --detach FETCH_HEAD

INSTALLED_COMMIT="$(git -C "$RP_PROJECT_DIR" rev-parse HEAD)"
test "$INSTALLED_COMMIT" = "$RP_COMMIT" || {
  echo "Commit verification failed; refusing installation." >&2
  exit 1
}

git -C "$RP_PROJECT_DIR" status --porcelain | grep -q . && {
  echo "Unexpected source modifications found; refusing installation." >&2
  exit 1
}

cd "$RP_PROJECT_DIR"
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash deploy/unified-install.sh \
  --mode native \
  --domain "$RP_DOMAIN" \
  --email "$RP_EMAIL" \
  --tls-provider letsencrypt
```

The native VPS mode is the recommended production option. It installs the application behind nginx with systemd, MySQL, automatic TLS renewal, protected backup controls, and the recovery/rollback helpers.

## 4. Cloudflare Origin CA alternative

Use this method when the hostname stays proxied through Cloudflare. Before running the installation, create a Cloudflare Origin Certificate for the hostname, put the certificate and private key on the server under a root-only directory, and set Cloudflare SSL/TLS to **Full (strict)**.

Run the same clone-and-commit-verification block from the prior section, then replace the final installer command with:

```bash
install -d -m 0700 /root/readypackets-tls
# Copy your Cloudflare Origin Certificate to:
# /root/readypackets-tls/origin-cert.pem
# Copy its private key to:
# /root/readypackets-tls/origin-key.pem
chmod 0600 /root/readypackets-tls/origin-cert.pem /root/readypackets-tls/origin-key.pem

cd "$RP_PROJECT_DIR"
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash deploy/unified-install.sh \
  --mode native \
  --domain "$RP_DOMAIN" \
  --tls-provider cloudflare-origin \
  --cloudflare-origin-cert /root/readypackets-tls/origin-cert.pem \
  --cloudflare-origin-key /root/readypackets-tls/origin-key.pem
```

## 5. Docker alternatives

The same immutable clone block works for Docker. Change only the final installer command.

| Environment | Final command option |
|---|---|
| Docker Engine and Compose v2 already installed | `--mode docker --project-dir "$RP_PROJECT_DIR"` |
| Fresh server; installer must install Docker | `--mode docker-bootstrap --project-dir "$RP_PROJECT_DIR"` |

For example:

```bash
cd "$RP_PROJECT_DIR"
COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash deploy/unified-install.sh \
  --mode docker-bootstrap \
  --project-dir "$RP_PROJECT_DIR" \
  --domain "$RP_DOMAIN" \
  --email "$RP_EMAIL" \
  --tls-provider letsencrypt
```

## 6. Verify the installation

Run these commands after installation completes:

```bash
curl -fsS "https://${RP_DOMAIN}/api/health"
systemctl status readypackets nginx mysql --no-pager
systemctl list-timers readypackets-backup.timer certbot.timer
```

A healthy application response is:

```json
{"status":"ok"}
```

If the health check fails, inspect the service log before making any manual changes:

```bash
journalctl -u readypackets -n 150 --no-pager
```

## 7. First-production steps

Complete the first administrator setup, enroll administrator MFA, configure email, Stripe, outbound webhooks, SharePoint if used, and protected backup targets before accepting customer data. Keep the configured encryption keys and backup-recovery material in an offline protected location. Do not re-run this first-install process on an existing deployment; use the platform update workflow or the approved rollback controls instead.

## 8. Public-repository caution

Making source code public does **not** mean operational secrets should be public. Never commit `.env` files, `/etc/readypackets/portal.env`, GitHub tokens, Stripe keys, Microsoft Graph secrets, private certificates, database dumps, customer uploads, or configuration bundles containing recovery secrets. The installer generates or preserves those values on the server.
