import Foundation

/// A UUIDv7, the scheme `uuidv7()` in `@stint/core` uses: 48 bits of
/// big-endian milliseconds, then randomness.
func uuidv7(now: Date = Date()) -> String {
    var bytes = [UInt8](repeating: 0, count: 16)
    let millis = UInt64(now.timeIntervalSince1970 * 1000)
    for i in 0..<6 { bytes[i] = UInt8((millis >> (40 - 8 * UInt64(i))) & 0xFF) }
    for i in 6..<16 { bytes[i] = UInt8.random(in: 0...255) }
    bytes[6] = (bytes[6] & 0x0F) | 0x70
    bytes[8] = (bytes[8] & 0x3F) | 0x80

    var hex = bytes.map { String(format: "%02x", $0) }.joined()
    for offset in [20, 16, 12, 8] {
        hex.insert("-", at: hex.index(hex.startIndex, offsetBy: offset))
    }
    return hex
}
