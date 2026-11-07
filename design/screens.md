# Screens

The ids match the frame badges in `design_files/`. All desktop frames are 1440 wide: 240px sidebar + content. Copy shown in quotes is final.

## Batch 1 · Core loop (Batch 1 file)
**2a Onboarding, profile pick.** No sidebar. Header with logo, a 9-step progress bar (current step 28px wide, others 14px, all 6px tall) and "About 8 minutes left". Title "How do you put out music?". 5 profile cards in a row (min-height 360). The selected card has a 2px `--accent` border and `--surface-raised`. Each card has a radio, name, who it's for, and a "Turns on" list. Footer: Back · "Everything here is editable later." · "Continue as {Profile}".
Steps: welcome, profile, name, country, distributor (skippable), catalog upload, PRO status, autonomy, finish → Home with the goal box.

**2b Onboarding, autonomy.** Split layout: a left column with 4 autonomy rows ("Draft and wait" marked Recommended), and a right 520px burgundy Label Head panel showing a summary of answers so far.

**2c Home.** 3 columns: sidebar | main | 310px agent activity rail.
- Main, top to bottom: command bar (⌘K) + date/avatar; burgundy weekly brief (eyebrow, "Good morning, Jana.", 3 sentences, "Ask the Label Head"); "Needs you 4" + 3 approval cards; a 5-cell numbers strip (Income this period, Owed to payees, Recoupment, Cash next 90 days, Unclaimed found); Active goals (progress bars) beside Coming up (dates).
- The rail lists agent chips with one-line text and a time.

**2d Approval inbox.** Title + "Nothing moves until you approve." Filters (Artist, Release, Dept), type tabs with counts, then a bulk bar when anything is selected ("2 low-risk items selected", "Signatures are always approved one at a time.", Clear, Approve 2). Grouped sections: Money, Signature, Filing, Public, Plan. An empty group shows a dashed note.

**2e Approval detail, payout.**
- Breadcrumb. The outcome sentence is the H1: "If you approve, $1,240.18 goes to 6 payees on Nov 10 from October statements."
- 4 stat cells, then the payee table (payee, source, tax form status, withheld, net) with a total row.
- A link to one waterfall.
- Action bar: Approve and send / Edit then approve / Ask the agent / Reject with reason (right).
- Evidence drawer on the right.

**2f Approval detail, contract.** Left: outcome H1, "In plain words" summary grid, "2 terms differ from your playbook" cards (draft vs playbook side by side, "Why it matters", Use playbook wording / Accept as drafted), action bar. Right 420px: Label Head note, then the document preview on `--surface-sheet` with flagged clauses highlighted in red. Off-template contracts add "Attorney review recommended".

**2g Release runbook.**
- Header on `--surface`: 150px cover, release title 52px, artist · date · status, budget bar, and the buttons "Change date" and "What blocks delivery?".
- Body: a timeline (130px phase column with a 2px rail colored by state: green done, orange current, faint future; "You are here" tag) and task rows (title, owner, status). Gates use the gate lock component.
- Right 360px: asset grid (3 columns), Registrations list with pills, and the burgundy "Playlist pitch draft" with "Copy for Spotify for Artists".

**2h Mobile Home / 2i Mobile Approvals.** 390 wide, 22px padding. Home stacks the brief, "Needs you 4" + 1 card, 2 numbers, and 1 goal. Approvals shows type chips and stacked cards with 46–48px Approve/Review buttons. No swipe gestures. A "1 more below" line hints at overflow.

**3a–3j States.** Side-by-side pairs for Home and Approvals: empty, working, blocked, error, partial. See `flows.md`.

## Batch 2 · Money (Batch 2 file)
**4a Splits editor.** Sidebar | 300px split tree | main. Main has: header (breadcrumb, "Who gets what", Preview a payout, Send v5 for signatures); the v4 card (signed, 100%, bar + party table); the v5 draft card (invalid, 95%); then 3 cards (Deal terms, Worth a look, Version history).

**4b Royalties.** Money tabs (Royalties, Statements, Payouts, Recoupment, Budgets). Period/artist filters, 4 stats, By source (horizontal bars) + By artist, Unmatched lines (match bar, resolve CTA), and Tracks that earned $0.00 (labeled "Under 1,000 streams", explained as expected).

**4c Statement detail.** H1 "Kesi Vale earned $2,346.75 from Glasshouse in October", waterfall table with running balance, burgundy total row. Right 340px: Q&A with the Royalties Agent ("Why is this lower than September?").

**4d Payouts.** Batch table (Awaiting approval / Draft / Sent / Failed for 1), tax forms list with fix links, carried-forward balances under $25.00.

**4e Recoupment.** One card per release: recouped bar, 4 stats (Advance, Recoupable costs, Total, Recouped/Projected date), and costs by category with the recoupable share.

**4f Payee portal.** A separate minimal app: top nav (Earnings, Statements, Tax forms, Profile), H1 with the next payment, 4 stats, a simple statement, and "Splits you're part of" with signature status. **4g/4h** are the mobile portal and mobile statement.

## Batch 3 · Rights and operations (Batch 3 file)
**5a Catalog.** Tabs (Songs, Recordings, Releases, Assets) and a recordings table (art, title, artist, ISRC, metadata score bar, AI use). A right 380px detail panel shows identifiers, credits and the completeness note.
**5b Contracts.** Agreements table (agreement + template, parties, key terms, next date + what, signatures) and template cards.
**5c Registrations.** A matrix of rows (recordings) × PRO, MLC, SoundExchange owner, SoundExchange artist, Copyright, Neighboring. Each cell is a status pill + reference number. A legend sits top right. Callouts: "! 3 MLC filings need you" and "$312.40 unclaimed found".
**5d Funding.** Tabs and 3 opportunity cards (type, fit, title, amount, cost, deadline, draft, verified stamp, Pursue/Compare + Dismiss). Permanent offers carry a red "! Permanent." box.
**5e Offer comparison.** H1 with each offer's true cost. Columns: No offer / advance / sale. Rows: cash now, you give up, term, buy-back, effective yearly cost, income next 5 years, cost over 5 years. Includes the assumptions note. Accepting routes to approval. **5j** is the mobile version as stacked cards.
**5f Departments.** An editing panel (autonomy dial, spend cap, hand to a person) and a 4-column grid of 14 department cards (Phase 2 ones at 55% opacity).
**5g Activity log.** Filterable rows (time, kind, text, who, id). Expanded rows show Inputs / Reasoning / Output. Export button.
**5h Settings.** A sub-nav and an approval routing table (type, rule, approver, threshold), 3 config cells, and 6 integration cards (Connected / Not connected / Token expired).
**5i White-label theming.** Logo drop, 5 color tokens with an AA check, domain/email/DNS, sub-tenants, and a live preview rendering the app in the tenant's tokens.
