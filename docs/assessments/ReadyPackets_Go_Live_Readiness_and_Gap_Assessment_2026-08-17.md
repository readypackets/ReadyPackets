# ReadyPackets — Production Go-Live Readiness and Platform Gap Assessment

**Assessment date:** August 17, 2026  
**Environment assessed:** `https://myportal.readypackets.com` and its self-hosted production VPS  
**Assessment type:** Evidence-based source, configuration, deployment, and unauthenticated external review  
**Decision owner:** ReadyPackets leadership and the production system administrator

> **Decision:** **Conditional go-live — not yet recommended for unrestricted public launch.** The portal has a strong technical control baseline and the session-timeout login defect has been repaired. However, a broad public launch should wait until the P0 and P1 operational-assurance gates in this report are completed and evidenced.

## Executive assessment

ReadyPackets has substantial functional breadth and meaningful security engineering already in place. The review verified a live nonce-based CSP, strict transport security, secure cookie controls, server-side MFA enforcement for administrators, encrypted sensitive fields, signed payment and webhook flows, root-protected backups, audit trails, role-aware authorization, and public health endpoints. The portal is not a prototype. It is deployable, serviceable software with an established native VPS installation and rollback approach.

The readiness issue is not a lack of screens or core workflow features. It is the difference between **implemented capability** and **proven production operation**. The current evidence does not prove external backup restoration, production third-party acceptance paths, a repeatable green integration-test environment, origin-only Cloudflare enforcement, alert escalation ownership, or a formal release assurance pipeline. These are practical launch blockers because a failure in any of those areas can affect paid orders, customer data recovery, or incident response.

The weighted production-readiness score is **67.7 / 100**. The calculation weights technical security controls at 30%, operational resilience at 25%, quality assurance at 20%, commerce/integration acceptance at 15%, and user-facing launch readiness at 10%. This is a prioritization tool, not an external certification.

| Dimension | Score | Weight | Assessment conclusion |
|---|---:|---:|---|
| Technical security baseline | 81 / 100 | 30% | Strong implementation evidence, with residual host and edge-enforcement risks. |
| Operational resilience | 62 / 100 | 25% | Backups, rollback, and timers exist; off-host recovery and restore proof remain incomplete. |
| Quality assurance | 60 / 100 | 20% | Type checking and many tests pass, but the complete suite is not reproducibly green without a test database. |
| Commerce and integration acceptance | 58 / 100 | 15% | Features exist, but production evidence for Stripe, SharePoint, SAML, and email paths must be completed. |
| Customer launch readiness | 72 / 100 | 10% | Public pages, policies, accessibility work, and portal workflows exist; operational support readiness needs confirmation. |

## Remediated session-expiry defect

The reported expired-session login problem was traced to a stale, session-bound CSRF cookie. A server-side idle timeout or revoked session could leave an open browser tab with an invalid CSRF token. Before the repair, the same-origin CSRF refresh endpoint refused anonymous requests, so the next login mutation failed its CSRF validation before credentials were evaluated. Users then saw a generic server error and could only recover after a hard refresh or storage clearing.

The repair is deployed. The CSRF refresh endpoint now clears stale session cookies and issues an anonymous double-submit token for a new sign-in, while continuing to return the session-bound token for an active unrestricted session. The login page refreshes the token on mount and immediately before password login, magic-link request, and magic-link verification. Origin validation and all unsafe-request CSRF checks remain enforced. Public anonymous bootstrap, simulated stale-cookie recovery, and production health were validated.

| Session recovery check | Result |
|---|---|
| Anonymous CSRF bootstrap | Passed; `GET /api/security/csrf` returns a no-store CSRF token. |
| Simulated expired session cookie | Passed; stale session and CSRF cookies are cleared and replaced. |
| Login request after bootstrap | Did not return the former expired-token or cross-origin rejection. |
| Production health after release | Passed: `{"status":"ok"}`. |

## Verified go-live strengths

| Area | Evidence-based strength | Launch value |
|---|---|---|
| Transport and browser protection | Live CSP uses per-response nonces and forbids `unsafe-inline`/`unsafe-eval`; HSTS, frame denial, strict referrer policy, COOP/CORP, `nosniff`, and restrictive permissions policy were verified. | Reduces common browser injection, clickjacking, mixed-content, and fingerprinting exposure. |
| Identity and access | Administrators require MFA; sessions are database-authoritative; role-aware gates cover local, magic-link, and SAML flows; a new Administrator-only mode is deployed. | Supports controlled launch, maintenance, and incident containment. |
| Sensitive data | Application-sensitive values use AES-256-GCM field encryption and a blind index for email lookup; integration secrets are encrypted; the production environment file is protected. | Meaningfully reduces the impact of ordinary application/database disclosure. |
| Order and payment integrity | Customer workspace access is gated until a signed Stripe payment confirmation activates the order; invoices, refunds, coupons, order history, and workflows are server-side. | Prevents unpaid orders from accessing paid workflow materials. |
| Operational controls | systemd restarts the service, nginx and MySQL are active, application and database services bind to loopback, UFW admits only 22/80/443, and certificate renewal is scheduled. | Provides a credible baseline for a small self-hosted production environment. |
| Recovery tooling | Root-protected backup, restore, update, and rollback helpers exist; a nightly backup timer is active and recent archives are present. | Enables controlled recovery when procedures are exercised. |

## Priority launch gates

### P0 — complete before unrestricted public launch

| ID | Gap or launch condition | Why it blocks broad launch | Required acceptance evidence | Owner |
|---|---|---|---|---|
| GL-01 | **External, encrypted backup and restore drill has not been evidenced.** | A local archive is not a proven disaster-recovery capability; the instance or provider account can fail. | Configure at least one independent encrypted remote destination; restore a recent archive into a non-production scratch database and validate files, encryption keys, and application health. Record the date, archive, duration, and approver. | System administrator |
| GL-02 | **The complete test suite is not reproducibly green.** | 153 tests passed, but 12 tests in two database-dependent files failed because no isolated MySQL test service was present. | Add a disposable MySQL service to CI or a test compose profile; seed test data; make `pnpm test` green and gate release publication on it. | Engineering |
| GL-03 | **Live third-party acceptance evidence is incomplete.** | Payment, email, SharePoint, SAML, and webhook delivery can fail despite working code. | Execute and retain signed acceptance evidence for Stripe test mode then live webhook delivery, an email send, SharePoint folder/file/audio sync, SAML pilot, and P101/P201 delivery/redelivery. | Operations and product owner |
| GL-04 | **Cloudflare origin-only enforcement is not evidenced.** | The host currently listens publicly on 80/443 and UFW permits those ports from anywhere. Without confirmed Cloudflare-only ingress in the host/firewall/cloud security group, edge WAF and GEO rules may be bypassable. | Restrict origin ingress to current Cloudflare IP ranges plus documented emergency administration paths, or use a Cloudflare Tunnel; verify direct-origin requests fail and review change ownership when Cloudflare ranges update. | System administrator |

### P1 — complete in the first launch sprint

| ID | Gap | Impact | Recommendation |
|---|---|---|---|
| GL-05 | No demonstrated SBOM, recurring dependency advisory scan, branch protection, or mandatory CI quality gate. | Supply-chain and regression assurance erodes over time. | Generate CycloneDX or SPDX SBOM on each release; schedule `pnpm audit`; enable protected main branch reviews and CI checks. |
| GL-06 | Host-volume or provider-managed disk encryption is not evidenced. | Application field encryption does not protect all metadata, uploaded files, database material, or swap from a host-volume disclosure. | Plan encrypted disk/provider-managed encryption with a tested backup and restore window; do not perform a live migration without a recovery plan. |
| GL-07 | Alert triage owner, escalation path, and service objectives are not defined in the evidence. | Security alerts and failed integrations may remain unresolved. | Establish named primary/secondary owners, severity targets, escalation contacts, and a weekly alert review. Test one alert end to end. |
| GL-08 | Deployment checks caught a client asset-directory path mismatch only after an administrator could not see the new interface. | A successful service health endpoint does not guarantee the intended browser bundle is live. | Add an immutable release manifest, client-asset hash verification, and a post-deploy browser or HTTP assertion for key release markers. |
| GL-09 | The primary web client bundle remains large after minification. | It can slow first use on mobile networks and increase abandonment. | Measure real-user and synthetic performance; split admin-only and chart-heavy routes; establish LCP/JS-budget targets. |

### P2 — planned maturity improvements

The next maturity wave should include a recurring authenticated penetration test, a threat-model review for payment/SAML/webhook/backup changes, a tabletop incident-response exercise, tested quarterly recovery objectives, central log retention with tamper-aware access, geo/IP edge policy governance, and accessibility regression testing with assistive-technology users.

## Public-launch checklist

| Category | Required decision or proof |
|---|---|
| Identity | Two MFA-enrolled break-glass administrators, confirmed recovery method, and a tested Administrator-only access procedure. |
| Payments | Stripe account activated, payment method tested, signed live webhook received, invoice generated, refund tested with a controlled order. |
| Communications | Production email sender/domain verified, reset/validation/invoice messages received, BCC and retention behavior reviewed. |
| Data recovery | Encrypted off-host copy enabled; scratch restore completed; encryption keys and recovery contacts documented offline. |
| Integrations | SharePoint test verifies folders, documents, WebM audio, and retry log; webhook receiver validates P101/P201 payloads and redelivery. |
| Edge and host | Cloudflare Full (strict), WAF rules reviewed, origin-only access enforced or explicitly risk-accepted, firewall and SSH access reviewed. |
| Monitoring | Health, backups, certificate renewal, failed email/webhook/sync, login pressure, and payment failures have owners and notification paths. |
| Release | Exact commit approved, full test suite green in isolated CI, migration/rollback plan tested, browser asset marker verified. |

## Release decision matrix

| Decision | Conditions |
|---|---|
| **Private pilot** | Appropriate after the P0 gates are actively scheduled and only a tightly managed internal/test cohort is granted access. Administrator-only access provides an emergency containment tool. |
| **Limited public pilot** | Appropriate after GL-01 through GL-04 are completed and a support owner is actively monitoring the first payment, email, integration, and backup events. |
| **Unrestricted public launch** | Appropriate only after the P0 gates are proven, P1 items have owners and due dates, and no unresolved critical/high production defect remains. |

## Assessment limitations

This report is not a penetration-test certificate, financial audit, legal compliance opinion, or assurance attestation. It reflects the ReadyPackets source, deployment record, live unauthenticated checks, and evidence available on August 17, 2026. It does not prove the configuration of third-party vendor accounts, Cloudflare dashboard rules, customer devices, or future code changes.

## References

[1]: https://owasp.org/www-project-application-security-verification-standard/ "OWASP Application Security Verification Standard 5.0.0"
[2]: https://owaspsamm.org/model/ "OWASP Software Assurance Maturity Model"
[3]: https://csrc.nist.gov/pubs/sp/800/218/final "NIST SP 800-218 Secure Software Development Framework"
[4]: https://developers.cloudflare.com/fundamentals/concepts/cloudflare-ip-addresses/ "Cloudflare IP addresses and origin protection guidance"

## Evidence index

- `framework_and_session_evidence.md`
- `test-suite.log`
- `dependency-audit.json`
- `secret-scan.txt`
- `live-security-verification.log`
- `origin-and-operations.log`
- Production service, firewall, certificate, database migration, backup timer, and listener review on August 17, 2026.
