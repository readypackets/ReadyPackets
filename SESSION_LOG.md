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

### 6.5 Smaller corrections

The MFA secret required a buffer type fix; the maintenance state field and the bind-host environment variable were referenced by outdated names in three files; the scheduler referenced a purge target that did not exist in the schema and was repointed at the email verification token table; a stale process held the port during one restart and produced a misleading result until the process was located by port rather than by name; and `MemoryDenyWriteExecute` was deliberately left disabled in the systemd unit, with a comment explaining that V8 requires writable-executable pages and enabling it would prevent the service from starting at all.

---

## 7. Verification results

Three gates, all passing, all reproducible:

```bash
pnpm exec tsc --noEmit                      # 0 errors
pnpm exec vitest run                        # 100 passed
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
| Verification | 100 unit tests, 46 live security checks, CI workflow |

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

*This log is committed to the repository as required by the project instructions. It records the session's requests, decisions, defects, and outcomes, and is intended to be readable by someone who was not present for the work.*
