# Staging setup, step by step

Staging is one Supabase project and one Vercel project, used for nothing else, running every module live. It exists so the Stage 0 gate can be checked against a real deployment. It shares nothing with production or with any other app.

Do the steps in this order: each one needs something from the one before. **(you)** marks the steps that need your accounts; the rest Claude Code can run once you say the step before is done.

**Rules from the earlier projects**

- Secrets go only into Supabase, GitHub and Vercel settings. Never into the repo, a chat, an email or a document.
- Database passwords: **letters and numbers only** (the commands below make hex). Symbols such as `/ + = @ :` break connection strings.
- `APP_URL` starts with `https://` and has **no slash at the end**. Sign-in links are built from it.
- Type email addresses carefully; a one-letter typo in an allowlisted address cost a day on the Trading Platform.
- Don't use Vercel's Supabase integration for this project (B. Toulan used it). It copies the database owner's password into Vercel; this app must connect only as `br_app`, a role that owns nothing.
- Keep a private note (password manager) of: the Supabase project ref, its database password, the `br_app` password, and `AUTH_SECRET`.

**Making secrets on your computer**

| What | Mac (Terminal) | Windows (PowerShell 7) |
| --- | --- | --- |
| A database password (hex) | `openssl rand -hex 24` | `[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24)).ToLower()` |
| `AUTH_SECRET` | `openssl rand -base64 32` | `[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))` |

Copy each value straight into the setting it's for, then close the window.

---

## Step 0. Merge the staging workflow

GitHub only offers **Run workflow** for workflows that are on `main`. Merge the pull request that adds `.github/workflows/staging.yml` before step 3. (Until staging is set up, the workflow skips itself, so merging it changes nothing.)

## Step 1. Supabase project (you)

1. supabase.com → your organization (Pro) → **New project**.
   - Name: `breakrecords-staging`.
   - Database password: make one with the hex command above and paste it in. Save it in your password manager. (Don't use Supabase's generated one if it contains symbols.)
   - Region: **East US (North Virginia)**, `us-east-1`. Vercel's functions run in Washington, D.C. (`iad1`) by default, next door.
   - Security options, if the form shows them: turn **off** the Data API, or at least "automatically expose new tables". The app never uses Supabase's REST or GraphQL API.
2. Wait for the project to finish setting up (a minute or two).
3. If you couldn't turn the Data API off at creation: **Project Settings → Data API**. Turn it off, or remove `public` from **Exposed schemas**. (The `lockdown` migration also removes every grant to Supabase's API roles, and the gate checks it, so this is a second lock.)
4. Copy the project ref: it's the part of the project URL after `/project/`, for example `abcdefghijklmnop`.
5. Press **Connect** (top of the project page). Under connection strings you'll see Direct connection, Transaction pooler and Session pooler. You need two of them:
   - **Session pooler** (port **5432**, host like `aws-0-us-east-1.pooler.supabase.com`, user `postgres.<ref>`). This is the owner connection for migrations and seeding. Use this one, not "Direct connection": the direct one is IPv6 only, and GitHub Actions can't reach it.
   - **Transaction pooler** (port **6543**, same host). Vercel uses this one in step 5, with the user changed to `br_app.<ref>`.
6. Turn on backups if your plan offers point-in-time recovery (Project Settings → Add-ons). Not needed for staging, but note it for production.

## Step 2. GitHub staging environment (you)

github.com/nofridaysforme-stack/breakrecords → **Settings → Environments → New environment** → name it exactly `staging`.

1. Make the `br_app` password with the hex command. Save it; Vercel needs it in step 5.
2. Under **Environment secrets**, add:

| Name | Value |
| --- | --- |
| `STAGING_OWNER_DATABASE_URL` | The Session pooler string from step 1.5, with your database password in place of `[YOUR-PASSWORD]`, and `?sslmode=require` at the end. It looks like `postgresql://postgres.<ref>:<password>@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require` |
| `STAGING_APP_DB_PASSWORD` | The `br_app` password |

3. Under **Environment variables**, add:

| Name | Value |
| --- | --- |
| `STAGING_OWNER_EMAILS` | Your real email address (comma-separated if more than one). These people become owners of the sample label, Northline Records. Use the same address your Resend account is opened with (step 4) |
| `STAGING_URL` | Leave for now; you'll add it in step 6 |

Tell Claude Code when this is done.

## Step 3. Migrate and seed (Claude Code, or you)

**Actions → Staging → Run workflow** → choose `migrate`, run it, then run it again with `seed`.

- `migrate` applies every migration as the owner, then gives `br_app` its password. Expect a list of "Applied" lines and no errors.
- `seed` loads the Northline sample world, the Harbor Sound second label for cross-tenant checks, and the allowlist, including your address.

From now on, a merge to `main` that adds a migration runs `migrate` on staging by itself.

## Step 4. Resend (you)

1. resend.com → sign in with the address you put in `STAGING_OWNER_EMAILS`.
2. **API Keys → Create API key**. Name `breakrecords-staging`, permission **Sending access**. Copy it once, for step 5.
3. Sending domain, now or later:
   - **Later** (fastest start): use Resend's test sender, `Break Records <onboarding@resend.dev>`. It only delivers to the Resend account's own address and often lands in spam. That's enough for you to sign in to staging, but nobody else can sign in by email until the domain is verified. This is the exact snag the Trading Platform hit.
   - **Now**: **Domains → Add domain** → a subdomain such as `staging.<your-domain>`. Resend shows DKIM, SPF (MX and TXT) and optional DMARC records. Add each at your DNS host exactly as shown: no extra quotes or spaces. If your host appends the domain itself (Namecheap does), enter only the part before your domain. Verification usually takes minutes, and can take up to 72 hours. On Cloudflare, use Resend's "Sign in to Cloudflare" button to add them for you.

## Step 5. Vercel project (you)

1. vercel.com → your team (Pro) → **Add New → Project** → import `nofridaysforme-stack/breakrecords`. (If it isn't listed, use **Adjust GitHub App Permissions** and add the repository.)
2. Before you press Deploy:
   - **Project name**: `breakrecords-staging` (this makes the address `breakrecords-staging.vercel.app`, if free).
   - **Root Directory**: **Edit** → choose `apps/web`. Not `apps`, not the repository root.
   - **Framework Preset**: Next.js (detected).
   - Build and Output Settings: leave every field as it is. Install runs from the repository root (pnpm is detected from `pnpm-lock.yaml`), which the workspace packages need. Keep "Include files outside the root directory in the Build Step" on; it is on by default, under Settings → Build and Deployment after creation.
3. **Environment Variables** (open the section on the same screen; they apply to Production):

| Name | Value |
| --- | --- |
| `DATABASE_URL` | The Transaction pooler string from step 1.5 with **user `br_app.<ref>`** and **password `STAGING_APP_DB_PASSWORD`**, ending `?sslmode=require`. Like `postgresql://br_app.<ref>:<br_app password>@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require` |
| `BR_AUTH` | `required` |
| `BR_LIVE_MODULES` | `approvals,catalog,contracts,roster,splits,statements,payouts,registrations,releases,funding,activity,settings` |
| `AUTH_SECRET` | Made with the command above. Its own value, used nowhere else |
| `APP_URL` | `https://breakrecords-staging.vercel.app` (the address Vercel gives the project; no slash at the end) |
| `RESEND_API_KEY` | From step 4 |
| `EMAIL_FROM` | `Break Records <onboarding@resend.dev>` until your domain is verified, then for example `Break Records <no-reply@staging.<your-domain>>` |

4. **Deploy**. The first build takes a few minutes.
5. After it finishes:
   - Settings → **Domains**: confirm the address matches `APP_URL`. If Vercel gave a different one, change `APP_URL` to match (Settings → Environment Variables) and **Redeploy**. A change to an environment variable only applies to new deployments.
   - Settings → **Git**: Production Branch is `main`.
   - Settings → **Deployment Protection**: leave the default (Standard Protection). It covers preview links; the project's own address stays open, and the app has its own sign-in.
   - Don't add these variables to **Preview**. Pull-request previews then run on sample data and never touch the staging database.

## Step 6. Check it and run the gate

1. GitHub → Settings → Environments → `staging` → add the variable `STAGING_URL` = the same address as `APP_URL`.
2. Open the address in a browser. You should get the sign-in page. Enter your address (from `STAGING_OWNER_EMAILS`), open the email (check spam if you're on the test sender), press **Sign in**. You land on Northline Records' Home with live numbers.
3. **Actions → Staging → Run workflow → `gate`** (or ask Claude Code). It signs in the seeded test users with short-lived database sessions (no email needed). Then it calls every endpoint in the contract, checks that another label and a payee are refused, checks that nothing in the database is reachable except through `br_app`, and removes the sessions. "Stage 0 gate: passed" is the gate.

If something fails, the step's log names it. The usual causes:

| Message | Fix |
| --- | --- |
| `Tenant or user not found` | The username in a pooler string needs `.<ref>` after it (`postgres.<ref>`, `br_app.<ref>`) |
| `password authentication failed for user "br_app"` | `DATABASE_URL`'s password doesn't match `STAGING_APP_DB_PASSWORD`; or `migrate` hasn't run yet |
| Connection timeout from GitHub Actions | The owner string is the Direct connection; use the Session pooler |
| Sign-in page says email isn't set up | `RESEND_API_KEY` or `EMAIL_FROM` missing in Vercel; redeploy after adding |
| "isn't invited" on sign-in | The address isn't in `STAGING_OWNER_EMAILS` exactly as typed; fix it and run `seed` again |
| `prepared statement … already exists` | `DATABASE_URL` uses port 6543 but a different host; copy the Transaction pooler string again |

## Step 7. Make CI required (you)

github.com/nofridaysforme-stack/breakrecords → **Settings → Rules → Rulesets → New branch ruleset** (or Settings → Branches → Add rule on older layouts):

- Target: the default branch (`main`).
- Turn on **Require a pull request before merging**.
- Turn on **Require status checks to pass**, and add `Lint, unit and database tests`, `Browser tests on sample data` and `Browser tests, every module live`. They appear in the search box once they've run at least once, which they have.
- Leave yourself able to bypass if you want an emergency door; Claude Code never merges without being asked.

## Later

- After merging a migration: the Staging workflow migrates staging by itself; Vercel deploys the same push.
- Production is a second Supabase project and a second Vercel project, set up the same way. Production migrations on money tables, turning on live modules and sending real email are never done alone (CLAUDE.md).
