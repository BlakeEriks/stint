import Testing
@testable import Stint

/// What Settings shows is what a support question quotes back, so a wrong or
/// blank one fails silently until someone needs it.
struct AppVersionTests {
    @Test func namesTheReleaseAndItsCommit() {
        let info = ["CFBundleShortVersionString": "0.1.0", "StintCommit": "a1b2c3d"]
        #expect(AppVersion.label(info) == "0.1.0 (a1b2c3d)")
    }

    @Test func keepsTheDirtyMark() {
        let info = ["CFBundleShortVersionString": "0.1.0", "StintCommit": "a1b2c3d-dirty"]
        #expect(AppVersion.label(info) == "0.1.0 (a1b2c3d-dirty)")
    }

    @Test func saysDevBuildWithoutABundle() {
        #expect(AppVersion.label(nil) == "dev build")
        #expect(AppVersion.label(["CFBundleShortVersionString": "0.1.0"]) == "dev build")
        #expect(AppVersion.label(["StintCommit": "a1b2c3d"]) == "dev build")
    }
}
