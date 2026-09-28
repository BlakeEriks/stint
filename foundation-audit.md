# Foundation audit (working file, to be removed before merge)

Every claim in the foundational docs, tested against its doc's purpose. Storybook's
version of each file is the baseline, since it merges first.

**Verdicts**
- **Keep**: the claim stays here, with its mechanism.
- **Move**: another doc owns it.
- **Cut**: it's gone.

`C1` is constitution Part 1 (Product). `C2:<category>` is Part 2 (Engineering).

## Constitution: `.specify/memory/constitution.md`

**Test:** `/speckit-plan` or a reviewer would reject a design because of it, and it names a mechanism or an issue-linked TODO.

| Claim | Verdict |
| --- | --- |
| Sync Impact Report history (60 lines) | **Cut**. Git holds it. |
| Preamble: "a principle without a mechanism is a hope" | **Keep** as the amendment rule |
| I. One running timer, partial unique index | **Keep**, C2:Data integrity |
| II. RLS on every table, explicit `grant execute`, `verify:schema` | **Keep**, C2:Security |
| III. No Server Actions; `ApiError` and `requireSession()` on every route | **Keep**, C2:Boundaries. Drop "Expo". TODO → issue. |
| IV. Dual-written logic has a real-Postgres parity test, zero case included | **Keep**, C2:Data integrity. The `0`-is-a-rate convention folds in here. |
| V. Never silently modify user data; the inbox is the one surface | **Keep**, C1 |
| VI. `packages/core` has no I/O | **Keep**, C2:Boundaries. TODO → issue. |
| VII. RLS verified correct, cross-user test per table | **Keep**, C2:Security |
| VIII. Secrets (gitleaks) + unexpected errors | **Split**: secrets → C2:Security; errors → C2:Observability (Sentry) |
| IX. Migrations additive; column retirement takes two releases | **Keep**, C2:Change safety. TODO → issue. |
| Doc Ownership table | **Cut**. CLAUDE.md owns it. |
| Conventions: UUIDv7 idempotent ids | **Keep**, C2:Data integrity |
| Conventions: money is `numeric(12,2)` | **Keep**, C2:Data integrity. Mechanism: add to `verify:schema`. |
| Conventions: archive, don't delete | **Keep**, C2:Data integrity. Mechanism: the immutability triggers in `00000000000002_integrity.sql`. |
| Jurisdiction (US) | **Move** to `positioning.md` (the user) |
| Never point local at prod; `pnpm worktree` | **Cut**. CLAUDE.md owns it. |
| Governance: which doc wins over which | **Rewrite** to one line: positioning wins on product, this doc on engineering |
| Main-branch bar: `verify:static` and `verify:db` green | **Keep**, C2:Delivery. Mechanism: required checks. |
| Amendments (semver) | **Keep**, plus the new rule: category + mechanism + trace to positioning or an incident |
| Compliance paragraph | **Keep** one sentence |

## Principles: `docs/design/principles.md` (folds into the constitution, then deleted)

| Claim | Verdict |
| --- | --- |
| The test: "does this help one contractor track time and get paid?" | **Keep**, C1. It's the feature gate. |
| The invoice is the product | **Cut**. Duplicates positioning. |
| Earned leads; bucketed by work date | **Move** to a comment in `home-month.tsx` |
| Unbilled sits beside earned | **Move** to a comment in `home-month.tsx` |
| Collected, awaiting and unbilled are never summed | **Keep**, C1. Getting it wrong costs money. |
| One timer per user | **Cut**. Duplicates I. |
| Never silently modify | **Cut**. Duplicates V. |
| Rates and payment details freeze at generation | **Keep**, C2:Data integrity. Mechanism: immutability triggers + invoice tests. |
| Preview before anything irreversible | **Keep**, C1 |
| Archive, don't delete | **Cut**. Duplicate. |
| Invoices go out from the user's own address | **Cut**. Positioning's scope ("sends no mail") owns it. |
| Home is where the habit lives | **Cut**. It doesn't gate a design. |
| A card ships only with a number you can't compute, or a row to act on | **Move** to `web-ui.md` |
| A figure that moves must be true (no streaks or scores) | **Keep**, C1. It rejects features. |
| A gesture that writes is made deliberate | **Move** to a comment in the calendar drag code |
| Green is the one color; accent = the running timer + one confirm per screen | **Move** to `web-ui.md` as a convention. **Blake decides the wording, or whether it survives at all.** |
| Weight tracks frequency; filled red only on the destroying step; neutral focus rings | **Move** to `web-ui.md` |
| Depth increases toward what is read, four planes | **Move** to `web-ui.md`. `deriving-color.md` owns the numbers. |
| Color belongs to the client | **Move** to `web-ui.md` (already there as a component row) |
| A number is a mono role | **Cut**. `check:type` and the type roles enforce it. |
| Motion reports a change; reduced motion | **Move** to `web-ui.md` |
| The mark's usage | **Move** to a comment on `brand.mark` in `tokens.json` |
| Platform scope: web builds features; native only for what only it can do | **Keep**, C1. It gates features. `architecture.md`'s surfaces table cites it. |

## Positioning: `docs/positioning.md`

**Test:** it changes what we build or what we charge.

| Claim | Verdict |
| --- | --- |
| The user: a US solo hourly contractor | **Keep**, plus the jurisdiction line from the constitution |
| They distrust; they want the number right and the price stable | **Keep** |
| The one line | **Keep** |
| The money view is priced for a team | **Keep** one paragraph |
| "This is a bet on their behavior, not a law" (the Harvest and Zoho funnel analysis) | **Cut**. The final section already frames the bet. |
| The invoice is the product; the timer is the input | **Keep** |
| The price is knowable and stays | **Keep**. It rules out seats and metering. |
| Competitor table + "Zoho is the hardest" | **Keep**. "The answer is never a longer feature list" steers the build. |
| $40/yr, annual only | **Keep** the fact; **cut** the churn rationale |
| Records and exports free; only invoice download is paid | **Keep**. **Gap:** there's no export endpoint in `api.md`, so this promise has nothing built behind it. |
| $555/yr overhead; 15 subscribers cover it; marginal user ≈ $0 | **Keep** one sentence. It also becomes **C2:Cost posture**: no new fixed monthly cost without changing positioning. It's what ruled out Zero and always-on services. |
| No team; the app sends no mail | **Keep** |
| A bet, not validated; 20 conversations would settle it | **Keep** |

## SDLC: `docs/sdlc.md`

| Claim | Verdict |
| --- | --- |
| Flowchart | **Keep**. Restore `/next-feature` (the Storybook branch reverted it). Add smoke in the release gate, and Sentry alert → `bug` `urgent` → `/work-issues`. |
| Review bullets: branch name < 30, Try it, `migration` label, `ready-for-qa` | **Keep** |
| Unbuilt work: spec or issue; the labels; the Alpha and Launch milestones (now in CLAUDE.md) | **Move here** from CLAUDE.md |

## CLAUDE.md

**Test:** getting it wrong anywhere in the repo is costly, and no path-scoped rule covers it.

| Claim | Verdict |
| --- | --- |
| Intro + ownership table | **Keep**. Add rows for the constitution, `web-ui.md` and stories. Remove the `principles.md` row. |
| Meta paragraphs ("proximity is not ownership", under 200 lines) | **Keep**, one sentence each |
| Non-negotiables: timer index, silent modify | **Keep** as one-line pointers to the constitution |
| Server owns timer truth; clients own responsiveness | **Move** to C2:Boundaries. CLAUDE.md keeps a pointer. |
| Accent / green scale / four planes / OKLCH ΔL (four paragraphs) | **Move** to `web-ui.md` and `deriving-color.md`. Law keeps only `--text-on-accent` (`tokens:validate`). |
| No Server Actions | **Keep** as a pointer |
| Semantic tokens only; only clients have a color | **Cut**. `web-ui.md` owns them. |
| Tokens generated, never edit `dist/` | **Keep**. It spans web and Swift. |
| Neutral ramps derived | **Cut**. `tokens:validate` enforces it, and the script says so. |
| Durations mono + tabular | **Cut**. The type roles enforce it. |
| UUIDv7, rate written twice, `0` is a rate, archive | **Cut**. The constitution owns them. |
| Local development: never prod; `pnpm worktree`; merging closes the worktree | **Keep** |
| Generated files and a fresh clone | **Keep** |
| TS 6 until Next supports 7; `@types/node` tracks 24 | **Move** to comments in `dependabot.yml`, where a bump is decided |
| Jurisdiction section | **Move** to positioning. CLAUDE.md keeps one line. |
| Docs: `docs/CLAUDE.md` + Vale + `/copyedit` | **Keep** |
| Unbuilt-work split; milestones | **Move** to `sdlc.md` |
| `api.md` marks unimplemented endpoints | **Move** to `api.md`'s header |
| The app is online-only | **Cut**. `architecture.md` owns it. |
| The mark's geometry is a token | **Cut**. The `tokens.json` comment owns it. |

## `docs/CLAUDE.md`

| Claim | Verdict |
| --- | --- |
| All of it | **Keep**. It's the doc-writing rule, and Storybook already updates it for stories. |

## Architecture: `docs/architecture.md`

| Claim | Verdict |
| --- | --- |
| "What this is" | **Cut**. Duplicates positioning. |
| Surfaces table | **Keep**. Mobile stays as scope, since `apps/mobile` doesn't exist. |
| The shape: a client shell over an HTTP API | **Keep**. It's III's reasoning. |
| Why Next.js / what was rejected | **Cut**. It's a decision log. |
| The timer invariant, 409 as a normal flow | **Keep** |
| Offline: online-only | **Keep** |
| Why there's no offline queue (the removed outbox) | **Cut**. History. |
| "If it comes back, still no sync engine" (vendor research) | **Cut**. C2:Cost posture carries the lasting rule, and git keeps the research. |
| Auth: web, macOS | **Keep** |
| Auth: Expo | **Cut** until `apps/mobile` exists |
| Live updates | **Keep** |
| Hosting; `@react-pdf`; no outbound mail | **Keep** |
| "Supabase free tier pauses" | **Cut**. Positioning says Pro. |
| Repo layout | **Keep**. Add `packages/api-client`. **Gap:** it claims an OpenAPI spec keeps Swift honest, but none is generated. |

## Categories and gaps

| C2 category | Filled by | Missing |
| --- | --- | --- |
| Data integrity | I, IV, UUIDv7, money type, freeze, archive | Money type check in `verify:schema` |
| Security | II, VII, secrets, `requireSession`, CodeQL, Dependabot | none |
| Boundaries | III, VI, server owns timer truth | Two lint TODOs → issues |
| Change safety | IX | The migration rollout check. **API compatibility for Swift:** there's no OpenAPI or contract check, so a changed response breaks the macOS app silently. |
| Cost posture (new) | Fixed cost stays inside the $555/yr bill | none; review-enforced, stated as such |
| Test obligations (new) | Suite per kind of code | `verify-tests.mjs`, core coverage floor |
| Accessibility | `stories` a11y | Needs Storybook merged and `stories` required |
| Delivery | Main bar, release gate, backups | Smoke before promotion |
| Observability | none | Sentry + uptime |

## Questions for Blake

1. **The accent rule:** keep it as a changeable `web-ui.md` convention, or drop it entirely and let each design decide?
2. **Export:** positioning promises free exports and nothing is built. Keep the promise (and file a `feature`), or cut it from positioning?
3. **API compatibility:** add a Change safety principle with a TODO for a contract check (for example, generate OpenAPI from `packages/schema` and diff it with `oasdiff`), or leave it to review until a second client ships?
