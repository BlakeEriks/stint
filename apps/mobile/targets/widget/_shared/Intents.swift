import AppIntents
#if canImport(StintSurfaces)
  internal import StintSurfaces
#endif

// In the app and the widget extension (`@bacons/apple-targets`' `_shared`):
// the widgets' buttons name these, and iOS runs a `LiveActivityIntent` in
// the app, where the module presses (`StintPress` in
// `modules/stint-surfaces/ios/Press.swift`). The extension's copy never runs.

@available(iOS 17.0, *)
private func press(_ action: String) async -> String {
  #if canImport(StintSurfaces)
    return await StintPress.run(action)
  #else
    return ""
  #endif
}

@available(iOS 17.0, *)
struct StartTimerIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Start the timer"
  static let description = IntentDescription("Starts the most recent task on its project.")
  // It writes billable time, which a found phone shouldn't.
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  func perform() async throws -> some IntentResult & ProvidesDialog {
    .result(dialog: IntentDialog(stringLiteral: await press("start")))
  }
}

@available(iOS 17.0, *)
struct StopTimerIntent: LiveActivityIntent {
  static let title: LocalizedStringResource = "Stop the timer"
  static let description = IntentDescription("Stops the running timer.")
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  func perform() async throws -> some IntentResult & ProvidesDialog {
    .result(dialog: IntentDialog(stringLiteral: await press("stop")))
  }
}

/// The Control Center control's: on starts, off stops.
@available(iOS 18.0, *)
struct ToggleTimerIntent: SetValueIntent, LiveActivityIntent {
  static let title: LocalizedStringResource = "Start or stop the timer"
  static let authenticationPolicy: IntentAuthenticationPolicy = .requiresAuthentication

  @Parameter(title: "Running")
  var value: Bool

  func perform() async throws -> some IntentResult {
    _ = await press(value ? "start" : "stop")
    return .result()
  }
}

#if canImport(StintSurfaces)
  /// Siri's and Shortcuts' Start and Stop, so the Action button runs one.
  /// App Intents need no Siri capability, which a free Apple ID can't sign.
  @available(iOS 17.0, *)
  struct StintShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
      AppShortcut(
        intent: StartTimerIntent(),
        phrases: ["Start the timer in \(.applicationName)", "Start \(.applicationName)"],
        shortTitle: "Start",
        systemImageName: "play.fill"
      )
      AppShortcut(
        intent: StopTimerIntent(),
        phrases: ["Stop the timer in \(.applicationName)", "Stop \(.applicationName)"],
        shortTitle: "Stop",
        systemImageName: "stop.fill"
      )
    }
  }
#endif
