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
        static let borderGrid = Color(hex: "#272A30")
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
        static let dangerMuted = Color(hex: "#47201E")
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
        static let borderGrid = Color(hex: "#DADCDF")
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
        static let dangerMuted = Color(hex: "#FFEBE8")
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

    /// The mark's geometry, as multiples of its own font size. Mark.swift
    /// reads these rather than carrying its own numbers, so |Stint| is one
    /// drawing across the web app and this one.
    public enum Mark {
        public static let boundWidth: CGFloat = 0.09
        public static let boundHeight: CGFloat = 1.05
        public static let boundGap: CGFloat = 0.18
        public static let boundRadius: CGFloat = 999
    }

    /// The type scale. A view names a role; it never assembles one.
    public enum `Type` {
        public struct Role: Sendable {
            public let size: CGFloat
            public let weight: Font.Weight
            /// Points, not em: tokens.json states tracking in em because CSS
            /// letter-spacing does, and SwiftUI's .tracking() takes points.
            /// Pre-multiplied here so no caller has to know that.
            public let tracking: CGFloat
            public let uppercase: Bool
            public let tabular: Bool
            public let mono: Bool

            public var font: Font {
                mono
                    ? .system(size: size, weight: weight, design: .monospaced)
                    : .system(size: size, weight: weight)
            }

            /// The same role at another size. Tracking rescales with it,
            /// since the token states it as a ratio of the size.
            public func at(
                _ newSize: CGFloat,
                weight newWeight: Font.Weight? = nil,
                tracking em: CGFloat? = nil
            ) -> Role {
                Role(
                    size: newSize,
                    weight: newWeight ?? weight,
                    tracking: (em ?? (size == 0 ? 0 : tracking / size)) * newSize,
                    uppercase: uppercase,
                    tabular: tabular,
                    mono: mono
                )
            }
        }

        public static let timer = Role(
            size: 24, weight: .medium, tracking: -0.48,
            uppercase: false, tabular: true, mono: true
        )
        public static let title = Role(
            size: 24, weight: .semibold, tracking: -0.6,
            uppercase: false, tabular: false, mono: false
        )
        public static let hero = Role(
            size: 30, weight: .semibold, tracking: -0.9,
            uppercase: false, tabular: false, mono: false
        )
        public static let figure = Role(
            size: 30, weight: .medium, tracking: -0.6,
            uppercase: false, tabular: true, mono: true
        )
        public static let lede = Role(
            size: 15, weight: .regular, tracking: 0,
            uppercase: false, tabular: false, mono: false
        )
        public static let display = Role(
            size: 22, weight: .medium, tracking: -0.44,
            uppercase: false, tabular: false, mono: false
        )
        public static let section = Role(
            size: 18, weight: .medium, tracking: 0,
            uppercase: false, tabular: false, mono: false
        )
        public static let heading = Role(
            size: 16.5, weight: .semibold, tracking: -0.165,
            uppercase: false, tabular: false, mono: false
        )
        public static let body = Role(
            size: 15, weight: .regular, tracking: 0,
            uppercase: false, tabular: false, mono: false
        )
        public static let control = Role(
            size: 14, weight: .regular, tracking: 0,
            uppercase: false, tabular: false, mono: false
        )
        public static let support = Role(
            size: 13, weight: .regular, tracking: 0,
            uppercase: false, tabular: false, mono: false
        )
        public static let amount = Role(
            size: 15, weight: .regular, tracking: 0,
            uppercase: false, tabular: true, mono: true
        )
        public static let amountHero = Role(
            size: 24, weight: .medium, tracking: -0.48,
            uppercase: false, tabular: true, mono: true
        )
        public static let duration = Role(
            size: 14, weight: .regular, tracking: 0,
            uppercase: false, tabular: true, mono: true
        )
        public static let meta = Role(
            size: 11.5, weight: .regular, tracking: 0,
            uppercase: false, tabular: true, mono: true
        )
        public static let wordmark = Role(
            size: 24, weight: .semibold, tracking: 2.88,
            uppercase: false, tabular: false, mono: true
        )
        public static let wordmarkSmall = Role(
            size: 14, weight: .semibold, tracking: 1.68,
            uppercase: false, tabular: false, mono: true
        )
        public static let nav = Role(
            size: 13, weight: .medium, tracking: 1.04,
            uppercase: true, tabular: false, mono: true
        )
        public static let label = Role(
            size: 11, weight: .medium, tracking: 1.76,
            uppercase: true, tabular: false, mono: true
        )
        public static let badge = Role(
            size: 9.5, weight: .regular, tracking: 0.76,
            uppercase: true, tabular: false, mono: true
        )
    }
}

/* Tokens.Type is unwritable in an expression: Swift reads any x.Type as the
 * metatype of x, and backticks do not escape it there. This is the name
 * call sites use. */
public typealias Typography = Tokens.`Type`
