# ReadyPackets Encrypted Configuration Restore

## Purpose

The **Restore exported configuration** control in **Admin → Backup management** imports a passphrase-encrypted `.rpconfig` configuration bundle that was previously created through the ReadyPackets portal. It is intended for controlled replacement-server migrations and recovery of platform settings.

The browser restore workflow is deliberately **secret-free**. It restores supported configuration tables while preserving the target server's encryption keys, session secret, database connection credentials, and integration secrets. This prevents a settings migration from silently orphaning encrypted customer fields or pointing a replacement server at the source server's database.

## Administrator workflow

Use a fully authenticated administrator account with multi-factor authentication enabled. Open **Backup management**, select **Restore configuration**, choose a single `.rpconfig` file up to 5 MB, and enter the passphrase used to create that export. Select **Verify configuration bundle**.

Before changing any settings, ReadyPackets transfers the encrypted file to a protected staging directory, verifies its HMAC and per-file checksums under the root-owned backup-control helper, and displays a non-secret manifest summary. The preflight token is bound to the administrator account and expires after ten minutes.

To apply the verified bundle, enter the exact phrase below:

```text
RESTORE CONFIGURATION
```

The helper applies the configuration tables, removes the uploaded encrypted bundle, and schedules a portal restart after a short delay. The page reloads automatically after approximately fifteen seconds.

## Scope

| Restored from the browser `.rpconfig` bundle | Preserved on the target server |
|---|---|
| Feature flags and rate-limit configuration | `DATA_ENCRYPTION_KEY` and `EMAIL_INDEX_KEY` |
| Registration fields | Session secret and database connection credentials |
| Email templates and automations | SMTP, Stripe, Microsoft Graph, SAML, and other integration secrets |
| Webhook endpoint configuration | Customer accounts, customer data, orders, files, recordings, sessions, and logs |
| Catalog, public content, policies, and supported application settings | Target-server storage and operating-system configuration |

The separate **Private GitHub configuration vault** is the explicit break-glass secret-recovery workflow. It is intentionally not accepted by the in-portal restore control because it can contain source-server secrets and must be restored only during a controlled new-server installation.

## Security controls

The upload endpoint requires an active administrator session, completed MFA, same-origin CSRF validation, one encrypted file only, a 5 MB file limit, a passphrase without line breaks, and an administrator-bound preflight token. The portal service may create a random upload filename in a root-owned, non-listable staging directory but cannot read uploaded content directly. Only the fixed-action root backup-control helper can inspect or apply the bundle.

The restore request accepts only a generated `rpconfig-import-<32 lowercase hex characters>.rpconfig` filename. The root helper verifies the encrypted envelope, HMAC, decrypted checksums, and manifest before importing. Every preflight, blocked attempt, and applied restore is recorded in the activity and security audit trail. The protected helper deletes the staged bundle after an apply attempt and removes expired preflight uploads.

## Recovery guidance

If verification fails, do not retry with an altered bundle. Confirm that the file was downloaded completely and that the correct passphrase is being used. If a restore has been scheduled, wait for the portal to restart before reloading the page. Use the public health endpoint only after the portal is reachable again:

```bash
curl -fsS https://myportal.readypackets.com/api/health
```

For a full application backup, use the separate local backup archive restore function. A full backup replaces database and storage state and has a distinct typed-confirmation workflow.

## Deployment prerequisites

The native installer creates the protected staging directory with `root:readypackets` ownership and mode `0730`:

```text
/var/lib/readypackets/storage/config-restore-imports
```

The root-owned backup-control daemon must be active. Confirm its status with:

```bash
sudo systemctl is-active readypackets-backup-control
```

No secret, passphrase, configuration content, or uploaded bundle is written to browser-visible logs, application logs, Git, or the session record.
