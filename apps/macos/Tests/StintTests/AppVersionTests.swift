import Testing
@testable import Stint

/// What Settings shows is what a support question quotes back, so a wrong or
/// blank one fails silently until someone needs it.
struct AppVersionTests {
    @Test(arguments: [
        (["CFBundleShortVersionString": "0.1.0", "StintCommit": "a1b2c3d"], "0.1.0 (a1b2c3d)"),
        (["CFBundleShortVersionString": "0.1.0", "StintCommit": "a1b2c3d-dirty"], "0.1.0 (a1b2c3d-dirty)"),
        (nil, "dev build"),
        (["CFBundleShortVersionString": "0.1.0"], "dev build"),
        (["StintCommit": "a1b2c3d"], "dev build"),
    ] as [([String: String]?, String)])
    func label(info: [String: String]?, label: String) {
        #expect(AppVersion.label(info) == label)
    }
}
