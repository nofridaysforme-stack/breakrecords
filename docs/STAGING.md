# Staging setup

Staging runs every module live, on its own Supabase project and Vercel project, so the Stage 0
gate can be checked against a real deployment. It never shares anything with production, and
nothing here touches production. Secrets go only into Supabase, GitHub and Vercel settings,
never into the repo or a chat.

Steps marked **(you)** need your accounts. Everything else runs from the repo.

## 1. Supabase project (you)

1. In Supabase (Pro organization), create a new project named `breakrecords-staging`. Pick the region closest to Vercel's (US East if unsure). Save the database password it shows you in your password manager.
2. **Turn off the Data API**: Project Settings → Data API → disable it (or remove `public` from "Exposed schemas"). The app talks to Postgres directly; nothing should be served over Supabase's REST API. The `lockdown` migration also removes every grant to Supabase's API roles, and the gate checks it.
3. Copy two connection strings from **Connect** (top of the project page):
   - **Session pooler or direct connection, port 5432**, user `postgres`. This is the owner connection for migrations and seeding. Add `?sslmode=require` at the end.
   - **Transaction pooler, port 6543**. You'll use it for the app in step 4, with the user changed to `br_app.<project-ref>` and the password from step 2 below.

## 2. GitHub staging environment (you)

Repository Settings → Environments → New environment `staging`:

| Kind | Name | Value |
| --- | --- | --- |
| Secret | `STAGING_OWNER_DATABASE_URL` | The port 5432 connection string from step 1.3, with `?sslmode=require` |
| Secret | `STAGING_APP_DB_PASSWORD` | A new long random password for the app role (`openssl rand -base64 32`). Save it; Vercel needs it too |
| Variable | `STAGING_URL` | The Vercel staging address from step 4 (you can add it after step 4) |
| Variable | `STAGING_OWNER_EMAILS` | Your real email address(es), comma-separated, so you can sign in as Northline's owner |

## 3. Migrate and seed

Actions → **Staging** → Run workflow → `migrate`, then `seed`. (Claude Code can start these runs once the secrets exist.) Migrating applies every SQL migration as the owner and gives the app role (`br_app`) its password; seeding loads the Northline sample world and invites the test users and your address.

## 4. Vercel project (you)

1. In Vercel (Pro), Add New → Project → import `nofridaysforme-stack/breakrecords`. Name it `breakrecords-staging`.
2. **Root Directory**: `apps/web`. Framework: Next.js (detected). Install command: leave the default (pnpm is detected from the lockfile).
3. Environment variables (Production environment of this staging project):

| Name | Value |
| --- | --- |
| `DATABASE_URL` | The port 6543 transaction pooler string, user `br_app.<project-ref>`, password `STAGING_APP_DB_PASSWORD`, ending `?sslmode=require` |
| `BR_AUTH` | `required` |
| `BR_LIVE_MODULES` | `approvals,catalog,contracts,roster,splits,statements,payouts,registrations,releases,funding,activity,settings` |
| `AUTH_SECRET` | A new random value (`openssl rand -base64 32`), different from any other environment |
| `APP_URL` | The project's address, for example `https://breakrecords-staging.vercel.app` |
| `RESEND_API_KEY` | From step 5 |
| `EMAIL_FROM` | For example `Break Records <no-reply@staging.your-domain>` |

4. Deploy. Put the address into the GitHub `STAGING_URL` variable.

## 5. Resend (you)

Add the sending domain (a subdomain such as `staging.your-domain` keeps staging mail separate), add the DNS records it lists, wait for it to verify, then create an API key limited to sending and put it in Vercel's `RESEND_API_KEY`. Without it the app can't send sign-in links, and says so on the sign-in page.

## 6. Run the gate

Actions → **Staging** → Run workflow → `gate`. It signs in the seeded test users through short-lived database sessions (no email needed), calls every endpoint in the contract, checks that another label and a payee are refused, and checks that nothing in the database is reachable except through the app role. Then it deletes those sessions. A green run is the Stage 0 gate.

## 7. Make CI required (you)

Repository Settings → Branches → add a rule for `main`: require a pull request, and require the status checks `Lint, unit and database tests`, `Browser tests on sample data` and `Browser tests, every module live`.

## Later

- Run `migrate` after every merge that adds a migration, before deploying (Vercel deploys on push to `main`).
- Production is a separate Supabase project and Vercel project, set up the same way. Production migrations on money tables, live module flags and real email are never done alone (CLAUDE.md).
