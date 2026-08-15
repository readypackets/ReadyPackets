# ReadyPackets Deployment and Installation Guide

**Version:** 2026-08-13
**Audience:** Infrastructure administrators and deployment operators

> ReadyPackets is self-hosted. The platform does not require a Manus runtime or hosted dependency. Production deployment requires a domain, a supported Linux host, TLS, MySQL for native mode or Docker Engine for container mode, and secure offline recovery handling for generated secrets.

## Choose an installation mode

| Mode | Best for | What the installer manages |
|---|---|---|
| **Native VPS** | The recommended production deployment for a managed Ubuntu VPS. | Node, MySQL, nginx, systemd, TLS, backups, the backup control helper, and the platform update helper. |
| **Existing Docker** | A server with a security-managed Docker Engine and Compose v2 already installed. | The ReadyPackets app and MySQL containers, host nginx, TLS, migrations, and seed data. |
| **Docker bootstrap** | A new Ubuntu VPS where Docker should be installed by the ReadyPackets installer. | Docker Engine packages, the container stack, host nginx, TLS, migrations, and seed data. |

The native mode is the preferred mode for the built-in protected backup, update, and rollback helpers. Docker mode provides the same application features, but host-level lifecycle helpers remain the responsibility of the container host operator.

### Interactive installation selection

When the unified installer is run from an interactive terminal without `--mode`, it prompts for one of three choices: **Native VPS**, **existing Docker Engine and Compose**, or **Docker bootstrap**. The default is Native VPS. This is the simplest operator command:

```bash
sudo bash deploy/unified-install.sh \
  --domain myportal.example.com \
  --email operations@example.com
```

For unattended use, automation must pass `--mode native`, `--mode docker`, or `--mode docker-bootstrap` explicitly. This prevents an automated deployment from waiting for terminal input.

## Prerequisites

The domain’s DNS A/AAAA record must point to the server before obtaining a certificate. Open only ports **22**, **80**, and **443**. Do not publish MySQL or the ReadyPackets application port directly to the internet. Use a current Ubuntu LTS host with root or sudo access.

```bash
sudo apt-get update
sudo apt-get install -y git curl
# Obtain the reviewed ReadyPackets source by a controlled method.
git clone https://github.com/readypackets/ReadyPackets.git /srv/readypackets
cd /srv/readypackets
```

For private repositories, use a short-lived or fine-grained GitHub token only during cloning. Do not place it in `.env`, application settings, shell histories, or service files.

## TLS certificate decision

Choose the certificate model *before* the first public deployment. The installer prompts an interactive operator to choose Let’s Encrypt, Cloudflare Origin CA, or HTTP-only configuration. Non-interactive automation must pass an explicit provider. **Do not use HTTP-only mode for a production portal.**

| Provider | Use when | Important limitation |
|---|---|---|
| **Let’s Encrypt** | The origin must work directly from browsers, Cloudflare may be bypassed, or a public CA certificate is preferred. | The hostname must resolve to the server for ACME validation. Renewal is configured through the normal Certbot timer. |
| **Cloudflare Origin CA** | The hostname is always proxied through Cloudflare and Cloudflare SSL/TLS mode is **Full (strict)**. | It is trusted between Cloudflare and origin, not by visitor browsers. Do not pause proxying or switch the record to DNS-only while this certificate is active. [4] [5] |

Cloudflare Full (strict) requires an unexpired, hostname-matching origin certificate, which may be a public CA certificate or a Cloudflare Origin CA certificate. [5]

## Native VPS installation

### Step 1: Prepare DNS and firewall

Create the DNS record for the intended hostname. For Let’s Encrypt issuance, ensure the record resolves to the VPS and allow inbound TCP **80** and **443**. For a Cloudflare Origin CA certificate, create the record as **proxied** in Cloudflare and set Cloudflare SSL/TLS encryption mode to **Full (strict)** before customer traffic is accepted. Keep the application and MySQL ports private.

### Step 2: Install with Let’s Encrypt

Run the unified installer from the repository root. The installer obtains a public certificate and configures automatic renewal.

```bash
sudo bash deploy/unified-install.sh \
  --mode native \
  --domain myportal.example.com \
  --email operations@example.com \
  --tls-provider letsencrypt
```

### Step 3: Install with Cloudflare Origin CA

In Cloudflare, open **SSL/TLS → Origin Server → Create certificate**. Include the exact portal hostname (or an appropriate wildcard), retain the generated certificate and private key only in a protected local directory, and optionally save the Cloudflare Origin CA root certificate. Do not commit any of these PEM files to Git.

```bash
sudo install -d -m 0700 /root/readypackets-tls
# Copy the certificate and private key to the protected directory by a controlled method.
sudo chmod 0600 /root/readypackets-tls/origin-key.pem

sudo bash deploy/unified-install.sh \
  --mode native \
  --domain myportal.example.com \
  --tls-provider cloudflare-origin \
  --cloudflare-origin-cert /root/readypackets-tls/origin-cert.pem \
  --cloudflare-origin-key /root/readypackets-tls/origin-key.pem \
  --cloudflare-origin-root /root/readypackets-tls/cloudflare-origin-ca-root.pem
```

The installer validates the PEM syntax, confirms that the leaf certificate matches the configured hostname, verifies that the private key matches the certificate, writes root-owned TLS material under `/etc/readypackets/tls`, validates nginx, and reloads it only after validation succeeds. It does not store the certificate private key in the application database, browser, environment file, or repository.

### Step 4: Complete first-run platform configuration

The native installer generates and preserves application encryption keys in `/etc/readypackets/portal.env`, creates the MySQL database, installs the `readypackets` service on loopback port 3000, starts protected backups, and verifies readiness. Re-running the installer is intended to be idempotent; it preserves existing secrets unless a reset was explicitly performed.

Create the first administrator, enroll MFA, then open **Admin → Platform setup** for email, Microsoft Entra ID, Stripe, phase webhooks, and access allowlists. Complete a test backup and configure at least one independent encrypted cloud backup destination before accepting customer data.

### Step 5: Manage a certificate after installation

Open **Admin → System → Certificates**. The portal shows issuer, subject, validity dates, SHA-256 fingerprint, provider, and Cloudflare-root presence; it never returns a private key or PEM body. To change to Cloudflare Origin CA, paste the new certificate/key into the write-only dialog and type `INSTALL CLOUDFLARE ORIGIN CA`. The protected local certificate daemon validates the hostname and key pair, creates a TLS rollback copy, runs `nginx -t`, and reloads nginx only after validation.

To switch back to the existing Let’s Encrypt certificate, use **Use existing Let’s Encrypt certificate** and confirm the action. The current host’s certificate is validated before nginx is reloaded. Every certificate action is recorded in the security and activity logs.

## Docker installation

For a host that already has Docker Engine and Compose v2, select the same certificate provider explicitly:

```bash
sudo bash deploy/unified-install.sh \
  --mode docker \
  --project-dir /srv/readypackets \
  --domain myportal.example.com \
  --email operations@example.com \
  --tls-provider letsencrypt
```

For Cloudflare Origin CA in Docker mode, pass the same protected certificate/key file options used for native installation. Docker mode writes host-nginx TLS files but does not install the native root certificate-control daemon; manage later rotation through the host operator’s controlled deployment process.

For a new VPS where the script may install Docker first:

```bash
sudo bash deploy/unified-install.sh \
  --mode docker-bootstrap \
  --project-dir /srv/readypackets \
  --domain myportal.example.com \
  --email operations@example.com
```

The Docker installer creates a mode-0600 `.env` file only when one does not already exist. It uses container-only MySQL networking, loopback-only application publishing, rootless application execution, a read-only application filesystem, dropped Linux capabilities, and a host nginx TLS proxy. Back up the generated `.env` through an encrypted, offline operational procedure before accepting customer data.

## Post-installation verification

Verify the live certificate before inviting users. For a Cloudflare-proxied hostname, the public result represents Cloudflare’s edge certificate; also verify the protected origin configuration from the host.

```bash
curl -fsS https://myportal.example.com/api/health
openssl s_client -connect myportal.example.com:443 -servername myportal.example.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
sudo nginx -t
sudo systemctl status readypackets nginx readypackets-certificate-control  # native mode
```

For Cloudflare Origin CA, confirm in Cloudflare that the record remains proxied and SSL/TLS mode remains **Full (strict)**. A visitor will not directly trust an Origin CA certificate if Cloudflare proxying is disabled. [4] [5]


```bash
curl -fsS https://myportal.example.com/api/health
sudo systemctl status readypackets nginx mysql       # native mode
sudo systemctl list-timers readypackets-backup.timer # native mode
cd /srv/readypackets && docker compose ps            # Docker mode
```

Create the first administrator using the documented console procedure when no initial administrator exists. Administrators must enrol MFA before privileged access is granted. Complete configuration of Microsoft Graph, Stripe, email, and external backup remotes only from the administrative interface or protected host configuration.

## Safe deployment and rollback

Native installations include **Admin → Platform updates**, which can scan an approved private GitHub repository, show changed paths and risk indicators, require separate approval and upgrade phrases, create a pre-upgrade application/database snapshot, health-check the upgrade, and retain a rollback action. Review [Upgrade and Rollback Guide](UPGRADE_AND_ROLLBACK.md) before using it.

Never deploy by copying application assets over a live instance without preserving the prior build and database state. Avoid changing `DATA_ENCRYPTION_KEY` or `EMAIL_INDEX_KEY`: the first protects encrypted customer data, while the latter indexes account emails; changing either without a managed migration can make existing records unavailable.

### Approved auto-deployment wrapper

Native installations install `/usr/local/sbin/readypackets-auto-deploy-approved` with root-only permissions. It delegates only an already reviewed immutable commit to the protected update helper; it does **not** pull and deploy the moving tip of a branch. The wrapper requires the approved run ID, a reviewed 40-character SHA, `READYPACKETS_APPROVED_DEPLOYMENT=yes`, and a GitHub PAT supplied through standard input only. Consult [Approved Auto-Deployment](AUTO_DEPLOYMENT.md) for the execution, verification, and rollback process.

## References

[1]: https://docs.docker.com/engine/install/ "Docker Engine installation documentation"
[2]: https://eff-certbot.readthedocs.io/en/stable/using.html "Certbot user guide"
[3]: https://dev.mysql.com/doc/refman/8.0/en/ "MySQL 8.0 Reference Manual"
[4]: https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/ "Cloudflare Origin CA"
[5]: https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/ "Cloudflare Full (strict)"
