import Foundation

enum AppConfig {
    /// Development placeholder. Replace through build configuration; no secret belongs in this file.
    static let portalBaseURL = URL(string: "https://portal.example.com")!
    static let redirectURI = URL(string: "https://mobile.example.com/auth/callback")!
    static let appVersion = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "0"
}
