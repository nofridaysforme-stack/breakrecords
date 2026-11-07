# Implementation strategy: where we are

The plan is the End-to-End Implementation Strategy (Nov 7, 2026): keep the typed API as the seam, replace the mock behind it one module at a time in the order money flows, and take each module live only after a pilot user completes the real task with it.

## Current stage: Stage 0, foundation

Gate: the contract is frozen and both the mock and (later) the live server pass the same contract tests; the money rules run in shared code; nothing in the UI holds state the server doesn't know about.

### Done

- pnpm workspace: `apps/web`, `packages/core` (money math, approval rules), `packages/contract` (Zod).
- Contract for every read the UI makes (30 endpoints), checked at compile time (`contract-check.ts`) and over HTTP (`contract.spec.ts`).
- Approvals moved from browser storage to the server: `GET /api/approvals/state`, `POST /api/approvals` (propose), `POST|DELETE /api/approvals/{id}/decision`, `POST|DELETE /api/approvals/decisions` (bulk). Rules enforced in `packages/core/src/approvals.ts`.
- Module flags: `BR_LIVE_MODULES` (all modules on the mock until their stage).
- Auth decision: Auth.js v5 magic links with an allowlist, as in the Trading Platform.

### Left in Stage 0

| Item | Why |
| --- | --- |
| Move the other browser-only state behind the API: split v5 send and signatures, onboarding answers, published theme, profile claims, dismissed funding cards | The strategy's seam only works if the server knows everything the UI shows |
| Write schemas for those writes in `packages/contract` | Same contract for mock and live |
| Replace v1 `Display` strings with structured fields (ISO dates, cents, basis points), module by module | Live servers should send data, not formatted text |
| Screenshot baselines (`toHaveScreenshot`) for the 37 frames | Turns visual tests from "saved for review" into a merge check |
| CI: lint, unit, contract, e2e and visual checks required on every pull request | "Nothing merged without tests" |
| Postgres schema and migrations (dbmate, as in the Trading Platform) with row-level security for licensee, label and payee | First live module needs it |
| Auth.js wiring, allowlist and roles (owner, team, payee) | Pilots sign in |
| Hosting accounts (database, web, Inngest, Sentry) | Outside the code; see the strategy's start-now list |

### Waiting on Jana

- The strategy's "Decisions for Jana" list (Trolley, LabelGrid, attorney and CPA, pilots, pricing, Funding approval type).
- Postgres host: Supabase (strategy) or Railway (Trading Platform). Auth.js works with either.
- The two embedded blocks in the strategy doc (the 10-step pipeline graphic and the 7 stages with gates and durations) didn't come through in the copy shared with Claude Code; stage boundaries here follow the doc's text.

## Stages after this

Stage 1 data in (catalog, statements), Stage 2 agreements, Stage 3 money out (point of no return: attorney sign-off, insurance, staging rehearsal), Stage 4 agents, Stage 5 releases and billing. See the strategy doc for the gates.
