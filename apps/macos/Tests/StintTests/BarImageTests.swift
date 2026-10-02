import AppKit
import Testing
@testable import Stint

/// The status item is as wide as this image, so one width per count of hour
/// digits is what keeps the pip still while the clock ticks.
@MainActor
struct BarImageTests {
    private func width(_ clock: String) -> CGFloat { barImage(fill: .red, clock: clock).size.width }
    private func clocks(hourDigits: Int) -> [String] {
        (0...9).map { d in String(repeating: "\(d)", count: hourDigits) + ":\(d)\(d):\(d)\(d)" }
    }

    @Test func keepsOneWidthWhileTheHourHasOneDigit() {
        #expect(Set((clocks(hourDigits: 1) + [format(0), format(9 * 3600 + 59 * 60 + 59)]).map(width)).count == 1)
    }

    @Test func growsOnlyAtTenHours() {
        #expect(Set(clocks(hourDigits: 2).map(width)).count == 1)
        #expect(width(format(10 * 3600)) > width(format(9 * 3600 + 59 * 60 + 59)))
    }

    @Test func holdsThePipTightToTheClock() {
        let text = (format(0) as NSString).size(withAttributes: [.font: barClockFont]).width
        #expect(width(format(0)) == ceil(pipSlot + text))
    }

    @Test func readsAsTheClock() {
        #expect(barImage(fill: .red, clock: "1:02:05").accessibilityDescription == "1:02:05")
    }
}
