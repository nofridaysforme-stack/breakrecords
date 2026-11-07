# Virtual Label: design

- `Virtual_Label_Claude_Design_Handoff.md`: the design brief (Nov 6, 2026).
- `batch-1/`: Batch 1 (core loop) design sources, one `.dc.html` artboard per screen, plus `canvas.json` for the canvas layout.
  Live canvas: https://claude.ai/artifact/Af9Nw7Lvnw8F7ZpFRBxUep (private until shared).

## Batch 1 boards

| Board | File |
| --- | --- |
| 1 Onboarding: profile pick | `Onboarding.dc.html` |
| 2 Home: Label Head brief | `Main.dc.html` |
| 3 Approval inbox | `Approvals.dc.html` |
| 4 Approval detail (payout, contract, filing, public tabs) | `ApprovalDetail.dc.html` |
| 5 Release runbook: Glasshouse | `Runbook.dc.html` |
| Mobile Home, Approval inbox, Approval detail | `Mobile*.dc.html` |
| States for Home and the inbox | `HomeStates.dc.html`, `InboxStates.dc.html` |
| Component kit and tokens | `Components.dc.html` |

## Tokens

Every board defines the same CSS custom properties on `.vl`, with a dark set under `[data-theme="dark"]`:
`bg, surface, surface-2, line, line-strong, ink, ink-2, ink-3, accent, accent-hover, accent-ink, accent-soft, good(-soft), warn(-soft), crit(-soft)`.
A white-label tenant swaps `accent*`, the wordmark and the fonts (Bricolage Grotesque display, Inter UI). Status colors stay fixed.

Mockup date is Monday, February 1, 2027 (Glasshouse is 5 weeks out). All money matches the Splits spec worked example.
