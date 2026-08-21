import SwiftUI

struct RootView: View {
    @EnvironmentObject private var container: AppContainer
    var body: some View {
        ZStack {
            Brand.navy.ignoresSafeArea()
            switch container.state {
            case .loading: ProgressView().tint(.white)
            case .signedOut: WelcomeView()
            case .locked: UnlockView()
            case .signedIn: MainTabs()
            }
        }
        .alert("ReadyPackets", isPresented: Binding(get: { container.toast != nil }, set: { if !$0 { container.toast = nil } })) { Button("OK", role: .cancel) {} } message: { Text(container.toast ?? "") }
    }
}

struct WelcomeView: View {
    @EnvironmentObject private var container: AppContainer
    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "briefcase.fill").font(.system(size: 46)).foregroundStyle(Brand.gold).accessibilityHidden(true)
            VStack(spacing: 8) { Text("ReadyPackets").font(.largeTitle.bold()).foregroundStyle(.white); Text("Your Business, Professionally Packeted").multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.78)) }
            Spacer().frame(height: 12)
            Text("Securely manage your orders, workflow activity, documents, and support from your mobile device.").multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.84))
            Button("Sign in securely") { Task { await container.signIn() } }.buttonStyle(.borderedProminent).tint(Brand.teal).controlSize(.large).accessibilityHint("Opens ReadyPackets secure sign-in in your browser")
            Text("ReadyPackets never asks you to enter your password in this app.").font(.footnote).multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.65))
        }.padding(32).frame(maxWidth: 480)
    }
}

struct UnlockView: View {
    @EnvironmentObject private var container: AppContainer
    var body: some View {
        VStack(spacing: 20) { Image(systemName: "lock.shield.fill").font(.system(size: 44)).foregroundStyle(Brand.gold); Text("Unlock ReadyPackets").font(.title2.bold()).foregroundStyle(.white); Text("Use your device biometric authentication to continue.").multilineTextAlignment(.center).foregroundStyle(.white.opacity(0.8)); Button("Unlock") { Task { await container.unlock() } }.buttonStyle(.borderedProminent).tint(Brand.teal); Button("Sign out", role: .destructive) { Task { await container.signOut() } }.foregroundStyle(.white) }.padding(32)
    }
}

struct MainTabs: View {
    var body: some View {
        TabView { HomeView().tabItem { Label("Home", systemImage: "house") }; OrdersView().tabItem { Label("Orders", systemImage: "tray.full") }; ReservedFeatureView(title: "Messages", icon: "bubble.left.and.bubble.right", description: "Your secure messages will appear here after the messaging API is enabled for this release.").tabItem { Label("Messages", systemImage: "bubble.left.and.bubble.right") }; ReservedFeatureView(title: "Notifications", icon: "bell", description: "Your notification inbox will appear here after device notification registration is enabled.").tabItem { Label("Notifications", systemImage: "bell") }; ProfileView().tabItem { Label("Profile", systemImage: "person") } }.tint(Brand.teal)
    }
}

struct ReservedFeatureView: View { let title: String; let icon: String; let description: String; var body: some View { VStack(spacing: 16) { Image(systemName: icon).font(.system(size: 36)).foregroundStyle(Brand.teal); Text(title).font(.title2.bold()); Text(description).multilineTextAlignment(.center).foregroundStyle(.secondary).padding(.horizontal, 32) }.frame(maxWidth: .infinity, maxHeight: .infinity).background(Color(uiColor: .systemBackground)) } }
