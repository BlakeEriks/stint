import SwiftUI

/// The panel behind the menu bar item.
///
/// This is the web app's timer bar and nothing else: start, stop, name the
/// task, pick the project. `principles.md` scopes the Mac app to "menu bar
/// presence" and warns that neither native app should grow into a port — so
/// entries, invoices and the calendar stay in the browser, and the button at
/// the foot of this panel is how you get to them.
struct ContentView: View {
    @Bindable var model: TimerModel

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if model.isSignedIn {
                TimerPanel(model: model)
            } else {
                SignInPanel(model: model)
            }
        }
        .frame(width: 320)
        /* Height is resolved in one pass, before the window is shown.
           `MenuBarExtra(.window)` sizes its panel to the content and anchors
           it under the menu bar, so a height that changes after first paint
           moves the whole panel — it appeared low and snapped upward. The
           cause was state settling during the first layout (the task field
           seeding itself, conditional rows appearing); `fixedSize` makes the
           view state its own height up front instead of growing into it. */
        .fixedSize(horizontal: false, vertical: true)
        .background(Tokens.Dark.bgPrimary)
    }
}

private struct TimerPanel: View {
    @Bindable var model: TimerModel
    @FocusState private var taskFocused: Bool

    /* Seeded at construction rather than in `onAppear`. Assigning it on
       appear mutated state during the first layout, which resized the panel
       after it was already on screen. */
    @State private var taskDraft: String

    init(model: TimerModel) {
        self.model = model
        _taskDraft = State(initialValue: model.running?.taskName ?? model.draftTaskName)
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            readout

            if model.exceedsThreshold {
                RunawayNotice()
            }

            /* Running and idle are two arrangements, not one layout with
               things hidden — the same split the web app makes, and for the
               same reason. Idle is a COMPOSING row: the field is the subject
               and you type into it. Running is a READOUT: the task already
               has a name, so showing an empty "What are you working on?"
               beneath a counting clock asks a question that has been
               answered. */
            if model.isRunning {
                RunningRow(
                    model: model,
                    name: $taskDraft,
                    focused: $taskFocused,
                    onCommit: commit
                )
            } else {
                TextField("What are you working on?", text: $taskDraft)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundStyle(Tokens.Dark.textStrong)
                    .focused($taskFocused)
                    .fieldStyle(focused: taskFocused)
                    .onSubmit { commit() }
                    // Committing on blur as well: typing a name and clicking
                    // straight to Start should not lose what was typed.
                    .onChange(of: taskFocused) { _, focused in
                        if !focused { commit() }
                    }
            }

            ProjectField(model: model)

            HStack(spacing: 8) {
                // Start only: stopping now lives beside the clock.
                if !model.isRunning { StartStopButton(model: model) }
                Spacer()
                OpenAppButton()
            }

            if let error = model.errorMessage {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider().overlay(Tokens.Dark.borderSubtle)

            AccountRow(model: model)
        }
        .padding(14)
        /* One focus section, so Tab moves BETWEEN these controls.
           `focusable()` alone makes a view a focus target without joining any
           ring — which is how focus landed on the stop button and then had
           nowhere to go, since Tab had no next element to move to. */
        .focusSection()
        /* The caret goes to the task field on every open.
           `MenuBarExtra` rebuilds its content each time the panel opens, so
           this runs per open rather than once — which is what makes the panel
           worth opening with the keyboard: type, hit Return, the timer runs.

           The delay is required, not defensive: focusing in the same turn as
           the view appearing is silently dropped, which is the usual reason
           `@FocusState` looks broken.

           Only when nothing is RUNNING. A running entry shows its name as
           text with a pencil, so there is no field to focus, and stealing the
           caret would put it somewhere invisible. */
        .task {
            guard !model.isRunning else { return }
            try? await Task.sleep(for: .milliseconds(120))
            taskFocused = true
        }
        // Follow the server when a timer starts or stops elsewhere, but never
        // while the field has focus — overwriting what someone is typing is
        // the worst possible moment to reconcile.
        .onChange(of: model.running?.id) { _, _ in
            if !taskFocused { taskDraft = model.running?.taskName ?? "" }
        }
    }

    private func commit() {
        if model.isRunning {
            Task { await model.rename(to: taskDraft) }
        } else {
            model.draftTaskName = taskDraft
        }
    }

    /// The elapsed time, or today's total when nothing is running.
    ///
    /// The accent is spent here and only here: a running timer is the one
    /// thing in this app the colour is allowed to mean.
    /// The clock and, while running, its control — always adjacent.
    ///
    /// The stop button belongs beside the number it stops. Down in the action
    /// row it sat where the Start pill lives, which is the wrong place twice
    /// over: it is round and small, so it read as a leftover rather than the
    /// primary control, and it was the furthest thing in the panel from the
    /// time it acts on. `timer-bar.tsx` groups them for the same reason.
    private var readout: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 2) {
                Text(model.isRunning ? format(model.elapsedSeconds) : format(model.todaySeconds))
                    .font(.system(size: 30, weight: .medium, design: .monospaced))
                    .monospacedDigit()
                    .foregroundStyle(
                        model.isRunning ? Tokens.Dark.accentDefault : Tokens.Dark.textStrong
                    )
                    .contentTransition(.numericText())

                /* Only when STOPPED. A green clock counting up already says
                   "running" — the word restated it and, being below the
                   number, pushed the stop button out of line with the digits
                   it belongs to. Stopped is the ambiguous case: `0:00:00` in
                   white needs to say what it is a total of. */
                if !model.isRunning {
                    Text("logged today")
                        .font(.system(size: 11))
                        .textCase(.uppercase)
                        .tracking(0.6)
                        .foregroundStyle(Tokens.Dark.textSubtle)
                }
            }

            if model.isRunning {
                /* Directly beside the number, NOT pushed to the far edge.
                   A `Spacer` here put the control in the top-right corner,
                   which reads as a window button rather than this clock's
                   control — the web app keeps them adjacent so they are one
                   object. The trailing Spacer holds the pair to the left so
                   the panel's left edge stays the alignment for everything. */
                StartStopButton(model: model)
                Spacer(minLength: 0)
            }
        }
    }
}

/// The panel's field styling, focus ring included.
///
/// Matches the web app's `inputClass`: a border that brightens to
/// `border-focus` plus a 3px ring of the same colour. The macOS caret alone
/// is a 1px line at the left edge of a dark box — technically present,
/// invisible in practice, and on a panel that opens under the cursor there is
/// nothing else to say where typing will go.
///
/// **Neutral, never the accent.** `CLAUDE.md`: a focus ring is constant and
/// involuntary, so spending the accent there drowns the one signal it exists
/// for — the running timer.
private struct Field: ViewModifier {
    var focused: Bool

    func body(content: Content) -> some View {
        content
            .padding(.horizontal, 10)
            .padding(.vertical, 7)
            .background(Tokens.Dark.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            .overlay(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
                    .stroke(
                        focused ? Tokens.Dark.borderFocus : Tokens.Dark.borderDefault,
                        lineWidth: 1
                    )
            )
            // The ring sits outside the border, so the two read as one
            // thickening edge rather than two concentric outlines.
            .overlay(
                RoundedRectangle(cornerRadius: 8, style: .continuous)
                    .stroke(
                        focused ? Tokens.Dark.borderFocus.opacity(0.4) : .clear,
                        lineWidth: 3
                    )
                    .padding(-2)
            )
            .animation(.easeOut(duration: 0.12), value: focused)
    }
}

extension View {
    /// A panel input, showing whether it has the keyboard.
    func fieldStyle(focused: Bool) -> some View { modifier(Field(focused: focused)) }
}

/// A button that shows where the keyboard is.
///
/// `.buttonStyle(.plain)` is what the panel's buttons need visually — none of
/// them want AppKit's bezel — but it also drops the focus ring, so a Tab that
/// lands on one is invisible. This puts the ring back without the bezel.
///
/// **Tab reaching a button at all is a system setting**, not something an app
/// controls: with "Keyboard navigation" off (the macOS default) the Tab order
/// holds text fields only, in every app. This makes the app correct for people
/// who have it on rather than pretending to fix it for those who do not.
private struct Focusable<S: InsettableShape>: ViewModifier {
    var shape: S
    @FocusState private var focused: Bool

    func body(content: Content) -> some View {
        content
            .focusable()
            .focused($focused)
            /* AppKit's own ring is a blue rounded rectangle that ignores the
               control's shape — on the round stop button it drew a square
               around a circle, in a blue that appears nowhere else in the
               app. Ours is neutral and takes the shape it is given. */
            .focusEffectDisabled()
            .overlay(
                shape
                    .stroke(
                        focused ? Tokens.Dark.borderFocus : .clear,
                        lineWidth: 2
                    )
                    .padding(-3)
            )
    }
}

extension View {
    /// Keyboard-reachable, with a ring that says so.
    func keyboardReachable<S: InsettableShape>(
        shape: S = RoundedRectangle(cornerRadius: 6, style: .continuous)
    ) -> some View {
        modifier(Focusable(shape: shape))
    }
}

/// What is running: a dot, the task name, and a pencil to rename it.
///
/// A readout, not a form. The entry already has a name, so the idle field's
/// "What are you working on?" would be asking a question that has been
/// answered — and an empty box under a counting clock reads as though the
/// timer lost track of what it is timing.
///
/// The pencil is the affordance rather than an always-editable field: renaming
/// mid-run is occasional, and a live text box invites a stray keystroke into
/// billable work.
private struct RunningRow: View {
    @Bindable var model: TimerModel
    @Binding var name: String
    @FocusState.Binding var focused: Bool
    var onCommit: () -> Void

    @State private var editing = false

    var body: some View {
        HStack(spacing: 8) {
            /* The dot is a second channel for "running", independent of
               colour — `docs/design/color.md` records that no green survives
               dichromacy, so the state cannot rest on the hue alone. */
            Circle()
                .fill(Tokens.Dark.accentDefault)
                .frame(width: 8, height: 8)

            if editing {
                TextField("Task name", text: $name)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundStyle(Tokens.Dark.textStrong)
                    .focused($focused)
                    .onSubmit {
                        onCommit()
                        editing = false
                    }
                    .onChange(of: focused) { _, isFocused in
                        // Blur commits, so clicking straight to Stop keeps
                        // what was typed.
                        if !isFocused {
                            onCommit()
                            editing = false
                        }
                    }
            } else {
                Text(name.isEmpty ? "Untitled" : name)
                    .font(.system(size: 13))
                    .foregroundStyle(
                        name.isEmpty ? Tokens.Dark.textSubtle : Tokens.Dark.textStrong
                    )
                    .lineLimit(1)
                    .truncationMode(.tail)

                Button {
                    editing = true
                    // Focus follows the mode change rather than the click, so
                    // the field is ready however editing started.
                    DispatchQueue.main.async { focused = true }
                } label: {
                    Image(systemName: "pencil")
                        .font(.system(size: 10))
                        .foregroundStyle(Tokens.Dark.textSubtle)
                }
                .buttonStyle(.plain)
                .keyboardReachable()
                .accessibilityLabel("Rename task")

                Spacer(minLength: 0)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Tokens.Dark.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

/// Past `max_timer_hours`.
///
/// It says so and stops there. The web app offers Keep / Adjust / Discard
/// because it can edit an entry; adjusting a duration needs a date and two
/// times, which is a form this panel has no room for and no business growing.
/// Surfacing without acting is the honest half — the app never trims a timer
/// on its own either way.
private struct RunawayNotice: View {
    var body: some View {
        Text("This timer has been running a long time. Check it in the app before invoicing.")
            .font(.system(size: 11))
            .foregroundStyle(Tokens.Dark.warning)
            .fixedSize(horizontal: false, vertical: true)
            .padding(.horizontal, 8)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(Tokens.Dark.bgElevated)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
}

private struct ProjectField: View {
    @Bindable var model: TimerModel

    /// The running entry's project when there is one, otherwise the draft.
    private var selection: String? {
        model.isRunning ? model.running?.projectId : model.draftProjectID
    }

    var body: some View {
        Menu {
            // "No project" is a real choice, not an absent one: `client_id`
            // null is how unbillable work is tracked, and the web app is
            // careful never to call it "internal" because it cannot know.
            Button("No project") { Task { await model.assign(projectID: nil) } }
            if !model.projects.isEmpty { Divider() }
            ForEach(model.projects) { project in
                Button(project.name) { Task { await model.assign(projectID: project.id) } }
            }
        } label: {
            HStack(spacing: 6) {
                Image(systemName: "folder")
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.textSubtle)
                Text(name(of: selection))
                    .font(.system(size: 12))
                    .foregroundStyle(
                        selection == nil ? Tokens.Dark.textSubtle : Tokens.Dark.textPrimary
                    )
                Spacer()
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9))
                    .foregroundStyle(Tokens.Dark.textSubtle)
            }
        }
        .menuStyle(.borderlessButton)
        .keyboardReachable()
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(Tokens.Dark.bgElevated)
        .clipShape(RoundedRectangle(cornerRadius: 6))
    }

    private func name(of id: String?) -> String {
        guard let id else { return "No project" }
        return model.projects.first { $0.id == id }?.name ?? "No project"
    }
}

private struct StartStopButton: View {
    @Bindable var model: TimerModel

    var body: some View {
        Button {
            Task { await model.toggle() }
        } label: {
            if model.isRunning {
                /* Round and accent while running, matching the web app. The
                   accent is already spent on the timer here, and this button
                   IS the timer's control — one meaning, shown twice, which is
                   what the rule permits. A neutral stop beside a green clock
                   read as the secondary action on the panel, which it is not:
                   stopping is the only thing you came to do. */
                Image(systemName: "stop.fill")
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.textOnAccent)
                    .frame(width: 32, height: 32)
                    .background(Tokens.Dark.accentDefault)
                    .clipShape(Circle())
            } else {
                HStack(spacing: 5) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 10))
                    Text("Start")
                        .font(.system(size: 12, weight: .medium))
                }
                .padding(.horizontal, 14)
                .padding(.vertical, 7)
                // Never white on the accent — 1.37:1. `textOnAccent` is the
                // near-black the token package exists to enforce, and CI
                // guards this exact pairing on the web.
                .foregroundStyle(Tokens.Dark.textOnAccent)
                .background(Tokens.Dark.accentDefault)
                .clipShape(RoundedRectangle(cornerRadius: 6))
            }
        }
        .buttonStyle(.plain)
        /* The ring follows the button: a circle while running, a rounded
           rectangle around the Start pill. One shape for both would be wrong
           half the time. */
        .keyboardReachable(
            shape: AnyInsettableShape(
                model.isRunning
                    ? AnyInsettableShape(Circle())
                    : AnyInsettableShape(RoundedRectangle(cornerRadius: 6, style: .continuous))
            )
        )
        .disabled(model.isBusy)
        .opacity(model.isBusy ? 0.6 : 1)
        .accessibilityLabel(model.isRunning ? "Stop timer" : "Start timer")
    }
}

private struct OpenAppButton: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        Button {
            openURL(Config.appURL)
            /* The panel is not a window, so `dismiss` alone is unreliable
               here; resigning active status is what actually closes it. */
            dismiss()
            NSApp.hide(nil)
        } label: {
            Text("Open Stint")
                .font(.system(size: 12))
                .foregroundStyle(Tokens.Dark.textMuted)
        }
        .buttonStyle(.plain)
        .keyboardReachable()
    }
}

private struct AccountRow: View {
    @Bindable var model: TimerModel

    var body: some View {
        HStack {
            Text(model.email ?? "Signed in")
                .font(.system(size: 11))
                .foregroundStyle(Tokens.Dark.textSubtle)
                .lineLimit(1)
                .truncationMode(.middle)
            Spacer()
            Button("Sign out") { Task { await model.signOut() } }
                .buttonStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(Tokens.Dark.textSubtle)
            Button("Quit") { NSApplication.shared.terminate(nil) }
                .buttonStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(Tokens.Dark.textSubtle)
        }
    }
}

/// Sign-in: request a link, paste it back.
///
/// Pasting rather than clicking, because a click opens the browser and a
/// browser cannot hand a session to an unsigned app without a registered URL
/// scheme. Saying that plainly beats a link that appears to work and leaves
/// this panel signed out.
private struct SignInPanel: View {
    @Bindable var model: TimerModel

    @State private var email = ""
    @State private var code = ""
    @State private var sent = false

    /* Which field the caret belongs in. The panel is opened to do exactly one
       thing, so landing somewhere you have to click first is a wasted step —
       and on the code screen it is worse than wasted, because the code is in
       another window and you are already typing. */
    @FocusState private var focus: Field?
    private enum Field { case email, code }
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Lockup(expanded: true, size: 17)
                .padding(.bottom, 2)

            Text("We'll email you a six-digit code.")
                .font(.system(size: 11))
                .foregroundStyle(Tokens.Dark.textSubtle)
                .fixedSize(horizontal: false, vertical: true)

            if !sent {
                TextField("you@example.com", text: $email)
                    .focused($focus, equals: .email)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundStyle(Tokens.Dark.textStrong)
                    .fieldStyle(focused: focus == .email)
                    .onSubmit { request() }

                Button(action: request) {
                    Text(busy ? "Sending…" : "Email me a code")
                        .font(.system(size: 12, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .foregroundStyle(Tokens.Dark.textOnAccent)
                        .background(Tokens.Dark.accentDefault)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .keyboardReachable()
                .disabled(busy || email.isEmpty)
            } else {
                Text("Sent to \(email).")
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.textSubtle)
                    .fixedSize(horizontal: false, vertical: true)

                /* A code, typed. No link to paste and no scheme to hand off:
                   a magic link has to reach a different application than the
                   one that opened it, and every way of doing that is either
                   insecure (the clipboard) or silently refused (a browser
                   following a redirect into a custom scheme). */
                TextField("000-000", text: $code)
                    .focused($focus, equals: .code)
                    .textFieldStyle(.plain)
                    .font(.system(size: 20, weight: .medium, design: .monospaced))
                    .tracking(6)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Tokens.Dark.textStrong)
                    .fieldStyle(focused: focus == .code)
                    .onChange(of: code) { _, entered in
                        /* Shown as xxx-xxx, matching the email, so what is on
                           screen can be compared to what was sent without
                           re-grouping it by eye. The hyphen is inserted as you
                           type and stripped before sending — it is a grouping
                           mark, not part of the code.

                           Typing over the whole field also has to work, which
                           is why this rebuilds the display from the digits
                           rather than appending to what is there. */
                        let digits = String(entered.filter(\.isNumber).prefix(6))
                        let shown = digits.count > 3
                            ? "\(digits.prefix(3))-\(digits.dropFirst(3))"
                            : digits
                        if shown != entered { code = shown }
                        // Submitting itself at six saves a keystroke on the
                        // one screen where there is nothing else to do.
                        if digits.count == 6 { verify() }
                    }
                    .onSubmit { verify() }

                Button(action: verify) {
                    Text(busy ? "Signing in…" : "Sign in")
                        .font(.system(size: 12, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .foregroundStyle(Tokens.Dark.textOnAccent)
                        .background(Tokens.Dark.accentDefault)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .keyboardReachable()
                .disabled(busy || code.filter(\.isNumber).count < 6)

                Button("Use a different email") {
                    sent = false
                    code = ""
                    error = nil
                }
                .buttonStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(Tokens.Dark.textSubtle)
            }

            if let error {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }

            Divider().overlay(Tokens.Dark.borderSubtle)

            Button("Quit") { NSApplication.shared.terminate(nil) }
                .buttonStyle(.plain)
                .font(.system(size: 11))
                .foregroundStyle(Tokens.Dark.textSubtle)
        }
        .padding(14)
        /* The panel is rebuilt every time it opens (MenuBarExtra tears its
           content down), so `task` runs on each open and the caret is always
           where the next keystroke should go.

           A beat of delay because the field does not exist yet at `task` time
           — focusing it in the same turn as the view appearing is silently
           dropped, which is the usual reason `@FocusState` "does not work". */
        .task {
            try? await Task.sleep(for: .milliseconds(120))
            focus = sent ? .code : .email
        }
        // Following the step rather than the open: asking for a code moves the
        // caret to where the code goes, so the field is ready when it arrives.
        .onChange(of: sent) { _, isSent in
            focus = isSent ? .code : .email
        }
    }

    private func verify() {
        guard !busy, code.filter(\.isNumber).count == 6 else { return }
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await model.signIn(
                    withCode: code,
                    email: email.trimmingCharacters(in: .whitespaces)
                )
            } catch {
                self.error = error.localizedDescription
                code = ""
            }
        }
    }

    private func request() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await model.requestLink(email: email.trimmingCharacters(in: .whitespaces))
                sent = true
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}

/// A type-erased `InsettableShape`, so a ring can change shape with state.
///
/// SwiftUI has `AnyShape` but not an insettable one, and `stroke` needs
/// insettable to inset the line rather than straddle the edge.
struct AnyInsettableShape: InsettableShape {
    // `@Sendable` because Shape is Sendable under Swift 6's strict
    // concurrency, and a stored closure has to carry the same guarantee.
    private let makePath: @Sendable (CGRect) -> Path
    private let makeInset: @Sendable (CGFloat) -> AnyInsettableShape

    init<S: InsettableShape>(_ shape: S) {
        makePath = { shape.path(in: $0) }
        makeInset = { AnyInsettableShape(shape.inset(by: $0)) }
    }

    func path(in rect: CGRect) -> Path { makePath(rect) }
    func inset(by amount: CGFloat) -> AnyInsettableShape { makeInset(amount) }
}
