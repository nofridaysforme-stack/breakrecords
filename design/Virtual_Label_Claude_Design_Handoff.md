# Virtual Label: Claude Design Handoff

Nov 6, 2026 · @Jana

This brief tells Claude Design what to design for the AI virtual record label: who uses it, every Phase 1 screen with its content and states, the components, the visual direction and realistic sample data. Design the business core first; marketing screens are Phase 2 and appear only as placeholders. The source of truth for behavior is the Org Chart, the Splits and Percentage Spec, the 14 department docs and the Platform Build Plan.

## Scope

Design the desktop web app first, plus mobile layouts for the two screens people use on the go (Approval inbox and Home). Work in three batches so each can be reviewed before the next.

| Batch | Screens | Why this order |
| --- | --- | --- |
| 1. Core loop | Onboarding and profile pick, Home (Label Head brief), Approval inbox, Approval detail, Release runbook | Shows the whole promise: make music, press button |
| 2. Money | Splits editor, Royalties overview, Statement detail, Payouts, Recoupment, Payee portal | The hardest and most trusted part of the product |
| 3. Rights and operations | Catalog, Contracts, Registrations tracker, Funding, Offer comparison, Departments and autonomy, Activity log, Settings, White-label theming | Completes Phase 1 |

Marketing (Phase 2) appears only as a locked nav item and "coming later" department cards.

## Users and the core loop

| Profile | Who | What they care about most |
| --- | --- | --- |
| Solo artist | Releases their own music, often not business-trained | Plain language, the next three actions, getting paid for every stream |
| Band or collective | Several co-owners | Fair splits everyone can see and sign |
| Small indie label | Owner with 2 to 10 artists | Roster view, deal templates, statements artists trust |
| Growing label | Label with some human staff | Roles, approval chains, handing departments to people |
| Label services or manager | Runs releases for artists they do not own | Client separation, service fees |
| Payee (producer, feature, writer) | Gets paid, does not run the label | A simple portal: what I earned, why, when it pays |

The core loop the design must make obvious:

1. The user states a goal ("release a single March 6 on a $3,000 budget").
2. The Label Head shows a plan; the user approves it.
3. Agents work in the background; progress is visible but quiet.
4. Anything that moves money, signs, files or speaks publicly arrives as an approval card.
5. The user approves, edits or rejects; the work continues.
6. Results come back as a weekly brief and live numbers.

## Design principles

1. **The human is the label head; agents are staff.** The UI reads like a calm operations room, not a chatbot. Chat exists, but the primary surfaces are plans, cards and numbers.
2. **Approval is the button.** The "press button" promise lives in the approval card: one clear primary action, the reason, the money or legal impact, and the evidence one click away.
3. **Every number explains itself.** Any amount can be expanded to show its waterfall: source line, fees, recoupment, split, payee.
4. **Show what agents are doing without noise.** Status is ambient (small chips and a quiet activity rail); only checkpoints interrupt.
5. **Plain words first, industry terms second.** Say "song" and "recording" with "composition" and "master" as helper text; explain ISRC, MLC and PRO inline on hover.
6. **Trust signals everywhere money moves.** Version numbers on splits, signature status, "last verified" dates on rates and grant deadlines, and an audit trail link.
7. **Adaptive, not cluttered.** Departments a profile does not need are hidden, not greyed out, and the Label Head suggests turning them on when relevant.

## Navigation and information architecture

Left sidebar with a label switcher at the top (for users in several labels or white-label sub-tenants). Primary items, in order:

1. **Home** (Label Head brief, goals, what needs you)
2. **Approvals** (inbox with a count badge)
3. **Releases** (list, then each release's runbook)
4. **Catalog** (Songs, Recordings, Releases, Assets tabs)
5. **Money** (Royalties, Statements, Payouts, Recoupment, Budgets)
6. **Splits** (deal and split trees per artist, release and song)
7. **Contracts** (library, active agreements, templates, signatures)
8. **Rights** (Registrations tracker, unclaimed money, profile claims)
9. **Funding** (Opportunities, Applications, Offers)
10. **Roster** (artists and contributors; labels only)
11. **Departments** (all 14 with agent status and autonomy dial)
12. **Marketing** (locked, "Phase 2")

Bottom of sidebar: Activity log, Settings, Help. A global command bar (Cmd+K) searches catalog, people and money, and accepts goals in plain language ("plan an EP for May"). A slim right-hand Label Head panel can open from any screen to ask questions about what is on screen.

Payees who are not label members see a separate, minimal portal: Earnings, Statements, Tax forms, Profile.

## Screen specs: priority screens

### 1. Onboarding and profile pick

- **Purpose:** set up the label in under 10 minutes and pick the profile that decides which departments switch on.
- **Steps:** welcome; profile cards (Solo artist, Band, Small label, Growing label, Label services) each listing what turns on; label or artist name; home country; connect existing distributor (or skip); upload a first catalog export; PRO affiliation status; autonomy level (default "Draft and wait" explained in one line); finish on Home with a first goal prompt.
- **Must show:** progress steps, what each profile includes, a promise that everything is editable later.

### 2. Home (Label Head brief)

- **Purpose:** answer "what is happening and what do you need from me" at a glance.
- **Top:** greeting plus a 3-sentence weekly brief written by the Label Head; "Needs you" strip with approval count and the top 3 cards.
- **Middle:** active goals with progress (for example "Glasshouse single, March 6, 62% of tasks done, on budget"); upcoming dates (release, deadlines, grant due dates).
- **Numbers row:** income this period, unpaid balance owed to payees, recoupment status, cash forecast for 90 days, unclaimed money found.
- **Side rail:** quiet agent activity feed ("Metadata Agent completed credits for 4 tracks").
- **Empty state:** "Tell me what you're working on" goal box with example goals.

### 3. Approval inbox

- **Purpose:** the press-button screen.
- **List:** cards grouped by type (Money, Signature, Filing, Public, Plan) with filters by artist, release and department; each card shows title, the agent that prepared it, impact ("$1,240.18 to 6 payees"), due date and risk flag.
- **Bulk:** approve several low-risk items at once; never bulk-approve signatures.
- **Mobile:** this screen must work one-handed: swipe-free, large Approve and Review buttons.

### 4. Approval detail

- **Header:** what will happen if approved, in one sentence.
- **Body by type:** payout batch (payees, amounts, withholding, source statements); contract (plain-language summary, flagged clauses vs playbook, full document); filing (form preview, facts to confirm such as human authorship); public message (draft with edit in place).
- **Evidence panel:** agent reasoning, inputs used, links to source records, audit ID.
- **Actions:** Approve (primary), Edit then approve, Ask the agent, Reject with reason. Off-template contracts show "Attorney review recommended".

### 5. Release runbook

- **Purpose:** one release as a project from 8 weeks out to 90 days after.
- **Header:** cover art, title, artist, release date, budget used vs total, status (On track, At risk, Blocked).
- **Main:** timeline of phases (8, 6, 5, 4, 3, 2 weeks out, release week, after release) with tasks, owning department agent, status and hard gates (split sheets signed, masters accepted, metadata complete) shown as locks.
- **Side:** asset checklist with thumbnails, registrations status (PRO, MLC, SoundExchange, copyright), pitch draft ready to copy into Spotify for Artists.
- **Interactions:** change date (Label Head recalculates and asks), open any task, see what blocks delivery.

## Screen specs: secondary screens

| Screen | Purpose | Key content | Key actions |
| --- | --- | --- | --- |
| Splits editor | Set who gets what, per artist, release, track and song | Split tree (label, artist, release, track, income type) with inheritance shown; stacked bar per node that must total 100%; deal type and terms panel; market-range warnings (for example artist royalty under 15%); version history with effective dates; signature status per party; payouts held in suspense until signed | Edit shares, override a parent, send for signatures, preview a payout with sample income |
| Royalties overview | See all income and where it went | Income by source (distributor, SoundExchange, MLC, PRO, sync, store) and by artist; matched vs unmatched lines; zero-royalty tracks under Spotify's 1,000-stream threshold labeled, not flagged as errors | Drill into any figure, resolve unmatched lines |
| Statement detail | Prove every payout | Waterfall for one payee and period: gross, fees, recoupment, split, commissions, withholding, net; every line links to its source statement row | Download PDF and CSV, ask the agent "why is this lower?" |
| Payouts | Send money | Batches with status (Draft, Awaiting approval, Sent, Failed), tax form status per payee, minimum-payout carry-forward | Approve batch, fix missing tax form |
| Recoupment | Track advances and costs | Per artist and release: advance, recoupable costs by category, recouped to date, remaining, projected recoup date | Add cost, mark recoupable share |
| Catalog | Single source of truth for songs, recordings, releases and files | Tabs for each; identifiers (ISRC, UPC, ISWC); metadata completeness score; AI disclosure field; credits | Edit metadata, upload assets, link song to recording |
| Contracts | Agreements and their obligations | Library of templates; active agreements with parties, key terms, dates (options, reversion, audit window); signature tracker | Draft from template, upload third-party contract for review, send for signature |
| Registrations tracker | Make sure every pipe pays | Matrix: rows are songs or recordings, columns are PRO, MLC, SoundExchange (owner and artist), Copyright Office, neighboring rights; cell status (Not started, Prepared, Needs you, Submitted, Confirmed) | Open prepared filing, mark submitted, add reference number |
| Funding | Find and compare money | Opportunity cards (type, amount, deadline, last verified date, fit score, what it costs); application drafts; offer comparison | Pursue, dismiss, open draft |
| Offer comparison | Make the true cost obvious | Side-by-side offers: cash now, income or rights given up, term, buy-back, effective annual cost, projected earnings without the offer; ownership-sale offers clearly marked permanent | Request more info, decline, accept (routes to approval) |
| Departments | See and tune the 14 departments | Cards with agent names, status, tasks this week, autonomy dial (Observe, Suggest, Draft and wait, Act within limits), spend cap, "hand to a person" toggle; Phase 2 cards locked | Change autonomy, assign a staff member |
| Activity log | Audit everything | Filterable feed of agent runs, tool calls, approvals and edits with inputs and outputs | Open any run, export |
| Settings | Label configuration | Profile, approval routing, caps, statement period, minimum payout, integrations (distributor, PRO, payouts, accounting, e-signature), team and roles | Connect, edit, invite |
| White-label theming | For licensees | Logo, colors, domain, email sender, sub-tenant list | Preview branded app |
| Payee portal | For producers, features, writers | Earnings to date, latest statement, next payout date, tax form status, the splits they are part of | Download statement, update tax form and bank details |

## Component kit

| Component | What it does | Notes |
| --- | --- | --- |
| Approval card | One pending decision | Type icon, title, preparing agent, impact line, due date, risk flag, Approve and Review buttons |
| Agent chip | Shows an agent and its state | States: idle, working, waiting on you, blocked, done; never animated loudly |
| Autonomy dial | Sets how much a department does alone | Four stops with one-line explanations; disabled stops explained |
| Split bar | Shows shares as a stacked bar | Must visibly total 100%; red edge and message when it does not; hover shows party and signature status |
| Split tree | Inheritance from label to track | Overridden nodes marked; collapsed by default below release level |
| Money value | Displays amounts | Tabular figures, currency code when not USD, expandable to its waterfall |
| Waterfall row | One step in a calculation | Label, rule, amount, running balance, source link |
| Status pill | Registration and task states | Not started, Prepared, Needs you, Submitted, Confirmed, Blocked |
| Gate lock | A hard requirement on a runbook | Shows what unlocks it and who owns it |
| Verified stamp | Trust marker | "Last verified" date with source link (rates, grant deadlines, policies) |
| Evidence drawer | Why an agent did something | Inputs, reasoning summary, tool calls, audit ID |
| Goal box | Natural-language goal entry | Example prompts, turns into a plan preview |
| Plan preview | The Label Head's proposed plan | Phases, tasks, owners, budget, dates; Approve plan button |
| Market-range warning | Flags unusual deal terms | Neutral tone, shows the common range and why it matters |

## Visual direction, tone and copy

The brand name and identity are not decided yet, so design with a neutral, swappable token system that white-label tenants can rebrand.

- **Feel:** a confident independent label office: warm, credible, music-literate; not a fintech dashboard and not a neon "AI" product.
- **Type:** one expressive display face for headings and release titles, one highly legible sans for UI, tabular numerals for all money.
- **Color:** a calm neutral base, one accent for primary actions and the Label Head, status colors reserved for meaning (good, warning, critical). Album artwork brings the color; the UI should frame it.
- **Density:** comfortable for solo artists by default, with a compact mode for labels managing many releases.
- **Light and dark themes** from the start, both built from tokens.
- **Copy voice:** direct, plain, encouraging; short sentences; the Label Head speaks in first person ("I drafted the producer agreement; two terms need your eyes"). Agents never claim certainty they lack.
- **Avoid:** robot imagery, sparkle icons for AI, gamification, and any visual that makes AI the star instead of the artist.
- **Rule for all copy:** no em dashes in any UI text.

## Sample data for realistic mockups

All names are invented. Numbers come from the worked example in the Splits spec so screens agree with each other.

| Item | Value |
| --- | --- |
| Label | Northline Records (small indie label profile) |
| Artists | Kesi Vale (solo, R&B), The Low Hours (band of 3, indie rock), Marco Dela (producer and writer) |
| Active release | "Glasshouse" single by Kesi Vale, release date Friday, March 6, 2027, budget $3,000 with $1,860 spent |
| Deal | 50/50 net profit split, label-funded |
| Period income on Glasshouse | $10,000.00 gross |
| Waterfall | Distributor fee $0.00, platform fee $500.00, producer 3 points $285.00, recoupable costs $4,000.00, net profit $5,215.00, label $2,607.50, artist $2,607.50, feature 10% of artist share $260.75, artist nets $2,346.75 |
| Approvals waiting | Payout batch: $1,240.18 to 6 payees; Producer agreement for Marco Dela (2 flagged terms); MLC registration for 3 songs; Grant application draft due in 9 days |
| Funding cards | State arts council project grant (non-repayable); royalty advance offer: $8,000 for 60% of streaming income until repaid; partial catalog sale offer: $15,000 for 50% of one album's income, permanent |
| Registrations | Glasshouse: PRO Confirmed, MLC Needs you, SoundExchange owner Confirmed, SoundExchange artist Prepared, Copyright Not started |
| Agent feed | Metadata Agent completed credits for 4 tracks; Audit Agent flagged an unusual stream spike on "Night Bus" (The Low Hours); Funding Scout found 2 new grants |

## States, responsive and accessibility

**States to design for every data screen**

- Empty (first use, with one helpful next action)
- Loading and agent working (skeletons plus a quiet "working" chip, not spinners everywhere)
- Waiting on you (approval needed, links to the card)
- Blocked (what is missing, who owns it)
- Error (what failed, whether money or filings were affected, retry)
- Partial data (an integration not connected yet, with a connect prompt)

**Responsive**

- Desktop first at 1440 and 1280 wide; tablet at 1024.
- Mobile (390 wide) layouts for Home, Approval inbox and Approval detail; other screens get a readable single-column fallback.

**Accessibility**

- WCAG 2.2 AA contrast in both themes; status never shown by color alone (icon plus label).
- Full keyboard paths for approve, review and reject; visible focus states.
- Money and percentages readable by screen readers with full words ("two thousand three hundred forty-six dollars and seventy-five cents").
- Minimum 44 px touch targets on mobile.

## Out of scope and open questions

**Out of scope for this handoff**

- Phase 2 marketing screens (campaigns, content studio, ads, CRM, DSP pitching, press, radio) beyond locked placeholders
- Marketing website and pricing page
- International screens (multi-currency views, foreign societies) beyond showing a currency code where relevant

**Open questions that affect design**

- [ ] Product name and logo (design with a placeholder wordmark until decided)
- [ ] Pricing model, which changes whether a platform fee line appears in statements
- [ ] Whether the Label Head panel is always visible or opened on demand (recommended: on demand, with a persistent "Needs you" count)
- [ ] Whether solo artists see the word "label" at all, or "your team" instead

## Ready-to-paste prompt for Claude Design

Paste this into Claude Design with this doc attached or linked; start with Batch 1.

```markdown
Design Batch 1 of a desktop web app (plus mobile versions of Home and the Approval inbox) for an AI-run independent record label platform.

Product: artists and small labels make music, fund campaigns and approve decisions; a team of AI agents (one orchestrator called the Label Head plus department agents for legal, royalties, funding, publishing, rights, distribution and releases) does the business work. Agents prepare everything; the human approves anything that moves money, signs, files or speaks publicly. The approval card is the product's "press button" moment.

Screens for Batch 1:
1. Onboarding with profile pick (Solo artist, Band, Small label, Growing label, Label services)
2. Home: Label Head weekly brief, "Needs you" strip, active goals with progress, upcoming dates, key numbers, quiet agent activity rail
3. Approval inbox: cards grouped by Money, Signature, Filing, Public, Plan; filters; bulk approve for low-risk items only
4. Approval detail: one-sentence outcome, type-specific body (payout batch, contract with flagged clauses, filing preview, public message), evidence drawer, Approve / Edit / Ask / Reject
5. Release runbook: cover art header, phase timeline from 8 weeks out to 90 days after, tasks with owning agent and status, hard gates as locks, asset checklist, registration status

Use the sample data in the handoff doc (Northline Records, Kesi Vale, the "Glasshouse" single, the $10,000 waterfall) so every screen agrees.

Visual direction: a confident independent label office; warm, credible, music-literate; not a fintech dashboard and not a neon AI look. Neutral swappable tokens (it will be white-labeled), one accent for primary actions and the Label Head, status colors only for meaning, tabular numerals for money, album art provides the color. Light and dark themes. Plain-language copy, Label Head speaks in first person. No robot or sparkle AI imagery. No em dashes anywhere in UI copy.

Show empty, working, waiting-on-you, blocked and error states for Home and the Approval inbox. Meet WCAG 2.2 AA.
```
