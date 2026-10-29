import Foundation
import WidgetKit

/// Draws every iPhone surface from one state: the widgets and the control
/// read the stored item, and the Live Activity is started, updated or ended
/// here, since only the app may.
enum Surfaces {
  /// A state from JS. `kept` only adds its reason to what is drawn.
  static func draw(_ json: String) {
    guard
      let data = json.data(using: .utf8),
      let incoming = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any]
    else { return }
    var state = incoming
    if incoming["kind"] as? String == "kept" {
      guard let stored = Store.load() else { return }
      state = stored
      state["why"] = incoming["why"]
    }
    Task { await show(state) }
  }

  /// Returns once the Live Activity has followed, so a press's intent ends
  /// only after it has.
  static func show(_ state: [String: Any]) async {
    Store.save(state)
    WidgetCenter.shared.reloadAllTimelines()
    if #available(iOS 18.0, *) {
      ControlCenter.shared.reloadAllControls()
    }
    if #available(iOS 16.2, *) {
      await LiveActivity.sync(state)
    }
  }
}
