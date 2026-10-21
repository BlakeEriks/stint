import SwiftUI

struct SignInPanel: View {
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
                    .accessibilityIdentifier("code")
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
                    .accessibilityIdentifier("sign-in")
                Button("Use a different email") {
                    sent = false
                    code = ""
                    error = nil
                }
                .buttonStyle(.tertiary)
                .panelFocus(RoundedRectangle(cornerRadius: 4))
                .accessibilityIdentifier("different-email")
            } else {
                TextField("you@example.com", text: $email)
                    .textFieldStyle(.plain)
                    .focused($focus, equals: .email)
                    .field(focused: focus == .email)
                    .accessibilityIdentifier("email")
                    .onSubmit(request)
                Button(busy ? "Sending…" : "Email me a code", action: request)
                    .buttonStyle(.primary)
                    .panelFocus(RoundedRectangle(cornerRadius: 8))
                    .disabled(busy || email.isEmpty)
                    .accessibilityIdentifier("send-code")
            }

            if let error = error ?? model.previewSignInError {
                Text(error)
                    .role(.body)
                    .foregroundStyle(Tokens.Dark.danger)
                    .fixedSize(horizontal: false, vertical: true)
            }

            rule
            Button("Quit") { NSApp.terminate(nil) }
                .buttonStyle(.tertiary)
                .accessibilityIdentifier("quit")
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
