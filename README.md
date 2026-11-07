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

`.npmrc` sets `legacy-peer-deps=true`: without it npm crashes resolving Vitest 4's optional peer dependencies.
