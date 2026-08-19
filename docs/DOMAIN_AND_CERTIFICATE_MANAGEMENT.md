# Domain and Let’s Encrypt Certificate Management

ReadyPackets administrators can change the public portal hostname from **Admin → System → Domain & URL**. The tool is intended for a planned cutover, not everyday certificate renewal; Let’s Encrypt continues to renew the active certificate through the host renewal service after the change.

## Before changing the portal domain

Create the new hostname’s DNS record and point it to the portal server before opening the domain-change dialog. The new hostname must accept HTTP traffic on port 80 because the portal uses the existing nginx `/.well-known/acme-challenge/` location for Let’s Encrypt HTTP-01 validation.

If the hostname is proxied through Cloudflare, use **Full (strict)** and ensure that Cloudflare permits the ACME path to reach the portal. A prior Cloudflare Origin CA deployment can be changed to Let’s Encrypt through this workflow only when the requested hostname can complete public HTTP-01 validation.

Keep the previous hostname in DNS until the new URL, log-in process, outbound email links, and administrative access are all verified.

## Administrator workflow

1. Sign in as an administrator with MFA.
2. Open **Admin → System → Domain & URL**.
3. Confirm the displayed canonical URL and active certificate metadata.
4. Select **Change domain and request certificate**.
5. Enter the new fully-qualified hostname and the Let’s Encrypt certificate-contact email.
6. Type `CHANGE DOMAIN AND REQUEST CERTIFICATE` exactly, then submit.

The protected root-level certificate-control service performs the following work without granting the portal arbitrary shell access:

| Stage | Control |
|---|---|
| Input | Accepts only a syntactically valid hostname, contact email, and exact confirmation phrase. |
| Backup | Creates a root-only snapshot of the application environment, nginx site configuration, and TLS include. |
| nginx preparation | Changes only the controlled ReadyPackets `server_name` and strict host allowlist, then validates and reloads nginx. |
| Certificate | Requests a named Let’s Encrypt certificate through the nginx webroot, validates file presence, and confirms the hostname against the issued certificate. |
| Application origin | Updates `APP_URL` and `ALLOWED_ORIGINS` to the new HTTPS origin. This also changes future password-reset, verification, invoice, and magic-link destinations. |
| Validation | Reloads nginx, restarts the application, and performs a loopback HTTPS health check using the new hostname. |
| Failure | Restores the protected snapshot, validates/reloads nginx, and restarts the application before returning an error. |

## Effects and verification

A hostname change alters the cookie origin. Users with a session on the former hostname should sign in again on the new hostname. After a successful cutover, verify:

```bash
curl -fsS https://NEW_HOSTNAME/api/health
```

Then sign in as an administrator, request a test password-reset email, and confirm that the new email link uses `https://NEW_HOSTNAME/`.

## Rollback

The tool records the protected root-only backup path in the administrator activity history. If DNS or certificate validation is incomplete, the operation automatically restores the former configuration. For a later manual rollback, use the protected backup path with an approved server-administration procedure rather than editing nginx or secret environment files from the browser.
