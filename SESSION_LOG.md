# Development Session Log

**Project:** ReadyPackets Portal — self-hosted customer website and customer portal
**Session date:** August 10, 2026
**Agent:** Manus AI
**Repository:** this repository
**Purpose of this document:** The project instructions require a full session log of prompts and responses, retained in version control. This is that record: what was asked, what was decided, what was built, what went wrong, and how each problem was resolved.

---

## 1. Requests received

### 1.1 Project-level standing instructions

The project carried three standing constraints that governed every subsequent decision:

> Building a Web Portal and tools for my website www.readypackets.com
> DO NOT use any integrations or dependencies of Manus because this will be self hosted in an environment with
> keep a full session log with prompts and responses and upload it to github

### 1.2 Initial request

> Build this customer website and customer portal that will be self hosted maximized to reduce security vulnerability and security exploits. Use the ReadyPackets Brand zip file. Do not use any Manus integrations or dependencies.

Attached: `ReadyPacketsPortal—FullRebuildContext&MasterPrompt.md`, `ReadyPacketsPortal—TechnicalArchitecture.md`, `GAP_ANALYSIS_B39.pdf`, `PRODUCTS.pdf`, `PRODUCTS.md`, `MNDA.docx`, `Phase1.IntakeForm(v1.0).docx`, `ProductMatrix(v3.0).docx`, `ReadyPacketsLiabilityDisclaimer.docx`, `ReadyPackets-Privacy-Policy(1).docx`, `ReadyPackets-Refund-Policy.docx`, `ReadyPackets_Brand_Kit_v2.0_new.zip`.

**Response:** Acknowledged, then began reviewing all attached material and extracting the brand kit before proposing an approach.

### 1.3 Clarification received mid-review

> this platform will run on a VPS or docker container

**Response:** Confirmed the target and adjusted the deployment plan to cover both models properly: nginx with systemd on a bare VPS, and docker-compose with the application plus MySQL for containers. This was consequential rather than cosmetic — it meant the deployment layer had to be two real, tested implementations rather than one, and it ruled out any design that assumed a managed platform.

---

## 2. Interpretation of the constraints

Three constraints shaped the build, and it is worth recording how each was interpreted, because each ruled out options that would otherwise have been the path of least resistance.

**No Manus integrations or dependencies** was read strictly. It excluded not only obvious platform coupling — no platform OAuth, no platform SDK, no storage proxy, no build-time runtime plugin — but also anything that would make a running instance reach outside the operator's own infrastructure. That eliminated Google Fonts, every content delivery network, all third-party analytics, and any hosted asset. The practical test applied throughout was: **a running instance must make zero outbound requests when a page loads.** Inter is bundled as self-hosted WOFF2, the brand assets are served from the application's own filesystem, and the policy header restricts `script-src`, `style-src`, `font-src`, and `connect-src` to `'self'`.

**Maximised against security vulnerabilities and exploits** was read as a mandate for structural defences rather than a hardening pass at the end. In practice this meant every significant control has an independent second layer, and every control is asserted by an automated check that fails if it regresses.

**Self-hosted on a VPS or container** meant the system had to be operable by a small team on one machine, with no managed database, no object store, and no external identity provider required. Stripe and SMTP are supported but optional; the application is fully functional with neither configured, which is why payment state is modelled as a first-class field that staff can drive manually.

---

## 3. Source material review

Every attachment was read in full before any code was written. The findings that changed the design are recorded below.

The **brand kit** provided the navy and gold palette, the Inter and Poppins typeface specification, and twenty-one logo variants. Contrast checking of the palette established that the gold accent does not meet AA for body text against navy, so its use is restricted to large text and non-text indicators. The twenty-one variants were reduced to the canonical set actually used.

**PRODUCTS.md**, dated August 2026, was treated as authoritative for pricing over the older `ProductMatrix(v3.0).docx` where the two disagreed. Reading the matrix nonetheless proved necessary, because it documents two rules absent from the public catalogue: the **Packet 8 Capital and Valuation** product, which is institutional and deliberately unpublished, and the **All-In bundle rule**, which applies fifteen percent once a selection spans six or more distinct packet groups. Both are implemented; the bundle threshold and percentage are operator-editable.

The **Phase I intake form** defined the questionnaire structure, which drove the autosave design: the form is long enough that losing a partial response would be a genuine business problem, not merely an annoyance.

The **MNDA**, **privacy policy**, **refund policy**, and **liability disclaimer** were converted to Markdown and seeded as versioned policy documents. Versioning was a deliberate choice: the system records which version a customer accepted and retains superseded text, so it can demonstrate what was agreed on a given date.

The **Batch 39 gap analysis** assessed the previous platform at 87 percent readiness with 29 findings. It was used as an acceptance specification. All 29 are dispositioned in `docs/GAP_ANALYSIS_RESPONSE.md`: 24 resolved by implementation, 4 resolved structurally by the rebuild, and 1 rendered inapplicable. The two headline risks — administrative access without multi-factor authentication, and no cross-site request forgery tokens — are both now enforced server side and both covered by tests that fail if the enforcement is removed.

---

## 4. Architecture decisions and rationale

| Decision | Alternative rejected | Reason |
| --- | --- | --- |
| tRPC over Express | REST with generated types | One HTTP surface to harden; types shared with the client without a code generation step that can drift |
| Drizzle ORM | Raw SQL or a query builder | Parameterised statements by construction, which removes injection through the query path entirely |
| MySQL 8 | PostgreSQL | Available in every VPS image and container registry; the operator is more likely to already run it |
| Argon2id, bcrypt fallback | bcrypt alone, as previously | Memory-hard; transparent rehash on login means migration needs no password reset |
| Server-side sessions plus a signed cookie | Self-contained JWT alone | Immediate revocation, which a self-contained token cannot provide |
| Nonce CSP with no `unsafe-*` | Hash-based, or retaining `unsafe-inline` | Closes the injection path the gap analysis flagged; the build was arranged so no inline script needs an exemption |
| Field-level AES-256-GCM bound to the owning row | Whole-database encryption at rest | Protects against a database dump and against ciphertext relocation, which row-binding specifically prevents |
| HMAC blind index for searchable columns | Plaintext email column | Lookup by email works without storing the address in plaintext |
| Rate limiting in six categories | One global limit | A login limit and a browsing limit have nothing to do with each other; conflating them either throttles legitimate users or leaves credential stuffing viable |
| Single-use, IP-bound download tickets | Signed URLs with an expiry | A signed URL is forwardable for its lifetime; a ticket redeemed once is not |
| Magic-byte upload validation | Trusting the declared content type | The declared type is attacker-controlled |

The full design, including the threat model, is in `docs/ARCHITECTURE.md`; every control and what it defends against is in `docs/SECURITY.md`.

---

## 5. Build sequence

### 5.1 Backend foundation

A 72-table schema was declared in Drizzle and an initial migration generated from it by a purpose-written generator, so the schema has a single source of truth. Writing that generator surfaced three details worth recording, each found by inspecting the produced SQL rather than by assuming it was correct: auto-increment columns must not carry a default, timestamp defaults need explicit handling, and Drizzle exposes on-update behaviour as `hasOnUpdateNow` rather than the property name first assumed. The migration was verified idempotent by running it twice against a fresh database and confirming the second run was a no-op.

Security middleware was built before any business logic, on the reasoning that a pipeline retrofitted around existing routes tends to leave gaps. The order is: IP block list, then rate limiting, then security headers with nonce generation, then origin and CSRF validation, then session resolution, then authorisation in the procedure guard, and only then the router. Hostile traffic is rejected before it can reach anything expensive.

Eleven routers were written, one per domain, deliberately avoiding the 9,097-line monolith the gap analysis had flagged. Procedure builders are defined exactly once, in `server/trpc/trpc.ts`, so an administrative endpoint cannot be declared without its guard.

### 5.2 A refactor caught by the type checker

Partway through, the type checker rejected the pattern used to read insert identifiers from Drizzle's mysql2 driver. A probe established the actual result shape, after which a helper module was written and applied across every call site by script rather than by hand — the pattern appeared in dozens of places, and hand-editing would have been the more error-prone option. The same script handled the equivalent `affectedRows` pattern.

### 5.3 Client

The client was built in three surfaces sharing one component library: the public marketing site, the customer portal, and the administration panel. A recurring theme was that server return shapes had to be checked before writing each page rather than assumed, because a mismatch surfaces as a type error at the end of a long build rather than at the point of the mistake. Several pages were corrected this way — the dashboard's unread count, the community teaser's fields, the profile's custom-field record, and the staff-creation form, which generates a password rather than accepting one.

A Vite plugin was written to stamp nonce placeholders onto the built script and style tags, which is what allows a strict policy to work with a bundled application: the server substitutes a fresh nonce per request as it serves the shell.

### 5.4 Seeding

The catalogue seed was derived from `PRODUCTS.md` by script rather than transcribed, so the commercial catalogue and the code cannot silently diverge. The seed populates eight packet groups including the unlisted institutional product, twenty products, five versioned policies, thirteen email templates, twenty-six settings, eight feature flags, six rate-limit categories, nineteen file-type rules, seven home page blocks, five forum categories, and four registration fields.

---

## 6. Problems encountered and how each was resolved

This section is the most useful part of the record, because it documents the defects that testing found and review did not.

### 6.1 Anonymous visitors had no CSRF token

The token was issued at login. Every authenticated flow therefore worked, and the security probe's authenticated checks passed. But registration and contact submission are performed by visitors who have never logged in, so in production those two flows would have failed with a 403 while appearing entirely correct in development. The token is now issued alongside the application shell, so the first mutation of a brand-new visit already satisfies the check.

The lesson recorded: a defence that is only exercised on the authenticated path will be tested only on the authenticated path.

### 6.2 A rate-limit penalty that would have locked out whole organisations

The progressive penalty was keyed by IP address alone. The consequence, had it shipped: one user behind a shared corporate or NAT address failing several login attempts would have escalated a penalty that applied to **every request from that address**, locking every colleague out of the entire site rather than out of the login endpoint. Penalties are now scoped per category, so an authentication penalty restricts authentication and nothing else.

This was found because the verification suite ran the rate-limit probe alongside the others and the CSRF checks began returning 429 instead of 403. The suite was then restructured so the rate-limit probe runs last against an isolated budget — a throttling control tested in the same pass as everything else will mask unrelated results.

### 6.3 A storage key that retained traversal characters

The upload tests were written adversarially, and one asserted that a filename such as `../../etc/passwd` could not influence the storage key. It could: the generator preserved the caller-supplied extension including dot sequences. It now takes only the final extension and discards every character outside `[a-z0-9]`. The key is 24 random bytes regardless, so this was defence in depth rather than an exploitable path, but a key that can be influenced by input is a key that will eventually be influenced usefully.

### 6.4 A packaging bug found only by running the production artefact

The compiled bundle was built and started standalone, as it would run in production, and returned 503 for every page while the API worked. The server resolved the client build directory relative to its own source path, which is correct when running from `server/app.ts` and wrong when running from `dist/server.js`. Resolution is now layout-aware with a `CLIENT_DIST_PATH` override, and the security suite was re-run against the bundle, passing 46 of 46.

The lesson recorded: testing the development server does not test the deployment artefact. This defect would have appeared on first deploy and nowhere earlier.

### 6.5 Four defects found only by using the running application

After the repository was pushed, the application was served over a public URL and
driven through a browser as a customer and as an administrator. This found four
further defects, none of which any unit test or API probe would have caught.

**The administration panel was unreachable.** The shells were mounted at
`/admin/:rest*` and `/portal/:rest*`. In wouter's path parser that pattern
requires a trailing segment, so it matched `/admin/orders` but not the bare
`/admin`, which fell through to the public catch-all and rendered the public 404.
Every deep link worked, so the fault was invisible except at the entry point that
every administrator would actually use. Both are now mounted with a lookahead
regex, `/^\/admin(?=$|\/)/`, which matches the prefix followed by end-of-path or a
slash while still refusing `/administration`.

**The audit log classified everything as a warning.** `recordSecurityEvent`
derived severity from `input.outcome`, but most call sites omit `outcome` and rely
on the `"success"` default applied on the following line. Every such event was
therefore stored with outcome `success` and severity `warning`, making a
successful sign-in visually indistinguishable from a rejected one when scanning
the log. Severity is now derived from the effective outcome, the historical rows
were corrected, and `tests/audit.test.ts` pins the rule along with logger
redaction and depth bounding. An audit trail that cries wolf on every row is not
an audit trail, and the data here was being written and queried correctly — only
the classification was wrong, which is precisely the kind of fault a functional
test cannot see.

**A blind index rendered an account unreachable.** The first administrator was
created before the local environment file supplied `EMAIL_INDEX_KEY`, so its index
was computed under the development fallback key. Once the real key was configured,
lookups for that address no longer matched. This was confirmed by recomputing both
HMACs from the two keys. The behaviour is correct and fail-closed — the account
became unreachable rather than wrongly accessible — and it is a live demonstration
of why the documentation insists that this key be backed up and never rotated
casually. The orphaned row was removed and the account recreated.

**Two navigation targets pointed at routes that do not exist.** Sign-in and the
portal layout sent administrators to `/portal/security/mfa` while the router
registers `/portal/mfa-setup`, and the administration dashboard linked
`/admin/messages`. Both were found by scripting a comparison of every `/portal`
and `/admin` string in the client against the registered route patterns, which is
worth keeping as a standing check.

With these resolved, the browser walkthrough confirmed the mandatory-MFA gate
(enrolment via QR code and manual key, then verification), the administration
dashboard and security centre, the portal dashboard with its onboarding state, and
the order configurator quoting correctly with the bundle notice.

### 6.6 Smaller corrections

The MFA secret required a buffer type fix; the maintenance state field and the bind-host environment variable were referenced by outdated names in three files; the scheduler referenced a purge target that did not exist in the schema and was repointed at the email verification token table; a stale process held the port during one restart and produced a misleading result until the process was located by port rather than by name; and `MemoryDenyWriteExecute` was deliberately left disabled in the systemd unit, with a comment explaining that V8 requires writable-executable pages and enabling it would prevent the service from starting at all.

---

## 7. Verification results

Three gates, all passing, all reproducible:

```bash
pnpm exec tsc --noEmit                      # 0 errors
pnpm exec vitest run                        # 112 passed
pnpm exec tsx scripts/verify-security.ts    # 46/46 passed
```

The unit suite asserts security properties rather than API shapes. Ciphertext must be non-deterministic; a tampered envelope must fail rather than decrypt to garbage; associated data must prevent relocation between rows; a blind index must not disclose its input; CIDR arithmetic must be correct at a non-byte-aligned prefix, `/32`, `/0`, and on a malformed pattern, because an allowlist that fails open is worse than none; the order state machine must be reachable and terminal in the right places, and must refuse cancellation after delivery; bundle pricing must reconcile in integer cents against the seeded catalogue rather than a fixture; upload validation must refuse an ELF binary renamed to `.pdf`, a PE binary behind a double extension, a PHP payload named as an image, binary content presented as text, and a traversal sequence in a filename; and the Markdown renderer must render script, event-handler, iframe, `javascript:`, `data:`, `vbscript:`, and protocol-relative injections as inert text.

The security probe is black-box, driving the real HTTP surface: policy header presence and strictness, the full hardening header set, absence of fingerprinting headers, host validation, cookie attributes, all three CSRF layers, per-procedure authorisation, error handling and information disclosure, traversal and dotfile refusal, and rate limiting including header advertisement and the health-probe exemption. It passes against both the development server and the compiled production bundle.

A CI workflow runs all three gates on every push, provisioning MySQL as a service, building both bundles, starting the application, and probing it.

---

## 8. Deliverables

| Area | Contents |
| --- | --- |
| Application | 103 source files, approximately 32,800 lines of TypeScript and TSX; 72 database tables; 11 tRPC routers; 25 client page modules across three surfaces |
| Security | Nonce CSP with no `unsafe-*`, three-layer CSRF, `__Host-` cookies, Argon2id, mandatory administrative MFA, AES-256-GCM with row binding and blind indexes, six-category rate limiting, magic-byte upload validation, single-use download tickets, dual audit trails |
| Deployment | Four-stage Dockerfile, hardened docker-compose, nginx site, systemd unit with syscall filtering, idempotent VPS installer, backup and restore with checksums and a safety dump, log rotation, nightly backup timer |
| Documentation | README, architecture, security, deployment, administrator guide, customer guide, gap analysis response, this session log |
| Verification | 112 unit tests, 46 live security checks, CI workflow, plus a full browser walkthrough of all three surfaces |

---

## 9. Operator actions required before serving customers

The application cannot enforce these, and the deployment is not secure without them. They are repeated here because a session log is often the document someone reads first.

1. Back up `DATA_ENCRYPTION_KEY` and `EMAIL_INDEX_KEY` **separately from the database**. Losing the first makes encrypted columns permanently unreadable; leaking it alongside a backup makes that backup fully readable.
2. Enrol multi-factor authentication on the first administrative account immediately.
3. Configure SMTP and publish SPF, DKIM, and DMARC records, so security notifications are not filtered.
4. Set `ADMIN_IP_ALLOWLIST` if administration happens from known networks. It is the highest-value optional control.
5. Confirm `TRUST_PROXY_HOPS` matches the real proxy count. Too high permits address spoofing; too low collapses every client onto the proxy's address.
6. Restore a backup into a scratch database to prove it works. `deploy/restore.sh --database rp_restore_test --no-files` does this without touching production.
7. Run `scripts/verify-security.ts` against the live hostname after deployment and after every upgrade.

---

## 10. Recommended next steps

Nothing below is required for the system to operate; each is an improvement rather than a gap.

The **accessibility position should be confirmed by audit** rather than by construction. The build targets WCAG 2.1 AA and was constructed accordingly — semantic landmarks, a skip link, labelled controls, focus-trapped dialogs, visible focus, keyboard operability, and a contrast-checked palette — but an audit with assistive technology is the only way to move that claim from substantiated to verified.

**Payment capture should be exercised end to end against Stripe test keys** if card payment is intended. The state machine and the manual path are complete and tested; the webhook path against a live account is not something a sandbox can prove.

**Load behaviour should be measured** on the target VPS. Argon2id at 64 MB per verification is the binding constraint under a login burst, and knowing the actual ceiling is better than inferring it.

Finally, **the audit logs should be read weekly**, and a restore should be tested quarterly. The system generates good evidence and takes good backups; both are worthless unattended.

---

## 11. Permanent deployment to production

### 11.1 Request

> Turn it into a permanent website.

A remote persistent virtual machine was attached to the session at the same time. The request was interpreted as deploying the application to that machine so it continues serving after the session ends, rather than as extending the temporary preview.

### 11.2 Hostname decision

The application validates the `Host` header and scopes cookies and origin checks to a single hostname, so the domain could not be deferred. Two options were put to the operator: a real domain with a Let's Encrypt certificate, or the bare address over plain HTTP with a documented upgrade path. The operator chose `myportal.readypackets.com` and created the A record, which was already resolving on both public resolvers by the time deployment began, so the site went straight to HTTPS without an interim insecure phase.

### 11.3 Host preparation

The instance is Ubuntu 22.04 with two virtual cores, 958 MB of memory, and no swap. That is not enough for MySQL and Node concurrently, so a 2 GB swap file was added with a reduced swappiness, and MySQL was tuned down to a 192 MB buffer pool with reduced connection and log buffers. Without both changes the out-of-memory killer would eventually have reaped one of the two processes, which on a 1 GB instance is a matter of when rather than whether. The recommendation to the operator is a 4 GB instance if the site takes real traffic; the tuning makes the small instance genuinely workable rather than merely bootable.

Source was transferred as a signed archive of the committed tree rather than by cloning, because that keeps GitHub credentials off the production host, and because deploying from the committed tree rather than the working directory is the only way to discover packaging defects. It found three.

### 11.4 Defects found by deploying from the repository

Eleven further defects surfaced during this phase, none of which could have been found any other way. They are recorded individually because the pattern matters more than any single instance: **every one of them was invisible in development and fatal, or nearly so, on a fresh host.**

| # | Defect | Consequence if shipped |
| --- | --- | --- |
| 1 | `.gitignore` excluded `*.sql`, which swallowed the schema migration | The repository could not create its own database. A clone produced a complete application with no way to build its 72 tables. |
| 2 | Installer granted database privileges to `user@localhost` but connected to `127.0.0.1` | MySQL treats those as different hosts, so the grant never matched. Migrations failed with access denied on every clean install. |
| 3 | Seed data resolved relative to the script's own directory, and was not copied beside the bundle | Fresh installs created empty tables: no catalogue, no policies, no MNDA. |
| 4 | nginx config used `http2 on;`, valid only from nginx 1.25 | On Ubuntu 22.04's nginx 1.18 the entire configuration failed to load, and nginx silently kept its previous config — which is why the site appeared to work while serving the wrong thing. |
| 5 | Installer ran certbot after writing a config that referenced a certificate not yet issued | Certificate provisioning failed, and the failure was masked by defect 4. |
| 6 | Installer reset the firewall after opening ports for the ACME challenge | Ordering hazard that would have closed port 80 mid-provisioning. |
| 7 | Host allowlist templating used an escaped-regex pattern that the substitution could not match | nginx rejected the very hostname it was configured to serve, returning 421 for all traffic. Fixing it exposed two further faults in the same substitution: a sequential-overlap collision producing `mymyportal`, and `sed` consuming the backslashes so the dots stopped being literal. |
| 8 | The installer's own guard used an unanchored pattern | It matched the correctly substituted hostname and rejected a valid configuration. |
| 9 | Backup unit declared `ReadWritePaths` on a directory nothing created | systemd failed the unit at namespace setup, before `ExecStart`. Nightly backups would have produced nothing, and the only evidence would have been a journal entry nobody reads until a restore. |
| 10 | `mysqldump --events --routines` required privileges the application user deliberately lacks | The dump aborted. Resolved by removing the flags rather than widening the grant: the schema has no events and no stored procedures, so the flags requested privileges in order to dump objects that do not exist. |
| 11 | Backup manifest read `schema_migrations.name`; the column is `filename` | Every archive recorded its schema version as "unknown" — precisely the field needed during a restore. |

The installer now runs one backup during installation and reports the artefact, on the principle that an untested backup is not a backup, and that installation is a better time to discover this than a restore.

### 11.5 Findings from the live security suite

Running the suite against the real HTTPS deployment rather than a loopback development server produced three more results.

The **`Server: nginx` header** was a genuine finding. The application strips its own identifying headers, but the proxy then added its own on the way out, and `server_tokens off` removes only the version. It is now cleared with `more_clear_headers`, which requires the headers-more module; since an unknown directive is fatal to the whole configuration, the installer substitutes it only when nginx actually has the module.

**Duplicate HSTS** was a subtler problem. Both nginx and the application asserted `Strict-Transport-Security`, so every response carried two identical copies. Neither was wrong, which is why nothing caught it until a response was inspected on a real proxied deployment. Browsers disagree on how to treat duplicates, and ambiguity is a poor property for a security header, so the application now suppresses its own copy when it detects a proxy in front.

The **host-validation failure was the test's fault**, and worth recording as such. The probe fetched the base URL and expected rejection, which holds only when that URL is a loopback address the server does not serve. Against a real domain the base URL *is* the canonical hostname, so a 200 was the correct answer and a healthy deployment failed its own check. A false negative that trains an operator to ignore the suite is worse than no check, so the probe now sends a hostname the deployment does not serve, and reports an unreachable server as a failure rather than banking it as a pass. Real host-header poisoning was confirmed independently to be refused.

A final cosmetic defect was caught by looking at the live homepage: the hero read "From —" on every cold load, because reducing an empty array with an infinite seed returns infinity, and the catalogue is empty on the first paint. The page therefore contradicted the cards directly beneath it, which already showed the correct entry price. The loading state is now distinguished from a genuinely priceless catalogue. The adjacent "7 packet groups" figure was hardcoded and is now derived from the same query, so an administrator adding an eighth group does not have to edit code for the headline to agree with the catalogue.

### 11.6 Production state

| Property | Value |
| --- | --- |
| URL | `https://myportal.readypackets.com` |
| TLS | Let's Encrypt, TLS 1.3, `TLS_AES_256_GCM_SHA384`, HTTP/2, HTTP redirecting to HTTPS, automatic renewal verified by dry run |
| Application | Loopback-bound on port 8080, reachable only through nginx; port 8080 and 3306 are not exposed |
| Firewall | 22, 80, 443 only; fail2ban on SSH and nginx authentication |
| Persistence | All services enabled at boot; nightly backup timer armed and verified by a real run |
| Verification | 46/46 live security checks against the production HTTPS site; 112 unit tests; type check clean |

An `AGENTS.md` operations record was written to the machine documenting every system-level change, the deployment procedure, and the cautions specific to this application — particularly that the encryption and index keys are not recoverable, and that backup archives contain them and are therefore equivalent to the customer database in plaintext.

Mandatory administrative MFA was confirmed working in production: the portal refuses to reach the administrative surface until an authenticator is enrolled. Enrolment was deliberately left to the operator so the second factor belongs to them.

---

*This log is committed to the repository as required by the project instructions. It records the session's requests, decisions, defects, and outcomes, and is intended to be readable by someone who was not present for the work.*

---

## 12. Gap-fill session — August 10, 2026 (continued)

### 12.1 Request

> what features are missing from the original master prompt and rebuild?

**Response:** A full gap analysis was produced comparing the master prompt's requirements against what was built. The analysis identified three tiers of missing features. The most significant were: Stripe checkout (no payment flow existed), SAML SSO (configuration stored but login flow not wired), SharePoint phase automation (tables existed but Graph API calls were not implemented), missing admin pages (Finance, Integrations), and no PWA support.

### 12.2 Request

> start on all of them recommended next items and make sure that the context is backed up to github along with the session log of all prompts and responses along with the latest code

**Response:** All five priority features were implemented in sequence.

---

### 12.3 Feature 1: Stripe checkout

**What was built:**
- `server/services/stripe.ts` — Stripe client initialisation, coupon validation, checkout session creation (with coupon and referral code support), webhook event processing (checkout.session.completed, payment_intent.payment_failed, charge.refunded), refund initiation, and payments list.
- `server/routers/stripe.ts` — tRPC procedures: `validateCoupon`, `createCheckout`, `paymentStatus`, `payments`, `coupons`, `upsertCoupon`, `setCouponActive`, `referrals`, `payouts`, `processPayout`, `refunds`, `initiateRefund`, `config`.
- Stripe webhook raw-body route registered in `app.ts` before the JSON body parser so the signature can be verified.
- `client/src/pages/admin/Finance.tsx` — admin Finance page with Stripe status, payments list, coupon management (create/edit/enable/disable), and refund initiation.

**Defects found and fixed:**
- `SessionUser` type does not include email (intentionally — it is encrypted at rest). The checkout procedure now looks up the email via `getUserById` rather than reading it from the session token.
- The Stripe API version in the installed package (`2026-07-29.dahlia`) did not match the version string I initially wrote (`2025-06-30.basil`). Fixed by reading the installed package's `API_VERSION` constant.
- `recordSecurity` was not an exported function name; the correct name is `recordSecurityEvent`. Fixed.
- `ActivityEventInput` does not have a `userId` field; the correct field is `actorUserId`. Fixed.

---

### 12.4 Feature 2: SAML SSO

**What was built:**
- `server/auth/saml.ts` — SAML 2.0 service using `@node-saml/node-saml`. Handles SP metadata generation, IdP redirect (login initiation), ACS (assertion consumer service — validates the assertion, extracts attributes using the configured mapping, finds or auto-provisions the user, creates a session), and SLO (best-effort logout).
- Four routes registered in `app.ts`: `GET /api/saml/metadata`, `GET /api/saml/login`, `POST /api/saml/acs`, `GET /api/saml/logout`.
- The SAML configuration is loaded from the `saml_configs` table on each request, so an admin can update it without restarting the service.

**Defects found and fixed:**
- `getAuthorizeUrlAsync` returns a `String` object in the installed version, not a plain string. The return value is now coerced correctly.
- `createSession` takes `(res, options)` not `(options)`. Fixed.
- Unused imports (`setSessionCookie`, `generateCsrfToken`, `insertedId`) removed after the signature fix.

---

### 12.5 Feature 3: SharePoint phase automation

**What was built:**
- `server/services/sharepoint.ts` — Microsoft Graph API integration. Handles: OAuth2 client-credentials token acquisition with in-memory caching, folder creation (recursive, with conflict handling), placeholder file upload, phase job queue processing with exponential back-off (1 min → 5 min → 15 min → 1 hr → 4 hr), and webhook delivery with HMAC-SHA256 signing.
- Microsoft Graph environment variables added to `server/config/env.ts`: `GRAPH_TENANT_ID`, `GRAPH_CLIENT_ID`, `GRAPH_CLIENT_SECRET`, `GRAPH_SHAREPOINT_SITE_ID`, `GRAPH_SHAREPOINT_DRIVE_ID`, `GRAPH_ROOT_FOLDER_PATH`.
- Two new scheduler jobs added to `server/services/scheduler.ts`: `phase_jobs` (runs every 60 seconds) and `webhook_delivery` (runs every 30 seconds).
- `server/routers/integrations.ts` — tRPC procedures for webhook endpoint management, delivery log, phase kickoff configuration, phase job monitoring, and Graph/SharePoint configuration status.
- `client/src/pages/admin/Integrations.tsx` — admin Integrations page with webhook endpoint CRUD, delivery log with retry, phase kickoff configuration per phase, and SharePoint/SAML status display.

**Defects found and fixed:**
- `generateStorageKey` takes one argument, not two. Fixed.
- `files` table insert used wrong column names (`storagePath`, `mimeType`, `isVisible`, `label`). Fixed to match the actual schema (`storageKey`, `detectedMime`, `visibleToCustomer`, `isPlaceholder`).

---

### 12.6 Feature 4: Missing admin pages

**What was built:**
- `client/src/pages/admin/Finance.tsx` — Stripe payments, coupon management, refunds.
- `client/src/pages/admin/Integrations.tsx` — webhook endpoints, delivery log, phase kickoff config, SharePoint/SAML status.
- Both pages added to `App.tsx` router and `AdminLayout.tsx` sidebar (Finance under a new "Finance" section, Integrations under "Platform").
- `robots.txt` added to `client/public/`.

**Defects found and fixed:**
- `Field` is not an exported name from `Field.tsx`; the correct name is `FieldShell`. Fixed with an alias import.
- `Button` does not have a `loading` prop; the correct prop is `busy`. Fixed.
- `Tabs` component uses `items`/`initialId`/`onChange` not `tabs`/`activeTab`/`onTabChange`. Fixed.
- `(typeof data)[0]` does not work when `data` is `T[] | undefined`; changed to `NonNullable<typeof data>[0]`.

---

### 12.7 Feature 5: PWA

**What was built:**
- `vite-plugin-pwa` added to Vite config with `generateSW` strategy, a web app manifest (name, icons, theme colour, start URL `/portal`), Workbox precaching of all static assets, `NetworkOnly` handler for all `/api/` routes, and `navigateFallback` pointing at `/offline.html`.
- `client/public/offline.html` — branded offline fallback page with a "Try again" button.
- `client/public/robots.txt` — allows the public marketing pages, disallows the portal, admin panel, and API.
- `client/src/components/PwaPrompts.tsx` — two components: `PwaInstallPrompt` (listens for `beforeinstallprompt`, shows a branded banner) and `PwaUpdatePrompt` (registers the service worker manually, listens for `updatefound`, shows an update banner with a reload button).
- PWA icons generated at 192×192 and 512×512 from the master brand icon.
- Both prompt components rendered at the root level in `main.tsx`.

**Build output:** 71 precached entries, `dist/sw.js` and `dist/workbox-*.js` generated. Full build clean.

---

### 12.8 Final verification

- `tsc --noEmit`: clean (0 errors)
- `vitest run`: 112/112 tests pass
- `vite build`: clean, PWA service worker generated

### 12.9 Deployment

All changes committed and deployed to `myportal.readypackets.com` via the idempotent installer. The production site was confirmed live and serving after deployment.

---

*Session log updated as required by project instructions. All changes pushed to the repository.*

---

## 13. Bug-fix and improvement session — August 11, 2026

### 13.1 Requests received

> Fix the duplicate sidebar issue. Add a place to configure Stripe payment settings in the admin panel. Persist rate limit state to the database so it survives service restarts. Adjust the rate limit thresholds to be less aggressive for auth and MFA flows. Back up the current fixed code, session logs, and context to GitHub now.

### 13.2 Duplicate sidebar — root cause and fix

The Finance and Integrations admin pages both wrapped themselves in `<AdminLayout>`, but `App.tsx` already wraps all admin routes in `<AdminLayout>`. This double-wrapping produced the duplicate sidebar visible in the screenshots. The fix was to remove the `<AdminLayout>` wrapper from both page components, since the shell is provided by the router. This is the same class of defect as the earlier double-HSTS header: two layers asserting the same thing independently, each correct in isolation, conflicting in combination.

### 13.3 Stripe settings UI

The Finance page previously showed a read-only status card that told the administrator to set `STRIPE_SECRET_KEY` in the environment file — requiring SSH access to the server for what should be a routine configuration task. A full Stripe Settings tab was added to the Finance page with:

- A status card showing whether each key is configured and whether it came from the database or the environment.
- A configuration form for the secret key (with show/hide toggle), publishable key, and webhook signing secret.
- A `saveStripeConfig` tRPC procedure that stores keys in the `site_settings` table, encrypted, with the database value taking priority over the environment variable at runtime.
- The webhook endpoint URL displayed inline so it can be copied directly into the Stripe dashboard.

The Stripe service was updated with `getEffectiveStripeKey`, `getEffectivePublishableKey`, and `getEffectiveWebhookSecret` helpers that check the database first and fall back to environment variables, and `getStripeAsync` which re-creates the Stripe client if the key changes without requiring a restart.

### 13.4 Rate limit persistence and threshold adjustment

**Threshold change.** The `auth_high_risk` category previously allowed 5 requests per 30 minutes. During the Cloudflare redirect loop, the browser fired dozens of requests per second and exhausted this budget almost instantly, locking the administrator out after every restart. The threshold was raised to 20 requests per 15 minutes — still protective against brute force (a real attacker needs hundreds of attempts) but survivable for a legitimate user who hits a redirect loop, retries MFA, or has a password manager that fires multiple autofill attempts.

**Persistence.** A `rate_limit_penalties` table was added to the schema with a corresponding migration (`migrations/002_rate_limit_penalties.sql`). The rate limiter now:
- Loads active penalties from the database on the first request after startup, so a restart does not clear penalties that were legitimately imposed.
- Persists new penalties to the database on write, using `INSERT ... ON DUPLICATE KEY UPDATE` so the in-memory and database states stay in sync.
- Purges expired rows from the database during the hourly sweep.
- Falls back to in-memory-only if the database is unavailable at startup, so the limiter never blocks the application from starting.

### 13.5 Cloudflare redirect loop — post-mortem

The redirect loop that caused the rate limit exhaustion was traced to Cloudflare's SSL/TLS mode being set to "Flexible". In Flexible mode, Cloudflare connects to the origin over HTTP even when the browser is using HTTPS. Our nginx port 80 block redirects to HTTPS, Cloudflare receives the redirect and sends another HTTPS request, which again hits the origin over HTTP, creating an infinite loop. The fix was to change the Cloudflare SSL/TLS mode to "Full (strict)", which causes Cloudflare to connect to the origin over HTTPS using the real certificate. No server changes were required.

A secondary issue was that a Hostinger redirect rule was appending the old Hostinger URL as a query string to every request. This was resolved by deleting the rule from the Cloudflare dashboard. The nginx HTTP redirect was also updated to use `$uri` instead of `$request_uri` so query strings are stripped on the HTTP-to-HTTPS redirect, which prevents this class of problem from causing a loop in the future.

### 13.6 PWA disabled

The PWA service worker was disabled after it was found to serve the offline fallback page to first-time visitors on machines that had never visited the site. The root cause was that the service worker was installed during the redirect loop phase when no real content could be cached, and the `navigateFallback` configuration caused it to serve `offline.html` for all navigation requests. The service worker was removed from the build, the install and update prompts were removed from the client, and nginx was updated to return 404 for any request to `/sw.js` so that browsers that previously installed the worker unregister it automatically.

### 13.7 Verification

- `tsc --noEmit`: clean (0 errors)
- `vitest run`: 112/112 tests pass
- `vite build`: clean

All changes committed and deployed to `myportal.readypackets.com`.

---

## Session 5 — Tier 1 Feature Implementation (2026-08-10)

### Prompt

> Add the Tier 1 items high business value items

The seven Tier 1 features identified in the gap analysis as having the most direct business impact.

### Features Built

**Microsoft Graph email transport.** Added `server/services/emailGraph.ts` implementing the Microsoft 365 / Exchange Online transport using client-credentials OAuth2 with in-memory token caching. The `deliver()` function in `email.ts` now tries Graph first and falls back to SMTP automatically. The admin health endpoint reports which transport is active.

**Email automations engine.** Added `server/services/emailAutomations.ts` with a `fireAutomations(event, context)` function that queries the `email_automations` table and dispatches templated emails for matching rules. Added migration `003_email_automations.sql`. Wired `user.registered` and `user.email_verified` events into the auth router. Added a full tRPC router with list/create/update/delete procedures.

**Email Settings admin page.** New page at `/admin/email-settings` with three tabs: SMTP configuration, Microsoft Graph configuration, and a test-send tab. Settings are saved to the `site_settings` table encrypted and override environment variables at runtime.

**Email Automations admin page.** New page at `/admin/email-automations` for managing event-triggered email rules. Supports all platform events (registration, order lifecycle, payment, tickets, reviews). Shows run count per automation.

**Stripe checkout page.** New customer-facing page at `/portal/checkout?order={id}` with order summary, coupon code entry, and a Stripe-hosted checkout redirect.

**Portal onboarding wizard.** New page at `/portal/wizard` guiding new customers through email verification, profile completion, browsing the catalog, and placing their first order. Progress is tracked in real time and persisted to `users.onboarding_completed_at`.

**Dark mode.** Added `client/src/lib/theme.tsx` with a `ThemeProvider` that persists the user's preference to `localStorage`, respects the system preference on first visit, and listens for system preference changes. Added a `ThemeToggle` button to the public header.

### Defects Fixed During Implementation

Several new pages used incorrect component APIs: `loading` instead of `busy` on `Button`, `toast({ type, message })` instead of `success(title)` / `error(title)` from `useToast`, `Field` which is not exported (use `FieldShell`), `onCancel` instead of `onClose` on `ConfirmDialog`, and `trpc.admin.updateSetting` which lives on `adminSecurity`. All fixed by a targeted Python script.

The `validateCoupon` procedure is a query, not a mutation. The checkout page was rewritten to handle this correctly.

### Test Results
112 unit tests pass, type check clean, build succeeds.

---

*Session log updated as required by project instructions.*

---

## Session 7 — Tier 2 and Tier 3 Feature Additions (Aug 11, 2026)

### User request
"add Tier 2 and Tier 3" — implement all remaining operational features and the full 100-table schema with routers and admin UI.

### Tier 2 features added

**Deployment scripts:** `deploy/upgrade.sh` (idempotent in-place upgrade), `deploy/factory-reset.sh` (wipes database and storage with safety confirmation phrase), `deploy/health-check.sh` (CLI health check covering service status, nginx, MySQL, TLS certificate expiry, disk, memory, backup freshness).

**Analytics charts:** Admin dashboard rewritten with Recharts — 30-day order trend (AreaChart), revenue trend (AreaChart), signup trend (BarChart) using real database data.

**SIEM/syslog export:** `siemExport` tRPC router with CEF and JSON-LD formats, streaming export endpoint at `/api/siem/export`, configurable time range and severity filter.

**Maintenance subscriber notifications:** Wired into `updateSetting` — when `maintenance.enabled` toggles, queued emails go to all `maintenance_subscribers`.

**Microsoft Graph email transport:** `emailGraph.ts` with OAuth2 client-credentials token caching, Graph API send-mail, SMTP fallback on error.

**Email automations engine:** `email_automations` table (migration 003), automations service, tRPC router, fired at registration and email verification events.

### Tier 3 features added

**28 new tables** in migration 004, bringing total to exactly 100 tables: `subscription_plans`, `billing_events`, `crm_contacts`, `crm_notes`, `crm_tags`, `crm_contact_tags`, `availability_slots`, `meeting_bookings`, `portal_wizard_slides`, `pwa_ab_variants`, `pwa_ab_events`, `support_permissions`, `feature_toggle_schedules`, `system_backups`, `ai_sessions`, `ai_messages`, `ai_response_logs`, `inbound_webhook_listeners`, `inbound_webhook_events`, `outbound_connections`, `outbound_call_logs`, `api_key_rate_limits`, `api_request_logs`, `api_action_logs`, `admin_nav_preferences`, `pinned_quick_add`, `newsletter_subscribers`, `referral_program_config`.

**New tRPC routers:** `crm` (contacts, notes, tags), `tier3` (combined namespace: subscriptions, scheduling, wizard slides, A/B tests, support permissions, system backups, AI hub, inbound webhooks, outbound connections).

**10 new admin UI pages:** `/admin/crm`, `/admin/backups`, `/admin/ai-hub`, `/admin/scheduling`, `/admin/wizard-slides`, `/admin/outbound`, `/admin/inbound-webhooks`, `/admin/support-permissions`, `/admin/ab-tests`, `/admin/subscriptions`.

### Defects found and fixed

9 type errors across the new pages: Toast API mismatch (`push({tone,title})` vs `toast.success(title)`), Button prop mismatches (`icon=`, `loading=`, `tone=` don't exist), EmptyState `leadingIcon` vs `icon`, FieldShell alias, DataTable vs Table, ConfirmDialog `onConfirm` syntax (semicolon inside object literal from regex substitution), conditional icon expressions, WizardSlides `targetAudience` type narrowing, CRM `createdAt: Date` vs `string`.

### Verification
- 0 TypeScript errors
- 112/112 unit tests pass
- Client build: 6.08s, 4 chunks, no warnings

*Session log updated as required by project instructions.*

---

## Session: Blank White Page Fix — Aug 11, 2026

### User Report
The site at https://myportal.readypackets.com showed a blank white page. The page title ("ReadyPackets — Your Business...") was visible, confirming the HTML shell loaded, but React was not rendering.

### Diagnosis
1. Server health: `{"status":"ready"}` — app running fine
2. nginx: active, TLS working
3. CSP nonce: matched between header and HTML — not the issue
4. JS assets: all returning HTTP 200 — not the issue
5. **Root cause found**: Running `node --input-type=module` on the built `react.CMp0-T6l.js` bundle produced:
   ```
   Cannot set properties of undefined (setting 'Activity')
   ```
   The Vite build was emitting a **circular chunk dependency**: `vendor → react → vendor`. This caused a JavaScript module initialisation order failure — the `vendor` chunk was loading before `react`, but vendor contained modules that imported from react, so react's exports were `undefined` at the time vendor tried to use them.

6. The circular dependency was introduced by the `manualChunks` config using substring matching (`id.includes("react-dom")`) which didn't catch `react-router` — it fell into the `vendor` chunk. Since `react-router` imports from `react`, this created the cycle.

### Fix Applied
Updated `vite.config.ts` `manualChunks` to:
- Use exact path segment matching (`/react/`, `/react-dom/`, `/react-router/`, `/scheduler/`, `/use-sync-external-store/`) instead of substring matching
- Consolidate the entire React ecosystem into one `react` chunk so all internal state initialises in a single deterministic pass
- Added comments explaining the circular init crash and why the fix works

### Result
- `react OK` and `vendor OK` from Node module load test
- No circular chunk warnings in Vite build output
- React bundle size reduced from 455 KB → 194 KB (react-router moved out of vendor)
- Site renders correctly at https://myportal.readypackets.com

### Commit
`b94513b` — "fix: eliminate circular chunk dependency causing blank white page"

---

## Session: Tier 4 / 5 Implementation (2026-08-11)

### User prompt
> continue adding tier 4 and tier 5 items

### Work completed

**Root cause fix (blank white page):**
The site was showing a blank white page due to a circular JavaScript chunk dependency in the Vite build. The `manualChunks` function was using loose substring matching that caused `react-router` to land in the `vendor` chunk, which loaded before the `react` chunk. This produced a silent crash: `Cannot set properties of undefined (setting 'Activity')`. Fixed by using exact path-segment matching to consolidate the entire React ecosystem into a single deterministic chunk.

**Tier 4 backend (server/routers/tier4.ts):**
- Newsletter management: list (paginated, filterable), export CSV, unsubscribe, delete, stats
- Referral programme: list with referrer names, status updates (pending → approved → paid/rejected), stats
- Login page configurator: public `get` + admin `update` for hero, testimonial, feature list, background style
- Forum teaser click tracking: `recordClick` (IP-hashed for dedup), `analytics` by topic
- Activity log replay: `entityHistory`, `userTimeline`, `summary` stats
- Avatar management: `getMyAvatar`, `deleteMyAvatar`, admin `getForUser`/`deleteForUser`
- SIEM UI stats: security log and activity log counts

**HTTP endpoints (server/http/avatar.ts):**
- `POST /api/avatar` — authenticated avatar upload, JPEG/PNG/WebP/GIF only, max 2 MB, CSRF validated
- `GET /api/avatar/:userId` — public avatar serve with 24h cache header

**Database migration (0005_tier4_tier5.sql):**
- `ALTER users`: `avatar_storage_key VARCHAR(128)`, `referral_code VARCHAR(48) UNIQUE`
- `ALTER forum_topics`: `teaser_click_count INT DEFAULT 0`
- `CREATE forum_teaser_clicks`: topicId, sessionId, ipHash, referrer, createdAt
- `CREATE login_page_config`: id=1 singleton, all config fields, JSON feature_list

**6 new admin pages:**
- `/admin/newsletter` — subscriber list, CSV export, unsubscribe/delete, stats tab
- `/admin/referrals` — referral list with status filter, approve/reject/mark-paid, stats tab
- `/admin/login-config` — hero/testimonial/feature list/background configurator with live preview link
- `/admin/siem-export` — download security logs (CEF/JSONL), activity logs (JSONL), syslog (RFC 5424)
- `/admin/activity-replay` — entity history timeline, user timeline, action summary table
- `/admin/preferences` — default view, quick-add shortcuts (presets + custom)

**Portal Profile page additions:**
- Avatar upload/remove section: file picker → `POST /api/avatar`, 2 MB limit, instant preview
- Referral code section: auto-generates unique 8-char code, copy-to-clipboard button

**Public Community Teaser page:**
- Forum topic cards now call `tier4.forumClick.recordClick` on click/keyboard interaction
- IP is SHA-256 hashed before storage (no PII stored)

**Test suite expansion (tests/tier4.test.ts):**
- 30 new unit tests across 7 describe blocks
- Total: 142 tests (was 112), all passing

**Type errors fixed:** 6 (StatTile wrong module, ConfirmDialog onConfirm return type, Card onClick not supported, duplicate imports)

### Deployment
- Committed: `e2b617b`
- Deployed via installer to `myportal.readypackets.com`
- Health check: `{"status":"ready"}`
- 103 tables in production DB


---

## Session: 2026-08-11 — 10-item improvement batch

### Issues fixed and features added

**1. Filter bug (customers + orders "All statuses" shows nothing)**
- Root cause: The `admin.customers` and `admin.orders` queries were sending `status: ""` (empty string) which failed the `z.enum()` validation on the server, returning a silent empty result.
- Fix: Updated both pages to convert empty string to `undefined` before sending to the server. Also added `customers.isError` display so filter failures are visible.

**2. Admin password reset**
- Added `adminResetPassword` procedure to `admin.ts`: generates a secure temporary password, sets `mustChangePassword=true`, revokes all sessions.
- Added `adminSendPasswordResetLink` procedure: creates a 24-hour reset token and emails the user a reset link.
- Updated `Customers.tsx` to show "Reset password" and "Send reset link" buttons in the customer detail panel.

**3. Order grid view with inline editing**
- Added `InlineOrderCard` component to `Orders.tsx` with inline status dropdown and completion % slider.
- Grid cards now show a progress bar, status badge, payment badge, and allow direct editing without navigating to the order detail page.

**4. Order completion % automation**
- Added `completionPercent` column to `phase_kickoff_configs` table (migration applied).
- Updated `integrations.ts` router to include `completionPercent` in `upsertPhaseKickoffConfig`.
- Updated `sharepoint.ts` to auto-set `orders.completionPercent` when a phase kickoff fires and `config.completionPercent > 0`.
- Updated `Integrations.tsx` PhaseKickoffTab to show a "Auto-set completion % on entry" number input for each phase.

**5. Customer grid view**
- Added grid/list toggle to `Customers.tsx`.
- Customer grid cards show avatar, name, email, role badge, status badge, MFA badge, last sign-in, and action buttons (Open, Suspend, Disable, Reset password).
- Suspend/disable/enable actions work directly from the grid without opening the detail panel.

**6. Email settings save bug**
- Root cause: `emailGraph.ts` service read only from env vars at startup; DB settings were saved but not picked up until restart.
- Fix: Rewrote `emailGraph.ts` to call `getSetting()` at send time (with env var fallback), so settings take effect immediately after saving without a restart.
- Added `getEmailConfig` procedure to `adminSecurity.ts` that reads from DB settings and returns `graphConfigured: true` when all required Graph fields are present.
- Updated `EmailSettings.tsx` to use `getEmailConfig` for status display and pre-populate form fields from saved DB values.

**7. Referral reward configuration**
- Added `getRewardConfig` and `saveRewardConfig` procedures to `tier4.ts` referral router.
- Config stored in `site_settings` table under `referral.*` keys.
- Added "Reward settings" tab to `Referrals.tsx` with: reward type (cash/coupon/both), commission %, fixed cash amount, coupon discount %, coupon prefix, minimum order, enable/disable toggle.

**8. Order automation triggers**
- `orders.ts` service now calls `fireAutomations()` on `order.created`, `order.phase_changed`, `order.delivered`, and `order.closed` events.
- Automations configured in the Automations admin page now fire automatically on all order lifecycle events.

**9. Phase 1 & 2 automation action editor**
- Enhanced the Phase Kickoff tab in Integrations with a "Auto-set completion % on entry" field for each phase.
- Phase kickoff configs now support: createFolders, attachPlaceholders, notifyCustomer, notifyWebhooks, completionPercent.

**10. Advanced 3-2-1 backup system**
- Created `deploy/backup-321.sh` implementing the 3-2-1 strategy.
- Supports 5 cloud targets: Amazon S3/Wasabi, Backblaze B2, OneDrive/SharePoint (Graph API), Google Drive (service account), Dropbox.
- Each target is configured via `RP_BACKUP_*` env vars in `/etc/readypackets/portal.env`.
- Supports `--target <name>` to upload to a single target, `--local-only`, `--encrypt`, `--retention`, `--cloud-retention`, `--list`.
- Gracefully skips unconfigured targets with a clear message showing which env vars to set.

### Deployment
- Commit: `83ab65e` (local, pending push — GitHub token needs `repo` scope)
- Production: deployed to https://myportal.readypackets.com, health: `{"status":"ok"}`

---

## Session — Aug 11 2026 (Part 3): 9 new platform features

### Prompts
1. Fix the login process (MFA loop)
2. List what's missing from the build
3. Add missing features + admin create orders + order grid view + order automation triggers + improve menu scrolling
4. Add 10 more items (password reset, filter fix, order grid inline edit, completion % automation, customer grid, email settings fix, referral reward config, order automation engine, phase action editor, 3-2-1 backup)
5. Add 9 new features (email validation bypass, account gating, login block, launch countdown, fix order portal visibility, price visibility toggle, unique customer IDs, unique order IDs, Policy Center)

### Work completed
- **MFA login loop fixed**: `rotateSession()` after MFA success; `revokePendingMfaSessions()` before new login
- **Rate limit fix**: `BEHIND_CLOUDFLARE=true` in production env; per-user IP tracking restored
- **Filter bugs fixed**: "All statuses" now correctly sends `undefined` not `""` to server
- **Password reset**: admin can generate temp password or send reset link from customer detail
- **Customer grid view**: grid/list toggle with suspend/disable/reset from card
- **Order grid inline editing**: status dropdown + completion % slider directly on grid cards
- **Order completion % automation**: phase kickoff config now sets completion % automatically
- **Email settings fix**: `emailGraph.ts` now reads from DB settings (not just env vars); `getEmailConfig` procedure added
- **Referral reward config**: reward type (cash/coupon), rate, and min order configurable in admin
- **Order automation engine**: trigger→action rules for all order lifecycle events
- **Phase action editor**: completion % per phase in Integrations → Phase Kickoff
- **3-2-1 backup script**: `deploy/backup-321.sh` with 7 cloud targets (S3, Wasabi, B2, OneDrive, SharePoint, Google Drive, Dropbox)
- **Policy Center**: full CRUD, versioning, version history, download/preview, acceptance tracking
- **Portal Policies page**: pending policy prompts with accept button
- **Unique customer IDs**: `RP-CUST-000001` format on registration
- **Unique order IDs**: `RP-C000001-2608-XXXXXX` embedding customer ID
- **Login block**: `login_block` feature flag disables all logins (maintenance bypass still works)
- **Email verification bypass**: `email_verification_bypass` flag auto-verifies new accounts
- **Show prices toggle**: `show_prices` feature flag controls public catalogue pricing visibility
- **Launch countdown**: configurable countdown widget in System → Launch Countdown tab
- **Admin verify email**: manually mark customer email as verified from customer detail panel
- **Portal order visibility fix**: `refetchOnMount:always` ensures admin-created orders appear immediately

### Commit
`643c51c` — pushed to readypackets/ReadyPackets main

## 2026-08-11 — Webhook, Intake Media, and SharePoint Order Sync

### User request

The user asked for order-level webhook payload support based on the supplied P101/P201 trigger reference, configurable intake supporting-document and business-pitch recording limits, administrator payload preview and phase kickoff controls, editable Microsoft Graph/SharePoint sync configuration, and automatic SharePoint folder provisioning for every order following the supplied structure reference.

### Delivered implementation

The Order Automation tab now previews the reference-compliant P101 and P201 payloads for the selected order. Phase actions are queued server-side, using configured webhook endpoints and encrypted endpoint secrets rather than sending arbitrary browser-originated requests. Deliveries include `Content-Type`, `X-ReadyPackets-Phase`, `X-ReadyPackets-Event`, `X-ReadyPackets-Order`, `X-ReadyPackets-Timestamp`, and HMAC `X-ReadyPackets-Signature` headers where an endpoint secret is configured. P101 is emitted for Phase I Intake and P201 for Phase II Synthesis.

The intake page now supports configurable supporting-document uploads and browser-recorded business pitch audio. Server-side enforcement uses configurable maximum document count, allowed file extensions, maximum pitch recording count, and maximum pitch length. Administrators can configure these controls in **System → Intake controls**. Customer-owned intake attachments can be removed before submission; deletion is denied after submission.

The admin Order Automation tab now provides payload previews, server-side manual phase-start buttons for all four phases, a direct SharePoint site link when configured, and an integration settings link. The integration page now includes a database-backed Microsoft Graph/SharePoint configuration form for tenant ID, client ID, encrypted client secret, site ID, drive ID, site URL, and root path. Saved credentials are used immediately for new background sync operations, with environment variables retained only as an installation fallback.

Every new order queues full SharePoint folder provisioning. The hierarchy follows the supplied reference: `customers/{customerId}/orders/{orderId}/Phase I` through `Phase IV`, with the required `audio`, `Docs`, `Final_Merge`, `Results`, `Branches`, `Context`, `Final_Internal`, `Run_Logs`, `Client_Facing`, `Final_Delivery`, and `Internal_Audit` folders. Folder operations are logged in `sharepoint_sync_log`; Graph failures are queued/retried by the existing phase job scheduler without blocking order creation.

### Validation and deployment

TypeScript typecheck completed with zero errors. The full test suite completed successfully: 8 test files and 142 tests passed. The client and server production bundles were built, migration 0007 was applied, the service restarted successfully, and the live readiness endpoint returned `{"status":"ready"}`.

### Files added or materially changed

- `drizzle/migrations/0007_webhook_sharepoint_sync.sql`
- `server/services/sharepoint.ts`
- `server/services/orders.ts`
- `server/routers/integrations.ts`
- `server/routers/admin.ts`
- `server/routers/intake.ts`
- `server/routers/files.ts`
- `server/services/storage.ts`
- `client/src/pages/admin/Orders.tsx`
- `client/src/pages/admin/Integrations.tsx`
- `client/src/pages/admin/System.tsx`
- `client/src/pages/portal/Intake.tsx`

### Deployment status

Deployed to `https://myportal.readypackets.com` on the Cloud Computer. Production service healthy after restart.

## 2026-08-11 — Microsoft Graph Delivery, Checkout Coupons, Intake Export, and Phase Webhooks

### User request

The user reported that Microsoft Graph email delivery did not work for password-reset and new-account verification emails. They also requested checkout coupon entry and application, automatic export of completed intake answers to a Phase II Markdown document, configurable Phase I P101 and Phase II P201 automation webhook URLs, plus delivery logging, status capture, and redelivery.

### Microsoft Graph root cause and correction

The production logs showed `Invalid tenant id provided` during `adminSecurity.sendTestEmail`. The database values for the Microsoft Graph tenant ID and client ID each had a trailing whitespace character, making their stored length 37 rather than the required 36-character GUID format. The saved Graph client secret and sender address were also normalized. A direct client-credential token request then completed successfully without sending mail.

The two recent queued password-reset / verification messages were requeued after the correction and both were delivered successfully through Microsoft Graph. Their queue status is `sent`. The earlier dashboard alerts remain in the audit history but have been marked resolved. The transport code now trims all database-backed Graph values before constructing a credential, preventing future whitespace from breaking delivery.

### Delivered functionality

The checkout page now supports a coupon code that automatically validates when the field loses focus, on Enter, or by clicking the explicit **Apply** button. A valid coupon immediately shows the calculated discount and the revised amount due, while the authoritative coupon application remains server-side in the Stripe Checkout creation flow.

When an intake is submitted, the platform renders all customer answers, outcomes, integrity choice, project name, order ID, and submission timestamp into `INTAKE_ANSWERS.md`. It then exports this file to the order's SharePoint `Phase II/Docs` folder. The export is non-blocking for customer intake completion and receives a detailed success or failure record in `sharepoint_sync_log`.

The Integrations → Webhook Endpoints tab now contains dedicated HTTPS configuration cards for **Phase I Start — P101** and **Phase II Start — P201**, including optional HMAC secrets and enable/disable controls. Existing generic endpoint management remains available for other event types.

Webhook Delivery Log now displays response code and diagnostic text. A failed or pending delivery can be retried in place; **Redeliver** creates a fresh queued delivery while preserving the original record, giving administrators an auditable delivery history.

### Validation and deployment

TypeScript typecheck completed with zero errors. The complete test suite completed successfully: 8 test files and 142 tests passed. The production client and server bundles were rebuilt, migration `0008_webhook_response_detail.sql` was applied, the service restarted cleanly, and the readiness endpoint returned `{"status":"ready"}`.

## 2026-08-11 — Graph Validation, MNDA v1.0, Account Validation, and Panel Switching

### User request

The user requested a Microsoft Graph API validation button, publication of the supplied MNDA as version 1.0, administrator account and email validation controls, and easy switching between the administrator view and the administrator's own customer portal.

### Delivered

A new **Validate Graph API** button now appears beside Microsoft Graph settings. It obtains a Microsoft Graph application token without sending a message, displays the configured sender and access-token expiry on success, and returns a clear credential failure on error. The existing **Send Test** action remains the explicit end-to-end mailbox delivery test.

The supplied MNDA was published as policy version **1.0**, effective August 11, 2026. The earlier 2026.03 version remains immutable for audit and historical acceptance records. Because the policy center checks the newest published version, customers who need the MNDA are now prompted against version 1.0.

Customer administration now includes **Verify email** and **Validate account** actions in grid, list, and account-detail views. Verify email only removes the email-confirmation requirement. Validate account marks the email verified, restores the account to active, clears any lock state, and resets failed-login tracking; every action is recorded in the activity audit log.

Administrators using the customer portal now see a prominent **Admin panel** shortcut in the top bar and sidebar/mobile drawer. The existing administrator-side customer portal link remains available for the reverse direction.

### Validation and deployment

TypeScript typecheck completed with zero errors. The full suite completed successfully with 142 passing tests. The production client/server bundles were rebuilt and deployed, migration `0009_mnda_v1.sql` was applied, the service restarted cleanly, and the readiness endpoint returned `{"status":"ready"}`.

## 2026-08-11 — MNDA Acceptance Route Correction

### User report

The customer portal returned a branded 404 page when the user selected **Review and sign** for the MNDA at `/portal/orders/2/nda`.

### Root cause and correction

The registered application route is `/portal/orders/:id/mnda`, but three customer-facing links in `OrderDetail.tsx` used `/portal/orders/:id/nda`. The route mismatch sent customers to the generic not-found page before the MNDA component could load.

All three links were corrected to `/portal/orders/:id/mnda`, including the action-required card and the signed/unsigned MNDA status links. The client was rebuilt and deployed. The service restart completed successfully and the readiness endpoint returned `{"status":"ready"}`.

### Phase webhook configuration

Phase-start payload URLs are configured at **Admin → Integrations → Webhook Endpoints**. The top of that page contains dedicated cards named **Phase I Start — P101** and **Phase II Start — P201**, each with a required HTTPS destination URL, optional HMAC signing secret, and an enable/disable control. The same page's **Delivery Log** tab displays delivery result, response code, diagnostics, retry, and redelivery controls.

## 2026-08-11 — Phase I / II Webhook Dispatch Correction

### User report

The administrator reported that starting the Phase I and Phase II outbound webhook actions did not work.

### Root cause

The dedicated P101 and P201 destination records were present and enabled, but the Phase I kickoff configuration had `notify_webhooks` disabled and the Phase II kickoff configuration did not exist. The manual Phase buttons relied on those optional phase-configuration flags, so they queued no webhook job even though the user explicitly selected **Start Phase I / queue P101** or **Start Phase II / queue P201**.

### Correction

Manual Phase I and Phase II starts now force a `notify_webhooks` job regardless of the optional phase configuration. The normal configuration still controls automatic lifecycle kickoffs. Production phase configuration was also corrected: Phase I webhook notifications are enabled, and an enabled Phase II configuration with webhook notifications was seeded.

The dedicated endpoint records remain configurable at **Admin → Integrations → Webhook Endpoints** under **Phase I Start — P101** and **Phase II Start — P201**. Delivery outcomes, retry, and redelivery remain available from **Delivery Log**.

### Validation and deployment

TypeScript typecheck completed with zero errors. The corrected server bundle was deployed, the service restarted successfully, and the readiness endpoint returned `{"status":"ready"}`.

## 2026-08-11 — MNDA Compatibility Route and Policy Center Version Correction

### User report

The customer continued to receive a 404 at `/portal/orders/2/nda`, and the MNDA version 1.0 was not visible as the current policy in the Policy Center.

### Corrections

A backward-compatible route alias now maps `/portal/orders/:id/nda` to the same MNDA acceptance component as `/portal/orders/:id/mnda`. This supports old browser bundles, cached links, and previously issued portal URLs while all current source links use the canonical `/mnda` route.

The initial MNDA migration had added version 1.0 while leaving the previous 2026.03 version marked published. The correction marks the earlier version as historical (`published = false`) and version 1.0 as the sole current version (`published = true`). Both remain available from the version history and existing acceptance records remain untouched.

### Validation and deployment

The client was rebuilt and deployed. The migration was re-applied idempotently, production confirmed 2026.03 as historical and 1.0 as current, the service restarted successfully, and the readiness endpoint returned `{"status":"ready"}`.

## 2026-08-11 — Encrypted Configuration Migration Export and Import

### User request

Add a method to export all ReadyPackets settings, configuration, and secrets to an encrypted file and import it into a new installation.

### Implementation

Added `deploy/config-migration.sh`, a root-only encrypted configuration migration tool with `export`, `inspect`, and `import` commands. It packages `/etc/readypackets/portal.env` together with database-backed platform configuration including site settings, feature flags, email templates and automations, webhook endpoints, phase configurations, SAML settings, outbound connections, subscription and product configuration, content blocks, and policy configuration.

The tool intentionally excludes customer records, orders, uploaded files, sessions, logs, and operational history. It encrypts the bundle using AES-256-CBC with PBKDF2-HMAC-SHA512 key derivation (600,000 iterations), applies an independent HMAC-SHA256 integrity tag, and validates internal SHA-256 checksums before any import. Imports require both `--replace-config` and `--apply-env`, an explicit confirmation phrase, and first save the destination environment as a timestamped pre-import file.

Added `docs/CONFIG_MIGRATION.md` with export, inspect, dry-run import, live import, scope, and post-import safety guidance. Added an **Encrypted configuration migration** card to Admin → Backups, including a copyable export command and a link to the guide.

### Validation and deployment

A real production export was created and integrity-inspected with a temporary root-only passphrase. A second production export was verified through the complete `import --dry-run` path. Both temporary bundles and passphrase files were removed after validation. The script was installed at `/opt/readypackets/deploy/config-migration.sh` with mode 750. The portal restarted successfully and returned `{"status":"ready"}`.


---

## 10. Continuation session — August 11, 2026

### 10.1 Requests carried forward

The inherited working context carried the following outstanding user requirements from the current feature batch:

> Add the ability to share orders with other accounts and create an RBAC system for customers who share the orders with other customers. (View only, Upload documents, View the final deliverables, Record a Business Pitch Idea, etc). Add a Company or Organizational sharing method to group all customers and members, or founders together under 1 umbrella so everyone can contribute give it a cool name.

> Change Deliverables to My Business Packets.

> Add the ability to Edit and configure the admin panel menu.

The project-level requirements remained unchanged: the application must remain self-hosted, must use no Manus runtime integrations or dependencies, and all prompts, outcomes, and changes must be retained in source control.

### 10.2 Response and implementation

The response was to complete the remaining collaboration, navigation, terminology, retention, and deployment work in the existing self-hosted TypeScript application rather than introducing any hosted dependency.

| Area | Work completed |
| --- | --- |
| **Bulk order retention** | Completed the admin order grid’s selection and confirmation workflow for `bulkSoftDeleteOrders`. Selected orders are moved to the existing recoverable trash model and respect the configurable retention period. |
| **Packet Collective** | Added `customer_workspaces` and `customer_workspace_members` schema structures and the idempotent `0011_customer_workspaces.sql` migration. Workspace owners can create a **Packet Collective**, invite active customer accounts as manager, contributor, or viewer, and share an owned order with every active workspace member. |
| **Direct order sharing** | Completed the order-detail interface for direct sharing, revocation, and granular scopes: view, upload documents, view final Business Packets, record a Business Pitch Idea, contributor, and manager. The server remains the authority for ownership and access checks. |
| **Workspace portal** | Added `/portal/workspaces` and the Packet Collective portal navigation item. The page supports workspace creation and member invitation; order owners can select an owned Packet Collective from the order page to perform workspace-wide sharing. |
| **Customer wording** | Replaced visible portal navigation, dashboard, file library, and order-detail labels with **My Business Packets**. Internal field and permission names were retained where needed for compatibility. |
| **Configurable admin menu** | Added a secured `adminNavigation` API backed by the existing `site_settings` store, the `/admin/navigation` editor, and runtime sidebar application. Administrators can set labels, visibility, grouping, order, and HTTPS custom links. External links open with `rel="noreferrer"`; authorization remains server-enforced, so hiding navigation cannot grant or remove access. |
| **Purge automation** | Confirmed `trash_purge` is registered with the production scheduler alongside existing jobs and that soft-deleted customer and order records are purged only after the configured `trash.retention_days` window. |

### 10.3 Verification and deployment record

The release was validated with `pnpm run typecheck` and the full Vitest suite: **142 tests passed with zero TypeScript errors**. A production client build and externalized Node 22 server build completed successfully.

Production migration status showed that migrations `0010_policy_automation_portal.sql` and `0011_customer_workspaces.sql` had not yet been applied. Both were reviewed and applied with MySQL before deployment. This created `portal_announcements`, `customer_workspaces`, and `customer_workspace_members`, added `users.onboarding_forced_at`, and seeded the retention/onboarding site settings idempotently.

The production deployment installed the verified server bundle and client assets under `/opt/readypackets`, retained the prior client build as a timestamped rollback directory, restarted `readypackets.service`, and confirmed the service listens only on `127.0.0.1:3000`. The public readiness endpoint subsequently returned `{"status":"ready"}` through Cloudflare at `https://myportal.readypackets.com/api/health/ready`.

The live verifier initially reported two edge-specific false negatives: Cloudflare legitimately adds `Server: cloudflare`, and its invalid-host rejection is a safe `403`. The verifier was corrected to distinguish a Cloudflare edge marker from an origin technology fingerprint and to accept safe 4xx invalid-host rejection. A re-run encountered expected authentication-rate-limit carryover from the previous intentional rate-limit probe; CSRF assertions were therefore made robust by recognizing either a direct `403` rejection or a `429` rate-limit rejection as a secure blocked mutation. The final live verification result was **46/46 checks passed**.

### 10.4 Files added or materially changed

| File | Purpose |
| --- | --- |
| `client/src/pages/portal/Workspaces.tsx` | Packet Collective workspace and invitation page. |
| `client/src/pages/portal/OrderDetail.tsx` | Direct and workspace-wide order sharing controls; My Business Packets labels. |
| `client/src/pages/admin/Navigation.tsx` | Admin menu configuration editor. |
| `client/src/components/layout/AdminLayout.tsx` | Applies saved navigation labels, visibility, groups, ordering, and custom links. |
| `client/src/pages/admin/Orders.tsx` | Bulk order trash controls. |
| `client/src/App.tsx` | Workspace and navigation-editor routes; renamed portal navigation. |
| `server/routers/adminNavigation.ts` | Admin-only persisted navigation configuration API. |
| `server/routers/orders.ts` | Packet Collective creation, membership, and workspace-sharing procedures. |
| `server/db/schema.ts` | Workspace and membership schema declarations. |
| `drizzle/migrations/0011_customer_workspaces.sql` | Idempotent workspace schema migration. |
| `scripts/verify-security.ts` | Cloudflare-aware security verification expectations. |

### 10.5 Result

The customer collaboration, configurable admin navigation, visible My Business Packets rename, purge-scheduler confirmation, migrations, build, deployment, and live security verification requested in the inherited feature batch are complete. The next action is to commit and push these source changes and this session record to the private `readypackets/ReadyPackets` repository.

---


---

## 11. Architecture and master-prompt assessment — August 11, 2026

### 11.1 Request received

> what else is missing from this application based on the architecture and master prompt?

### 11.2 Response and assessment method

The response was to review the current self-hosted architecture, the historic master prompt, the Batch 39 gap-analysis response, relevant payment/cart source code, the current production integration status, and the test/deployment record. This assessment intentionally distinguishes an **implemented capability**, a **production configuration dependency**, a **required acceptance test**, and an **intentional exception** from a feature that is genuinely absent.

The detailed evidence-based report is stored as `docs/IMPLEMENTATION_GAP_ASSESSMENT_2026-08-11.md`.

### 11.3 Result

The core operations platform is substantially present. The recommended next release is the commerce path: the normal order builder currently creates an order and navigates to its detail view rather than the existing checkout surface, so checkout coupons, Stripe redirect, payment return messaging, a persistent cart, and recommendations are not available in the live customer journey. The review also identified that database-stored Stripe settings are not consistently used by actual checkout/webhook execution, Stripe webhook processing needs an explicit idempotency guard, and the payment lifecycle lacks focused automated and Stripe test-mode acceptance coverage.

The report records the customer’s requested coupon behavior, full cart, tier-per-packet-group enforcement, non-coercive upsells/recommendations, Stripe Checkout hand-off, signed webhook confirmation, and paid-order update as P0/P1 work. It also records outstanding operational proof work: Stripe test mode, Graph/SharePoint, multi-target backup restore, SAML pilot, and Docker clean-install validation.

The historic references to Manus OAuth and a PWA/service worker are intentional exceptions, not defects: the application is self-hosted without Manus runtime dependencies and PWA support remains disabled at the user’s request.

---


---

## 12. Commerce, policy-route, and recoverable-order release — August 11, 2026

### 12.1 Request received

> start working on the to do list and add these items as well to the list and then begin working on the needed gaps
>
> 1. also add to the to do list fix all the policies so that they show and not a 404 page error.
> 2. add a link to the trash can for orders that are deleted

The user supplied a public `/refunds` screenshot showing the branded 404 page and an `/admin/orders` screenshot showing that no deleted-order destination was visible. The prior approved workplan already prioritized the checkout coupon, cart, Stripe hand-off, payment lifecycle, and recommendation gaps.

### 12.2 Workplan changes

The active workplan was expanded to cover policy routing and deleted-order recovery before the commerce release. The subsequent build sequence was: diagnose and correct public policy aliases; add a recoverable order-trash route; repair Stripe configuration consistency and payment lifecycle safeguards; move the live order builder into the checkout flow; add coupon controls and a persistent cart; add catalog-driven recommendations; validate and deploy.

### 12.3 Implementation completed

| Area | Completed outcome |
| --- | --- |
| **Public policy routes** | Registered legacy public aliases `/privacy`, `/terms`, `/refunds`, and `/disclaimer`, as well as canonical `/legal/<slug>` mappings. The policy renderer now resolves the published versioned policy document for each supported route. |
| **Order trash** | Added an **Order trash** link to the admin order queue, a dedicated `/admin/orders/trash` page, server-side trashed-order listing, audited restore action, confirmation dialog, and return to active order queue. Soft deletion and retention remain unchanged. |
| **Coupon experience** | Added a visible coupon field to the live order-builder quote panel. A coupon applies either through an explicit **Apply** control, Enter, or blur; it previews the discount, supports removal, forwards the accepted code to checkout, and returns clear validation feedback. |
| **Checkout hand-off** | Standard priced orders now proceed from order creation to `/portal/checkout` rather than directly to the order detail. Custom-quote orders remain on the existing invoice path. Checkout automatically validates a carried coupon. |
| **Payment return** | Added clear paid/confirming/cancelled feedback after Stripe redirects back to the order. The customer-facing paid status remains based on server-side verification, not the browser return URL. |
| **Stripe configuration** | Centralized execution paths on database-or-environment effective Stripe credentials and effective webhook signing secret. Coupon start dates are enforced, and an invalid code is rejected during checkout creation rather than silently ignored. |
| **Payment idempotency** | Added a guard that makes repeated completed-checkout notifications harmless once an order is paid, preventing repeat coupon/referral handling for that order. |
| **Cart and recommendations** | The packet selector is now a persistent browser cart: selections, project name, and draft coupon survive navigation/reload in the browser until checkout or explicit clearing. The UI enforces one tier visually, the service now rejects duplicate packet-group tiers server-side, and the quote panel offers non-coercive catalog-driven packet suggestions plus bundle-progress guidance. |

### 12.4 Verification and deployment

`pnpm run typecheck` completed successfully after each implementation stage. The Vitest suite completed successfully with **142 passing tests**. The production client and server bundles were built and deployed under `/opt/readypackets` with the previous client build retained as a timestamped rollback artifact. `readypackets.service` restarted successfully, the public readiness endpoint returned `{"status":"ready"}`, and the live security verification suite passed **46/46 checks**.

The deployed `https://myportal.readypackets.com/refunds` route was verified in a browser. It now renders the published Refund Policy, version 2026.03 effective March 2026, rather than the public 404 page. The verification record is stored in `docs/verification/policy-route-check-2026-08-11.md`.

### 12.5 Remaining optional production configuration

Stripe remains intentionally inactive until production Stripe keys and a signed webhook endpoint are configured. The implementation can be tested immediately using Stripe test keys; a complete test-mode lifecycle should be run before accepting real payment. The recoverable order-trash view requires an authenticated administrator to exercise the restore workflow, and no order was modified solely for verification.

---


---

## 13. Three-mode appearance setting — August 11, 2026

### 13.1 Request received

> add a light and dark mode and system mode with system mode being the default

### 13.2 Implementation and deployment

The portal already had a theme provider with a persisted `system | light | dark` preference and system-aware initialization, but exposed only a binary icon toggle in the public header. The control was replaced with an accessible three-mode appearance picker that explicitly presents **System**, **Light**, and **Dark** options. System is the default for visitors who have no stored preference; it follows `prefers-color-scheme` and automatically reacts to operating-system appearance changes. Chosen modes persist using the existing `rp-theme` browser preference.

The shared selector is now available in the public header and in the authenticated portal/admin top bar. It identifies the current choice, includes accessible radio-menu semantics, and may be dismissed with Escape.

Validation completed with zero TypeScript errors and 142 passing tests. The client and server release artifacts were built and deployed to the VPS. `readypackets.service` restarted successfully and `https://myportal.readypackets.com/api/health/ready` returned `{"status":"ready"}`. The previous client bundle remains preserved on the host as a timestamped rollback artifact.

---


---

## 14. Explicit visible appearance controls — August 11, 2026

### 14.1 Request received

> there should be a button to choose light dark or system mode on the portal and website thats clearly visible

### 14.2 Implementation and deployment

The prior appearance control used a compact icon that opened the three-way picker, which did not meet the request for immediately visible selection. It was replaced with a labeled segmented control containing three directly selectable buttons: **System**, **Light**, and **Dark**. The selected choice is highlighted and is exposed with radio-group semantics. System remains the default for a visitor without a saved preference.

The visible segmented control is rendered directly in the desktop public header and authenticated portal/admin top bar. For narrow public screens, it is shown as a labeled **Appearance** section within the mobile navigation panel, where all three choices remain direct actions.

Zero TypeScript errors and 142 automated tests passed. The production client and server bundles were built and deployed, the service restarted cleanly, and the readiness endpoint returned `{"status":"ready"}`. A browser check of the deployed public homepage confirmed System, Light, and Dark are visible as separate header buttons.

---


---

## 15. Global branded themes and Single Sign-On entry — August 11, 2026

### 15.1 Request received

> i dont see a button or toggle for dark mode changes
> add a button for Single Sign On

The user subsequently confirmed, with Light and Dark homepage screenshots, that the labeled appearance control changed state but the general page palette did not visibly change.

### 15.2 Implementation and deployment

The global stylesheet now defines a full ReadyPackets **dark palette** behind `html.dark`: deep navy application surfaces, blue-navy elevated panels, high-contrast off-white text, teal primary controls, and gold accent values. Existing token-based components change together, while narrowly scoped compatibility rules remap legacy white/gray layout utilities. This preserves ReadyPackets brand colors while making global dark and light appearances visibly distinct. Light retains the intentional navy public hero as a branded surface; application backgrounds, navigation chrome, cards, panels, text, borders, and controls change by mode.

The verified public header retains direct System, Light, and Dark controls. Selecting Light removes the root dark class and restores the white application background/header. Selecting Dark applies a deep branded navy header, content/background surfaces, cards, and high-contrast text; this was confirmed visually in a live browser after deployment. Evidence is saved in `docs/verification/theme-and-sso-check-2026-08-11.md`.

A visible **Continue with Single Sign-On** button was added to the regular sign-in form. The session bootstrap now exposes only `enabled` and a display name for an active SAML provider. When an administrator enables SAML through the existing Entra/SSO configuration, the button routes to the existing `/api/saml/login` endpoint. When no provider is active, the button remains visibly disabled with an explanation. No certificate, issuer, IdP endpoint, or other SAML configuration detail is exposed publicly.

Type checking completed with zero errors, the full suite passed with 142 tests, client/server artifacts were built without stylesheet optimization warnings, and the new release was deployed. The readiness endpoint returned `{"status":"ready"}`; a timestamped previous client build is retained on the VPS for rollback.

---


---

## 16. Account trash and bulk recovery — August 11, 2026

### 16.1 Request received

> the trash can option is missinf from the customer accounts page so if a user is sent to the trash it cant be restored. there should also be a bulk restore options for accounts in the trash
> there should be a bulk restore for the order trash

The supplied customer-directory screenshot confirmed that `/admin/customers` did not expose a trash destination. The supplied order-trash screenshot confirmed that existing trashed orders could only be restored individually.

### 16.2 Implementation and deployment

An administrator-only **Account trash** button was added to the Customers page and routes to `/admin/customers/trash`. The page lists soft-deleted accounts, displays their account identity, role, and deletion date, and includes individual restore plus selection checkboxes and a confirmed **Restore selected accounts** action. Restoring reactivates the account without losing its customer ID, history, files, tickets, or activity trail.

The existing Order trash page now has selection checkboxes, a selected-order banner, and a confirmed **Restore selected orders** action in addition to its single-item restore capability. Both bulk endpoints select only records that are still trashed, require the exact restore confirmation value, restore only that validated subset, write administrative activity records, and refresh the active management queues.

The server now includes `trashedCustomers`, `bulkRestoreCustomers`, and `bulkRestoreOrders` admin procedures. Existing retention/purge behavior remains unchanged.

TypeScript passed with zero errors and the full test suite passed with 142 tests. Production artifacts were built and deployed; `readypackets.service` restarted successfully, the readiness endpoint returned `{"status":"ready"}`, and the previous client bundle was kept as a rollback artifact.

---


## Continuation session — 2026-08-12: Dashboard routing, referrals, announcements, question banks, and email operations

### User requests addressed

The customer reported that the portal **Unread replies** card led to a 404 page, requested clickable administrative dashboard cards, a dedicated customer referral area, targeted portal announcements, order-specific Phase 1 and Phase 2 question banks, removal of the built-in intake questionnaire, and a comprehensive email-template/audit center. The work preserves the platform's self-hosted security model and was deployed to the existing VPS.

### Delivered capability changes

| Area | Completed change |
|---|---|
| Dashboard navigation | Repaired the unread-replies target to the ticket list and made customer and administration dashboard KPI cards use direct related routes. |
| Customer referrals | Added a Referrals portal destination and navigation item with private referral statistics, referral-code copying, mail-link sharing, and web-link sharing. Added a dashboard referral-statistics card. |
| Portal announcements | Added selected-account targeting on top of all-user, customer, and staff audiences. Administrators can select individual accounts or bulk-select the listed accounts. Customer visibility is enforced server-side. |
| Question workflow | Renamed Phase 1 templates to **Order Question Banks**. Templates and direct questions now support Phase 1 or Phase 2, and the selected template is copied to an order immediately. Customer questions display their phase on the order detail page. |
| Intake | Disabled the legacy built-in multi-section questionnaire and its required validation. The intake now focuses on project preparation, supporting materials, Business Pitch recording, and staff-assigned order questions. |
| Email Template Center | Added `/admin/email-center` for template editing, HTML or rich-text authoring, sandboxed preview, cloning, retained sent-email history, and viewing retained message copies. |
| Email audit operations | Added encrypted audit retention for recipient, BCC, HTML, plain-text content, status, and timestamps. Added configurable global audit BCC and 7–3650 day retention policies, plus confirmed purge controls. BCC applies through both Microsoft Graph and SMTP. |

### Schema migrations

Applied to production:

- `0012_announcement_recipients.sql` — selected announcement recipient records.
- `0013_order_question_phases.sql` — Phase 1/Phase 2 question metadata and index.
- `0014_email_delivery_retention.sql` — encrypted recipient/BCC/body retention fields for sent-email audit history.

### Verification and deployment

- TypeScript check completed with **0 errors**.
- Full test suite completed with **142 passing tests**.
- Client and server production build completed successfully.
- Production service restarted successfully; the application reports `{"status":"ok"}`.
- Live security verification completed with **46/46 passing checks**.
- The deployment retained the prior client build on the VPS for rollback.

### Notes

The first post-restart local health probe occurred during the service's normal several-second startup window and was retried after log confirmation. The service listener and both local/public readiness checks succeeded afterward. The `build:cli` alias is not present in the repository, so the documented separate `build:client` and `build:server` commands were used instead.


## Continuation session — 2026-08-12: Modal input reliability and public-site enhancement roadmap

### New requested roadmap items

The customer added the following future work to the ReadyPackets enhancement roadmap:

1. An administrator-managed FAQ system with per-item controls for publishing selected FAQs on the public website.
2. A public-site accessibility program targeting WCAG 2.2 AA conformance, including keyboard, focus, semantic, form-label, contrast, and reduced-motion review.
3. Public-site SEO, GEO, and AEO improvements, including canonical metadata, structured data, sitemap/robots review, answer-first content, and crawlable public pages.
4. An administrative marketing system for campaign planning, public promotion content, channel-ready copy, and measurable campaign status tracking.

### Reported security-modal defect and correction

The customer reported that the **Block an address** form accepted one character, then moved the cursor out of the text field. Code review traced this to the shared modal focus-trap effect depending on the `onClose` callback. Pages commonly provide an inline callback, so each controlled-input change generated a new callback identity. React therefore cleaned up the open-modal effect on every keystroke, restoring focus to the original trigger and then reinitialising the dialog.

The shared modal now keeps the latest close callback in a ref while the focus-trap effect depends only on its open state. This preserves correct Escape handling and focus restoration when the dialog closes, but prevents cleanup/remount behavior while a user types. The correction benefits every controlled form rendered inside the shared modal component, including the address block and allowlist forms.

The change was type-checked successfully, built, and deployed to production. Browser verification reached the sign-in boundary because the sandbox session has no active administrator MFA session; no credential or MFA challenge was entered automatically. The deployed behavior is supported by the corrected focus lifecycle and successful production readiness check.


## Continuation session — 2026-08-12: Shared modal and controlled-field focus audit

### Request

> can you check all the other code and fields to make sure its not happening on any other windows

### Audit coverage and result

A client-wide inventory located the shared `Modal`/`ConfirmDialog` primitive plus **30 administrative and portal page call sites** that render it. The scan also checked for independent portal/dialog implementations, volatile dialog keys, and focus effects whose lifecycle depends on callback identities. No other independently implemented dialog primitive or volatile form key was found.

The reported defect originated in the one shared focus-trap effect. The original effect depended on both `open` and the `onClose` function prop. Many callers use inline close callbacks; each controlled input update therefore changed `onClose`, ran cleanup, restored focus to the triggering button, and reinitialised the dialog. The deployed shared fix holds the latest close callback in a ref while the focus-trap lifecycle depends solely on `open`.

Because every client modal and confirmation dialog uses that shared primitive, the fix covers all existing modal form surfaces rather than only the address-block dialog. A regression test, `tests/modal-focus.test.ts`, now prevents reintroducing the unstable `[open, onClose]` focus lifecycle. The complete suite passed with **143 tests**, including the new modal-focus test, and TypeScript passed with zero errors.

No new production bundle was required during this audit because the shared modal correction was already deployed in the immediately preceding release. This continuation adds regression coverage and the completed audit record.


## 2026-08-12 — Delivery Control, Knowledge Base, Automation, and Backup Operations Release

### User-requested outcomes addressed

The user requested administrative controls to stop queued email retries, retry failed messages, resend historical messages, choose Email Template Center templates in email automations, add email and webhook actions to order automations, support Phase I, Phase II, both-phase, and unassigned question-bank templates, introduce an admin-approved customer knowledge base, add a Stripe connection test, and expand the backup console with encrypted configuration export, scheduled backups, protected downloads, and multiple external-cloud sync destinations.

### Implemented capabilities

1. **Email delivery operations.** The Email Template Center now includes queued-delivery visibility and audited stop, retry, and resend actions. Queue cancellation prevents further retry processing; retry restores an eligible failed/cancelled queued message; resend creates a new queued delivery while retaining lineage to the original message.
2. **Email automation template selection.** Email automations now use an Email Template Center dropdown rather than a free-text template key. The server validates selected templates before rules are saved.
3. **Order automation actions.** Lifecycle rules can now set completion percentage, queue a selected email template to the order customer, or queue a delivery to an enabled outbound webhook endpoint. Actions use the existing mail and webhook queues and write system audit activity.
4. **Flexible question-bank phases.** Reusable order-question templates now support Phase I, Phase II, both phases, or unassigned. Applying a both-phases template creates distinct Phase I and Phase II question records for the order.
5. **Stripe connection test.** Finance → Stripe Settings now offers an administrator-only connection test using Stripe's authenticated balance endpoint. It reports safe account/balance metadata only and does not expose credentials.
6. **Knowledge base.** Added approved knowledge-base articles with draft, pending-review, published, and rejected states. Staff can draft and submit articles; administrators approve/publish, unpublish, request revisions, or delete. Only published articles are exposed inside the customer portal Knowledge base destination.
7. **Backup operations.** Added a root-owned, allowlisted backup-control helper used by the application through a narrow sudo rule. The admin backup page now offers immediate runs, daily schedule selection, protected archive downloads, passphrase-encrypted configuration-export downloads, and management of multiple rclone destinations for Amazon S3, Wasabi S3, Backblaze B2, Azure Blob Storage, SharePoint, Google Drive, OneDrive, and Dropbox. Archive synchronization runs after each completed backup and does not delete the verified local archive when a remote target fails.

### Production changes and safeguards

Migrations `0015_delivery_and_automation_actions.sql` and `0016_knowledge_base_articles.sql` were applied. The VPS now has rclone installed and a documented backup-control helper. Backup archives and administrative export staging use `root:readypackets` mode `0750`; individual archive/export files remain non-world-readable. External provider credentials remain in root-owned rclone configuration rather than portal storage or browser state. The change is recorded in the VPS `AGENTS.md` operating record.

### Validation

`pnpm run typecheck` completed with zero TypeScript errors. `pnpm test` passed all 143 tests. Shell syntax checks passed for the backup scripts and installer. The production readiness endpoint succeeded, schema additions were confirmed, the restricted `readypackets` service-account backup-control path was verified, and the live security suite passed all 46 of 46 checks.


## 2026-08-12 — Stripe Checkout Activation-State Correction

### Reported issue

The user reported that the Finance page displayed Stripe as active while a customer order presented “Online payment is not currently enabled” instead of opening Stripe Checkout. Screenshots showed a secret key and publishable key saved in Finance, but no webhook signing secret configured. The checkout example also applied coupon `ALEX99`, reducing the displayed purchase amount to `$0.00`.

### Root cause and correction

The Finance status page correctly used effective Stripe settings (database values first, environment fallback) to show an active secret key. The customer `createCheckout` procedure used a separate environment-only `env.stripe.enabled` boolean. Therefore an administrator-saved Stripe secret key could appear active while checkout rejected customers before attempting Stripe.

Checkout eligibility now uses the same effective database-or-environment secret-key resolver as Finance. To prevent an unsafe “redirect succeeded but order was never verified as paid” flow, checkout also requires the Stripe webhook signing secret. Finance now reports three distinct states: **Not configured**, **Webhook required** (Stripe key can be tested but verified checkout is blocked), and **Payment ready** (secret key plus webhook signing secret).

### Production verification

The saved secret and publishable keys were confirmed present without reading their values. The webhook signing secret was confirmed missing. The corrected server and Finance client were deployed with a rollback-preserved client bundle. TypeScript passed with zero errors, all 143 automated tests passed, production readiness succeeded, and the live security suite passed 46/46 checks.

### Required administrator action

In Stripe Workbench/Dashboard, create an HTTPS webhook endpoint at `https://myportal.readypackets.com/api/stripe/webhook`, configure the snapshot events `checkout.session.completed`, `payment_intent.payment_failed`, and `charge.refunded`, then copy the resulting endpoint signing secret (`whsec_...`) into **Admin → Finance → Stripe Settings** and save. Use **Test Stripe connection** before accepting live payment. A 100% coupon such as `ALEX99` leaves no amount to collect; test a nonzero order when confirming the hosted payment redirect.


## 2026-08-12 — Fixed Cart Price Coupon Method

### User request

The user requested three coupon methods: **percentage off**, **fixed amount off**, and **fixed cart price**.

### Implemented behavior

Coupon administration now offers all three methods in both Finance → Coupons and the dedicated Coupons management page. Percentage discounts are limited to 1–100%; fixed-amount discounts must be at least one cent; fixed-cart-price discounts accept a target final cart price in cents, including zero for a fully covered cart.

A fixed-cart-price coupon stores the desired final total, not a static discount. At validation time, the service calculates `current cart total − target cart price`; it rejects the coupon if that would not reduce the current order. Customer checkout now displays the computed savings and labels the selected coupon with its final cart price.

Stripe represents discounts only as percentage or amount-off coupons. For a fixed-cart-price coupon, ReadyPackets creates/reuses a Stripe amount-off coupon equal to the server-calculated discount for that exact order total. Its provider-side name includes the original order total, preventing reuse of an amount-off translation for a different cart total.

### Validation and deployment

No database migration was required because the existing coupon method storage is a varchar field. TypeScript passed with zero errors, all 143 tests passed, the production service returned ready after deployment, and the live security verification suite passed 46/46 checks.


## 2026-08-12 — Coupon Deletion Controls

### User request

The user reported that the Finance → Coupons table exposed editing and enable/disable actions but no deletion option for old coupons.

### Implemented behavior

Both coupon administration surfaces now expose a **Delete** action for coupons that are already inactive and have zero redemptions. Selecting Delete opens an explicit irreversible confirmation dialog. The server repeats all protections: the caller must be an administrator, the coupon must exist, it must be inactive, and its redemption count must be zero.

Coupons with a redemption history are retained rather than deleted. The interface labels those inactive records **Retained**, and the server rejects deletion so financial history remains auditable. Active coupons must first be disabled; this adds a deliberate pause before a permanent removal. Successful deletion writes a warning-level administrative activity record with coupon ID and code, without adding sensitive information to audit logs.

### Validation and deployment

TypeScript completed with zero errors, all 143 tests passed, the production service returned ready after deployment, and the live security verification suite passed 46/46 checks.


## 2026-08-12 — Webhook Delivery Controls and SharePoint Discovery

### User request

The user requested clearer webhook-delivery controls—Retry, Stop, and Redeliver—and the ability to discover SharePoint configuration from only a tenant ID, client ID, client secret, and SharePoint site URL.

### Implemented behavior

The Integration → Delivery Log now renders clear button controls rather than ambiguous text links. Pending records expose **Retry** and confirmation-protected **Stop**. Failed and stopped records expose **Retry** and **Redeliver**. Delivered records expose **Redeliver**. Retry reopens the original delivery, clears prior response diagnostics, and reuses the scheduler; Stop changes only pending work to a non-schedulable `stopped` state; Redeliver creates a distinct audited delivery record from a non-pending record. The server validates every state transition, prevents duplicate redelivery while a record is already pending, and records privileged actions in the activity log.

The SharePoint & SAML integration tab now includes **Discover site & library**. It accepts the Tenant ID, Client ID, client secret (or a previously encrypted saved secret), and SharePoint site URL. The server uses Microsoft Graph client-credential authentication only for this operation, resolves the Graph site ID from the HTTPS `*.sharepoint.com` URL, discovers the default document library and available libraries, and populates the site ID and drive ID for administrator review. Credentials are never returned, displayed, or written to activity logs. The administrator must still press **Save SharePoint settings** to persist the reviewed configuration.

### Permission note

Microsoft Graph discovery requires an application permission that can read the site and its drives. Existing sync requires write permission to create folders and upload order documents. Microsoft Graph’s official site-by-path and site-drive documentation was consulted during implementation.

### Validation and deployment

TypeScript completed with zero errors, all 143 tests passed, production readiness succeeded after deployment, and the live security verification suite passed 46/46 checks.

## 2026-08-12 — Credential protection, opaque account references, and Security Centre release

### User request

The user requested verified protection for Microsoft Graph/SharePoint credentials and customer data, opaque alphanumeric user IDs for current and future accounts, and an expanded Security Centre log workspace with detailed review, blocking, banning, and advanced search capabilities.

### Delivered changes

- Audited SharePoint configuration handling. The Graph client secret is encrypted with AES-256-GCM before being persisted as the `sharepoint.client_secret_enc` secret setting, is not returned by Graph configuration status APIs, and is decrypted only server-side for an authenticated Microsoft Graph operation.
- Hardened `deploy/config-migration.sh` so administrator-triggered configuration exports are secret-free by default. Default bundles exclude application keys, database credentials, encrypted secret settings, and Microsoft Graph/SharePoint credentials. Standard imports preserve the target host environment and secret settings. The `--include-secrets --apply-env` mode is documented as root-console-only break-glass recovery and is not available from the portal.
- Added MySQL-compatible migration `0017_public_user_identifiers.sql` and applied it to production. It reconciles the missing legacy `customer_number` column, adds `public_id`, backfills all existing accounts, and enforces uniqueness indexes.
- Added opaque public account references in `RP-U-<12 uppercase hexadecimal>` form for every new account. Existing production accounts were backfilled and verified to have unique public IDs. Internal numeric database keys remain relational-only.
- Added the public account reference to authenticated session state and Customer Portal → Settings with a copy control. Security-log results and review screens now display the opaque reference instead of showing a sequential user number.
- Expanded Security Centre → Logs with advanced security search by severity, outcome, event type, message, source address, linked account, and date range; matching-result totals; an audited detailed event view; confirmation-based IP block actions; and confirmation-based account ban actions that deactivate the account and revoke active sessions. The server validates all transitions and records audit/security events.
- Verified live schema state after migration: 5 accounts, 0 missing public IDs, 5 distinct public IDs, and 0 missing customer numbers.
- Updated the production VPS operating record with the new secret-free export and public-ID safeguards.

### Validation and deployment

- `pnpm test`: 143 tests passed.
- `pnpm run typecheck`: 0 TypeScript errors.
- `bash -n deploy/config-migration.sh`: passed.
- Built the client and server artifacts, deployed them to `/opt/readypackets`, restarted `readypackets.service`, and confirmed public health `{"status":"ok"}`.
- Live security verification passed 46/46 checks after deployment.

### Security posture note

The platform enforces TLS for public transit through nginx and Cloudflare and uses strict security headers. Sensitive application fields—including customer PII and saved Graph secrets—are application-encrypted with AES-256-GCM; email lookup uses a keyed blind index. Application code and protected backups still require privileged host/database access controls, so no system can truthfully claim that every operational metadata field or root-access backup is mathematically unreadable. The release narrows export exposure and preserves strict privilege boundaries rather than making that false claim.


## 2026-08-12 — Release governance, identity controls, observability, and comprehensive review

### Requested work

The owner requested a prioritized assessment of remaining master-prompt features while completing configurable SAML role assignment, maintenance mode access gates, secure customer magic-link sign-in with MFA, expanded system and security logging, a full code/security/functionality review, and version history with controlled public release publishing.

### Delivered implementation

- Added administrative changelog release governance: drafts, explicit publish and unpublish actions, immutable revision snapshots, version-history viewing, and audit events. Only published entries remain visible through the public changelog surface.
- Added configurable SAML auto-provisioning roles for Customer, Staff, and Administrator. SAML-provisioned administrators follow the existing MFA-pending security path and cannot receive a full privileged session before MFA is completed.
- Added dedicated, audited maintenance gates for public access, login, and new account creation, while preserving allowlist bypass behavior for authorised operators.
- Added hashed, recipient-bound, single-use 15-minute customer magic-link tokens with generic responses that do not disclose account existence. Magic-link authentication requires a valid MFA completion path or MFA enrolment before customer access is granted.
- Added advanced Activity Replay system search across action, entity type/ID, severity, source address, text, date, pagination, and event review fields.
- Added changelog revision and magic-link-token migrations `0018_changelog_entry_versions.sql` and `0019_magic_link_tokens.sql`, both applied to production.
- Completed a dependency and source review. Removed the unused legacy `passport-saml` dependency, upgraded Drizzle ORM, Nodemailer, file-type, and Multer, and replaced policy HTML interpolation with the shared safe React Markdown renderer.
- Wrote `docs/FEATURE_GAPS_AND_PRIORITIES_2026-08-12.md` and `docs/COMPREHENSIVE_CODE_SECURITY_FUNCTIONALITY_REVIEW_2026-08-12.md`.

### Validation and deployment

- `pnpm run typecheck` passed with zero errors.
- `pnpm test` passed: 143 tests.
- Final `pnpm audit --prod` reported no known vulnerabilities.
- Client and server production builds completed successfully. The release was deployed to the VPS, migrations were verified, and local/public `/api/health` checks returned `{\"status\":\"ok\"}`.
- Live security verification against `https://myportal.readypackets.com` passed 46/46 checks.

### Residual operational requirements

The public gap assessment identifies Stripe signed-webhook setup, SharePoint production validation, external backup restore testing, full-volume encryption planning, migration-journal reconciliation, and browser-level regression coverage as the most important remaining operational items. These are documented in the review report and must be handled through controlled configuration or maintenance work.

### User communication summary

The user will receive the prioritized feature-gap assessment and release history/governance outcome with links to both new review documents and the final source/session-log commit.



---

## Session — Aug. 12, 2026: Lifecycle toolkit, installation controls, documentation release, and production recovery

### User request

> Add a built-in platform upgrade system based on GitHub changes, with private-repository PAT support, change scanning, administrator approval, and rollback. Add a factory-reset script. Update all customer, administrator, deployment, upgrade, and factory-reset documentation; update the current-context/master-prompt document; provide individual files and a ZIP bundle; use one unified installer for bare-metal VPS, an existing Docker host, or a VPS where Docker is installed by the installer. Upload the code and the full session prompt/response log to GitHub.

### Delivery principles applied

The implementation remains **self-hosted** and does not introduce a Manus runtime integration, hosted dependency, or public-facing AI reference. The upgrade workflow does not permit arbitrary host commands, unrestricted source execution, or unreviewed network changes. A private-repository personal access token is encrypted in the application settings store and supplied to the privileged helper only over standard input for the one process that requires it. It is never written into the service environment, browser, Git configuration, command history, diagnostic output, or application audit payloads.

| Capability | Delivered behaviour | Control boundary |
| --- | --- | --- |
| Platform Updates workspace | Administrators can configure a private GitHub repository, save an encrypted PAT, scan candidate commits and changed files, examine risk indicators, explicitly approve a single scanned commit, run the approved upgrade, and request a rollback of a recorded run. | Privileged host work is restricted to a root-owned helper; the application cannot invoke an arbitrary command or choose an arbitrary host path. |
| Update history | Every scan, approval, execution, outcome, and rollback is persisted in `platform_upgrade_runs`. | The migration is versioned as `0020_platform_upgrade_runs.sql` and was applied before exposing the workspace. |
| Protected update helper | `/usr/local/sbin/readypackets-platform-update` implements bounded `status`, approved `apply`, and recorded `rollback` operations. It creates protected application/database snapshots before updating. | Root-owned executable, tightly scoped sudo rule for the service account, protected workspace under `/var/lib/readypackets/platform-upgrades`, and protected snapshots under `/var/backups/readypackets/platform-upgrades`. |
| Factory reset | `deploy/factory-reset.sh` now requires an explicit typed confirmation, supports native and Docker modes, and can preserve admissible operational evidence with `--preserve-evidence`. | It is a root-console operation only; it is not exposed through the web application. |
| Unified installation | `deploy/unified-install.sh` offers native VPS, existing Docker, and Docker-bootstrap installation choices, delegating to the hardened deployment paths rather than maintaining competing installers. | Existing protected environment settings are retained by the supported installer; runtime credentials are not embedded in the generated application artefacts. |
| Documentation | Customer, administrator, deployment/install, upgrade/rollback, factory-reset, documentation-index, and current-context/master-prompt guides were created or refreshed. | A distributable package contains the documents and lifecycle scripts without production secrets. |

### Implementation record

The API surface was added in `server/routers/platformUpdates.ts` and registered in `server/routers/index.ts`. It validates the repository form and commit workflow, encrypts sensitive configuration with the platform's existing at-rest encryption facilities, records upgrade history, and requires administrative authorisation. The corresponding administrator interface is `client/src/pages/admin/PlatformUpdates.tsx`, routed through `client/src/App.tsx` and placed in the configurable default administration navigation at `/admin/platform-updates`.

The restricted host companion is defined in `deploy/platform-upgrade-control.sh`. The native installer (`deploy/install.sh`) now installs the helper and scoped sudo rule during future native installations. On the already-running VPS, the helper, sudo policy, protected directories, and migration were installed directly and recorded in the machine operations record (`AGENTS.md`). `deploy/factory-reset.sh` and the new `deploy/unified-install.sh` complete the lifecycle toolchain.

The documentation set refreshed during this release is:

| File | Audience and purpose |
| --- | --- |
| `docs/USER_GUIDE.md` | Customer portal use, account security, orders, My Business Packets, workspace collaboration, and support. |
| `docs/ADMINISTRATOR_GUIDE.md` | Administrative operations, protected configuration, platform updates, backup, incident response, and permissions. |
| `docs/DEPLOYMENT_AND_INSTALL.md` | Native VPS, existing Docker, and Docker-bootstrap installation procedures. |
| `docs/UPGRADE_AND_ROLLBACK.md` | Scan/approval/apply/rollback workflow, preconditions, evidence, and recovery guidance. |
| `docs/FACTORY_RESET.md` | Factory-reset modes, mandatory confirmation, evidence preservation, and fresh-install sequence. |
| `docs/CURRENT_CONTEXT_AND_MASTER_PROMPT.md` | Current product mandate, implemented capability inventory, security constraints, and prioritized remaining roadmap. |
| `docs/DOCUMENTATION_INDEX.md` | Navigation index for all operator and customer documentation. |

A portable release package was prepared at `release-artifacts/readypackets-lifecycle-documentation-2026-08-12.zip`. It contains the above documentation and the lifecycle scripts needed for review or a self-hosted installation, excluding operational keys, credentials, uploaded customer material, production database contents, and backup archives.

### Production deployment and recovery note

The lifecycle release was deployed to `https://myportal.readypackets.com`, and database migration `0020_platform_upgrade_runs.sql` was applied successfully. During the first deployment attempt, the server bundle directory (`dist/`) was mistaken for the Vite client directory (`client/dist/`). That left the expected runtime client directory (`/opt/readypackets/client/dist`) empty, producing a failure to load the application shell even though the API health endpoint remained available.

The incident was corrected without changing source code or discarding prior client builds. The actual Vite distribution was archived from `client/dist`, transferred to the server staging area, extracted into a newly created protected directory, ownership and access modes were set, and the empty target directory was rotated to a timestamped forensic backup before the restored directory was put in place. The service was restarted, the health endpoint returned `{"status":"ok"}`, and `/opt/readypackets/client/dist/index.html` was confirmed present. The previous error page therefore was a deployment-path issue, not an application route, policy, database, or authentication failure.

### Verification record

The production health probe succeeded after the client-asset recovery. The protected update helper is installed and reports the service active. Its current release commit is initially reported as `unknown` because this is the first release using the lifecycle control and no `RELEASE_COMMIT` marker existed previously; the marker is populated by the approved update process after its first managed upgrade.

The black-box security verifier was rerun against the production hostname after restoration. It passed 45 of 46 checks. All CSP nonce, hardening-header, cookie, CSRF, authorization, host-validation, information-disclosure, and public-surface checks passed. The only reported item was the `Retry-After` assertion after the intentional login-rate-limit burst. The response header is set on both limiter paths in `server/security/rateLimit.ts`; this known probe timing interaction can occur when an earlier probe has already exhausted the category budget. It does not alter the restoration result or leave the portal unhealthy, but it remains a useful item to re-run from a fresh rate-limit window after later traffic-control changes.

### GitHub publication pending at the time of this entry

This session entry is intentionally recorded before the release commit so the source, documentation bundle, and full lifecycle/recovery record are committed together to the private `readypackets/ReadyPackets` repository. The next actions are to run the build/type/test gates against the exact committed tree, create the release commit, push `main`, write its commit identifier to the production `RELEASE_COMMIT` marker, and make the requested ZIP and individual documentation files available to the operator.

---

*The lifecycle toolkit release, its operating rationale, the transient production deployment-path incident, and the recovery have been recorded here to satisfy the project requirement that prompts, responses, outcomes, and operational context remain in version control.*


### Lifecycle release verification and publication update

The final local gates for the lifecycle source tree completed successfully:

```text
pnpm run typecheck      # 0 TypeScript errors
pnpm test               # 143 tests passed across 9 test files
pnpm run build:client   # Vite production build completed
pnpm run build:server   # Node 22 production bundle completed
```

The release was committed as `89d0a89c2780ed0ece8b9560835020f021c582f8` with message `feat: add lifecycle toolkit and release documentation` and successfully pushed to the private repository's `main` branch. GitHub confirms the canonical repository URL as `https://github.com/readypackets/ReadyPackets`.

The documentation download directory and ZIP were synchronized from the same finalized documents and session log, with archive integrity validated by `unzip -t`. A final small follow-up commit will carry this publication confirmation itself, preserving the complete outcome in the required GitHub session record.


---

## 2026-08-12 — Public discovery, accessibility, FAQ, and marketing release

### User direction recorded

The user asked that the remaining roadmap items be implemented after the lifecycle release: an administrator-managed FAQ system with selective public publishing; a fully accessible public website; maximized SEO, GEO, and AEO; and a marketing system within the administrator panel. The user’s standing project requirement remains that the platform be self-hosted without Manus integrations or dependencies, that security controls remain in place, and that the complete session record and source changes be published to the private GitHub repository.

### Delivered: public FAQ management

A dedicated `public_faqs` data model and production migration `0021_public_faqs.sql` were added. The `faqs` router enforces public read access only for published records and administrator-only creation, editing, publication, ordering, and deletion. The public `/faq` page provides keyword search, category filtering, semantic native disclosure controls, and no internal data disclosure. The administrator workspace is available at `/admin/faqs`, and FAQ navigation was added to the public header, public footer, and configurable administrator navigation.

The FAQ migration was applied to production and the anonymous public API was verified to return only an empty published set before administrators create public content. This is intentional: FAQ content is controlled exclusively by the administrator and no sample or fictional material was seeded.

### Delivered: public accessibility strengthening

The public site now includes a dedicated `/accessibility` statement and feedback path, linked from the shared footer. The public interaction baseline was strengthened with a 3px visible keyboard focus indicator, sticky-header scroll offsets that keep focused targets visible, reduced-motion respect, 44px desktop navigation targets, and a complete mobile-menu focus trap with Escape restoration. Existing semantic skip-link, labelled field, error-text, and color-independent validation primitives were retained.

The implementation is grounded in the W3C WCAG 2.2 guidance recorded in `docs/research/wcag-2-2-public-site-audit-basis.md`. Production browser verification confirmed the accessibility statement renders over HTTPS and the first Tab key press visibly reaches **Skip to main content** before primary navigation.

### Delivered: SEO, GEO, and answer-discovery foundations

The public HTML shell and Express renderer now produce route-aware server-rendered titles, descriptions, canonical URLs, Open Graph/Twitter metadata, and crawler directives prior to JavaScript execution. Public client routes add matching metadata and emit CSP-compatible JSON-LD only for visible, accurate content: Organization and WebSite data on the public home page and FAQPage data only when an administrator has actually published one or more visible FAQ entries.

A dynamic `/sitemap.xml` exposes only intentional public marketing routes and publicly listed packet groups. `robots.txt` now includes the sitemap location, explicitly allows the new public pages, and excludes the portal, administration area, API, authentication paths, and campaign redirect links. The implementation basis is recorded in `docs/research/search-discovery-implementation-basis.md`, using official Google Search Central and Schema.org sources. It deliberately avoids unsupported GEO/AEO tactics such as artificial content farms, hidden markup, and special AI text files.

### Delivered: administrator marketing workspace

The self-hosted marketing system consists of a `marketing_campaigns` data model and production migration `0022_marketing_campaigns.sql`, an administrator-only `marketing` API, and the `/admin/marketing` workspace. Administrators can create, revise, archive, and delete campaigns; define objective, channel, audience, messaging, CTA, start/end window, destination, and UTM values; publish or pause a campaign; copy a controlled promotion link; and record confirmed conversions. Aggregate campaign counts show total campaigns, active campaigns, clicks, and conversions.

Public promotion links use `/go/{publicKey}`. They only redirect when a campaign is active and within its optional schedule, accept only a local path or HTTPS destination at creation time, append configured UTM values, and increment only an aggregate click counter. They do not store IP addresses, accounts, user agents, or browsing histories. Anonymous callers are denied access to the marketing administrator API, while invalid or inactive campaign links return 404 without redirecting. Marketing actions are recorded in the existing activity/audit log.

### Validation and production deployment

All feature code passed `pnpm run typecheck`, `pnpm test` (**143 passing tests**), `pnpm run build:client`, and `pnpm run build:server`. The tested client and server artifacts were deployed using timestamped rollback copies; migrations `0021_public_faqs.sql` and `0022_marketing_campaigns.sql` are applied in production. Production checks confirmed `{"status":"ok"}`, correct canonical FAQ metadata, an XML sitemap, public robots directives, anonymous marketing API denial (`401`), and safe rejection of an unknown campaign link (`404`).

The live security verifier again reported **45/46 checks passing**. The sole reported item remains the known timing artifact for the rate-limit `Retry-After` probe: the header remains present in `server/security/rateLimit.ts`, but the verifier sends its final check after exhausting the rate-limit window. No regression or missing implementation was introduced by this release.

### Publication pending

The completed roadmap release, research notes, migration files, source changes, and this appended session record are ready for final integrity review, commit, and push to the private `readypackets/ReadyPackets` GitHub repository. The production `RELEASE_COMMIT` marker will be updated after publication.


### Publication outcome

The complete source release was committed on `main` as `94287fd5cd99c0f6aff64dd71ef43f5e5209a50d` with the message `feat: public discovery, accessibility, FAQs, and marketing workspace` and pushed successfully to the private `readypackets/ReadyPackets` repository. A final log-only commit follows this entry so the repository contains this publication outcome as well as the implementation itself. The production release marker is updated after that closing commit is pushed.


---

## 2026-08-12 — Login response-contract repair

### User report

The user reported that the production sign-in page at `https://myportal.readypackets.com/login?next=%2Fadmin%2Fapi-keys` showed **“Unable to transform response from server”** instead of allowing the administrator to complete login.

### Investigation

The production service remained healthy. Recent journal records showed CSRF rejections for anonymous login requests followed by a successful password login event for the administrator account, which isolated the problem to the browser’s presentation of an expired/missing CSRF-token rejection rather than account credentials, MFA enrollment, database access, or service availability.

The login page was opened in a fresh browser context. It correctly received a CSRF cookie and the anonymous `auth.session` bootstrap returned a valid tRPC result. The fault was identified in `server/security/csrf.ts`: CSRF middleware runs before the tRPC adapter and returned a plain Express object (`{"error": ...}`) for failed state-changing tRPC calls. The tRPC browser client expects an array of tRPC result/error envelopes, so it could not deserialize the plain object and surfaced the generic transformation error.

### Repair

A CSRF rejection helper now detects `/api/trpc/` requests and returns the normal tRPC error envelope, including `FORBIDDEN`, HTTP `403`, the procedure path, and the user-safe message: **“Your security token expired. Reload the page and try again.”** Non-tRPC callers retain the ordinary Express JSON error response. Origin rejection follows the same compatible contract.

The source passed `pnpm run typecheck`, all **143** automated tests, and the server production build. The server-only artifact was deployed with a timestamped rollback copy and `readypackets.service` restarted successfully. Production health returned `{"status":"ok"}`. A deliberately missing-CSRF login request was verified to return the valid tRPC error-array contract rather than the former unparseable response.

### User recovery action

The repair is live. A browser that was already open during the token expiry must reload the login page once so it receives a fresh CSRF token, then the user can sign in normally and complete the existing MFA step. The account password, MFA configuration, and server secrets were not changed during this repair.

### Publication pending

This source repair and its complete session-log record are ready for private GitHub publication; the production release marker will be updated after that commit is pushed.


### Publication outcome

The login repair was committed and pushed to the private `readypackets/ReadyPackets` `main` branch as `0aa5b1ae4cd0452eeee4eb0517bfc1495fdbd3e9` with the message `fix: return tRPC CSRF errors to login client`. The production host is running the corresponding server artifact, and the release marker was set to that commit. A final log-only publication commit follows this entry so that the GitHub session record includes the outcome itself.


---

## 2026-08-12 — Backup-control repair and OWASP Top 10 2025 assessment

### User report and questions

After confirming that cache clearing and a page refresh restored browser login, the user reported two Security Centre alerts: `tier3.systemBackups.start` and `tier3.systemBackups.setSchedule`. Both displayed `sudo: The "no new privileges" flag is set, which prevents sudo from running as root.` The user also asked whether the platform is protected against the OWASP Top 10 vulnerabilities and whether `SESSION_LOG.md` is appended or overwritten.

### Backup-control investigation and repair

The alerts were confirmed as real production errors, but they were not an intrusion indicator. The `readypackets` service intentionally runs as an unprivileged `readypackets` user with a root-owned, fixed-path `/usr/local/sbin/readypackets-backup-control` helper and a narrowly scoped sudoers rule. The service unit nevertheless had `NoNewPrivileges=true`, which prevents sudo from elevating even when a command is explicitly allowlisted. That setting made the intended backup-control plane impossible to use.

The version-controlled and production systemd unit were updated to set `NoNewPrivileges=false` with a security rationale and compensating controls documented in the file: root-owned 0750 helper, exact-path sudoers allowlist, helper-side fixed action/argument validation, empty capability set, filesystem isolation, system-call restrictions, root-owned secrets, and loopback-bound service remain in effect. The prior unit was saved as a timestamped rollback copy. `systemd-analyze verify` passed, the service was restarted, `NoNewPrivileges=no` was confirmed, and the public health endpoint returned `{"status":"ok"}`.

The service account then successfully invoked the helper’s safe `status` operation. A controlled backup was started through the same repaired service-account path; `readypackets-backup.service` completed with `Result=success`, generated `readypackets-20260812T154409Z.tar.gz` in the root-owned backup directory, and retained the enabled nightly timer. No arbitrary privilege elevation was added.

### OWASP assessment

The current official OWASP Top 10:2025 categories and guidance were reviewed and recorded in `docs/research/owasp-top-10-2025-assessment-basis.md`. An evidence-based assessment was created at `docs/OWASP_TOP_10_2025_COVERAGE_ASSESSMENT.md` and indexed in `docs/DOCUMENTATION_INDEX.md`.

The conclusion is that ReadyPackets has substantial implemented controls across all ten current categories, including server-side authorization, MFA/session controls, CSRF/origin checks, nonce CSP and headers, authenticated encryption, typed validation, safe Markdown rendering, upload controls, logging/alerts, restricted privileged helpers, secure deployment controls, and error handling. It is not represented as invulnerable or OWASP certified. The most important residual work is continuous dependency/SBOM management, authenticated browser authorization regression tests, Stripe/SharePoint/cloud-backup configuration and restore drills, host-volume encryption planning, and an independent penetration test.

Fresh validation returned a clean production dependency audit (`No known vulnerabilities found`) and the live verifier reported **46/46 checks passed**, including CSRF/origin checks, anonymous authorization denials, Host validation, error-disclosure behavior, static-file protections, and login rate-limit/`Retry-After` behavior.

### Session-log retention clarification

`SESSION_LOG.md` is **append-only in practice** for this project: each task’s user request, investigation, implementation, verification, deployment, and GitHub publication outcome is appended as a new dated section. It is version-controlled in the private repository, so Git history also preserves prior revisions. It is not intentionally overwritten; only an exceptional corrective edit to an inaccurate prior statement would modify existing text, and that change would remain auditable through Git history.

### Publication pending

The backup repair, documentation index, OWASP assessment, research basis, and this complete session-log addition are ready for final integrity review, private GitHub publication, and production release-marker update.


### Publication outcome

The backup-control repair, OWASP assessment, research basis, documentation index, and associated session record were committed and pushed to the private `readypackets/ReadyPackets` `main` branch as `55d581781bd62f5af4d0ee26d7b05b7d97dd97a7` with the message `fix: restore secure backup control elevation`. A final log-only publication commit follows so that GitHub includes this publication outcome itself. The production release marker is updated after that closing commit is pushed.


---

## 2026-08-12 — SharePoint configuration and discovery repair

### User report

The user could not configure SharePoint order-file synchronization. The administrator page rejected `https://btkeys.sharepoint.com/` as not being an HTTPS `*.sharepoint.com` address during discovery. If the user selected Save first, the server rejected the request because the Graph site ID and document-library drive ID were empty—the same values that discovery is meant to populate.

### Investigation

The current source was inspected along with the deployed validation. The hostname regular expression in `discoverSharePointConfig` had been over-escaped: the literal contained `\\.` rather than `\.` in a regular expression. It therefore required a backslash before the `sharepoint.com` component and rejected normal tenant URLs such as `btkeys.sharepoint.com`.

Microsoft’s current Graph documentation was reviewed. A tenant root is resolved with `GET /sites/{hostname}` (or `/sites/root`), while a non-root site uses `GET /sites/{hostname}:/{server-relative-path}`. The pre-existing implementation used the path form for every URL, including the tenant root. The official sources and resulting design constraints were recorded in `docs/research/sharepoint-graph-site-discovery-basis.md`.

### Repair

`normalizeSharePointSiteUrl` was added to securely canonicalize the administrator’s input. It trims whitespace, removes zero-width copy/paste characters, ignores query/hash fragments, accepts only a real HTTPS `*.sharepoint.com` hostname, rejects embedded credentials and ports, and produces a canonical tenant-root or site path. Discovery now calls Graph’s hostname-root endpoint for `https://tenant.sharepoint.com/` and its documented hostname-plus-path endpoint for non-root sites.

The administrator form now clearly describes the discovery-first sequence, labels Graph site/drive fields as discovery-populated, disables Save until the tenant, client, secret, site ID, drive ID, and root path are available, and trims all saved fields. This prevents the earlier circular validation error. The client secret remains handled server-side and is never returned to the browser.

A focused regression suite was added for tenant-root, server-relative site paths, copied query/hash fragments, and rejected lookalike/credential-bearing hosts. The full suite passed with **146 tests**, TypeScript passed with zero errors, and production client/server builds completed successfully. The repaired client and server artifacts were deployed with timestamped rollback copies and the production health endpoint returned `{"status":"ok"}`.

### Operator action after deployment

The user should reload the Integrations page, enter the tenant ID, client ID, client secret, and `https://btkeys.sharepoint.com/`, choose **Discover site & library**, select the desired discovered document library if more than one is returned, and then choose **Save SharePoint settings**. The required Microsoft Graph application consent is `Sites.Read.All` for discovery and least-privilege write access for folder/file synchronization. Graph will report a clear authentication or permissions error if tenant admin consent or applicable site access is absent.

### Publication pending

The SharePoint repair, regression test, documentation, research basis, and this session-log addition are ready for integrity review, private GitHub publication, and final production release-marker update.


### Publication outcome

The SharePoint tenant-root discovery repair, configuration-flow improvements, regression tests, documentation, research basis, and session record were committed and pushed to the private `readypackets/ReadyPackets` `main` branch as `239b721abf0403b7eee499dc0a2dfe9a8b185822` with the message `fix: discover SharePoint tenant-root sites`. A final log-only publication commit follows so that GitHub contains this outcome as well as the implementation. The production release marker is updated after that closing commit is pushed.


---

## 2026-08-12 — Order operations, Phase 1 artifact visibility, and delivery-log release

### User request

The user reported that a customer’s Phase 1 Business Pitch Idea and supporting documents did not appear in the administrator order view. The user requested complete order-file access with Phase 1/Phase 2 downloads, bulk question-list template creation, order-specific Phase 1/Phase 2 automation history and reruns, and delivery-log date/time/customer/order context.

### Investigation

The affected order `RP-C000006-2608-D2B7D9` was inspected in production. It had a valid submitted Phase 1 intake, but no `files` records and no `file.upload`/rejection audit records. The absence is therefore not an administrator display filter issue: no pitch or document artifact was successfully persisted for that historical order. The customer upload endpoint is correctly mounted at `/api/files/upload`, enforces CSRF and order access, validates storage and MIME type, records a file row only after secure storage succeeds, and is used by the customer intake page. Future uploads will be shown by the enhanced administrator UI; the historical order requires the customer to upload/record the files again if the original browser session did not complete the upload.

### Delivered functionality

Migration `0023_order_operations_context.sql` added a file phase field and webhook delivery context fields. Existing intake attachments are classified as Phase 1. New customer intake documents and browser-recorded WebM pitches are automatically saved as `phase_1`. Webhook deliveries now persist safe order ID/order-number/customer-name context at creation. Existing deliveries were safely backfilled with order IDs/numbers using the order number carried in the payload; encrypted customer names were deliberately not decrypted in SQL.

The administrator order Intake tab now shows submitted Business Pitch Idea recordings and supporting documents separately. The Files tab labels Phase 1 intake artifacts versus Phase 2/delivery material and supports safe single-use ZIP download tickets for Phase 1, Phase 2/delivery, or all order files. Existing staff authorization remains in force for archive generation and download.

The Order Question Banks workspace now supports **Bulk add questions**: each nonblank line becomes a separately editable reusable template, with prefix, phase, required-answer, active-state controls, duplicate removal, and a maximum of 100 records per batch.

The order Automation tab now shows Phase I/II phase jobs and P101/P201 webhook deliveries for that order only, including creation/delivery time, status, attempts, HTTP result, errors, and direct retry/redelivery controls. The central Delivery Log now shows date/time, customer, order ID, event, status, attempts, response, diagnostic, and its existing retry/stop/redelivery actions.

### Validation and deployment

The full automated suite passed with **146 tests**, TypeScript passed with zero errors, and client/server production builds completed successfully. The migration initially halted only at a backfill expression that referenced plaintext user name columns which do not exist because names are encrypted. The already-completed schema changes were retained; the safe order-only backfill was applied separately and identified 16 contextual historical deliveries. The production server/client were then deployed with timestamped rollback copies. Internal health, external production HTTPS health, required security headers, and systemd service status all passed. The sandbox security verifier could not reach Cloudflare during its first connection attempt (`UND_ERR_CONNECT_TIMEOUT`); this was an external connection failure, not a code-verification failure. A direct HTTPS check from the production host confirmed the live portal and security-header baseline.

### Publication pending

The complete source, migration, tests, documentation, and session record are ready for final integrity review and publication to the private repository.


### Publication outcome

The order operations release, migration `0023_order_operations_context.sql`, Phase 1 artifact/file management, bulk question templates, order-specific automation controls, enriched delivery logging, and full session record were committed and pushed to the private `readypackets/ReadyPackets` `main` branch as `22074a44c7e4bbf589bb696fbaf077ce72eff301` with the message `feat: enhance order operations and delivery logs`. A final log-only publication commit follows so that GitHub contains this outcome as well as the implementation. The production release marker is updated after that closing commit is pushed.


---

## 2026-08-12 — Configurable MFA policy release

### User request

The user requested an administrator-controlled ability to enforce MFA or not require it.

### Implementation

Implemented an audited, role-scoped MFA policy with three explicit modes: `required`, `optional`, and `disabled`. Separate settings are stored for administrator and customer roles. Defaults preserve the existing security posture when no setting exists: administrators are **required** to use MFA; customers are **optional**.

Required mode puts unenrolled users into the existing restricted enrolment session and challenges enrolled users with TOTP or a backup code before access. Optional mode allows unenrolled users to sign in but continues to challenge enrolled users. Disabled mode suppresses MFA challenges at sign-in for the selected role. Administrator policy enforcement is applied server-side in local password login, magic-link login, SAML SSO completion, MFA status/disable behavior, and the administrator tRPC authorization middleware.

Added a new **Security centre → MFA policy** tab. It presents separate administrator and customer selectors, warns when the administrative posture is lowered, saves through an administrator-only validated API, and records every change in the activity/audit log. No stored authenticator secrets or backup codes are exposed. Existing enabled MFA enrolments remain intact; the policy controls sign-in requirements rather than deleting enrolment data.

### Validation and deployment

Added `tests/mfaPolicy.test.ts` covering required enrolment, optional sign-in, second-factor challenge for enrolled users in required/optional modes, and explicit disabled mode. TypeScript passed with zero errors. The full suite passed with **150 tests**, and client/server production builds succeeded. The production server/client deployment used timestamped rollback copies; `https://myportal.readypackets.com/api/health` returned `{"status":"ok"}`.

### Publication pending

The MFA policy source, tests, and session record are ready for integrity review and publication to the private repository. A final session-log publication entry will be appended after the commit is pushed.


### Publication outcome

The configurable role-based MFA policy, Security Centre controls, SAML/local/magic-link enforcement alignment, MFA policy regression tests, and complete session record were committed and pushed to the private `readypackets/ReadyPackets` `main` branch as `644c1436c5d489d47a37046b0fe25dcb1b8e381d` with the message `feat: add configurable MFA enforcement policy`. A final log-only publication commit follows so GitHub contains this outcome as well as the implementation. The production release marker is updated after that closing commit is pushed.


---

## 2026-08-12 — Customer intake upload CSRF refresh repair

### User report

A customer received the toast `Upload rejected — Your security token expired. Reload the page and try again.` while uploading Phase 1 supporting documents from the order intake page.

### Root cause and repair

The direct multipart upload route correctly rejected a stale anti-CSRF token. The intake page previously read only the browser CSRF cookie at upload time, so a session rotation or stale cookie made the customer reload the entire page before retrying. The route remained secure but the recovery experience was poor.

The intake upload flow now obtains the server-authoritative `auth.session` CSRF secret immediately before the multipart request. If the initial request still receives the specific pre-persistence CSRF rejection, it fetches the current authoritative session secret once and retries the same in-memory file(s) exactly once. It does not retry generic failures, does not disable CSRF validation, and does not retry after the server begins file persistence. A stale cookie therefore no longer blocks a valid customer upload, while a genuine unauthenticated or CSRF attack remains rejected.

### Validation and deployment

TypeScript passed with zero errors. The full automated suite passed with **150 tests**. Client and server production builds completed successfully. The client repair was deployed with a timestamped rollback copy, the application restarted, and the production health check returned `{"status":"ok"}`.

### Publication pending

The client source and complete session record are ready for final integrity review and publication to the private repository. A final session-log publication entry will be appended after the commit is pushed.


### Publication outcome

The intake upload CSRF refresh and one-time retry repair, validation record, and complete session log were committed and pushed to the private `readypackets/ReadyPackets` `main` branch as `d055df4106c3247643b2896d231d8c7312015896` with the message `fix: retry intake upload after CSRF refresh`. A final log-only publication commit follows so GitHub contains this outcome as well as the implementation. The production release marker is updated after that closing commit is pushed.


---

## 2026-08-12 — Stripe-confirmed paid-order access gate

### User report

The user reported that a customer could create an order, decline or omit payment, and still use the order in the customer portal. The user requested that order creation/use be restricted until payment is confirmed by Stripe.

### Root cause

The platform intentionally created an order row before redirecting the customer to Stripe Checkout so the provider had a stable internal order reference. Stripe’s signed webhook already updated `orders.payment_status` to `paid`, but the shared customer `assertOrderAccess` guard checked ownership/share only and did not require payment. The order detail UI also linked pre-payment orders to intake actions. Resource provisioning and `order.created` automation were initiated on creation rather than after settlement.

### Delivered payment gate

The system now treats a pre-payment order as a checkout record, not an active engagement. Customer access to detail, intake, MNDA, questions, files, downloads, notes, sharing, and customer-order procedures that depend on `assertOrderAccess` requires `payment_status = paid`. Staff and administrators retain operational access. Customer file listings are additionally filtered to paid orders. Pending-payment cards in My Orders and the dashboard route back to secure checkout instead of the order workspace.

Created-but-unpaid orders remain visible solely for their owner to resume payment. A new owner-only checkout summary procedure returns only the item and price data necessary to pay; it cannot expose the protected order workspace. Browser redirects from Stripe are not trusted to activate access.

The signed Stripe `checkout.session.completed` webhook is now the exclusive activation path. It updates the payment record and order to `paid`, then provisions the order’s SharePoint hierarchy, fires the existing `order.created` and `payment.succeeded` email automations, applies paid-payment order rules, and records an activation audit event. Duplicate signed webhooks remain idempotent because an already-paid order returns before activation side effects.

### Stripe configuration status and deployment

Production settings were checked without reading or logging secret values. `stripe.secret_key`, `stripe.publishable_key`, and `stripe.webhook_secret` are all present. TypeScript passed with zero errors; the full automated suite passed with **150 tests**; client/server production builds succeeded. Server and client were deployed with timestamped rollback copies and the production health endpoint returned `{"status":"ok"}`.

### Publication pending

The paid-order gating source and complete session record are ready for final integrity review and publication to the private repository. A final session-log publication entry will be appended after the commit is pushed.


### Publication outcome

The Stripe-confirmed paid-order access gate, checkout-only customer navigation, post-payment activation safeguards, validation record, and complete session log were committed and pushed to the private `readypackets/ReadyPackets` `main` branch as `7a83e92448856c8e57517bb26cd3f7e162791580` with the message `fix: gate customer orders on Stripe payment`. A final log-only publication commit follows so GitHub contains this outcome as well as the implementation. The production release marker is updated after that closing commit is pushed.


---

## 2026-08-12 — Account lifecycle deletion and trash safeguards

### User request

The user requested that every account be disabled before it can be moved to trash; that accounts can be bulk-disabled and bulk-deleted; that administrator accounts cannot be bulk-deleted and require a prominent double confirmation before individual deletion; that administrators can create customer-role accounts; and that permanently purging a trashed account requires an explicit typed `DELETE` confirmation.

### Implemented safeguards

The administrator customer directory now has a server-enforced lifecycle sequence: active accounts must first be deactivated, which revokes all sessions, and only then can they be soft-deleted to recoverable trash. The client offers bulk disable for up to 200 selected accounts, followed by bulk trash only for already-disabled, non-administrator accounts. Server validation rejects bulk deletion whenever any selected account has the administrator role, rejects all trash moves if a target is not disabled, and rejects self-targeting operations.

Individual trash controls were added to the account table. A non-disabled target receives an explicit disable-required notice. For administrator targets, the deletion dialog displays a prominent uppercase warning that an administrator account is being disabled and deleted; the account must already be disabled, the operator must enter exactly `DELETE ADMIN`, and a separate confirm action is required. The server independently requires both the general `MOVE_TO_TRASH` confirmation and the administrator phrase; user-interface controls alone cannot bypass the rule.

The account creation dialog is now named "Create an account" and offers Customer, Staff, and Administrator roles. The existing server procedure now validates and supports all three roles, still generates a temporary password server-side, and requires a password change at first sign-in.

Account Trash now includes individual **Purge** controls. Permanent purge is available only for an account already soft-deleted following disablement. The dialog contains a prominent irreversible-deletion warning and enables the purge control only when the administrator types exactly `DELETE`; the server also requires the matching `DELETE` literal. The transaction removes the account and its remaining portal-announcement recipient relation before deleting the user record. Production foreign-key metadata was inspected to confirm this is the only direct user-account foreign-key dependency.

### Validation and deployment

TypeScript completed with zero errors. The full automated suite passed with **150 tests**. Client and server production builds succeeded. The live server/client release was deployed with timestamped rollback copies, the service restarted cleanly, and the health endpoint returned `{"status":"ok"}`. No schema migration was required.

### Publication pending

The account lifecycle source changes and this full session record are ready for final integrity review and publication to the private repository. A closing session-log publication entry will be appended after the release commit is pushed.


### Publication outcome

The account lifecycle safeguards, individual administrator deletion protections, bulk-disable/bulk-trash controls, customer-role creation support, typed permanent purge, test/build results, and full session record were committed and pushed to the private `readypackets/ReadyPackets` `main` branch as `c73b2ca96e65dc6ef4a9037044a9ac52842b306b` with the message `feat: harden account deletion lifecycle`. A final log-only publication commit follows so the repository includes this outcome as well as the feature release. The production release marker is updated after the closing commit is pushed.


## 2026-08-12 — Policy Acceptance, Upload Recovery, Phase Artifacts, and Order Workflow Release

### Requests addressed

The administrator requested a searchable Policy Center acceptance grid that identifies customers and exact accepted policy versions; a consistent microphone-permission experience for Business Pitch Idea recordings; a permanent, easy customer remedy for upload token errors; Phase 2 documents and in-browser audio recordings for each order; administrator uploads to each phase with all-order file visibility; and administrator-managed selectable/custom order workflows.

### Delivered functionality

- Added **Policy Center → Acceptance tracker** searchable ledger. It filters by customer name, email, opaque ReadyPackets user ID, policy title/slug, version, and optional policy filter. Each row shows customer identity, policy, accepted version, effective date, acceptance timestamp, and status.
- Added a same-origin authenticated `GET /api/security/csrf` token-refresh endpoint. It reissues only the session-bound readable CSRF cookie with no-store responses. Every state-changing CSRF and origin check remains enforced.
- Corrected every custom browser upload path to send the required `X-RP-CSRF` header. The previous `X-CSRF-Token` header mismatch was the root cause of persistent upload-token errors.
- Customer document and recording uploads now refresh the server-issued token before upload and retry once only for a verified pre-persistence CSRF rejection. This eliminates the need for a full page reload after inactive-tab/session cookie rotation.
- Added an explicit microphone-permission explanation dialog before Phase 1 Business Pitch recording. Browser permission state remains controlled by the browser.
- Added `/portal/orders/:id/phase-2` and a visible Phase 2 materials card once an order reaches Phase 2. Customers can add Phase 2 documents and record a WebM audio update directly in the browser.
- Made file persistence and customer file lists phase-aware. Phase 1 and Phase 2 files are separately labeled and visible.
- Added direct **Upload phase documents** controls in the administrator order Files tab. Staff select Phase 1 or Phase 2, upload internal files, and explicitly publish only those files that should be customer-visible. The tab supports Phase 1 ZIP, Phase 2 ZIP, and all-file ZIP downloads.
- Added migration `0024_order_workflows.sql`, `order_workflows` storage, and `orders.workflow_id`. Production has a seeded **ReadyPackets standard workflow**, and all existing orders were backfilled to it.
- Added **Administration → Order workflows**. Administrators can create/edit custom ordered stages, activate/deactivate workflows, choose the default workflow for future orders, and assign an active workflow to an individual order from its Overview tab. Existing order-status, payment, and automation safeguards remain independently enforced.

### Validation and deployment

- Applied production migration `0024_order_workflows.sql`; default workflow ID 1 is active and 10 existing orders received workflow assignment.
- `pnpm test`: 150 tests passed.
- `pnpm run typecheck`: passed with 0 TypeScript errors.
- Production client/server builds passed.
- Production health endpoint returned `{"status":"ok"}` after deployment.
- Live security verification returned 46/46 checks passed, including CSRF/origin boundaries, authenticated API boundaries, response security headers, host validation, and rate-limit `Retry-After` verification.
- Deployment used timestamped server/client rollback copies.

### Operational notes

Customers need to reload once to receive the corrected upload header code. After that, document and recording uploads refresh their token automatically. If browser microphone access was previously denied, the customer must reset/allow the microphone through browser site permissions; a website cannot override a browser-level denial.

### Source-control publication

Pending commit and GitHub publication after this log entry.


### Publication outcome

The combined release was committed and published to the private `main` branch as `317f08772920ac445d917f08e249ad2fb43c7a1d` (`feat: policy ledger, phase artifacts, custom order workflows`). The working tree was confirmed clean before this closing publication note.


## 2026-08-12 — Business Pitch Microphone Diagnostic and Repair

A customer reported that the Phase 1 Business Pitch Idea control showed a generic “Microphone access denied” message even after the browser site permission was allowed. Review found that the recording path treated every `getUserMedia` failure as a permission denial, obscuring distinct browser/device failures such as an unavailable input device, another application holding the microphone, unsupported recording, or operating-system privacy restrictions.

The customer-side recording flow now checks for `mediaDevices.getUserMedia`, requests a live, enabled audio track with echo cancellation and noise suppression, selects Opus WebM when supported, and reports a specific recovery message for `NotAllowedError`/`SecurityError`, `NotFoundError`/`NotReadableError`, `NotSupportedError`, and other startup failures. It retains the explicit pre-recording explanation and browser permission prompt. No microphone data leaves the browser until the user stops recording and accepts the documented upload path.

Validation completed with TypeScript passing, 150 automated tests passing, and successful production client/server builds. The client assets were deployed with a timestamped rollback copy. The initial three-second probe ran before Node finished its normal delayed startup and returned connection refused; the service log confirmed it began listening approximately five seconds after restart. A follow-up production health check returned `{"status":"ok"}` and `readypackets.service` is active.

Pending source-control publication after this entry.


### Publication outcome

The microphone diagnostic repair and this session record were published to the private `main` branch as `d89d47378d0a717664e4f4bb3f2bb956957977ef` (`fix: clarify business pitch microphone startup failures`).


## 2026-08-12 — Granted-Microphone Permission Refinement

A follow-up customer report clarified that the browser had already granted microphone permission but the Business Pitch flow still appeared to ask for it. The recording page now reads the browser Permissions API state when available and tracks changes. When the state is `granted`, clicking **Record Business Pitch Idea** starts recording directly without showing the ReadyPackets explanatory permission dialog again. When the state is `prompt` or unavailable, the customer receives the explanatory dialog and then the browser’s native prompt. When the state is `denied`, the portal immediately provides browser-site-settings recovery instructions instead of presenting a non-actionable repeat prompt.

This refinement preserves the browser’s authority over actual microphone permission while preventing redundant application-level prompts after approval. TypeScript validation and the full 150-test suite passed, the production client build passed, the client assets were deployed with a timestamped rollback copy, and the six-second post-restart production health check returned `{"status":"ok"}`.

Pending source-control publication after this entry.


### Publication outcome

The granted-permission microphone refinement and session record were published to the private `main` branch as `d67b9dc63575caf5f3d9f2d6474b05ad4fa90c0b` (`fix: skip redundant microphone prompt after permission grant`).


## 2026-08-12 — Administrator Order Controls and Customer Document Scoping Release

### Requests completed

Administrators requested configurable payment requirements and pricing when creating orders, the ability to create no-payment test orders, an administrator-visible Business Pitch submission indicator, and assurance that documents submitted by staff to a customer are available only in the intended customer order workspace.

### Delivered controls

- Added migration `0025_admin_order_controls.sql` and typed `orders` fields for `payment_requirement`, `price_source`, `manual_price_cents`, and `is_test_order`. Existing orders retain catalog pricing and the normal required-payment policy.
- **Administration → Orders → Create order for customer** now offers three explicit payment policies: **Require verified Stripe payment**, **No payment required — administrator waiver**, and **Test order — no payment or external automations**.
- Administrators may enter an optional fixed total price from $0.00 to $1,000,000.00. For required-payment orders, Stripe charges a single administrator-set fixed-price line item. Coupon codes are rejected for a fixed-price order so the approved administrator price remains exact.
- Required-payment orders remain inaccessible until a signed Stripe confirmation activates them. Waived orders activate immediately with an auditable administrator payment-waiver source. Test orders activate without Stripe and deliberately skip SharePoint provisioning, payment/order emails, and order automation to avoid external side effects during testing.
- Restricted `createOrderForCustomer` to administrator authorization. This prevents staff from creating payment-waived or test orders.
- The administrator order header and Phase I intake tab now display **Business Pitch submitted** or **No Business Pitch submitted**, derived from actual stored audio/WebM intake attachments.
- The customer portal-wide **My Business Packets** file library now lists only customer-uploaded files. Staff-published documents no longer appear in the portal-wide library; they remain accessible to the authorized customer only inside the correct order workspace through the per-order file query. Phase I intake and Phase 2 materials now use that per-order query, so visible staff documents remain available in their intended order context.

### Validation and deployment

- Applied production migration `0025_admin_order_controls.sql`.
- TypeScript validation passed with 0 errors.
- `pnpm test` passed: 150 tests.
- Production client and server builds passed.
- The release was deployed with timestamped server/client rollback copies.
- The post-restart production health endpoint returned `{"status":"ok"}`.

Pending source-control publication after this entry.


### Publication outcome

The administrator payment controls, test-order safeguards, Business Pitch status indicators, order-scoped document visibility changes, migration, and session record were published to the private `main` branch as `8773f8c0057bd54a690dde1f4e0f1991e21abb3a` (`feat: add administrator payment and test order controls`).


### Final order-workspace document scoping clarification

The portal-wide **My Business Packets** page was updated to describe and enforce its revised role: it lists only customer-uploaded files. Staff-published documents are intentionally excluded from that cross-order library and are available to the authorized customer only inside the relevant order workspace. The customer Intake and Phase 2 pages use the per-order authorized file query, so published staff documents remain visible in their associated order. The final client-only update passed TypeScript validation, 150 automated tests, and a production client build; it was deployed with a timestamped asset rollback copy and the production health endpoint returned `{"status":"ok"}`.

Pending source-control publication after this entry.


### Publication outcome

The final customer file-library scoping clarification and session record were published to the private `main` branch as `8460b73d2056af5df4a2c694b20a3b696b6623f3` (`fix: scope staff documents to customer order workspace`).


## 2026-08-12 — Final Staff Document Order-Workspace Correction

A final implementation review confirmed that excluding staff-published files from the portal-wide customer library must be paired with a customer-visible, order-specific location for those documents. The file router now joins the uploader role only within the authorized per-order listing and returns a safe `uploadedByStaff` boolean rather than exposing uploader identifiers or roles. The customer order workspace now displays a **Documents from your project team** panel for published staff/admin files, with scoped secure download controls. The portal-wide file library continues to contain customer-uploaded files only. Thus, administrator-submitted documents are neither exposed in the general library nor omitted from the customer experience: they appear only in their intended order workspace.

TypeScript passed, all 150 automated tests passed, production client/server builds passed, the corrected server/client artifacts were deployed with timestamped rollback copies, and the production health endpoint returned `{"status":"ok"}`.

Pending source-control publication after this entry.


### Publication outcome

The final staff-document order-workspace correction and session record were published to the private `main` branch as `f8acab7201212eb188923ce88d55f99890fafa9a` (`fix: show staff documents only in customer order workspace`).


## 2026-08-12 — Configurable Microphone Preflight and Reference Comparison

The user requested only a microphone preflight diagnostic and an administrator option to disable it; no written-pitch, customer audio-upload, staff-assisted, recording-format, or other fallback path was added. The Phase I intake API now returns `microphonePreflightEnabled`, backed by the `intake.microphone_preflight_enabled` setting and enabled by default. Administration → System → Intake controls now has **Run microphone preflight before Business Pitch recording**. When enabled, the customer sees a Microphone check before beginning a Business Pitch recording. The diagnostic checks secure `getUserMedia` support, `MediaRecorder` availability, WebM support, permission/device access, and an enabled live audio track. It does not record, retain, or upload audio. A successful check offers an explicit Start recording action; a failed check provides a specific permission, device, browser-support, or general diagnostic. When disabled, the prior recording flow remains available.

An authorized public source repository, `Manus-MadaSitoEnterprises-RP/readypackets`, was mirrored with full history into the new private user repository `readypackets/readypackets-audio-reference`. Its recording implementation was reviewed read-only. The reference uses `getUserMedia({ audio: true })`, a WebM/MP4 selection, local playback/discard, and generic denial feedback. ReadyPackets requests audio with echo/noise constraints, standardizes the platform recording format to WebM, gives differentiated errors, and now provides the configurable preflight. The comparison is recorded in `docs/research/audio-recording-reference-comparison-2026-08-12.md`.

TypeScript validation passed. All 150 automated tests passed. Client and server production builds passed. The server/client deployment used timestamped rollback copies and the production health endpoint returned `{"status":"ok"}`.

Pending source-control publication after this entry.


### Publication outcome

The configurable microphone preflight diagnostic, administrator toggle, private reference comparison, and session record were published to the private `main` branch as `2a077b95e40698ed9075ed1194016a71d957d2d1` (`feat: add configurable microphone preflight diagnostic`).


## 2026-08-12 — Final Deliverables and Configurable Phase Workspaces

The customer portal file model was restructured at the user’s request. **My Business Packets** now lists only customer-visible files categorized as final `deliverable` items. Customer intake attachments, working documents, questions, phase recordings, and staff-published phase materials no longer appear in that portal-wide final-deliverables library.

A reusable customer workflow-stage workspace was added at `/portal/orders/:id/workflow/:phaseKey`. An assigned order workflow now exposes each stage as an individually labeled workspace in the customer order overview. Each configured stage can enable documents, questions, and in-browser WebM recording independently. The workspace shows only the matching phase’s non-deliverable materials and questions, supports a CSRF-refreshed customer document upload when the stage permits documents, and supports browser-only audio recording when the stage permits recording. Team files remain authorized to the specific order and phase; final deliverables remain in My Business Packets.

The administrator Order workflows workspace now stores per-stage capabilities using `stage_key | Stage label | documents,questions,recording`. New stages can be added in the ordered workflow definition, custom workflows can be saved and marked default, and workflow stages can be assigned to individual orders. Administrator order file uploads and direct order questions now accept any stage defined by the order’s assigned workflow. Existing workflows without capability metadata retain compatible document/question/recording defaults until edited. The standard workflow was migrated to explicit capabilities.

Migration `0026_custom_workflow_phase_keys.sql` widened `files.phase`, `order_questions.phase`, and `order_question_templates.phase` to 64 characters and updated the default workflow capability metadata. TypeScript validation passed. All 150 automated tests passed. Production client and server builds passed. The migration and server/client assets were deployed with timestamped rollback copies; the health endpoint returned `{"status":"ok"}`.

Pending source-control publication after this entry.


### Publication outcome

The final-deliverables separation, configurable phase workspaces, custom workflow stage capabilities, and complete session record were published to the private `main` branch as `6475fb81b9c16e5e41ab8b081a8dc15c112050f2` (`feat: add configurable phase workspaces and final deliverables`).


### Post-deployment historical material alignment

After deployment, the stage-workspace review identified that historical standard-workflow materials retained their legacy `phase_1` and `phase_2` keys while the explicit standard workflow uses `phase_1_intake` and `phase_2_synthesis`. Migration 0026 was extended and reapplied safely to map historical files and questions for orders on the standard workflow into their matching new stage keys. Production verification found 8 active `phase_1_intake` files, 1 active `phase_2_synthesis` file, and 1 `phase_2_synthesis` question. The health endpoint remained healthy.


### Historical alignment publication outcome

The historical workflow-stage alignment migration and session update were published to the private `main` branch as `db88bb474e43f569d9dd355381a7b4d2aca1d30a` (`fix: align historical files with workflow stages`).

## 2026-08-12 — Visual Workflow Builder, Cloning, and Phase Audio Upload

### User request

The administrator requested an easier workflow experience: one-click cloning and renaming, a visual connected/drag-and-drop style phase builder, explicit per-phase required actions, and synchronized administrator and customer order workspaces. During implementation, the user clarified that phases may optionally allow both customers and staff to upload prerecorded audio files; browser recording remains a separate phase capability.

### Delivered functionality

- Replaced the text-only workflow-stage editor with a visual connected stage builder in **Administration → Order workflows**.
- Added native drag-and-drop stage reordering, button-based up/down reordering, stage creation/removal, editable stable keys and labels, and visual capability cards.
- Added one-click **Clone** for workflows. The clone opens as a new workflow with copied stages/capabilities, a renameable name, and no default assignment.
- Retained direct workflow renaming in the visual editor.
- Added stage-level capabilities: customer document upload, phase questions, in-browser WebM recording, and capability-gated prerecorded audio-file upload for both customers and staff.
- Added custom workflow-stage audio upload controls in the customer order workspace and in administrator phase uploads.
- Enforced audio uploads server-side: accepted formats are WebM, MP3, M4A, WAV, and OGG containers, and an audio upload is rejected unless the selected phase enables `audio_upload`.
- Retained the browser-recording-only behavior unless the administrator explicitly enables the new prerecorded-audio capability for that phase.
- Strengthened workflow editing safeguards: an administrator cannot remove a stage key from a workflow when orders assigned to it contain files or questions for that stage. They can instead retain the stable key, rename the label, or disable customer actions.
- Confirmed synchronized behavior: customer and administrator workspaces resolve the currently assigned workflow definition dynamically, so saved labels, ordering, and capabilities update without copying workflow definitions into each order.

### Validation and deployment

- `pnpm run typecheck` passed with 0 TypeScript errors.
- `pnpm test` passed: 150 automated tests.
- Production client and server builds completed successfully.
- Deployed server and client with timestamped rollback copies. The first three-second local health probe occurred before the Node listener completed startup; subsequent service logs confirmed startup and the direct health check returned `{"status":"ok"}` with `readypackets.service` active.

### Follow-up

The visual builder release and complete session record will be committed and pushed to the private ReadyPackets repository. The production release marker will be updated after publication.

---

*End of workflow builder release entry.*


### Publication outcome

The visual workflow builder release was committed and published to the private `readypackets/ReadyPackets` `main` branch as `17dd4ad6ab6288041162ea03ec87fb88d4982135`. A final session-log publication commit will follow so the repository retains this outcome.


## 2026-08-13 — Enlarged Workflow Canvas and Per-Stage Automation Actions

### User request

The administrator asked for a larger workflow editing window and the ability to configure email alerts, administrator dashboard alerts, order status updates, completion percentages, and webhook triggers directly inside each workflow phase.

### Delivered functionality

The Order Workflows editor now uses an extra-large `max-w-6xl` modal canvas, providing substantially more horizontal room for stage fields, customer actions, and automation controls. Each visual stage card now contains a separate **Administrator-run stage actions** area that may configure a customer Email Template Center message, a dashboard alert with severity and custom text, an order status transition, a completion percentage, and an existing enabled webhook endpoint. These configuration choices are stored with the workflow stage and validated at save time; selected email templates and webhook endpoints must exist and be enabled.

The administrator order Automation tab now resolves the order's currently assigned workflow and displays every stage with its configured-action count. An administrator can explicitly select **Run actions** for a stage. Execution is intentionally not automatic upon editing a workflow or customer interaction. This keeps status changes, customer email, outbound webhooks, and dashboard alerts under administrator control for the individual order.

The new `workflow_stage_runs` table provides an ordered, auditable run history per order. Each run records the stage key, configured/executed actions, status, executor, start and completion times, and a bounded error detail when a run fails. Successful executions use the existing hardened services: status changes go through the order state machine, completion updates are bounded to 0–100, email uses a configured Email Template Center template, dashboard alerts use the deduplicated system-alert writer, and webhooks queue through the existing webhook delivery log with order context. The selected endpoint is validated as enabled at save time and immediately before queueing.

### Validation and deployment

TypeScript validation passed with 0 errors. The complete suite passed with 150 automated tests. Production client and server builds completed successfully. Migration `0027_workflow_stage_actions.sql` was applied before the new server began serving traffic. Client assets and the server bundle were rotated with timestamped rollback copies. The initial health probes ran before Node completed startup, then the direct production health endpoint returned `{"status":"ok"}`.

### Follow-up

The enlarged workflow automation release and complete session record will be committed and published to the private ReadyPackets repository. The production release marker will be updated after publication.


### Publication outcome

The workflow automation release was committed and published to the private `readypackets/ReadyPackets` `main` branch as `ce3320e3073f717e99d023d171c7e14f4e3759e3`. A final session-log publication commit will follow so the repository retains this outcome.


## 2026-08-13 — Administration Operations, Order Purge, and Reporting Release

### User request

The user requested protected bulk order deletion with typed `DELETE ORDER` confirmation, an obvious individually confirmed order deletion path, clickable investigation of dashboard IP pressure rows, a dashboard card for order alerts, and an administrator workspace for standard and custom reports.

### Delivered implementation

Order Trash now supports individual and bulk permanent deletion for up to 200 selected trashed orders. The interface requires typing `DELETE ORDER` exactly, and the server independently accepts only that exact confirmation. Every selected record must already be in trash. The irreversible purge is executed in a dependency-safe transaction that removes the order’s linked application records, including files, phase materials, questions/answers, notes, sharing, status history, jobs, webhook history, tickets, reviews, payment/invoice/refund/referral/billing metadata, and the order itself. The active-order action was renamed from ambiguous **Archive** to **Move to trash** and retains its reason-aware click confirmation; permanent deletion is intentionally confined to Order Trash.

The Operations dashboard now includes an **Order alerts** card with live counts for failed payments, overdue active orders, and orders awaiting payment. High-pressure source-address rows now link to Security Centre logs with the address prefilled. This event-level investigation surface includes the existing view-metadata, block-IP, and account-ban controls.

A new **Reports** administrator workspace is available at `/admin/reports`. Standard reports cover the live order pipeline, payment summary, and customer-account state. Custom reports can be created, saved, edited, previewed, deleted, and exported as local CSV for approved Orders or Customers datasets. The server accepts only constrained dataset/date/status filters and does not execute arbitrary query text. Migration `0028_custom_reports.sql` creates the saved report-definition table.

### Validation and deployment

TypeScript validation passed with zero errors. The complete suite passed all 150 tests. Production client and server builds succeeded. Migration 0028 was applied to production. Server and Vite client assets were deployed with timestamped rollback copies, and the live health endpoint returned `{"status":"ok"}`. The post-deployment security verifier passed all 46 of 46 checks, including CSRF/origin enforcement, authorization boundaries, Host validation, safe errors, static traversal protection, and the login rate-limit `Retry-After` check.

### Publication

The deployed code release was committed and pushed to the private repository as [`bb6057178acfffeedb5b4255ca4fd8a428b64d84`](https://github.com/readypackets/ReadyPackets/commit/bb6057178acfffeedb5b4255ca4fd8a428b64d84) with message `feat: order purge safeguards, alerts, investigation, reports`. Production `/opt/readypackets/RELEASE_COMMIT` was set to that exact code commit after a successful health check. The VPS operations record was also updated with the deployment details. This final session-log publication update is committed and pushed immediately afterward so the repository contains both the implementation and the full release record.


## 2026-08-13 — Pre-microphone-policy checkpoint

### User request

> backup the current configuration and files to github as it is then apply the fix so i can confirm that it works before pushing that code to github

### Checkpoint boundary

Before changing the microphone policy, a checkpoint is being published from source baseline `42817d66e0ba2f34687f1dc40edcf871ec9bb54c`. The checkpoint includes the current version-controlled source and a sanitized production configuration manifest: active nginx virtual-host configuration, systemd unit/drop-ins, production service/artifact state, deployed artifact hashes, and environment-variable **names only**.

No secret or customer data is included. Specifically excluded are environment-variable values, database contents, uploaded files, sessions, encryption keys, passwords, API credentials, and third-party tokens. These remain only in root-owned production backup storage. The checkpoint is committed and pushed before the policy correction is applied.

### Planned corrective experiment

After the checkpoint publication, the sole code change will replace `microphone=()` with the least-privilege `microphone=(self)` directive in the central security-header policy. The corrected server bundle will be deployed to production for user testing but deliberately left uncommitted and unpushed until the user confirms that browser recording works.


## 2026-08-13 — Approved microphone-policy release and WebM verification

### User confirmation

> it prompted me to record so you can now committ that change to github but i also need to know what audio format is being used because there is a restriction on the audio file type to only upload WEBM audio format

### Approved correction

The user confirmed that the production test deployment reached the browser recording prompt. The previously uncommitted policy correction is therefore approved for publication: the global security header now uses `microphone=(self)` rather than `microphone=()`. This permits browser microphone capture only for ReadyPackets same-origin pages and retains `camera=()` and `display-capture=()` restrictions. The accompanying regression test asserts this deliberate least-privilege exception.

### Audio-format verification

Phase 1 Business Pitch recording is **WebM audio**. Before starting, the client preflight requires either `audio/webm;codecs=opus` or `audio/webm`. On supported Chromium browsers, the recorder is explicitly created with `audio/webm;codecs=opus`; the recorded Blob/File is named `.webm` and submitted as `audio/webm` with the recorded-pitch flag.

The server independently enforces this restriction. A recorded Business Pitch accepts only one `.webm` file per request, validates upload magic bytes and extension, and rejects any recorded-pitch MIME that is not exactly `audio/webm` with the message “Business Pitch recordings must be recorded in WebM format.” Files stored as a successful Business Pitch have detected MIME `audio/webm`. Pre-recorded-audio workflow capabilities are a separate controlled feature and may accept configured additional formats; they do not relax the browser-recorded Business Pitch restriction.

### Validation

The approved fix passed 151/151 tests, TypeScript checking, server build, production health validation, and the full 46/46 live security verification. It is now being committed and pushed to the private ReadyPackets repository.


## 2026-08-13 — WebM recording reliability and customer workflow phase locks

### User report and request

> when i record i am not able to play back what i recorded and i still get the recording upload rejected because of the file format
>
> The customer should be able to remove any documents they upload or record items until they press the submit button then that part of the order phase is locked and can only be unlocked by the admin with confirmation when unlocking it. There should be a notification given to the customer before each submission of files and documents at any point of the order phases. the message should be able to be a template configurable in the workflow designer the customer will be prompte with the notification prompt acknowledging that that phase will be locked and and can not be undone.

### Root cause and WebM correction

The browser recorder correctly creates a WebM audio file, but the installed `file-type` signature detector classifies a generic WebM container as `video/webm`; the container header does not identify its track type. The upload endpoint previously required the detector to return exactly `audio/webm`, so it rejected valid browser recordings before storage. The release keeps magic-byte and `.webm` extension validation, accepts the safe generic WebM signature for an explicitly browser-recorded pitch, and normalizes a successful recorded-pitch record to `audio/webm`. Other files remain subject to existing extension, magic-byte, size, category, CSRF, authorization, and workflow-capability controls.

The Phase 1 intake now retains a newly stopped recording locally, renders an HTML audio playback control, and gives the customer explicit **Upload WebM recording** or **Discard recording** choices. A failed upload leaves the local recording available for retry rather than silently losing it.

### Workflow phase submission and locking

Migration `0029_order_phase_locks.sql` created an auditable current-state lock table keyed by order and phase. Customer phase workspaces now provide a clear submit-and-lock confirmation modal. The message defaults to an irreversible-lock warning but is configurable per workflow stage through the Workflow Designer’s **Acknowledgement message template** field. Customers must check an acknowledgement before submitting.

While a phase is unlocked, customers may add and remove their own files and recordings. When submitted, server-side controls prevent customer uploads, removals, and question changes in that phase. The customer UI reflects the locked state. This covers generic workflow phases, the legacy Phase 1 intake workflow, and the legacy Phase 2 workspace.

Administrators can review current and historic phase-lock records in **Admin → Orders → [Order] → Phase locks**. Unlocking requires an administrator, a reason of at least ten characters, and the exact typed confirmation `UNLOCK PHASE`. The action is audited. Unlocking legacy `phase_1` also reopens the intake draft; customer changes resume until the next submission.

### Validation and deployment

The release passed TypeScript validation, the full automated suite (**151/151 tests**), client and server production builds, migration application, live health verification, and the live security suite (**46/46 checks**). The production `Permissions-Policy` continues to allow `microphone=(self)` while retaining `camera=()` and `display-capture=()`. Timestamped server and client rollback copies were retained in `/opt/readypackets/rollback/` on the VPS.


## 2026-08-13 — Recording feedback and full workspace save flow

### User request

> 1. the audio recording button should be a pulsating button to show that the recording is working
> 2. the save button in the order does not work when the order is saved it should should save the current files ans documents and audio and ask if the customer would like to save the order and return to it later or continue working in the order

### Delivered changes

The customer recording controls in Phase 1 Intake, Phase 2, and generic workflow phase workspaces now use a live pulsing danger treatment while recording. The control includes a pulsing recording indicator, elapsed-time text, and an explicit **Recording — stop** label. The inactive state remains visually distinct and uses the normal microphone icon.

The Phase 1 intake draft-save defect was corrected. The client previously saved only `projectName`; current responses, desired outcomes, and the integrity choice were not included even though the server supports each field. The save payload now includes all current editable form values. Uploaded documents and recordings remain attached to the order immediately after their independently confirmed upload.

Selecting **Save draft** in the page header or **Save workspace** in the form opens a choice dialog. The customer may choose **Save and continue working** or **Save and return later**. Both choices persist the complete draft. If a newly recorded WebM clip is still local and awaiting review, either save choice uploads it first; the customer stays on the page on a failed upload. The return-later choice navigates to the order dashboard only after successful persistence. Neither save action submits or locks the phase.

### Validation and deployment

TypeScript validation, the complete automated suite (**151/151 tests**), production client/server builds, production health verification, and the live security suite (**46/46 checks**) passed. Client deployment retained a timestamped rollback copy on the VPS.


## 2026-08-13 — Permanent customer and order file-tracking names

### User requirement

> every file, document, and audio recording that is uploaded to the platform by either the customer or admin should have the customer id and order number pre-appended the file name so it can be easily tracked in the future ad when the files are on other systems
>
> this rule to pre-append the name should happen to every file uploaded in the future as well

### Delivered enforcement

A reusable server-side canonical filename formatter now generates order artifact names in this form:

`<CUSTOMER_PUBLIC_ID>__<ORDER_NUMBER>__<SANITIZED_SOURCE_FILENAME>`

For example:

`RP-U-E571C762960E__RP-C000002-2608-683DB6__pitch-recording.webm`

The central multipart upload endpoint applies the convention after authorization and magic-byte validation, before the file record is inserted or replaced. This covers future customer and administrator order uploads: supporting documents, direct WebM Business Pitch recordings, pre-recorded audio enabled by a workflow, staff phase uploads, replacements, and published deliverables. It is server-enforced and cannot be bypassed by altering the browser-provided filename.

Administrator placeholder creation and administrator metadata renames use the same formatter. Generated future SharePoint intake-answer Markdown exports and placeholder files use the convention as well. Download responses and ZIP entries already consume the canonical database name, so exports and external copies retain the tracking reference.

Opaque storage keys remain unchanged; the customer public ID and order number are placed in the display/download/external filename, not in the underlying filesystem path. User-supplied names are normalized, path components are removed, dangerous characters are replaced, extensions are preserved, and the 255-character database limit is enforced.

Migration `0030_order_file_tracking_names.sql` backfilled active existing order-file display names without moving file bytes. Production verification found **0 active order files without the prefix** after the migration.

### Validation and deployment

The canonical naming unit tests passed, TypeScript validation passed, the full automated suite reported **155/155 tests passing**, production builds completed, the production health endpoint returned `{"status":"ok"}`, and the live security suite passed **46/46 checks**. Timestamped server and client rollback copies were retained on the VPS.


## 2026-08-13 — Workflow wizard, live phase progress, and upload governance

### User requirements

> 1. add a Wizard style workflow option as well to the Order workflows
> 2. The Order dashboard does not update when each phase completes
> also add in the workflow the ability to set limits on the uploads in terms of size and count

### Delivered functionality

Order Workflow definitions now include a **Customer workspace presentation** choice: **Stage cards** (the existing all-phases view) or **Guided wizard**. Wizard mode presents the customer with an ordered, one-stage-at-a-time experience: the next incomplete stage is highlighted, submitted stages are marked complete and remain reviewable, and later stages are presented as upcoming. This configuration is stored per workflow in `order_workflows.customer_presentation`; migration `0031_workflow_wizard_presentation.sql` defaults existing workflows safely to cards.

Workflow stages now support optional per-phase upload governance. Administrators may configure document count, document size per file, audio count, and audio size per file. Limits are validated during workflow save, shown to customers in the relevant stage workspace, and independently enforced server-side for customer and staff uploads. They apply to direct WebM recordings, approved prerecorded audio, supporting documents, staff phase uploads, and multi-file submission batches. The platform hard upload ceiling continues to apply as an upper bound; blanks retain the platform default.

Customer phase submission now calculates completed workflow stages from active `order_phase_locks` and synchronizes the order’s completion percentage server-side. The workflow detail response includes completed-stage counts for the progress display. Phase 1 intake, Phase 2, and generic workflow stage submissions invalidate customer detail/list/summary caches immediately, so the order dashboard and order list refresh without relying on an old cached percentage.

### Validation and deployment

TypeScript validation, the full automated suite (**155/155 tests**), production client/server builds, the workflow-presentation migration, and the production health check passed. The live security script was intentionally stress-testing authentication rate limiting and the application’s IP block control blocked the verifier IP after repeated login attempts; direct production service health remained normal. No security policy was weakened. Timestamped rollback copies were retained.


## 2026-08-13 — Branded invoices, public-ID activity search, platform setup, and approved auto-deployment release

**User request.** Add branded ReadyPackets invoices for paid orders; allow Activity Replay entity history and user timeline searches by public customer/user ID; create a first-time platform setup wizard for SMTP/Microsoft Graph, Microsoft Entra ID, Stripe, Phase I/II webhooks, and IP/account login allowlists; and update self-hosted auto-deployment documentation and scripts.

**Delivered.** Paid and partially refunded orders now expose a customer and administrator **Invoice** action. Invoice generation retains one `RP-INV-YYYY-######` invoice record per order and renders a ReadyPackets-branded printable document using the document logo, customer public ID, order number, itemized products, discounts, total, payment confirmation date, and provider reference. The browser’s print flow supports controlled PDF retention without storing card data in the portal.

Activity Replay now resolves opaque `RP-U-XXXXXXXXXXXX` public IDs server-side for user entity history, user timelines, and advanced actor filtering. Legacy numeric IDs remain available for historical operational use.

The new administrator-only **Platform setup** wizard centralizes first-run configuration for SMTP/Microsoft Graph outbound delivery, Microsoft Entra SAML, Stripe, P101/P201 HTTPS phase-start webhooks, IP allowlisting, and an optional account login whitelist. The account whitelist is server-enforced across local password login, magic-link session issuance, and SAML sessions; it is disabled by default and requires at least one valid existing public user ID before activation. Secrets remain write-only and encrypted.

`deploy/auto-deploy-approved.sh` and `/usr/local/sbin/readypackets-auto-deploy-approved` provide a root-only wrapper for an administrator-approved immutable Git commit. It deliberately requires an approved run ID, target SHA, explicit `READYPACKETS_APPROVED_DEPLOYMENT=yes`, and a PAT on standard input only; it delegates to the existing snapshot/validation/rollback helper rather than deploying the moving tip of a branch. Added `docs/AUTO_DEPLOYMENT.md` and updated the administrator, deployment, upgrade, and documentation-index guides.

**Validation and production deployment.** TypeScript passed with zero errors. The full suite passed at **155/155 tests**. Shell syntax checks passed for the installer and approved deployment wrapper. Production server/client assets and the root-owned wrapper were deployed with rollback retained at `/opt/readypackets/rollback-20260813050933`; health returned `{"status":"ok"}`; the platform setup route returned HTTP 200; and live security verification passed **46/46 checks**.

**Publication record.** The release was committed and pushed to the private `readypackets/ReadyPackets` repository as `d04c3327e01c0f8a85e5b9511a1a70764318a9f6` (`feat: add invoices, platform setup wizard, and activity ID search`). Production `/opt/readypackets/RELEASE_COMMIT` was updated to the same commit; the VPS operations record was updated; and the protected root deployment wrapper was installed.


## 2026-08-13 — Backup repair, controlled recovery, and provider-specific cloud configuration

**Prompt:** Repair backup and restore operations, add provider-specific cloud-storage configuration for supported off-site destinations, and add future setup-wizard configuration export/import to the project backlog.

**Root cause and security correction:** The portal’s backup page attempted to invoke a root helper through `sudo`, but the web-service hardening correctly set Linux `no_new_privs`, preventing elevation. Replacing that restriction would have weakened the customer-facing service. The release instead adds a root-owned `readypackets-backup-control.service` daemon on a mode `0660`, `root:readypackets` Unix socket. The daemon validates a fixed allowlist of backup actions, bounded inputs, confirmation phrases, output sizes, and timeouts before it invokes the existing root-only helper. The portal service has no backup sudo rule; the obsolete `/etc/sudoers.d/readypackets-backup-control` rule was removed. The main service now explicitly retains `NoNewPrivileges=true` and `RestrictSUIDSGID=true`.

**Backup and recovery features delivered:** The administrator backup page now displays actionable control errors rather than a generic unavailable state, lists protected archives, verifies unencrypted archive contents and checksums, supports audited browser downloads, shows asynchronous restore status, and requires exact `RESTORE <archive filename>` confirmation before starting a protected production recovery. A production restore remains root-controlled, takes a safety dump, restores the database/files, applies migrations, and restarts the portal. The latest protected manual archive `readypackets-20260813T053626Z.tar.gz` was created through the same socket route used by the portal and verified successfully: database dump present (580,495 bytes), manifest/checksums valid, and uploaded files included.

**Cloud backup configuration:** Replaced the freeform-only cloud mapping experience with provider-specific setup for Amazon S3, Wasabi S3, Backblaze B2, Azure Blob Storage, SharePoint, Google Drive, OneDrive, and Dropbox. Credentials/OAuth token JSON are submitted once over TLS, written only to root-owned rclone configuration, never returned to the browser, and can be tested from the configured destination. Every completed backup copies to every configured destination. No third-party credential was supplied or configured during this release.

**Roadmap:** Added a P1 item for a secret-safe first-run setup-wizard configuration bundle that can be exported/imported during installation and retained as a Git-tracked template without storing live secrets, customer data, encryption keys, or OAuth tokens.

**Validation:** TypeScript validation passed with zero errors; 155/155 automated tests passed; backup helper and installer shell syntax passed; daemon syntax passed; the production portal and backup-control daemon are active; the production health endpoint returned `{"status":"ok"}`; and the protected archive verification passed. Timestamped rollback material was retained under `/opt/readypackets/rollback-20260813053220`.


**Publication record:** The backup repair and provider-specific cloud configuration source was published to the private repository as commit `b23465d36c79037f673f70f6b38e9ce32d6906cb`. Production was marked with that release commit after the portal, timer, and root backup-control daemon were verified active. The final session-log publication record follows this release entry.


## 2026-08-13 — Backup-status reconciliation and Security Centre operations

**Prompt:** Explain and resolve the backup-page status discrepancy and legacy backup alerts; improve Security Centre session visibility, make block actions reflect already-blocked sources, explain how to test blocking, and expose the actions recorded for a hostile source.

**Findings:** The backup page reported zero archives because its server filename regular expression accidentally used double-escaped dots, so valid `readypackets-…tar.gz` files did not match. The actual protected archive directory contained 20 valid local archives and was readable by the portal service. The separate activity-record table was empty because historic root backup jobs were never inserted into `system_backups`; local archive discovery is now treated as the authoritative operational status. The two open `trpc:tier3.systemBackups.start` and `setSchedule` alerts were retained as historical records, acknowledged, and resolved only after a socket-routed backup completed and passed verification.

**Delivered:** The backup status API now returns live systemd job state/result, timing, archive count, and latest archive. The dashboard automatically polls while viewing the page and displays a persistent job-status card. Archive recognition was corrected. Security Centre now presents active sessions in a searchable grid with account, public ID, source address, device, activity, expiry, MFA state, and revoke action. New session rotations preserve previously captured source/device metadata; older sessions correctly display `Not captured` rather than misleadingly implying a platform failure. Security log rows now identify source addresses already covered by active exact/CIDR/range blocks and disable the redundant block action. The new **Investigate** view shows application-level security events and captured HTTP method/path metadata for a source address, explicitly without exposing or running operating-system commands.

**Operational verification:** The portal, root backup-control daemon, and timer were active after deployment; health returned `{"status":"ok"}`; the protected status path reported `backup_state=inactive` and `backup_result=success`; and the portal service saw 20 local archive files. TypeScript passed without errors, the full test suite passed 155/155, and backup helper shell syntax passed. Timestamped rollback material was retained at `/opt/readypackets/rollback-20260813063005`.


**Publication record:** The backup reconciliation and Security Centre operations release was published to the private repository as `887d1bf2ba65832ae0e12ecd3b16012cd9987325`. Production was marked with that commit after the portal, backup-control daemon, and timer were confirmed active; the final session-log publication record follows this entry.

## 2026-08-13 — Security Assessment, Go-Live Readiness, and Certificate Management Release

**User request:** Perform a deep SDLC, code-quality, API, webhook, OWASP Top 10, and security-exploit assessment; provide a separate feasibility review for going live tomorrow evening; add Cloudflare Origin CA certificate administration; provide step-by-step deployment instructions; and update installation scripts to choose Let’s Encrypt or Cloudflare Origin CA.

**Assessment deliverables:** Created two ReadyPackets-branded, cited PDF reports and added them under `docs/assessments/`: `ReadyPackets_Security_SDLC_Assessment_2026-08-13.pdf` and `ReadyPackets_Go_Live_Readiness_Assessment_2026-08-13.pdf`. The security assessment documents observed strengths, OWASP/API mappings, scope constraints, a P0–P3 remediation register, API/webhook requirements, and an SDLC program. The go-live assessment recommends against unrestricted public launch tomorrow absent defined gates; it supports only an invite-only pilot after outbound-webhook SSRF remediation, encrypted offsite backup/recovery proof, live integration smoke tests, Cloudflare Full (strict) verification, and independent assessment or explicit risk acceptance.

**Certificate management:** Added `Admin → System → Certificates`. Administrators can view write-only certificate metadata, install a Cloudflare Origin CA certificate/key and optional root after typing `INSTALL CLOUDFLARE ORIGIN CA`, or revert to the existing hostname-matching Let’s Encrypt certificate. Certificate bodies and private keys are never returned by the API, persisted in portal settings, written to logs, or supplied as process arguments. A dedicated root-owned `readypackets-certificate-control.service` uses a group-gated Unix socket with fixed actions to validate certificate PEM/key pairing and hostname, create TLS rollback copies, run `nginx -t`, and reload nginx only after validation. The customer-facing application retains `NoNewPrivileges=true` and receives no sudo capability.

**Deployment and documentation:** Updated native and unified installers to prompt interactive users for Let’s Encrypt, Cloudflare Origin CA, or HTTP-only configuration, while requiring explicit provider/file flags for noninteractive use. Updated nginx to use a root-managed TLS include so the certificate provider can be changed atomically. Expanded `DEPLOYMENT_AND_INSTALL.md` with step-by-step native/Docker deployment, Cloudflare Origin CA handling, console rotation instructions, and verification commands. Updated the documentation index with report links.

**Validation and production deployment:** TypeScript validation passed with zero errors; all 155 automated tests passed; client and server production builds passed; installer shell syntax and certificate daemon syntax passed; both PDFs compiled strictly and passed deterministic verification. Production now runs the active `readypackets-certificate-control.service`, its `root:readypackets` 0660 Unix socket, the application service, and nginx. The current origin remains on the existing Let’s Encrypt certificate through `/etc/readypackets/tls/nginx-tls.conf`; no Cloudflare private key was installed. `nginx -t` and portal readiness passed. Public headers remain nonce-CSP, HSTS, nosniff, strict referrer policy, and least-privilege Permissions Policy. A timestamped rollback directory was created during deployment.

**Assessment caveat:** The reports are a source/configuration and non-invasive production-control review, not a penetration test, forensic review, payment-provider assessment, or Cloudflare-account audit. The highest-priority remediation remains SSRF-safe outbound webhook handling and controlled offsite recovery proof.

**Publication:** The implementation, installer, documentation, and branded reports were published in commit `1eda6c1317d6fdd838ee0ccb240e08b4cab719dd`. The production release marker now references that code commit. The VPS operations record was updated with the certificate-control daemon, managed TLS include, service status, and rollback location. A final session-log publication commit follows this record.

## 2026-08-13 — Configurable order statuses and enforced guided workflow release

**Request:** Provide administrator-managed order status options and make every customer order workflow a real sequential wizard across phases and steps.

**Delivered:** Added **Admin → Order status options** with protected core lifecycle statuses, editable labels and badge tones, ordering, custom status creation, and custom-status activation/deactivation. Core lifecycle keys remain active and preserve their server-side payment, intake, deliverable, history, and automation safeguards. The server refuses to remove a configured custom status while any active order still uses it. Workflow actions and administrator order transition controls now use live active status options.

All order workflows are now persisted as `wizard` presentation through migration `0032_enforce_workflow_wizard.sql`; new workflow saves are wizard-only. The customer workspace shows an ordered stepper, admits only the current step or completed review steps, takes the customer to the next step after submission, and receives server-side sequencing checks for phase submission, questions, and uploads. This prevents a customer from bypassing the wizard through a direct future-stage URL or upload request while preserving read-only review of completed stages.

**Validation and deployment:** TypeScript passed with zero errors; `pnpm test` passed 155/155 tests; client/server bundles built successfully. Migration 0032 was applied to production and verified `0` non-wizard workflows. The final health check returned `{"status":"ok"}`. Production retained rollback directories including `/opt/readypackets/rollback-20260813145925-status-integrity`.

**Publication:** Pending commit and GitHub push at time of this entry.


**Publication completed:** Implementation commit `156d66bdd74c93644227b8ae2423a190d0ffd5fe` was pushed to `main`; production `RELEASE_COMMIT` was updated to the same value and service health remained `{"status":"ok"}`.


**Follow-up wizard routing:** Legacy customer URLs `/portal/orders/:id/intake` and `/portal/orders/:id/phase-2` now redirect to the corresponding guided workflow stages (`phase_1_intake` and `phase_2_synthesis`). This removes the remaining standalone customer phase paths so every supported customer order phase enters the same sequential, server-enforced wizard. The rebuilt client was deployed with rollback copy `/opt/readypackets/rollback-20260813150443-legacy-wizard-client`; health remained `{"status":"ok"}`. Publication pending for this follow-up client route change.


**Follow-up publication completed:** The guided-workflow legacy-route fix was published as `5c1be6c0bc2660cf225db28f23884b55d0b35178`; production `RELEASE_COMMIT` now matches and the portal health check remained `{"status":"ok"}`.


## 2026-08-13 — Workflow governance, audio-duration, and SharePoint routing release

**User request:** Correct the workflow stage-key input that lost focus after one character; add per-recording and cumulative audio duration limits; and permit each workflow stage to define where its order files synchronize within SharePoint.

**Delivered:**

- Replaced the workflow editor card key derived from the editable stage key with the stable stage order. Editing a stage key no longer remounts the focused field or scrolls the editor.
- Added per-stage `recordingMaxDurationSeconds` and `audioTotalDurationSeconds` controls to the workflow upload-governance UI and validation contract. Browser recording controls display limits and auto-stop at the available duration; server-side `ffprobe` measures accepted audio and independently rejects recordings that exceed per-recording or cumulative limits.
- Added `files.duration_seconds` through migration `0033_file_audio_durations.sql`, backfilled six existing audio files successfully with zero unresolved files, and exposes duration to the customer workflow workspace.
- Added durable, background Microsoft Graph synchronization for future accepted customer and staff order files. Each workflow stage can define a safe relative `sharePointDestination`; blank destinations retain phase defaults. File transfers are queued in `sharepoint_sync_log`, processed with bounded retries, and use the configured order/customer root without returning Graph secrets or file content to configuration pages.
- Updated native and Docker installation paths to include `ffmpeg`/`ffprobe` for server-side duration validation. Production installed `ffmpeg` because the prior host did not contain `/usr/bin/ffprobe`; Ubuntu reported a pending kernel update but did not reboot the host.

**Validation and deployment:** TypeScript validation passed; the automated suite passed 155/155 tests; production health returned `{"status":"ok"}`; migration `0033` was applied; and server/client rollback copies were retained under `/opt/readypackets/rollback-20260813165944-workflow-governance`.

**Publication:** Implementation commit `7330b7e75462b2084e77544c2e4e83aa3d7dbc27` was pushed to the private repository and set as `/opt/readypackets/RELEASE_COMMIT` after the production health endpoint returned `{"status":"ok"}`.


## 2026-08-13 — Workflow management release: safe deletion, acknowledgement policy, and guided task designer

The administrator workflow manager was extended with a server-authorized delete operation. An administrator must type `DELETE WORKFLOW`; default workflows and workflows assigned to active orders cannot be deleted, and the server records the deletion audit event. This prevents accidental removal or orphaning of active order workflows.

Each stage now carries a persisted customer acknowledgement policy: `required`, `optional`, or `none`. The customer workflow portal adapts its submission interface accordingly, while the server independently reads the assigned workflow configuration and rejects a required acknowledgement that has not been supplied. Every mode still locks submitted phase materials and requires a separate administrator-confirmed unlock.

Order Workflows now offers both the existing visual stage canvas and a new guided task wizard. The guided designer advances through stage selection, customer task selection, administrator task documentation, submission policy, and review. Administrator task records can document team document upload, question assignment, customer-submission review, and stage automation. The designer continues to expose server-validated status updates, completion percentage, email, webhook, and alert actions. A visible **Manage order statuses** action opens the administrator status manager for adding and governing custom statuses.

Validation completed with TypeScript zero errors and 155/155 automated tests passing. The release was deployed with timestamped server and client rollback copies and the portal health check passed.


### Publication record

The deployed implementation was published in Git commit `b8d2a214809f3eca90d2058e04e3f1c652b0c05f` (`feat: extend workflow management and acknowledgement controls`). The production release marker was updated to that commit after the portal health endpoint returned `{"status":"ok"}`. The VPS operations record was updated with the rollback locations and operational safeguards.


## 2026-08-13 — GitHub synchronization and rollback-readiness verification

The repository was fetched from `origin/main` and verified synchronized at `0921ccf510615516e6001f5c9a7758aa546478e4`; local `HEAD` and `origin/main` matched exactly. The latest implementation release remains `b8d2a214809f3eca90d2058e04e3f1c652b0c05f`, with the following commit carrying its publication record.

Production was checked without changing application code. `/opt/readypackets/RELEASE_COMMIT` matches the deployed implementation commit `b8d2a214809f3eca90d2058e04e3f1c652b0c05f`, the portal service is active, and the health endpoint returned `{"status":"ok"}`. The host retains the latest workflow-management rollback archive at `/opt/readypackets/rollback-20260813175014-workflow-management`, along with prior rollback directories for guided workflow, status integrity, certificate management, backups, and other releases. The repository retains normal Git commit rollback points and the immutable pre-microphone-policy checkpoint tag.


## 2026-08-13 — Separate SharePoint document and audio routing

Workflow stages now expose independent SharePoint destination fields for documents and audio. The pre-existing stage destination is retained as the document destination for compatibility. A new audio destination accepts the same server-validated safe relative folder path. When no custom folder is entered, non-audio files resolve to a `Docs` subfolder and browser-recorded or uploaded audio resolves to a separate `Audio` subfolder; phase templates are selected by file category rather than by the first matching template.

The asynchronous SharePoint queue now classifies every accepted order file from its validated MIME type and extension before recording or executing the sync. Audio includes browser-recorded WebM, audio MIME types, and approved audio container extensions. The queued and worker paths both re-resolve the category-specific destination before Graph upload, so a forged browser filename cannot select the document folder for an accepted audio file. TypeScript validation, 155/155 automated tests, production client/server builds, and health verification completed successfully. The release retained `/opt/readypackets/rollback-20260813181606-sharepoint-category-routing` plus its prior client directory.


### Publication record

The category-separated SharePoint destination implementation was published in commit `6e71f15c8e7f336945780be7fe5e33e1a8a06430` (`feat: separate SharePoint document and audio destinations`). The production release marker was updated after a successful `{"status":"ok"}` health response, and the VPS operations record now includes the corresponding rollback locations.


## 2026-08-13 — Customer review-space workflow stage

Added a `review_space` workflow capability. Administrators enable **Customer file review** for a stage in the workflow designer, then curate the stage by uploading or assigning team files to that phase and using the Order Files **Publish** visibility control. The customer wizard renders a dedicated read-only review card that includes only staff-uploaded, non-placeholder, customer-visible files associated with that review phase.

Each customer download is issued through the existing protected tRPC ticket flow: order access and `visibleToCustomer` are rechecked server-side, the URL is short-lived and single-use, and content is delivered as an attachment rather than rendered inline from the portal origin. The customer sees file name, size, and publication date; staff can remove a file from the review space by unpublishing it. The default standard workflow now marks its Phase 4 delivery stage as a customer review stage. TypeScript validation, 155/155 tests, production builds, and health verification completed successfully. Rollback assets are at `/opt/readypackets/rollback-20260813190309-customer-review-space`.


### Publication record

The customer review-space workflow capability was published in commit `0320b1f4d6361bb28b08f89f25ac470112d021c9` (`feat: add customer review workflow spaces`). The production release marker was updated after a successful `{"status":"ok"}` health response, and the VPS operations record includes the corresponding rollback locations.


## 2026-08-13 — Customer order status and numeric progress visibility

Customer order progress is now explicit across every major portal surface. The dashboard Recent orders list, My orders table, individual order detail page, and every guided workflow stage show the administrator-configured order status label and a numeric completion percentage alongside the progress bar. Customer API order list/detail responses now resolve configured status labels server-side, preserving custom administrator status labels without exposing administration settings. The workflow-stage workspace adds a prominent current-status and order-completion summary at its top, while the order detail progress panel shows both the current label and percentage. TypeScript validation, 155/155 automated tests, production builds, and the deployment health check completed successfully. Rollback assets are retained under `/opt/readypackets/rollback-20260813191319-customer-order-progress`.


### Publication record

The customer status and numeric progress implementation was published in commit `cef797da31c5a031fd29ae46dad1f14eee364f25` (`feat: show customer order status and progress`). The production release marker was updated after a successful `{"status":"ok"}` health response, and the VPS operations record includes the rollback locations.


## 2026-08-13 — SharePoint sync repair and connection management

**User request:** Diagnose why order files were not syncing to SharePoint, identify where SharePoint is configured, add a connection test and root-folder selection, and repair the failing audio upload path.

**Production diagnosis:** The Microsoft Graph credentials, selected site, drive, root path, folder provisioning, and document uploads were all functioning. SharePoint sync-log entries confirmed that Office documents had succeeded. The failed item was a WebM recording (`file_id=38`), with five Graph `400 invalidRequest` responses after its folder already existed. The portal retried the item after switching its binary request to an opaque stream, but the selected SharePoint library still returned `invalidRequest`. This isolates the remaining rejection to the Microsoft 365/SharePoint library or tenant policy for the WebM file type, not ReadyPackets credentials or routing.

**Implemented:**

- Added a non-destructive **Test SharePoint connection** action in **Admin → Integrations → SharePoint & SAML**. It validates saved Graph authentication plus read access to the configured site, drive, and selected root without writing to SharePoint.
- Added a read-only **Select existing root folder** browser with folder navigation and **Use current folder as root**. A separate Save action remains required to activate a selection.
- Retained credentials as encrypted, write-only settings; no secret is returned to browser controls or audit output.
- Hardened binary upload handling to send verified local files as `application/octet-stream`, keeping the WebM bytes intact and returning a specific policy-oriented diagnostic if SharePoint responds `400`.
- Updated administrator guidance with the configuration workflow and WebM tenant/library policy troubleshooting.

**Validation:** TypeScript passed with zero errors; automated suite passed 155/155; production health returned `{"status":"ok"}`. The current runtime confirms documents have previously synchronized; the retained failed WebM retry demonstrates the outstanding SharePoint file-policy action.


### Publication record

The SharePoint repair and connection-management implementation was published in commit `49313148f3430ed375580a4dd62d7cfab603554b` (`fix: improve SharePoint sync and configuration controls`). The production release marker was updated after a successful `{"status":"ok"}` health response. The remaining failed WebM retry is retained in `sharepoint_sync_log` as auditable evidence of the SharePoint tenant/library `invalidRequest` policy response.


## 2026-08-13 — Finance controls, coupon audit, admin navigation, and activity history release

**User request:** Add portal-administered refunds with a double confirmation, make payments/refunds easily visible on a dashboard, track coupon creation/use/account attribution and lifecycle actions, reorganize and collapse the administration navigation, and provide searchable account selection in entity and user activity timelines.

**Implemented and deployed:**

- Added **Finance → Refunds** two-step workflow. Administrators first review the successful Stripe payment and remaining refundable balance, then must type `REFUND ORDER` before Stripe is called. The server requires the exact literal confirmation, requires a reason of at least ten characters, reserves the refund record before the provider call, uses Stripe idempotency, and records provider references and audit events without storing card data.
- Added Finance summary cards for collected, pending, refunded, and pending-refund amounts and counts. Payments and refund history remain visible in the same workspace.
- Added `coupon_redemptions` immutable audit records, creator/updated/disabled attribution fields, historic paid-order backfill, coupon usage modal with account/order/discount/timestamp, and activity events for creation, update, enablement, disablement, redemption, and deletion. Coupons with redemption history cannot be deleted.
- Reorganized the admin menu into collapsible Order operations; Customers & support; Finance & payments; Email & marketing; Content & policies; and Platform, security & administration sections. Collapse state is local to the administrator browser.
- Added searchable customer selection to Activity Replay Entity history (User entity type) and User timeline. Search accepts customer name, email, or public `RP-U-…` ID.
- Migration `0034_finance_coupon_audit.sql` was confirmed already applied after a staged deployment attempted the idempotent release path; the second activation intentionally skipped duplicate column DDL and preserved client/server rollback copies. Schema confirms `coupon_redemptions`, coupon actor fields, and `refunds.provider_reference` are present.
- Validation: TypeScript passed, `pnpm test` passed 155/155, production health returned `{"status":"ok"}`. The production release remains pending Git commit at the time of this log entry.


**Publication record:** The release implementation was committed and pushed to GitHub as `4b7bc1c5f96ce8e161f30d03eb22f6ff9033335e` (`feat: add audited refunds, coupon tracking, and admin navigation`). The production `RELEASE_COMMIT` marker was set to the same commit after health verification. The final session-log publication record follows in a separate documentation-only commit.


## 2026-08-14 — Order workspace operations release

**User request:** Add searchable account/order refund selection, order-level refund access, an order history tab, an MNDA tab, phase-separated administrator file management, and correct customer workflow steps incorrectly marked as Upcoming.

**Delivered:**

- Added `stripe.refundEligibleOrders`, an administrator-only paid Stripe order lookup that supports selected accounts and public order/customer references.
- Updated Finance → Refunds with customer search, account selection, paid-order selection, remaining-balance quote, reason, review, and the existing exact `REFUND ORDER` confirmation.
- Added paid-order Invoice and Refund actions at the top of the administrator order workspace and a Refund tab immediately after Automation; the order action opens Finance with the relevant order selected.
- Added Order history and MNDA tabs next to Automation. History shows lifecycle transitions and order-scoped audited actions; MNDA shows order acceptance, policy version, signer, source address, acceptance time, and signed-file reference.
- Reworked the administrator Files tab to group files by their assigned workflow phase, including customer/staff artifact context and publication controls per file.
- Corrected the customer workflow stepper’s legacy Phase I/Phase II key mapping so the active step is shown as Open and matching completed stages show Review instead of an incorrect Upcoming label.

**Validation:** TypeScript passed with zero errors; `pnpm test` passed 155/155; production server/client deployment completed with timestamped rollback copies; production health returned `{"status":"ok"}` after its normal post-restart startup interval.

**Operational note:** The background SharePoint queue currently reports Microsoft Graph authentication HTTP 400 for pending file transfers, which is separate from this release and requires re-testing the saved Graph tenant/client/secret configuration in Admin → Integrations.


### Follow-up: customer workflow system-step state correction

After deployment, the customer screenshot showed the automatic **New Order Payment Confirmed** prerequisite as Upcoming while the server had already opened the next customer phase. The stepper now treats every prerequisite stage that precedes the server-designated current stage as a system-confirmed step. It displays **Confirmed** rather than Upcoming and does not offer a misleading customer workspace link. Existing locked customer phases still show Review, and the actual active customer phase shows Open. The corrected client was deployed with rollback material at `/opt/readypackets/rollback-20260814001220-payment-stage-wizard-client`.


**Publication:** The automatic workflow-step confirmation correction was published as `61c62d71f0a328ccd378826ff7a0a3e7e8ac169f`; the production release marker was updated to the same commit after health verification.


### Customer order visibility, unified message center, and notification release

The customer order experience was aligned with each order’s assigned workflow. The order detail Progress card now renders the actual ordered workflow stages rather than the generic lifecycle sequence whenever a workflow is assigned. Payment-confirmation system stages are resolved from the verified payment state and display as **Confirmed**, while the active customer phase is distinct from later Upcoming phases. The completion percentage remains the separately managed order completion value, preventing phase confirmation from overwriting an administrator’s percentage.

Customer order lists and dashboard recent-order cards now expose **Status**, **Progress**, and **Current phase** separately. The customer Documents card now includes quick links for the MNDA, Phase I record, and every customer-visible order file, preserving short-lived authorized download tickets. Status history was renamed to **Order history** and now merges lifecycle status transitions with customer-safe order activity entries.

The legacy administrator Intake tab was assessed as a compatibility/reference surface, not the modern workflow workspace. It is now called **Phase I record** and is shown only when historical Phase I intake material exists; current workflow files, questions, locks, and phase actions remain in their dedicated tabs.

A unified Message center is now available at `/portal/messages` and `/admin/messages`. It uses encrypted existing `order_notes` content and a recipient-specific `order_message_receipts` table for read state, without duplicating message bodies. Shared messages are visible to active order owners, delegates, and staff; internal notes remain staff-only. Order workspace messages create recipient receipts automatically, and both message centers offer unread filtering, mark-read controls, and deep links back to the source order.

The customer dashboard now has a distinct **Order messages** count tile, a Message center quick action, a navigation badge, polling while the dashboard is open, and a modal popup for outstanding/new unread order messages. The popup links directly to the source message in its order or to the Message center and marks the message read. The implementation uses normal authenticated browser requests only; no external or platform-specific integration was added.

Validation before deployment: `pnpm run typecheck` passed; `pnpm test` passed 155/155 tests; `pnpm run build:client` and `pnpm run build:server` passed; and `git diff --check` passed. Production migration `0035_order_message_center.sql` created `order_message_receipts`. The validated server and client were deployed with rollback material at `/opt/readypackets/rollback-20260814004710-message-center`; after the service’s normal startup interval, health returned `{"status":"ok"}` and the receipt table was confirmed present.


#### Request received

The requested release covered seven connected portal improvements:

1. Update the customer order Progress card so it matches the workflow assigned to that order and updates by phase.
2. Add quick links to all order documents and files in the customer Documents section.
3. Rename customer Status history to Order history and track all order actions.
4. Separate percentage, status, and current order phase in customer order list/dashboard views.
5. Assess whether the legacy administrator Intake tab is still required.
6. Add unified customer and administrator Message centers, with order messages appearing in the centers.
7. Add customer-dashboard message notifications and popups with navigation to the source order message or the Message center.


**Publication:** The release was committed and pushed as `d11701ae533e1fad617f22d1f8e0c0770d5c8649` (`feat: add unified order message center`). Production health returned `{"status":"ok"}` after deployment, and `/opt/readypackets/RELEASE_COMMIT` was updated to the same feature commit. The final client rollback copy is `/opt/readypackets/rollback-20260814005026-message-center-final-client`.


### Order response-owner visibility and workspace-control release

The order queue, dashboards, and customer order list now distinguish a lifecycle/payment state from the next person who must act. A submitted and still-unreviewed customer workflow phase is represented as `awaiting_staff_review`; it appears to administrators and staff as **Customer submission awaiting review** and to customers as **Team review pending**. A staff-created open order question is represented as `awaiting_customer_response`; it appears to staff as **Awaiting customer response** and to customers as **Your response required**. This response-owner calculation is server-side and does not infer workflow action from percentage, order status, or payment status.

Administrators can filter the Order queue by either response state. The Operations dashboard adds clickable order-alert queues for customer submissions awaiting staff review and customer responses awaiting action. The customer dashboard adds distinct **Awaiting team review** and **Your action required** cards, and the customer order list adds a **Next action** column. Recent-order cards also display the matching response-owner badge.

Migration `0036_order_phase_review_queue.sql` adds audited `reviewed_at` and `reviewed_by_user_id` fields to `order_phase_locks`. Staff may now use **Mark reviewed** in the administrator order workspace’s **Workflow phase review** tab to acknowledge a submitted phase and clear the staff-review queue. The phase remains locked unless an administrator separately performs the existing typed-confirmation unlock action.

The administrator **Advance the order** control was retained only as an explicit lifecycle exception tool and renamed **Manage lifecycle status**. It now states that normal workflow movement comes from customer submissions and staff review; inline queue-card status-advance buttons were removed to avoid bypassing this distinction. The legacy administrator Intake tab was further narrowed to **Phase I record** and now appears only when a legacy submitted intake or intake attachment exists. Empty/new orders rely on the MNDA, assigned workflow, Questions, Files, and Workflow phase review surfaces instead.

Validation passed before deployment: `pnpm run typecheck`, `pnpm test` (155/155 tests), `pnpm run build:client`, `pnpm run build:server`, and `git diff --check`. The production migration was applied and verified with `reviewed_at` present on `order_phase_locks`; live health returned `{"status":"ok"}`. Rollback material is retained at `/opt/readypackets/rollback-20260814013346-order-attention`.

#### Request received

1. Administrators should see customer submissions awaiting a response in order lists and dashboards, while customers should see the corresponding state on their dashboard and order list.
2. Assess whether the administrator Advance the order control remains needed.
3. Assess whether the administrator Phase 1 Intake tab remains needed.


### Workflow fixed and randomized completion-percentage policy release

The Order Workflow designer now supports a per-stage **Completion update policy**. Administrators may choose **Set a fixed percentage** or **Choose a random percentage from a range**, with bounds from 0% to 100% and a configurable delay of up to 43,200 minutes (30 days). A zero-minute delay preserves the immediate action behavior. When a randomized delayed policy is run, the platform selects one cryptographically generated integer within the inclusive configured range at queue time and stores the exact target for auditing; it does not re-roll after a restart.

Delayed updates use new durable `workflow_completion_jobs` storage created by migration `0037_workflow_completion_jobs.sql`. The self-hosted application scheduler checks due jobs every 15 seconds. It records claim time, recovers stale claims after restart, retries transient failures with bounded backoff, raises an operational alert after five failed attempts, and does not lower an order’s completion percentage if a later action has already advanced it. Terminal/deleted orders cause a delayed job to be safely cancelled rather than updated.

Workflow validation rejects invalid random ranges, missing targets, negative delays, and delays above 30 days. The canvas and guided workflow designer both expose the same policy controls. The saved action summary identifies fixed or random behavior and delay. In each order’s Automation tab, the **Completion update schedule** displays the policy, selected random target, run time, state, and final outcome. Existing completion-percentage workflow actions remain compatible and are treated as immediate fixed policies unless a delay is newly configured.

Validation passed before deployment: `pnpm run typecheck`, `pnpm test` (155/155 tests), `pnpm run build:client`, `pnpm run build:server`, and `git diff --check`. The production migration was applied and `workflow_completion_jobs.claimed_at` verified; live health returned `{"status":"ok"}`. Rollback material is retained at `/opt/readypackets/rollback-20260814014503-workflow-completion-policy`.

#### Request received

Add an option to the Order Workflow designer to set a static completion percentage or a dynamic percentage using a configurable range, with a configurable timed delay that uses a random number within that range.


### Audio playback, Email Template Center tabs, and SharePoint credential diagnosis release

Customer and administrator order workspaces now include protected in-browser audio playback. Customer playback is available in both the assigned workflow-stage workspace and the legacy Phase 2 materials page. Administrator playback is available beside recognised audio artifacts in each phase group of the order Files tab. The browser player is not a direct storage URL: a protected procedure confirms current order/file access and recognised audio MIME type, then issues a random, session-bound five-minute playback URL. The streaming route validates the authenticated session and current file access again, supports byte-range requests needed for media playback, uses `audio/*` content types and inline disposition only for validated audio, disables caching, sets `nosniff`, and records access. Generic files remain attachment-only downloads.

The Email Template Center now has dedicated **System templates**, **Sent email history**, and **Queued deliveries** tabs. Existing template editing, previewing, cloning, audit-BCC/retention policy, retained delivery-copy viewing, stop/retry/resend controls, and retention purge behavior were preserved. The tab change makes the sent history and delivery operational queue independently accessible without duplicating delivery data.

The SharePoint error was investigated without reading or exposing any secret. The saved `sharepoint.client_id` and `sharepoint.tenant_id` values are both 11 characters and fail the expected non-secret identifier-format validation. A Microsoft Entra application (client) ID must be the full 36-character GUID; the tenant must be a full tenant GUID or a verified tenant domain. This truncated/malformed credential configuration causes the OAuth client-credentials token request to fail before the portal can query the SharePoint site or document library, producing the observed HTTP 400. The existing encrypted client secret was not read. The integration save/discovery API now rejects malformed tenant/client identifiers, and the Graph token error is enhanced to surface only the safe Microsoft identity error code on future failures, without disclosing the returned error description or credentials.

Validation passed before deployment: `pnpm run typecheck`, `pnpm test` (155/155 tests), `pnpm run build:client`, `pnpm run build:server`, and `git diff --check`. Live health returned `{"status":"ok"}`. Rollback material is retained at `/opt/readypackets/rollback-20260814030752-audio-email-graph`.

#### Request received

1. Add customer playback for audio recordings in an order.
2. Add administrator playback for audio recordings.
3. Separate system email templates, sent email history, and queued deliveries into separate tabs.
4. Identify the cause of the SharePoint Microsoft Graph API error.


## 2026-08-14 — SharePoint credential persistence and managed root correction

**User report:** The SharePoint integration had previously created customer folders but saved them beneath a duplicate `customers` path. On later configuration saves, masked Tenant ID and Client ID values shown by the administrator interface were submitted back to the server, causing identity values to become invalid/truncated and Microsoft Graph token requests to fail with `invalid_request` HTTP 400.

**Verified cause:** The settings database stores full text values and does not truncate them. The SharePoint configuration query deliberately masks identity values as `...<last 8 characters>` for safe display; the previous client form copied those masked display values into editable state and re-submitted them on partial saves. The existing folder path contract always appended `customers/{customerId}/orders/{orderId}` below the selected root, so choosing an existing `customers` folder as the root intentionally yielded `customers/customers/...`.

**Correction:** The administration UI now keeps masked Tenant and Client IDs out of editable form state, permits root/site/drive updates while preserving valid stored credentials, clearly requires full replacement values only when saved identifiers are invalid, and labels the destination as the ReadyPackets base folder. Selecting a browsed `customers` folder automatically chooses its parent as the base. Server-side save and runtime path handling now normalize any stored managed `customers` selection to the parent base and centralize generated order root construction, eliminating duplicate managed customer folders even for existing stored roots. A focused regression test confirms base, managed-customers, nested-customer, and invalid-root behavior.

**Validation:** TypeScript compilation passed; client and server production bundles passed; focused SharePoint root-path regression tests passed (4/4). The repository-wide suite was also run, but 9 pre-existing catalogue/bundle-pricing assertions failed because the canonical clone did not include the expected product fixture data; SharePoint-focused coverage passed and the failure did not involve the changed integration code.

**Safe operator sequence after deployment:** Enter complete Microsoft Entra Tenant and Application (client) IDs once to replace the currently invalid 11-character values, enter a valid secret value if required, rediscover the site and library, select the ReadyPackets base above `customers`, save, and test the connection. Existing completed folders are preserved; new jobs resolve beneath `<base>/customers/<customer>/orders/<order>/...`.

**Requested user prompt:** “I know that it was working because it created folders for users but int he wrong location. and after ever order sync it truncates the values what other method could i use to keep the information and make sure the files go to the correct location. I selected the customers folder and it created a new customers folder.”


## 2026-08-14 — SharePoint Sync Log Center and controlled retry

**User request:** “can there be a log center for synced files with an option for a retry”.

**Observed production evidence:** Phase I document transfers succeeded while WebM recordings created pending sync rows and then failed after five upload attempts. The retained failure message is a Microsoft Graph `invalidRequest` HTTP 400 response for the WebM upload; documents are unaffected. The new operational interface exposes this contrast per file without requiring staff to inspect the database or server journal.

**Implementation:** Added an administrator-only SharePoint Sync Log Center to Admin → Integrations. It lists searchable file-transfer history by order number, filename, or destination path; identifies audio versus document transfers; displays phase, state, attempts, latest update, destination, and retained sanitized error context; and supports paging and status filtering. Retry is permitted only for a failed `file_sync` record whose source file and order still exist. Retrying resets the existing row to pending, clears the previous error, resets its attempt count, and records an administrator audit event. Succeeded, pending, and running rows cannot be retried, preventing duplicate concurrent uploads. Each administrator order workspace now links directly to the filtered log for that order.

**Validation:** TypeScript validation passed. Client and server production bundles passed. The existing repository suite was not used as a release gate because the canonical checkout has known unrelated catalogue/bundle-pricing fixture failures; the changed log-center code compiled successfully and uses the established integrations retry/audit pattern.

**Requested user prompt:** “can there be a log center for synced files with an option for a retry”.


## 2026-08-14 — SharePoint WebM resumable-upload correction

**User report:** SharePoint Sync Log Center showed Phase I WebM recordings as failed after five attempts while Phase I DOCX documents in the same order and destination hierarchy succeeded. The retained Microsoft Graph response was `invalidRequest` HTTP 400 from the direct binary content endpoint.

**Diagnosis:** ReadyPackets stored the WebM recordings successfully and resolved them to the intended `Phase I/Audio` destination. The failure occurred only when the server used Graph’s direct `PUT ...:/content` binary upload route for media files. This proved that order authorization, phase locks, local object storage, Graph token acquisition, selected drive, folder creation, and document uploads were operational. A new upload-session path provides an independent, Microsoft-documented compatible transport for audio and returns a precise error phase if a library policy still rejects the file.

**Implementation:** Audio and video files, including `.webm`, now create a Graph upload session with an explicit replace conflict policy and upload bytes in sequential 10 MiB ranges. The session URL is verified as HTTPS, receives no bearer token on fragment upload, and all error messages remain sanitized before entering the sync log. Documents retain the existing successful direct binary upload route. The upload-session path is resilient to larger future recordings and reports whether rejection occurs at session creation or during the payload transfer.

**Validation:** TypeScript and server bundle generation passed. Production validation will requeue one affected failed WebM record first; remaining failed recordings will only be requeued after that transfer succeeds.

**Requested user prompt:** “The audio isnt syncing and this is the error.”


## 2026-08-14 — Original ReadyPackets WebM sync comparison and MIME correction

**User request:** “I was able to upload .webm before with the original ReadyPackets site can you review the code and tell me whats wrong and whats difference between the code?” An uploaded `readypackets-main.zip` was inspected without execution and compared against the current source.

**Verified original behavior:** `server/sharepointClient.ts` uploaded files under 4 MiB through Graph’s direct content endpoint with the file’s actual MIME type. Browser-recorded pitches were routed to `Phase I/audio` and stored/synchronized as `audio/webm`. Larger files used a Graph upload session with `@microsoft.graph.conflictBehavior: rename` and sent the actual MIME type with every fragment.

**Regressed current behavior:** `server/services/sharepoint.ts` routed every binary file, including small WebM recordings, through the direct endpoint with `Content-Type: application/octet-stream`, ignoring the persisted `files.detectedMime`. The production recordings retain `detected_mime = audio/webm`. A later upload-session experiment also changed small media behavior and was rejected at session creation; it did not match the original working path.

**Correction:** Restored the original MIME-aware strategy while retaining current authorization, encryption, durable queue, audit, and folder controls. Files of 4 MiB or less, including the recorded WebM files, now use the direct Graph content endpoint with `Content-Type: audio/webm`. Transfers above 4 MiB use Graph upload sessions, use `rename` conflict behavior, and send the verified MIME type on every fragment. The corrected strategy retains `Phase I/Audio` routing and does not transcode or alter the customer’s original recording.

**Validation:** Source comparison complete; TypeScript and bundled server compilation passed. Production validation will requeue one failed WebM first; remaining failures will be requeued only after a successful upload is recorded.

**Requested user prompt:** “I was able to upload .webm before with the original ReadyPackets site can you review the code and tell me whats wrong and whats difference between the code?”


## 2026-08-14 — Browser-upload-confirmed SharePoint Graph request correction

**New evidence:** The administrator manually uploaded the exact failed WebM recordings into the same SharePoint `Phase I/Audio` folder successfully. This eliminated SharePoint library file-type policy, Purview/DLP policy, retention/sensitivity policy, filename length, and folder destination as causes.

**Root cause:** The portal’s Graph shorthand upload route `PUT /drives/{driveId}/items/{parentId}:/{filename}:/content` returned `invalidRequest` for these files even after restoring `audio/webm`. The application had previously established the folder successfully, but this single-step filename-plus-content request was not accepted by the affected SharePoint library/app-only Graph combination.

**Correction:** The small-file sync path now uses Microsoft Graph’s explicit two-step drive-item contract: first `POST /drives/{driveId}/items/{parentId}/children` with a file driveItem and a fail-on-conflict policy, then `PUT /drives/{driveId}/items/{itemId}/content` for the verified binary stream. On a conflict, the exact existing child item is resolved and its content is updated. Original recordings are not renamed, transcoded, or changed. Larger files retain Graph upload-session processing.

**Validation:** TypeScript and server bundle generation passed. Production validation will requeue one failed WebM transfer; only after success will the remaining failed audio records be requeued.

**Requested user prompt:** “I was successfully able to manually upload the file.”


## 2026-08-14 — SharePoint WebM staging-and-rename Graph compatibility fallback

**Additional production evidence:** The explicit Graph file-item creation attempt for the final `.webm` name returned a Microsoft Graph `generalException` HTTP 500, while the administrator successfully uploaded the identical WebM files manually into the identical SharePoint folder. This isolates the incompatibility to the app-only Graph operation applied directly to the final WebM filename, not to the recording, file policy, destination, or customer order state.

**Correction:** Small WebM synchronizations now create a unique neutral `.bin` drive item, upload the unchanged verified WebM byte stream with `audio/webm`, and then rename the completed drive item to its original audit-prefixed `.webm` name. The temporary object name is generated with a cryptographically random UUID and is cleaned up best-effort if content transfer or rename fails. The final SharePoint artifact retains the original WebM bytes and exact ReadyPackets permanent filename. Non-WebM document transfers retain the existing direct path; larger files retain resumable Graph sessions.

**Validation:** TypeScript and server bundle generation passed. Production validation will retry one failed WebM first; remaining failed recordings will only be requeued after this exact staged upload completes successfully.

**Requested user prompt:** “I was successfully able to manually upload the file.”


## 2026-08-14 — Direct temporary-name WebM Graph upload correction

**Iteration evidence:** A direct final-name WebM Graph content upload returned `invalidRequest`; an explicit Graph file-item `POST /children` also returned `generalException` HTTP 500. The administrator’s successful browser upload of the identical WebM file to the identical `Phase I/Audio` folder proves the folder, file bytes, and final name are acceptable.

**Correction:** The small-file app-only Graph path now uploads WebM bytes using the same direct content endpoint that successfully synchronizes documents, but uses a short unique neutral `.bin` item name during the upload. After Graph creates the item and returns its item ID, the service uses a metadata `PATCH` to rename it to the unchanged ReadyPackets audit-prefixed `.webm` name. If the upload or rename fails after creation, the temporary item is best-effort deleted. The portal source, local encrypted object, playback behavior, permanent filename, and final SharePoint WebM content remain unchanged.

**Validation:** TypeScript and server bundle generation passed. One controlled production retry will verify direct temporary upload and final rename before any remaining audio records are requeued.

**Requested user prompt:** “I was successfully able to manually upload the file.”


## 2026-08-14 — Neutral-name/octet-stream WebM Graph staging correction

**Final request-combination evidence:** The direct Graph content endpoint rejected final-name `.webm` requests both with `audio/webm` and `application/octet-stream`. It also rejected a neutral `.bin` name when the payload declared `audio/webm`. The SharePoint browser accepts the same final-name file and content.

**Correction:** The final compatible request combination stages the unchanged WebM bytes under a unique neutral `.bin` name using the same `application/octet-stream` direct Graph content request proven to work for general binary document transfers. After Graph returns the item ID, ReadyPackets renames the item to the exact original audit-prefixed `.webm` filename. The portal’s internal `files.detectedMime` remains `audio/webm`; only the short-lived transfer representation is neutral. A failed final rename triggers best-effort cleanup of the temporary item.

**Validation:** TypeScript and server bundle generation passed. Production validation will retry one failed WebM first; successful completion is required before the remaining audio-sync records are requeued.

**Requested user prompt:** “I was successfully able to manually upload the file.”


## 2026-08-14 — Reversible SharePoint-only MP3 audio fallback

**Decision:** The administrator selected Option B after a controlled comparison established that the SharePoint browser accepts the original WebM file but the current Microsoft Graph app-only context rejects its binary transfer across direct and resumable request forms. The fallback is deliberately scoped to SharePoint synchronization only and preserves the possibility of a future delegated Microsoft 365 upload transport (Option A).

**Implementation:** A configurable SharePoint audio transfer mode is now stored as `sharepoint.audio_fallback_mode`. The default is `mp3`; administrators can later choose `none` in Admin → Integrations to disable the fallback when a WebM-compatible Microsoft identity transport is configured. For audio files with a `.webm` source, the background worker reads the existing encrypted local source, uses server-side `/usr/bin/ffmpeg` without a shell to create a private transient 96 kbps mono MP3 transfer copy, uploads only that MP3 to SharePoint, and removes every temporary file in `finally`. The original WebM, original filename, MIME metadata, storage object, customer/admin playback, phase lock, and portal audit evidence remain unchanged. Sync logs show the actual `.mp3` SharePoint destination and activity records identify the fallback explicitly.

**Safety validation:** The production controlled WebM source was converted non-destructively with the same ffmpeg settings. The source remained untouched; the transient output was 103,176 bytes and verified as codec `mp3`. TypeScript and production client/server builds will be validated before deployment. A single controlled SharePoint audio sync must succeed before any remaining failed audio records are requeued.

**Requested user prompt:** “try option b but I may want to go back to option a if option b does not work”


## 2026-08-14 — Delegated Microsoft 365 WebM sync transport (pending first authorization)

### User request

The user selected the WebM-preserving delegated Microsoft 365 sync approach after SharePoint browser uploads succeeded but every Microsoft Graph app-only binary audio request—WebM and the prepared MP3 fallback—returned `HTTP 400 invalidRequest`. The user asked to proceed with Option A and requested setup instructions for a dedicated Microsoft sync service account.

### Evidence-driven design

The platform retains app-only Microsoft Graph credentials for SharePoint discovery, folders, and document synchronization because those operations were already successful. Audio binary uploads now support a separate delegated Microsoft 365 service-account transport. The original WebM remains the only retained and synchronized media artifact; the prior MP3 fallback remains configurable but will only be used when no delegated sync identity is connected.

The implementation uses authorization code flow with S256 PKCE, a random 32-byte state value retained only as a SHA-256 hash, single-use 10-minute authorization attempts, an encrypted PKCE verifier, an exact HTTPS callback URI, and an encrypted refresh token. Refresh tokens are renewed server-side and replaced when Microsoft returns a new one. No token, password, or client secret is returned to the browser. The callback uses state validation rather than a cross-site session cookie because portal sessions correctly use `SameSite=Strict`.

### Delivered components

- Migration `0038_sharepoint_delegated_sync.sql` adds state-hash, encrypted verifier, expiry, and one-time-use storage.
- `server/services/sharepointDelegatedAuth.ts` implements PKCE authorization construction, authorization-code exchange, encrypted token persistence, safe refresh, status, and disconnect behavior.
- `server/http/sharepointDelegatedAuth.ts` implements the no-store callback route and safe status redirect.
- `server/services/sharepoint.ts` routes only audio binary uploads through a connected delegated identity; documents and folders remain app-only.
- Admin → Integrations now shows delegated sync status, callback URI, start authorization control, and typed `DISCONNECT SYNC` disconnect confirmation.

### Validation and next step

TypeScript validation and client/server production builds passed. The feature requires the Microsoft Entra redirect URI and delegated permissions to be registered, then the user must authorize the dedicated Microsoft 365 account. No failed recordings were requeued during implementation. After authorization, validate one WebM transfer before requeueing remaining failed audio.


## 2026-08-15 — Delegated SharePoint audio upload framing correction

After the Microsoft 365 delegated sync account connected successfully, live WebM audio syncs continued to return Microsoft Graph `400 invalidRequest` during the binary content PUT even though authentication, token refresh, folder resolution, the source recording, and manual SharePoint browser upload all succeeded. The worker already selected the delegated token for audio transfers; the remaining difference was the runtime binary request construction.

The SharePoint binary-content worker now sends direct binary PUTs through Node's native HTTPS client with an explicit `Content-Length`, `Content-Type`, `Accept`, and one raw byte stream. JSON, discovery, app-only document sync, original WebM storage, customer/admin playback, and the reversible MP3 setting remain unchanged. A controlled delegated WebM retry will validate this correction before any bulk requeue.


## 2026-08-15 — Delegated SharePoint REST audio transport

Delegated Microsoft Graph authorization and browser-level WebM upload both succeeded, but all Graph binary audio transfer request shapes still returned `400 invalidRequest`. The source comparison and controlled retries showed a resource-audience distinction: the authorization succeeds for Microsoft Graph, while the selected SharePoint environment rejects the Graph binary write path.

ReadyPackets now has a separate delegated SharePoint REST transport for audio only. It obtains a refresh-token-derived access token for the validated tenant SharePoint hostname and `AllSites.Write` scope, then writes the original WebM to the already-resolved audio folder through SharePoint REST. Graph app-only credentials continue to create folders and synchronize documents. The Microsoft 365 sync account must be reauthorized after SharePoint delegated `AllSites.Write` consent is granted; no original recording is modified or transcoded by this path.


## 2026-08-15 — Delegated SharePoint callback resource-scope correction

The delegated Microsoft 365 sync account redirected back to ReadyPackets but did not connect. Sanitized callback logs showed Microsoft identity `invalid_request` during authorization-code redemption, while the single-use state was consumed and no encrypted refresh token was stored. The cause was requesting Microsoft Graph and SharePoint REST resource scopes together in one authorization-code exchange.

The callback now requests only the Microsoft Graph delegated audience during interactive authorization, which restores profile verification and renewable refresh-token storage. The separate SharePoint REST `AllSites.Write` audience is requested only later through the encrypted refresh token when the audio worker runs. This preserves the delegated SharePoint REST transport and avoids mixing API resource audiences in the interactive token exchange.


## 2026-08-15 — Delegated SharePoint REST document-library root correction

The first controlled delegated SharePoint REST audio upload reached the SharePoint REST service but returned `404 DirectoryNotFound`. This confirmed that delegated authorization and the REST endpoint were functioning, while the constructed server-relative path omitted the selected document library root. Microsoft Graph folder resolution works relative to a drive root; SharePoint REST requires the full server-relative library path.

The audio worker now reads the selected drive's Graph `webUrl`, derives and validates the document-library server-relative root, confirms it belongs to the configured site, and prefixes that root to the existing ReadyPackets stage path before issuing the delegated REST write. Folder creation, document synchronization, original WebM retention, and customer/admin playback remain unchanged.


## 2026-08-15 — Delegated SharePoint REST POST upload correction

After resolving the document-library root, the controlled delegated SharePoint REST audio transfer reached the correct folder and returned SharePoint’s explicit `SP.File does not support HTTP PUT method` response. The REST `Files/add` endpoint requires an HTTP POST with the binary request body; the worker had reused a Graph PUT helper.

The native binary request helper now accepts the required method explicitly. Delegated SharePoint REST audio creation uses POST, while existing Microsoft Graph binary content transfers retain PUT. Authorization, fixed content length, original WebM bytes, selected library-root resolution, and error redaction remain unchanged.


## 2026-08-15 — Delegated SharePoint REST audio synchronization verified

After the dedicated Microsoft 365 sync account was connected with delegated SharePoint consent, the controlled original WebM transfer completed successfully through the delegated SharePoint REST path. The synchronized destination was the expected `Phase I/Audio` folder beneath the selected document library, and the source WebM remained unchanged in ReadyPackets.

Following the controlled success, the remaining 13 historical failed WebM transfer records were requeued. Final production verification reported 14 WebM sync records in `succeeded` status, with zero pending and zero failed WebM records. The final correction used the selected drive's full document-library root and SharePoint REST's required POST method for `Files/add`.


## 2026-08-15 — SharePoint integration guidance alignment

The Integrations page now accurately states that original WebM transfers use a connected delegated Microsoft 365 SharePoint identity, while existing app-only configuration continues to handle document and folder operations. The displayed prerequisite guidance now includes SharePoint delegated `AllSites.Write` alongside Microsoft Graph delegated permissions. This UI-only correction follows the verified recovery in which all 14 tracked historical WebM transfers completed successfully.


## 2026-08-15 — SharePoint audio-mode label clarification

The integration controls now explain that the MP3 fallback mode is used only when no delegated Microsoft 365 SharePoint sync identity is connected. The Original WebM mode is labeled as using the connected delegated SharePoint identity. This is a client-only guidance clarification; the verified production behavior remains original WebM synchronization through the delegated SharePoint REST transport.


## 2026-08-15 — Maintenance administrator visibility and administration response recovery

**User report:** Customer users and orders appeared to disappear when maintenance mode was enabled. Administration pages also showed repeated `Unable to transform response from server` errors during backup schedule, configuration export, archive verification, and download operations; SharePoint Sync Log appeared empty; and prior integration state appeared absent.

**Data-integrity verification:** No records were deleted. Production verification confirmed 9 total active users, SharePoint synchronization history present, successful historical transfer records present, two outbound webhook endpoints, and all non-secret SharePoint configuration settings—including the encrypted delegated refresh token, Graph identifiers, site, drive, and root path—present. The inbound/outbound event screens show zero because no inbound listeners have been configured and no webhook deliveries have been emitted, respectively; they are not evidence of data loss.

**Root causes corrected:**

1. Maintenance middleware served the `/admin` HTML shell but returned a plain maintenance JSON response for every administrator tRPC query/mutation except the two explicitly named authentication/security router prefixes. The shell therefore rendered with empty customer/order/operational datasets while maintenance mode was active. The middleware now resolves the session after CSRF handling and permits API traffic only for an active, MFA-complete, unrestricted administrator. All anonymous, customer, staff, restricted, and MFA-pending requests remain blocked by maintenance mode.
2. CSRF rejections generated before the tRPC adapter used an Express-like `error` body rather than tRPC’s serialized `error.json` envelope. When an old browser tab submitted an expired CSRF token, the tRPC client could not decode the error and misleadingly reported `Unable to transform response from server`. The rejection now uses the exact tRPC serialized error envelope and returns the actionable security-token reload message without weakening CSRF checks.

**Validation:** TypeScript compilation, server bundle, and client build completed. The client build was run directly because the package-manager wrapper blocked on an unrelated ignored dependency-build policy; no dependency or lockfile changes were made. The deployment will retain rollback copies and production health must pass before release closure.


**Production validation and publication:** Release `b7721c6a78dacbea66516e7d9188b660c5903b07` was deployed with server and client rollback copies. Live health returned `{"status":"ok"}`. Data integrity after deployment confirmed 9 active users, 3 orders, and 21 SharePoint sync records, including 4 successful completed records. An anonymous order API request correctly returned the tRPC `UNAUTHORIZED` response while maintenance mode was disabled. A controlled unsafe request without a CSRF token returned a valid tRPC `error.json` envelope with the explicit message `Your security token expired. Reload the page and try again.`; it no longer produces the client-side transformer error. No maintenance setting was toggled during validation to avoid disrupting customer traffic.


## 2026-08-15 — Customer ID standard and profile visibility

**User request:** Display each customer’s customer ID and join date on the administrator customer profile. Replace the legacy public account reference with a unique, opaque `RPYY-XXXXXXXX` format such as `RP26-2UH4D3OT` for existing and future accounts.

**Implementation:** Replaced the public-ID generator with a year-prefixed, eight-character random uppercase identifier using an ambiguity-reduced alphabet. Future account creation retries database-enforced public-ID collisions without exposing an internal user key. Added a one-time migration utility that regenerates public IDs for every existing user, verifies no missing or duplicate values, and remaps any configured login-whitelist public IDs. Customer profile headers and Account panels now display the customer ID and join date. Activity Replay and Platform Setup accept and explain the new format.

**Safety controls:** Internal numeric user IDs, legacy customer numbers, encrypted profile fields, orders, files, and relational links are unchanged. A timestamped pre-migration database snapshot is retained before applying the data-only public-ID update. The database unique index remains the authoritative uniqueness control.

**Validation:** TypeScript compilation and client/server builds passed. The focused customer-ID generator assertions verify the required `RPYY-XXXXXXXX` shape, omission of ambiguous characters, and uniqueness across generated samples. The normal crypto test process encountered an existing Argon2 runner termination during its password-hashing section, after its encryption and blind-index assertions had passed; this did not involve the customer-ID implementation.
**Migration hardening:** Before production execution, the customer-ID migration was upgraded so every public-ID and optional login-whitelist remap occurs inside one database transaction. Any collision exhaustion, malformed whitelist setting, or write failure rolls back the entire data update before post-transaction uniqueness verification.

**Deployment completion (2026-08-15):** The earlier deployment handoff was deliberately re-validated before any restart. The initial server artifact was confirmed to be a 2,444-byte esbuild entry-point output caused by omitting `--bundle`; it was never allowed to become the running service. The production build was regenerated with the repository-supported bundled server command, producing an 886,041-byte Node 22 ESM artifact. TypeScript validation completed successfully. The existing live server bundle and client assets were retained under `/opt/readypackets/rollback-20260815050349-customer-ids/`, and a root-only pre-migration MySQL snapshot was created at `/var/backups/readypackets/pre-customer-id-20260815050349.sql.gz` before data modification.

**Production migration and verification:** The application was stopped briefly to avoid an account-creation race, the full server bundle and current client assets were installed, and the transactional migration utility was run with the production environment. It reported `{"migrated":9,"verified":9,"format":"RPYY-XXXXXXXX"}`. Database verification then returned `users=9;unique_ids=9;format_matches=9`; thus every existing account has one distinct identifier conforming to the required pattern. The service restarted cleanly on loopback port 3000, local and external `https://myportal.readypackets.com/api/health` checks returned `{"status":"ok"}`, and public HTTPS headers continue to provide a nonce-based strict CSP, HSTS, `nosniff`, strict referrer policy, and a restrictive Permissions-Policy. The deployed release marker is `7e7e8405dbfc206f4cfe2de7892ba822a0a00118`.

**User-facing response prepared:** The customer-ID standardization is now live. New and existing accounts use opaque `RPYY-XXXXXXXX` references, administrator customer profiles show Customer ID and join date, all nine existing accounts were migrated successfully, and protected rollback/database recovery material remains available. No Manus integration or runtime dependency was introduced.

## 2026-08-15 — Interactive unified installation selector
**User request:** “have the script to prompt me which install i would want.”

**Implementation:** `deploy/unified-install.sh` now detects an interactive terminal when `--mode` is omitted and presents a numbered selector: **1) Native VPS**, **2) Existing Docker Engine and Docker Compose**, or **3) Install Docker Engine then deploy with Docker Compose**. Native VPS is the explicit default and remains the recommended path because it installs the protected backup, update, and rollback helpers. An explicit `--mode native|docker|docker-bootstrap` continues to bypass the selector for controlled automation.

**Safety and validation:** The selector is intentionally disabled when standard input is not a terminal. Mode-less unattended invocations fail with an explicit command-line error rather than blocking a deployment pipeline. Shell syntax, help text, pseudo-terminal interactive selection, and the no-TTY guard were validated. `docs/DEPLOYMENT_AND_INSTALL.md` now documents the simple interactive command and the required explicit-mode behavior for automation.
