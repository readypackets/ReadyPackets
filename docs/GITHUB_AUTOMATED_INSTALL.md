# ReadyPackets Automated GitHub Installation

ReadyPackets includes `deploy/github-bootstrap-install.sh` for a **non-interactive first installation** on a fresh Ubuntu server. The script retrieves the private repository using a read-only SSH deploy key, rejects moving branch names, verifies the requested immutable 40-character commit SHA, and invokes the supported unified installer with explicit deployment and TLS options.

> This bootstrap path is for a **new server only**. It fails if the target project directory already exists. Use **Admin → Platform updates** or the approved update workflow for an existing deployment; do not use first-install automation to overwrite a live instance.

## Security model

| Control | Behavior |
|---|---|
| Repository access | Uses an SSH deploy key, not a GitHub personal access token in a command, environment file, service, or shell history. |
| Release selection | Requires a reviewed 40-character Git SHA. Branch names such as `main`, tags, and short SHAs are rejected. |
| Source verification | Fetches the exact requested revision and compares the resolved SHA before checkout. |
| Deployment invocation | Calls `deploy/unified-install.sh` with explicit non-interactive mode and TLS provider options. |
| Existing deployment protection | Rejects an existing project directory rather than overwriting it. |
| First-release verification | Checks the HTTPS health endpoint after installation. |

## One-time GitHub deploy-key setup

On the new server, create a root-only key:

```bash
sudo install -d -m 0700 /root/.ssh
sudo ssh-keygen -t ed25519 -f /root/.ssh/readypackets_deploy -N '' -C 'readypackets-production-deploy'
sudo cat /root/.ssh/readypackets_deploy.pub
```

Add the displayed public key under the private repository’s **Settings → Deploy keys** in GitHub. Keep **Allow write access** disabled. The private key must remain root-readable only and must never be committed or sent through email/chat.

## Determine the release SHA

From a trusted administration workstation with repository access, review and approve the release, then obtain its full SHA:

```bash
git ls-remote https://github.com/readypackets/ReadyPackets.git refs/heads/main
```

Record the complete 40-character SHA as the approved release reference. Do not pass `main` or another moving ref to the bootstrap script.

## Transfer and run the bootstrap script

Copy the reviewed release’s `deploy/github-bootstrap-install.sh` to the target server through an approved channel, or clone a reviewed source copy temporarily for that purpose. Then run the script with the exact repository, approved SHA, hostname, operational email, mode, and TLS provider.

```bash
sudo bash /root/github-bootstrap-install.sh \
  --repository readypackets/ReadyPackets \
  --commit 0123456789abcdef0123456789abcdef01234567 \
  --domain myportal.example.com \
  --email operations@example.com \
  --mode native \
  --tls-provider letsencrypt
```

The script installs the minimal retrieval dependencies, clones the repository to `/srv/readypackets`, verifies the immutable revision, runs the non-interactive unified installer, and checks `https://myportal.example.com/api/health`.

## Docker alternatives

For an existing Docker Engine and Compose v2 host, replace the mode with `--mode docker`. For a clean Ubuntu server where the bootstrap should install Docker first, use `--mode docker-bootstrap`.

```bash
sudo bash /root/github-bootstrap-install.sh \
  --repository readypackets/ReadyPackets \
  --commit 0123456789abcdef0123456789abcdef01234567 \
  --domain myportal.example.com \
  --email operations@example.com \
  --mode docker-bootstrap \
  --tls-provider letsencrypt
```

## Cloudflare Origin CA

When the hostname is permanently proxied through Cloudflare, set Cloudflare SSL/TLS to **Full (strict)**, store the Origin CA certificate and private key in a root-only directory, then use:

```bash
sudo bash /root/github-bootstrap-install.sh \
  --repository readypackets/ReadyPackets \
  --commit 0123456789abcdef0123456789abcdef01234567 \
  --domain myportal.example.com \
  --email operations@example.com \
  --mode native \
  --tls-provider cloudflare-origin \
  --cloudflare-origin-cert /root/readypackets-tls/origin-cert.pem \
  --cloudflare-origin-key /root/readypackets-tls/origin-key.pem
```

## After installation

Create the first administrator using the protected console command documented in the [Self-Hosted Installation Guide](SELF_HOSTED_INSTALLATION_GUIDE.md), enroll MFA, and complete the platform setup. Validate backups, mail delivery, Stripe webhooks, and all required external integrations before accepting customer data.

## Existing-server automated updates

For an existing ReadyPackets production server, use **Admin → Platform updates**. It scans and requires explicit approval of a specific commit, snapshots the database/application, verifies the source, deploys, health-checks, and retains rollback data. The root-only approved wrapper is documented in [Approved Auto-Deployment](AUTO_DEPLOYMENT.md). A scheduler may scan and notify, but must not silently apply a new release from a branch tip.
