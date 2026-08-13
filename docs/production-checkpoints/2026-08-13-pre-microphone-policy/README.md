# Pre-microphone-policy production checkpoint

This checkpoint preserves the ReadyPackets production deployment state before applying the microphone Permissions-Policy correction. It is intentionally version-controlled so that the deployed source commit, non-secret infrastructure configuration, and build artifact fingerprints can be recovered and reviewed.

| File | Contents |
| --- | --- |
| `production-state.txt` | Deployed release commit, service status, and SHA-256 fingerprints for the deployed server/client entry artifacts. |
| `deployed-artifact-metadata.txt` | Size and modification metadata for the deployed server bundle and client shell. |
| `nginx-readypackets.conf` | Non-secret active nginx virtual-host configuration. |
| `readypackets.service.txt` | Non-secret systemd unit and drop-in configuration. |
| `portal-env-variable-names.txt` | Environment-variable names only; all values are intentionally excluded. |

## Secret-safety boundary

This checkpoint deliberately excludes `/etc/readypackets/portal.env` values, database contents, session data, customer uploads, encryption keys, passwords, API credentials, and third-party tokens. Those materials are protected in the production host’s root-owned backup system and must not be committed to GitHub, even in a private repository.

**Checkpoint source baseline:** `42817d66e0ba2f34687f1dc40edcf871ec9bb54c`
**Checkpoint purpose:** Preserve the configuration and source baseline before the microphone policy experiment.
