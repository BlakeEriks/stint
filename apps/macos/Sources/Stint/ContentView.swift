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
            PanelHeader(signedIn: model.isSignedIn, model: model)
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
        /* `bgBase`, per menubar.html — one plane deeper than the web app's
           content column. The panel floats over whatever is behind it, so it
           reads as the ground everything here sits on rather than as a card,
           and the elevated surfaces inside it (the stop button, a hovered
           row) have somewhere to rise from. */
        .background(Tokens.Dark.bgBase)
    }
}

/// Identity, on a recessed bar above both panels.
///
/// This is where identity lives now that the status item is a pip: dropping
/// the letterform from the menu bar was paid for here, where there is room
/// for a real wordmark and a 12pt glyph is not being asked to do branding.
///
/// The mark at 17pt, per `brand.html`'s placement table — it is the mark, so
/// it keeps its bounds and its one colour rather than being set as a word.
/// On `bgRecessed` so the bar itself recedes; nothing here is ever the accent.
///
/// It appears once, above both panels, which is what stops sign-in rendering
/// identity at a different size from the timer and making the two read as
/// different products.
private struct PanelHeader: View {
    /// The two ways out ride here once there is somewhere to go. Signed out
    /// there is no app to open and no account to sign out of, so the bar is
    /// identity alone.
    var signedIn: Bool
    @Bindable var model: TimerModel

    var body: some View {
        HStack(spacing: 2) {
            /* Receded, per brand.html's muted placement. The header is chrome
               and the panel is read below it — at full strength the mark was
               the brightest thing on screen, competing with the readout it
               sits above. */
            Lockup(size: 17, color: Tokens.Dark.textMuted)
            Spacer()
            if signedIn {
                OpenAppButton()
                AccountMenu(model: model)
            }
        }
        .padding(.leading, 14)
        .padding(.trailing, 8)
        .padding(.vertical, 8)
        .frame(maxWidth: .infinity)
        // Its own section, so Tab moves through these two and then on into
        // the panel rather than treating the whole window as one flat ring.
        .focusSection()
        .background(Tokens.Dark.bgRecessed)
        .overlay(alignment: .bottom) {
            Rectangle()
                .fill(Tokens.Dark.borderSubtle)
                .frame(height: 1)
        }
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
        /* Two blocks: the padded controls, then the stats rule edge to edge.
           The rule has to reach both sides, so it cannot live inside the
           padding the controls take. */
        VStack(alignment: .leading, spacing: 0) {
            composer
            Divider().overlay(Tokens.Dark.borderSubtle)
            stats
            if !model.today.isEmpty {
                Divider().overlay(Tokens.Dark.borderSubtle)
                entries
            }
        }
    }

    /// Today's finished work.
    ///
    /// **"Earlier today" while a timer runs**, because then this list is
    /// explicitly not the thing happening now — the readout above is. Stopped,
    /// it is simply "Today".
    ///
    /// Absent entirely when there is nothing: an empty list under a heading is
    /// a row of furniture saying nothing, and this panel is 320pt wide.
    private var entries: some View {
        VStack(alignment: .leading, spacing: 0) {
            Text(model.isRunning ? "Earlier today" : "Today")
                .font(.system(size: 10, weight: .medium))
                .textCase(.uppercase)
                .tracking(1.6)
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

    /* Running and idle are two arrangements, not one layout with things
       hidden — the same split the web app makes, and they want different
       rhythm. Running is a READOUT: the task and project hang 8pt under the
       clock as facts about it. Idle is COMPOSING: the field is the subject
       and its controls sit 10pt apart as peers. One uniform spacing made the
       running state read as three loose rows rather than one block. */
    private var composer: some View {
        model.isRunning ? AnyView(runningBlock) : AnyView(idleBlock)
    }

    /* Spacing is NOT uniform here, per menubar.html: 8pt from the clock to
       the task, then 4pt from the task to the project. The task and project
       are one pair of facts about the timer, so they sit tighter to each
       other than the pair does to the number it describes. */
    private var runningBlock: some View {
        VStack(alignment: .leading, spacing: 0) {
            readout

            if model.exceedsThreshold {
                RunawayNotice()
                    .padding(.top, 8)
            }

            RunningRow(
                model: model,
                name: $taskDraft,
                focused: $taskFocused,
                onCommit: commit
            )
            .padding(.top, 8)

            ProjectField(model: model)
                .padding(.top, 4)
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
    }

    private var idleBlock: some View {
        VStack(alignment: .leading, spacing: 10) {
            if model.exceedsThreshold {
                RunawayNotice()
            }

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

            /* Picker and Start on one row, which saves a full row of height
               against a full-width dropdown above a button. */
            HStack(spacing: 8) {
                ProjectField(model: model)
                Spacer(minLength: 0)
                StartStopButton(model: model)
            }

            if let error = model.errorMessage {
                Text(error)
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }
        }
        .padding(14)
        .frame(maxWidth: .infinity, alignment: .leading)
        /* Clicking the panel's own empty space puts the caret down.
           `contentShape` is what makes the gaps hittable — without it a tap
           between controls lands on nothing and the field keeps focus, which
           is the thing that has no other way out on a panel with no window
           chrome to click.

           `.plain` so the whole block does not become one grey button. */
        .contentShape(Rectangle())
        .onTapGesture { taskFocused = false }
        /* One focus section, so Tab moves BETWEEN these controls.
           `focusable()` alone makes a view a focus target without joining any
           ring — which is how focus landed on the stop button and then had
           nowhere to go, since Tab had no next element to move to. */
        .focusSection()
        // Escape leaves the field without committing a stray keystroke to a
        // billable record; the blur handler still saves what was typed.
        .onExitCommand { taskFocused = false }
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

    /// Today's total, edge to edge under its own rule.
    ///
    /// This is where the stopped state's number went when the 0:00:00 readout
    /// came out: a total is a fact to glance at, not the panel's subject.
    /// Neutral, because the accent is spent on the running clock — and when
    /// nothing runs there is nothing live to mark.
    ///
    /// Unbilled comes from `/stats`, which the web home screen already reads.
    /// It is work DONE and not yet invoiced — never summed with money already
    /// asked for, which would double-count the same hours.
    private var stats: some View {
        HStack(alignment: .firstTextBaseline) {
            statistic("Today", value: format(model.todaySeconds))
            Spacer(minLength: 12)
            // Absent until the first fetch: a zero here would read as
            // "nothing owed", which is a different claim from "not known yet".
            if let unbilled = model.stats {
                statistic(
                    "Unbilled",
                    value: money(unbilled.unbilled.total, code: unbilled.currency),
                    trailing: true
                )
            }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 11)
    }

    private func statistic(
        _ label: String,
        value: String,
        trailing: Bool = false
    ) -> some View {
        VStack(alignment: trailing ? .trailing : .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 10, weight: .medium))
                .textCase(.uppercase)
                .tracking(1.6)
                .foregroundStyle(Tokens.Dark.textSubtle)
            Text(value)
                .font(.system(size: 15, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(Tokens.Dark.textStrong)
                .contentTransition(.numericText())
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
        HStack(alignment: .center, spacing: 10) {
            /* The dot is a second channel for "running", independent of
               colour — `deriving-colour.md` records that no green survives
               dichromacy, so the state cannot rest on the hue alone. It sits
               beside the number it qualifies, which is also what makes the
               task and client below line up to the text rather than the dot. */
            Circle()
                .fill(Tokens.Dark.accentDefault)
                .frame(width: 9, height: 9)

            Text(format(model.elapsedSeconds))
                .font(.system(size: 26, weight: .medium, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(Tokens.Dark.accentDefault)
                .contentTransition(.numericText())

            /* Trailing edge, on the readout's own line — `menubar.html` draws
               it there. The two are still one object because they share the
               line: the row IS the timer, and the control sits at its end
               rather than floating after the digits at whatever width the
               clock happens to be. */
            Spacer(minLength: 8)
            StartStopButton(model: model)
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

    /// The panel's full-width primary action.
    func primaryButtonStyle(enabled: Bool) -> some View {
        modifier(PrimaryButton(enabled: enabled))
    }
}

/// Accent when it can be pressed, neutral when it cannot.
///
/// **Disabled is a different control, not a dimmer one.** Fading the accent —
/// which is what `.opacity()` on an accent button does — computes to `#285c28`
/// with the label at **2.33:1**, under the 4.5 floor and exactly the
/// white-on-accent pairing CI guards on the web. CI cannot see Swift, so this
/// is the only thing enforcing it here.
///
/// `bgActive` + `textMuted` reads as inert instead, at 4.43:1. The spec said
/// `textSubtle`, which measures 3.65:1 — under the floor it was written to
/// fix, so it is `textMuted` here and in `menubar.html`.
private struct PrimaryButton: ViewModifier {
    var enabled: Bool

    func body(content: Content) -> some View {
        content
            .font(.system(size: 12, weight: .medium))
            .frame(maxWidth: .infinity)
            .padding(.vertical, 7)
            .foregroundStyle(enabled ? Tokens.Dark.textOnAccent : Tokens.Dark.textMuted)
            .background(enabled ? Tokens.Dark.accentDefault : Tokens.Dark.bgActive)
            .clipShape(RoundedRectangle(cornerRadius: 6))
    }
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
    /// What Space and Return do once this has the keyboard. `.focusable()`
    /// makes a view a focus TARGET and nothing more — without this, Tab
    /// reaches a button that then cannot be pressed, which is worse than not
    /// being reachable at all.
    var activate: (() -> Void)?
    @FocusState private var focused: Bool

    func body(content: Content) -> some View {
        content
            .focusable()
            .focused($focused)
            .onKeyPress(.space) { fire() }
            .onKeyPress(.return) { fire() }
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

    /// `.ignored` when there is nothing to do, so the key falls through to
    /// whatever else might want it rather than being silently swallowed.
    private func fire() -> KeyPress.Result {
        guard let activate else { return .ignored }
        activate()
        return .handled
    }
}

extension View {
    /// Keyboard-reachable, with a ring that says so.
    /// Focus ring, and what Space or Return does once focused.
    ///
    /// `activate` is not optional in spirit: a control Tab can reach and the
    /// keyboard cannot press is worse than one Tab skips. It is optional only
    /// so a Menu, which handles its own keys, can take the ring alone.
    func keyboardReachable<S: InsettableShape>(
        shape: S = RoundedRectangle(cornerRadius: 6, style: .continuous),
        activate: (() -> Void)? = nil
    ) -> some View {
        modifier(Focusable(shape: shape, activate: activate))
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
    @State private var hovering = false

    private func beginEditing() {
        editing = true
        // Focus follows the mode change rather than the click, so the field is
        // ready however editing started — pointer or keyboard.
        DispatchQueue.main.async { focused = true }
    }

    var body: some View {
        HStack(spacing: 6) {
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
                    .fieldStyle(focused: focused)
                    .onChange(of: focused) { _, isFocused in
                        // Blur commits, so clicking straight to Stop keeps
                        // what was typed.
                        if !isFocused {
                            onCommit()
                            editing = false
                        }
                    }
            } else {
                /* The WHOLE row is the target, like the project picker below
                   it. A 10pt pencil is a small thing to hit, and the row it
                   sits in is the object you mean to act on — the same reason
                   `entry-list.tsx` makes its whole row the button. */
                Button(action: beginEditing) {
                    HStack(spacing: 6) {
                        Text(name.isEmpty ? "Untitled" : name)
                            .font(.system(size: 13))
                            .foregroundStyle(
                                name.isEmpty
                                    ? Tokens.Dark.textSubtle
                                    : Tokens.Dark.textStrong
                            )
                            .lineLimit(1)
                            .truncationMode(.tail)

                        // Opacity rather than removal, so the row does not
                        // reflow under the pointer as it arrives.
                        Image(systemName: "pencil")
                            .font(.system(size: 10))
                            .foregroundStyle(Tokens.Dark.textSubtle)
                            .opacity(hovering ? 1 : 0)

                        Spacer(minLength: 0)
                    }
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .frame(maxWidth: .infinity, alignment: .leading)
                    // The hittable area is the padded row, not just its text.
                    .contentShape(RoundedRectangle(cornerRadius: 6))
                    .background(hovering ? Tokens.Dark.bgElevated : .clear)
                    .clipShape(RoundedRectangle(cornerRadius: 6))
                }
                .buttonStyle(.plain)
                .keyboardReachable(activate: beginEditing)
                .accessibilityLabel("Rename task")
            }
        }
        /* No box. A running task already has a name — it is a fact hanging
           under the clock, not a field asking to be filled. Editing turns it
           into one; `fieldStyle` then draws the border, so the box appears
           exactly when there is something to type into.

           Indented to the readout's TEXT rather than its dot, so the eye
           reads time → what → whose down one edge. 9pt here plus the row's
           own 10pt inset lands the text at 19, and the highlight extends
           past it the way a control should — the same arithmetic the project
           picker below uses, so the two hover surfaces line up. */
        .padding(.leading, 9)
        .frame(maxWidth: .infinity, alignment: .leading)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.12), value: hovering)
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

/// The project, as a picker until one is chosen and a line of text after.
///
/// **A chosen project is a fact, not a field.** Left as a bordered control it
/// kept asking a question that had been answered, and it was the heaviest
/// object in a panel whose subject is the clock. Once set it reads as the
/// answer — and hovering brings the control back, so it is still obviously
/// changeable without carrying a box the whole time.
///
/// Unset it stays a picker, because then there IS a question.
///
/// `menubar.html` draws a client colour dot beside the name. `Project` carries
/// only `clientId`, and the app never fetches clients, so that is API work
/// rather than a value to invent — `tasks.md` has it.
private struct ProjectField: View {
    @Bindable var model: TimerModel

    @State private var hovering = false

    /// The running entry's project when there is one, otherwise the draft.
    private var selection: String? {
        model.isRunning ? model.running?.projectId : model.draftProjectID
    }

    private var chosen: Bool { selection != nil }

    private var colorHex: String? {
        guard let selection else { return nil }
        return model.projectColors[selection]
    }

    /* **The dot and the caret are drawn OUTSIDE the Menu.** A `Menu` label on
       macOS renders `Text` reliably and silently drops shapes and images —
       the same restriction that forced the status item through `markImage`.
       Everything visual therefore sits in this HStack, and the Menu carries
       only its text. */
    var body: some View {
        HStack(spacing: 6) {
            /* The client's colour, which answers *whose work is this?* — the
               same question it answers on the calendar and in the entry list.
               A project with no client shows the folder instead: internal work
               is a real state, not a colour that failed to load, so it takes
               no dot rather than a grey one. */
            if let hex = colorHex {
                RoundedRectangle(cornerRadius: 2, style: .continuous)
                    .fill(Color(hex: hex))
                    .frame(width: 8, height: 8)
            } else {
                Image(systemName: "folder")
                    .font(.system(size: 11))
                    .foregroundStyle(Tokens.Dark.textSubtle)
            }

            Menu {
                // "No project" is a real choice, not an absent one:
                // `client_id` null is how unbillable work is tracked, and the
                // web app is careful never to call it "internal" because it
                // cannot know.
                Button("No project") { Task { await model.assign(projectID: nil) } }
                if !model.projects.isEmpty { Divider() }
                ForEach(model.projects) { project in
                    Button(project.name) { Task { await model.assign(projectID: project.id) } }
                }
            } label: {
                Text(name(of: selection))
                    .font(.system(size: 12))
                    .foregroundStyle(
                        chosen ? Tokens.Dark.textPrimary : Tokens.Dark.textSubtle
                    )
                    .lineLimit(1)
            }
            .menuStyle(.borderlessButton)
            /* The style draws its own indicator, which sat beside ours — two
               carets, and only one of them knew about hover. */
            .menuIndicator(.hidden)
            .fixedSize()
            .keyboardReachable()

            Spacer(minLength: 0)

            /* The caret is what says "this opens". Unset it is always there;
               chosen it waits for the pointer, so the resting state is the
               answer and not the control. */
            if !chosen || hovering {
                Image(systemName: "chevron.up.chevron.down")
                    .font(.system(size: 9))
                    .foregroundStyle(Tokens.Dark.textSubtle)
            }
        }
        .padding(.horizontal, 10)
        .padding(.vertical, 6)
        .background(background)
        .clipShape(RoundedRectangle(cornerRadius: 6))
        /* Chosen, its TEXT lines up with the task name above at 19pt — the
           two are one pair of facts and a 9pt step between them read as a
           mistake. The control's own 10pt inset is pulled back out, so the
           hover surface still extends past the text the way a control should
           and only the glyph moves. Unset it stays where a field belongs. */
        .padding(.leading, chosen ? 9 : 0)
        .onHover { hovering = $0 }
        .animation(.easeOut(duration: 0.12), value: hovering)
    }

    /* Chosen and at rest it carries no fill, so it sits with the task name as
       one block of facts under the clock. Hover restores the control's own
       surface rather than a highlight, which is what makes it read as the
       same object coming back. */
    private var background: Color {
        if !chosen { return Tokens.Dark.bgElevated }
        return hovering ? Tokens.Dark.bgElevated : .clear
    }

    private func name(of id: String?) -> String {
        guard let id else { return "No project" }
        return model.projects.first { $0.id == id }?.name ?? "No project"
    }
}

/// One finished entry: what, and how long.
///
/// No project, no time range, no edit. The panel is 320pt wide and this is a
/// glance at what the day held — editing an entry needs a date and two times,
/// which is the form `principles.md` keeps out of the menu bar. The web app is
/// one click away in the header.
private struct EntryRow: View {
    let entry: TimeEntry

    @State private var hovering = false

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 8) {
            Text(entry.taskName.isEmpty ? "Untitled" : entry.taskName)
                .font(.system(size: 13))
                .foregroundStyle(
                    entry.taskName.isEmpty
                        ? Tokens.Dark.textSubtle
                        : Tokens.Dark.textPrimary
                )
                .lineLimit(1)
                .truncationMode(.tail)

            Spacer(minLength: 8)

            Text(format(entry.durationSeconds ?? 0))
                .font(.system(size: 12, design: .monospaced))
                .monospacedDigit()
                .foregroundStyle(Tokens.Dark.textMuted)
                .layoutPriority(1)
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 7)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(hovering ? Tokens.Dark.bgHover : .clear)
        .onHover { hovering = $0 }
    }
}

private struct StartStopButton: View {
    @Bindable var model: TimerModel

    var body: some View {
        Button {
            Task { await model.toggle() }
        } label: {
            /* One shape for both states: a 38pt circle with a single glyph,
               per menubar.html. Start was a labelled pill, which made the two
               halves of one control look like different objects — and the
               label said what the glyph already says.

               Stopping is NEUTRAL and starting is the ACCENT, which is the
               scarcity rule doing its job: idle, the primary action is the
               only live thing on the panel; running, the accent is already on
               the clock and the dot, so a green stop would be a third object
               competing with the number it belongs to. */
            Image(systemName: model.isRunning ? "stop.fill" : "play.fill")
                .font(.system(size: 13))
                .foregroundStyle(
                    model.isRunning
                        ? Tokens.Dark.textPrimary
                        // Never white on the accent — 1.37:1. `textOnAccent`
                        // is the near-black the token package exists to
                        // enforce, and CI guards this pairing on the web.
                        : Tokens.Dark.textOnAccent
                )
                // The play triangle's own side bearings sit it left of centre
                // in a circle; the square does not need correcting.
                .padding(.leading, model.isRunning ? 0 : 2)
                .frame(width: 38, height: 38)
                .background(
                    model.isRunning
                        ? Tokens.Dark.bgElevated
                        : Tokens.Dark.accentDefault
                )
                .clipShape(Circle())
        }
        .buttonStyle(.plain)
        // One shape now that both states are a circle.
        .keyboardReachable(
            shape: AnyInsettableShape(Circle()),
            // Guarded, so a key cannot fire a second request while one is out.
            activate: { if !model.isBusy { Task { await model.toggle() } } }
        )
        .disabled(model.isBusy)
        /* A fade, not the neutral disabled fill the sign-in buttons take:
           `isBusy` lasts one request, so this reads as "working" where a
           swap to grey would flash the button dead and back. The contrast
           floor is about a control you are stuck looking at. */
        .opacity(model.isBusy ? 0.6 : 1)
        .accessibilityLabel(model.isRunning ? "Stop timer" : "Start timer")
    }
}

private struct OpenAppButton: View {
    @Environment(\.openURL) private var openURL
    @Environment(\.dismiss) private var dismiss

    private func open() {
        openURL(Config.appURL)
        /* The panel is not a window, so `dismiss` alone is unreliable here;
           resigning active status is what actually closes it. */
        dismiss()
        NSApp.hide(nil)
    }

    var body: some View {
        Button(action: open) {
            /* Glyph alone in the header bar: the label was carrying a full
               row at the foot of the panel for an action that is chrome, and
               the arrow is the same one the web uses for leaving the app.

               SF Symbols rather than lucide, which ships JSX and cannot cross
               into Swift. The names match what the web uses for the same
               action, so the two apps do not diverge on meaning. */
            Image(systemName: "arrow.up.forward.app")
                .font(.system(size: 12, weight: .light))
                .foregroundStyle(Tokens.Dark.textSubtle)
                .frame(width: 24, height: 24)
        }
        .buttonStyle(.plain)
        .accessibilityLabel("Open Stint")
        .keyboardReachable(
            shape: AnyInsettableShape(
                RoundedRectangle(cornerRadius: 6, style: .continuous)
            ),
            activate: open
        )
    }
}

/// Sign out and Quit, behind one glyph.
///
/// They were a footer row carrying the signed-in email beside them — the
/// least useful line in a menu bar panel, since you know who you are. The
/// email moves into this menu, where it is a label on the sign-out rather
/// than a row of its own.
private struct AccountMenu: View {
    @Bindable var model: TimerModel

    var body: some View {
        Menu {
            if let email = model.email {
                Text(email)
            }
            Button("Sign out") { Task { await model.signOut() } }
            Divider()
            Button("Quit Stint") { NSApplication.shared.terminate(nil) }
        } label: {
            /* Same size, weight and shade as the arrow beside it. `gearshape`
               at the default weight reads heavier than `arrow.up.forward.app`
               at the same point size — two chrome glyphs on one bar have to
               look like one set. */
            Image(systemName: "gearshape")
                .font(.system(size: 12, weight: .light))
                .foregroundStyle(Tokens.Dark.textSubtle)
                .frame(width: 24, height: 24)
        }
        .menuStyle(.borderlessButton)
        .menuIndicator(.hidden)
        .fixedSize()
        /* Tab skipped this entirely: a `Menu` is not a focus target on its
           own, so the ring — and the stop it implies — has to be asked for.
           No `activate`, because the menu opens on its own keys once it has
           the focus. */
        .keyboardReachable()
        .accessibilityLabel("Account")
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
                        .primaryButtonStyle(enabled: !(busy || email.isEmpty))
                }
                .buttonStyle(.plain)
                .keyboardReachable(
                    activate: { if !(busy || email.isEmpty) { request() } }
                )
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
                // No placeholder: `000-000` reads as a value in a digits-only
                // field, and the caret lands in the middle of it.
                TextField("", text: $code)
                    .focused($focus, equals: .code)
                    .textFieldStyle(.plain)
                    .font(.system(size: 20, weight: .medium, design: .monospaced))
                    .tracking(6)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(Tokens.Dark.textStrong)
                    .fieldStyle(focused: focus == .code)
                    .onChange(of: code) { _, entered in
                        /* Shown as xxx-xxx: three digits at a time is what a
                           person can hold while looking from the email back to
                           this field. The hyphen is inserted as you type and
                           stripped before sending — a grouping mark, not part
                           of the code.

                           The email deliberately does NOT carry the hyphen: a
                           hyphen there made the code two words, so copying it
                           took two clicks and a drag. It stays here because a
                           field being typed into is not a string being
                           selected. Filtering to digits is what lets a pasted
                           `392481` land in a field that displays `392-481`.

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
                        .primaryButtonStyle(
                            enabled: !(busy || code.filter(\.isNumber).count < 6)
                        )
                }
                .buttonStyle(.plain)
                .keyboardReachable(
                    activate: {
                        if !(busy || code.filter(\.isNumber).count < 6) {
                            verify()
                        }
                    }
                )
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
