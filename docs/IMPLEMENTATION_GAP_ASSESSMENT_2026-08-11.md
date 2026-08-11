# ReadyPackets Implementation Gap Assessment

**Assessment date:** August 11, 2026  
**Scope:** Current self-hosted repository, deployed VPS state, the August 2026 master prompt, and the self-hosted architecture document.  
**Method:** Static review of the current routes, services, schema, deployment configuration, tests, and the deployed integration configuration. This is an implementation and readiness review; it is not a substitute for a transaction-level Stripe or backup restore acceptance test.

## Executive conclusion

The core platform is **substantially implemented**: local authentication, MFA enforcement for administrators, encrypted data handling, policy acceptance, customer and order management, collaboration workspaces, SharePoint/webhook operations, email automation, file controls, operational administration, and self-hosted deployment are all present. The remaining high-value gap is the **commerce path**, not the business-operations platform.

> The largest unfinished capability is a coherent customer purchase journey. The product selector creates an order and sends the customer to the order detail page; it does not hand the customer into the existing checkout surface. Consequently, the coupon experience, Stripe Checkout redirect, payment return experience, cart persistence, and recommendations are not available in the path customers actually use.

The master prompt and architecture contain several historic targets that conflict with the user’s later self-hosting and security decisions. These are recorded as **intentional exceptions**, not missing work: there must be no Manus runtime dependency, and PWA/service-worker support is deliberately disabled.

## Baseline and evidence

| Measurement | Current evidence | Interpretation |
|---|---:|---|
| Database tables | 109 Drizzle `mysqlTable` declarations | Exceeds the master prompt’s 100-table target; table count is not a gap. |
| Admin page components | 40 files | Below the historic “65+ pages” count, but the current app deliberately consolidates some functions into tabs and panels. Evaluate feature parity, not page count alone. |
| Customer portal page components | 13 files | Major customer functions are grouped into focused pages. |
| Automated tests | 142 tests, last recorded suite passing | Strong regression baseline, but below the historic 322-test target and lacks critical payment/acceptance coverage. |
| Security verification | 46/46 live checks passed after the last production deployment | Core edge, cookie, CSRF, authorization, static-file, and rate-limit controls have production evidence. |

## Confirmed implementation gaps

### Priority 0 — Fix before enabling online Stripe payments

| Gap | Evidence | Risk / effect | Required completion condition |
|---|---|---|---|
| **Order builder bypasses checkout** | `NewOrderPage` creates an order and navigates directly to `/portal/orders/:id`; it never navigates to `/portal/checkout?order=:id`. | A buyer cannot enter the designed Stripe payment flow from the normal “Place order” action. | Create a draft/awaiting-payment order, then direct it to checkout or present a payment decision immediately. |
| **Coupon controls are absent from the live order-builder quote panel** | Coupon UI exists in `Checkout.tsx`, but not in `Orders.tsx`, which is the page shown in the provided screenshot. | The customer-facing order journey lacks the requested Apply and auto-apply behavior. | Show a coupon field, explicit **Apply** action, blur auto-apply, clear success/error feedback, and price preview in the quote/cart panel. |
| **Admin-stored Stripe keys are not fully used by payment execution** | The Stripe settings page/API reads database-backed effective keys, but checkout uses `getStripe()` and webhook handling checks `env.stripe.*` directly. | An administrator can appear to configure Stripe in the panel while checkout or webhook verification still fails unless environment variables are separately set. | Use the same effective key and effective webhook-secret resolution in session creation, signature verification, and all Stripe operations; add tests. |
| **Stripe webhooks lack explicit idempotency protection** | `checkout.session.completed` increments coupon redemptions and can create referral records without a recorded provider-event idempotency guard. | Stripe retries may double-count a coupon or referral and create duplicate financial records. | Persist processed Stripe event IDs, transact state changes, and make repeated events harmless. |
| **Payment return has no dedicated success/cancel handling** | Stripe returns to the order detail with `?payment=success` or `?payment=cancelled`; the order detail does not handle those parameters. | The customer receives no clear “payment processing / confirmed / cancelled” state on return. | Add dedicated success/cancel presentation, polling or refresh against the server payment status, and a clear distinction between browser return and webhook-confirmed payment. |

### Priority 1 — Complete the requested commerce experience

| Gap | Current state | Required completion condition |
|---|---|---|
| **Persistent shopping cart** | The selector is a transient quote. It enforces one tier per packet group in the client, but it is not a cart with persistence, recovery, review, or a separate purchase state. | Add a server-backed or safely local draft cart; allow add/remove/replace, preserve selections across navigation, and ensure server-side validation is authoritative. |
| **One tier per packet group on the server** | The UI uses radio selections by packet group, but this rule must be explicitly verified in order creation/cart validation. | Reject duplicate selections from the same packet group server-side and cover it with tests. |
| **Upsells and recommendations** | No implemented recommendation/cross-sell logic was found. | Add operator-configurable, non-coercive recommendations based on selected groups, tier, and bundle eligibility; explain why each recommendation is shown and retain the customer’s control. |
| **Coupon lifecycle completeness** | The checkout component supports manual apply, blur apply, and remove, but only after an order exists. Coupon validation does not presently check a `startsAt` condition, and invalid codes passed to session creation are not clearly rejected at that point. | Validate start, expiry, active state, redemption limit, eligibility, and final price on the server. Reject invalid codes deterministically. Store the accepted coupon and discount snapshot with the payable order. |
| **Paid-order orchestration acceptance test** | Services model a payment and mark an order paid on `checkout.session.completed`, but Stripe is not configured in the production environment and no Stripe-focused automated tests were found. | Use Stripe test mode to prove the complete lifecycle: cart → checkout → signed webhook → one payment record → paid order → customer confirmation → refund/partial refund reconciliation. |

### Priority 2 — Master-prompt parity and operational validation

| Gap or incomplete evidence | Assessment | Recommended action |
|---|---|---|
| **Historic “65+ admin pages” target** | The repository has 40 admin page components. This does not automatically mean 25 missing features because tabs consolidate several functions, but it should not be advertised as a literal 65+ page implementation. | Maintain a requirement-to-route matrix and identify any actual missing operations rather than adding pages merely to meet a count. |
| **Test-suite breadth** | The current suite has 142 tests versus the master prompt’s historic 322. Existing security checks are strong, but no Stripe tests were found and there is no demonstrated full browser acceptance suite for the purchase journey. | Add focused unit/integration tests for coupon validation, duplicate webhook events, payment state transitions, cart constraints, and browser acceptance tests for checkout. |
| **Production configuration acceptance** | `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET` are empty in the production environment. SAML is enabled as a setting, but the SAML environment IdP values are empty; a database configuration may exist and should be checked through the secured admin screen. | Treat Stripe as disabled until test keys, webhook endpoint, and signature verification are proven. Verify SAML only after complete Entra/IdP metadata is stored and a non-admin pilot login succeeds. |
| **SharePoint, Microsoft Graph, and multi-target backup proof** | Features and administrative configuration are implemented, but implementation does not establish that all optional external providers are currently configured, reachable, or restorable. | Run and document a controlled operational acceptance test: Graph test send, SharePoint folder provision, every configured backup target, and a scratch-database restore. |
| **Docker deployment proof** | Docker/Compose assets exist, but the production deployment is VPS/systemd. | Run a clean Docker install and upgrade test in an isolated environment before representing Docker parity as production-proven. |
| **Architecture document currency** | Current implementation measurements and decisions differ from portions of the historic master prompt and technical architecture. | Update architecture figures, route counts, test counts, current admin surfaces, current schema count, and the explicit PWA/Manus exceptions after the commerce release. |

## Intentional exceptions — not missing work

| Historic architecture / master-prompt item | Current decision | Reason |
|---|---|---|
| Manus OAuth, SDK, storage proxy, and runtime plugin | Excluded | The project requires a self-hosted platform with no Manus dependency. |
| PWA/service worker and offline cache | Disabled | The user explicitly requested no PWA service worker following prior production-cache issues. |
| Exact 100-table count | Not pursued | The repository has 109 current declarations. Exact table count is not a business outcome. |
| Public or customer-facing AI messaging | Removed | The project explicitly prohibits AI references on public and customer portal surfaces. An admin-only internal surface does not change that requirement. |

## Features assessed as present rather than missing

The following master-prompt areas have implementation evidence and should not be re-opened merely because older documentation uses different counts or terminology: local registration/login/email verification/password reset, administrator MFA and backup codes, active sessions and revocation, AES-256-GCM field encryption with HMAC blind indexing, IP policy and runtime rate-limit settings, policy versioning and acceptance, customer/order soft deletion and retention automation, order automation rules, Phase I intake documents and direct WebM recording, SharePoint folder provisioning and outbound webhook delivery logs, email templates and Graph/SMTP support, portal announcements, editable onboarding slides, Entra SAML setup, Packet Collective workspaces, granular order sharing, configurable admin navigation, encrypted configuration export/import, and 3-2-1 backup configuration.

## Recommended sequence

1. **Repair and integrate the commerce entry point.** Move coupon UX into the order builder/cart, redirect the normal purchase path into Stripe Checkout, and add clear payment-return states.
2. **Correct Stripe configuration and event integrity.** Centralize effective key lookup, use the effective webhook secret, add idempotent event processing, and test the webhook flow.
3. **Build the cart/recommendation experience.** Add server-authoritative draft carts, tier-per-group enforcement, cart persistence, and configurable recommendations.
4. **Perform controlled acceptance tests.** Stripe test mode first; then Graph/SharePoint, backup restore, SAML pilot, and Docker install/upgrade validation.
5. **Refresh the architecture and requirements traceability record.** Keep the documentation aligned with the self-hosted implementation and explicitly retain the no-PWA/no-Manus decisions.

## Sources reviewed

1. `ReadyPacketsPortal—FullRebuildContext&MasterPrompt.md`, August 2026.
2. `docs/ARCHITECTURE.md`, self-hosted rebuild architecture.
3. `docs/GAP_ANALYSIS_RESPONSE.md`, Batch 39 response.
4. Current source: `client/src/pages/portal/Orders.tsx`, `client/src/pages/portal/Checkout.tsx`, `server/routers/stripe.ts`, `server/services/stripe.ts`, routing, schema, tests, and deployment configuration status.

---

**Assessment status:** Ready to use as the current product workplan baseline. The commerce P0/P1 items are the recommended next release.
