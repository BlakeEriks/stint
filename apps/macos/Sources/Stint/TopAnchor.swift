import AppKit
import SwiftUI

/// Keeps its window's top edge in place when the window's height changes, so
/// a panel hanging from the menu bar grows and shrinks at the bottom.
///
/// AppKit resizes about the bottom-left origin, and `MenuBarExtra` only moves
/// the panel back under the bar after it has drawn too low or too high. A
/// resize that also moves the origin was placed on purpose, and is left where
/// it was put.
struct TopAnchor: View {
    @State private var keeper = TopKeeper()

    var body: some View {
        WindowObserver(names: TopKeeper.names, handle: keeper.keepTop)
    }
}

@MainActor final class TopKeeper {
    static let names = [NSWindow.didResizeNotification, NSWindow.didMoveNotification]

    /// Nil until the window first moves or resizes: before then there is no top to keep.
    private var lastFrame: NSRect?

    func keepTop(of window: NSWindow) {
        if let lastFrame, window.frame.origin == lastFrame.origin, window.frame.maxY != lastFrame.maxY {
            window.setFrameTopLeftPoint(NSPoint(x: lastFrame.minX, y: lastFrame.maxY))
        }
        lastFrame = window.frame
    }
}
