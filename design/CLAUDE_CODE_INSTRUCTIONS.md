# Build instructions for Claude Code: Break Records Phase 1

Read this file first, then follow it step by step. It tells you where every design lives, how to read it, what to build and in what order, and how to check your work against the mockups.

---

## 0. Setup: put the designs in the repo

The designs are not in the repo yet. Copy this entire folder into the repo root as `/design` and commit it before writing any app code:

```
breakrecords/
  design/                      <- this whole folder
    CLAUDE_CODE_INSTRUCTIONS.md
    README.md
    screens.md  components.md  flows.md  accessibility.md
    tokens.css  tokens.json  sample-data.json  original_brief.md
    screenshots/               <- 38 PNGs, one per mockup frame
    design_files/              <- HTML source of every mockup
  CLAUDE.md                    <- copy design/CLAUDE.md here
```

Commit message: `chore: add Phase 1 design handoff`.

Never edit files inside `/design`. They are the spec.

---

## 1. How to read the designs

You have three sources per screen. Use all three.

1. **`screenshots/{id}-{name}.png`**: the picture. Open it with your image viewer before building the screen. This is what it must look like.
2. **`design_files/*.dc.html`**: the exact source. Every element is inline-styled, so you can read exact hex values, font sizes, paddings, gaps and copy. Search by frame id, for example `grep -n 'id="2c"' "design/design_files/Break Records Batch 1.dc.html"`, then read from that line to the next `class="dv-opt"`. Treat this as a measurement source, not code to copy. Do not import `support.js` or any `.dc.html` into the app.
3. **`screens.md`**: the written spec per frame id: layout, components, final copy and behavior that a picture can't show.

When they disagree: `original_brief.md` wins on behavior, the `.dc.html` source wins on visual values, `screens.md` wins on copy.

---

## 2. Complete mockup index (38 frames)

All desktop frames are 1440 wide (240px sidebar + content) unless noted. Mobile frames are 390×844.

### Batch 1. Core loop (`Break Records Batch 1.dc.html`)
| Id | Screen | Screenshot | Route |
| --- | --- | --- | --- |
| 2a | Onboarding, step 2 of 9: profile pick | `2a-onboarding-profile.png` | `/onboarding/profile` |
| 2b | Onboarding, step 8 of 9: autonomy dial | `2b-onboarding-autonomy.png` | `/onboarding/autonomy` |
| 2c | Home, Label Head brief (direction 1a, "ops room") | `2c-home.png` | `/` |
| 2d | Approval inbox, two low-risk items bulk-selected | `2d-approval-inbox.png` | `/approvals` |
| 2e | Approval detail, payout batch, evidence drawer open | `2e-approval-detail-payout.png` | `/approvals/:id` |
| 2f | Approval detail, producer agreement with flagged clauses | `2f-approval-detail-contract.png` | `/approvals/:id` |
| 2g | Release runbook, Glasshouse | `2g-release-runbook.png` | `/releases/:id` |
| 2h | Mobile Home | `2h-mobile-home.png` | `/` at < 768px |
| 2i | Mobile Approvals, one-handed, no swipe | `2i-mobile-approvals.png` | `/approvals` at < 768px |

### Batch 1. States (same file, 700×420 crops)
| Id | State | Screenshot |
| --- | --- | --- |
| 3a | Home · empty, first use (goal box) | `3a-home-empty.png` |
| 3b | Approvals · empty, all clear | `3b-approvals-empty.png` |
| 3c | Home · loading and agent working | `3c-home-working.png` |
| 3d | Approvals · agents preparing | `3d-approvals-working.png` |
| 3e | Home · blocked goal | `3e-home-blocked.png` |
| 3f | Approvals · blocked card | `3f-approvals-blocked.png` |
| 3g | Home · error | `3g-home-error.png` |
| 3h | Approvals · approved, then failed | `3h-approvals-failed.png` |
| 3i | Home · partial data (missing connection) | `3i-home-partial.png` |
| 3j | Approvals · partial data | `3j-approvals-partial.png` |

These patterns apply to **every** data screen, not just Home and Approvals. See `flows.md > States`.

### Batch 2. Money (`Break Records Batch 2.dc.html`)
| Id | Screen | Screenshot | Route |
| --- | --- | --- | --- |
| 4a | Splits editor, draft v5 not totaling 100% | `4a-splits-editor.png` | `/splits/:scopeId` |
| 4b | Royalties overview, October 2026 | `4b-royalties.png` | `/money/royalties` |
| 4c | Statement detail, Kesi Vale, waterfall | `4c-statement-detail.png` | `/money/statements/:id` |
| 4d | Payouts: batches, tax forms, carry-forward | `4d-payouts.png` | `/money/payouts` |
| 4e | Recoupment per release | `4e-recoupment.png` | `/money/recoupment` |
| 4f | Payee portal, desktop (1280 wide, no sidebar) | `4f-payee-portal.png` | `/portal` |
| 4g | Payee portal, mobile | `4g-mobile-payee-portal.png` | `/portal` at < 768px |
| 4h | Statement, mobile | `4h-mobile-statement.png` | `/portal/statements/:id` at < 768px |

### Batch 3. Rights and operations (`Break Records Batch 3.dc.html`)
| Id | Screen | Screenshot | Route |
| --- | --- | --- | --- |
| 5a | Catalog, Recordings tab, detail panel | `5a-catalog.png` | `/catalog/:tab` |
| 5b | Contracts: agreements, dates, signatures | `5b-contracts.png` | `/contracts` |
| 5c | Rights · Registrations tracker | `5c-registrations.png` | `/rights/registrations` |
| 5d | Funding: opportunities, applications, offers | `5d-funding.png` | `/funding` |
| 5e | Offer comparison vs "no offer" | `5e-offer-comparison.png` | `/funding/offers/compare` |
| 5f | Departments, 14 with status and autonomy | `5f-departments.png` | `/departments` |
| 5g | Activity log, one run expanded | `5g-activity-log.png` | `/activity` |
| 5h | Settings: approval routing, integrations | `5h-settings.png` | `/settings/:section` |
| 5i | White-label theming with live preview | `5i-white-label-theming.png` | `/settings/theme` |
| 5j | Offer comparison, mobile | `5j-mobile-offer-comparison.png` | `/funding/offers/compare` at < 768px |

### Shared and reference
- `design_files/BR Sidebar.dc.html`: the sidebar used on every desktop screen (props `active`, `count`). Spec in `components.md > Sidebar`.
- `design_files/Break Records Home Directions.dc.html`: the three Home directions explored. **1a was chosen** and is what 2c shows. Do not build 1b or 1c.

### Not drawn, build from parts
- **Plan preview** (`components.md > Plan preview`): compose from runbook parts.
- Onboarding steps 1, 3–7 and 9: same shell as 2a/2b (header, 9-step progress, footer with Back and primary). Content per `original_brief.md > Onboarding`.
- Releases list, Roster, Money > Budgets, Rights > Unclaimed money and Profile claims, Contracts > Templates detail: reuse table, card and pill patterns from the drawn screens. Keep the same density.
- Marketing: locked nav item with "Phase 2" and "coming later" department cards only.

---

## 3. Stack

The repo is empty, so use this unless the user says otherwise:

- **Next.js (App Router) + TypeScript**, strict mode.
- **Styling:** CSS variables from `design/tokens.css` copied to `src/styles/tokens.css`, plus CSS Modules or Tailwind configured to read those variables only. No hard-coded hex values in components. The product is white-labeled, so every color, radius and font must come from a token.
- **Primitives:** Radix UI (dialog, popover, tooltip, tabs, checkbox, toggle group, dropdown).
- **Icons:** Lucide. Map the glyphs in the mockups (● ◆ ■ ▲ ◇ ✓ ! ○ –) to Lucide icons, keeping one shape per approval type as listed in `components.md`.
- **Fonts:** `next/font/google` for Archivo (variable, with `wdth` axis), Hanken Grotesk, IBM Plex Mono.
- **Data:** start with a mock API layer that serves `design/sample-data.json` (route handlers under `/api/*`). Keep it behind a typed client so a real backend can replace it. Keep the `_assumed` markers out of the UI.
- **Money:** store integer cents. Format with a single `formatMoney()` helper: tabular mono, "−" (U+2212) for negatives, currency code only when not USD.
- **Testing:** Vitest for logic (splits math, waterfall, rounding), Playwright for flows and visual comparison.

---

## 4. Build order

Work in this order. Finish each phase, run the checks in section 6, commit, then move on.

**Phase A. Foundation**
1. Scaffold the app, install deps, add tokens, fonts and a global reset (`background: var(--bg)`, `color: var(--text)`).
2. Build the type ramp as utility components or classes: eyebrow (mono 11 uppercase), body 14, card title 16, section head 20, page title 34–36, hero 40–52.
3. Build the app shell: 240px sidebar from `BR Sidebar.dc.html`, content area with 28px top and 36–40px side padding, optional right rail slot (310–380px), mobile 4-item tab bar.

**Phase B. Component library** (every state in `components.md`)
Buttons, Status pill, Agent chip, Approval card (default, selected, preparing, blocked, approved-then-failed), Autonomy dial, Money value, Waterfall row, Split bar, Split tree, Gate lock, Verified stamp, Evidence drawer, Goal box, Label Head block, Market-range warning, tables, tabs, empty/error/partial patterns from 3a–3j.
Build a `/dev/components` page that renders every component in every state so they can be checked against the screenshots.

**Phase C. Batch 1 screens:** 2a, 2b (plus the undrawn onboarding steps), 2c, 2d, 2e, 2f, 2g, 2h, 2i, and the 3a–3j states wired to real loading/empty/error/partial conditions.

**Phase D. Batch 2 screens:** 4a–4h. The payee portal (4f–4h) is a separate layout with no sidebar and its own tab bar.

**Phase E. Batch 3 screens:** 5a–5j. White-label theming (5i) writes a theme object that overrides the CSS variables at runtime and must block publishing if any text pair fails WCAG AA.

**Phase F. Cross-cutting:** ⌘K command bar, slide-in Label Head panel, responsive rules (section 5), compact density toggle, reduced motion.

---

## 5. Rules that apply everywhere

**Visual**
- Dark theme only. Light values in `tokens.css` are placeholders; don't ship a theme switch.
- Buttons and inputs: 8px radius. Chips 5–7px. Cards 12px. Phone cards 14px. Never pill, never square.
- Deep orange `--accent` (#ef6a2a) for primary buttons and the Label Head accent. Text on it is `--on-accent` (#110c0b).
- Burgundy `--brand` (#5c1424) for brand blocks: Label Head block, statement total row.
- Red `--critical` (#ff5a4e) is also a brand color, so critical status always has an icon **and** a word. Never color alone.
- One primary button per view region.
- All money and counts: IBM Plex Mono, `font-variant-numeric: tabular-nums`.
- Headings: Archivo 800, `font-stretch: 110–115%`, letter-spacing −0.02em.

**Copy**
- Use the copy in the screenshots and `screens.md` exactly.
- No em dashes anywhere in UI text. Add a lint test that fails on "—" in any string under `src/`.
- Label Head speaks in first person. Agents never claim certainty they lack.
- Plain word first, industry term second: "Recording (master)", "Song (composition)". ISRC, MLC, PRO get tooltips on hover and focus.

**Behavior** (details in `flows.md`)
- Anything that moves money, signs, files or speaks publicly becomes an approval card. Never auto-execute these.
- Bulk approve only for low-risk items; never for signatures (disabled checkbox with a reason).
- Payout with a missing tax form is blocked; offer "Pay the other N now" or "Ask {payee} for a W-9".
- Splits must total exactly 100.00% to send for signatures. Show the gap. Rounding remainder goes to the party named in the rule, never silently dropped.
- Every amount can expand into its waterfall.
- Departments the profile doesn't need are hidden, not greyed out.

**Responsive** (from `flows.md`)
- 1440/1280 as designed; at 1280 the right rail collapses to a toggle.
- 1024: sidebar becomes a 64px icon rail; three-column layouts drop the right rail.
- < 768: mobile layouts per 2h, 2i, 4g, 4h, 5j; 22px side padding; bottom tab bar; 44px minimum targets; no swipe-only actions.

**Accessibility:** complete every item in `accessibility.md`. Focus ring is 2px `--accent`, 2px offset, on every interactive element.

**Motion:** 150ms ease-out for hover/color; 200ms drawer slide. Nothing under `prefers-reduced-motion`. No celebrations.

---

## 6. How to verify each screen

For every frame id, before marking it done:

1. Run the app with sample data and open the route at the frame's width (1440, 1280 for 4f, 390 for mobile, 700×420 crop for 3a–3j).
2. Take a Playwright screenshot and compare it side by side with `design/screenshots/{id}-*.png`. Check: layout columns, spacing, font family/weight/size, colors, radius, copy, icons, numbers.
3. Fix differences until it matches. Small font rendering differences are fine; layout, color, copy and data differences are not.
4. Check the screen's empty, loading, blocked, error and partial states using the 3a–3j patterns.
5. Tab through it with the keyboard and confirm the focus order and shortcuts in `accessibility.md`.
6. Grep for hard-coded hex values and em dashes in the files you touched.

Add Playwright visual tests under `tests/visual/{id}.spec.ts` that load each route and save a screenshot, so regressions are caught later.

---

## 7. Data

- `sample-data.json` is the Northline Records dataset (artists Kesi Vale and others, the Glasshouse release, October 2026 statements). Every screen in the mockups uses it, so seeding it reproduces the screenshots.
- Fields ending in or marked `_assumed` are made-up values. Keep them, but flag them in code comments so a real data source replaces them.
- Start from the suggested data model in `flows.md > Suggested data model` and the client-state list in `flows.md > Client state per screen`.
- The AI agents are out of scope for the UI build. Model them as records (agent, department, state, task, audit id) served by the mock API, so the screens show the same chips, runs and approvals as the mockups.

---

## 8. Definition of done for Phase 1

- All 38 frames in section 2 match their screenshots at their widths.
- Undrawn screens in section 2 exist and follow the same patterns.
- Every data screen has all five states.
- `accessibility.md` checklist fully checked.
- No hard-coded colors, no em dashes, money in integer cents with tests on splits math and waterfall totals.
- A white-label theme from 5i restyles the whole app with no code change.
