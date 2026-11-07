# Accessibility checklist (WCAG 2.2 AA)

## Color and contrast
- [ ] Body text `--text` (#f4ece6) on `--bg` (#110c0b) ≈ 16:1. `--text-muted` (#a8968e) on `--bg` ≈ 7:1. Keep `--text-faint` (#7d6c65) for non-essential metadata only (≈ 4.2:1, borderline; use it at ≥ 12px for decorative timestamps only).
- [ ] `--on-accent` (#110c0b) on `--accent` (#ef6a2a) ≈ 6.6:1.
- [ ] `--on-brand` (#fbe7ea) on `--brand` (#5c1424) ≈ 11:1.
- [ ] Status never relies on color alone: every status shows an icon/shape **and** a word. This matters doubly because red is also a brand color.
- [ ] White-label themes are validated for AA on save (5i shows "All text pairs pass WCAG AA"); block publishing if a pair fails.

## Keyboard
- [ ] Full keyboard path: Inbox → row (Tab) → Review (Enter) → Approve / Edit / Ask / Reject. Suggested shortcuts in detail view: A approve, E edit, R reject (with confirmation), Esc closes drawers.
- [ ] Bulk select with Space on a focused row; signature rows announce "Signatures must be approved one at a time."
- [ ] ⌘K / Ctrl+K opens the command bar; focus is trapped in dialogs and drawers and returns to the trigger on close.
- [ ] Visible focus: 2px `--accent` outline with 2px offset on every interactive element.
- [ ] Split bar segments are focusable; arrow keys move between them, and the details are announced.

## Screen readers
- [ ] Money is read in full words via `aria-label`: "$2,346.75" → "two thousand three hundred forty-six dollars and seventy-five cents". Negative amounts say "minus".
- [ ] Percentages read as words: "43.65%" → "forty-three point six five percent".
- [ ] The approval card is an `article` labeled by its title, with type, risk, due date and impact in order.
- [ ] Progress bars use `role="progressbar"` with `aria-valuenow` and a text equivalent ("62% of tasks done").
- [ ] The registrations matrix is a real `table` with row and column headers.
- [ ] Agent activity updates use `aria-live="polite"`; only approvals that newly need the user use `assertive`, and only once.
- [ ] Industry terms (ISRC, MLC, PRO, SoundExchange) have an inline explanation on hover **and** focus (tooltip with `aria-describedby`).

## Touch and mobile
- [ ] Minimum 44px targets; mobile primary actions are 46–48px tall.
- [ ] No swipe-only actions; everything is reachable with taps.
- [ ] Respect safe areas and the dynamic type up to 200% without truncating money.

## Motion
- [ ] Honor `prefers-reduced-motion`: no shimmer and no pulse, and drawers appear without sliding.

## Copy
- [ ] No em dashes in UI text.
- [ ] Error messages state whether money or filings were affected.
- [ ] Button labels describe outcomes ("Approve and send $1,240.18", not "OK").
