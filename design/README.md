# Handoff: Break Records. Phase 1 platform

## Overview
Break Records is an AI-run independent record label platform. Artists and small labels set goals; a team of AI agents (the **Label Head** orchestrator plus department agents) does the business work; the human approves anything that moves money, signs, files or speaks publicly. The **approval card** is the product's core "press button" moment.

This package covers every Phase 1 screen in three batches:
1. **Core loop:** onboarding, Home, Approval inbox, Approval detail, Release runbook (+ mobile Home, mobile Approvals, and all data states)
2. **Money:** Splits editor, Royalties, Statement detail, Payouts, Recoupment, Payee portal (+ mobile payee portal and statement)
3. **Rights and operations:** Catalog, Contracts, Registrations, Funding, Offer comparison, Departments, Activity log, Settings, White-label theming (+ mobile offer comparison)

Marketing (Phase 2) appears only as locked placeholders.

## About the design files
The files in `design_files/` are **design references created in HTML**. They are prototypes showing the intended look, copy and behavior. They are **not production code**. Recreate them in a real app stack. The repo `nofridaysforme-stack/breakrecords` is empty, so **you choose the framework**. Recommended: React + TypeScript (Next.js or Vite), CSS variables built from `tokens.css`, and a headless component library for accessible primitives (Radix or React Aria). Put every color, size and radius in tokens from day one, because the product is white-labeled.

To view the references, open any `.dc.html` file in a browser with `support.js` next to it. Each file is a canvas of labeled frames with ids like `2c` and `4a`. The ids are used throughout these docs.

## Fidelity
**High fidelity.** Colors, type, spacing, radii, copy and sample data are final for the dark theme. Match them closely. The light theme was intentionally skipped; `tokens.css` holds placeholder light values for later.

## Documents in this package
| File | What it covers |
| --- | --- |
| `CLAUDE_CODE_INSTRUCTIONS.md` | **Start here.** Setup, full mockup index, stack, build order, verification |
| `CLAUDE.md` | Short rules file to copy to the repo root |
| `screenshots/` | 38 PNGs, one per mockup frame, named `{id}-{name}.png` |
| `README.md` | This overview, tokens summary, file map |
| `tokens.css` / `tokens.json` | All design tokens (color, type, spacing, radius, shadow, status) |
| `components.md` | The 14+ component specs with every state |
| `screens.md` | Screen by screen: layout, components, exact copy |
| `flows.md` | Interactions, navigation, state management, data model |
| `accessibility.md` | WCAG 2.2 AA checklist specific to this product |
| `sample-data.json` | The Northline Records dataset every screen uses |
| `original_brief.md` | The product brief that defines behavior (source of truth) |

## Design tokens (summary; full list in tokens.css)
**Color, dark theme (default)**
- Base background `#110c0b` · sidebar `#0b0807` · surface `#1b1312` · raised/selected `#241817` · track `#2e201e`
- Text primary `#f4ece6` · secondary `#cdbcb4` · muted `#a8968e` · faint `#7d6c65`
- Hairline `rgba(255,235,225,.08)` · divider `rgba(255,235,225,.06)` · control border `rgba(255,235,225,.18)`
- **Primary action / Label Head accent, deep orange** `#ef6a2a` (text on it: `#110c0b`)
- **Brand block, burgundy** `#5c1424` (text on it `#fbe7ea`, secondary `#f0bcc4`, label `#f6c9d0`)
- **Critical, red** `#ff5a4e`. Red is also a brand color, so critical status is **always** paired with an icon and a word, never color alone.
- Good `#7fc29b` · warning `#f2a65a` · submitted/info `#9fb6d9`

**Type**
- Display: **Archivo** variable (wdth 62–125). Headings use weight 800, `font-stretch:110–115%`, letter-spacing `-0.02em`.
- UI: **Hanken Grotesk** 400/500/600/700.
- Numbers and labels: **IBM Plex Mono** 400/500/600, with `font-variant-numeric: tabular-nums` on all money.
- Scale: 11 (mono eyebrow, uppercase, +0.06–0.08em) · 12 · 13 · 14 (body UI) · 15 · 16 (card titles) · 17 (brief) · 18/20 (section heads) · 22–24 (numbers) · 34–36 (page titles) · 40–52 (hero / release title)

**Radius:** buttons and inputs **8px** (the "rounder, not round" rule; never pill, never square). Chips/badges 5–7px. Cards 12px. Phone cards 14px. Cover art 8–10px.

**Spacing:** 4-based: 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36, 40. Desktop page padding 28px top, 36–40px sides.

**Layout:** desktop 1440 (also 1280, tablet 1024). Sidebar 240px. Optional right rail 310–380px. Mobile 390 with 22px side padding and a 4-item bottom tab bar.

## Files
- `design_files/Break Records Batch 1.dc.html`: turns 2 (screens 2a–2i) and 3 (states 3a–3j)
- `design_files/Break Records Batch 2.dc.html`: turn 4 (4a–4h)
- `design_files/Break Records Batch 3.dc.html`: turn 5 (5a–5j)
- `design_files/BR Sidebar.dc.html`: shared sidebar (props `active`, `count`)
- `design_files/support.js`: runtime needed to open the references; not part of the app

## Assets
No raster assets. Cover art, logos and press photos are striped placeholders. The real ones come from user uploads (album art supplies the color). The wordmark "Break Records." is a placeholder in Archivo 800. Icons are simple glyphs (● ◆ ■ ▲ ◇ ✓ ! ○ –). Replace them with an icon set such as Lucide, keeping the shape-per-type mapping in `components.md`. Do not use robot or sparkle AI imagery.

## Copy rules
- **No em dashes in any UI text.**
- The Label Head speaks in first person ("I drafted the producer agreement; two terms need your eyes.").
- Agents never claim certainty they lack ("That pattern often means artificial streams. I haven't confirmed it.").
- Plain words first, industry term second: "Recording (master)", "Song (composition)".
