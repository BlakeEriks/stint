# Data Model: One Clients nav item

No schema or API change. The screen reads:

- **Client** (`ClientWithScale`): `id`, `name`, `color`, `hourlyRate`, `currency`, `email`, `archivedAt`, `projectCount` (active projects), `unbilledAmount`.
- **Project**: `id`, `clientId` (nullable), `name`, `hourlyRate`, `isBillableDefault`, `archivedAt`.

**Group** (screen-only): `{ client: Client | null, projects: Project[] }`. `null` is **No client**. The grouping rules are in [research.md](research.md#grouping-rule).
