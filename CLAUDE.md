# Break Records: project rules for Claude Code

Copy this file to the repo root.

- The full design spec lives in `/design`. Start every task by reading `design/CLAUDE_CODE_INSTRUCTIONS.md`.
- Before building or changing a screen, open its PNG in `design/screenshots/` and its frame in `design/design_files/` (search `id="{frameId}"`). Match them.
- Never edit anything inside `/design`.
- Every color, radius, font and size comes from `apps/web/src/styles/tokens.css`. No hard-coded hex values in components.
- Dark theme only. Buttons and inputs 8px radius. Cards 12px.
- Deep orange for primary actions, burgundy for brand blocks, red always with an icon and a word.
- No em dashes in UI text.
- Money is integer cents, shown in IBM Plex Mono with tabular numbers.
- Anything that moves money, signs, files or speaks publicly goes through an approval card. Never auto-execute.
- After each screen: compare a Playwright screenshot against the design PNG, check all five states (empty, working, blocked, error, partial) and keyboard access.

## Backend rules (implementation strategy, Stage 0 onward)

Read `docs/STRATEGY.md` for the current stage and its gate.

- **Layout.** `apps/web` is the Next.js app. `packages/contract` is the API contract (Zod), shared by the UI and every server. `packages/core` is pure logic: money math and approval rules. pnpm workspaces; run `pnpm lint`, `pnpm test`, and `pnpm build && pnpm test:e2e` from the repo root.
- **The contract is the seam.** Every read and write the UI makes has a schema in `packages/contract`. Change the schema first, then the mock, then the UI. `apps/web/src/data/contract-check.ts` fails the typecheck if a mock fixture drifts, and `tests/e2e/contract.spec.ts` checks every endpoint over HTTP.
- **Modules flip one at a time.** `BR_LIVE_MODULES` lists the modules that use the live backend; everything else uses the mock. Never turn on a live module in production; that's Jana's button press.
- **Money is integer cents; shares are basis points.** Splits must total exactly 100.00% (10000 bp). Rounding remainders go to the party named in the rule, never dropped.
- **Approvals are enforced on the server.** The rules live in `packages/core/src/approvals.ts` and every backend uses them: a rejection needs a reason; bulk approve is low risk only and never signatures, all or nothing; blocked items can't be approved; undo works until the action executes. Tools that move money, sign, file or publish must refuse to run without an approved record.
- **Auth** follows the Trading Platform: Auth.js v5 with email magic links (Resend), an allowlist, and database sessions. Tenancy (licensee, label, payee) is enforced in Postgres row-level security using a per-request user and tenant setting, not in the UI.
- **Secrets** live only in environment settings. Claude Code works against staging keys, never production.
- **Never alone:** production migrations on money tables, turning on a live module flag, or sending real email, money or filings.
