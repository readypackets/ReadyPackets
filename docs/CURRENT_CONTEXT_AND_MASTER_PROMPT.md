# ReadyPackets Portal — Current Context and Master Prompt

**Version:** 2026-08-12  
**Status:** Self-hosted production implementation record

## Product mandate

ReadyPackets is a self-hosted customer website and operations portal for structured business-packet services. The platform must run on a native VPS or Docker deployment without Manus runtime dependencies. It provides a public website, customer portal, staff/admin console, secure order lifecycle, collaboration, policies, files, support, integrations, and operational controls.

## Non-negotiable principles

| Principle | Current implementation direction |
|---|---|
| **Self-hosted operation** | Native Ubuntu VPS deployment and Docker Compose deployment are supported by the unified installer. |
| **Security by design** | TLS, nonce-based CSP, CSRF protections, rate limiting, MFA, server-side authorization, encrypted sensitive fields, blind-index account lookup, secure logging, and protected lifecycle helpers. |
| **No public AI positioning** | Public site and customer portal avoid claims or references to AI usage. |
| **ReadyPackets brand** | Navy, teal, and gold visual language; System/Light/Dark user appearance controls; accessible customer/admin surfaces. |
| **Customer ownership** | Policies, secure files, Packet Collective workspaces, referrals, support, self-service security, and customer-facing opaque account references. |
| **Audited administration** | Administrative lifecycle, security, deletion/recovery, integration, automation, backup, and publishing actions create traceable activity records. |

## Implemented platform capabilities

### Customer and order delivery

The portal supports persistent packet-cart selection with one tier per group, coupon methods for percentage, fixed amount, and fixed final cart price, configurable Stripe Checkout readiness, order status/progress, Phase 1 and Phase 2 question workflows, web-based Business Pitch recording, files, support, policies, referral sharing, announcements, and a published Knowledge Base.

Packet Collective allows organization workspaces and scoped order sharing. Customers can be granted view, document-upload, final-deliverable viewing, Business Pitch recording, contributor, or manager permissions.

### Administration and governance

The admin console supports customers, orders, soft-delete trash and bulk restore, question banks, finance, Stripe testing, coupons, referrals, templates, email delivery history/retries/resends, automations, policy center, knowledge base approval, announcements, integrations, backups, security logs, SAML/Entra setup, maintenance gates, changelog publishing, and platform updates.

### Security and operations

Sensitive user and integration fields use AES-256-GCM with bound associated data. Standard configuration exports exclude application keys, database credentials, and integration secrets. The public account reference is opaque and unique in `RP-U-XXXXXXXXXXXX` form; internal relational IDs remain server-side only.

The platform includes protected backup, restore, configuration export, cloud synchronization, release scan/approval/rollback, native installer, Docker installer, factory reset, and operational documentation paths.

## Current priority backlog

| Priority | Remaining item |
|---|---|
| **P0** | Configure and perform verified Stripe test-mode/live-mode webhook and payment lifecycle tests. |
| **P0** | Configure Microsoft Graph consent and perform a real SharePoint folder-sync test; configure cloud backup remotes and perform a restore drill. |
| **P1** | Deliver an administrator-published FAQ system, public WCAG 2.2 AA validation/remediation, SEO/GEO/AEO content and metadata programme, and marketing workspace. |
| **P1** | Add browser-level end-to-end regression coverage for SAML, magic links/MFA, checkout, file upload, policies, backup download, and rollback authorization. |
| **P2** | Migrate the production host to provider-managed encrypted storage or an encrypted volume with a planned downtime/restore procedure. |
| **P2** | Reconcile historic direct-SQL migration journal entries and modernize the remaining chart-library major version in a separately tested release. |

## Current release process

All source changes, database migrations, scripts, reports, and session logs are committed to the private `readypackets/ReadyPackets` GitHub repository. A reviewed release is built, type-checked, tested, migrated, deployed with a rollback artifact, health-checked, security-verified, logged, and pushed to GitHub.
