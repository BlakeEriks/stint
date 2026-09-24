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
        static let timerWarning = Color(hex: "#5CABF2")
        static let success = Color(hex: "#36C52A")
        static let warning = Color(hex: "#5CABF2")
        static let danger = Color(hex: "#F64B66")
        static let dangerMuted = Color(hex: "#471F23")
        static let info = Color(hex: "#6D7FAE")
    }
    public enum Light {
        static let bgRecessed = Color(hex: "#E8E2D8")
        static let bgBase = Color(hex: "#EEE9E0")
        static let bgPrimary = Color(hex: "#F4F0E8")
        static let bgElevated = Color(hex: "#FAF6EF")
        static let bgHover = Color(hex: "#DED8CD")
        static let bgActive = Color(hex: "#D1CABE")
        static let textStrong = Color(hex: "#0B0A09")
        static let textPrimary = Color(hex: "#2D2A25")
        static let textMuted = Color(hex: "#68635B")
        static let textSubtle = Color(hex: "#767068")
        static let textOnAccent = Color(hex: "#FFFFFF")
        static let textOnDanger = Color(hex: "#FFFFFF")
        static let overlay = Color(hex: "#1B1E2799")
        static let borderGrid = Color(hex: "#DED8CD")
        static let borderSubtle = Color(hex: "#D1CABE")
        static let borderDefault = Color(hex: "#C1BDB5")
        static let borderControl = Color(hex: "#938E86")
        static let borderFocus = Color(hex: "#58544C")
        static let accentDefault = Color(hex: "#3A632C")
        static let accentHover = Color(hex: "#315424")
        static let accentActive = Color(hex: "#2A491E")
        static let accentSubtle = Color(hex: "#4A783A")
        static let accentMuted = Color(hex: "#E0EFDB")
        static let timerRunning = Color(hex: "#3A632C")
        static let timerIdle = Color(hex: "#938E86")
        static let timerWarning = Color(hex: "#1C6DAD")
        static let success = Color(hex: "#457036")
        static let warning = Color(hex: "#1C6DAD")
        static let danger = Color(hex: "#C21F43")
        static let dangerMuted = Color(hex: "#FFEBEB")
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
        public static let figureHero = Role(
            size: 40, weight: .medium, tracking: -0.8,
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
        public static let metaStrong = Role(
            size: 11.5, weight: .semibold, tracking: 0,
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
        public static let regionHead = Role(
            size: 13, weight: .medium, tracking: 0.13,
            uppercase: false, tabular: false, mono: true
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
