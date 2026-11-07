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

The mock API lives in `src/data/api.ts` and is served under `/api/*`. Approvals you make are kept for the browser session only; nothing is sent, paid, signed or filed.

`npx playwright test --project=visual` saves one screenshot per frame to `artifacts/screens/{id}.png` for side-by-side review with `design/screenshots/`.

`.npmrc` sets `legacy-peer-deps=true`: without it npm crashes resolving Vitest 4's optional peer dependencies.
