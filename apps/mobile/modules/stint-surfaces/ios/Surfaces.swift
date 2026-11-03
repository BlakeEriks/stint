import Foundation
import WidgetKit

/// Draws every iPhone surface from one state: the widgets and the control
/// read the stored item, and the Live Activity is started, updated or ended
/// here, since only the app may. On the main actor, so draws land in the
/// order they were made.
@MainActor
enum Surfaces {
  /// The Live Activity's changes, one after another.
  private static var live: Task<Void, Never>?

  /// A state from JS. `kept` only adds its reason to what is drawn.
  static func draw(_ json: String) throws {
    guard
      let data = json.data(using: .utf8),
      let incoming = try JSONSerialization.jsonObject(with: data) as? [String: Any]
    else { return }
    var state = incoming
    if incoming["kind"] as? String == "kept" {
      guard let stored = Store.load() else { return }
      state = stored
      state["why"] = incoming["why"]
    }
    try show(state)
  }

  static func show(_ state: [String: Any]) throws {
    try Store.save(state)
    WidgetCenter.shared.reloadAllTimelines()
    if #available(iOS 18.0, *) {
      ControlCenter.shared.reloadAllControls()
    }
    if #available(iOS 16.2, *) {
      let previous = live
      live = Task {
        await previous?.value
        await LiveActivity.sync(state)
      }
    }
  }

  /// Returns once the Live Activity has followed every draw, so a press's
  /// intent ends only after it has.
  static func settled() async {
    await live?.value
  }
}
