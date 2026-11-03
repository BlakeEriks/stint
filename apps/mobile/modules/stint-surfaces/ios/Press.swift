import Foundation

/// A press from a widget, the Live Activity, the control, Siri or Shortcuts
/// (`targets/widget/_shared/Intents.swift`). iOS runs it in this app, in a
/// background launch where React Native doesn't start, so it is Swift,
/// through the macOS app's `Optimistic` (`Shared/`) with JS's words: the
/// prediction drawn at once, presses in order, a silent server failed after
/// 10s, and the server's timer read and drawn once the last press settles.
@MainActor
public final class StintPress: Optimistic {
  private static let shared = StintPress()

  var inFlight: [String: Int] = [:]
  var lanes: [String: Task<Void, Never>] = [:]
  /// The words of the press that last failed ("Not stopped").
  private var failing = ""
  /// A draw the Keychain refused, said to Siri since no surface can show it.
  private var unstored: Error?

  private func draw(_ state: [String: Any]) {
    do { try Surfaces.show(state) } catch { unstored = error }
  }

  /// Says what happened, for Siri.
  public static func run(_ action: String) async -> String {
    let said = await shared.run(action)
    await Surfaces.settled()
    SurfacesModule.pressed()
    return said
  }

  private func run(_ action: String) async -> String {
    guard let before = Store.load(), let backend = before["backend"] as? [String: String] else {
      return "Open Stint to sign in."
    }
    guard let predicted = predict(before, action) else {
      return action == "stop" ? "No timer is running." : "A timer is already running."
    }
    let words = (before["failed"] as? [String: String]) ?? [:]
    let api = Backend(backend)
    let path = "/timer/\(action)"
    let next = before["next"] as? [String: Any]
    let task = next?["taskName"] as? String ?? ""
    let project = next?["projectId"] as? String
    let id = uuidv7()
    unstored = nil
    let answer = await press("timer") {
      failing = words[action] ?? ""
      draw(predicted)
      return { self.draw(before) }
    } perform: {
      let fields: [String: Any] =
        action == "start" ? ["id": id, "taskName": task, "projectId": project ?? NSNull()] : [:]
      let (status, data) = try await api.request(path, try JSONSerialization.data(withJSONObject: fields))
      guard (200..<300).contains(status) else {
        throw Backend.Refusal(message: Self.reason(Backend.json(data)) ?? "the server said \(status)")
      }
      return true
    }
    if let unstored { return "Not drawn: \(message(for: unstored))" }
    guard answer != nil else {
      return (Store.load()?["why"] as? String) ?? failing
    }
    return action == "stop" ? "Stopped." : "Started \(Self.title(predicted))."
  }

  // MARK: Optimistic

  func report(_ reason: String) {
    guard var state = Store.load() else { return }
    state["why"] = failing.isEmpty ? reason : "\(failing): \(reason)"
    draw(state)
  }

  func message(for error: Error) -> String {
    if let refusal = error as? Backend.Refusal { return refusal.message }
    if error is URLError || error is PressTimeout {
      return (Store.load()?["failed"] as? [String: String])?["unreachable"] ?? "can’t reach Stint"
    }
    return error.localizedDescription
  }

  /// Draws the timer the server holds, over what is drawn: the same task
  /// keeps its project line, another shows bare until the app reads it.
  func refresh() async {
    guard let stored = Store.load(), let backend = stored["backend"] as? [String: String] else { return }
    let answer: (Int, Data)
    do {
      answer = try await Backend(backend).request("/timer/current", nil)
    } catch is URLError {
      // Offline, what is drawn stays until the app reads the timer.
      return
    } catch {
      // Such as a refreshed session the Keychain refused: Siri says it.
      unstored = error
      return
    }
    guard (200..<300).contains(answer.0) else { return }
    draw(Self.held(Backend.json(answer.1)["entry"] as? [String: Any], over: stored))
  }

  // MARK: The state

  /// The state with its prediction swapped in, and the state as the next
  /// press's: the two are a timer's start and stop of the same task.
  private func predict(_ s: [String: Any], _ action: String) -> [String: Any]? {
    guard
      s["kind"] as? String == (action == "stop" ? "running" : "stopped"),
      var next = s["pressed"] as? [String: Any]
    else { return nil }
    var back = s
    back["pressed"] = nil
    back["why"] = NSNull()
    if next["kind"] as? String == "running" {
      next["startedAt"] = Date().timeIntervalSince1970 * 1000
    }
    next["why"] = NSNull()
    next["pressed"] = back
    for key in ["colors", "failed", "backend"] { next[key] = s[key] }
    return next
  }

  private static func held(_ entry: [String: Any]?, over s: [String: Any]) -> [String: Any] {
    let running = s["kind"] as? String == "running"
    guard let entry else {
      // None running: what is drawn when stopped, else what Stop shows.
      guard running, let stopped = s["pressed"] as? [String: Any] else { return s }
      var out = stopped
      for key in ["colors", "failed", "backend"] { out[key] = s[key] }
      out["pressed"] = s.filter { $0.key != "pressed" }
      return out
    }
    let task = entry["taskName"] as? String ?? ""
    let name = task.isEmpty ? "Untitled" : task
    var out = s
    if !running || title(s) != name {
      out = ["kind": "running", "title": name, "detail": NSNull(), "color": NSNull(), "why": NSNull(),
             "tile": name, "shortcut": "Stop"]
      for key in ["colors", "failed", "backend"] { out[key] = s[key] }
      out["next"] = ["taskName": task, "projectId": entry["projectId"] ?? NSNull()]
      out["pressed"] = ["kind": "stopped", "title": name, "detail": NSNull(), "color": NSNull(),
                        "why": NSNull(), "tile": "Start: \(name)", "shortcut": "Start: \(name)",
                        "next": out["next"] as Any]
    }
    if let started = millis(entry["startedAt"]) { out["startedAt"] = started }
    return out
  }

  private static func title(_ s: [String: Any]) -> String { s["title"] as? String ?? "" }

  nonisolated private static func reason(_ body: [String: Any]) -> String? {
    guard let m = body["message"] as? String, !m.isEmpty else { return nil }
    return m.hasSuffix(".") ? String(m.dropLast()) : m
  }

  private static func millis(_ iso: Any?) -> Double? {
    guard let s = iso as? String else { return nil }
    let f = ISO8601DateFormatter()
    f.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    let date = f.date(from: s) ?? ISO8601DateFormatter().date(from: s)
    return date.map { $0.timeIntervalSince1970 * 1000 }
  }
}
