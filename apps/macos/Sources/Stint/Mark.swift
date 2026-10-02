import SwiftUI
import AppKit

/// `|Stint|` in one color. Geometry comes from `Tokens.Mark`, so this and
/// the web app's `Wordmark` are one drawing; ratios of the font size, so one
/// definition serves every placement.
struct Lockup: View {
    var role: TypeRole = .mark
    var color: Color = Tokens.Dark.textStrong

    private var size: CGFloat { role.token.size }

    var body: some View {
        HStack(spacing: 0) {
            bound
            Text("Stint")
            bound
        }
        .font(role.font)
        .tracking(role.tracking)
        .foregroundStyle(color)
        .accessibilityElement()
        .accessibilityLabel("Stint")
    }

    private var bound: some View {
        RoundedRectangle(cornerRadius: .infinity, style: .continuous)
            .fill(color)
            .frame(width: max(1, size * Tokens.Mark.boundWidth), height: size * Tokens.Mark.boundHeight)
            .padding(.horizontal, size * Tokens.Mark.boundGap)
    }
}

/// The status item's dot. Drawn into an `NSImage` because a `MenuBarExtra`
/// label renders only `Text` and `Image`; never a template, which would let
/// the bar tint away the fill that carries the state.
@MainActor
func pipImage(fill: NSColor, diameter: CGFloat = 7, box: CGFloat = 17) -> NSImage {
    let image = NSImage(size: NSSize(width: diameter, height: box), flipped: false) { _ in
        fill.setFill()
        NSBezierPath(ovalIn: NSRect(x: 0, y: (box - diameter) / 2, width: diameter, height: diameter)).fill()
        return true
    }
    image.isTemplate = false
    return image
}

/// The menu bar's own font, with tabular digits.
@MainActor let barClockFont = NSFont.monospacedDigitSystemFont(
    ofSize: NSFont.menuBarFont(ofSize: 0).pointSize, weight: .regular)

/// The pip and the gap after it.
let pipSlot: CGFloat = 7 + 7

/// The whole status item, pip and clock, as one image. A `MenuBarExtra`
/// label drops every modifier, `.monospacedDigit()` included, so a `Text`
/// clock is set in proportional digits, changes width each second, and the
/// bar re-lays out from the right, sliding the pip. Here the clock is set in
/// tabular digits, so the item keeps its width while it ticks and grows only
/// when the hour gains a digit; no space is held for one ahead of time, which
/// would strand the pip away from the clock. Not a template, for the pip's sake:
/// the clock takes `labelColor`, which resolves against the bar's appearance
/// each time the image draws.
@MainActor
func barImage(fill: NSColor, clock: String) -> NSImage {
    let attributes: [NSAttributedString.Key: Any] = [.font: barClockFont, .foregroundColor: NSColor.labelColor]
    let text = (clock as NSString).size(withAttributes: attributes)
    let box = max(17, ceil(text.height))
    let pip = pipImage(fill: fill, box: box)
    let image = NSImage(size: NSSize(width: ceil(pipSlot + text.width), height: box), flipped: false) { _ in
        pip.draw(at: .zero, from: .zero, operation: .sourceOver, fraction: 1)
        (clock as NSString).draw(
            at: NSPoint(x: pipSlot, y: (box - text.height) / 2), withAttributes: attributes)
        return true
    }
    image.isTemplate = false
    image.accessibilityDescription = clock
    return image
}
