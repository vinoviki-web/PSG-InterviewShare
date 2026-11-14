# Phase 6: Browsing & Reading on the Real Database

> **Status:** Complete. 267 database tests and 80 live checks (sign-in 29, wizard 26, browse 25) passing. Walked through in the browser against the local stack.
> **Date:** 2026-11-14 · **Decisions:** BR1–BR5 in [DECISIONS.md](DECISIONS.md)

## What is live (`npm run dev:db`)

| Screen | Server side |
|---|---|
| **Explore** | `search_feed(q)` + filters (company, type, hiring, outcome, difficulty, department, batch, "includes a round"), sort (latest, most helpful, most read), 20 per page with an exact total, filter-rail counts via `experience_facets()` |
| **Search** | Every word is matched as a prefix in company names, aliases, role, topics, question text and the narrative. Examples: "fresh" → Freshworks, "tcs" → TCS, "lru" → the LRU-cache question, "anagram" → "anagrams". |
| **Experience page** | `get_experience(id)`: author and department masked per the anonymity rules, "also asked in N other experiences" counts, related experiences (same company, then same type with overlapping topics) |
| **Views** | `record_view`: counted once per student per 24 h. Feeds "Recently viewed". |
| **Helpful / Save** | Direct writes under RLS. You can't vote on your own post. Counts update immediately. |
| **Home** | Newest experiences, "From your department", recently viewed, saved, your impact |
| **⌘K search** | Experiences and companies from the database |
| **Delete (owner)** | `delete_experience` from the experience page |

**Still not connected:** company directory and company pages (Phase 7), comments and reporting (Phase 8), moderation and admin (Phase 9). In database mode these show "Not connected yet".

## Local demo content

`supabase/seed-demo.sql` is generated from the prototype's **fictional** data (`npm run db:demo-seed`) and loaded by `npm run db:reset` in addition to `seed.sql`:
- 24 fictional students (sign-in works through Mailpit) and about 54 experiences across 18 companies, with 205 rounds and 391 questions.
- 805 real helpful-vote rows, so "Most helpful" is genuine.
- One hidden experience, for moderation work in Phase 9.

It is **local only** (DECISIONS BR4). Production starts empty.

## Tests

| Suite | Proves |
|---|---|
| `supabase/tests/09_search_browse_test.sql` (14) | Prefix and stemmed search, aliases, every-word matching, drafts never searchable, anonymity and hidden departments masked in results, hostile input is inert, round and department filters, facets, visitors can't search |
| `npm run test:browse` (25, live) | Paging without repeats, ordering, each filter, Most helpful by real votes, anonymity in lists, experience page shape, hidden posts can't be opened, related, view counting, Recently viewed, helpful/save round trips, no voting on your own post |
