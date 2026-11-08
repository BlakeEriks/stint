import ActivityKit
import Foundation

/// The Live Activity's data. `targets/widget/Activity.swift` declares the
/// same type for its views, and ActivityKit matches the two by it, so each
/// field changes in both.
struct StintActivityAttributes: ActivityAttributes {
  struct ContentState: Codable, Hashable {
    var title: String
    var detail: String?
    var color: String?
    var startedAt: Date
    var why: String?
    var light: [String: String]
    var dark: [String: String]
  }
}

/// One Live Activity while a timer runs, none otherwise.
@available(iOS 16.2, *)
enum LiveActivity {
  static func sync(_ state: [String: Any]) async {
    let running = Activity<StintActivityAttributes>.activities
    guard let content = content(state) else {
      for activity in running {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      return
    }
    if let activity = running.first {
      await activity.update(ActivityContent(state: content, staleDate: nil))
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else { return }
    // Refused when iOS allows no new one now, as in the background outside
    // an intent; the next draw in the app starts it.
    _ = try? Activity.request(
      attributes: StintActivityAttributes(),
      content: ActivityContent(state: content, staleDate: nil),
      pushType: nil
    )
  }

  private static func content(_ s: [String: Any]) -> StintActivityAttributes.ContentState? {
    guard s["kind"] as? String == "running" else { return nil }
    let ms = (s["startedAt"] as? Double) ?? 0
    let colors = s["colors"] as? [String: [String: String]]
    return .init(
      title: s["title"] as? String ?? "",
      detail: s["detail"] as? String,
      color: s["color"] as? String,
      // 0: a prediction, counting from the press.
      startedAt: ms > 0 ? Date(timeIntervalSince1970: ms / 1000) : Date(),
      why: s["why"] as? String,
      light: colors?["light"] ?? [:],
      dark: colors?["dark"] ?? [:]
    )
  }
}
