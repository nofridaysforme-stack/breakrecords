# Break Records

An AI-run independent record label platform. The human is the label head; AI agents are staff. Agents prepare the work, and the human approves anything that moves money, signs, files or speaks publicly.

## Design spec

The full Phase 1 design lives in [`design/`](design/): 37 mockup frames across three batches, with a screenshot for each one, plus the design source files, tokens, sample data and screen, component, flow and accessibility docs. Never edit files in `design/`. They are the spec.

Start with [`design/CLAUDE_CODE_INSTRUCTIONS.md`](design/CLAUDE_CODE_INSTRUCTIONS.md). Project rules for Claude Code are in [`CLAUDE.md`](CLAUDE.md).

## Building with Claude Code

Open a Claude Code session on `main` and say:

> Read design/CLAUDE_CODE_INSTRUCTIONS.md and start with Phase A. Before building each screen, open its PNG in design/screenshots/ and its frame in design/design_files/, and match them. Do not edit anything in /design. Commit after each phase and tell me what you built and anything you couldn't match.

## Development

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run lint       # typecheck plus lint:copy (no em dashes, no hard-coded hex outside src/styles/tokens.css)
npm test           # Vitest: money, words, splits math, waterfall
npm run build && npm run test:e2e   # Playwright: accessibility (axe), keyboard, layout; screenshots go to artifacts/screens/
```

Reference pages: `/dev/type` (type ramp and color tokens) and `/dev/components` (every component in every state, labeled with its design frame).

### Batch 1 screens

| Frame | Route |
| --- | --- |
| 2a, 2b (and undrawn steps) | `/onboarding/welcome` to `/onboarding/finish` |
| 2c, 2h | `/` |
| 2d, 2i | `/approvals` |
| 2e, 2f (plus undrawn filing and grant bodies) | `/approvals/apr_payout_oct`, `/approvals/apr_producer`, `/approvals/apr_mlc`, `/approvals/apr_grant` |
| 2g (plus the undrawn releases list) | `/releases/rel_glasshouse`, `/releases` |
| 3a to 3j | add `?state=empty`, `working`, `blocked`, `error` or `partial` to `/` or `/approvals` |

### Batch 2 screens

| Frame | Route |
| --- | --- |
| 4a | `/splits/gh-rec` (other tree nodes show what they inherit) |
| 4b | `/money/royalties` |
| 4c | `/money/statements/ST-2026-10-KV` (list at `/money/statements`) |
| 4d | `/money/payouts` |
| 4e | `/money/recoupment` (undrawn Budgets at `/money/budgets`) |
| 4f, 4g | `/portal` (the payee portal; `?as=kesi` switches payee, Marco Dela by default) |
| 4h | `/portal/statements/ST-2026-10-KV?as=kesi` |

Every Batch 2 screen also takes `?state=` for the five data states. The portal shows v5's signature request only after v5 is fixed to 100% and sent from the splits editor.

### Batch 3 screens

| Frame | Route |
| --- | --- |
| 5a | `/catalog/recordings` (also `/catalog/songs`, `/catalog/releases`, `/catalog/assets`; `?id=` picks a recording) |
| 5b | `/contracts` (undrawn template detail at `/contracts/templates/{artist,producer,feature,split,sync}`) |
| 5c | `/rights/registrations` (undrawn `/rights/unclaimed` and `/rights/claims`) |
| 5d | `/funding` (also `/funding/applications`, `/funding/offers`) |
| 5e, 5j | `/funding/offers/compare` (5j is the same route under 768px) |
| 5f | `/departments` (`?dept=` opens one) |
| 5g | `/activity` |
| 5h | `/settings/routing` (and the other Settings sections) |
| 5i | `/settings/white-label` |
| undrawn | `/roster` |

Every Batch 3 screen takes `?state=` for the five data states. Accepting an offer, drafting from a template and preparing a claim create approvals; nothing is accepted, signed or filed. The theme editor applies the tenant's colors as CSS variables on the preview (and on the whole app with "Try it on this app"), and refuses to publish while any text pair is under 4.5:1.

The mock API lives in `src/data/api.ts` and is served under `/api/*`. Approvals you make are kept for the browser session only; nothing is sent, paid, signed or filed.

`npx playwright test --project=visual` saves one screenshot per frame to `artifacts/screens/{id}.png` for side-by-side review with `design/screenshots/`.

`.npmrc` sets `legacy-peer-deps=true`: without it npm crashes resolving Vitest 4's optional peer dependencies.
