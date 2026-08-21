# Native Mobile Threat Model

**Scope.** This document covers the ReadyPackets native iOS and Android applications, their universal/app-link OAuth return path, and the `/api/mobile/v1` server boundary. The mobile application is an **untrusted client**. The self-hosted ReadyPackets server remains authoritative for identity, authorization, workflow state, file governance, payment state, encryption, and audit records.

| Threat | Control and verification evidence | Residual-risk owner |
|---|---|---|
| Stolen device or refresh token | Refresh token only in Keychain/Keystore; access token memory-only; biometric re-entry is local convenience only; logout wipes local state; user can revoke device session. Verify on physical devices and with remote device revocation. | Product security owner |
| Refresh-token reuse | Refresh tokens are SHA-256 hashed server-side and tracked as a token family. Reuse of a rotated token revokes the entire family and forces browser reauthentication. Verify concurrent refresh and replay tests. | Backend owner |
| OAuth mix-up or deep-link interception | PKCE S256, high-entropy state, registered HTTPS callback allowlist, short-lived one-time code, claimed universal/app links. Verify wrong state, wrong redirect, custom-scheme, and stale-code cases. | Mobile owner |
| Session fixation or MFA bypass | Browser session is validated by the existing ReadyPackets MFA and session controls before an authorization code exists. The native biometric gate is never server MFA. Verify local/SAML/MFA return paths. | Identity owner |
| BOLA/BFLA | Every mobile request resolves bearer subject, active device session, status, role, and then invokes existing order authorization/services. Verify cross-user, staff, and administrator request matrices. | Backend owner |
| Replayed mutation | User-bound idempotency record stores request hash and response replay. Conflicting reuse is rejected. Verify same-key/same-body and same-key/different-body behavior. | Backend owner |
| Sensitive local cache or notifications | No default document cache; app-private cleanup at logout; generic push payloads only; no tokens/PII in logs, clipboard, or notification text. Verify static source scans and device inspection. | Mobile owner |
| Malicious upload | Native app obtains a server-authorized session only. The server remains responsible for phase locks, size/type/magic-byte checks, malware hooks, and finalization. Verify altered content type, expired grant, and phase lock tests. | Backend owner |
| Rooted or jailbroken device | Treat signals as policy-approved risk telemetry and optional step-up input, never as an insecure sole block. Verify telemetry redaction. | Product security owner |
| Compromised dependency or CI | Protected branches, secret scanning, SBOM/dependency review, signing material outside source control, and two-person release approval. Verify release checklist before store distribution. | Release owner |

No native release may advance without documented verification evidence for each row, a named residual-risk owner, and a signed review of all privacy/data-disclosure claims.
