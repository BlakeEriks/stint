import SwiftUI
import AppKit

/// `|Stint|` in one colour. Geometry comes from `Tokens.Mark`, so this and
/// the web app's `Wordmark` are one drawing; ratios of the font size, so one
/// definition serves every placement.
struct Lockup: View {
    var size: CGFloat = 17
    var color: Color = Tokens.Dark.textStrong

    var body: some View {
        HStack(spacing: 0) {
            bound
            Text("Stint")
            bound
        }
        .font(.system(size: size, weight: .semibold, design: .monospaced))
        .tracking(size * 0.12)
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
