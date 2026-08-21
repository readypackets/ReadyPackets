import SwiftUI

enum Brand {
    static let navy = Color(red: 13 / 255, green: 27 / 255, blue: 42 / 255)
    static let navyRaised = Color(red: 18 / 255, green: 38 / 255, blue: 58 / 255)
    static let navyElevated = Color(red: 23 / 255, green: 48 / 255, blue: 74 / 255)
    static let teal = Color(red: 32 / 255, green: 160 / 255, blue: 144 / 255)
    static let gold = Color(red: 201 / 255, green: 168 / 255, blue: 76 / 255)
    static let danger = Color(red: 180 / 255, green: 35 / 255, blue: 24 / 255)
}

struct BrandCard<Content: View>: View {
    let content: Content
    init(@ViewBuilder content: () -> Content) { self.content = content() }
    var body: some View {
        content.padding(16).background(Brand.navyRaised, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}
