import AppKit
import Testing
@testable import Stint

@MainActor
struct TopAnchorTests {
    @Test func shrinkingKeepsTheTop() {
        let window = panel(withAnchor: true)
        window.setContentSize(NSSize(width: 320, height: 200))
        #expect(window.frame == NSRect(x: 100, y: 500, width: 320, height: 200))
    }

    @Test func growingKeepsTheTop() {
        let window = panel(withAnchor: true)
        window.setContentSize(NSSize(width: 320, height: 500))
        #expect(window.frame == NSRect(x: 100, y: 200, width: 320, height: 500))
    }

    @Test func aMovedPanelKeepsItsNewTop() {
        let window = panel(withAnchor: true)
        window.setFrameOrigin(NSPoint(x: 400, y: 100))
        window.setContentSize(NSSize(width: 320, height: 200))
        #expect(window.frame == NSRect(x: 400, y: 300, width: 320, height: 200))
    }

    @Test func aResizeThatMovesTheOriginIsLeftWherePut() {
        let window = panel(withAnchor: true)
        let placed = NSRect(x: 600, y: 50, width: 320, height: 200)
        window.setFrame(placed, display: false)
        #expect(window.frame == placed)
    }

    @Test func withoutTheAnchorTheTopDrops() {
        let window = panel(withAnchor: false)
        window.setContentSize(NSSize(width: 320, height: 200))
        #expect(window.frame == NSRect(x: 100, y: 300, width: 320, height: 200))
    }

    /// A borderless panel, so frame and content are the same rectangle, placed
    /// with its top at y 700 the way `MenuBarExtra` places it under the bar.
    private func panel(withAnchor: Bool) -> NSWindow {
        _ = NSApplication.shared
        let window = NSPanel(
            contentRect: NSRect(x: 0, y: 0, width: 320, height: 400),
            styleMask: [.borderless], backing: .buffered, defer: true
        )
        window.isReleasedWhenClosed = false
        if withAnchor {
            window.contentView?.addSubview(
                WindowObserverView(names: TopKeeper.names, handle: TopKeeper().keepTop)
            )
        }
        window.setFrameOrigin(NSPoint(x: 100, y: 300))
        return window
    }
}
