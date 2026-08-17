# ReadyPackets — Application Security Assessment
## OWASP ASVS 5.0, OWASP SAMM 2.0, and NIST SSDF SP 800-218 Mapping

**Assessment date:** August 17, 2026  
**Environment assessed:** ReadyPackets source, self-hosted production configuration record, and `https://myportal.readypackets.com`  
**Assessment method:** Static source/configuration review, dependency analysis, live unauthenticated header/cookie checks, deployment evidence review, and targeted session-recovery validation

> **Overall security posture:** **68.7 / 100 — managed risk, not ready for an unrestricted public launch until operational-assurance gaps are closed.** Technical application safeguards are materially stronger than the current evidence for testing, recovery validation, edge-origin enforcement, and secure release assurance.

## Executive conclusion

ReadyPackets demonstrates deliberate secure-application engineering rather than superficial security controls. The assessment verified server-enforced MFA for administrators, database-authoritative session state, nonce-based Content Security Policy, strict same-site secure cookies, CSRF plus Origin validation, rate limiting, AES-256-GCM encrypted sensitive fields, an HMAC-style blind email lookup index, authenticated payment activation, signed webhook handling, root-protected operational helpers, detailed audit logs, and private service bindings. The public application passed the inspected live security-header and cookie assertions.

The principal residual risk is **assurance completeness**. The platform is complex: payments, customer data, SharePoint synchronization, SAML, background delivery, backups, and dynamic administration all create operational dependencies. The evidence does not yet prove independent restore capability, Cloudflare-only origin ingress, repeatable fully green integration testing, SBOM/CI enforcement, or live third-party acceptance. These gaps reduce confidence in safe failure handling and recovery despite an otherwise solid code-level control baseline.

The score is a transparent management indicator, not an OWASP or NIST certification. It is calculated as **ASVS-oriented implementation evidence (82 / 100) × 45% + SAMM process maturity (61 / 100) × 30% + NIST SSDF practice maturity (54 / 100) × 25% = 68.7 / 100**.

| Framework view | Score | Interpretation |
|---|---:|---|
| OWASP ASVS 5.0 technical control evidence | 82 / 100 | Strong control coverage for a self-hosted portal, with high-priority edge, recovery, and verification gaps. |
| OWASP SAMM 2.0 practice maturity | 61 / 100 | Defined engineering and operational practices exist, but measurement, independent verification, and repeatability need maturity. |
| NIST SSDF SP 800-218 practice maturity | 54 / 100 | Secure practices are embedded in the codebase, while supply-chain, CI, and response proof remain incomplete. |

## Scope and limits

The assessment reviewed the current source tree, production operations record, code paths for authentication, sessions, MFA, SAML, CSRF, encryption, storage, payments, webhooks, workflows, SharePoint, email, invoices, backups, deployment, and public rendering. It also executed a production dependency audit, secret-pattern scan, live security verification, service/listener/firewall/certificate/backups review, and safe expired-session recovery checks.

This is not an independent authenticated penetration test, a code-signing review, a cloud-account configuration audit, a legal compliance opinion, or a certification that the platform meets an OWASP ASVS level or NIST control baseline. No third-party credentials, production customer files, or destructive tests were used.

## Evidence summary

| Verification activity | Result | Security implication |
|---|---|---|
| Type check and production build | Passed for the session-recovery release. | Prevents a class of TypeScript integration regressions. |
| Dependency audit | 328 production dependencies; zero reported advisories at assessment time. | Positive point-in-time evidence, not continuous supply-chain assurance. |
| Tracked secret-pattern scan | No detected token/private-key/Stripe secret patterns in scanned tracked code. | Reduces accidental source disclosure risk; does not replace history scanning or secret rotation. |
| Local automated tests | 153 passed; 12 database-dependent failures because sandbox MySQL was unavailable. | Test suite is not reproducibly green in an isolated environment. |
| Live security verification | Header and cookie assertions passed. | Confirms important browser-facing controls are actively deployed. |
| Production listener review | Node on loopback 3000; MySQL on loopback 3306; nginx on 80/443; UFW allows 22/80/443. | Strong service exposure baseline, but origin ingress is not yet proven Cloudflare-only. |
| Backup/timer review | Nightly timer active; recent root-protected archives found. | Backup existence is proven; off-host and restore validity are not. |
| Certificate review | Valid Let’s Encrypt certificate with automated timer. | Strong transport baseline; OCSP stapling warning should be reviewed. |

## Material findings and prioritized treatment

| ID | Severity | Finding | Evidence | Required treatment | Framework mapping |
|---|---|---|---|---|---|
| SEC-01 | **High** | **Cloudflare edge controls may be bypassable if origin ingress remains open to the internet.** The host permits 80/443 from anywhere and the assessment could not validate a cloud firewall or host allowlist limited to Cloudflare IP ranges. | UFW listener/firewall inspection; production operations record. | Limit 80/443 origin ingress to current Cloudflare ranges, use Cloudflare Tunnel, or explicitly document and accept the risk. Verify direct-origin requests fail. Automate Cloudflare range updates. | ASVS communication and deployment controls; SAMM Operations / Environment Management; SSDF PO.5, PS.3. |
| SEC-02 | **High** | **Backup recovery has not been independently evidenced.** Local backups exist, but an untested backup is not a recovery capability, and an off-host encrypted target was not verified. | Backup timer/archive inspection; deployment and administrator documentation. | Configure an encrypted off-host target and perform a scratch-database restore with files. Record recovery time, key validation, and sign-off. | ASVS availability/data protection; SAMM Operations / Operational Management; SSDF RV.1, RV.2. |
| SEC-03 | **High** | **Release quality cannot yet be proved by a fully green, isolated test run.** Database-dependent tests failed solely because the sandbox had no MySQL test environment. | `test-suite.log`: 153 passed, 12 failed, two database-dependent files. | Add disposable MySQL service and seed data in CI; require full test success, migration validation, and application startup before merge/deploy. | ASVS verification; SAMM Verification / Requirements-driven Testing; SSDF PW.8, PW.9. |
| SEC-04 | **Medium** | **Host-wide encryption at rest is not evidenced.** Field encryption protects sensitive application values but not all metadata, uploaded files, database files, swap, or backup staging from host-volume exposure. | Architecture and prior gap evidence; production swap/backup design. | Adopt provider-managed encrypted disks or an encrypted volume as a planned migration; test restore and key handling first. | ASVS cryptography/data protection; SAMM Operations / Environment Management; SSDF PS.2. |
| SEC-05 | **Medium** | **Supply-chain assurance is point-in-time rather than continuous.** The dependency audit is clean, but SBOM generation, branch protection, signed/provenance artifacts, and required CI checks were not evidenced. | Dependency audit; repository/deployment documentation review. | Generate SBOM per release; run dependency/advisory scans in CI; protect `main`; require review and test checks; retain build provenance. | ASVS secure development; SAMM Governance / Strategy & Metrics and Implementation / Secure Build; SSDF PO.3, PS.3, PW.4. |
| SEC-06 | **Medium** | **Third-party trust boundaries need production acceptance evidence.** Stripe, Microsoft Graph/SharePoint, SAML, email, and webhook functions are implemented, but their vendor-side configurations and failure cases were not independently verified in this assessment. | Source/deployment documentation and implementation review. | Run controlled acceptance tests for signed Stripe webhooks/refunds, Graph file and WebM sync, SAML role mapping, sender reputation, and webhook replay/redelivery. | ASVS integration/communication; SAMM Verification / Security Testing; SSDF PW.7, RV.1. |
| SEC-07 | **Medium** | **Alert response ownership and measurable operating objectives are not evidenced.** The portal collects security/activity/system records but documented on-call ownership, escalation windows, and drills were not found. | Audit/log architecture and operations documentation review. | Assign owners; set severity/SLO targets; route alerts; test failed integration, backup, and security-login alerts; review monthly. | ASVS logging; SAMM Operations / Incident Management; SSDF RV.1. |
| SEC-08 | **Medium** | **Client asset deployment verification was insufficient.** A release initially placed a client bundle one directory deep; health was green while the expected UI control was missing. | August 17 production deployment correction. | Add artifact manifest/hash verification and a browser-level post-deploy assertion for expected release markers. | ASVS secure deployment; SAMM Implementation / Secure Deployment; SSDF PW.8. |
| SEC-09 | **Low** | **The browser client bundle remains large.** Build output reports an approximately 885 KB main compressed-minification precursor and build warning for chunks over 500 KB. | Vite build output. | Measure field performance and split admin/chart-heavy routes. Establish a JavaScript/performance budget. | SAMM Verification / Architecture Assessment; secure usability and availability engineering. |
| SEC-10 | **Low** | **nginx reports OCSP stapling unavailable for the active certificate.** | `nginx -t` warning. | Confirm certificate chain/responder behavior and either correct stapling configuration or explicitly disable the unsupported directive. | ASVS communication security; SAMM Operations / Environment Management. |

## OWASP ASVS-oriented technical control assessment

OWASP states that ASVS provides a basis for testing web-application technical controls and secure-development requirements. The following mapping is deliberately evidence-oriented; it does not claim satisfaction of every ASVS 5.0 requirement. [1]

| ASVS control area | Rating | Verified evidence | Remaining concern |
|---|---|---|---|
| Architecture, design, and threat resistance | **Moderate to strong** | Explicit payment gating, policy acceptance, administrator-only access, maintenance gates, typed destructive confirmations, workflow locks, and access-control helpers. | Maintain formal threat modeling for SAML, payment, webhook, backup, and cloud-sync changes. |
| Authentication | **Strong** | Argon2/password controls, mandatory administrator MFA, TOTP/backup flows, magic-link restrictions, SAML role checks, enumeration-resistant login language, rate limiting. | Test recovery and SSO failure modes as part of every release. |
| Session management | **Strong after repair** | JWT plus authoritative session row, revocation, idle/absolute timeout handling, session rotation, secure strict cookies, stale-session CSRF recovery. | Add browser-level regression automation for session expiry and MFA resumption. |
| Access control | **Strong** | Role-aware procedures, administrator-only mode, paid-order workspace gate, customer/order authorization services, authenticated download paths. | Add independent authorization test matrices and periodic authenticated testing. |
| Input validation and injection prevention | **Moderate to strong** | Typed tRPC inputs, schema validation, constrained file validation, parameterized ORM patterns, safe path governance. | Expand SAST and destructive/negative input tests; review every raw SQL helper during code review. |
| Cryptography and sensitive data | **Strong for field data; partial for host scope** | AES-256-GCM field encryption, blind email index, integration secret encryption, secure environment-file permissions, TLS. | Add disk encryption and formal key-rotation/recovery procedure. |
| Error handling and logging | **Strong** | tRPC-safe errors, server audit/security/activity logs, redaction, system alerts, no exposed stack traces in reviewed external behavior. | Define alert triage ownership, retention review, and incident evidence process. |
| Data protection and file handling | **Moderate to strong** | Private storage, controlled downloads, customer/staff visibility distinction, signed audio/playback patterns, soft deletion and retention controls. | Restore-test files and assess malware/content-scanning needs as upload volume grows. |
| Communications | **Moderate** | HTTPS, strict headers, loopback backend/database bindings, signed webhook handling, Cloudflare deployment intent. | Enforce/verify Cloudflare-only origin ingress and production integration acceptance. |
| Configuration and deployment | **Moderate** | Native installer, migration/rollback artifacts, systemd, UFW, nginx, certificate automation, health checks. | Add immutable artifact manifest, continuous CI gates, SBOM, independent restore proof, and ingress hardening. |

## OWASP SAMM maturity assessment

OWASP SAMM defines five business functions and fifteen practices that organize software-security improvement work. [2]

| SAMM business function | Maturity view | Current evidence | Next maturity step |
|---|---|---|---|
| Governance | **Level 1–2** | Security logging, policy controls, documented deployment/rollback, many administrative approvals. | Define security KPIs, release-risk acceptance, code-review criteria, named owners, and quarterly management review. |
| Design | **Level 1–2** | Secure workflow constraints, payment gate, encryption architecture, role/MFA policy. | Maintain written threat models and abuse cases for each major external integration. |
| Implementation | **Level 2** | TypeScript, strict transport controls, encryption helpers, migration discipline, security-focused code paths. | Add SAST, dependency monitoring, SBOM, provenance, branch protection, and repeatable CI. |
| Verification | **Level 1** | Unit/domain tests, type checks, production header verification, manual release validation. | Establish disposable integration DB, end-to-end negative tests, authenticated security testing, and penetration-test cadence. |
| Operations | **Level 1–2** | systemd, backups, audit logs, UFW, fail2ban, TLS timer, rollback helpers. | Prove off-host restore, origin restriction, alert escalation, incident drills, and measurable recovery objectives. |

## NIST SSDF maturity assessment

NIST SSDF is a set of high-level secure-development practices intended to reduce released vulnerabilities, mitigate residual impact, and address root causes. [3]

| SSDF practice group | Maturity | Evidence | Priority improvement |
|---|---|---|---|
| Prepare the Organization (PO) | **Partial** | Deployment guides, administration controls, security documentation, dedicated operations record. | Establish formal risk register, responsibilities, training, secure supplier/integration inventory, and risk-acceptance process. |
| Protect the Software (PS) | **Moderate** | Private repository, encrypted secrets, root-protected production config/helpers, TLS, dependency audit. | Add signed/provenance artifacts, SBOM, protected branches, code-owner review, backup key escrow, and origin controls. |
| Produce Well-Secured Software (PW) | **Moderate** | Typed code, input schemas, encryption, authentication/MFA, CSRF, rate limiting, tests, migration practices. | Require all tests in an isolated environment; add SAST/DAST and reusable security test cases for auth/integration changes. |
| Respond to Vulnerabilities (RV) | **Partial** | Audit logs, system alerts, rollback, backups, update control, issue remediation history. | Define vulnerability intake, severity SLA, patch cadence, notification/escalation, recovery exercises, and post-incident review. |

## Recommended 30-day remediation plan

| Time frame | Required outcome |
|---|---|
| Days 0–3 | Restrict origin to Cloudflare/Tunnel, configure encrypted off-host backup, run scratch restore, create two administrator break-glass paths, and complete Stripe/email/SharePoint acceptance tests. |
| Days 4–10 | Add disposable CI MySQL, make the entire test suite mandatory and green, produce SBOM and dependency reports, add release artifact/client-manifest verification. |
| Days 11–20 | Define alert ownership and SLOs, perform SAML/webhook failure and replay tests, perform a restore/incident tabletop exercise, formalize release approval evidence. |
| Days 21–30 | Commission an independent authenticated penetration test, prioritize its material findings, and repeat launch readiness review with objective evidence. |

## Residual risk statement

If unrestricted public launch proceeds before SEC-01 through SEC-03 are remediated, leadership should explicitly accept elevated risk around edge-control bypass, recovery uncertainty, and regression detection. If those items are completed and evidenced, ReadyPackets can move from conditional readiness toward a controlled limited public pilot. This assessment does not identify a confirmed critical code-execution, SQL injection, exposed-secret, or public database exposure finding in the reviewed evidence.

## References

[1]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard 5.0.0"
[2]: https://owaspsamm.org/model/ "OWASP Software Assurance Maturity Model"
[3]: https://csrc.nist.gov/pubs/sp/800/218/final "NIST SP 800-218 Secure Software Development Framework Version 1.1"
[4]: https://cheatsheetseries.owasp.org/cheatsheets/Transport_Layer_Security_Cheat_Sheet.html "OWASP Transport Layer Security Cheat Sheet"
[5]: https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/ "Cloudflare IP addresses and origin protection guidance"

## Evidence index

- `framework_and_session_evidence.md`
- `test-suite.log`
- `dependency-audit.json`
- `secret-scan.txt`
- `live-security-verification.log`
- `origin-and-operations.log`
- Source paths cited in the accompanying assessment evidence and application repository.
