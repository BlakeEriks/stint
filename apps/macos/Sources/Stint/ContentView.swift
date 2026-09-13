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
        .background(Tokens.Dark.bgPrimary)
    }
}

private struct TimerPanel: View {
    @Bindable var model: TimerModel
    @State private var taskDraft = ""
    @FocusState private var taskFocused: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            readout

            if model.exceedsThreshold {
                RunawayNotice()
            }

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
                // straight to Stop should not lose what was typed.
                .onChange(of: taskFocused) { _, focused in
                    if !focused { commit() }
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
        .onAppear { taskDraft = model.running?.taskName ?? model.draftTaskName }
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
            HStack(spacing: 5) {
                Image(systemName: model.isRunning ? "stop.fill" : "play.fill")
                    .font(.system(size: 10))
                Text(model.isRunning ? "Stop" : "Start")
                    .font(.system(size: 12, weight: .medium))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 7)
            // Never white on the accent — 1.37:1. `textOnAccent` is the
            // near-black the token package exists to enforce, and CI guards
            // this exact pairing on the web.
            .foregroundStyle(
                model.isRunning ? Tokens.Dark.textStrong : Tokens.Dark.textOnAccent
            )
            .background(model.isRunning ? Tokens.Dark.bgHover : Tokens.Dark.accentDefault)
            .clipShape(RoundedRectangle(cornerRadius: 6))
        }
        .buttonStyle(.plain)
        .disabled(model.isBusy)
        .opacity(model.isBusy ? 0.6 : 1)
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
    @State private var link = ""
    @State private var sent = false
    @State private var busy = false
    @State private var error: String?

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            Text("Sign in to Stint")
                .font(.system(size: 14, weight: .semibold))
                .foregroundStyle(Tokens.Dark.textStrong)

            if !sent {
                Text("We'll email you a sign-in link.")
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.textSubtle)

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
                Text("Check your email, then paste the whole link here.")
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.textSubtle)
                    .fixedSize(horizontal: false, vertical: true)

                TextField("Paste the sign-in link", text: $link)
                    .textFieldStyle(.plain)
                    .font(.system(size: 12))
                    .foregroundStyle(Tokens.Dark.textStrong)
                    .padding(.horizontal, 10)
                    .padding(.vertical, 7)
                    .background(Tokens.Dark.bgElevated)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
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
                .disabled(busy || link.isEmpty)

                Button("Use a different email") {
                    sent = false
                    link = ""
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

    private func verify() {
        busy = true
        error = nil
        Task {
            defer { busy = false }
            do {
                try await model.signIn(withLink: link)
            } catch {
                self.error = error.localizedDescription
            }
        }
    }
}
