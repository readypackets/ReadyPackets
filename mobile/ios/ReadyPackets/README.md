# ReadyPackets iOS

This is a native SwiftUI application targeting iOS 17+. It has **no cross-platform runtime, WebView shell, client secret, cloud application state, or Manus dependency**.

## Open and configure

1. On a macOS build host, open `ReadyPackets.xcodeproj` in Xcode 16 or later.
2. Copy `ReadyPacketsApp/AppConfig.swift.example` to `AppConfig.swift` and set only the public ReadyPackets HTTPS portal host and the registered HTTPS Universal Link callback.
3. Replace the `applinks:mobile.example.com` associated-domain placeholder in `ReadyPackets.entitlements` with the verified mobile callback host and publish its `apple-app-site-association` file from that host.
4. Select the ReadyPackets team and unique bundle identifier. Configure push entitlements and APNs credentials **outside source control**.
5. Run unit tests and archive through a protected macOS CI runner.

The native client opens a browser-hosted ReadyPackets authorization flow. It generates PKCE/state locally, stores only the rotating refresh token in a `ThisDeviceOnly` Keychain item, retains access tokens in memory, validates its HTTPS app-link callback, and routes all business actions through `/api/mobile/v1`.
