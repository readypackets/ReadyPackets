# ReadyPackets Comprehensive Code, Security, and Functionality Review

**Review date:** 2026-08-12  
**Scope:** The ReadyPackets monorepo, server and client implementation, production dependency graph, deployment configuration record, database/migration posture, self-hosted VPS controls, and customer/admin workflow coverage.

## Executive conclusion

ReadyPackets has a broad security-oriented foundation: the application is loopback-bound behind nginx and Cloudflare, administrator MFA is enforced server-side, CSRF and rate-limit protections are present, sensitive application fields use authenticated encryption, and security/activity audit streams exist. The review found that current risk is concentrated in external-service activation, host-level encryption planning, migration governance, and browser-level regression assurance rather than a missing core portal.

The urgent code-level finding was an unused legacy SAML dependency with a critical signature-verification advisory, alongside several vulnerable production dependencies. Those packages were removed or upgraded. The final production dependency audit reports **no known vulnerabilities**. Direct HTML interpolation in customer and administrator policy previews was also replaced with the shared safe React Markdown renderer.

| Review dimension | Outcome |
|---|---|
| TypeScript | Passed with **0 errors** after remediation. |
| Automated tests | **143 tests passed**. |
| Production dependency audit | **No known vulnerabilities found** after remediation. |
| Safe rendering review | Policy display paths now use safe React Markdown output. |
| Security headers / live checks | Existing live verifier remains the production control and must be rerun after deployment. |
| Browser / accessibility regression | Requires a dedicated end-to-end test programme. |

## Remediations completed during review

| Severity | Finding | Remediation | Status |
|---|---|---|---|
| Critical | Unused `passport-saml` 3.2.4 had a SAML signature-verification advisory. | Removed the unused legacy package and its type package. The implemented SAML flow uses `@node-saml/node-saml`. | Resolved in source; deploy with this release. |
| High | `drizzle-orm` was below the patched SQL-identifier escaping range. | Updated from the 0.38 branch to 0.45.2; validation passed. | Resolved in source; deploy with this release. |
| High | `nodemailer` was below current message-level raw-input fixes. | Updated to 9.0.5; validation passed. | Resolved in source; deploy with this release. |
| Moderate | `file-type` was below a malformed ASF parser denial-of-service fix. | Updated to 21.3.4; validation passed. | Resolved in source; deploy with this release. |
| Maintenance / security | Multer 1.x was deprecated. | Upgraded upload middleware and types to Multer 2.2.0; upload tests passed. | Resolved in source; deploy with this release. |
| High | Customer and administrator policy previews used direct HTML interpolation. | Replaced both previews with the shared React-node Markdown renderer. HTML-like content now renders as text instead of executing. | Resolved in source; deploy with this release. |

## Confirmed security controls

| Control area | Confirmed behavior |
|---|---|
| Transport | Traffic is served over HTTPS through Cloudflare/nginx. The application and MySQL are loopback-bound, and neither application nor database port is publicly exposed. |
| Authentication | Administrator MFA is server-side. SAML-provisioned administrators follow the MFA-pending path. Customer magic links are hashed, single-use, recipient-bound, and expire after 15 minutes; access requires MFA challenge or MFA enrolment. |
| Authorization | Internal relational IDs remain server-only. Customer-facing account references are opaque, unique, and non-sequential. |
| Sensitive data | Customer PII and saved Microsoft Graph credentials use AES-256-GCM authenticated encryption. Email lookup uses a blind index. |
| Secret handling | Graph/SharePoint client secrets are write-only in administration, are not returned by APIs, and are omitted from standard configuration exports. Root-console break-glass export is separate from portal controls. |
| Abuse control | CSRF, CSP, rate limiting with progressive penalties, IP allow/block lists, and durable audit events are implemented. |
| Uploads | Upload middleware uses server-side validation, file type controls, and test coverage. |
| Integrations | Webhook retry/stop/redelivery controls are audited. SharePoint discovery occurs server-side and does not return credentials to the browser. |

## Residual risks and priority actions

### Priority 0 — Complete before relying on the external service

| Item | Risk | Required action |
|---|---|---|
| Stripe live payments | Live API keys alone are insufficient; payment completion must be verified from signed webhooks. | Save the live `whsec_` secret, enable required events, run the Finance connection test, and complete a nonzero payment/refund test. |
| SharePoint production sync | Discovery does not prove tenant consent, folder creation, or write behavior. | Grant least-privilege Graph app permissions, discover/save the intended drive, and run a controlled sync test. |
| External backup copies | Root-owned rclone remotes are intentionally not created by the portal. | Configure at least one remote, test archive restore, and record a recovery owner. |

### Priority 1 — Security and reliability work

| Item | Why it remains | Recommended action |
|---|---|---|
| Full storage encryption at rest | Sensitive fields are application-encrypted, but not every metadata field or the complete host volume is encrypted. Root-controlled backups remain sensitive. | Plan an encrypted-volume or provider-managed encrypted-disk migration with a maintenance window and restore test. |
| Migration state reconciliation | Some historical migrations were applied directly through MySQL and are not fully represented in the legacy migration journal. | Establish one idempotent migration runner and schema-parity check; reconcile historic journal records in a controlled maintenance release. |
| End-to-end regression | Unit/security checks do not replace browser confirmation of payments, MFA, SAML, magic links, uploads, backups, and policy gates. | Add authenticated browser tests and a pre-release smoke suite. |
| Magic-link runtime verification | Implementation needs controlled live email and MFA completion testing. | Test with a non-administrator customer mailbox after deployment. |
| SAML administrator provisioning | Configurable administrator assignment is high impact. | Test in a non-production tenant first and require owner review before enabling automatic administrator provisioning. |

### Priority 2 — Product quality and operational maturity

| Item | Review finding | Recommended action |
|---|---|---|
| Public accessibility | WCAG 2.2 AA assessment, keyboard pass, screen-reader pass, and accessibility statement remain outstanding. | Deliver as a focused public-site quality release. |
| Search discovery | SEO/GEO/AEO, schema metadata, sitemap review, and answer-oriented content remain outstanding. | Deliver alongside FAQ publishing and public content governance. |
| Marketing workspace | A complete campaign planning, tracking, and measurement workspace remains outstanding. | Deliver after public content and analytics foundations. |
| Recharts | The 2.x branch is deprecated but not reported vulnerable by the final production audit. | Schedule a visually tested v3 migration. |
| Administrator-authored email HTML | Rich HTML is intentionally editable and retained. Previews use a sandboxed iframe; template authors remain privileged. | Preserve least-privilege administrator access and consider stricter mail-HTML sanitization if non-administrator authors are introduced. |

## Functionality assessment

Core customer and admin flows—registration, verification, MFA, policy acceptance, intake, orders, collaboration, retained email records, referrals, announcements, knowledge-base publishing, coupons, backups, and security controls—have implementation evidence. The active release adds draft/publish/version-history control for changelog entries, configurable SAML roles, explicit maintenance gates, customer magic links with MFA, and cross-system activity log search. Remaining gaps are primarily public-site growth capabilities, third-party configuration, and assurance testing.

## Methodology and limitations

This review used TypeScript validation, the full automated test suite, production dependency audit, targeted source inspection, safe-rendering review, deployment operating notes, and existing live security verification. It was not a third-party penetration test, independent cloud configuration review, physical host-root compromise simulation, or device/browser accessibility study.

## References

[1]: https://github.com/advisories/GHSA-4mxg-3p6v-xgq3 "GitHub Advisory — Node-SAML SAML signature verification vulnerability"
[2]: https://github.com/advisories/GHSA-gpj5-g38j-94v9 "GitHub Advisory — Drizzle ORM SQL identifier escaping"
[3]: https://github.com/advisories/GHSA-5v7r-6r5c-r473 "GitHub Advisory — file-type malformed ASF parser denial of service"
[4]: https://github.com/advisories/GHSA-c7w3-x93f-qmm8 "GitHub Advisory — Nodemailer message-level raw option risk"
