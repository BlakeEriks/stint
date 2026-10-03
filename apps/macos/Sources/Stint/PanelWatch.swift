@preconcurrency import AppKit
import SwiftUI

/// Reports whether its window is on screen, so the model polls what only the
/// panel shows while someone can see it.
///
/// From the window's occlusion state rather than `onAppear`/`onDisappear`,
/// which fire on either edge depending on whether `.window` rebuilt the
/// content (`ContentView`), and rather than key status, which a menu opened
/// from the panel takes away while the panel is still showing.
struct PanelWatch: NSViewRepresentable {
    let onChange: (Bool) -> Void

    func makeNSView(context: Context) -> PanelWatchView { PanelWatchView(onChange: onChange) }
    func updateNSView(_ nsView: PanelWatchView, context: Context) {}
}

final class PanelWatchView: NSView {
    private let onChange: (Bool) -> Void
    private var observer: NSObjectProtocol?

    init(onChange: @escaping (Bool) -> Void) {
        self.onChange = onChange
        super.init(frame: .zero)
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is unused") }

    override func viewDidMoveToWindow() {
        super.viewDidMoveToWindow()
        if let observer { NotificationCenter.default.removeObserver(observer) }
        observer = window.map { window in
            NotificationCenter.default.addObserver(
                forName: NSWindow.didChangeOcclusionStateNotification, object: window, queue: .main
            ) { [weak self, weak window] _ in
                MainActor.assumeIsolated {
                    self?.onChange(window?.occlusionState.contains(.visible) ?? false)
                }
            }
        }
        if let window { onChange(window.occlusionState.contains(.visible)) }
    }
}
