import AppKit
import Testing
@testable import Stint

@MainActor
struct FocusResetTests {
    @Test func becomingKeyClearsAFocusedField() throws {
        let (window, field) = panel()
        try #require(window.makeFirstResponder(field))
        #expect(window.firstResponder !== window)

        NotificationCenter.default.post(name: NSWindow.didBecomeKeyNotification, object: window)
        #expect(window.firstResponder === window)
    }

    @Test func anotherWindowBecomingKeyLeavesFocusAlone() throws {
        let (window, field) = panel()
        try #require(window.makeFirstResponder(field))

        NotificationCenter.default.post(name: NSWindow.didBecomeKeyNotification, object: NSWindow())
        #expect(window.firstResponder !== window)
    }

    private func panel() -> (NSWindow, NSTextField) {
        _ = NSApplication.shared
        let window = NSWindow(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 200),
            styleMask: [.titled], backing: .buffered, defer: true
        )
        window.isReleasedWhenClosed = false
        let field = NSTextField(frame: NSRect(x: 0, y: 0, width: 200, height: 24))
        window.contentView?.addSubview(field)
        window.contentView?.addSubview(WindowObserver.focusReset.makeView())
        return (window, field)
    }
}
