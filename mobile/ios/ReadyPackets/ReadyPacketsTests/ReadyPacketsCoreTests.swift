import XCTest
@testable import ReadyPackets

final class ReadyPacketsCoreTests: XCTestCase {
    func testURLSafeChallengeHasNoPadding() {
        let value = Data([0, 1, 2, 3, 4, 5]).base64EncodedString().replacingOccurrences(of: "+", with: "-").replacingOccurrences(of: "/", with: "_").replacingOccurrences(of: "=", with: "")
        XCTAssertFalse(value.contains("="))
        XCTAssertFalse(value.contains("+"))
        XCTAssertFalse(value.contains("/"))
    }
}
