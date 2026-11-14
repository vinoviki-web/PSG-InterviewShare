# Phase 10: Launch Hardening and Runbook

> **Status:** Complete. Everything that can be done without production accounts is done. **What's left needs you** (accounts, a sender domain, college permission). See [What I need from you](#what-i-need-from-you).
> **Date:** 2026-11-14 · **Decisions:** LA1–LA6 in [DECISIONS.md](DECISIONS.md)

## What changed in this phase

| Area | Change |
|---|---|
| Reference data | Departments, topics and companies moved from `seed.sql` into migration `0900_reference_data.sql`, so production gets them and demo users never reach production (LA1) |
| Production bundle | Database builds swap the prototype's fictional data for an empty stub (`src/mocks/stub.js`, `vite.config.js`). CI fails if fictional names appear in the build (LA2). The `/dev/ui` showcase is excluded too. |
| Security headers | `vercel.json`: Content-Security-Policy (scripts from this site only; network only to `*.supabase.co`), HSTS, no framing, COOP, nosniff, strict referrer, Permissions-Policy. Hashed assets cached for a year. |
| Security invariants | `supabase/tests/12_security_invariants_test.sql` checks the **whole** schema, so a future migration can't quietly drop a protection: RLS on every table, no visitor access to tables, only `get_public_stats()` callable by visitors, every SECURITY DEFINER function pins `search_path`, internal helpers locked, every view a security barrier, private avatar bucket, PSG domain trigger active |
| Housekeeping | Nightly pg_cron job `roundwise-maintenance` (03:17 IST) runs `_run_maintenance()` (LA3): purges removed experiences and deleted comments 30 days after deletion, warns authors 7 days before a 90-day-idle draft expires and then deletes it, lifts ended suspensions, prunes read notifications after 180 days. Hidden content is never purged. One System audit row per run that changed something. |
| End-to-end + accessibility | Playwright drives the real app in database mode, signing in with emailed codes from Mailpit. Covers visitor pages, PSG-only sign-in, onboarding, home, explore → read, companies, profile, saved, settings, share, role guards, all admin sections and moderation. axe checks WCAG 2.1 AA on 20 pages, plus a phone-width overflow check (LA4). |
| Accessibility fixes (found by axe) | Muted grey text raised from `ink-400` (2.6:1) to `ink-500` (4.9:1) everywhere. Dropdowns inside form fields now get their label, hint and error (they had no accessible name). The account menu and admin table rows no longer have labels that contradict their visible text. |
| Backups | `scripts/backup.sh` (`npm run backup`): roles, schema and data dumps, gzip, **encrypted** with AES-256 (they contain student emails). Refuses to run against the local stack. Weekly GitHub Actions workflow keeps 30 days (LA5). |
| CI | `.github/workflows/ci.yml` runs both builds, the bundle check, pgTAP, all six live suites and the browser tests on every push and pull request against a throwaway local stack. No secrets needed. |

## Test totals

| Suite | Count |
|---|---|
| Database (pgTAP, `npm run db:test`) | 423 |
| Live integration (`test:auth`, `wizard`, `browse`, `companies`, `community`, `admin`) | 162 |
| Browser end-to-end + accessibility (`npm run test:e2e`) | 34 |

`npm run test:all` runs everything (stack must be running and seeded: `npm run db:start && npm run db:reset`).

## What I need from you

| # | Item | Why | Ref |
|---|---|---|---|
| 1 | **Placement cell permission** to use the PSG name and run a students-only platform, and 2–3 moderator nominations | Launching without it risks being asked to take it down | A2 |
| 2 | **Final name.** Recommendation: Roundwise. | Domain, sender address, email templates | Q13 |
| 3 | **Department list check** against PSG Tech's official programmes (21 entries in migration `0900_reference_data.sql`) | Students pick these at onboarding; renaming later means a data migration | A4 |
| 4 | **Supabase account** (free tier is enough at launch; Pro, $25/month, adds daily backups and no pausing). Region: Mumbai (`ap-south-1`). | Hosting the database, sign-in and storage | |
| 5 | **Vercel account** connected to the GitHub repository | Hosting the site | |
| 6 | **A domain** and an **email sender** (Resend, Postmark or Amazon SES) with SPF, DKIM and DMARC on that domain | Sign-in codes must reach `@psgtech.ac.in` inboxes, not spam. This is the only way in (D19). | A3 |
| 7 | **GitHub repository** (private) | CI, backups, Vercel deploys. I can set up git locally now; say the word. | |
| 8 | Contact the maintainer of interview-share.vercel.app | Courtesy and possible collaboration | A1 |

## Go-live runbook

Do these in order. Steps marked 🧑 need your accounts; I can do the rest with you.

### 1. Supabase project 🧑
1. Create the project (Mumbai). Save the database password in a password manager.
2. Link and push the schema. This runs migrations only; **demo seed files are never pushed**.
   ```bash
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```
3. **Auth → Hooks:** enable *Before User Created* → Postgres function `public.hook_before_user_created`. (The `auth.users` trigger blocks other domains even without it; the hook gives a friendly error.)
4. **Auth → Providers → Email:** enabled, *Confirm email* on, OTP length 6, OTP expiry 600 seconds. All other providers off.
5. **Auth → Email templates:** paste `supabase/templates/sign-in-code.html` into *Confirm signup* and *Magic Link*, subject "Your Roundwise sign-in code".
6. **Auth → SMTP:** the sender from item 6. **Auth → Rate limits:** about 30 emails per hour to start, 30 seconds between codes per address.
7. **Auth → URL configuration:** Site URL `https://<your-domain>`; redirect allow-list `https://<your-domain>/**`.
8. Deploy the account-deletion function:
   ```bash
   npx supabase functions deploy delete-account
   ```
9. **Database → Extensions:** check `pg_cron` is on, then **Database → Cron**: confirm `roundwise-maintenance` is scheduled.

### 2. Vercel 🧑
1. Import the GitHub repository. Framework: Vite. Build command `npm run build`, output `dist`.
2. Environment variables (Production):
   | Name | Value |
   |---|---|
   | `VITE_DATA_SOURCE` | `supabase` |
   | `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
   | `VITE_SUPABASE_ANON_KEY` | the project's anon (publishable) key |

   **Never** add the service-role or secret key to Vercel. Nothing in the app needs it.
3. Add the domain. HTTPS is automatic. Check the headers: `curl -sI https://<your-domain> | grep -i content-security`.

### 3. First admin
1. Sign in on the live site with your `@psgtech.ac.in` address and finish onboarding.
2. In the Supabase SQL editor (runs as the owner; students can never do this themselves):
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = '22e646@psgtech.ac.in';
   ```
3. Sign out and back in. Use **Admin → Users** to make the nominated moderators.

### 4. Backups 🧑
1. GitHub → Settings → Secrets → Actions: `SUPABASE_DB_URL` (Dashboard → Connect → Session pooler) and `BACKUP_PASSPHRASE` (long random string, kept in a password manager; without it backups can't be read).
2. Run **Weekly backup** once by hand (Actions → Weekly backup → Run workflow) and check the artifact.
3. **Restore drill** before launch, into a scratch project:
   ```bash
   gpg -d roles.sql.gz.gpg | gunzip > roles.sql   # same for schema and data
   psql "$SCRATCH_DB_URL" -f roles.sql -f schema.sql -c 'set session_replication_role = replica' -f data.sql
   psql "$SCRATCH_DB_URL" -c "select cron.schedule('roundwise-maintenance', '47 21 * * *', 'select public._run_maintenance()')"
   ```

### 5. Launch checks
- [ ] Sign in with a real `@psgtech.ac.in` address: code arrives within a minute, not in spam
- [ ] A Gmail address is refused
- [ ] Onboard, share an experience, see it in Explore, search for it
- [ ] Comment, report it from a second account, hide it as moderator, undo
- [ ] Admin overview numbers look right; audit log shows your actions
- [ ] Phone: sign in, browse, share
- [ ] `curl -sI` shows the security headers
- [ ] Delete a test account from Settings; its posts follow the chosen option

### Ongoing
| When | What |
|---|---|
| Nightly (automatic) | Housekeeping job. Each run that changed something is in the audit log as *System · system.maintenance*. |
| Weekly (automatic) | Encrypted backup. Download one a month to the placement cell's drive. |
| Every change | CI must be green before merging. Database changes go in a new migration, then `npx supabase db push`. |
| Each semester | Review moderators, check the department list, run a restore drill |

## Known limits (accepted for launch)

- **No in-app notifications yet** (CM3). Notification rows (moderation outcomes, draft-expiry warnings) are written for the v1.1 UI.
- **CSP allows inline styles** (`style-src 'unsafe-inline'`) because Radix positions popovers with inline styles. Scripts stay locked to the site.
- **Free tier pauses** a project after a week without traffic. Upgrade to Pro before the placement season.
