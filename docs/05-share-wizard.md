# Phase 5: Share Wizard on the Real Database

> **Status:** Complete. 253 database tests, 29 live sign-in checks and 26 live wizard checks passing. Published from the UI against the local stack.
> **Date:** 2026-11-14 · **Decisions:** SW1–SW5 in [DECISIONS.md](DECISIONS.md)

## What is live

In database mode (`npm run dev:db`), the whole share flow writes to Supabase:

| Wizard action | Server side |
|---|---|
| First meaningful change, then autosave | `save_draft(p)` RPC creates or updates the draft and replaces rounds, questions, topics and resources in one transaction |
| Resume a draft / `/share/:id?step=N` | `get_experience_for_editor(id)`: owner-only row in the wizard's own format (company slug, topic slugs, month as `YYYY-MM-01`) |
| Company picker | Live company list with aliases and experience counts. A new name becomes an **unverified** company on publish, and a name matching an existing company or alias (e.g. "tcs") reuses it. |
| Role suggestions | Most common published role titles at that company |
| Duplicate check | `check_duplicate_experience`: same company + role + type + batch from the same author, case- and space-insensitive |
| Publish | `publish_experience(id, changes)`: server-side validation with **the wizard's field paths** (`rounds.1.description`, `resources.0.url`, `confirmed`…), daily limit, duplicate-drive rule, search indexing, audit |
| Edit a published experience (`?edit=1`) | Same RPC with `changes`: version +1, marked edited |
| Delete draft | `delete_draft(id)`: refuses anything that isn't your own draft |
| Drafts on Home and My profile | Live list of your drafts |

**Not yet connected:** after publishing, "View experience" opens the experience page, which connects in **Phase 6** along with browsing and search.

## Database changes (migration 0500)

- `experiences.draft_max_step`. It never goes backwards.
- The payload accepts `company_slug`, and a merged company's slug resolves to its target.
- `duplicate_of` is stored only when it points at the author's own experience.
- Eligibility is rebuilt server-side from known keys only: CGPA 0–10, real department IDs, `backlogs` yes/no/unknown, `other` ≤ 300 characters.
- Resource links must be `https://`. Invalid ones are **never stored**, even in drafts, and publishing reports them per field.
- Question topics are capped at 5. Empty question rows in a draft are skipped.

## Tests

| Suite | What it proves |
|---|---|
| `supabase/tests/08_share_wizard_test.sql` (24) | Slug and merge resolution, step tracking, eligibility sanitising, editor round trip, owner-only editor and delete, `duplicate_of` can't point at others, field-path errors, failed publish leaves the draft intact, new company vs alias reuse, delete never removes a published post |
| `npm run test:wizard` (26, live) | The exact `toPayload()` shape from a real signed-in student: draft → autosave → reload → duplicate → publish → edit → new company → anonymity → delete |

## Bugs found and fixed in this phase

1. **Seeded demo accounts couldn't sign in** ("Database error finding user"). The seed inserted NULL token columns, which the Auth server can't read. Real sign-ups were never affected. The seed now writes `''`.
2. **Raw Auth server errors reached the screen.** Any 5xx now shows "Something went wrong on our side. Try again in a moment." and logs details only in development.
