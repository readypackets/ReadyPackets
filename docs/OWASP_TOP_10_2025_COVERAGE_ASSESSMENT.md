# ReadyPackets Portal — OWASP Top 10 2025 Coverage Assessment

**Assessment date:** 2026-08-12  
**Scope:** Current ReadyPackets source, production deployment configuration, live security verification, automated tests, and production dependency audit.  
**Framework:** OWASP Top 10:2025.

## Executive conclusion

ReadyPackets has **substantial implemented protection** across all ten OWASP Top 10 2025 categories. Its strongest evidence is server-side role and ownership enforcement, server-side session/MFA controls, CSRF and origin validation, nonce-based CSP, encrypted sensitive fields, rate limiting, structured audit events, input validation, restricted upload processing, production host hardening, and a clean production dependency audit.

> This is **not** a claim that the portal is invulnerable or “OWASP certified.” OWASP Top 10 is an awareness framework, and the assessment is not a substitute for an independent penetration test, continuous dependency monitoring, third-party configuration review, or authenticated end-to-end regression testing.[1]

The live verifier completed **46/46 checks** after the login repair. Production dependency audit reports **no known vulnerabilities** at the configured audit threshold. These are meaningful point-in-time signals, not a permanent security guarantee.

## Coverage summary

| OWASP Top 10:2025 category | Current coverage | Evidence and safeguards | Remaining assurance work |
|---|---|---|---|
| **A01 Broken Access Control** | Strong, continuing assurance needed | Shared server-side public/session/protected/staff/admin procedure guards; ownership-aware routers; opaque public customer references; forced MFA for administrators; order-sharing RBAC; CSRF/origin validation; API authorization probes in the live verifier. | Add authenticated browser authorization regression tests for every customer/admin role and shared-order permission combination. |
| **A02 Security Misconfiguration** | Strong, continuing operational review needed | TLS through Cloudflare/nginx; application/MySQL loopback binding; only 22/80/443 exposed; nonce CSP, security headers, Host validation, no server fingerprinting, systemd isolation, least-privilege service account, root-owned secrets, installer/deployment guides. | Periodically review Cloudflare, nginx, systemd, MySQL, firewall, OS patch, and external-storage settings; keep changes under reviewed deployment control. |
| **A03 Software Supply Chain Failures** | Moderate to strong | `pnpm-lock.yaml`, private GitHub source history, controlled platform update scan/approval/rollback, production dependency audit with no known findings, code-review remediation of prior vulnerable packages. | Automate recurring dependency/advisory scans, generate an SBOM, protect repository branches, and maintain an explicit OS/runtime patch cadence.[4] |
| **A04 Cryptographic Failures** | Strong for application-sensitive fields; host scope remains partial | HTTPS, secure cookies, AES-256-GCM authenticated field encryption, HMAC blind email index, encrypted integrations, root-protected secret environment, secret-free standard configuration exports. | Complete encrypted-volume or provider-managed disk encryption planning and a recovery/restore drill; retain off-host encrypted backup copies. |
| **A05 Injection** | Strong, continuing test coverage needed | Typed tRPC inputs with Zod validation, Drizzle query builder, safe React Markdown rendering replacing direct HTML policy previews, validated file types/limits, path restrictions, safe URL validation for campaign links and restricted helper arguments. | Maintain dynamic input testing for SQL/NoSQL/template/path/SSRF injection when adding integrations, query filters, or file handlers. |
| **A06 Insecure Design** | Moderate to strong | Explicit threat-oriented controls: default-deny guards, policy acceptance gates, MFA, maintenance/login/registration controls, privacy-preserving campaign metrics, configured retention/soft-delete workflows, and purpose-limited privileged helpers. | Maintain threat modeling and abuse-case review for new payment, SAML, webhook, cloud-sync, and backup capabilities. |
| **A07 Authentication Failures** | Strong, continuing end-to-end validation needed | Argon2 password handling with legacy rehash, login lockout and rate limiting, server-side sessions, session revocation, MFA for administrators, secure magic-link constraints, SAML flow controls, CSRF token renewal behavior, and password-reset flows. | Conduct controlled live tests for magic links, SAML role mapping, MFA recovery, and Stripe/Graph account configuration; retain phishing-resistant MFA as a future improvement. |
| **A08 Software or Data Integrity Failures** | Moderate to strong | Migration versioning, tested builds, controlled update scan/approval/rollback workflow, root-owned fixed-path backup/update helpers, signed webhook validation where applicable, and activity/audit records. | Add artifact provenance/signing, CI integrity controls, SBOM generation, and verified backup restore exercises. |
| **A09 Security Logging and Alerting Failures** | Strong, continuing operational tuning needed | Security and activity events, searchable security center, IP block/ban controls, delivery logs/retry controls, system alerts, service journals, backup job status, and live health/security verification. | Define alert triage owners/SLOs, periodically test alert escalation, and resolve/retain evidence for every material alert. |
| **A10 Mishandling of Exceptional Conditions** | Strong | Production-safe tRPC error formatting, stack suppression, custom error logging/alerts, JSON API error behavior, rate-limit handling, health endpoints, database migration checks, rollback artifacts, and the repaired tRPC-formatted CSRF rejection path. | Add broader end-to-end negative-path testing and monitor new errors through the Security Centre. |

## Verified production checks

| Check | Result |
|---|---|
| TypeScript validation | Passed with 0 errors during the latest repair build. |
| Automated tests | 143 passing. |
| Production dependency audit | No known vulnerabilities found. |
| Live security verifier | 46/46 passed after the login repair. |
| Anonymous authorization probes | Protected order, file, ticket, account, admin-dashboard, security-settings, and API-key routes were denied. |
| Host/error/static-file probes | Unknown host refusal; no stack trace exposure; static traversal and dotfile access refused. |
| CSRF/origin probes | Missing, mismatched, and cross-origin mutation attempts rejected; a matching request reached the handler. |
| Login abuse handling | Rate limiting and `Retry-After` behavior verified. |

## Residual risks and priority actions

The primary residual risks are **assurance and configuration risks**, not an identified unprotected Top 10 category. Configure and test Stripe signed webhooks before enabling live payments, run a real least-privilege SharePoint sync test, configure external backup remotes, and perform an authorized restore drill. The host-volume encryption decision remains open even though sensitive application fields are already encrypted. The current dependency audit is clean, but recurring composition analysis and an SBOM are required for sustained supply-chain assurance.

The customer/admin access model, SAML provisioning, magic links/MFA, payment handling, upload handling, and shared-order RBAC need authenticated browser regression coverage. An independent penetration test remains the appropriate next assurance step before making a compliance or assurance representation to third parties.

## Backup-control repair note

The Security Centre alerts shown on 2026-08-12 were caused by a deployment conflict, not an external compromise: `NoNewPrivileges=true` prevented the least-privileged `readypackets` service from invoking its already allowlisted root-owned backup helper. The systemd unit now sets `NoNewPrivileges=false` **only because** the application needs narrowly scoped `sudo` elevation for root-owned, fixed-path, argument-validating backup and platform-update helpers. The empty capability set, filesystem isolation, system-call restrictions, root-owned helper files, and narrow sudoers rules remain active.

A controlled backup was then started through the service account and completed successfully. The resulting archive was written to the root-owned backup location, and the nightly timer remains enabled. The release must retain the narrow sudoers rules and must never allow arbitrary commands, paths, or shell fragments.

## References

[1]: https://owasp.org/Top10/2025/en/ "OWASP Top 10:2025"
[2]: https://owasp.org/Top10/2025/A01_2025-Broken_Access_Control/ "OWASP A01:2025 Broken Access Control"
[3]: https://owasp.org/Top10/2025/A02_2025-Security_Misconfiguration/ "OWASP A02:2025 Security Misconfiguration"
[4]: https://owasp.org/Top10/2025/A03_2025-Software_Supply_Chain_Failures/ "OWASP A03:2025 Software Supply Chain Failures"
