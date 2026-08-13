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

## Native VPS installation

Run the unified installer from the repository root.

```bash
sudo bash deploy/unified-install.sh \
  --mode native \
  --domain myportal.example.com \
  --email operations@example.com
```

The native installer generates and preserves application encryption keys in `/etc/readypackets/portal.env`, creates the MySQL database, installs the `readypackets` service on loopback port 3000, configures nginx and TLS, starts protected backups, and verifies readiness. Re-running the installer is intended to be idempotent; it preserves existing secrets unless a reset was explicitly performed.

## Docker installation

For a host that already has Docker Engine and Compose v2:

```bash
sudo bash deploy/unified-install.sh \
  --mode docker \
  --project-dir /srv/readypackets \
  --domain myportal.example.com \
  --email operations@example.com
```

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
