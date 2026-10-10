import AppKit

extension WindowObserver {
    /// Unfocuses its window each time the window becomes key, so the panel
    /// opens in its default state whatever was focused when it closed.
    ///
    /// `.window` keeps the panel alive between openings, and focus lives in
    /// the AppKit field editor: `@FocusState` reads false while a field is
    /// visibly focused, so clearing the binding does nothing. It is cleared
    /// through the window this view holds, on opening rather than closing — by
    /// `onDisappear` the panel is no longer key, so `NSApp.keyWindow` is some
    /// other window.
    static let focusReset = WindowObserver(name: NSWindow.didBecomeKeyNotification) {
        _ = $0.makeFirstResponder(nil)
    }
}
