# Full Backup and Recovery

## Purpose

A ReadyPackets **full backup** is a root-created archive named `readypackets-<timestamp>.tar.gz`. It is the recovery artifact for a complete self-hosted portal, not a selective-record export. A standard restore replaces the target database and uploaded-file storage with the archive contents.

> **Security classification:** A full archive contains the database and application encryption keys. Treat it as equivalent to an unencrypted copy of the entire platform. Store it in root-only local storage or an encrypted, access-controlled off-site destination. Keep the archive and its encryption/recovery credentials separate.

## Archive contents

| Archive member | Included | Recovery purpose |
|---|---:|---|
| `database.sql` | Always | Entire MySQL application database: user accounts, MFA recovery data, orders, messages, audit records, product/catalogue data, workflow definitions, policies, integration configuration, and application settings. |
| `storage.tar` | Full backups | Uploaded and generated order files, audio recordings, customer and staff attachments, and generated artifacts under ReadyPackets storage. |
| `portal.env` | Full backups | Application secrets and configuration, including session signing, AES-256-GCM data encryption, email blind-index, SMTP, payment, SAML, storage-provider, and other environment-backed settings. |
| `platform-runtime.tar` | When backup synchronization is configured | Root-owned rclone backup-sync configuration and destination mapping. TLS private keys are deliberately excluded. |
| `MANIFEST.txt` | Always | Creation time, source host, database name, schema version, included components, and warnings. |
| `SHA256SUMS` | Always | SHA-256 integrity verification for every archive member. |

A **database-only** archive intentionally excludes files and environment material. It is useful for a controlled database test but is not a complete disaster-recovery artifact.

## What is restored by each mode

| Recovery mode | Database and accounts | Order files | Application settings | Platform secrets | Backup cloud credentials | Target hostname and TLS |
|---|---:|---:|---:|---:|---:|---:|
| **Portal full restore** | Yes | Yes | Database-backed settings | Preserved on target | Preserved on target | Preserved on target |
| **Root-console replacement-server restore** with `--restore-platform-secrets` | Yes | Yes | Yes | Restored from archive | Restored when `platform-runtime.tar` is present | Preserved on target; issue a certificate for the target hostname |
| **`.rpconfig` configuration restore** | No | No | Secret-free configuration only | Preserved on target | Preserved on target | Preserved on target |

The administrator portal defaults to the first mode. This prevents a browser upload from automatically replacing encryption keys or cloud-backup credentials. A complete replacement-server recovery is intentionally available only at the root console with an explicit flag.

## Administrator portal restore

Use this method to recover a server from a trusted archive while retaining the target server’s environment credentials and TLS material.

1. Open **Admin → Backup management**.
2. Select either a listed archive’s **Restore** action or **Upload and restore backup file**.
3. Run the archive preflight. The portal verifies the gzip archive, allowlisted members, link/path safety, manifest, checksums, and database payload before any data changes.
4. Review the archive summary and type the exact phrase `RESTORE BACKUP`.
5. Start recovery and wait for the protected restore job to restart ReadyPackets.
6. Sign in again after the readiness status is successful. Existing sessions are invalidated by the restored database state.

Preflight is bound to the fully authenticated administrator and expires after ten minutes. Full-backup uploads are limited to 512 MB; larger archives should be recovered through the root-console procedure.

## Replacement-server recovery with secrets

Use this method only for a controlled lift-and-shift or disaster recovery to a new self-hosted host. Perform it as root after the latest ReadyPackets release is installed and its initial service environment exists.

```bash
sudo /opt/readypackets/deploy/restore.sh \
  --archive /var/backups/readypackets/readypackets-YYYYMMDDTHHMMSSZ.tar.gz \
  --yes \
  --restore-platform-secrets
```

The command first validates archive structure and checksums, creates a pre-restore database snapshot, restores the database and files, restores archived application/integration secrets while preserving target database connection, hostname, network, storage-path, Cloudflare, and TLS settings, restores root-owned backup-sync runtime if available, reruns forward-only migrations and the database schema contract, and starts the service only after readiness succeeds.

The prior target environment is retained as a root-only file beside `portal.env` with a `.pre-full-restore-<timestamp>` suffix. The target must issue or install a valid certificate for its own public hostname; Cloudflare Origin CA material is intentionally never included in the backup archive.

## Fresh VPS installation assurance

The supported native installer builds a fresh migration runner from the released source, applies all forward-only migrations before starting ReadyPackets, then verifies the critical schema contract. The contract includes Phase Kickoff configuration, phase jobs, webhook deliveries, email automations, system backups, outbound connections, and outbound call logs. If an installation is incomplete, the installer fails before the portal starts and names the missing table or column rather than exposing a partially functional administrator interface.

For a new VPS, install the desired reviewed release first, confirm the installer reports the database schema contract as verified, then perform the explicit replacement-server recovery above if complete secret continuity is required.

## Safeguards and operations

The portal restore flow is administrator-only and requires an MFA-backed active session, CSRF validation, typed confirmation, strict archive-member checks, path/link rejection, checksums, protected staging, audit records, and a narrowly scoped root backup-control helper. The helper accepts only fixed archive names and action types; it cannot execute arbitrary user-controlled commands.

Run a restore drill periodically against an isolated, nonproduction database and storage location. A backup that has not been verified and tested cannot be relied on for disaster recovery.

A full archive should be encrypted before it is copied off-host. ReadyPackets can create encrypted archives through the root backup procedure when `age` or GPG recovery material is configured. Cloud destinations should also use provider-side encryption, versioning or immutability, and separate least-privilege credentials.
