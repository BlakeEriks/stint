import AppIntents
import SwiftUI
import WidgetKit

/// Control Center's toggle, iOS 18: on while a timer runs, naming its task;
/// "Start: <task>" when stopped (`tile` in `src/surfaces.ts`).
@available(iOS 18.0, *)
struct TimerControl: ControlWidget {
  var body: some ControlWidgetConfiguration {
    StaticControlConfiguration(kind: "dev.stint.timer.control", provider: Value()) { value in
      ControlWidgetToggle("Stint", isOn: value.running, action: ToggleTimerIntent()) { _ in
        Label(value.line, systemImage: "timer")
      }
    }
    .displayName("Stint timer")
    .description("Start or stop the timer.")
  }

  struct State {
    let running: Bool
    let line: String
  }

  struct Value: ControlValueProvider {
    var previewValue: State { State(running: false, line: "Start a timer") }

    func currentValue() async throws -> State {
      let s = Surface.load()
      return State(running: s.running, line: s.tile ?? s.title)
    }
  }
}
