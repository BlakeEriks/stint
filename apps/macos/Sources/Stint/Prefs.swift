import Foundation
import Observation

/// What the menu bar reads out.
enum BarReadout: String, CaseIterable {
    case runningTimer, todaysTotal

    var label: String {
        switch self {
        case .runningTimer: "Running timer"
        case .todaysTotal: "Today's total"
        }
    }
}

/// The app's preferences, per device. A laptop and a desktop can disagree
/// about what the bar shows, and a round trip to `user_settings` would leave
/// the bar flickering through a default at every launch — so this is
/// `UserDefaults`, not the server and not the Keychain, which holds secrets.
@MainActor
@Observable
final class Prefs {
    static let shared = Prefs()

    private let defaults: UserDefaults
    private init(defaults: UserDefaults = .standard) {
        self.defaults = defaults
        stored = defaults.string(forKey: Key.barReadout)
            .flatMap(BarReadout.init(rawValue:)) ?? .runningTimer
    }

    /// Written through on set, so the bar reflects the choice immediately and
    /// still reads the same after a relaunch.
    var barReadout: BarReadout {
        get { stored }
        set {
            stored = newValue
            defaults.set(newValue.rawValue, forKey: Key.barReadout)
        }
    }

    private var stored: BarReadout

    private enum Key {
        static let barReadout = "barReadout"
    }
}
