# Native Store Release Runbook

The release owner must complete the following controls on a staging tenant before submitting any store build. Payments remain **status only** in version 1; no native checkout may be enabled without a renewed policy review.

| Gate | Required evidence |
|---|---|
| API/OIDC | Discovery document, PKCE local and SAML authentication, refresh rotation/reuse revocation, device revoke, BOLA/BFLA, pagination, idempotency, and redaction tests. |
| Native build | Signed iOS archive and Android App Bundle built by a protected macOS/Android CI runner; no signing key, environment file, or provider secret committed. |
| Accessibility | VoiceOver/TalkBack, dynamic type/font scale, contrast, touch target, reduced motion, keyboard/focus, permission denial, large screen, and error state walkthrough. |
| Privacy | Current Privacy Policy and deletion URL; App Store privacy details; Google Data Safety/Data deletion declarations reconciled to `DATA_DISCLOSURE_MAP.md`. |
| Review access | Working review tenant, time-limited review account, tested sample order, support URL, route instructions, and production-equivalent mobile API. |
| Safety | Generic push payload inspection, document authorization after deep links, no user content in diagnostics, upload interruption/retry, logout cleanup, and app-link verification. |
| Rollout | TestFlight/internal testing, closed testing, staged rollout, rollback thresholds for crash-free sessions, token refresh errors, mobile API errors, and upload failures. |

Apple review access, privacy declarations, and account-deletion handling are release requirements. Google Play new-app targeting must be set to API 36 or newer for the stated 2026 requirement. See the source research in the project architecture package before final submission.
