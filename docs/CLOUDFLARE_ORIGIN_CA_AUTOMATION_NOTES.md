# Cloudflare Origin CA automation notes

## Official requirements reviewed

Cloudflare’s Origin CA `POST /certificates` API accepts a PEM CSR, an array of fully-qualified hostnames, a request type such as `origin-rsa` or `origin-ecc`, and a requested validity between 7 and 5,475 days. The response includes the signed Origin CA certificate but not the private key, so the installer must create the private key and CSR locally and never send the private key to Cloudflare.

Cloudflare recommends API tokens for this API. The minimal documented permission is **Zone → SSL and Certificates → Edit**, scoped to the precise zone. The deprecated Origin CA service key must not be supported because it grants overly broad account access and Cloudflare has announced its removal.

Origin CA certificates protect only the Cloudflare-to-origin connection. The domain must remain proxied through Cloudflare and the zone SSL/TLS encryption mode must be **Full (strict)**. A browser connecting directly to the origin can legitimately report the certificate untrusted. The installer should state this clearly and should never turn off TLS verification or make the private key broadly readable.

## Planned installer controls

1. Offer `cloudflare-origin-ca` as an interactive TLS-provider choice and accept it non-interactively through explicit environment/profile settings.
2. Request the token without terminal echo, retain it only in a root-owned temporary file during the API request, and securely remove the temporary file. The token must not appear in environment files, systemd units, shell history, logs, process arguments, configuration exports, or backup metadata.
3. Generate a local RSA 3072-bit key and CSR containing the canonical hostname plus the conventional apex/www companion hostname when applicable.
4. Post the CSR and hostname list to Cloudflare’s Origin CA API using the API token, validate the JSON success response, and install the certificate and local private key under `/etc/readypackets/tls/` with root ownership and mode 0640.
5. Preserve the existing `root:readypackets` least-privilege TLS key access model and nginx hardening. Record non-secret certificate metadata only.
6. Validate the installed certificate covers every configured public hostname before enabling nginx TLS.

## Sources

- Cloudflare API: Create Certificate: https://developers.cloudflare.com/api/resources/origin_ca_certificates/methods/create/
- Cloudflare Origin CA documentation: https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/
- Cloudflare API token guidance: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Cloudflare deprecation of Origin CA Service Keys: https://developers.cloudflare.com/fundamentals/api/get-started/ca-keys/
