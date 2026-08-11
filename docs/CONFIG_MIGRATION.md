# Encrypted Configuration Migration

ReadyPackets includes `deploy/config-migration.sh` for moving **application settings, integration configuration, and required secrets** to a replacement installation. It produces an encrypted `.rpconfig` file suitable for a controlled server migration.

> **This bundle is highly sensitive.** It includes the application environment file, database credentials, `DATA_ENCRYPTION_KEY`, `EMAIL_INDEX_KEY`, and encrypted integration configuration. Anyone holding both the bundle and its passphrase can restore the platform’s configuration and decrypt protected fields. Store the bundle and passphrase separately, preferably in different offline or encrypted secret-management systems.

## Scope

| Included | Excluded |
|---|---|
| `portal.env`, including application and encryption keys | Customer records and encrypted customer fields |
| Site settings and feature flags | Orders, order content, payment records, and intake submissions |
| Email, webhook, SAML, SharePoint, and outbound-connection configuration | Uploaded files, SharePoint files, sessions, audit logs, and backups |
| Product, plan, policy, registration, and rate-limit configuration | Runtime logs and operational history |

The source and destination installation must run a compatible ReadyPackets schema. Run the standard installer on the replacement server first so its database and service account exist.

## Export from the current server

SSH to the current server and run:

```bash
sudo bash /opt/readypackets/deploy/config-migration.sh export \
  --output /var/backups/readypackets/readypackets-config.rpconfig
```

The command prompts for a passphrase twice. Use a unique passphrase of at least 16 characters. The output file is created with owner-only permissions.

For controlled automation, create a root-only passphrase file:

```bash
sudo install -m 600 /dev/null /root/readypackets-migration.pass
sudo sh -c 'printf "%s\n" "YOUR-UNIQUE-PASSPHRASE" > /root/readypackets-migration.pass'
sudo bash /opt/readypackets/deploy/config-migration.sh export \
  --output /var/backups/readypackets/readypackets-config.rpconfig \
  --passphrase-file /root/readypackets-migration.pass
```

Copy the encrypted bundle through a secure transfer channel. Do **not** copy the passphrase with it.

## Inspect before restore

On the destination host, verify the bundle before changing anything:

```bash
sudo bash /opt/readypackets/deploy/config-migration.sh inspect \
  --input /secure-transfer/readypackets-config.rpconfig
```

The command verifies the passphrase, HMAC integrity tag, and embedded checksums, then prints only the non-secret manifest.

## Import to a new installation

First, complete the normal ReadyPackets installation on the destination server. Then copy the `.rpconfig` file securely and run a dry run:

```bash
sudo bash /opt/readypackets/deploy/config-migration.sh import \
  --input /secure-transfer/readypackets-config.rpconfig \
  --replace-config --apply-env --dry-run
```

If the dry run succeeds, perform the actual import:

```bash
sudo bash /opt/readypackets/deploy/config-migration.sh import \
  --input /secure-transfer/readypackets-config.rpconfig \
  --replace-config --apply-env
```

The import requires the exact confirmation phrase `IMPORT READY PACKETS CONFIG`. It first preserves the destination environment file as a timestamped `pre-import` backup, restores the source environment, imports only the configuration tables, and restarts the ReadyPackets service.

## Post-import checklist

Review configuration that is intentionally environment-specific before enabling production traffic.

| Check | Reason |
|---|---|
| `APP_URL`, domain, and TLS | The replacement host may use a different domain or certificate path. |
| Microsoft Graph sender mailbox and Azure consent | The destination network and application registration must permit the sender. |
| SharePoint site, drive, and root folder | Confirm the new host can reach the intended tenant and destination library. |
| P101/P201 and other webhook URLs | Confirm receivers accept traffic from the new host and HMAC secrets remain valid. |
| Cloud backup credentials and retention | Reconfigure any machine-specific storage paths or cloud egress controls. |
| Data and file restore | This configuration bundle does not contain customers, orders, files, or database content. Restore those separately from the standard encrypted backup archive. |

## Security model

The bundle has two protection layers. The tar payload is encrypted with AES-256-CBC using a PBKDF2-HMAC-SHA512 derived key, and the encrypted payload is authenticated with an independent HMAC-SHA256 key derived from the same passphrase using a separate derivation label. The bundle also contains SHA-256 checksums of every internal payload file. An incorrect passphrase or modified bundle fails before import occurs.

Delete temporary copies after a successful migration and rotate any third-party credentials if the bundle was ever exposed outside approved secret storage.
