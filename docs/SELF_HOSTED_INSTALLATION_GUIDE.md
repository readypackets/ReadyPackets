# ReadyPackets Self-Hosted Production Installation Guide

**Audience:** Server administrators

> ReadyPackets is designed to run without a managed platform dependency. The supported production deployment is an Ubuntu LTS server using either the native installer or Docker behind nginx and HTTPS.

## 1. Choose the deployment model

| Model | Recommended when | Installer responsibility |
|---|---|---|
| **Native VPS** | Recommended for most production systems. You want systemd, MySQL, protected host backups, update/rollback helpers, and straightforward operations. | Installs and configures Node.js 22, MySQL 8, nginx, TLS, systemd, backups, database migrations, and the ReadyPackets service. |
| **Existing Docker** | Your organization already operates Docker Engine and Compose v2 under its own standards. | Creates the application/database container stack, loopback-only app publishing, host nginx, TLS, migrations, and seed data. |
| **Docker bootstrap** | You have a clean Ubuntu server and prefer containers. | Installs Docker Engine/Compose, then performs the Docker deployment. |

The **Native VPS** option is the recommended path for a conventional self-hosted production portal.

## 2. Production prerequisites

Provision a current **Ubuntu 22.04 or 24.04 LTS** server with a static public IP address, root or sudo access, and a DNS name such as `myportal.example.com`. A minimum practical configuration is **2 vCPU, 4 GB RAM, and 80 GB SSD storage**; add more capacity for higher file-storage, email, backup, or concurrent-user needs.

Create a DNS **A** record for the portal hostname pointing to the server’s public IP. If IPv6 is configured, create a matching **AAAA** record. Before requesting a public certificate, confirm DNS resolves correctly:

```bash
dig +short myportal.example.com A
curl -4 ifconfig.me
```

Allow only these inbound ports at the provider firewall and host firewall:

| Port | Purpose | Public exposure |
|---|---|---|
| `22/tcp` | SSH administration | Restrict to known administrator IP ranges when feasible. |
| `80/tcp` | HTTP redirect and Let’s Encrypt validation | Public. |
| `443/tcp` | Customer portal HTTPS | Public. |
| `3000/tcp` | ReadyPackets application | **Never public.** The installer binds it to loopback only. |
| `3306/tcp` | MySQL | **Never public.** The installer keeps it private. |

Update the operating system before deployment:

```bash
sudo apt-get update
sudo apt-get upgrade -y
sudo apt-get install -y ca-certificates curl git openssh-client
sudo reboot
```

Reconnect after the reboot and confirm the hostname, disk capacity, and firewall policy:

```bash
hostnamectl
lsblk
sudo ufw status verbose
```

## 3. Retrieve the private ReadyPackets repository securely

Use a dedicated **read-only GitHub deploy key** rather than embedding a personal access token in commands, shell history, `.env`, Git configuration, or the server filesystem.

Generate a key on the server:

```bash
sudo install -d -m 0700 /root/.ssh
sudo ssh-keygen -t ed25519 -f /root/.ssh/readypackets_deploy -N '' -C 'readypackets-production-deploy'
sudo cat /root/.ssh/readypackets_deploy.pub
```

In GitHub, open the private `readypackets/ReadyPackets` repository, then add the displayed public key under **Settings → Deploy keys**. Name it clearly, such as `production-vps`, and leave **Allow write access** disabled.

Configure SSH to use that deploy key and clone the repository:

```bash
sudo tee /root/.ssh/config >/dev/null <<'EOF'
Host github.com
  HostName github.com
  User git
  IdentityFile /root/.ssh/readypackets_deploy
  IdentitiesOnly yes
EOF
sudo chmod 600 /root/.ssh/config

sudo ssh -T git@github.com || true
sudo git clone git@github.com:readypackets/ReadyPackets.git /srv/readypackets
cd /srv/readypackets
sudo git rev-parse --verify HEAD
```

> GitHub may report that shell access is not provided after successful deploy-key authentication. That is expected. The clone command is the actual repository-access check.

## 4. Install with the interactive installer

From the checked-out repository, run the installer with your real portal hostname and an operational email address:

```bash
cd /srv/readypackets
sudo bash deploy/unified-install.sh \
  --domain myportal.example.com \
  --email operations@example.com
```

The installer will prompt you to choose one of these modes:

| Prompt choice | Selection |
|---|---|
| `1` | Native VPS — recommended |
| `2` | Existing Docker Engine and Compose |
| `3` | Docker bootstrap |

It will then prompt for a TLS method. Choose **Let’s Encrypt** for a normal public certificate. Choose **Cloudflare Origin CA** only if the hostname will always remain proxied through Cloudflare and Cloudflare SSL/TLS mode is **Full (strict)**.

## 5. Non-interactive native VPS installation

For an automated deployment, use an explicit mode and TLS choice:

```bash
cd /srv/readypackets
sudo COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash deploy/unified-install.sh \
  --mode native \
  --domain myportal.example.com \
  --email operations@example.com \
  --tls-provider letsencrypt
```

The installer creates or preserves these protected locations:

| Location | Purpose |
|---|---|
| `/opt/readypackets` | Installed application, server bundle, client assets, and release marker. |
| `/etc/readypackets/portal.env` | Root-protected runtime configuration and generated encryption keys. |
| `/var/lib/readypackets/storage` | Customer uploads and generated artifacts. |
| `/var/backups/readypackets` | Protected local backup archives. |
| `readypackets.service` | Application service, bound to `127.0.0.1:3000`. |
| `/etc/nginx/sites-available/readypackets` | HTTPS reverse-proxy configuration. |

Do **not** overwrite `DATA_ENCRYPTION_KEY` or `EMAIL_INDEX_KEY` after users or data exist. Losing the former makes encrypted customer information unrecoverable; changing the latter makes stored email lookups fail until a managed migration is performed.

## 6. Cloudflare Origin CA installation

Use this option only for a hostname that stays proxied through Cloudflare. In Cloudflare, set the zone to **Full (strict)**, then create an Origin CA certificate that includes the exact hostname or appropriate wildcard. Store the certificate and key in a root-only directory on the server:

```bash
sudo install -d -m 0700 /root/readypackets-tls
# Transfer origin-cert.pem and origin-key.pem through an approved secure channel.
sudo chmod 600 /root/readypackets-tls/origin-key.pem

cd /srv/readypackets
sudo COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash deploy/unified-install.sh \
  --mode native \
  --domain myportal.example.com \
  --tls-provider cloudflare-origin \
  --cloudflare-origin-cert /root/readypackets-tls/origin-cert.pem \
  --cloudflare-origin-key /root/readypackets-tls/origin-key.pem
```

Do not switch a Cloudflare Origin CA hostname to DNS-only mode: browsers do not trust an Origin CA certificate directly.

## 7. Docker installation

Use Docker mode only if the host is intentionally managed for containers.

For an existing Docker Engine and Compose v2 installation:

```bash
cd /srv/readypackets
sudo COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash deploy/unified-install.sh \
  --mode docker \
  --project-dir /srv/readypackets \
  --domain myportal.example.com \
  --email operations@example.com \
  --tls-provider letsencrypt
```

For a new Ubuntu server where the installer should provision Docker first:

```bash
cd /srv/readypackets
sudo COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash deploy/unified-install.sh \
  --mode docker-bootstrap \
  --project-dir /srv/readypackets \
  --domain myportal.example.com \
  --email operations@example.com
```

The Docker deployment keeps MySQL on the internal container network and publishes the application only through host nginx. Back up the generated mode-0600 `.env` file and database backups using an encrypted off-host process.

## 8. Create the first administrator and enroll MFA

After the native installation completes, create the first administrator from the root console. Replace the example address with the actual administrator email address:

```bash
sudo runuser -u readypackets -- env $(grep -v '^#' /etc/readypackets/portal.env | xargs) \
  node /opt/readypackets/dist/create-admin.js \
  --email admin@example.com
```

The command prints a one-time password or setup instruction. Store it in an approved password manager, sign in at `https://myportal.example.com`, and enroll MFA. Administrator MFA is enforced server-side.

Complete the controlled first-run setup in **Admin → Platform setup** and **Admin → Finance**. Configure the Microsoft Graph mail connection or SMTP, Stripe secret/webhook settings, Microsoft Entra ID if required, phase webhook endpoints, allowed administrative IPs, backup schedule, and at least one encrypted external backup destination.

## 9. Post-installation verification

Run these checks before inviting customers:

```bash
curl -fsS https://myportal.example.com/api/health
curl -fsS https://myportal.example.com/api/health/ready
sudo nginx -t
sudo systemctl status readypackets nginx mysql
sudo systemctl list-timers readypackets-backup.timer certbot.timer
sudo ss -ltnp | grep -E ':(22|80|443|3000|3306)'
```

Expected results are a successful health JSON response, active native services, enabled backup/certificate timers, and application/MySQL listeners on loopback rather than a public interface.

For a Let’s Encrypt hostname, inspect the active certificate:

```bash
openssl s_client -connect myportal.example.com:443 -servername myportal.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
```

## 10. Operations, updates, and rollback

Use the application’s **Admin → Platform updates** workflow for approved updates. It supports an explicit scan/approval process, snapshot creation, health checking, and rollback. Do not deploy an unreviewed moving branch tip directly to a live server.

If you must re-run a native installation after packages are already present, use the idempotent installer with `--skip-packages`:

```bash
cd /srv/readypackets
sudo COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash deploy/install.sh \
  --domain myportal.example.com \
  --email operations@example.com \
  --tls \
  --skip-packages
```

Before any manual release operation, create and verify a database backup and preserve the previous server/client build. Do not publish ports `3000` or `3306`, and do not store application encryption keys, database credentials, Microsoft Graph secrets, Stripe secrets, deploy keys, or certificate private keys in Git.

## 11. Troubleshooting

| Symptom | First checks |
|---|---|
| Certificate issuance fails | Confirm the hostname resolves to the server, ports 80/443 are open, and a competing web server is not using port 80. |
| Public site is unavailable | Check `sudo systemctl status readypackets nginx`, `sudo nginx -t`, `/api/health`, and `journalctl -u readypackets -n 100 --no-pager`. |
| Application service cannot start | Check `/etc/readypackets/portal.env` permissions/values and the migration output in `journalctl -u readypackets`. Do not replace generated encryption keys. |
| Email, Stripe, or SharePoint does not work | Test the connection from the relevant protected Admin settings page; do not paste secret values into browser consoles, logs, Git, or support tickets. |
| Backup failed | Check `sudo systemctl status readypackets-backup.service` and `/var/backups/readypackets`; verify off-host destination settings and credentials through the admin backup controls. |

## 12. Security acceptance checklist

Before go-live, confirm the following: HTTPS is active; Cloudflare uses Full (strict) if proxying; SSH root access is limited or disabled in favor of a named sudo user and key-based login; ports 3000/3306 are private; MFA is enabled for every administrator; the first backup restores in a non-production test; an external encrypted backup target is configured; Stripe webhooks have been tested; external webhook endpoints are verified; and all generated encryption keys are backed up off-host in an approved password/secrets vault.

## References

[1]: https://docs.docker.com/engine/install/ "Docker Engine installation documentation"
[2]: https://eff-certbot.readthedocs.io/en/stable/using.html "Certbot user guide"
[3]: https://dev.mysql.com/doc/refman/8.0/en/ "MySQL 8.0 Reference Manual"
[4]: https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/ "Cloudflare Origin CA"
[5]: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/ "Cloudflare Full (strict)"
