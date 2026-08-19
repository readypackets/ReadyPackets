# Cookie Consent and Privacy Preferences

> **Attorney-review notice.** This implementation and policy language are operational materials, not legal advice. Have qualified privacy counsel review the final policy and any regional notice obligations before relying on them.

ReadyPackets uses an **essential-only default**. The consent center displays the active consent version and lets visitors accept all available optional categories, reject all optional categories, or save individual choices. The platform records a versioned consent decision using a protected, `HttpOnly` browser token and a server-side audit record. Consent evidence stores hashed security context rather than raw IP-address or user-agent values in the consent record.

| Category | Default | User control | Purpose |
|---|---|---|---|
| Essential security and service operation | Enabled | Cannot be disabled in the preference center | Session protection, CSRF defense, requested sign-in, checkout, order-intake, and portal functions |
| Preferences | Disabled | Available in the preference center | Optional visual-theme persistence and other convenience settings |
| Analytics | Disabled and unavailable | Available only after an administrator enables the category, then only after visitor opt-in | Future aggregate product and website measurement |
| Marketing | Disabled and unavailable | Available only after an administrator enables the category, then only after visitor opt-in | Future approved marketing or campaign measurement |

## Administrator workflow

Open **Admin → System → Privacy & cookies** to view the active consent version, aggregate decision counts, and the availability of optional tracking categories. Analytics and marketing are disabled by default. Enabling either category requires typing `UPDATE COOKIE CONSENT SETTINGS` and creates an audit record. Enabling a category does not itself install a tracking integration or create visitor consent; an integration must be separately approved and must check the visitor's applicable consent choice before loading.

## Visitor workflow

The preference banner appears when the visitor has not made a choice for the current consent version. Visitors can reopen the center at any time from the public footer's **Manage cookie preferences** link or the global preference control. A consent-version change causes the banner to reappear, so a material policy/category change is not silently carried forward.

## Privacy Policy language

Use the following language in the current Privacy Policy as the Cookies, Browser Storage, and Privacy Preferences section:

```markdown
## 7. Cookies, Browser Storage, and Privacy Preferences

### 7.1 Essential Cookies and Storage

We use strictly necessary cookies and related browser storage to operate and secure the website and customer portal. These include the portal session cookie, a CSRF security token, security controls where applicable, and functional storage needed to preserve an in-progress order or authentication state. These technologies are required to deliver the service you request and cannot be disabled through our preference center. Disabling them in your browser may prevent sign-in, checkout, order intake, or other portal functions from working.

### 7.2 Preference Technologies

With your permission, we may store optional preferences such as visual theme or other convenience settings. You may allow or withdraw preference storage at any time through **Manage cookie preferences** in the website footer or platform preference center.

### 7.3 Analytics Technologies

ReadyPackets does not activate analytics cookies or analytics tags unless the applicable analytics category is enabled by the Company and you provide consent through the preference center. You may decline or withdraw analytics consent at any time without affecting essential portal services.

### 7.4 Marketing Technologies

ReadyPackets does not activate marketing or advertising cookies, pixels, or similar tracking technologies unless the applicable marketing category is enabled by the Company and you provide consent through the preference center. You may decline or withdraw marketing consent at any time without affecting essential portal services.

### 7.5 Your Choices and Consent Records

When you first visit ReadyPackets, you can accept all optional categories, reject all optional categories, or choose categories individually. We record your choice using a protected browser token and a versioned consent record. We retain a privacy-preserving record of the consent decision, category choices, consent-policy version, time of decision, and limited security evidence; we do not store your raw IP address or raw user-agent in the consent record. You can reopen and change your choices at any time through **Manage cookie preferences**. A changed preference applies going forward and does not invalidate processing that occurred before withdrawal where processing was lawful.

You may also manage cookies through your browser settings. Browser controls do not replace the ReadyPackets preference center for choices associated with this platform.
```

Historical policy versions and customer acceptances must remain immutable. Publish this as a new version rather than overwriting a prior accepted policy.
