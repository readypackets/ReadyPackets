# ReadyPackets One-Click Autoinstall

`deploy/one-click-install.sh` is the non-interactive installer for a **fresh** Ubuntu or Debian server. It displays progress throughout the installation, clones the public ReadyPackets source, selects native VPS or Docker installation through a variable, configures TLS, and can optionally restore the latest encrypted configuration-vault bundle from a separate private GitHub repository.

> Do not run this installer on a server that already contains a ReadyPackets project directory. It deliberately refuses to overwrite an existing deployment.

## One pasted command: Native VPS

First create an A record for the intended hostname that points to the server. Then, as `root` or a sudo-capable user, paste one command and replace the bracketed values:

```bash
curl -fsSLO https://raw.githubusercontent.com/readypackets/ReadyPackets/main/deploy/one-click-install.sh && \
sudo env \
  RP_DOMAIN='portal.example.com' \
  RP_EMAIL='operations@example.com' \
  RP_SITE_NAME='ReadyPackets' \
  RP_MODE='native' \
  RP_TLS_PROVIDER='letsencrypt' \
  bash one-click-install.sh
```

The command visibly reports package setup, source retrieval, installer execution, and the final health check. It installs MySQL, Node.js, nginx, systemd, TLS renewal, and the ReadyPackets portal directly on the server.

## Select the installation type

| Value for `RP_MODE` | Result |
|---|---|
| `native` | Installs the production VPS stack directly on the host. This is the recommended option. |
| `docker` | Uses a Docker Engine and Docker Compose installation that already exists. |
| `docker-bootstrap` | Installs Docker Engine and Docker Compose first, then deploys the application container stack. |

For example, replace `RP_MODE='native'` with `RP_MODE='docker-bootstrap'` to create a Docker-based installation on a fresh server.

## Cloudflare Origin CA

When Cloudflare proxies the hostname, create an Origin Certificate for the hostname, transfer the certificate/key to a root-only directory, and set Cloudflare SSL/TLS mode to **Full (strict)**. Use the following variables instead of Let’s Encrypt:

```bash
RP_TLS_PROVIDER='cloudflare-origin' \
RP_CLOUDFLARE_ORIGIN_CERT='/root/readypackets-tls/origin-cert.pem' \
RP_CLOUDFLARE_ORIGIN_KEY='/root/readypackets-tls/origin-key.pem'
```

## Optional latest GitHub configuration-vault recovery

This restores platform configuration, application encryption keys, and integration secrets from the latest passphrase-encrypted configuration-vault archive. It retains the **new server’s database credentials** and does not import customer data, orders, uploaded files, sessions, or logs.

Add these variables to the same `sudo env` command only when a private GitHub configuration-vault backup already exists:

```bash
RP_GITHUB_CONFIG_REPOSITORY='owner/private-readypackets-vault' \
RP_GITHUB_CONFIG_BRANCH='main' \
RP_GITHUB_CONFIG_FOLDER='readypackets-platform-config' \
RP_GITHUB_CONFIG_TOKEN='github_pat_REPLACE_WITH_TOKEN' \
RP_GITHUB_CONFIG_PASSPHRASE='REPLACE_WITH_16_OR_MORE_CHARACTER_RECOVERY_PASSPHRASE'
```

The vault repository must be private. The script verifies repository privacy and the downloaded archive’s SHA-256 manifest before applying the encrypted bundle. It writes the token and passphrase only to temporary root-only files, removes them before exit, and never prints either value.

## Pin a reviewed release

For a production installation, pin the script and source checkout to a reviewed immutable 40-character commit SHA rather than a moving branch tip. Replace `main` in the download URL with the approved SHA and add:

```bash
RP_COMMIT='40_CHARACTER_APPROVED_COMMIT_SHA'
```

## Verification

On a Let’s Encrypt deployment, the script completes only after this public health check succeeds:

```bash
curl -fsS https://portal.example.com/api/health
```

For Cloudflare Origin CA, it validates the local nginx-to-application listener during installation; then verify through Cloudflare once the DNS proxy is active.

## Security boundaries

Never place a private vault token, vault recovery passphrase, `.env` file, Cloudflare private key, database dump, or application-secret configuration bundle in a public repository. Environment variables can be read by privileged users while the process runs; use this one-time mechanism only in a trusted root shell, and avoid recording the command in shared shell history when it carries vault recovery inputs.
