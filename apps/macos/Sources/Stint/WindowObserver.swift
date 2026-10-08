@preconcurrency import AppKit
import SwiftUI

/// Calls `handle` with its window each time the window posts `name`, and,
/// with `reportsOnMove`, once when the view lands in a window.
struct WindowObserver: NSViewRepresentable {
    let name: Notification.Name
    var reportsOnMove = false
    let handle: (NSWindow) -> Void

    func makeNSView(context: Context) -> WindowObserverView { makeView() }
    func updateNSView(_ nsView: WindowObserverView, context: Context) {}

    func makeView() -> WindowObserverView {
        WindowObserverView(name: name, reportsOnMove: reportsOnMove, handle: handle)
    }
}

final class WindowObserverView: NSView {
    private let name: Notification.Name
    private let reportsOnMove: Bool
    private let handle: (NSWindow) -> Void
    private var observer: NSObjectProtocol?

    init(name: Notification.Name, reportsOnMove: Bool, handle: @escaping (NSWindow) -> Void) {
        self.name = name
        self.reportsOnMove = reportsOnMove
        self.handle = handle
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let observer { NotificationCenter.default.removeObserver(observer) }
        observer = window.map { window in
            // No queue: AppKit posts window notifications on the main thread,
            // and delivering them inline acts before the window next draws.
            NotificationCenter.default.addObserver(forName: name, object: window, queue: nil) {
                [weak self, weak window] _ in
                MainActor.assumeIsolated {
                    if let window { self?.handle(window) }
                }
            }
        }
        if reportsOnMove, let window { handle(window) }
    }
}
