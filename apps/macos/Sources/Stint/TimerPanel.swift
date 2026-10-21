import SwiftUI

struct TimerPanel: View {
    @Bindable var model: TimerModel
    @FocusState private var taskFocused: Bool

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
            rule
            stats
            if !model.recent.isEmpty {
                rule
                entries
            }
        }
        // Opens with nothing focused. Here rather than on `ContentView`, so
        // sign-in keeps its default focus on the email or code field.
        .background(WindowObserver.focusReset)
    }

    private var idle: some View {
        VStack(alignment: .leading, spacing: 10) {
            TextField("What are you working on?", text: $model.draftTaskName)
                .textFieldStyle(.plain)
                .focused($taskFocused)
                .field(focused: taskFocused)
                .accessibilityIdentifier("task")
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
                    .fill(Tokens.Dark.timerRunning)
                    .frame(width: 9, height: 9)
                Text(format(model.elapsedSeconds))
                    .role(.readout)
                    .foregroundStyle(Tokens.Dark.timerRunning)
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
            // Compact, so the readout is the only figure moving by the second.
            statistic("Today", value: compact(model.todaySeconds))
            Spacer(minLength: 12)
            // Absent until fetched: a zero would claim "earned nothing".
            if let stats = model.stats {
                statistic(
                    "Earned",
                    value: money(stats.earnedToday, code: stats.currency),
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
            ForEach(Array(model.recent.enumerated()), id: \.element.id) { index, name in
                RecentRow(name: name) { Task { await model.resume(name) } }
                    .accessibilityIdentifier("entry-\(index + 1)")
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
    @State private var canceled = false
    @FocusState private var focused: Bool

    var body: some View {
        if editing {
            TextField("Task name", text: $name)
                .textFieldStyle(.plain)
                .focused($focused)
                .field(focused: focused)
                .accessibilityIdentifier("rename-field")
                .onAppear { focused = true }
                .onSubmit(finish)
                // Escape dismisses the whole panel, and the blur that follows
                // would commit the edit it was pressed to abandon. Closing the
                // panel is not confirmation, so a rename left this way is
                // discarded rather than written — the flag is what tells the
                // two apart, and `onDisappear` is what sets it.
                .onDisappear { canceled = true }
                .onChange(of: focused) { _, has in
                    if !has { canceled ? reset() : finish() }
                }
        } else {
            Button {
                name = model.running?.taskName ?? ""
                canceled = false
                editing = true
            } label: {
                Hovering { on in
                    HStack(spacing: 6) {
                        Text(name.isEmpty ? "Untitled" : name)
                            .role(.text)
                            .foregroundStyle(name.isEmpty ? Tokens.Dark.textSubtle : Tokens.Dark.textStrong)
                            .lineLimit(1)
                        Image(systemName: "pencil")
                            .role(.hint)
                            .foregroundStyle(Tokens.Dark.textSubtle)
                            .opacity(on ? 1 : 0)
                    }
                }
            }
            .buttonStyle(.panel)
            .panelFocus()
            .accessibilityLabel("Rename task")
            .accessibilityIdentifier("rename")
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
        canceled = false
        name = model.running?.taskName ?? ""
    }
}

/// The project as a menu: the client's color, the name, a caret.
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
                    .role(.disclosure)
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
        .accessibilityIdentifier("project")
    }
}

/// A name worked under before, and the way to start it again — the same
/// names the web suggests, so the row carries no duration: it is not one
/// past entry.
///
/// **The whole row is the control.** The glyph appears under the pointer to
/// say what the click does, not to be aimed at.
private struct RecentRow: View {
    let name: TaskName
    var resume: () -> Void

    var body: some View {
        Button(action: resume) {
            Hovering { on in
                HStack(alignment: .firstTextBaseline, spacing: 8) {
                    Text(name.taskName)
                        .role(.body)
                        .foregroundStyle(Tokens.Dark.textPrimary)
                        .lineLimit(1)
                    Spacer(minLength: 8)
                    Image(systemName: "play.fill")
                        .role(.hint)
                        .foregroundStyle(Tokens.Dark.textSubtle)
                        .opacity(on ? 1 : 0)
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
        .accessibilityLabel("Start \(name.taskName) again")
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
                .role(.transport)
                .foregroundStyle(model.isRunning ? Tokens.Dark.textPrimary : Tokens.Dark.textOnAccent)
                // The triangle's side bearings sit it left of center.
                .padding(.leading, model.isRunning ? 0 : 2)
                .frame(width: 38, height: 38)
                .background(model.isRunning ? Tokens.Dark.bgElevated : Tokens.Dark.accentDefault)
                .clipShape(Circle())
        }
        .buttonStyle(PanelButtonStyle(shape: Circle()))
        .panelFocus(Circle())
        .accessibilityLabel(model.isRunning ? "Stop timer" : "Start timer")
        .accessibilityIdentifier("transport")
    }
}
