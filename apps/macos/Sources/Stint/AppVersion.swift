import Foundation

/// The line Settings shows, so a report names the build it came from.
/// `bundle.sh` writes both keys from `VERSION` and git.
enum AppVersion {
    static let current = label(Bundle.main.infoDictionary)

    /// `0.1.0 (a1b2c3d)`. The QA binary runs outside a bundle and has
    /// neither key, which is a dev build, not a blank.
    static func label(_ info: [String: Any]?) -> String {
        guard let version = info?["CFBundleShortVersionString"] as? String,
              let commit = info?["StintCommit"] as? String
        else { return "dev build" }
        return "\(version) (\(commit))"
    }
}
