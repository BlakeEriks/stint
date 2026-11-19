# Quickstart: New invoice says when a draft holds this period's work

1. Signed in as `builder@localhost.test`, open New invoice for Northwind over October, which the seeded stale draft holds.
2. Above the page: "<number> holds <n> entries in this period." The number opens that draft.
3. Tests: `packages/core/test`, `TT=tt_756 pnpm db:setup && TT=tt_756 pnpm verify:db`, the New invoice stories.
