import SwiftUI
import AppKit

/// The Stint mark: an `S` between two bounds — `|S|`.
///
/// The bounds are the same brackets the wordmark sits in, and they carry the
/// meaning the letter cannot: a stint is work with a start and an end, which
/// is also what the calendar draws and what an invoice line is. The `S` names
/// the app; the pipes say what it does.
///
/// Drawn rather than shipped as an image so it is sharp at every size and the
/// running state is a fill change, not a second asset.
struct Mark: View {
    /// Tints the whole mark. The menu bar passes its own foreground so the
    /// mark follows the bar's light/dark tinting like a template image would.
    var color: Color = .primary
    /// The accent, while a timer runs. `nil` leaves the mark monochrome.
    var accent: Color?

    var body: some View {
        GeometryReader { geo in
            let side = min(geo.size.width, geo.size.height)
            let bar = max(1, (side * 0.085).rounded())
            /* The bounds match the glyph's cap height rather than the full
               box. Running them to the edges left them overshooting the `S`
               top and bottom, which read as gangly at large sizes and as
               noise at 15px. */
            let rule = side * 0.80

            HStack(spacing: 0) {
                bound(width: bar, height: rule)
                Spacer(minLength: 0)
                // A mono `S` at the wordmark's weight, so the mark and the
                // word are unmistakably the same object.
                Text("S")
                    .font(.system(size: side * 0.74, weight: .semibold, design: .monospaced))
                    .foregroundStyle(accent ?? color)
                    .lineLimit(1)
                    .minimumScaleFactor(0.5)
                    // The glyph carries its own side bearings, which would
                    // otherwise push the pipes apart at small sizes.
                    .padding(.horizontal, -side * 0.10)
                Spacer(minLength: 0)
                bound(width: bar, height: rule)
            }
            .frame(width: geo.size.width, height: geo.size.height)
        }
        .accessibilityHidden(true)
    }

    private func bound(width: CGFloat, height: CGFloat) -> some View {
        RoundedRectangle(cornerRadius: width / 2, style: .continuous)
            .fill(color)
            .frame(width: width, height: height)
    }
}

/// `|Stint|` that contracts to `|S|`.
///
/// The right bound travels and the `S` holds, which is what makes it read as
/// the word collapsing into its initial rather than four letters fading out.
/// The brand mark and the compact mark are then the same object rather than
/// two drawings that happen to resemble each other.
struct Lockup: View {
    /// `false` shows `|S|`.
    var expanded: Bool
    var size: CGFloat = 30
    var color: Color = Tokens.Dark.textStrong
    var accent: Color = Tokens.Dark.accentDefault

    /* The bounds and the remaining letters both sit at 55%, so the green `S`
       is the only thing at full strength and the word frames it.

       An opacity rather than a muted token on purpose: it tracks whatever
       foreground it is given, so one lockup works on a light ground and on a
       dark one. A flat grey would need a light-mode counterpart, and the
       menu bar tints itself. */
    private let recede: Double = 0.55

    var body: some View {
        HStack(spacing: 0) {
            bound
            Text("S")
                .foregroundStyle(accent)
                .padding(.leading, size * 0.14)
            // The remaining letters collapse to zero width; clipping is what
            // makes the right bound appear to slide over them.
            Text("tint")
                .foregroundStyle(color.opacity(recede))
                .fixedSize()
                .frame(width: expanded ? nil : 0, alignment: .leading)
                .opacity(expanded ? 1 : 0)
                .clipped()
            bound.padding(.leading, size * 0.12)
        }
        .font(.system(size: size, weight: .semibold, design: .monospaced))
        .tracking(size * 0.12)
        .animation(.spring(response: 0.42, dampingFraction: 0.86), value: expanded)
        .accessibilityElement()
        .accessibilityLabel("Stint")
    }

    private var bound: some View {
        RoundedRectangle(cornerRadius: size * 0.05, style: .continuous)
            .fill(color.opacity(recede))
            .frame(width: max(2, size * 0.1), height: size)
    }
}

/// The mark as an `NSImage`, for the menu bar.
///
/// `MenuBarExtra`'s label is rasterised into a status item, and it only
/// renders `Text` and `Image` reliably — shapes and `GeometryReader` are
/// dropped silently, which showed up as a bare `S` with no bounds. Drawing
/// into an image sidesteps that: the status item gets something it can
/// definitely display.
///
/// `isTemplate` when monochrome, so AppKit tints it for a light or dark menu
/// bar the way every other status icon behaves. A running timer's accent has
/// to opt out of that — a template image is a mask and would discard the
/// colour entirely.
@MainActor
func markImage(height: CGFloat = 17, accent: NSColor? = nil) -> NSImage {
    let width = height * 1.05
    /* The bounds are drawn at 55% so they frame the `S` rather than compete
       with it — an opacity, not a fixed grey, because it tracks whatever
       colour it lands on and so needs no second value for a light bar. */
    let boundAlpha: CGFloat = 0.55

    /* A template image is a MASK: AppKit discards the colours and fills the
       coverage with the bar's own foreground, which is what makes a
       monochrome icon tint itself for light and dark. An accented mark cannot
       be one — the green would be flattened away — so it opts out, and then
       has to supply its own bound colour. Taking that from the menu bar's
       effective appearance is what keeps the bars visible on both; they were
       drawn literal black, which vanished on a dark bar. */
    let ink: NSColor = accent == nil ? .black : menuBarInk()

    let image = NSImage(size: NSSize(width: width, height: height), flipped: false) { _ in
        let bar = max(1, (height * 0.085).rounded())
        let rule = height * 0.80
        let y = (height - rule) / 2

        ink.withAlphaComponent(boundAlpha).setFill()
        NSBezierPath(
            roundedRect: NSRect(x: 0, y: y, width: bar, height: rule),
            xRadius: bar / 2, yRadius: bar / 2
        ).fill()
        NSBezierPath(
            roundedRect: NSRect(x: width - bar, y: y, width: bar, height: rule),
            xRadius: bar / 2, yRadius: bar / 2
        ).fill()

        let size = height * 0.84
        let font = NSFont.monospacedSystemFont(ofSize: size, weight: .semibold)
        let glyph = NSAttributedString(
            string: "S",
            attributes: [.font: font, .foregroundColor: accent ?? ink]
        )
        let measured = glyph.size()
        glyph.draw(at: NSPoint(
            x: (width - measured.width) / 2,
            y: (height - measured.height) / 2
        ))
        return true
    }
    image.isTemplate = accent == nil
    return image
}

/// Near-white or near-black, following the menu bar's own appearance.
///
/// Only the accented mark needs this — the monochrome one is a template and
/// AppKit tints it. `NSApp` is optional rather than force-unwrapped because
/// it is nil outside a running application (a render script, a test), and
/// crashing there would make the mark untestable off-screen.
@MainActor
private func menuBarInk() -> NSColor {
    let appearance = NSApp?.effectiveAppearance ?? NSAppearance.currentDrawing()
    return appearance.bestMatch(from: [.darkAqua, .aqua]) == .darkAqua
        ? .white
        : .black
}
