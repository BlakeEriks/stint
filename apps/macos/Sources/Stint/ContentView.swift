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
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(Tokens.Dark.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .focused($taskFocused)
                    .onSubmit { commit() }
                    // Committing on blur as well: typing a name and clicking
                    // straight to Start should not lose what was typed.
                    .onChange(of: taskFocused) { _, focused in
                        if !focused { commit() }
                    }
            }

            ProjectField(model: model)

            HStack(spacing: 8) {
                StartStopButton(model: model)
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
    private var readout: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(model.isRunning ? format(model.elapsedSeconds) : format(model.todaySeconds))
                .font(.system(size: 30, weight: .medium, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(
                    model.isRunning ? Tokens.Dark.accentDefault : Tokens.Dark.textStrong
                )
                .contentTransition(.numericText())

            Text(model.isRunning ? "running" : "logged today")
                .font(.system(size: 11))
                .textCase(.uppercase)
                .tracking(0.6)
                .foregroundStyle(Tokens.Dark.textSubtle)
        }
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
        .disabled(model.isBusy)
        .opacity(model.isBusy ? 0.6 : 1)
        .accessibilityLabel(model.isRunning ? "Stop timer" : "Start timer")
    }
}

private struct OpenAppButton: View {
    @Environment(\.openURL) private var openURL

    var body: some View {
        Button {
            openURL(Config.appURL)
        } label: {
            Text("Open Stint")
                .font(.system(size: 12))
                .foregroundStyle(Tokens.Dark.textMuted)
        }
        .buttonStyle(.plain)
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
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Lockup(expanded: true, size: 17)
                .padding(.bottom, 2)

            Text("Sign in to keep tracking from the menu bar.")
                .font(.system(size: 11))
                .foregroundStyle(Tokens.Dark.textSubtle)
                .fixedSize(horizontal: false, vertical: true)

            if !sent {
                TextField("you@example.com", text: $email)
                    .textFieldStyle(.plain)
                    .font(.system(size: 13))
                    .foregroundStyle(Tokens.Dark.textStrong)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(Tokens.Dark.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .onSubmit { request() }

                Button(action: request) {
                    Text(busy ? "Sending…" : "Email me a sign-in link")
                        .font(.system(size: 12, weight: .medium))
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 7)
                        .foregroundStyle(Tokens.Dark.textOnAccent)
                        .background(Tokens.Dark.accentDefault)
                        .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .disabled(busy || email.isEmpty)
            } else {
                Text("We sent a six-digit code to \(email).")
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.textSubtle)
                    .fixedSize(horizontal: false, vertical: true)

                /* A code, typed. No link to paste and no scheme to hand off:
                   a magic link has to reach a different application than the
                   one that opened it, and every way of doing that is either
                   insecure (the clipboard) or silently refused (a browser
                   following a redirect into a custom scheme). */
                TextField("000000", text: $code)
                    .textFieldStyle(.plain)
                    .font(.system(size: 20, weight: .medium, design: .monospaced))
                    .tracking(6)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Tokens.Dark.textStrong)
                    .padding(.vertical, 8)
                    .background(Tokens.Dark.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                    .onChange(of: code) { _, entered in
                        // Digits only, six of them: a pasted code often
                        // arrives with a space or a stray character.
                        let digits = String(entered.filter(\.isNumber).prefix(6))
                        if digits != entered { code = digits }
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
                .disabled(busy || code.count < 6)

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
    }

    private func verify() {
        guard !busy, code.count == 6 else { return }
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
