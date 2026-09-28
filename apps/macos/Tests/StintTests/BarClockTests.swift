import Testing
@testable import Stint

struct BarClockTests {
    @Test func keepsOneWidthAcrossTheHourDigit() {
        #expect(barClock(9 * 3600 + 59 * 60 + 59).count == barClock(10 * 3600).count)
        #expect(barClock(0).count == 8)
    }

    @Test func padsWithAFigureSpaceAndLeavesTheClockAlone() {
        #expect(barClock(3725) == "\u{2007}1:02:05")
        #expect(barClock(36000) == "10:00:00")
    }
}
