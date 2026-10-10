import AppKit

extension WindowObserver {
    /// Reports whether its window is on screen, so the model polls what only
    /// the panel shows while someone can see it.
    ///
    /// From the window's occlusion state rather than `onAppear`/`onDisappear`,
    /// which fire on either edge depending on whether `.window` rebuilt the
    /// content (`ContentView`), and rather than key status, which a menu
    /// opened from the panel takes away while the panel is still showing.
    static func panelWatch(_ onChange: @escaping (Bool) -> Void) -> WindowObserver {
        WindowObserver(name: NSWindow.didChangeOcclusionStateNotification, reportsOnMove: true) {
            onChange($0.occlusionState.contains(.visible))
        }
    }
}
