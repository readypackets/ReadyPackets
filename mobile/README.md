# ReadyPackets Native Mobile Workspace

This directory contains **two independent native applications** and their shared, non-runtime assets: iOS uses SwiftUI and Swift Concurrency; Android uses Kotlin and Jetpack Compose. It intentionally does not use React Native, Flutter, Capacitor, a WebView shell, a PWA service worker, Manus code, Manus services, or a second customer database.

The clients connect only to the self-hosted ReadyPackets mobile boundary at `/api/mobile/v1`. Configure the production HTTPS host, verified app-link domain, OAuth redirect URI, signing identifiers, APNs/FCM provider credentials, and release secrets outside version control.

| Directory | Contents |
|---|---|
| `api-contract/` | Reviewed OpenAPI contract and fixtures. |
| `design-tokens/` | Versioned ReadyPackets colors, semantic values, spacing, and wording. |
| `ios/ReadyPackets/` | Swift 6 / SwiftUI application sources and Xcode project definition. |
| `android/` | Kotlin / Jetpack Compose Gradle project. |
| `docs/` | API, threat-model, accessibility, data disclosure, and release artifacts. |

> The reference application supports customer work first. High-impact administration, bulk data export, backup/restore, key management, refunds, checkout, configuration, and platform control remain web-only.
