# Implementation Status — August 21, 2026

The repository now contains a self-hosted mobile API/OAuth foundation and separate native iOS/Android source trees. It is a secure integration build, not a store-submitted production release.

| Area | Included in this build | Still required before production |
|---|---|---|
| Server identity | OAuth authorization-code/PKCE foundation, access tokens, rotating refresh-token family, revocation, device records, state/redirect validation, audit integration | Production redirect/App Link domain configuration, migration execution, browser/session/MFA/SAML device testing |
| Mobile REST | Discovery, token/revoke, profile, dashboard, permitted orders, device list/register, account-deletion request | Complete upload-session, messages, documents, notifications, staff/admin-lite endpoints and contract tests |
| iOS | SwiftUI architecture, secure token store, browser-auth interface, native dashboard/order/profile UI | Xcode archive, APNs integration, recording/upload implementation, physical-device XCTest/XCUITest |
| Android | Compose architecture, encrypted token storage, Custom Tabs interface, native dashboard/order/profile UI | Gradle release build, FCM, WorkManager upload continuation, physical-device JUnit/Compose UI test |
| Release | Threat model, privacy map, accessibility and store runbooks | Signing, SBOM, device matrix, verified store declarations, TestFlight/Play tracks, approved release authority |

No customer information, server secret, integration credential, app-store signing key, or production environment value is in this repository.
