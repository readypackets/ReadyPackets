# Mobile Data Disclosure Map

This is a release-owned inventory rather than a claim that the listed data is always collected. The release manager must reconcile it with the exact server configuration and SDK inventory immediately before App Store Connect and Play Console submission.

| Data category | Purpose | Stored on device | Sent to | Store disclosure consideration |
|---|---|---|---|---|
| Account/profile/contact details | Authenticate and present authorized account information | Minimal UI state only | ReadyPackets self-hosted API | Account and contact information |
| Device installation and app version | Device session, security revocation, compatibility | Installation ID; no secret | ReadyPackets self-hosted API | Identifiers / app functionality |
| Access/refresh credentials | Authorized API access | Access token memory-only; refresh token in Keychain/Keystore | ReadyPackets self-hosted API | Security/authentication data handling |
| Orders, workflow, messages, documents | Authenticated customer work | No default cache; explicit drafts only | ReadyPackets self-hosted API | User content and purchase/order information as applicable |
| Audio/file uploads | Customer workflow participation | App-private temporary transfer only | ReadyPackets self-hosted API | User content / audio data |
| Notification token | Deliver generic alerts chosen by the user | Platform-managed token | ReadyPackets API then APNs/FCM | Identifiers / app functionality |
| Privacy-scrubbed diagnostics | Optional operational troubleshooting only after policy approval | No raw PII or content | ReadyPackets self-hosted endpoint only | Diagnostics if enabled |

The application contains **no advertising SDK, tracking identifier, hosted analytics service, Manus integration, Manus SDK, Manus credential, or Manus runtime dependency**.
