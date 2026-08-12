# ReadyPackets Upgrade and Rollback Guide

**Version:** 2026-08-12  
**Audience:** Platform administrators

## Purpose

The ReadyPackets **Platform updates** workspace provides a controlled native-VPS upgrade path for private GitHub repositories. It separates repository scanning, human review, approval, installation, and rollback. It is intentionally not an unattended auto-update mechanism.

> Each installation can change the application and database. A pre-upgrade snapshot is created before deployment, and rollback restores both the application files and the database snapshot. Therefore, data created after the upgrade may be lost during rollback.

## Configure the repository connection

Open **Admin → Platform updates**. Enter the repository as `owner/repository`, select the source branch, and provide a GitHub fine-grained personal access token.

The token should be restricted to the single repository and have only the minimum read-only repository contents access needed for scans and release checkout. ReadyPackets encrypts the token using AES-256-GCM before storage, never returns it through the browser API, never includes it in standard configuration exports, and passes it to the root-owned update helper only through process standard input. Replace the token by entering a new value; leaving the token field blank preserves the encrypted stored value.

## Scan and review changes

Select **Scan for changes**. The scan clones the configured private repository into a temporary server directory and records the target commit, changed paths, basic insertion/deletion counts, and risk indicators. Risk indicators flag changes to authentication/security paths, deployment material, dependency manifests, migrations, Docker files, and other production-control paths.

Open **Review** for the scan before approving it. The scan operation does not modify production.

## Approve and execute an upgrade

The two-step approval process is deliberate.

| Stage | Required action | Purpose |
|---|---|---|
| **Approve** | Type `APPROVE <12-character target commit>` | Records a specific reviewed commit as approved. |
| **Upgrade** | Type `UPGRADE <12-character target commit>` | Starts the root-owned update helper for that approved commit. |

The helper turns on the existing maintenance gate, creates a root-owned application and database snapshot, checks out only the approved commit, performs dependency installation/build/migration/deployment steps, restarts the service, and runs a health check. The system retains the run output and snapshot reference in the update history.

Do not update during an active customer submission, scheduled backup, or other maintenance window. Configure a maintenance message and login/registration policy in **Admin → System** before starting a major upgrade.

## Rollback

A completed run exposes **Rollback**. Type `ROLLBACK <run ID>` to confirm. Rollback restores the recorded pre-upgrade snapshot and restarts the service. It is a recovery operation, not a substitute for release testing.

Because database restoration is included, any customer data written after the upgrade’s snapshot is replaced. Before rolling back, capture the business reason, assess recent order activity, and notify users when appropriate.

## Operational controls

| Control | Behavior |
|---|---|
| **Root-owned helper** | `/usr/local/sbin/readypackets-platform-update` performs only allowlisted status, apply, and rollback operations. |
| **Sudo allowlist** | The application service can invoke only that helper through a dedicated sudoers rule. It cannot run arbitrary shell commands. |
| **Run history** | Scans, approvals, executions, errors, and rollbacks are retained in the platform upgrade history and activity log. |
| **Rollback material** | Snapshots are root-owned under protected backup storage and are not downloadable through the public site. |
| **Credential handling** | The GitHub token is encrypted at rest and excluded from ordinary configuration exports. |

## Emergency procedure

If the application is unhealthy after an upgrade and the administrator interface is unavailable, use a root console to inspect `journalctl -u readypackets` and invoke the restricted helper only with a documented run ID. If recovery cannot be established, use the protected backup/restore procedure rather than making untracked changes on the host.

## References

[1]: https://docs.github.com/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token "GitHub personal access token guidance"
[2]: https://docs.github.com/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches "GitHub protected branch guidance"
