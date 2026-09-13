// GENERATED from tokens.json — do not edit by hand.
import SwiftUI

public extension Color {
    init(hex: String) {
        let s = hex.hasPrefix("#") ? String(hex.dropFirst()) : hex
        let v = UInt64(s, radix: 16) ?? 0
        self.init(
            .sRGB,
            red:   Double((v >> 16) & 0xFF) / 255,
            green: Double((v >> 8) & 0xFF) / 255,
            blue:  Double(v & 0xFF) / 255,
            opacity: 1
        )
    }
}

public enum Tokens {
    public enum Dark {
        static let bgRecessed = Color(hex: "#0A0B0E")
        static let bgBase = Color(hex: "#111316")
        static let bgPrimary = Color(hex: "#181B1F")
        static let bgElevated = Color(hex: "#202328")
        static let bgHover = Color(hex: "#272A30")
        static let bgActive = Color(hex: "#2F333A")
        static let textStrong = Color(hex: "#F9FAFD")
        static let textPrimary = Color(hex: "#CACED7")
        static let textMuted = Color(hex: "#9299A6")
        static let textSubtle = Color(hex: "#838A97")
        static let textOnAccent = Color(hex: "#111316")
        static let textOnDanger = Color(hex: "#111316")
        static let overlay = Color(hex: "#05060899")
        static let borderSubtle = Color(hex: "#2F333A")
        static let borderDefault = Color(hex: "#393E48")
        static let borderControl = Color(hex: "#666D79")
        static let borderFocus = Color(hex: "#9DA3AF")
        static let accentDefault = Color(hex: "#52FC43")
        static let accentHover = Color(hex: "#8EFD83")
        static let accentActive = Color(hex: "#3FE231")
        static let accentSubtle = Color(hex: "#0E4B09")
        static let accentMuted = Color(hex: "#1B3518")
        static let timerRunning = Color(hex: "#52FC43")
        static let timerIdle = Color(hex: "#666D79")
        static let timerWarning = Color(hex: "#DBA929")
        static let success = Color(hex: "#2CCCEB")
        static let warning = Color(hex: "#DBA929")
        static let danger = Color(hex: "#E9504D")
        static let info = Color(hex: "#6D7FAE")
    }
    public enum Light {
        static let bgRecessed = Color(hex: "#E6E7EA")
        static let bgBase = Color(hex: "#EDEFF1")
        static let bgPrimary = Color(hex: "#F5F6F8")
        static let bgElevated = Color(hex: "#FDFDFF")
        static let bgHover = Color(hex: "#DADCDF")
        static let bgActive = Color(hex: "#CBCDD1")
        static let textStrong = Color(hex: "#090A0B")
        static let textPrimary = Color(hex: "#292B30")
        static let textMuted = Color(hex: "#646870")
        static let textSubtle = Color(hex: "#71757F")
        static let textOnAccent = Color(hex: "#FFFFFF")
        static let textOnDanger = Color(hex: "#FFFFFF")
        static let overlay = Color(hex: "#1B1E2799")
        static let borderSubtle = Color(hex: "#CBCDD1")
        static let borderDefault = Color(hex: "#BFC3CB")
        static let borderControl = Color(hex: "#8F949C")
        static let borderFocus = Color(hex: "#52565D")
        static let accentDefault = Color(hex: "#1F7E17")
        static let accentHover = Color(hex: "#196A12")
        static let accentActive = Color(hex: "#165E10")
        static let accentSubtle = Color(hex: "#289A1E")
        static let accentMuted = Color(hex: "#E8F7E4")
        static let timerRunning = Color(hex: "#1F7E17")
        static let timerIdle = Color(hex: "#8F949C")
        static let timerWarning = Color(hex: "#A66A00")
        static let success = Color(hex: "#0E7490")
        static let warning = Color(hex: "#A66A00")
        static let danger = Color(hex: "#C21725")
        static let info = Color(hex: "#4A5A85")
    }
    public static let projectColors: [Color] = [
        Color(hex: "#DA8188"),
        Color(hex: "#D38B59"),
        Color(hex: "#B49D46"),
        Color(hex: "#42B59A"),
        Color(hex: "#35AFC9"),
        Color(hex: "#6EA1E2"),
        Color(hex: "#A390DC"),
        Color(hex: "#C984BA"),
    ]
}
