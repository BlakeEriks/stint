import SwiftUI

/// The panel: start, stop, name the task, pick the project. Everything else
/// is behind Open Stint. `docs/design/menubar.html` is the spec.
struct ContentView: View {
    @Bindable var model: TimerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            PanelHeader(model: model)
            if model.isSignedIn {
                TimerPanel(model: model)
            } else {
                SignInPanel(model: model)
            }
        }
        .frame(width: 320)
        // Sized before first paint: the panel hangs from the bar, so a height
        // that settles later moves the whole window.
        .fixedSize(horizontal: false, vertical: true)
        .background(Tokens.Dark.bgBase)
        // The system ring is blue and square; every control draws its own.
        .focusEffectDisabled()
    }
}

private struct PanelHeader: View {
    @Bindable var model: TimerModel
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        HStack(spacing: 2) {
            Lockup(size: 17, color: Tokens.Dark.textMuted)
            Spacer()
            if model.isSignedIn {
                Button {
                    openURL(Config.appURL)
                    dismiss()
                    NSApp.hide(nil)
                } label: {
                    IconGlyph("arrow.up.forward.app")
                }
                .buttonStyle(.panel)
                .accessibilityLabel("Open Stint")

                Menu {
                    if let email = model.email { Text(email) }
                    Button("Sign out") { Task { await model.signOut() } }
                    Divider()
                    Button("Quit Stint") { NSApp.terminate(nil) }
                } label: {
                    IconGlyph("gearshape")
                }
                .menuStyle(.button)
                .buttonStyle(.panel)
                .menuIndicator(.hidden)
                .fixedSize()
                .accessibilityLabel("Account")
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 8)
        .padding(.vertical, 6)
        .background(Tokens.Dark.bgRecessed)
        .overlay(alignment: .bottom) { rule }
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
            if !model.today.isEmpty, !model.exceedsThreshold {
                rule
                entries
            }
        }
        .defaultFocus($taskFocused, true)
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
            ProjectPicker(model: model)
                .padding(.top, 4)
                .padding(.leading, 11)
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
            Text(model.isRunning ? "Earlier today" : "Today")
                .role(.label)
                .foregroundStyle(Tokens.Dark.textSubtle)
                .padding(.horizontal, 14)
                .padding(.top, 10)
                .padding(.bottom, 6)
            ForEach(model.today) { entry in
                EntryRow(entry: entry)
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
    @FocusState private var focused: Bool

    var body: some View {
        if editing {
            TextField("Task name", text: $name)
                .textFieldStyle(.plain)
                .focused($focused)
                .field(focused: focused)
                .onAppear { focused = true }
                .onSubmit(finish)
                .onChange(of: focused) { _, has in if !has { finish() } }
        } else {
            Button {
                name = model.running?.taskName ?? ""
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
    }
}

private struct EntryRow: View {
    let entry: TimeEntry

    var body: some View {
        Hovering { on in
            HStack(alignment: .firstTextBaseline, spacing: 8) {
                Text(entry.taskName.isEmpty ? "Untitled" : entry.taskName)
                    .role(.body)
                    .foregroundStyle(entry.taskName.isEmpty ? Tokens.Dark.textSubtle : Tokens.Dark.textPrimary)
                    .lineLimit(1)
                Spacer(minLength: 8)
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
                    .disabled(busy || !codeReady)
                Button("Use a different email") {
                    sent = false
                    code = ""
                    error = nil
                }
                .buttonStyle(.tertiary)
            } else {
                TextField("you@example.com", text: $email)
                    .textFieldStyle(.plain)
                    .focused($focus, equals: .email)
                    .field(focused: focus == .email)
                    .onSubmit(request)
                Button(busy ? "Sending…" : "Email me a code", action: request)
                    .buttonStyle(.primary)
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
        }
        .padding(14)
        .defaultFocus($focus, sent ? .code : .email)
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

/// A neutral focus ring outside `shape`, `borderFocus` and never the accent.
private struct FocusRing<S: Shape>: ViewModifier {
    let shape: S
    let on: Bool

    func body(content: Content) -> some View {
        content.overlay(
            shape.stroke(on ? Tokens.Dark.borderFocus : .clear, lineWidth: 2).padding(-3)
        )
    }
}

/// No bezel; a ring when focused. `Button` supplies Tab, Space and Return.
struct PanelButtonStyle<S: Shape>: ButtonStyle {
    let shape: S
    @Environment(\.isFocused) private var focused

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .contentShape(shape)
            .opacity(configuration.isPressed ? 0.7 : 1)
            .modifier(FocusRing(shape: shape, on: focused))
    }
}

/// Full width, accent when enabled. Disabled is a different inert control,
/// never a faded accent: `bgActive` + `textMuted` holds 4.43:1.
struct PrimaryButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    @Environment(\.isFocused) private var focused

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .font(TypeRole.button.font)
            .frame(maxWidth: .infinity, minHeight: 34)
            .foregroundStyle(enabled ? Tokens.Dark.textOnAccent : Tokens.Dark.textMuted)
            .background(enabled ? Tokens.Dark.accentDefault : Tokens.Dark.bgActive)
            .clipShape(RoundedRectangle(cornerRadius: 8))
            .opacity(configuration.isPressed ? 0.85 : 1)
            .modifier(FocusRing(shape: RoundedRectangle(cornerRadius: 8), on: focused))
    }
}

/// A text link: no fill, muted, brighter under the pointer.
struct TertiaryButtonStyle: ButtonStyle {
    @Environment(\.isFocused) private var focused

    func makeBody(configuration: Configuration) -> some View {
        Hovering { on in
            configuration.label
                .font(TypeRole.body.font)
                .foregroundStyle(on ? Tokens.Dark.textPrimary : Tokens.Dark.textMuted)
                .padding(.horizontal, 4)
                .padding(.vertical, 2)
                .contentShape(Rectangle())
                .modifier(FocusRing(shape: RoundedRectangle(cornerRadius: 4), on: focused))
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

/// The type scale, mirrored from `tokens.json` until `pnpm tokens` emits it.
/// A view names a role; it never assembles one.
enum TypeRole {
    case readout, text, body, stat, meta, duration, label, button, code

    var font: Font {
        switch self {
        case .readout: Self.mono(26, .medium)
        case .text: Self.sans(14)
        case .body: Self.sans(13)
        case .stat: Self.mono(15)
        case .meta: Self.mono(11)
        case .duration: Self.mono(12)
        case .label: Self.mono(10, .medium)
        case .button: Self.sans(14, .medium)
        case .code: Self.mono(17, .medium)
        }
    }

    var tracking: CGFloat {
        switch self {
        case .readout: -0.5
        case .label: 1.6
        case .code: 3.7
        default: 0
        }
    }

    var uppercase: Bool { self == .label }

    // The spec's faces are IBM Plex; these two lines are where that lands
    // once the fonts ship with the app.
    private static func sans(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }
    private static func mono(_ size: CGFloat, _ weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight, design: .monospaced)
    }
}

extension Text {
    func role(_ role: TypeRole) -> some View {
        font(role.font)
            .tracking(role.tracking)
            .monospacedDigit()
            .textCase(role.uppercase ? .uppercase : nil)
    }
}
