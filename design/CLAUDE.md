# Break Records: project rules for Claude Code

Copy this file to the repo root.

- The full design spec lives in `/design`. Start every task by reading `design/CLAUDE_CODE_INSTRUCTIONS.md`.
- Before building or changing a screen, open its PNG in `design/screenshots/` and its frame in `design/design_files/` (search `id="{frameId}"`). Match them.
- Never edit anything inside `/design`.
- Every color, radius, font and size comes from `src/styles/tokens.css`. No hard-coded hex values in components.
- Dark theme only. Buttons and inputs 8px radius. Cards 12px.
- Deep orange for primary actions, burgundy for brand blocks, red always with an icon and a word.
- No em dashes in UI text.
- Money is integer cents, shown in IBM Plex Mono with tabular numbers.
- Anything that moves money, signs, files or speaks publicly goes through an approval card. Never auto-execute.
- After each screen: compare a Playwright screenshot against the design PNG, check all five states (empty, working, blocked, error, partial) and keyboard access.
