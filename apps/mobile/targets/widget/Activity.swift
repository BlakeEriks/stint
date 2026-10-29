import ActivityKit
import SwiftUI
import WidgetKit

/// The module's type (`modules/stint-surfaces/ios/LiveActivity.swift`),
/// declared again here for the views: ActivityKit matches the two by it,
/// so each field changes in both.
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

/// While a timer runs: the medium widget's row with Stop on the lock
/// screen, and the clock in the Dynamic Island.
struct TimerActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: StintActivityAttributes.self) { context in
      ActivityRow(state: context.state)
        .padding(16)
    } dynamicIsland: { context in
      let s = context.state
      return DynamicIsland {
        DynamicIslandExpandedRegion(.center) {
          ActivityRow(state: s)
        }
      } compactLeading: {
        Circle().fill(dot(s)).frame(width: 10, height: 10)
      } compactTrailing: {
        clock(s).frame(maxWidth: 64)
      } minimal: {
        Circle().fill(dot(s)).frame(width: 10, height: 10)
      }
    }
  }

  private func dot(_ s: StintActivityAttributes.ContentState) -> Color {
    s.color.flatMap(Color.init(hex:)) ?? Color(hex: s.dark["timer-running"] ?? "") ?? .green
  }
}

private func clock(_ s: StintActivityAttributes.ContentState) -> some View {
  Text(timerInterval: s.startedAt...Date.distantFuture, countsDown: false)
    .font(.system(.body, design: .monospaced))
    .monospacedDigit()
    .multilineTextAlignment(.trailing)
}

struct ActivityRow: View {
  @Environment(\.colorScheme) private var scheme
  let state: StintActivityAttributes.ContentState

  var body: some View {
    let p = Palette(light: state.light, dark: state.dark, scheme)
    let surface = Surface(
      kind: "running", title: state.title, detail: state.detail, color: state.color,
      startedAt: state.startedAt.timeIntervalSince1970 * 1000, why: state.why)
    HStack(spacing: 12) {
      VStack(alignment: .leading, spacing: 4) {
        HStack(spacing: 8) {
          Circle().fill(p["timer-running"]).frame(width: 8, height: 8)
          Clock(surface: surface, p: p, size: 28)
        }
        Text(state.title.isEmpty ? "Untitled" : state.title)
          .font(.system(size: 15))
          .foregroundStyle(p["text-strong"])
          .lineLimit(1)
        Detail(surface: surface, p: p).font(.system(size: 13))
      }
      Spacer(minLength: 0)
      PressButton(surface: surface, p: p, size: 48)
    }
    .activityBackgroundTint(p["bg-primary"])
  }
}
