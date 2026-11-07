# Components

Token names refer to `tokens.css`. Every interactive element needs a visible focus ring: 2px `--accent` outline, 2px offset. Hover on secondary buttons = `--surface-raised` fill; hover on primary = `--accent-hover`.

## Buttons
| Variant | Style | Use |
| --- | --- | --- |
| Primary | bg `--accent`, text `--on-accent`, 700 14–15px, radius 8, padding 10–13px × 16–22px | One per decision surface: Approve, Continue, Draft a plan |
| Secondary | transparent, 1px `--line-control`, text `--text`, 600 | Review, Edit then approve, Ask the agent |
| On brand | transparent, 1px `--brand-line`, text `--on-brand` | Buttons inside burgundy blocks |
| Destructive | transparent, 1px `--critical-line`, text `--critical` | Reject, Reject with reason. Always pushed right with `margin-left:auto` |
| Mobile | height 46–48px, full-width pair with 10px gap | All phone actions |
Disabled: 45% opacity plus a reason in adjacent text (for example, signature cards can't be bulk-approved).

## Approval card
- Container: `--surface`, 1px `--line`, radius 12, padding 18.
- Row 1: eyebrow `{type icon} {TYPE}` (mono 11 uppercase, `--text-muted`) left; risk flag right (rotated 7px square + label in the risk color).
- Title 16/600. Meta "{agent} · due {date}" 13 `--text-muted`. Impact line in mono 15/600 ("$1,240.18 to 6 payees").
- Actions: Primary + Review, equal width.
- Risk levels: Low risk (`--good`), Due soon (`--warn`), Needs your eyes (`--critical`), Blocked (`--critical`, border `--critical-line`).
- Inbox row variant (2d): grid `22px | 1fr | 230px | 90px | 160px | 190px`. Checkbox 18px radius 5. Selected = checkbox filled `--accent` and row border `rgba(239,106,42,.4)`. Signature rows show a 30% opacity checkbox (not selectable).
- States: default, selected, preparing (title + "ready in about 2 minutes", orange "Preparing" chip), blocked (red border, reason sentence naming the owner, a fix action), approved-then-failed (3h).

## Agent chip
7px dot + "{Agent} · {state}". States and dot colors: idle `--text-muted`, working `--accent`, waiting on you `--critical`, blocked `--critical`, done `--good`. Never animate loudly. At most a slow 2s opacity pulse on "working", and none under `prefers-reduced-motion`.

## Autonomy dial (5f, 2b)
Segmented control of 4 stops: Observe · Suggest · Draft and wait · Act within limits. Each stop has name 14/700 and a one-line description 12. Selected stop: bg `--accent`, text `--on-accent`. Container `--bg`, padding 4, radius 10. Disabled stops: 40% opacity with an explanation underneath. Always show the reminder that money, signatures, filings and public posts still need approval.

## Split bar (4a)
- 40px tall, radius 8, 2px gaps between segments, `flex` = share.
- Labels appear inside a segment only when it's ≥10% wide. Narrower segments rely on the party table or legend below.
- Must total 100%. When it doesn't: card border `--critical`, 4px inset left shadow `--critical`, header message "! 5% of net profit is unassigned", and an extra striped segment (`repeating-linear-gradient(135deg, --critical 0 6px, --bg 6px 12px)`) sized to the gap, plus a legend row under the bar.
- Hover a segment to show a tooltip: party, rule, share, signature status.

## Split tree (4a)
Indent 14px per level. Caret ▾/▸. Selected node `--surface-raised`, 700 weight. Tags: "Override" (orange outline) and "inherits" (faint mono). Collapsed by default below release level.

## Money value
Mono, tabular-nums. Show the currency code only when it isn't USD. Negative amounts use "−" (U+2212). Clickable to expand its waterfall. Screen reader label in full words.

## Waterfall row (4c)
Grid `step | rule | amount | running balance | source`. Subtotal rows (Net profit, Artist share) use `--surface-raised` and weight 700. The final total row sits on `--brand`. The source is a mono link to the statement row.

## Status pill
Inline-flex, 1px border in the status color, radius 6, padding 4×9, 13/600, `{icon} {label}`. "Needs you" also gets `--critical-tint` fill. See `tokens.json > status`.

## Gate lock (2g)
Runbook task row prefixed "Gate:" in 700, bg `#190f0e`. Unmet: border `--critical-line`, status "Locked". Shows "Owner: {dept} · waiting on {person}".

## Verified stamp
Mono 11 `--text-faint`: "Last verified {date} · source" (source is a link). Required on rates, grant deadlines and policies.

## Evidence drawer (2e)
A 380px right panel on `--surface`. Sections: Why this batch (prose), Inputs used (rows linking to records), Steps the agent ran (✓ list), and a footer "Audit ID {id} · Open in log".

## Goal box (3a)
A 2px `--accent` border input with an inline primary "Draft a plan" button, plus example chips below.

## Plan preview
Not drawn yet. Build it from runbook parts: phases, tasks, owners, budget, dates, and an "Approve plan" primary button. It routes to the inbox as a Plan approval.

## Market-range warning (4a)
A neutral card (not red) with the eyebrow "◇ Worth a look". It says what the common range is, where this term sits, why it matters, and carries a verified stamp.

## Label Head block
A burgundy `--brand` block, radius 12. Eyebrow with an 8px orange square + "LABEL HEAD · …". First-person copy.

## Sidebar (`BR Sidebar.dc.html`)
- 240px, `--bg-sidebar`. Logo, then the label switcher (a bordered 8px box), then 12 nav items in brief order.
- Active item: `--surface-raised` and a 6px orange square.
- The Approvals badge is orange.
- Marketing is faint with a "Phase 2" tag.
- Footer: Activity log, Settings, Help.

## Mobile tab bar
4 equal items (Home, Approvals N, Releases, Money; the payee portal uses Earnings, Statements, Tax, Profile). Active item: orange 700. 22px bottom safe-area padding.
