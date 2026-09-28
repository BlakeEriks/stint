# Research: One Clients nav item

## Data for the screen

- **Decision**: Two queries: `api.clients({ includeArchived: true, withScale: true })` and `api.projects({ includeArchived: wantArchived })`. Filtering and grouping happen in the screen.
- **Rationale**: Archived clients are always needed, because an active project's heading must name its client (spec clarifications). `withScale` already carries the summary line (active project count, unbilled amount).
- **Alternatives considered**: A new endpoint returning groups. Rejected: nothing the two existing calls lack.

## Grouping rule

- **Decision**: Groups are clients in name order, then **No client** last.
  - Active: active clients, including ones with no projects, each with its active projects.
  - Archived: archived clients, plus active clients that have an archived project, each with its archived projects.
  - All: every client with every project.
  - A project whose client id matches no client joins **No client**, as it does today.
- **Rationale**: Carries the clarified rules; keeps `ProjectList`'s ordering.
- **Alternatives considered**: Hiding empty clients, which `ProjectList` does today. Rejected: this is now the only list of clients.

## Heading

- **Decision**: The client name links to `/clients/[id]` and replaces the separate "Manage" link. The heading keeps the Archived badge, rate, and today's summary line.
- **Rationale**: FR-004; one link per client, not two.

## Redirect

- **Decision**: `redirects()` in `next.config.ts`, `/projects` → `/clients`, `permanent: true`.
- **Rationale**: Next.js passes the query string through, so `?status=` is kept (FR-007). It runs before the proxy, so no page file is needed.
- **Alternatives considered**: A `redirect()` inside `projects/page.tsx`. Rejected: it keeps a route file that only forwards, and it has to copy the query by hand.

## Tests

- **Decision**: Fold `project-list.test.tsx` into `client-list.test.tsx`, add the clarified filter cases, and add a Playwright request test for the redirect (`maxRedirects: 0`, check the `Location` header).
- **Rationale**: The constitution gives screens their stories. The UI suite already covers grouping, and the redirect is config that only a running server shows.
