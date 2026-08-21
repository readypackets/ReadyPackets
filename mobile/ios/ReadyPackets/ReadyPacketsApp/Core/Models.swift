import Foundation

struct TokenSet: Decodable {
    let accessToken: String
    let tokenType: String
    let expiresIn: Int
    let refreshToken: String
    enum CodingKeys: String, CodingKey { case accessToken = "access_token", tokenType = "token_type", expiresIn = "expires_in", refreshToken = "refresh_token" }
}

struct APIProblem: Decodable, LocalizedError {
    let title: String
    let code: String
    let detail: String?
    var errorDescription: String? { detail ?? title }
}

struct Profile: Decodable {
    let id: String
    let displayName: String
    let email: String
    let role: String
    let capabilities: [String]
    let mfaEnabled: Bool
    let emailVerified: Bool
}

struct Dashboard: Decodable {
    let orderCount: Int
    let attentionCount: Int
    let currentOrders: [DashboardOrder]
}

struct DashboardOrder: Decodable, Identifiable {
    let publicOrderId: String
    let projectName: String?
    let status: String
    let completionPercent: Int
    let currentStage: String?
    let attention: String
    var id: String { publicOrderId }
}

struct OrderSummary: Decodable, Identifiable, Hashable {
    let publicOrderId: String
    let projectName: String?
    let status: String
    let paymentStatus: String
    let completionPercent: Int
    let currentStage: String?
    let attention: String
    let dueAt: Date?
    let deliveredAt: Date?
    let createdAt: Date?
    var id: String { publicOrderId }
}

struct OrdersPage: Decodable { let items: [OrderSummary]; let nextCursor: String? }
struct OrderDetail: Decodable { let publicOrderId: String; let projectName: String?; let status: String; let paymentStatus: String; let completionPercent: Int; let currentStage: String? }
struct DeviceRecord: Decodable, Identifiable { let id: String; let platform: String; let appVersion: String; let deviceName: String?; let status: String; let lastSeenAt: Date?; let current: Bool }
struct DevicesPage: Decodable { let items: [DeviceRecord] }
