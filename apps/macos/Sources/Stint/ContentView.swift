import ServiceManagement
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
                if showingSettings {
                    SettingsPanel(model: model, showingSettings: $showingSettings)
                } else {
                    TimerPanel(model: model)
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
        .frame(width: 320)
        // Sized before first paint: the panel hangs from the bar, so a height
        // that settles later moves the whole window.
        .fixedSize(horizontal: false, vertical: true)
        .background(Tokens.Dark.bgBase)
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
                // A view title, not the mark: the bracket bounds are
                // `|Stint|`'s alone.
                Text("Settings")
                    .font(.system(size: 17, weight: .semibold, design: .monospaced))
                    .tracking(17 * 0.12)
                    .foregroundStyle(Tokens.Dark.textMuted)
                    .padding(.leading, 6)
            } else {
                Lockup(size: 17, color: Tokens.Dark.textMuted)
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

                Button { showingSettings = true } label: {
                    IconGlyph("gearshape")
                }
                .buttonStyle(.panel)
                .panelFocus(RoundedRectangle(cornerRadius: 6), inset: 1)
                .accessibilityLabel("Settings")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 8)
        .padding(.vertical, 6)
        .background(Tokens.Dark.bgRecessed)
        .overlay(alignment: .bottom) { rule }
    }
}

/// Two settings and the way out. Nothing unimplemented is drawn: an inert
/// control is a promise the panel cannot keep.
private struct SettingsPanel: View {
    @Bindable var model: TimerModel
    @Binding var showingSettings: Bool
    @State private var prefs = Prefs.shared

    private var rows: some View {
        VStack(alignment: .leading, spacing: 0) {
            SettingsRow("Show in menu bar") {
                Picker("", selection: $prefs.barReadout) {
                    ForEach(BarReadout.allCases, id: \.self) { readout in
                        Text(readout.label).tag(readout)
                    }
                }
                .labelsHidden()
                .pickerStyle(.menu)
                .menuIndicator(.hidden)
                .buttonStyle(.plain)
                .font(TypeRole.body.font)
                .foregroundStyle(Tokens.Dark.textPrimary)
                .padding(.horizontal, 8)
                .padding(.vertical, 5)
                .frame(height: 28)
                .background(Tokens.Dark.bgPrimary)
                .clipShape(RoundedRectangle(cornerRadius: 7))
                .overlay(
                    RoundedRectangle(cornerRadius: 7)
                        .strokeBorder(Tokens.Dark.borderSubtle, lineWidth: 1)
                )
                .fixedSize()
                .panelFocus(RoundedRectangle(cornerRadius: 7))
            }
            SettingsRow("Launch at login") {
                LaunchAtLoginToggle()
            }
        }
        .padding(.vertical, 4)
        .background(Tokens.Dark.bgBase)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            rows
            account
        }

    }

    private var account: some View {
        HStack(spacing: 10) {
            if let email = model.email {
                Text(email)
                    .role(.meta)
                    .foregroundStyle(Tokens.Dark.textMuted)
                    .lineLimit(1)
            }
            Spacer(minLength: 0)
            accountLink("Sign out") { Task { await model.signOut() } }
            accountLink("Quit") { NSApp.terminate(nil) }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(height: 38)
        .frame(maxWidth: .infinity)
        .background(Tokens.Dark.bgRecessed)
        .overlay(alignment: .top) { rule }
    }

    private func accountLink(_ title: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Hovering { on in
                Text(title)
                    .font(.system(size: 10.5, weight: .regular, design: .monospaced))
                    .tracking(0.84)
                    .textCase(.uppercase)
                    .foregroundStyle(on ? Tokens.Dark.textPrimary : Tokens.Dark.textSubtle)
                    .contentShape(Rectangle())
            }
        }
        .buttonStyle(.panel)
        .panelFocus(RoundedRectangle(cornerRadius: 4))
    }
}

/// A 46pt settings row: label left, control right.
private struct SettingsRow<Control: View>: View {
    let title: String
    @ViewBuilder let control: () -> Control

    init(_ title: String, @ViewBuilder control: @escaping () -> Control) {
        self.title = title
        self.control = control
    }

    var body: some View {
        Hovering { on in
            HStack(spacing: 12) {
                Text(title)
                    .font(TypeRole.body.font)
                    .foregroundStyle(Tokens.Dark.textPrimary)
                Spacer(minLength: 0)
                control()
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 9)
            .frame(height: 46)
            .background(on ? Tokens.Dark.bgHover : .clear)
        }
    }
}

/// The login item's state belongs to the system, so it is read back from
/// `SMAppService` rather than mirrored into `Prefs`, where the two copies
/// could disagree after a change made in System Settings.
private struct LaunchAtLoginToggle: View {
    @State private var enabled = SMAppService.mainApp.status == .enabled

    var body: some View {
        Button {
            do {
                if enabled { try SMAppService.mainApp.unregister() }
                else { try SMAppService.mainApp.register() }
            } catch {}
            enabled = SMAppService.mainApp.status == .enabled
        } label: {
            // Neutral off and on: a settings toggle is not the live primary
            // thing on the screen, so it never wears the accent.
            Capsule()
                .fill(enabled ? Tokens.Dark.borderControl : Tokens.Dark.bgActive)
                .frame(width: 30, height: 18)
                .overlay(alignment: enabled ? .trailing : .leading) {
                    Circle()
                        .fill(enabled ? Tokens.Dark.textStrong : Tokens.Dark.textSubtle)
                        .frame(width: 12, height: 12)
                        .padding(.horizontal, 3)
                }
        }
        .buttonStyle(PanelButtonStyle(shape: Capsule()))
        .panelFocus(Capsule())
        .animation(.easeOut(duration: 0.12), value: enabled)
        .accessibilityLabel("Launch at login")
        .accessibilityValue(enabled ? "On" : "Off")
        .onAppear { enabled = SMAppService.mainApp.status == .enabled }
    }
}

private struct TimerPanel: View {
    @Bindable var model: TimerModel
    @FocusState private var taskFocused: Bool

    private var timerColor: Color {
        model.exceedsThreshold ? Tokens.Dark.warning : Tokens.Dark.accentDefault
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.isRunning { running } else { idle }
            if let error = model.errorMessage {
                Text(error)
                    .role(.body)
                    .foregroundStyle(Tokens.Dark.danger)
                    .padding(.horizontal, 14)
                    .padding(.bottom, 12)
            }
            if model.exceedsThreshold {
                RunawayNotice(hours: model.summary?.maxTimerHours ?? 8)
            }
            rule
            stats
            // The list drops in a runaway: when something needs deciding the
            // panel is not also a dashboard.
            if !model.recent.isEmpty, !model.exceedsThreshold {
                rule
                entries
            }
        }
        // `.window` keeps this view alive between openings, so focus survives
        // a dismissal unless it is cleared here. It has to go through the
        // responder: the field editor is what actually holds focus, and
        // `@FocusState` reads false throughout, so clearing the binding alone
        // does nothing.
        .onDisappear {
            taskFocused = false
            NSApp.keyWindow?.makeFirstResponder(nil)
        }
    }

    private var idle: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("What are you working on?", text: $model.draftTaskName)
                .textFieldStyle(.plain)
                .focused($taskFocused)
                .field(focused: taskFocused)
                .onSubmit { Task { await model.toggle() } }
            HStack(spacing: 8) {
                ProjectPicker(model: model)
                Spacer(minLength: 0)
                TransportButton(model: model)
            }
        }
        .padding(14)
    }

    private var running: some View {
        VStack(alignment: .leading, spacing: 0) {
            HStack(spacing: 10) {
                Circle()
                    .fill(timerColor)
                    .frame(width: 9, height: 9)
                Text(format(model.elapsedSeconds))
                    .role(.readout)
                    .foregroundStyle(timerColor)
                    .contentTransition(.numericText())
                Spacer(minLength: 8)
                TransportButton(model: model)
            }
            // Task and project indent to the readout's text, not its dot.
            RenameRow(model: model)
                .padding(.top, 8)
                .padding(.leading, 19)
            // The dot carries the client, the text carries the project: one
            // row saying whose work and which work. Absent entirely for
            // internal work rather than drawn empty.
            //
            // Not a picker while running — changing a project mid-entry
            // reassigns time already tracked against the old one, which is a
            // billing edit disguised as a dropdown. Stop the timer to move it.
            if let project = model.projectID.flatMap({ id in
                model.projects.first(where: { $0.id == id })?.name
            }) {
                HStack(spacing: 6) {
                    Circle()
                        .fill(model.projectID.flatMap { model.projectColors[$0] }
                            .map { Color(hex: $0) } ?? Tokens.Dark.textSubtle)
                        .frame(width: 8, height: 8)
                    Text(project)
                        .role(.meta)
                        .foregroundStyle(Tokens.Dark.textMuted)
                        .lineLimit(1)
                }
                .padding(.top, 4)
                .padding(.leading, 19)
            }
        }
        .padding(14)
    }

    private var stats: some View {
        HStack(alignment: .firstTextBaseline) {
            statistic("Today", value: format(model.todaySeconds))
            Spacer(minLength: 12)
            // Absent until fetched: a zero would claim "nothing owed".
            if let stats = model.stats {
                statistic(
                    "Unbilled",
                    value: money(stats.unbilled.total, code: stats.currency),
                    trailing: true
                )
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    private func statistic(_ label: String, value: String, trailing: Bool = false) -> some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: 2) {
            Text(label).role(.label).foregroundStyle(Tokens.Dark.textSubtle)
            Text(value)
                .role(.stat)
                .foregroundStyle(Tokens.Dark.textStrong)
                .contentTransition(.numericText())
        }
    }

    private var entries: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text("Recent")
                .role(.label)
                .foregroundStyle(Tokens.Dark.textSubtle)
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, 6)
            ForEach(model.recent) { entry in
                EntryRow(entry: entry) { Task { await model.resume(entry) } }
            }
        }
        .padding(.bottom, 6)
    }
}

/// The running entry's name; click or press to rename it in place.
private struct RenameRow: View {
    @Bindable var model: TimerModel
    @State private var editing = false
    @State private var name = ""
    @State private var cancelled = false
    @FocusState private var focused: Bool

    var body: some View {
        if editing {
            TextField("Task name", text: $name)
                .textFieldStyle(.plain)
                .focused($focused)
                .field(focused: focused)
                .onAppear { focused = true }
                .onSubmit(finish)
                // Escape dismisses the whole panel, and the blur that follows
                // would commit the edit it was pressed to abandon. Closing the
                // panel is not confirmation, so a rename left this way is
                // discarded rather than written — the flag is what tells the
                // two apart, and `onDisappear` is what sets it.
                .onDisappear { cancelled = true }
                .onChange(of: focused) { _, has in
                    if !has { cancelled ? reset() : finish() }
                }
        } else {
            Button {
                name = model.running?.taskName ?? ""
                cancelled = false
                editing = true
            } label: {
                Hovering { on in
                    HStack(spacing: 6) {
                        Text(name.isEmpty ? "Untitled" : name)
                            .role(.text)
                            .foregroundStyle(name.isEmpty ? Tokens.Dark.textSubtle : Tokens.Dark.textStrong)
                            .lineLimit(1)
                        Image(systemName: "pencil")
                            .font(.system(size: 10))
                            .foregroundStyle(Tokens.Dark.textSubtle)
                            .opacity(on ? 1 : 0)
                    }
                }
            }
            .buttonStyle(.panel)
            .panelFocus()
            .accessibilityLabel("Rename task")
            .onAppear { name = model.running?.taskName ?? "" }
            .onChange(of: model.running?.taskName) { _, new in name = new ?? "" }
        }
    }

    private func finish() {
        guard editing else { return }
        editing = false
        Task { await model.rename(to: name) }
    }

    /// No request, not even a PATCH of the unchanged value: an abandoned edit
    /// must leave no trace in a billing record.
    private func reset() {
        guard editing else { return }
        editing = false
        cancelled = false
        name = model.running?.taskName ?? ""
    }
}

private struct RunawayNotice: View {
    let hours: Double

    var body: some View {
        Text("Running over \(hours.formatted()) hours. Check it in the app before invoicing.")
            .role(.body)
            .foregroundStyle(Tokens.Dark.warning)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Tokens.Dark.bgElevated)
            .overlay(alignment: .top) { rule }
    }
}

/// The project as a menu: the client's colour, the name, a caret.
private struct ProjectPicker: View {
    @Bindable var model: TimerModel

    var body: some View {
        Menu {
            Button("No project") { model.projectID = nil }
            if !model.projects.isEmpty { Divider() }
            ForEach(model.projects) { project in
                Button(project.name) { model.projectID = project.id }
            }
        } label: {
            HStack(spacing: 6) {
                // An image, because a menu label drops shapes.
                if let hex = model.projectID.flatMap({ model.projectColors[$0] }) {
                    Image(nsImage: pipImage(fill: NSColor(Color(hex: hex)), diameter: 8, box: 8))
                }
                Text(model.projectName)
                    .role(.body)
                    .foregroundStyle(model.projectID == nil ? Tokens.Dark.textSubtle : Tokens.Dark.textPrimary)
                    .lineLimit(1)
                Image(systemName: "chevron.down")
                    .font(.system(size: 8, weight: .medium))
                    .foregroundStyle(Tokens.Dark.textSubtle)
            }
            .padding(.horizontal, 8)
            .padding(.vertical, 5)
            .background(Tokens.Dark.bgPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 7))
            .overlay(RoundedRectangle(cornerRadius: 7).strokeBorder(Tokens.Dark.borderSubtle))
        }
        .menuStyle(.button)
        .buttonStyle(PanelButtonStyle(shape: RoundedRectangle(cornerRadius: 7)))
        .menuIndicator(.hidden)
        .fixedSize()
        .panelFocus(RoundedRectangle(cornerRadius: 7))
    }
}

/// One finished entry, and the way to pick that work back up.
///
/// **The whole row is the control.** The glyph appears under the pointer to
/// say what the click does, not to be aimed at.
///
/// Resuming starts NEW work carrying this entry's name, project and billable
/// answer. It never reopens the original row: a finished entry is a record.
private struct EntryRow: View {
    let entry: TimeEntry
    var resume: () -> Void

    var body: some View {
        Button(action: resume) {
            Hovering { on in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(entry.taskName.isEmpty ? "Untitled" : entry.taskName)
                        .role(.body)
                        .foregroundStyle(entry.taskName.isEmpty ? Tokens.Dark.textSubtle : Tokens.Dark.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Image(systemName: "play.fill")
                        .font(.system(size: 9))
                        .foregroundStyle(Tokens.Dark.textSubtle)
                        .opacity(on ? 1 : 0)
                    Text(format(entry.durationSeconds ?? 0))
                        .role(.duration)
                        .foregroundStyle(Tokens.Dark.textMuted)
                        .layoutPriority(1)
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(on ? Tokens.Dark.bgHover : .clear)
            }
        }
        .buttonStyle(PanelButtonStyle(shape: Rectangle()))
        // Flush to the panel's edges, so the ring sits inside rather than
        // over the rows above and below.
        .panelFocus(Rectangle(), inset: -1)
        .accessibilityLabel("Start \(entry.taskName.isEmpty ? "untitled entry" : entry.taskName) again")
    }
}

/// The round transport: accent to start, neutral to stop.
private struct TransportButton: View {
    @Bindable var model: TimerModel

    var body: some View {
        Button {
            Task { await model.toggle() }
        } label: {
            Image(systemName: model.isRunning ? "stop.fill" : "play.fill")
                .font(.system(size: 13))
                .foregroundStyle(model.isRunning ? Tokens.Dark.textPrimary : Tokens.Dark.textOnAccent)
                // The triangle's side bearings sit it left of centre.
                .padding(.leading, model.isRunning ? 0 : 2)
                .frame(width: 38, height: 38)
                .background(model.isRunning ? Tokens.Dark.bgElevated : Tokens.Dark.accentDefault)
                .clipShape(Circle())
        }
        .buttonStyle(PanelButtonStyle(shape: Circle()))
        .panelFocus(Circle())
        .disabled(model.isBusy)
        .opacity(model.isBusy ? 0.6 : 1)
        .accessibilityLabel(model.isRunning ? "Stop timer" : "Start timer")
    }
}

private struct SignInPanel: View {
    @Bindable var model: TimerModel
    @State private var email = ""
    @State private var code = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?
    @FocusState private var focus: Field?
    private enum Field { case email, code }

    private var codeReady: Bool { code.filter(\.isNumber).count == 6 }

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(sent ? "Sent to \(email)." : "We'll email you a six-digit code.")
                .role(.body)
                .foregroundStyle(Tokens.Dark.textMuted)
                .fixedSize(horizontal: false, vertical: true)

            if sent {
                // No placeholder: digits in a digits-only field read as a value.
                TextField("", text: $code)
                    .textFieldStyle(.plain)
                    .focused($focus, equals: .code)
                    .multilineTextAlignment(.center)
                    .field(focused: focus == .code, role: .code)
                    .onChange(of: code) { _, entered in
                        // Shown as xxx-xxx; the hyphen is display only, so a
                        // pasted 392481 lands as 392-481.
                        let digits = String(entered.filter(\.isNumber).prefix(6))
                        let shown = digits.count > 3
                            ? "\(digits.prefix(3))-\(digits.dropFirst(3))"
                            : digits
                        if shown != entered { code = shown }
                        if digits.count == 6 { verify() }
                    }
                    .onSubmit(verify)
                Button(busy ? "Signing in…" : "Sign in", action: verify)
                    .buttonStyle(.primary)
                    .panelFocus(RoundedRectangle(cornerRadius: 8))
                    .disabled(busy || !codeReady)
                Button("Use a different email") {
                    sent = false
                    code = ""
                    error = nil
                }
                .buttonStyle(.tertiary)
                .panelFocus(RoundedRectangle(cornerRadius: 4))
            } else {
                TextField("you@example.com", text: $email)
                    .textFieldStyle(.plain)
                    .focused($focus, equals: .email)
                    .field(focused: focus == .email)
                    .onSubmit(request)
                Button(busy ? "Sending…" : "Email me a code", action: request)
                    .buttonStyle(.primary)
                    .panelFocus(RoundedRectangle(cornerRadius: 8))
                    .disabled(busy || email.isEmpty)
            }

            if let error {
                Text(error)
                    .role(.body)
                    .foregroundStyle(Tokens.Dark.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }

            rule
            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.tertiary)
                .panelFocus(RoundedRectangle(cornerRadius: 4))
        }
        .padding(14)
        .defaultFocus($focus, sent ? .code : .email)
        .onDisappear {
            focus = nil
            NSApp.keyWindow?.makeFirstResponder(nil)
        }
        .onChange(of: sent) { _, isSent in focus = isSent ? .code : .email }
    }

    private func verify() {
        guard !busy, codeReady else { return }
        run {
            try await model.signIn(withCode: code, email: email.trimmingCharacters(in: .whitespaces))
        } onError: { code = "" }
    }

    private func request() {
        run {
            try await model.requestLink(email: email.trimmingCharacters(in: .whitespaces))
            sent = true
        }
    }

    private func run(_ work: @escaping () async throws -> Void, onError: @escaping () -> Void = {}) {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do { try await work() } catch {
                self.error = error.localizedDescription
                onError()
            }
        }
    }
}

// MARK: - Primitives

/// A hairline in `borderSubtle`.
private var rule: some View {
    Rectangle().fill(Tokens.Dark.borderSubtle).frame(height: 1)
}

/// A 28pt header glyph that brightens under the pointer.
private struct IconGlyph: View {
    let symbol: String
    init(_ symbol: String) { self.symbol = symbol }

    var body: some View {
        Hovering { on in
            Image(systemName: symbol)
                .font(.system(size: 12, weight: .light))
                .foregroundStyle(on ? Tokens.Dark.textPrimary : Tokens.Dark.textSubtle)
                .frame(width: 28, height: 28)
                .background(on ? Tokens.Dark.bgHover : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }
}

/// Tracks the pointer so a row can draw its hover state.
private struct Hovering<Content: View>: View {
    @State private var on = false
    @ViewBuilder let content: (Bool) -> Content

    var body: some View {
        content(on)
            .onHover { on = $0 }
            .animation(.easeOut(duration: 0.12), value: on)
    }
}

/// A neutral focus ring outside `shape` — `borderFocus`, never the accent.
///
/// **The `FocusState` lives here, not in a `ButtonStyle`.** A style's
/// `@Environment(\.isFocused)` reads the environment at the style's own
/// position rather than the control's focus, so it never turns on. A
/// modifier that declares the state and attaches `.focused()` does.
///
/// `focusEffectDisabled` is local: applied at the root it suppresses the
/// effect for every descendant.
private struct PanelFocus<S: Shape>: ViewModifier {
    let shape: S
    /// How far the ring sits outside the control. Pulled in where a control
    /// is flush against the panel edge.
    var inset: CGFloat = 3
    @FocusState private var focused: Bool

    func body(content: Content) -> some View {
        content
            .focused($focused)
            .focusEffectDisabled()
            .overlay(
                shape
                    .stroke(focused ? Tokens.Dark.borderFocus : .clear, lineWidth: 2)
                    .padding(-inset)
            )
    }
}

extension View {
    /// The panel's focus ring. Every keyboard-reachable control takes it —
    /// `Menu` included, which handles its own keys and needs only the ring.
    func panelFocus(_ shape: some Shape = RoundedRectangle(cornerRadius: 6), inset: CGFloat = 3) -> some View {
        modifier(PanelFocus(shape: shape, inset: inset))
    }
}

/// No bezel, and a press that reads. Focus is `panelFocus`'s job.
struct PanelButtonStyle<S: Shape>: ButtonStyle {
    let shape: S

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(shape)
            .opacity(configuration.isPressed ? 0.7 : 1)
    }
}

/// Full width, accent when enabled. Disabled is a different inert control,
/// never a faded accent: `bgActive` + `textMuted` holds 4.43:1.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TypeRole.button.font)
            .frame(maxWidth: .infinity, minHeight: 34)
            .foregroundStyle(enabled ? Tokens.Dark.textOnAccent : Tokens.Dark.textMuted)
            .background(enabled ? Tokens.Dark.accentDefault : Tokens.Dark.bgActive)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .opacity(configuration.isPressed ? 0.85 : 1)
    }
}

/// A text link: no fill, muted, brighter under the pointer.
struct TertiaryButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        Hovering { on in
            configuration.label
                .font(TypeRole.body.font)
                .foregroundStyle(on ? Tokens.Dark.textPrimary : Tokens.Dark.textMuted)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .contentShape(Rectangle())
        }
    }
}

extension ButtonStyle where Self == PanelButtonStyle<RoundedRectangle> {
    static var panel: Self { .init(shape: RoundedRectangle(cornerRadius: 6)) }
}
extension ButtonStyle where Self == PrimaryButtonStyle {
    static var primary: Self { .init() }
}
extension ButtonStyle where Self == TertiaryButtonStyle {
    static var tertiary: Self { .init() }
}

/// A text field per the spec: `bgPrimary`, 8pt radius, 34pt tall, and a
/// border that thickens to `borderFocus` — a ring change, never a fill change.
private struct FieldStyle: ViewModifier {
    let focused: Bool
    let role: TypeRole

    func body(content: Content) -> some View {
        content
            .font(role.font)
            .tracking(role.tracking)
            .foregroundStyle(Tokens.Dark.textStrong)
            .padding(.horizontal, 10)
            .frame(height: 34)
            .background(Tokens.Dark.bgPrimary)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .overlay(
                RoundedRectangle(cornerRadius: 8).strokeBorder(
                    focused ? Tokens.Dark.borderFocus : Tokens.Dark.borderDefault,
                    lineWidth: focused ? 2 : 1
                )
            )
    }
}

private extension View {
    func field(focused: Bool, role: TypeRole = .text) -> some View {
        modifier(FieldStyle(focused: focused, role: role))
    }
}

// MARK: - Type

/// The type scale as the panel uses it. A view names a role; it never
/// assembles one.
///
/// Three cases are a generated role verbatim. The other six are that role
/// resampled at a panel size: 320pt of menu bar is a denser context than a
/// web page, so `readout` is 26 where `type.timer` is 24 and `label` is 10
/// where `type.label` is 11. Tracking is re-derived from the token's own em
/// ratio rather than restated, so a tracking change in `tokens.json` still
/// reaches here — only the size is local.
enum TypeRole {
    case readout, text, body, stat, meta, duration, label, button, code

    var token: Typography.Role {
        switch self {
        case .readout: Typography.timer.at(26)
        case .text: Typography.control
        case .body: Typography.support
        case .stat: Typography.amount
        case .meta: Typography.meta.at(11)
        case .duration: Typography.duration.at(12)
        case .label: Typography.label.at(10)
        case .button: Typography.control.at(14, weight: .medium)
        // The six-digit field sets digits apart to be read back aloud, which
        // is wider than any role on the scale.
        case .code: Typography.wordmark.at(17, tracking: 0.218)
        }
    }

    var font: Font { token.font }
    var tracking: CGFloat { token.tracking }
    var uppercase: Bool { token.uppercase }
}

extension Text {
    func role(_ role: TypeRole) -> some View {
        font(role.font)
            .tracking(role.tracking)
            .monospacedDigit()
            .textCase(role.uppercase ? .uppercase : nil)
    }
}
