import SwiftUI

/// The panel: start, stop, name the task, pick the project. Everything else
/// is behind Open Stint. `docs/design/menubar.html` is the spec.
struct ContentView: View {
    @Bindable var model: TimerModel
    /// Settings is somewhere you visit, not a state the panel remembers, so
    /// this resets on dismiss rather than persisting.
    @State private var showingSettings = false
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(model: model, showingSettings: $showingSettings)
            if model.isSignedIn {
                // Settings draws over the timer rather than replacing it, so
                // the panel's height is the timer's alone and swapping screens
                // never resizes the window. Settings must stay no taller than
                // the shortest timer: idle, with no recent entries. Disabled
                // too, so a task field focused before Settings opened takes no
                // typing behind it.
                content
                    .opacity(showingSettings ? 0 : 1)
                    .allowsHitTesting(!showingSettings)
                    .accessibilityHidden(showingSettings)
                    .disabled(showingSettings)
                    .overlay(alignment: .top) {
                        if showingSettings {
                            SettingsPanel(model: model, showingSettings: $showingSettings)
                                .frame(maxHeight: .infinity, alignment: .top)
                                .background(Tokens.Dark.bgBase)
                        }
                    }
            } else {
                SignInPanel(model: model)
            }
        }
        // This is what closes the panel on Escape — the panel does not do it
        // by itself. Removing it only produced a beep.
        .onExitCommand { dismiss() }
        // Settings is somewhere you visit, not a state the panel remembers.
        // Both edges, because whether `.window` tears the content down between
        // openings is undocumented: on a rebuild only `onAppear` runs, on a
        // survivor only `onDisappear` does, and one of them is always the one
        // that fires.
        .onAppear { showingSettings = false }
        .onDisappear { showingSettings = false }
        // Sign out is a Settings row, and signing out does not dismiss the
        // panel — without this, signing back in lands in Settings with the
        // timer hidden behind it.
        .onChange(of: model.isSignedIn) { _, _ in showingSettings = false }
        .background(WindowObserver.panelWatch { model.panel(open: $0) })
        .frame(width: 320)
        // Sized before first paint: the panel hangs from the bar, so a height
        // that settles later moves the whole window.
        .fixedSize(horizontal: false, vertical: true)
        .background(Tokens.Dark.bgBase)
    }

    /// The timer waits for its first summary, so it never draws idle and
    /// then jumps to running. An error shows the idle timer and why, as
    /// before there was a loader.
    @ViewBuilder private var content: some View {
        if model.summary == nil, model.errorMessage == nil {
            PanelLoader()
        } else {
            TimerPanel(model: model)
        }
    }
}

/// "Loading" at the panel's center, the web's `Loader`
/// (`specs/007-paint-once/design/loader.html`). It fades in from 600ms, so a
/// fast answer never shows it, then breathes so a long wait still reads as
/// alive. Under Reduce Motion it fades in and holds.
private struct PanelLoader: View {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @State private var shown = false
    @State private var dimmed = false

    /// `motion.count` in tokens.json. The Swift generator emits no motion
    /// tokens yet, so the value is restated here.
    private static let count = 0.9

    var body: some View {
        Text("Loading")
            .role(.regionHead)
            .foregroundStyle(Tokens.Dark.textSubtle)
            // Two modifiers, so the fade and the breath animate apart.
            .opacity(shown ? 1 : 0)
            .opacity(dimmed ? 0.4 : 1)
            .frame(maxWidth: .infinity)
            // The design's panel height; the timer replaces it whole.
            .frame(height: 230)
            .accessibilityIdentifier("loading")
            .onAppear {
                let fade: Animation = reduceMotion
                    ? .linear(duration: Self.count)
                    : .timingCurve(0.2, 0, 0.2, 1, duration: Self.count)
                withAnimation(fade.delay(0.6)) { shown = true }
                guard !reduceMotion else { return }
                // Half of a 2.4s cycle each way, from when the fade is in.
                withAnimation(.easeInOut(duration: 1.2).repeatForever(autoreverses: true).delay(0.6 + Self.count)) {
                    dimmed = true
                }
            }
    }
}

private struct PanelHeader: View {
    @Bindable var model: TimerModel
    @Binding var showingSettings: Bool
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack(spacing: 2) {
            if showingSettings {
                Button { showingSettings = false } label: {
                    IconGlyph("arrow.left")
                }
                .buttonStyle(.panel)
                .panelFocus(RoundedRectangle(cornerRadius: 6), inset: 1)
                .accessibilityLabel("Back")
                .accessibilityIdentifier("back")
                // A view title, not the mark: the bracket bounds are
                // `|Stint|`'s alone.
                Text("Settings")
                    .role(.mark)
                    .foregroundStyle(Tokens.Dark.textMuted)
                    .padding(.leading, 6)
            } else {
                Lockup(color: Tokens.Dark.textMuted)
                // Which backend this build talks to, when it is not the local
                // one. Muted, never the accent: the accent is the running timer.
                if let environment = Config.environmentName {
                    Text(environment)
                        .role(.label)
                        .foregroundStyle(Tokens.Dark.textMuted)
                        .padding(.leading, 8)
                }
            }
            Spacer()
            // In the header, opposite the title, so Settings gains no height.
            if showingSettings {
                Text(AppVersion.current)
                    .role(.meta)
                    .foregroundStyle(Tokens.Dark.textMuted)
                    .textSelection(.enabled)
                    .padding(.trailing, 6)
                    .accessibilityIdentifier("version")
            }
            if model.isSignedIn, !showingSettings {
                Button {
                    openURL(Config.appURL)
                    dismiss()
                    NSApp.hide(nil)
                } label: {
                    IconGlyph("arrow.up.forward.app")
                }
                .buttonStyle(.panel)
                // 1pt: the header's own 6pt padding is all the room a ring
                // has before the panel's top edge clips it.
                .panelFocus(RoundedRectangle(cornerRadius: 6), inset: 1)
                .accessibilityLabel("Open Stint")
                .accessibilityIdentifier("open-web")

                Button { showingSettings = true } label: {
                    IconGlyph("gearshape")
                }
                .buttonStyle(.panel)
                .panelFocus(RoundedRectangle(cornerRadius: 6), inset: 1)
                .accessibilityLabel("Settings")
                .accessibilityIdentifier("settings")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 8)
        .padding(.vertical, 6)
        .background(Tokens.Dark.bgRecessed)
        .overlay(alignment: .bottom) { rule }
    }
}
