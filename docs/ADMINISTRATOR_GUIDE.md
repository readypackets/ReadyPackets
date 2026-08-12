# ReadyPackets Administrator Guide

**Version:** 2026-08-12  
**Audience:** ReadyPackets administrators and authorized staff

## Secure administration

Administrators must use MFA. The admin shell is separate from the customer portal and displays an explicit role badge. Never share credentials, recovery codes, access tokens, backup archives, encryption keys, or exported configuration bundles.

Use the customer-portal switch only for testing the experience assigned to your own account. Administrative permissions are still enforced server-side.

## Main operational workspaces

| Workspace | Administrator tasks |
|---|---|
| **Orders and Customers** | Create, update, suspend, validate, reset, soft-delete, restore, and manage customer and order records. Use account and order trash only for confirmed recovery work. |
| **Order Question Banks** | Create reusable questions for Phase 1, Phase 2, both phases, or no phase. Apply templates or direct questions to specific orders. |
| **Finance** | Configure Stripe, test the authenticated connection, manage coupons, review payments/refunds, and retain only required inactive coupon records. Stripe payments become ready only after the signed webhook secret is configured. |
| **Email Template Center** | Edit, clone, preview, enable, and review email templates; inspect delivery records; control retries/resends; configure retention and audit BCC. |
| **Order and Email Automations** | Select templated emails, lifecycle conditions, webhook endpoints, and completion actions. Test endpoint configuration before enabling a production rule. |
| **Knowledge Base** | Draft, submit, review, approve, publish, unpublish, or request revision of customer help articles. Only published articles appear in the customer portal. |
| **Announcements** | Publish to all customers, staff, or selected accounts. Review audience selection before publishing. |
| **Changelog** | Maintain release drafts, immutable revision history, and selected public feature updates. Publish only reviewed entries. |
| **Integrations** | Configure Microsoft Graph/SharePoint, outbound webhooks, SAML, and delivery control. Graph secrets are encrypted and never displayed after saving. |
| **Backups** | Run/schedule backup jobs, configure multiple cloud destination names, download protected archives, and create encrypted configuration exports. Regularly perform an authorized restore drill. |
| **Platform updates** | Connect a private GitHub repository using an encrypted fine-grained token, scan a release, review changed paths/risk indicators, approve, upgrade, and roll back. |
| **Security Centre and Activity Replay** | Investigate logs using date, severity, event, account, source, text, action, and entity filters. Review individual event records. Block abusive source addresses or ban compromised accounts only after confirming the evidence. |

## Identity and maintenance controls

SAML auto-provisioning can assign Customer, Staff, or Administrator roles. Assigning Administrator does not bypass MFA: the account must enrol or pass the existing MFA challenge before a privileged session is granted.

Maintenance controls independently gate public access, login, and new-account creation. Use them during scheduled work, with a visible maintenance message and a narrow allowlist only when necessary. Confirm the administrator bypass route before enabling a production-wide login gate.

## Publishing and release governance

Do not publish a change solely because it appears in Git history. Use the Platform updates process to scan it, read changed paths, assess dependencies/migrations/deployment controls, make a separate approval, and then enter the upgrade confirmation. A completed upgrade has a protected pre-upgrade application/database snapshot for rollback; rollback replaces data produced after the snapshot.

Use **Changelog** to communicate approved improvements to the public site. Keep release notes factual, customer-safe, and free of credential or infrastructure details.

## Security incidents

For suspected compromise, immediately preserve relevant logs, revoke sessions or API keys as appropriate, block sources only when evidence supports it, rotate affected external credentials at their provider, and assess whether customer notification is required. Do not delete logs merely to reduce noise. Factory reset is a root-console-only destructive recovery procedure and is never a first response to an incident.
