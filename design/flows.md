# Interactions, flows and state

## Core loop
1. The user types a goal (goal box on Home empty state, or ⌘K anywhere).
2. The Label Head returns a **Plan preview** → "Approve plan" creates a goal + runbook and tasks per department.
3. Agents work; progress shows only as chips, the activity rail and goal %.
4. Anything that moves money, signs, files or is public becomes an **Approval** (type money | signature | filing | public | plan).
5. The user chooses Approve / Edit then approve / Ask the agent / Reject with reason. A reject requires a reason (free text, min 1 char).
6. Results feed the weekly brief and the numbers strip.

## Navigation
- Sidebar items route to top-level pages. Activity log and Settings live in the sidebar footer.
- ⌘K command bar: search catalog, people and money; plain-language goals start a plan.
- The Label Head panel is a 380px right drawer, available on any screen, that answers questions about what's on screen. It opens on demand, and the "Needs you" count is always visible.
- Home cards → Approval detail. Inbox row "Review" → Approval detail. Amounts → waterfall (Statement detail or inline popover).
- Payees who aren't label members only see the Payee portal.

## Approval rules
- Bulk approve is allowed only for items flagged low risk and never for signatures (their checkbox is disabled with an explanation).
- Approving a payout with a missing tax form is blocked; offer "Pay the other N now" or "Ask {payee} for a W-9".
- Split edits create a new version with an effective date. Payouts under an unsigned version are held in suspense.
- A split version can't be sent for signature unless it totals exactly 100%.
- Accepting a funding offer routes to an approval. Ownership-sale offers always show "Permanent".
- Changing a release date: the Label Head recalculates the runbook and shows the diff as a Plan approval.

## States (every data screen)
| State | Pattern | Example |
| --- | --- | --- |
| Empty | One sentence + one action | 3a goal box, 3b "Nothing needs you right now" |
| Loading / working | Skeleton blocks on `--surface` + an orange "working" chip; no spinners | 3c, 3d |
| Waiting on you | Default approval card | 2c, 2d |
| Blocked | Red border, what's missing, who owns it, one fix action | 3e, 3f |
| Error | What failed, **whether money or filings were affected**, error + audit id, Retry | 3g, 3h |
| Partial data | Shows what is known, labels the gap, Connect button | 3i, 3j |

## Motion
Quiet. 150ms ease-out for hover and color changes; 200ms for drawers sliding in from the right. A skeleton shimmer is optional and disabled under `prefers-reduced-motion`. No celebratory animation on approve; replace the card with a one-line confirmation and an Undo for 5 seconds where the action isn't yet irreversible.

## Responsive
- 1440 / 1280: as designed. At 1280 the right rail collapses into a toggle.
- 1024: the sidebar collapses to a 64px icon rail; three-column layouts drop the right rail.
- 390: Home, Approvals, Approval detail, Payee portal, Statement and Offer comparison have dedicated layouts. Others use a single-column fallback. Bottom tab bar. All targets ≥44px.
- Density: the `data-density="compact"` toggle in Settings for labels with many releases.

## Suggested data model
```
Label { id, name, profile, country, autonomyDefault, theme }
Artist { id, labelId, name, type: solo|band|producer }
Party { id, name, role, taxForm: {type, status, expires}, bank }
Song { id, title, iswc, writers[] }           // composition
Recording { id, songId, title, isrc, metadataScore, aiUse, credits[] }   // master
Release { id, title, artistId, upc, date, budget, spent, status, coverUrl }
SplitVersion { id, nodeRef, version, effectiveFrom, shares[{partyId, rule, pct}], signatures[{partyId, signedAt}], status }
Statement { id, partyId, period, lines[WaterfallLine], net }
WaterfallLine { label, rule, amount, balance, sourceRef }
PayoutBatch { id, period, payees[], total, status: draft|awaiting|sent|failed, carryForward[] }
Recoupment { releaseId, advance, costs[{category, amount, recoupablePct}], recouped, projectedDate }
Registration { recordingId, org: PRO|MLC|SX_OWNER|SX_ARTIST|COPYRIGHT|NEIGHBORING, status, ref }
Contract { id, template, parties[], keyTerms, dates[{date, what}], signatureStatus, flags[] }
FundingItem { id, type: grant|advance|sale, amount, cost, deadline, verifiedAt, fit, permanent }
Department { id, name, agentName, state, autonomy, spendCap, assigneeId, phase }
Approval { id, type, title, agent, impact, due, risk, payloadRef, evidence: {reasoning, inputs[], steps[], auditId}, status }
ActivityEvent { id, at, kind, text, actor, inputs, reasoning, output }
Goal { id, title, pct, meta, releaseId? }
```

## Client state per screen
- Inbox: `selectedIds:Set`, `filters{artist,release,dept}`, `activeType`.
- Approval detail: `mode: view|edit`, `evidenceOpen`, `rejectReason`.
- Splits editor: `selectedNode`, `draftShares`, `total` (derived), `isValid = total === 100`.
- Runbook: `releaseDate`, `pendingDateChange`, `openTaskId`.
- Offer comparison: `assumptions{annualIncome, growth}`. All derived numbers recompute from this.
