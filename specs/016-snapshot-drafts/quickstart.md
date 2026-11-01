# Quickstart

`TT=tt_596 pnpm db:setup && TT=tt_596 pnpm verify:db` runs the route, RLS and
schema suites. `pnpm verify:static` covers core, stories and lint.

By hand, as `builder@localhost.test` after `pnpm seed builder@localhost.test`:

1. Open a draft. Log an entry dated in its period. The draft's total stays,
   and a notice reads "1 new entry, …h, in this period".
2. Press Add to draft. The notice goes and the total grows.
3. Press Mark sent. The row reads "Lock N entries · $total" and Keep as draft.
   Confirm. The invoice is sent and its entries are read-only.
4. Download a draft's PDF, edit its notes, and press Mark sent. No banner,
   and Mark sent is not disabled.
