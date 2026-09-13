// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "Stint",
    // 14 is the floor for `MenuBarExtra(.window)` to behave, and every Mac
    // that can run the browser this app signs in through is well past it.
    platforms: [.macOS(.v14)],
    targets: [
        .executableTarget(
            name: "Stint",
            path: "Sources/Stint"
        )
    ]
)
