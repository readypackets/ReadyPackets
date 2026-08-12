# ReadyPackets Feature Gaps and Priorities

**Assessment date:** 2026-08-12  
**Scope:** Current production release, the master prompt, inherited implementation record, the active roadmap, and deployed operational configuration.

## Executive assessment

ReadyPackets has a broad implemented foundation: the public site, customer portal, administrative workspace, encrypted user data, MFA for administrators, policies, intake, orders, customer collaboration, announcements, email administration, knowledge base, Stripe Checkout integration, Microsoft Graph/SharePoint integration, and self-hosted backup operations are present. The remaining work is concentrated in **production configuration**, **identity and observability completion**, **public-site growth features**, and **assurance/testing** rather than a missing core portal.

> A feature marked **configuration required** is implemented in code but cannot perform its external business function until a tenant administrator supplies and validates the third-party configuration. It is not equivalent to an unimplemented feature.

## Priority 0 — Must complete before relying on the capability in production

| Item | Status | Why it matters | Required next action |
|---|---|---|---|
| Stripe live payment activation | Configuration required | Saved Stripe keys exist, but the signed webhook secret was absent during the last verification. Payments must not be enabled without verified webhook handling. | Register `https://myportal.readypackets.com/api/stripe/webhook`, subscribe to the required Checkout/payment/refund events, save the `whsec_` secret, run the Finance connection test, and complete a nonzero test purchase. |
| SharePoint production sync | Configuration required | Graph discovery and encrypted secret storage are implemented, but the tenant application and selected drive need production verification. | Grant the minimum Graph application permissions, complete discovery, save the chosen drive, and run a controlled order-folder sync test. |
| Multi-cloud backup copies | Configuration required | The self-hosted backup scheduler and multi-target rclone controls are deployed; no cloud remote becomes active until root configures it. | Configure one or more root-owned rclone remotes and validate a restore from each selected destination. |
| Security and schema review findings | In progress | The requested detailed review and the current identity/logging work can reveal operational issues requiring fast remediation. | Complete the active code and security review, address any Critical/High findings before the next feature batch. |

## Priority 1 — Active delivery roadmap

| Item | Status | Outcome when complete |
|---|---|---|
| Configurable SAML role mapping | In progress | Administrators can decide the role assigned to auto-provisioned SAML users, with safe defaulting and audit history. |
| Maintenance controls | Partial / in progress | Existing maintenance and login/registration gates will be consolidated into explicit, reviewable operating controls for public access, login, and registration. |
| Customer magic links with MFA | In progress | Customers can request short-lived, single-use passwordless links. Accounts with MFA remain required to complete their second factor. |
| Advanced system logging and security search | Partial / in progress | Security log search, viewing, IP blocking, and account bans are deployed. System-alert search, activity-log search, pagination, saved filters, and richer review workflows remain. |
| Full security, code, and functionality review | In progress | A written issue register with severity, ownership, remediation status, and user/admin workflow coverage. |
| FAQ publishing system | Not implemented | Administrators can author FAQs and selectively publish approved questions on the public site. |
| Public accessibility programme | Not implemented | WCAG 2.2 AA-focused remediation, automated checks, keyboard and screen-reader review, and accessibility statement. |
| SEO, GEO, and AEO programme | Not implemented | Technical metadata, sitemaps, structured data, answer-oriented content, crawlability validation, and search-console readiness. |
| Marketing workspace | Not implemented | Administrative campaign planning, reusable channel copy, scheduling/status tracking, and promotion measurement. |

## Priority 2 — Operational maturity and product polish

| Item | Status | Recommended scope |
|---|---|---|
| End-to-end browser regression suite | Partial | Extend the existing unit/security suite with repeatable customer/admin tests for checkout, intake, policy acceptance, SSO, backup/download authorization, and accessibility-critical controls. |
| Performance and bundle optimization | Improvement | The built client’s main JavaScript chunk is above the recommended size warning threshold. Split large administrative analytics/editor modules and measure Core Web Vitals on production. |
| Full storage/database encryption at rest | Architecture decision required | Sensitive fields are application-encrypted, but complete disk/database encryption requires a planned encrypted-volume or cloud-disk migration plus backup/restore testing. Do not modify the live disk without a maintenance plan. |
| Email content experience | Improvement | The Email Template Center supports templates, HTML/rich-text editing, preview, cloning, history, retention, and BCC. A richer visual editor and template-version comparison would improve operator usability. |
| Configuration import/restore drill | Validation required | Secret-free exports are now safer by default. Run a documented dry-run restore and a staged, break-glass recovery exercise under controlled conditions. |
| Mobile and assistive-technology acceptance pass | Validation required | Complete device/browser acceptance testing after the public accessibility work is implemented. |

## Completed items that should not be treated as current gaps

The following are already implemented and deployed: policy routes and acceptance tracking; public legal aliases; customer and order trash with restore/bulk restore; customer referrals; targeted portal announcements; order question banks with Phase 1/Phase 2/both/unassigned options; editable email template center; retained sent-email records, BCC, and retention purge; Packet Collective workspaces and shared orders; coupons including percentage, fixed amount, and fixed cart price; cart persistence and recommendations; customer knowledge base workflow; Stripe connection test and payment readiness guard; delivery retry/stop/redeliver; SharePoint discovery; backup export/scheduling/downloads/multi-target controls; explicit light/dark/system appearance controls; SSO entry; opaque public account IDs; and advanced security-log review/block/ban controls.

## Recommended delivery sequence

1. Finish the active identity, maintenance, magic-link, system logging, and detailed-review work.
2. Complete Stripe test-mode validation, then live webhook activation; validate SharePoint and at least one remote backup restore.
3. Deliver the FAQ system, followed by accessibility and search/discovery work as one public-site quality release.
4. Deliver the marketing workspace after the public-site content and measurement foundations exist.
5. Schedule the encrypted-storage architecture decision separately because it changes host-level recovery and requires a maintenance window.

## Decision record

The principal remaining risks are not missing portal pages. They are an incomplete payment/webhook production configuration, unvalidated third-party synchronization and restore paths, unfinished identity and observability controls, and a public-site quality programme that has been requested but not yet implemented. The correct response is to complete and test these in priority order instead of adding low-value surface area first.
