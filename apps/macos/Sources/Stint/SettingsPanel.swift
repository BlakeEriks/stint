import ServiceManagement
import SwiftUI

/// Two settings and the way out. Nothing unimplemented is drawn: an inert
/// control is a promise the panel cannot keep.
struct SettingsPanel: View {
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
                .accessibilityIdentifier("bar-readout")
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
            // The panel keeps the timer's height, so the footer sits at its
            // foot rather than under the last row.
            Spacer(minLength: 0)
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
            accountLink("Sign out", id: "sign-out") { Task { await model.signOut() } }
            accountLink("Quit", id: "quit") { NSApp.terminate(nil) }
        }
        .padding(.horizontal, 14)
        .padding(.vertical, 10)
        .frame(height: 38)
        .frame(maxWidth: .infinity)
        .background(Tokens.Dark.bgRecessed)
        .overlay(alignment: .top) { rule }
    }

    private func accountLink(_ title: String, id: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Hovering { on in
                Text(title)
                    .role(.link)
                    .foregroundStyle(on ? Tokens.Dark.textPrimary : Tokens.Dark.textSubtle)
                    .contentShape(Rectangle())
            }
        }
        .buttonStyle(.panel)
        .panelFocus(RoundedRectangle(cornerRadius: 4))
        .accessibilityIdentifier(id)
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
        .accessibilityIdentifier("launch-at-login")
        .accessibilityValue(enabled ? "On" : "Off")
        .onAppear { enabled = SMAppService.mainApp.status == .enabled }
    }
}
