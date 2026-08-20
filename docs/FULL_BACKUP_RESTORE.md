# Full Backup Restore

## Purpose

The **Admin → Backup management** page can now preflight and restore a full ReadyPackets archive. A full archive has the form `readypackets-<timestamp>.tar.gz` and is created by the protected backup service.

> **Warning:** A full restore replaces the target database and uploaded-file storage with the selected archive. It is intended for disaster recovery or a controlled self-hosted environment migration, not for selectively restoring one record.

## Required archive contents

A valid archive contains the following root-level members:

| Member | Purpose |
|---|---|
| `database.sql` | MySQL application database dump |
| `storage.tar` | Uploaded and generated ReadyPackets files |
| `portal.env` | Environment configuration including encryption and blind-index keys |
| `MANIFEST.txt` | Backup identity and content summary |
| `SHA256SUMS` | Integrity checks for the archive members |

Database-only archives cannot be restored through the portal because they do not provide the storage and key material required for a consistent platform recovery.

## Administrator workflow

1. Open **Admin → Backup management**.
2. In **Restore uploaded full backup**, choose a local `readypackets-*.tar.gz` archive. The upload limit is 50 MB.
3. Select **Verify backup archive**. The server checks the name, member allowlist, archive structure, checksum file, manifest, and database payload without restoring anything.
4. Review the preflight summary, including archive name, database dump size, storage inclusion, and schema version.
5. Type the exact phrase `RESTORE FULL BACKUP`.
6. Select **Restore verified backup**.
7. Wait for the portal restart and sign in again. Existing sessions are invalidated by design.

The verified preflight is bound to the signed-in administrator and expires after ten minutes. Uploading a different file, changing the filename, or retrying after expiry requires a new verification.

## Safeguards

The restore interface is administrator-only and is protected by MFA-backed session authorization, CSRF validation, rate limiting, a 50 MB upload limit, strict archive member checks, path/link rejection, checksums, typed confirmation, audit records, and a root-controlled staging directory. The portal application account cannot choose arbitrary root paths or shell commands; it can request only fixed helper actions through the backup-control socket.

The restore helper creates a pre-restore snapshot before replacing the target data. Rollback assets for application changes remain separate from data backups.

## Migration notes

A full backup is sufficient for a like-for-like self-hosted migration only when the target platform uses a compatible ReadyPackets release and the target operator deliberately accepts importing the archive's `portal.env` keys and database. The source and target should be placed in maintenance mode during a final migration cutover to prevent data divergence.

A standard `.rpconfig` configuration export is different: it carries secret-free policy, catalog, and setting data, and does **not** replace customer data, orders, uploads, encryption keys, or environment credentials. Use `.rpconfig` for configuration replication; use a verified full archive for complete platform recovery or a controlled lift-and-shift.

## Audit and retention

Successful and blocked restore attempts are recorded in the activity and security logs. Keep full archives in root-protected storage or encrypted external backup destinations. An archive is equivalent to the full customer database because it can contain application encryption keys.
