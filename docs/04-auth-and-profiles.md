# Phase 4: Sign-in, Onboarding & Profiles on the Real Database

> **Status:** Complete. 229 database tests + 29 live sign-in checks passing. Verified in the browser against the local stack.
> **Date:** 2026-11-14 · **Decisions:** D19 (college-email sign-in only), AU1–AU6 in [DECISIONS.md](DECISIONS.md)

## What is live

With `npm run dev:db` the app talks to Supabase for:

| Area | How |
|---|---|
| Sign-in | College email + 6-digit code (`signInWithOtp` / `verifyOtp`). Codes are emailed with the Roundwise template, which sends a code and never a link. 10-minute expiry, 30-second resend limit. |
| Session | Persisted and auto-refreshed (refresh-token rotation). Auth events (sign-in/out in another tab, failed refresh) resync the app. |
| Onboarding | `complete_onboarding()` RPC: server-side validation, generated handle |
| Profile and settings | Direct profile update within the column grants. Handle cooldown and uniqueness are mapped to field errors. |
| Avatars | Private `avatars/{uid}/…` bucket. Uploaded as resized webp and shown via a 1-hour signed URL. Older files are removed. |
| Sign out | This device, or **everywhere**, which revokes every refresh token |
| Export my data | Profile, own experiences (with rounds, questions, topics, resources), comments, saved list and votes as JSON |
| Delete account | `delete-account` Edge Function: anonymises or removes content (`prepare_account_deletion`), deletes avatar files, then deletes the auth user with the service role |
| My lists | My published experiences, saved list and drafts (Home, My profile) |

Everything else (explore, experience pages, companies, the share wizard, moderation and admin) still runs on the prototype API. **In database mode those sections show "Not connected yet"** instead of sample data. They connect in Phases 5–9.

`npm run dev` (no mode) is unchanged: the full prototype on sample data.

## Run it

```bash
npm run db:start                 # Supabase + Mailpit + Edge Functions (Docker)
npx supabase status              # API URL + anon key → .env.db.local (see .env.example)
npm run dev:db                   # app in database mode on http://localhost:5173
npm run db:test                  # 229 pgTAP tests
npm run test:auth                # 29 live checks against Auth, Storage, the Edge Function and Mailpit
```

Local sign-in codes arrive in Mailpit: http://127.0.0.1:54324.

## Security decisions made in this phase

| ID | Decision |
|---|---|
| AU1 | **Email confirmation is ON.** A password sign-up through the API can't produce a usable account without proving ownership of the mailbox. (There's no password UI. This closes the API path.) Tested live. |
| AU2 | Only the anon key ever reaches the browser. The service-role key exists only in the Edge Function environment. `.env.db.local` is gitignored and `.env.example` documents the variables. |
| AU3 | The Edge Function identifies the caller from their JWT (`getUser`), never from the request body. CORS is limited to the configured origins. Calls without a signed-in user get 401 (tested). |
| AU4 | Avatars are private and served by short-lived signed URLs. MIME allowlist (png/jpeg/webp) and 2 MB limit, both enforced by Storage. SVG is refused (tested). |
| AU5 | Account deletion runs the content step as the student (RLS and audit apply), and only the final auth-user deletion uses the service role. The last admin can't delete their account. |
| AU6 | Data-source switch via Vite mode (`--mode db`). Unconnected modules raise `not_connected` and the UI shows a neutral notice, so there's never silent sample data in database mode. |

## Live integration checks (`npm run test:auth`)

- **Domain and accounts:**
  - Gmail code request → 403 with the PSG-only message.
  - Gmail password sign-up refused.
  - A PSG password sign-up gets no session and can't sign in.
- **Code sign-in:**
  - A code arrives in Mailpit, uses the Roundwise template and contains no link.
  - The resend limit applies.
  - A wrong code is refused; the right code creates a session for the right email.
- **Access:**
  - No reading before onboarding; onboarding works; reading works afterwards.
  - Bio editable; status and roles not.
- **Avatars:**
  - Upload to your own folder works and the signed URL resolves.
  - Another student's folder and SVG files are refused.
- **Visitors:** a signed-out visitor reads nothing but the aggregate stats.
- **Sign out everywhere:** another device's refresh fails afterwards.
- **Delete account:** the Edge Function deletes the user and their token no longer resolves. Unauthenticated calls get 401.

## Before production (not blocking local work)

| Item | Owner | Notes |
|---|---|---|
| Sending email provider + domain with SPF/DKIM (A3) | Product owner + Claude | Codes must reach @psgtech.ac.in inboxes (Google Workspace). Consider asking PSG IT to allowlist the sender. |
| Hosted Supabase project (staging, then production) | Product owner | Phase 10. Create it under an account the team controls. Auth hook, templates and rate limits are re-applied from `supabase/config.toml`. |
| Production rate limits | Claude | Local `email_sent = 30/hour` is for development. Production uses stricter values. |
