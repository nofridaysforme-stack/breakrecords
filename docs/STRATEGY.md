# Implementation strategy: where we are

The plan is the End-to-End Implementation Strategy (Nov 7, 2026, PDF version): keep the typed API as the seam, replace the mock behind it one module at a time in the order money flows, and take each module live only after a pilot user completes the real task with it. Backend detail comes from the Platform Build Plan and the Splits and Percentage Spec.

## Decisions

| Topic | Decision | Source |
| --- | --- | --- |
| Database | Postgres on Supabase Pro (row-level security, point-in-time recovery) | Strategy PDF |
| Hosting | Next.js on Vercel; Railway only for long-running workers (Python statement parsers, audio); Inngest for workflows | Strategy PDF |
| Auth | Auth.js v5 email magic links with an invite allowlist and database sessions, as in the Trading Platform. Not Clerk (the strategy and build plan still list Clerk; Jana chose this on Nov 7) | Jana |
| Migrations | Plain SQL run by dbmate, as in the Trading Platform. Drizzle is used only as the Auth.js adapter | Trading Platform |
| Payouts | Trolley for royalty payouts and tax forms; Stripe only for subscription billing | Strategy PDF |
| Stage 0 gate measure | The API contract (`packages/contract`, every endpoint the UI calls), not a screen count. Pages may be added or removed later | Jana |
| Mock/live switch | On the server (`BR_LIVE_MODULES`), so partner keys never reach the browser | Stage 0 |

## Stages and gates

| Stage | Estimate | What goes live | Gate to move on |
| --- | --- | --- | --- |
| **0 Foundations** (now) | about 3 weeks | Contract freeze, Postgres on Supabase, auth, row-level security, staging, CI, module flags | Every endpoint in the contract runs on the live API in staging; cross-tenant reads fail |
| 1 Data in | about 4 weeks | Catalog and statement import, parsers, splits engine, read-only statements | 3 pilots' last 12 months reconcile to the cent |
| 2 Agreements | about 3 weeks | Splits editor live, Dropbox Sign, attorney templates | Every pilot track has a signed split totaling 100% |
| 3 Money out | about 4 weeks | Approvals live in production, Trolley payouts, tax forms, daily reconciliation | Real payouts to 3+ payees; zero differences for 2 periods |
| 4 Agents | about 6 weeks | Label Head plans; Royalty, Registration and Funding agents; evals | Evals pass; pilots accept plans; one prepared registration confirmed |
| 5 Releases | about 4 weeks | LabelGrid delivery, runbook live, pitch drafts, Stripe billing | A pilot single goes live on Spotify, delivered from the platform |
| 6 Paid beta | ongoing | Open signups, white-label tier, then Phase 2 marketing | Paying tenants renew; support load fits one person |

Stage 3 is the point of no return: attorney sign-off, insurance and a staging rehearsal come first. Staging runs every module live; production flips one module per gate.

## Stage 0 progress

### Done

- **Workspace:** `apps/web`, `packages/core` (money math, approval rules), `packages/contract` (Zod), `packages/db` (SQL migrations, tenant-scoped client).
- **Contract:** schemas for every read the UI makes (30 endpoints) and the approval writes; checked at compile time (`contract-check.ts`) and over HTTP (`contract.spec.ts`, mock; `tests/live`, live).
- **Database:** tenants (licensee, label, artist), Auth.js tables, invite allowlist, memberships, approvals, decisions and an append-only audit log. Row-level security on every tenant table, with the app connecting as `br_app`, a role that owns nothing. 11 tests prove cross-tenant reads and writes fail (`packages/db/tests/rls.test.ts`).
- **Auth:** magic links (Resend in production, a test mailbox locally), invite-only, 30-day database sessions, a "Continue" step so link previews can't use up a link. `BR_AUTH=required` turns it on; live data is refused without it.
- **First live module: approvals.** With `BR_LIVE_MODULES=approvals`, the inbox, detail, Home cards, decisions, bulk approve, undo and in-app proposals read and write Postgres for the signed-in tenant, using the same rules as the mock (`packages/core/src/approvals.ts`), one writer per tenant at a time, every change in the audit log. Payees are refused.

- **Second live module: catalog.** With `catalog` in `BR_LIVE_MODULES`, the Catalog screens read the tenant's parties, songs (with writer shares in basis points), recordings, credits, releases, tracks, assets and registrations from Postgres. Metadata scores are computed from the data (`packages/core/src/metadata.ts`: twelve checks, rounded down) instead of stored, and the note says exactly what's missing. Genre and AI use edits save through `PATCH /api/catalog/recordings/{id}`, are audited, and rescore the recording. Records can't point across tenants (a database trigger refuses it), and payees can't read the catalog.

### Left in Stage 0

| Item | Why |
| --- | --- |
| Live backends for the other modules (contracts, roster, splits, statements, payouts, registrations, releases, funding, activity, settings), seeded with the sample world. Registrations already has its table, filled by the catalog seed | The gate: every contract endpoint on the live API in staging |
| Move the remaining browser-only business data to the server: split v5 send and signatures, onboarding answers, published theme, profile claims, dismissed funding cards | Survives reloads, shared with the team |
| The ⌘K search index reads the sample catalog in the browser; in live mode it should search the tenant's data through the API | Search must match what's in the database |
| Asset uploads (R2 or S3 with signed URLs); `assets.storage_key` is ready for them | Upload assets only queues names today |
| Tenant switcher in the sidebar (memberships already support several tenants) | Licensees and people in more than one label |
| Owner screens to invite people (allowlist) | Today invitations are seeded |
| Staging on Supabase and Vercel; CI running lint, unit, contract, RLS, mock e2e, live e2e and visual checks on every pull request | "Nothing merged without tests" |
| Screenshot baselines (`toHaveScreenshot`) for the 37 frames | Visual tests become a merge check |
| Replace v1 `Display` strings with structured fields as each module goes live | Live servers send data, not formatted text |

## Run live locally

```bash
# once: create the roles and databases (local Postgres 16)
sudo -u postgres psql -c "CREATE ROLE br_owner LOGIN PASSWORD 'br_owner_local' CREATEROLE"
sudo -u postgres psql -c "CREATE DATABASE breakrecords_dev OWNER br_owner"
MIGRATION_DATABASE_URL=postgres://br_owner:br_owner_local@localhost/breakrecords_dev?sslmode=disable pnpm --filter @breakrecords/db migrate
sudo -u postgres psql -c "ALTER ROLE br_app LOGIN PASSWORD 'br_app_local'"
SEED_DATABASE_URL=postgres://br_owner:br_owner_local@localhost/breakrecords_dev BR_ALLOW_SEED=1 pnpm --filter @breakrecords/web db:seed
```

Then start the app with the variables in `.env.example` (`BR_AUTH=required`, `BR_LIVE_MODULES=approvals,catalog`, `AUTH_TEST_MAILBOX` set) and sign in as `jana@northline.example`; the link is written to the mailbox folder.

Tests: `TEST_DATABASE_URL` (owner) and `TEST_APP_DATABASE_URL` (`br_app`) on a migrated test database, then `pnpm --filter @breakrecords/db test` (row-level security) and `pnpm --filter @breakrecords/web exec playwright test -c playwright.live.config.ts` (live end to end).

## Waiting on Jana

- The strategy's "Decisions for Jana": Trolley, LabelGrid, attorney and CPA, the three pilots, pricing, the Funding approval type.
- Accounts on the start-now list, first for Stage 0: Supabase Pro, Vercel Pro, Inngest, Sentry, and Resend with the sending domain (Clerk is no longer needed).
