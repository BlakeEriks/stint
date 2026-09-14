import SwiftUI
import AppKit

/// `|Stint|` — the wordmark, in one colour.
///
/// The bounds carry the meaning the letters cannot: a stint is work with a
/// start and an end, which is also what the calendar draws and what an
/// invoice line is. The word sits inside them rather than beside them.
///
/// Geometry comes from `Tokens.Mark`, generated from `tokens.json`, so this
/// and the web app's `Wordmark` are one drawing. Ratios of the font size,
/// which is what lets one definition serve the 17pt panel header and the
/// sign-in view.
///
/// Drawn rather than shipped as an image so it is sharp at every size.
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
            .frame(
                width: max(1, size * Tokens.Mark.boundWidth),
                height: size * Tokens.Mark.boundHeight
            )
            .padding(.horizontal, size * Tokens.Mark.boundGap)
    }
}

/// The status item: a filled dot and the time, no letterform.
///
/// A dot means *recording* in a way a letter cannot — it is what every camera
/// and every recorder uses — and the status item's whole job is to say
/// whether time is accruing. `menubar.html` is the spec.
///
/// Three fills: the accent while running, `timerIdle` stopped, and amber past
/// the runaway threshold. The amber case is how a runaway reaches someone
/// whose panel is shut.
///
/// `MenuBarExtra`'s label is rasterised into a status item and only renders
/// `Text` and `Image` reliably — shapes are dropped silently — so this draws
/// into an `NSImage` rather than returning a SwiftUI `Circle`.
///
/// Never a template image. A template is a mask: AppKit would discard the
/// fill and tint it with the bar's own foreground, which is exactly the
/// signal the pip exists to carry.
@MainActor
func pipImage(fill: NSColor, diameter: CGFloat = 7, box: CGFloat = 17) -> NSImage {
    let image = NSImage(size: NSSize(width: diameter, height: box), flipped: false) { _ in
        fill.setFill()
        NSBezierPath(ovalIn: NSRect(
            x: 0, y: (box - diameter) / 2,
            width: diameter, height: diameter
        )).fill()
        return true
    }
    image.isTemplate = false
    return image
}
