import SwiftUI

/// A hairline in `borderSubtle`.
var rule: some View {
    Rectangle().fill(Tokens.Dark.borderSubtle).frame(height: 1)
}

/// A 28pt header glyph that brightens under the pointer.
struct IconGlyph: View {
    let symbol: String
    init(_ symbol: String) { self.symbol = symbol }

    var body: some View {
        Hovering { on in
            Image(systemName: symbol)
                .role(.glyph)
                .foregroundStyle(on ? Tokens.Dark.textPrimary : Tokens.Dark.textSubtle)
                .frame(width: 28, height: 28)
                .background(on ? Tokens.Dark.bgHover : .clear)
                .clipShape(RoundedRectangle(cornerRadius: 6))
        }
    }
}

/// Tracks the pointer so a row can draw its hover state.
struct Hovering<Content: View>: View {
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

extension View {
    func field(focused: Bool, role: TypeRole = .text) -> some View {
        modifier(FieldStyle(focused: focused, role: role))
    }
}

// MARK: - Type

/// The type scale as the panel uses it. A view names a role; it never
/// assembles one.
///
/// Five cases are a generated role verbatim. The rest are a role resampled
/// at a panel size: 320pt of menu bar is a denser context than a web page, so
/// `readout` is 26 where `type.timer` is 24 and `label` is 10 where
/// `type.label` is 11. Tracking is re-derived from the token's own em ratio
/// rather than restated, so a tracking change in `tokens.json` still reaches
/// here — only the size is local. A symbol names a role too: its font is its
/// size and stroke weight.
enum TypeRole {
    case readout, text, body, stat, meta, duration, label, button, code
    case mark, link, glyph, transport, hint, disclosure, regionHead

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
        // The header's lockup, and the view title that takes its place.
        case .mark: Typography.wordmark.at(17)
        case .link: Typography.badge.at(10.5)
        // Symbols: the header's icon buttons, the play/stop button, the
        // affordances that appear under the pointer, the project menu's
        // chevron.
        case .glyph: Typography.control.at(12, weight: .light)
        case .transport: Typography.support
        case .hint: Typography.control.at(10)
        case .disclosure: Typography.control.at(8, weight: .medium)
        // The loading word, in the voice of the headings that replace it.
        case .regionHead: Typography.regionHead
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

extension Image {
    func role(_ role: TypeRole) -> some View {
        font(role.font)
    }
}
