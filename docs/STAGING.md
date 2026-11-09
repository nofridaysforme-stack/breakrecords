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

Check the default branch is `main`: **Settings → General → Default branch**. If it shows anything else, click the two-arrows button beside it, choose `main`, **Update**, then confirm. Without this the **Run workflow** button doesn't appear.

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

**What this is.** GitHub needs three facts to set up the staging database for you: how to log in to it, a password for the app's own login, and your email address. You type them into a locked box in GitHub's settings called an *environment*, named `staging`. Two of them are *secrets*: once saved, nobody can read them back, not even you (you can only replace them). The third is a *variable*, which stays visible because it isn't secret.

You need three things open: GitHub in your browser, your Supabase project in another tab, and your password manager.

### 2a. Make the app's password

1. Open Terminal. On a Mac: press **Cmd + Space**, type `Terminal`, press **Return**. (Windows: open **PowerShell 7** and use the Windows command from the table at the top.)
2. Type this and press **Return**:

   ```bash
   openssl rand -hex 24
   ```

3. It prints one line of 48 letters and numbers. That line is the **`br_app` password**. Select it, copy it, and save it in your password manager as "Break Records staging: br_app password". You'll paste it twice: once below, once in Vercel (step 5).

### 2b. Build the database address

This is one long line of text that tells GitHub where the database is and how to log in.

1. In Supabase, open the `breakrecords-staging` project.
2. Press the **Connect** button at the top of the page. A panel opens.
3. Find the connection strings. If there's a choice labelled **Method**, **Type** or **Mode**, pick **Session pooler**. (Not "Direct connection", not "Transaction pooler".)
4. Press the copy icon next to the string.
5. Paste it into a plain text editor (Mac: TextEdit, then **Format → Make Plain Text**; Windows: Notepad). It looks like this:

   `postgresql://postgres.abcdefghijklmnop:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:5432/postgres`

6. Delete `[YOUR-PASSWORD]`, **brackets included**, and paste your Supabase database password (the one you made in step 1) in its place.
7. Go to the very end of the line and type `?sslmode=require`.
8. Check it:
   - It starts with `postgresql://postgres.` (with a dot and your project ref right after `postgres`).
   - It contains `:5432/`.
   - There are no `[` or `]` characters and no spaces anywhere.
   - It ends with `/postgres?sslmode=require`.

   Finished, it looks like: `postgresql://postgres.abcdefghijklmnop:3f9a…e21c@aws-0-us-east-1.pooler.supabase.com:5432/postgres?sslmode=require`

If you no longer have the database password, or it has symbols in it: Supabase → **Project Settings** (gear, bottom left) → **Database** → **Reset database password**, paste a new hex one from `openssl rand -hex 24`, save it in your password manager, then redo this part.

### 2c. Create the `staging` environment in GitHub

1. Go to https://github.com/nofridaysforme-stack/breakrecords
2. Click **Settings** in the row of tabs near the top (gear icon, far right). If you don't see it, click the **…** at the end of the tab row.
3. In the left-hand list, under **Code, planning, and automation**, click **Environments** (between Planning and Codespaces).
4. Click **New environment**.
5. In the **Name** box type `staging` (all lowercase, nothing else), then click **Configure environment**.

You're now on the page for the `staging` environment. Leave everything at the top (reviewers, wait timer, branches) as it is.

### 2d. Add the two secrets

Scroll down to **Environment secrets**.

1. Click **Add environment secret**.
   - **Name**: `STAGING_OWNER_DATABASE_URL`
   - **Value**: the whole line from 2b.
   - Click **Add secret**.
2. Click **Add environment secret** again.
   - **Name**: `STAGING_APP_DB_PASSWORD`
   - **Value**: the `br_app` password from 2a.
   - Click **Add secret**.

Copy the names from here rather than typing them: one wrong letter and the workflow can't find the secret.

### 2e. Add the variable

Scroll to **Environment variables**.

1. Click **Add environment variable**.
   - **Name**: `STAGING_OWNER_EMAILS`
   - **Value**: your email address, typed carefully. Use the same address you'll open Resend with in step 4. More than one person? Separate them with commas, no spaces: `you@example.com,partner@example.com`.
   - Click **Add variable**.

Don't add `STAGING_URL` yet; that comes in step 6.

### 2f. Check

The `staging` page should now list **2 secrets** (`STAGING_APP_DB_PASSWORD`, `STAGING_OWNER_DATABASE_URL`) and **1 variable** (`STAGING_OWNER_EMAILS`). Close the text editor from 2b without saving.

## Step 3. Migrate and seed (you click, Claude Code reads the logs)

*Migrate* builds the empty tables in the staging database. *Seed* fills them with the sample label, Northline Records, and lets your email address sign in. Claude Code can't press this button for you (GitHub doesn't let its app start workflows), but it can read the results.

1. Go to https://github.com/nofridaysforme-stack/breakrecords/actions/workflows/staging.yml (or: the **Actions** tab at the top of the repository, then **Staging** in the left-hand list).
2. On the right, above the list of runs, click the **Run workflow** button. A small box drops down.
3. **Use workflow from**: leave it on `main`.
4. **What to do**: choose `migrate`.
5. Click the green **Run workflow** button inside the box.
6. Wait a few seconds and refresh the page. A new row appears at the top of the list. A yellow dot means running; a green tick means done; a red cross means it failed.
7. When it's a green tick, do 2 to 6 again, choosing `seed` this time.
8. Tell Claude Code "migrate and seed are done". It reads both logs and confirms, or fixes what failed.

How to tell you're in the right place: each row you start says **Manually run by** and your GitHub name underneath. A run that says it was triggered by a push is an automatic one, not yours.

- `migrate` applies every migration as the owner, then gives `br_app` its password. The log lists "Applied" lines and no errors.
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
