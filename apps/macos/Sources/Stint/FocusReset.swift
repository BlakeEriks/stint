@preconcurrency import AppKit
import SwiftUI

/// Unfocuses its window each time the window becomes key, so the panel opens
/// in its default state whatever was focused when it closed.
///
/// `.window` keeps the panel alive between openings, and focus lives in the
/// AppKit field editor: `@FocusState` reads false while a field is visibly
/// focused, so clearing the binding does nothing. It is cleared through the
/// window this view holds, on opening rather than closing — by `onDisappear`
/// the panel is no longer key, so `NSApp.keyWindow` is some other window.
struct FocusReset: NSViewRepresentable {
    func makeNSView(context: Context) -> FocusResetView { FocusResetView() }
    func updateNSView(_ nsView: FocusResetView, context: Context) {}
}

final class FocusResetView: NSView {
    private var observer: NSObjectProtocol?

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let observer { NotificationCenter.default.removeObserver(observer) }
        observer = window.map { window in
            // No queue: AppKit posts this on the main thread, and delivering
            // it inline clears focus before the window next draws.
            NotificationCenter.default.addObserver(
                forName: NSWindow.didBecomeKeyNotification, object: window, queue: nil
            ) { [weak window] _ in
                MainActor.assumeIsolated { _ = window?.makeFirstResponder(nil) }
            }
        }
    }
}
