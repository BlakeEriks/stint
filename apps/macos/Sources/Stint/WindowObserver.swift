@preconcurrency import AppKit
import SwiftUI

/// Calls `handle` with the window this view sits in, each time that window
/// posts one of `names`.
struct WindowObserver: NSViewRepresentable {
    let names: [Notification.Name]
    let handle: @MainActor (NSWindow) -> Void

    func makeNSView(context: Context) -> WindowObserverView {
        WindowObserverView(names: names, handle: handle)
    }
    func updateNSView(_ nsView: WindowObserverView, context: Context) {}
}

final class WindowObserverView: NSView {
    private let names: [Notification.Name]
    private let handle: @MainActor (NSWindow) -> Void
    private var observers: [NSObjectProtocol] = []

    init(names: [Notification.Name], handle: @escaping @MainActor (NSWindow) -> Void) {
        self.names = names
        self.handle = handle
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        observers.forEach(NotificationCenter.default.removeObserver)
        observers = window.map { window in
            names.map { name in
                // No queue: AppKit posts these on the main thread, and
                // delivering them inline handles them before the window next draws.
                NotificationCenter.default.addObserver(forName: name, object: window, queue: nil) {
                    [weak window, handle] _ in
                    MainActor.assumeIsolated {
                        if let window { handle(window) }
                    }
                }
            }
        } ?? []
    }
}
