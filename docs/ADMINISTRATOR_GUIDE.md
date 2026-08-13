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
| **Public FAQs** | Author, categorize, edit, order, publish, unpublish, and delete public frequently asked questions. Drafts never appear on the public site; confirm accuracy before publication because published answers may be indexed. |
| **Marketing** | Plan campaigns, set audience/message/channel/status/schedule, configure a local or HTTPS destination and UTM tags, copy a controlled promotion link, and record confirmed conversions. Promotion links log aggregate clicks only; they do not record visitor identities. Activate only reviewed campaigns and pause a link immediately if its destination or offer changes. |
| **Announcements** | Publish to all customers, staff, or selected accounts. Review audience selection before publishing. |
| **Changelog** | Maintain release drafts, immutable revision history, and selected public feature updates. Publish only reviewed entries. |
| **Integrations** | Configure Microsoft Graph/SharePoint, outbound webhooks, SAML, and delivery control. For SharePoint, enter the tenant ID, client ID, client secret, and either a tenant-root URL or site URL; select **Discover site & library**; review the discovered library; then save. The Graph site and drive IDs are populated by discovery and are required before saving. Graph secrets are encrypted and never displayed after saving. |
| **Backups** | Run/schedule backup jobs, configure multiple cloud destination names, download protected archives, and create encrypted configuration exports. Regularly perform an authorized restore drill. |
| **Platform updates** | Connect a private GitHub repository using an encrypted fine-grained token, scan a release, review changed paths/risk indicators, approve, upgrade, and roll back. |
| **Security Centre and Activity Replay** | Investigate logs using date, severity, event, account, source, text, action, and entity filters. Review individual event records. Block abusive source addresses or ban compromised accounts only after confirming the evidence. |

## SharePoint connection requirements

The SharePoint application registration needs tenant-admin consent for the appropriate Microsoft Graph application permissions. `Sites.Read.All` is sufficient for site/library discovery; order-folder creation and file synchronization require the least additional write permission appropriate to the deployment, typically `Sites.ReadWrite.All` or a more tightly scoped approved alternative. Do not paste a document-sharing link: use the tenant root, such as `https://contoso.sharepoint.com/`, or the actual site URL, such as `https://contoso.sharepoint.com/sites/Operations`. The discovery flow removes copied query/hash fragments and never returns the client secret to the browser.

## Identity and maintenance controls

SAML auto-provisioning can assign Customer, Staff, or Administrator roles. Assigning Administrator does not bypass MFA: the account must enrol or pass the existing MFA challenge before a privileged session is granted.

Maintenance controls independently gate public access, login, and new-account creation. Use them during scheduled work, with a visible maintenance message and a narrow allowlist only when necessary. Confirm the administrator bypass route before enabling a production-wide login gate.

## Public-site discovery and accessibility operations

The public FAQ page, route-aware metadata, canonical URLs, XML sitemap, crawler policy, Organization/WebSite structured data, and conditional FAQPage structured data are deployed. Verify the public domain in Google Search Console, submit `https://myportal.readypackets.com/sitemap.xml`, and monitor coverage; structured data improves machine understanding but does not guarantee indexing or a search result treatment.

The accessibility statement is available at `/accessibility`. Treat reported accessibility barriers as support issues: capture the page, task, browser, and assistive technology; provide an alternative route to service while the issue is assessed; and include keyboard, zoom/reflow, and screen-reader review in public-page release acceptance.

## Publishing and release governance

Do not publish a change solely because it appears in Git history. Use the Platform updates process to scan it, read changed paths, assess dependencies/migrations/deployment controls, make a separate approval, and then enter the upgrade confirmation. A completed upgrade has a protected pre-upgrade application/database snapshot for rollback; rollback replaces data produced after the snapshot.

Use **Changelog** to communicate approved improvements to the public site. Keep release notes factual, customer-safe, and free of credential or infrastructure details.

## Security incidents

For suspected compromise, immediately preserve relevant logs, revoke sessions or API keys as appropriate, block sources only when evidence supports it, rotate affected external credentials at their provider, and assess whether customer notification is required. Do not delete logs merely to reduce noise. Factory reset is a root-console-only destructive recovery procedure and is never a first response to an incident.

## Platform setup wizard

Open **Admin → Platform setup** when preparing a new installation or reviewing essential integrations. The wizard is restricted to administrators and is a convenience layer over the dedicated Email Settings, Microsoft Entra ID, Finance, Integrations, and Security Centre workspaces. Secret inputs are write-only and use encrypted setting storage; a previously saved secret is never returned to the browser.

| Wizard step | Configuration saved | Operational note |
|---|---|---|
| Email | SMTP or Microsoft Graph connection details | Test delivery from Email Settings after saving. |
| Microsoft Entra ID | SAML sign-on URL, issuer, certificate, provisioning, and role policy | Keep Entra disabled until a local administrator sign-in and an Entra assertion have been tested. |
| Stripe | Secret key, publishable key, and signed webhook secret | A secret key alone is insufficient; verified checkout settlement requires the webhook signing secret. |
| Phase webhooks | HTTPS P101 and P201 destinations and optional HMAC secrets | Configure only trusted automation endpoints. Delivery and redelivery remain auditable in Integrations. |
| Access controls | IP allowlist and optional public customer/user-ID login whitelist | Add the current administrator’s `RP-U-…` public ID before enabling the account whitelist. |

The **account login whitelist** is disabled by default. When enabled, it applies server-side to password login, customer magic-link completion, and Microsoft Entra SSO. Existing sessions remain active; future sign-ins for accounts outside the configured public-ID list are blocked and recorded in the security log. Do not enable it until a recovery administrator is included.

## Paid-order invoices

A confirmed paid or partially refunded order exposes an **Invoice** action in both the customer order workspace and the administrator order detail view. Generating it materializes one retained invoice number for the order and displays a ReadyPackets-branded printable document with the ReadyPackets logo, customer public ID, order number, itemized charges, discounts, total paid, and payment reference. The customer or administrator can use the browser’s **Print / save PDF** option to retain a PDF copy without granting the portal any payment-card data.

## Activity replay public ID search

Activity Replay accepts the opaque public customer/user reference in the form `RP-U-XXXXXXXXXXXX` for **Entity history**, **User timeline**, and **Advanced operational search**. Public ID resolution happens on the administrator-only server procedure before searching internal audit records. Legacy numeric IDs remain accepted for historical operational use, but new support and audit workflows should use public IDs.


## Protected backups, recovery, and cloud destinations

Open **Admin → Backups** to operate the protected backup workflow. The portal communicates with a root-owned local control daemon over a group-restricted Unix socket. The web application receives no backup `sudo` permission, no cloud credentials, and no direct root shell capability.

| Administrative task | Required action |
|---|---|
| Create an archive | Select **Run backup now**. The protected job creates a database dump, uploaded-file archive, manifest, checksums, and required environment keys in root-owned local backup storage. |
| Confirm archive integrity | Select **Verify** next to an unencrypted local archive. The system checks the archive, required database dump, manifest, checksums, and whether uploaded files are included. |
| Download an archive | Select **Download**. The server copies the approved archive into protected export storage and records the administrator action. Browser delivery is limited to 50 MB. |
| Restore production | Select **Restore** only after verification. Enter the exact `RESTORE <archive filename>` phrase. The protected restore job creates a safety dump, stops the service, restores the database and stored files, applies migrations, restarts the service, and reports its status. |
| Configure off-site copies | Select **Configure cloud provider**, enter a dedicated provider remote and destination, save it, then select **Test connection**. Every completed archive copies to each configured destination. |

Use dedicated, least-privilege storage credentials and an isolated folder, bucket prefix, or container for backups. Provider credentials and OAuth token JSON are transferred once over TLS, written only to the root-owned rclone configuration, and are never returned to the portal. The supported provider-specific input profiles are Amazon S3 and Wasabi S3 access keys, Backblaze B2 key ID/application key, Azure Blob Storage account/key, and OAuth-based SharePoint, OneDrive, Google Drive, and Dropbox remotes.

> A production restore is destructive. It replaces data written after the selected archive was created. Run a non-production restore drill from the host periodically and retain independent off-site backup copies according to the organisation’s recovery policy.

The documented setup-configuration export/import bundle remains a future roadmap item. It will produce a Git-tracked, secret-safe template for first-run wizard selections while keeping runtime credentials, encryption keys, customer data, and live OAuth tokens outside Git.
