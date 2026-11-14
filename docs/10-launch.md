# Phase 10: Launch Hardening and the ₹0 Deployment Runbook

> **Status:** Code is ready to deploy. **Budget: ₹0.** Every service below is used on its free plan, with no custom domain and no paid add-ons.
> **Name:** PSG InterviewShare, an **independent student project**, not affiliated with or endorsed by PSG College of Technology. No PSG logo is used anywhere.
> **Dates:** hardening 2026-11-14, readiness audit and ₹0 plan 2026-11-14 · **Decisions:** LA1–LA11 in [DECISIONS.md](DECISIONS.md)

## Ground rules for deployment

- **Never** click *Upgrade*, *Start Pro trial*, *Add-ons*, *Compute*, *PITR*, *Custom domain* or *Spend cap* on any service. If a screen asks for a card, **stop** and check first.
- Steps marked 🧑 need you (your accounts, your clicks). We do them **one at a time**; each step ends with a check before moving on.
- Secrets (database password, Gmail app password, backup passphrase) go into a password manager and into the service's own secret settings. **Never** into code, chat or the repository.

## Accounts

| Account | Plan | Card? | Used for |
|---|---|---|---|
| GitHub (existing: `vinoviki-web`) | Free | No | Code, tests on every push, weekly backup |
| New Gmail account, only for this project | Free (needs a phone number for 2-Step Verification) | No | Sending sign-in codes |
| Supabase (sign in with GitHub) | **Free** | Not required for the Free plan | Database, sign-in, avatar storage, account deletion function, nightly cleanup |
| Vercel (sign in with GitHub) | **Hobby** (free) | No | Hosting the website at `*.vercel.app` |

**Not used:** a custom domain, Resend (its free plan only sends to your own address unless you verify a domain you own), paid email services, any AI API.

## Free-tier limits and what they mean here

| Service | Limit | What it means for PSG InterviewShare |
|---|---|---|
| Supabase Free | 500 MB database, 1 GB storage, 5 GB data transfer/month, 50,000 monthly users, 500,000 function calls, 2 active projects | Thousands of experiences fit easily. Avatars are resized to small WebP files before upload (2 MB hard limit). |
| Supabase Free | **Pauses after 1 week without activity** | During holidays the site may stop working until you click **Restore** in the dashboard (free, a few minutes). Supabase emails you before pausing. |
| Supabase Free | **No automatic backups** you can download | Our weekly encrypted GitHub backup is the only backup (step 9). You could lose up to 7 days of data. |
| Gmail SMTP | About 500 emails per day | We cap Supabase at 20 sign-in emails per hour (≤ 480 a day). Students stay signed in, so most need one code per device. Launch to one class at a time. |
| Gmail SMTP | Not built for app email | Early codes may land in Spam. Ask testers to mark them *Not spam*. If Google ever restricts the account, sign-in emails stop until it's restored. |
| Vercel Hobby | Non-commercial personal use only; 100 GB transfer/month; 100 deployments/day | Fits: no ads, payments or sponsorship. The site is static, so transfer is tiny. |
| GitHub (private repo) | 2,000 Actions minutes/month | One full test run takes about 4 minutes. Plenty. |

## What changed in this phase

| Area | Change |
|---|---|
| Reference data | Departments, topics and companies are created by migration `0900`, so production gets them. Demo users and posts stay local (LA1). |
| Production bundle | No fictional data and no `/dev/ui` showcase in database builds (LA2). A Vercel build **fails** if `VITE_DATA_SOURCE=supabase` is missing, so the prototype (demo code `123456`) can never go live by mistake (LA8). |
| Keys | The site uses Supabase's **publishable** key (`VITE_SUPABASE_PUBLISHABLE_KEY`). The legacy anon key still works as a fallback until Supabase retires it at the end of 2026. |
| Account deletion function | Uses the new key types, runs with `verify_jwt = false` and checks the caller itself. Tests prove it refuses no token, forged tokens, the public key and a deleted user's token (LA7). Only your site's address may call it (`ALLOWED_ORIGINS`, step 4). |
| Security headers | `vercel.json`: Content-Security-Policy (scripts from this site only; network only to `*.supabase.co`), HSTS, no framing, COOP, nosniff, strict referrer, Permissions-Policy. |
| Security invariants | Test `12` checks the whole schema: RLS everywhere, no visitor access, only `get_public_stats()` callable by visitors, `search_path` pinned, helpers locked, views are security barriers, private avatars, domain trigger active, no per-row `auth.uid()`, reference data admin-only. |
| Performance | Access rules evaluate the user once per query, not per row, and every foreign key has an index (migration `0920`, LA9). |
| Housekeeping | Nightly pg_cron job `interviewshare-maintenance` (03:17 IST): purges removed content after 30 days, expires idle drafts after 90 days (7-day warning), lifts ended suspensions, prunes old read notifications (LA3). |
| Browser tests | Playwright + axe on the real database-mode app: sign-in, onboarding, browsing, roles, admin, moderation, phone layout, WCAG 2.1 AA on 20 pages (LA4). |
| Branding | Renamed to PSG InterviewShare. "Independent student project, not affiliated with or endorsed by PSG College of Technology" appears on every public and signed-in page, on About, Terms, the landing FAQ and the sign-in email (LA11). |

## Test totals

| Suite | Count |
|---|---|
| Database (pgTAP, `npm run db:test`) | 432 |
| Live integration (`test:auth`, `wizard`, `browse`, `companies`, `community`, `admin`) | 165 |
| Browser end-to-end + accessibility (`npm run test:e2e`) | 34 |

`npm run test:all` runs everything (stack running and seeded: `npm run db:start && npm run db:reset`). GitHub runs it on every push.

**Supabase Security Advisor will show 3 red "Security Definer View" items** (`experience_feed`, `comment_feed`, `public_profiles`). They are intentional: these views hide anonymous authors and apply their own PSG-only and suspension filters. Visitors have no access to them, and test `12` checks that. Nothing else should appear in red.

---

## The ₹0 runbook

### Step 1 🧑 · Make the GitHub repository private (recommended)
GitHub → `vinoviki-web/PSG-InterviewShare` → **Settings** → bottom of *General* → **Danger Zone** → **Change repository visibility** → **Private**.
- Why: backup files (encrypted, but containing student emails) are downloadable by anyone signed in to GitHub on a public repository, and GitHub switches off scheduled backups on public repositories after 60 days without commits.
- Card: no. **Check:** the repository shows a *Private* label.

### Step 2 🧑 · Gmail account for sign-in emails
1. Create a new Google account just for this project (for example a name containing "interviewshare"). Use your own phone number for verification.
2. <https://myaccount.google.com/security> → turn on **2-Step Verification**.
3. <https://myaccount.google.com/apppasswords> → app name `Supabase` → **Create**. Copy the 16-character password straight into your password manager.
- Card: no. Limit: about 500 emails/day. **Check:** you have the Gmail address and the app password saved.

### Step 3 🧑 · Supabase project (Free, Mumbai)
1. <https://supabase.com> → **Start your project** → **Continue with GitHub**.
2. Create an **organization**: type *Personal*, plan **Free**.
3. **New project:**
   | Setting | Value |
   |---|---|
   | Name | `psg-interviewshare` |
   | Database password | **Generate**, then save it in your password manager |
   | Region | **South Asia (Mumbai)** |
   | Everything else (Data API, security options) | Leave the defaults |
4. Wait until the project is ready (about 2 minutes).
- Card: none for Free. If anything asks for one, stop. **Check:** the project dashboard opens and shows *Free*.

### Step 4 · Database, function and its secret (together)
In this folder, in your own terminal (the login opens your browser):
```bash
npx supabase login
npx supabase link --project-ref <project-ref>        # from the project URL; asks for the database password
npx supabase db push                                 # migrations only; demo seed files are NEVER pushed
npx supabase functions deploy delete-account --no-verify-jwt
npx supabase secrets set ALLOWED_ORIGINS=https://<your-project>.vercel.app   # placeholder now, final value in step 7
```
**Check:** Dashboard → **Table Editor** shows 21 departments and 18 companies; **Edge Functions** lists `delete-account`; **Database → Cron** (Integrations → Cron) lists `interviewshare-maintenance`.

### Step 5 🧑 · Sign-in settings (dashboard, I'll guide screen by screen)
| Where (Authentication → …) | Setting |
|---|---|
| Sign In / Providers → **Email** | Enabled. *Confirm email* **on**. *Email OTP Length* **6**. *Email OTP Expiration* **600** seconds. |
| Sign In / Providers | *Allow new users to sign up* **on**. Anonymous sign-ins **off**. Every other provider **off** (D19). |
| **Hooks** | *Before User Created* → **Postgres** → schema `public`, function `hook_before_user_created` → enable. (Free plan includes this hook. The database trigger blocks other domains even without it; the hook gives a clear error.) |
| Emails → **SMTP Settings** | Enable custom SMTP. Sender email: the Gmail address. Sender name: `PSG InterviewShare`. Host `smtp.gmail.com`. Port `587`. Username: the Gmail address. Password: the **app password**. |
| **Rate Limits** | *Emails sent per hour*: **20**. |
| Emails → **Templates** | *Confirm signup* **and** *Magic Link*: subject `Your PSG InterviewShare sign-in code`, body = contents of `supabase/templates/sign-in-code.html`. |
| **URL Configuration** | Site URL `https://<your-project>.vercel.app` (placeholder until step 7). Redirect URLs: the same address followed by `/**`. |

**Check (after step 6):** sign in with your own `@psgtech.ac.in` address; the 6-digit code should arrive within a minute, from "PSG InterviewShare".

### Step 6 🧑 · Vercel (Hobby)
1. <https://vercel.com/signup> → **Hobby** → **Continue with GitHub**. Do **not** start a Pro trial.
2. **Add New → Project** → import `PSG-InterviewShare` (allow access to that one repository only).
3. Settings on the import screen:
   | Setting | Value |
   |---|---|
   | Project name | `psg-interviewshare` (gives `psg-interviewshare.vercel.app` if free; otherwise Vercel adds a suffix) |
   | Framework preset | Vite |
   | Build command / output | `npm run build` / `dist` (defaults) |
   | Environment variables (Production **and** Preview) | `VITE_DATA_SOURCE` = `supabase` · `VITE_SUPABASE_URL` = `https://<project-ref>.supabase.co` · `VITE_SUPABASE_PUBLISHABLE_KEY` = the **publishable** key (Supabase → Project Settings → API Keys, starts `sb_publishable_`) |
4. **Deploy.**
- **Never** add the secret / service-role key to Vercel. Nothing in the website needs it. If the three variables are missing, the build **fails on purpose**.
- Card: no. **Check:** `curl -sI https://<your-project>.vercel.app | grep -i content-security` prints the policy, and the landing page loads.

### Step 7 · Point everything at the real address (together)
- Supabase → Authentication → URL Configuration: Site URL and Redirect URLs = the real `https://….vercel.app`.
- `npx supabase secrets set ALLOWED_ORIGINS=https://<real>.vercel.app`

### Step 8 🧑 · First admin
1. Sign in on the live site with your `@psgtech.ac.in` address and finish onboarding.
2. Supabase → **SQL Editor** (runs as the owner; students can never do this):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = '<your roll number>@psgtech.ac.in';
   ```
3. Sign out and back in. **Check:** the *Admin* link appears.

### Step 9 · Free backups and a restore drill
1. GitHub → repository → **Settings → Secrets and variables → Actions → New repository secret**:
   - `SUPABASE_DB_URL`: Supabase → **Connect** → **Session pooler** connection string, with your database password filled in. (The direct connection is IPv6-only and doesn't work from GitHub.)
   - `BACKUP_PASSPHRASE`: a long random passphrase from your password manager. **Without it, backups can't be read.**
2. **Actions → Weekly backup → Run workflow.** Download the artifact once and keep a copy on your Google Drive each month.
3. **Restore drill** into a second free project (Free allows 2 active projects), then delete that project:
   ```bash
   gpg -d roles.sql.gz.gpg | gunzip > roles.sql      # same for schema and data
   psql "$SCRATCH_DB_URL" -f roles.sql -f schema.sql -c 'set session_replication_role = replica' -f data.sql
   psql "$SCRATCH_DB_URL" -c "select cron.schedule('interviewshare-maintenance', '47 21 * * *', 'select public._run_maintenance()')"
   ```
**Limitations:** weekly only (up to 7 days of loss); each backup kept 30 days on GitHub; restores are manual. On a paused Free project, Supabase also keeps one logical backup taken at pause time.

### Step 10 · Pilot checks (with 3–5 friends)
- [ ] Your own `@psgtech.ac.in` code arrives within a minute (check Spam once)
- [ ] A Gmail address is refused
- [ ] Onboard, share an experience, find it in Explore and in search
- [ ] Comment, report it from a second account, hide it as moderator, undo
- [ ] Admin overview numbers look right; the audit log shows your actions
- [ ] Phone: sign in, browse, share
- [ ] Settings → delete a test account; its posts follow the chosen option
- [ ] Footer says *independent student project*; no PSG logo anywhere

## Ongoing

| When | What |
|---|---|
| Nightly (automatic) | Housekeeping job; runs that changed something appear in the audit log as *System · system.maintenance* |
| Weekly (automatic) | Encrypted backup. Download one a month to Google Drive. |
| Every change | GitHub tests must pass. Database changes go in a new migration, then `npx supabase db push`. |
| After a quiet week | If Supabase paused the project, click **Restore** in the dashboard. |
| Each semester | Review moderators, check the department list, run a restore drill |
| Later | Approach the placement cell with the working site about official recognition and moderators (A2). Only then consider official branding. |

## Known limits (accepted for launch)

- **No in-app notifications yet** (CM3). Moderation outcomes and draft-expiry warnings are stored for the v1.1 screen.
- **CSP allows inline styles** (`style-src 'unsafe-inline'`) because Radix positions popovers with inline styles. Scripts stay locked to the site.
- **Supabase may pause** the project after a week without visits; restoring is free and manual.
