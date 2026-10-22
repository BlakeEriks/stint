import Foundation
import Testing
@testable import Stint

/// Each response `apps/web/test/routes.test.ts` records from the real
/// routes decodes into the type `API` reads it as.
struct ContractTests {
    private func decode<T: Decodable>(_ type: T.Type, _ name: String) throws -> T {
        let url = try #require(
            Bundle.module.url(forResource: name, withExtension: "json", subdirectory: "Fixtures")
        )
        return try API.decoder.decode(type, from: Data(contentsOf: url))
    }

    @Test func summary() throws {
        let summary = try decode(Summary.self, "summary")
        #expect(summary.running?.endedAt == nil)
    }

    @Test func stats() throws {
        _ = try decode(Stats.self, "stats")
    }

    @Test func clients() throws {
        #expect(try !decode(ClientList.self, "clients").clients.isEmpty)
    }

    @Test func projects() throws {
        #expect(try !decode(ProjectList.self, "projects").projects.isEmpty)
    }

    @Test func taskNames() throws {
        #expect(try !decode(TaskNameList.self, "task-names").taskNames.isEmpty)
    }

    @Test func timer() throws {
        #expect(try decode(API.Pressed.self, "timer-start").included.summary.running != nil)
        _ = try decode(TimeEntry.self, "timer-current")
        let stopped = try decode(API.Pressed.self, "timer-stop")
        #expect(stopped.entry.endedAt != nil)
        #expect(stopped.included.summary.running == nil)
    }
}
