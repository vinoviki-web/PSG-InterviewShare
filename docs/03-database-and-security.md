# Phase 3: Database, Access Rules & Tests

> **Status:** Complete. 217 pgTAP tests passing against a local Supabase stack.
> **Date:** 2026-11-14 · **Depends on:** [01](01-product-discovery.md) §9–11, [DECISIONS.md](DECISIONS.md)

The prototype UI still runs on the mock API. Wiring it to this database is Phase 4 onward. This phase delivers the database, its access rules and proof that they hold.

## Run it

```bash
npm run db:start     # first run downloads the Supabase Docker images
npm run db:reset     # rebuild from migrations + seed
npm run db:test      # 217 allow/deny tests
npm run db:stop
```

Requires Docker. The Supabase CLI is a dev dependency (`npx supabase …`); nothing is installed globally.

## Files

| File | What |
|---|---|
| [0100_core_schema.sql](../supabase/migrations/20261113000100_core_schema.sql) | 21 tables, 16 enums, constraints, indexes |
| [0200_functions.sql](../supabase/migrations/20261113000200_functions.sql) | Identity helpers, PSG domain enforcement, guard and counter triggers, search indexing |
| [0250_rpc.sql](../supabase/migrations/20261113000250_rpc.sql) | Every validated write path: drafts, publish, reports, moderation, admin |
| [0300_security.sql](../supabase/migrations/20261113000300_security.sql) | RLS policies, column grants, masked read views, function grants, storage buckets and policies |
| [seed.sql](../supabase/seed.sql) | Departments, topics, companies (generated from the prototype's data) + **local-only** demo users and experiences |
| [tests/](../supabase/tests) | Shared helpers + 6 test files |

## The security model in one page

**Default deny.** Every table has row-level security on. `anon` and `authenticated` start with *no* privileges, and every grant is explicit. Default privileges are revoked too, so a future migration that forgets a grant fails closed, not open.

**Who you are** (four layers, decision D2):
1. The UI checks the email domain. This is convenience only.
2. ~~Google `hd` hint~~: not applicable. Sign-in is college email + code only (D19).
3. On the server:
   - **3a.** The `hook_before_user_created` Auth hook rejects non-PSG sign-ups with a 403 and a friendly message. Verified against the real local Auth server.
   - **3b.** The `enforce_psg_domain` trigger on `auth.users` blocks non-PSG emails whatever path creates or edits a user.
4. `is_psg_user()` re-checks the JWT's email on every policy, so a valid user ID with a non-PSG email claim reads nothing.

**Reading:**
| What | Path | Rule |
|---|---|---|
| Other people's experiences | `experience_feed` view, `get_experience()` | Published only, to active (onboarded, not suspended) PSG students. Moderators also see hidden ones. |
| Anonymous authors | Masked in the view and RPC | Hidden from **everyone but the author**, admins included. Only `admin_reveal_author()` unmasks, and it requires a reason and is audited (D7). |
| Hidden department | Masked | When "hide my department" is on (P13) |
| Private profiles | `public_profiles`, feed | Bio hidden. A private profile's posts can't be listed by author ID, but the name still shows on each post. |
| Comments | `comment_feed` view | An anonymous author's replies show as "Author" without a name |
| Your own stuff | Base tables | Drafts, saved list, votes, views and notifications are visible only to you |
| Reports | `mod_list_reports()` | Moderators never see who reported; admins do |
| Audit log | Table | Admins only, and nobody can write to it directly |

**Writing:**
| What | Path | Enforced by |
|---|---|---|
| Experiences, rounds, questions | `save_draft`, `publish_experience`, `delete_experience` | No direct table writes. Server-side validation mirrors the wizard. 20-draft cap. Daily publish limit. Duplicate-drive check with an explicit reason override. New companies start unverified. |
| Votes, bookmarks | Direct insert/delete | RLS: only as yourself, only on others' published posts. Counters are kept by triggers. |
| Comments | Direct insert/update | Guard triggers: one reply level, 15-minute edit window, own delete and undo only, comments flag, hourly limit. Column grants stop reassigning authorship. |
| Own profile | Direct update | Column grants: no `status`, `onboarded_at` or suspension fields. Handle can change once per 30 days. |
| Reports | `create_report` | Dedupe, daily limit, no reports on removed content, auto-hide at 3 distinct reporters (D6) |
| Moderation | `mod_*` RPCs | No acting on your own content. Escalated items are admin-only. Remove is admin-only. A before-snapshot is stored. Every action is audited and the author is notified. |
| Roles | `admin_set_role` only | **No table policy allows any client write** (C6). You can't change your own role, demote the last admin, or give a team role to a suspended account. |
| Settings | `admin_update_settings` | Keys allowlisted, ranges checked, before/after audited |
| Storage | `avatars/{uid}/…` | Owner-only writes, 2 MB, png/jpeg/webp, private bucket. Logos are admin-only. |

**SECURITY DEFINER hygiene:** every definer function pins `search_path = ''` and schema-qualifies every object. Internal helpers (`_apply_experience_payload`, `write_audit`, `notify_user`, …) aren't executable by clients, and the tests check this.

## Error contract (for the Phase 4 client)

RPC errors raise SQLSTATE `P0001` with a stable code in `DETAIL`. For `validation`, `HINT` holds a JSON object of field → message. These map one-to-one to the mock API's `ApiError` codes.

| Code | Meaning |
|---|---|
| `validation` | Field errors in `HINT` |
| `not_found` | Missing, or not visible to you (deliberately indistinguishable) |
| `forbidden` / `unauthenticated` | Not allowed |
| `duplicate` | Already reported, or same drive already shared |
| `rate_limited` | A daily or hourly limit was hit |
| `published` | Tried to save a published experience as a draft |
| `escalated` / `conflict_of_interest` / `last_admin` / `invalid` | Moderation and admin guards |
| `handle_cooldown`, `edit_window`, `comments_disabled`, `invalid_parent` | Specific guards |
| `42501` / `23514` / `23505` | Raw Postgres: permission denied, check constraint, unique violation |

## Test coverage

| File | Covers |
|---|---|
| `01_auth_domain` | Email validation edge cases, auth hook, user-table trigger, non-PSG JWT claim, visitor (anon) lockout |
| `02_profiles_roles` | Own-row profile access, column limits, handle cooldown, private profiles, onboarding, every role-escalation path, admin role flow + audit |
| `03_experiences` | RPC-only writes, draft privacy (feed, RPC, rounds, questions), validation, https-only links, publish/edit/versioning, duplicates, new companies, rate limit, search, anonymity for student/mod/admin, private profiles, suspension and its expiry, deletion |
| `04_community` | Votes (own, double, impersonation, drafts), counters, bookmarks, views, comments (impersonation, reply depth, edit window, status abuse, reassignment, anonymous author replies, delete and undo, flag, rate limit) |
| `05_moderation` | Reporting, dedupe, auto-hide + audit + notification, reporter privacy, dismiss/hide/restore, reasons, snapshots, admin-only removal, conflict of interest, escalation, removed content, report rate limit |
| `06_admin_storage` | Every admin RPC denied to students, audit log integrity, internal functions, author reveal + audit, user search, suspension, settings validation, company create/merge + audit, storage folder ownership, bucket limits |

## Bugs the tests caught (fixed)

1. **Moderation report bookkeeping** would have errored on any item with more than one report (window function inside `RETURNING`).
2. **Comment and reply insert guard** ran as the student, so row-level security hid other people's posts from it and every comment on someone else's post would have failed. It is now SECURITY DEFINER, bypassed only when there is no signed-in user.
3. **Editing an original experience** was blocked as a "duplicate" after posting a second one for the same drive with a reason.
4. **Company audit trigger:** a version that let clients execute `write_audit()` would have allowed forged audit rows. It is now definer-only.

## Deferred (by design)

| Item | Phase |
|---|---|
| Wire the React app to Supabase (replace `src/api/*` internals) | 4–9 |
| Real email-code sign-in (college address only, D19), code email template, custom SMTP, Mailpit locally | 4 |
| Account deletion: an Edge Function using the service role to delete the `auth.users` row after anonymising content (D14) | 4 |
| Avatar delivery via signed URLs (the bucket is private) | 4 |
| Company insights / question-bank RPCs (SQL aggregates) | 7 |
| Notifications UI (rows are already written) | v1.1 |
| Scheduled purge of soft-deleted rows after 30 days, plus the weekly `pg_dump` backup | 10 |
