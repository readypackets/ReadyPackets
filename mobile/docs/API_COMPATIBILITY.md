# Mobile API Compatibility

The native clients consume only the **self-hosted** `/api/mobile/v1` JSON boundary. Browser cookie sessions, CSRF tokens, tRPC procedure names, database identifiers, storage paths, and third-party credentials are not mobile contracts.

| Contract rule | Version 1 policy |
|---|---|
| Versioning | All mobile resources remain below `/api/mobile/v1`. Compatible fields may be added; removal or semantic changes require a new version and a published deprecation interval. |
| Identity | OAuth 2.1 authorization code with PKCE, a system browser, claimed HTTPS app links, short-lived bearer access tokens, and rotating opaque refresh tokens. |
| Object identity | Mobile DTOs expose public order/customer/file references only. Database integer keys never appear in paths or responses. |
| Pagination | Collections use opaque cursors and bounded limits. |
| Mutations | Device registration and deletion requests require a user-bound `Idempotency-Key`; later write endpoints must follow the same rule. |
| Error handling | Errors use a stable RFC 9457-style response containing a safe code and correlation identifier, never a stack trace, SQL text, token, or secret. |
| Availability | Unsupported advertised endpoints fail closed. A native app must not call tRPC, browser upload routes, or storage providers directly. |

The implementation contract source is [`../api-contract/openapi.yaml`](../api-contract/openapi.yaml). Generated Swift and Kotlin DTOs must be regenerated from the reviewed OpenAPI version during a production release; source-generated output is intentionally excluded until a production contract is signed off.
