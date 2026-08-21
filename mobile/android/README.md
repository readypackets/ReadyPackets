# ReadyPackets Android

This is a native Kotlin and Jetpack Compose application targeting **Android 16 / API 36**. It does not include React Native, Flutter, Capacitor, a WebView shell, client secrets, cloud application state, or a Manus dependency.

## Configure and build

1. Use Android Studio with JDK 17 and an Android 36 SDK platform.
2. In the self-hosted portal, set `MOBILE_OAUTH_REDIRECT_URIS` to the **verified HTTPS App Link** used below. Do not use a custom scheme in production without a documented fallback review.
3. Replace the `mobile.example.com` host and certificate fingerprint in `AndroidManifest.xml` / `assetlinks.json` deployment. Set the public base host and callback in secure CI build properties, not in source control.
4. Build a signed App Bundle with an upload key stored only in protected CI or the operator’s offline signing system.
5. Complete device tests for Custom Tabs, Android App Links, BiometricPrompt, denied permissions, logout, refresh reuse/revocation, dynamic font scale, TalkBack, and upload interruption before store submission.

The client generates a PKCE verifier/state with `SecureRandom`, launches the ReadyPackets authorization route in a Custom Tab, validates the HTTPS App Link return, and keeps only its rotating refresh token in Keystore-backed encrypted storage. Access tokens live in memory.
