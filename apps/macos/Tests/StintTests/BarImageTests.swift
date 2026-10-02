import AppKit
import Testing
@testable import Stint

/// The status item is as wide as this image, so one width for every clock
/// under 100 hours is what keeps the pip still.
@MainActor
struct BarImageTests {
    private let clocks = (0...9).flatMap { d in
        ["\(d):\(d)\(d):\(d)\(d)", "\(d)\(d):\(d)\(d):\(d)\(d)"]
    } + [format(0), format(9 * 3600 + 59 * 60 + 59), format(10 * 3600)]

    @Test func keepsOneWidthForEveryClockUnder100Hours() {
        let widths = Set(clocks.map { barImage(fill: .red, clock: $0).size.width })
        #expect(widths.count == 1)
    }

    @Test func theSlotHoldsTheWidestClock() {
        let slot = barImage(fill: .red, clock: format(0)).size.width
        for clock in clocks {
            let text = (clock as NSString).size(withAttributes: [.font: barClockFont]).width
            #expect(text <= slot - pipSlot)
        }
    }

    @Test func readsAsTheClock() {
        #expect(barImage(fill: .red, clock: "1:02:05").accessibilityDescription == "1:02:05")
    }
}
