# ReadyPackets Factory Reset and Fresh Installation Guide

**Version:** 2026-08-12  
**Audience:** Root host operators only

> **Factory reset permanently destroys active ReadyPackets customer, order, file, configuration, secret, and database data. This operation is intentionally unavailable from the web interface and requires root-console access plus an exact typed confirmation.**

## When to use it

Use factory reset only when permanently retiring an instance, preparing a clean demonstration system, or rebuilding a compromised non-production system after preserving required evidence. It is not an upgrade, backup restore, password-reset, or routine troubleshooting tool.

Before starting, verify contractual retention obligations, export any required audit material, preserve a protected backup when needed, and notify affected users. A reset is irreversible unless a separate backup exists.

## Native VPS reset

From the reviewed ReadyPackets source directory, run:

```bash
sudo bash deploy/factory-reset.sh \
  --mode native \
  --domain myportal.example.com \
  --confirm 'FACTORY RESET myportal.example.com'
```

The script stops and disables ReadyPackets services and backup timers, removes service and nginx configuration, drops the `readypackets` database and application database users, deletes active storage and generated configuration/secrets, removes the application and backup paths, and removes the service account. It does not uninstall the operating system, MySQL, Node, nginx, Docker, or unrelated host packages.

## Docker reset

For a Docker deployment:

```bash
sudo bash deploy/factory-reset.sh \
  --mode docker \
  --project-dir /srv/readypackets \
  --domain myportal.example.com \
  --confirm 'FACTORY RESET myportal.example.com'
```

The reset stops the project stack, removes named Docker volumes, deletes the generated project `.env`, removes local container storage, and removes the application database. It does not uninstall Docker Engine or delete unrelated containers or volumes.

## Preserve operational evidence

To retain protected backup archives and a root-owned reset manifest while removing the active platform, add `--preserve-evidence`.

```bash
sudo bash deploy/factory-reset.sh \
  --mode native \
  --domain myportal.example.com \
  --preserve-evidence \
  --confirm 'FACTORY RESET myportal.example.com'
```

This option does not preserve the active application data. It retains evidence and backup material under protected host paths so an authorized operator can satisfy retention or incident-response requirements.

## Reinstall after reset

After the reset, deploy a new instance using the unified installer:

```bash
sudo bash deploy/unified-install.sh \
  --mode native \
  --domain myportal.example.com \
  --email operations@example.com
```

The new instance receives new encryption and session keys. Do not reuse a prior encryption key unless you are deliberately restoring compatible encrypted data from a protected backup.

## Safety checklist

| Confirm before reset | Why it matters |
|---|---|
| Required legal or business retention has been reviewed | Reset removes active records permanently. |
| The correct hostname and mode are supplied | The confirmation phrase binds the destructive action to the intended instance. |
| A valid recovery backup has been verified if data must survive | A reset has no undo operation. |
| A new administrator/MFA plan exists | Fresh installations require secure administrator provisioning. |
| DNS and TLS plans exist for reinstall | A fresh deployment may need certificate issuance and DNS propagation. |
