import Foundation
import Security

/// A press from a widget, the Live Activity, the control, Siri or Shortcuts
/// (`targets/widget/_shared/Intents.swift`). iOS runs it in this app, in a
/// background launch where React Native doesn't start, so it is Swift: the
/// app's own rules (Constitution VI) with JS's words. It draws the
/// prediction at once, reaches the server in press order with this app's
/// session, and draws the answer, or takes the prediction back after 10s
/// with the reason. The app's next read of the timer replaces it all.
public enum StintPress {
  /// Says what happened, for Siri.
  public static func press(_ action: String) async -> String {
    guard let before = Store.load(), let backend = before["backend"] as? [String: String] else {
      return "Open Stint to sign in."
    }
    let failed = before["failed"] as? [String: String] ?? [:]
    let prefix = failed[action] ?? ""
    guard let predicted = predict(before, action) else {
      return action == "stop" ? "No timer is running." : "A timer is already running."
    }
    await Surfaces.show(predicted)
    let generation = Generation.next()

    let outcome = await Lane.shared.run { await send(action, next: before["next"], backend) }
    defer { SurfacesModule.pressed() }
    switch outcome {
    case .done(let startedAt):
      var settled = predicted
      if let startedAt { settled["startedAt"] = startedAt }
      if Generation.isLatest(generation) { await Surfaces.show(settled) }
      return action == "stop" ? "Stopped." : "Started \(before.title(of: "pressed"))."
    case .refused(let reason):
      let why = "\(prefix): \(reason ?? failed["unreachable"] ?? "")"
      if Generation.isLatest(generation) {
        var back = before
        back["why"] = why
        await Surfaces.show(back)
      }
      return why
    }
  }

  /// The state with its prediction swapped in, and the state as the next
  /// press's: the two are a timer's start and stop of the same task.
  private static func predict(_ s: [String: Any], _ action: String) -> [String: Any]? {
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

  enum Outcome {
    /// The server did it; a start says when it started (ms).
    case done(startedAt: Double?)
    /// `nil`: the server couldn't be reached.
    case refused(String?)
  }

  private static func send(_ action: String, next: Any?, _ backend: [String: String]) async -> Outcome {
    let api = Backend(backend)
    var body: [String: Any] = [:]
    if action == "start" {
      let n = next as? [String: Any]
      body = [
        "id": uuidv7(),
        "taskName": n?["taskName"] as? String ?? "",
        "projectId": n?["projectId"] ?? NSNull(),
      ]
    }
    do {
      let (status, answer) = try await api.post("/timer/\(action)", body)
      if (200..<300).contains(status) {
        let entry = (answer["entry"] as? [String: Any]) ?? answer
        return .done(startedAt: action == "start" ? millis(entry["startedAt"]) : nil)
      }
      // None running is what a stop wanted: it is what the server holds.
      if action == "stop", answer["code"] as? String == "NO_TIMER_RUNNING" {
        return .done(startedAt: nil)
      }
      return .refused(message(answer) ?? "the server said \(status)")
    } catch let refusal as Backend.Refusal {
      return .refused(refusal.message)
    } catch {
      return .refused(nil)
    }
  }

  private static func message(_ body: [String: Any]) -> String? {
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

  /// `uuidv7()` in `@stint/core`: a retried start lands on the same row.
  static func uuidv7() -> String {
    var b = [UInt8](repeating: 0, count: 16)
    _ = SecRandomCopyBytes(kSecRandomDefault, b.count, &b)
    let ms = UInt64(Date().timeIntervalSince1970 * 1000)
    for i in 0..<6 { b[i] = UInt8(truncatingIfNeeded: ms >> (8 * UInt64(5 - i))) }
    b[6] = (b[6] & 0x0f) | 0x70
    b[8] = (b[8] & 0x3f) | 0x80
    return NSUUID(uuidBytes: b).uuidString.lowercased()
  }
}

private extension Dictionary where Key == String, Value == Any {
  func title(of key: String) -> String {
    ((self[key] as? [String: Any])?["title"] as? String) ?? ""
  }
}

/// Presses reach the server one at a time, in press order.
actor Lane {
  static let shared = Lane()
  private var last: Task<Void, Never>?

  func run<T: Sendable>(_ work: @escaping @Sendable () async -> T) async -> T {
    let previous = last
    let task = Task { () -> T in
      await previous?.value
      return await work()
    }
    last = Task { _ = await task.value }
    return await task.value
  }
}

/// The latest press wins: an earlier one's answer draws nothing over it.
enum Generation {
  private static let lock = NSLock()
  private static var value = 0

  static func next() -> Int {
    lock.lock(); defer { lock.unlock() }
    value += 1
    return value
  }

  static func isLatest(_ g: Int) -> Bool {
    lock.lock(); defer { lock.unlock() }
    return g == value
  }
}
