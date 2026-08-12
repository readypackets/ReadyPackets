# Security Design and Controls

**Applies to:** ReadyPackets Portal, self-hosted build
**Audience:** Operators, reviewers, and auditors

This document describes every security control in the application, what each defends against, and how each is verified. It is written to be read by someone deciding whether to trust the system with customer data, so it states limitations as plainly as it states protections.

## Design principles

The build follows five rules, and every specific control below is an application of one of them.

> **Fail closed.** When a check cannot complete, access is denied. Malformed input, an unreadable ciphertext, an unparseable IP pattern, and a missing configuration value all produce refusal rather than a permissive default.

> **Trust no input, including our own.** Client-declared content types, forwarded headers, filenames, and cookie contents are all treated as attacker-controlled.

> **Defend in depth.** Every significant control has an independent second layer, so a single mistake is not a breach. Cross-site request forgery has three layers; file access has ownership checks, unguessable keys, and single-use tickets.

> **Minimise dependencies.** Every dependency is a supply-chain risk and an update obligation. There are no external service calls, no third-party scripts, and no content delivery networks.

> **Verify continuously.** A control that is not tested is an assumption. Two automated suites assert these properties against the running application.

## Threat model

| Adversary | Capability assumed | Primary defences |
| --- | --- | --- |
| Anonymous internet attacker | Can send arbitrary requests to any public endpoint | Rate limiting, input validation, strict authorisation, host validation, no information disclosure |
| Malicious authenticated customer | Holds a valid session; attempts to reach other customers' data | Per-row ownership checks, unguessable identifiers, single-use download tickets, audit logging |
| Attacker with a stolen customer password | Knows valid credentials | Optional MFA, session binding, login anomaly logging, notification on credential change |
| Attacker with a stolen administrator password | Knows valid administrative credentials | **Mandatory MFA for administrators**, optional IP allowlist, full audit trail, no destructive action without confirmation |
| Cross-site attacker | Controls a site the victim visits while authenticated | Origin validation, double-submit token, session-bound token, `SameSite=Strict`, `frame-ancestors 'none'` |
| Script injection via stored content | Can persist text that other users will view | Nonce CSP with no inline execution, React text escaping, no `dangerouslySetInnerHTML`, scheme allowlist for links |
| Attacker who obtains a database dump | Reads all stored rows | Field-level AES-256-GCM encryption, Argon2id password hashes, tokens stored only as digests |
| Attacker with filesystem read access | Reads stored uploads | Random storage keys, `0600` file mode, service account isolation, storage outside the web root |

**Out of scope.** The application cannot defend against a compromised host kernel, a malicious operator with root access, or physical access to the server. Full-disk encryption and host hardening are the operator's responsibility and are covered in the deployment guide.

## Transport and headers

TLS is terminated by the reverse proxy, restricted to TLS 1.2 and 1.3 with forward-secret cipher suites, session tickets disabled, and OCSP stapling enabled. The application additionally redirects any plain-HTTP request it receives, so a misconfigured proxy cannot silently serve the site unencrypted.

Every response carries the following headers, set by the application rather than the proxy so that they cannot drift apart:

| Header | Value | Defends against |
| --- | --- | --- |
| `Content-Security-Policy` | Nonce-based, no `unsafe-*` | Script injection, data exfiltration, clickjacking, form hijacking |
| `Strict-Transport-Security` | `max-age=63072000; includeSubDomains; preload` | Protocol downgrade, SSL stripping |
| `X-Content-Type-Options` | `nosniff` | MIME confusion leading to script execution |
| `X-Frame-Options` | `DENY` | Clickjacking on legacy browsers |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | Leaking paths and tokens through the referrer |
| `Permissions-Policy` | All powerful features denied | Unexpected access to camera, microphone, location, and similar |
| `Cross-Origin-Opener-Policy` | `same-origin` | Cross-window scripting, some Spectre variants |
| `Cross-Origin-Resource-Policy` | `same-origin` | Cross-origin resource inclusion |
| `Origin-Agent-Cluster` | `?1` | Same-origin process isolation |
| `X-Permitted-Cross-Domain-Policies` | `none` | Legacy plugin policy abuse |

No header discloses the framework, runtime, or version. `X-Powered-By` and `ETag` are disabled.

### Content Security Policy in detail

```
default-src 'self';
script-src 'self' 'nonce-<per-request>';
script-src-attr 'none';
style-src 'self' 'nonce-<per-request>';
img-src 'self' data: blob:;
font-src 'self';
connect-src 'self';
media-src 'self' blob:;
worker-src 'self' blob:;
manifest-src 'self';
frame-src 'none';
frame-ancestors 'none';
form-action 'self';
base-uri 'none';
object-src 'none'
```

A fresh 128-bit nonce is generated per request from the CSPRNG, injected into the served HTML, and echoed in the header. The absence of `unsafe-inline` means an injected `<script>` will not execute even if it survives every other layer; the absence of `unsafe-eval` closes `eval` and `new Function`; `script-src-attr 'none'` blocks inline handler attributes such as `onerror`; `base-uri 'none'` prevents a base-tag injection from redirecting every relative URL; and `form-action 'self'` prevents an injected form from posting credentials elsewhere.

## Authentication

Passwords are hashed with **Argon2id** at 64 MB of memory, three passes, and single-lane parallelism, chosen to be costly on a GPU while remaining acceptable on a small VPS. Existing bcrypt hashes verify successfully and are transparently upgraded on next login, so migration requires no password reset.

The policy is operator-configurable and enforced server side: minimum length, character classes, a common-password list, sequential-pattern rejection, and rejection of passwords containing the user's own email local part or name. That last rule matters more than its obviousness suggests, because personalised passwords are the ones credential-stuffing lists derive most successfully.

When no account matches a submitted address, the server still performs a verification against a pre-computed hash, so the response time does not distinguish an unknown account from a wrong password. All authentication responses are generic.

**Multi-factor authentication** uses TOTP with a 30-second step and a one-step drift allowance. Secrets are encrypted at rest. Ten single-use backup codes are issued at enrolment, stored only as hashes. MFA is **mandatory for administrative accounts**: the administrative procedure guard requires a session that has completed a factor challenge, so an administrator without enrolment can reach only the enrolment flow.

Optional SAML 2.0 is available for staff, validating signatures and audience restrictions, but no external identity provider is required.

## Sessions

Sessions are server-side records referenced by a signed cookie, which means revocation is immediate and does not wait for a token to expire.

| Property | Value |
| --- | --- |
| Cookie name | `__Host-rp_session` in production |
| Attributes | `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` |
| Absolute lifetime | Operator-configurable, twelve hours by default |
| Idle timeout | Operator-configurable, two hours by default |
| Revocation | Individual or all-sessions, by the user or an administrator |
| Rotation | New identifier on login, on privilege change, and on password change |

The `__Host-` prefix is enforced by the browser: the cookie must be secure, must be host-scoped with no `Domain`, and cannot be set by a subdomain. A subdomain takeover therefore cannot fixate or overwrite a session cookie. Each session records its address and user agent, is listed for the user with the current session marked, and a password change revokes every other session.

## Cross-site request forgery

Three independent layers apply to every state-changing request.

1. **Origin and Referer validation.** The header must match the configured allowlist. A cross-origin or absent origin on a mutation is refused with 403.
2. **Double-submit token.** A random token is set in a cookie and must be echoed in the `x-rp-csrf` header, compared in constant time. Because a cross-origin attacker can neither read the cookie nor set the custom header, forgery fails.
3. **Session binding.** For an authenticated request, the token must match the one bound to the server-side session, so a token captured from a different context is inert.

The token is issued with the application shell so that an anonymous visitor can register or submit the contact form on a first visit. This was a defect found by testing rather than review: with the token issued only at login, those flows would have failed in production.

## Authorisation

Authorisation is expressed once, in the procedure builder, and applied uniformly.

| Builder | Requires |
| --- | --- |
| `publicProcedure` | Nothing |
| `protectedProcedure` | A valid session |
| `verifiedProcedure` | A valid session and a verified email, when the operator requires verification |
| `mfaProcedure` | A session that has completed a factor challenge |
| `adminProcedure` | Session, administrative role, and a satisfied factor challenge |
| `superAdminProcedure` | As above, restricted to the highest role |

Row-level ownership is checked centrally rather than re-implemented per procedure, so a new endpoint cannot omit the check by oversight. Identifiers exposed to clients are non-sequential where enumeration would matter: order numbers carry a random suffix, and storage keys are random.

## Data protection

Personal data is encrypted at the field level with **AES-256-GCM**, a random 96-bit IV per value, and the owning record identifier bound as additional authenticated data. That binding is the important part: a ciphertext cannot be relocated from one row to another, so an attacker with write access to the database cannot swap one customer's encrypted email into another's record and then read it back through the application.

Because GCM ciphertext is not searchable, searchable columns carry an **HMAC-SHA256 blind index** under a separate key, normalised for case and whitespace. Lookup by email therefore works without storing the address in plaintext, and the index cannot be reversed without the key.

| Data | Protection |
| --- | --- |
| Names, email, company, phone, address | AES-256-GCM, row-bound, with blind index on email |
| Passwords | Argon2id, never recoverable |
| MFA secrets and backup codes | Encrypted and hashed respectively |
| Session, reset, verification, and download tokens | Stored only as SHA-256 digests |
| Intake responses and order notes | AES-256-GCM |
| Uploaded files | Random keys, `0600` mode, outside the web root |

Two keys are required and are validated at startup: `DATA_ENCRYPTION_KEY` and `EMAIL_INDEX_KEY`, each 32 bytes of hex. The process refuses to start if either is missing, short, or left at a development default. **Losing `DATA_ENCRYPTION_KEY` renders encrypted columns permanently unreadable**; key custody is therefore an operational requirement, not an optional practice, and is covered in the deployment guide.

## Rate limiting and abuse control

Requests are classified into six categories, each with an independently configurable window, and each classification is asserted by a unit test.

| Category | Default budget | Covers |
| --- | --- | --- |
| `auth_high_risk` | 5 per 30 minutes | Login, registration, reset, verification, MFA, NDA acceptance |
| `user_login` | 10 per 15 minutes | Per-account login tracking |
| `expensive` | 10 per 5 minutes | Bulk download, data export, CSV export |
| `form_submission` | 20 per 10 minutes | Contact, intake, reviews, tickets, forum posts |
| `api` | 120 per minute | Ordinary API calls |
| `standard_browsing` | 300 per minute | Page and asset requests |

Classification inspects **every** procedure in a batched call and takes the most sensitive, so a login attempt cannot be smuggled into a permissive bucket by pairing it with a harmless query. Violations escalate: one minute, then fifteen, then a persistent block-list entry. Under load the limiter tightens every budget proportionally, shedding abusive traffic before the database saturates.

Penalties are scoped **per category**. This corrects a defect found in testing: keyed by address alone, a login burst from one user behind a shared corporate address would have locked every colleague out of the whole site rather than out of the login endpoint. Health probes are exempt so that an orchestrator cannot be throttled into restarting a healthy container.

The block list supports individual addresses and CIDR ranges, with expiring or permanent entries, and is checked before any expensive work. Client addresses are resolved through a configured proxy hop count rather than by trusting the whole forwarded chain, which prevents a client from spoofing its apparent address to evade a limit or enter an allowlist.

## File upload and download

The declared content type is never trusted. Validation proceeds in this order, and the first failure ends it:

1. Reject an empty file, or one exceeding the configured maximum.
2. Reject if **any** segment of the filename appears in the denied-extension list, which defeats `report.pdf.exe`.
3. Require a recognised extension with a whitelist entry.
4. Inspect the **magic bytes** and require the detected type to match that entry.
5. For signature-less formats such as text and CSV, validate structurally that the content is text.

HTML, SVG-as-script, and every executable and scriptable format are denied outright. HTML is denied specifically because a stored HTML file served from the application's own origin would defeat the same-origin protections that make the rest of the policy effective.

Downloads are not URLs that can be guessed or shared. A client calls an authorised procedure that verifies ownership and issues a **single-use, short-lived, IP-bound ticket**; the transfer endpoint accepts only that ticket and marks it consumed. Responses are always `Content-Disposition: attachment` with `nosniff`, and every access is recorded with actor, address, and timestamp.

## Injection defences

All database access is through Drizzle ORM, which emits parameterised statements exclusively; no query is assembled by string concatenation. Every procedure input is validated by a Zod schema at the boundary, with unknown keys rejected rather than ignored, so an unexpected field cannot reach an update statement.

Output escaping is structural rather than filtered. The Markdown renderer parses database content into React elements and never uses `dangerouslySetInnerHTML`, so injected markup renders as visible text instead of executing. Link schemes are allowlisted to `http`, `https`, `mailto`, and root-relative paths, which rejects `javascript:`, `data:`, `vbscript:`, and protocol-relative URLs. These properties are asserted by tests that attempt each of those injections.

Email templates escape all interpolated values. Log output is structured JSON with a redaction list, so a newline in user input cannot forge a log entry and a credential passed into a log context is replaced rather than written.

## Auditing and observability

Two independent trails are kept. The **security log** records authentication outcomes, authorisation failures, CSRF and origin rejections, rate-limit events and penalties, block-list hits, session lifecycle, and configuration changes. The **activity log** records every administrative mutation with actor, target, before-and-after values, and address. Both are queryable and exportable from the administrative security centre, and both are subject to a retention policy so that logs holding personal data do not accumulate indefinitely.

System alerts surface degraded conditions to administrators: a failing email queue, database unavailability, repeated login pressure from one address, and overdue orders.

## Deployment hardening

The container runs as an unprivileged user on a read-only root filesystem with all Linux capabilities dropped, `no-new-privileges` set, and a small `noexec` tmpfs for the one writable path that multipart buffering requires. The database port is never published to the host.

The systemd unit applies `ProtectSystem=strict` with a single writable path, `ProtectHome`, `PrivateTmp`, `PrivateDevices`, an empty capability bounding set, kernel and cgroup protections, namespace and realtime restrictions, an address-family allowlist of IPv4, IPv6, and Unix only, and a syscall filter limited to `@system-service` with privileged groups explicitly denied. `MemoryDenyWriteExecute` is deliberately left off, because V8 requires writable-executable pages and enabling it would prevent the service from starting; every other memory protection applies.

Secrets live in a root-owned file readable only by the service account. The installer generates them locally with the kernel CSPRNG and preserves existing values on re-run, so re-running cannot orphan encrypted data.

## Verification

```bash
pnpm exec vitest run                        # 106 unit tests
pnpm exec tsx scripts/verify-security.ts    # 46 live checks
pnpm exec tsc --noEmit                      # zero type errors
```

The live suite is a black-box probe against a running instance, and it should be run after every deployment against the real hostname. It covers the policy header and its strictness, the full hardening header set, absence of fingerprinting headers, host validation, cookie attributes, all three CSRF layers, per-procedure authorisation, error handling and information disclosure, traversal and dotfile refusal, and rate limiting including header advertisement and the health exemption. It passes 46 of 46 against both the development server and the compiled production bundle.

The unit suite covers cryptography as a security property rather than as an API: ciphertext must be non-deterministic, tampering must be detected, associated data must prevent relocation, and a blind index must not disclose its input. It also covers the password policy, CIDR arithmetic including non-byte-aligned prefixes, the order state machine, bundle pricing arithmetic in integer cents, upload validation against renamed and double-extension payloads, and Markdown injection.

Three genuine defects were found by this process and fixed: the anonymous CSRF token, the storage key that retained traversal characters, and the address-scoped rate-limit penalty.

## Operator responsibilities

The application cannot enforce the following, and a deployment is not secure without them.

1. **Protect the encryption keys.** Back them up separately from the database. Losing them destroys the encrypted data; leaking them alongside a backup makes the backup fully readable.
2. **Keep the host patched.** Apply operating system, Node.js, MySQL, and nginx updates promptly.
3. **Restrict SSH.** Key-based authentication only, no root login, fail2ban enabled.
4. **Enrol MFA immediately** on the first administrative account, and use the IP allowlist if the administrative surface does not need to be reachable from arbitrary networks.
5. **Test restores.** A backup that has never been restored is not a backup. Restore into a scratch database periodically.
6. **Review the audit logs.** The controls generate evidence, but evidence unread is evidence wasted.
7. **Set a real SMTP sender** with SPF, DKIM, and DMARC, so security notifications reach users instead of being filtered.

## Reporting a vulnerability

Report suspected vulnerabilities to the address published in the site's security contact. Please include reproduction steps and refrain from testing against production data belonging to real customers.
