import Foundation

/// The panel's last known lists, so a launch shows them at once instead of
/// waiting on the first fetch. Never the summary: the server owns timer
/// truth, and a cached timer stopped on the web would tick until it answered.
struct Snapshot: Codable, Equatable {
    /// The app version that wrote it. Another version's file is discarded
    /// rather than decoded against shapes that may have moved.
    let version: String
    let projects: [Project]
    let clients: [Client]
    let stats: Stats?
    let taskNames: [TaskName]
}

/// `snapshot.json` in one directory. A cache, so every failure here only
/// costs the instant paint: the fetch that follows is the truth.
struct SnapshotStore: Sendable {
    static let caches = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        .appending(path: "Stint")

    let directory: URL
    let version: String

    init(directory: URL = caches, version: String = AppVersion.current) {
        self.directory = directory
        self.version = version
    }

    private var file: URL { directory.appending(path: "snapshot.json") }

    /// Nil when there is none, it does not decode, or another version wrote it.
    func read() -> Snapshot? {
        guard let data = try? Data(contentsOf: file),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
              snapshot.version == version
        else { return nil }
        return snapshot
    }

    /// `try?`: an unwritable cache means the next launch waits on the fetch,
    /// as every launch did before there was one.
    func write(_ snapshot: Snapshot) {
        try? FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        try? JSONEncoder().encode(snapshot).write(to: file, options: .atomic)
    }

    /// `try?`: no file is already the state this asks for.
    func delete() {
        try? FileManager.default.removeItem(at: file)
    }
}
