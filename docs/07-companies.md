# Phase 7: Companies on the Real Database

> **Status:** Complete. 300 database tests and 113 live checks (sign-in 29, wizard 26, browse 25, companies 33) passing. The browser walkthrough was skipped this phase because the owner was using the preview pane; the live checks cover the same data paths.
> **Date:** 2026-11-14 · **Decisions:** CO1–CO4 in [DECISIONS.md](DECISIONS.md)

## What is live (`npm run dev:db`)

| Screen | Server side (migration 0700, all SECURITY INVOKER over `experience_feed`) |
|---|---|
| **Companies directory** | `company_directory(q, industry, sort)`: companies with at least one published experience. Search by name or alias ("tcs"), industry filter, sort by most experiences / A–Z / recently active. `company_industries()` feeds the filter chips. |
| **Company page** | `get_company(slug)`: details, provenance of the description, published and question counts. A merged company returns `{ redirect }` to its target. |
| **Overview tab** | `get_company_insights(slug)`: experience count, average difficulty, reported selections out of disclosed outcomes, most common process (and the others seen), top topics counted once per experience (post or question tags), rounds by type, experiences by batch, latest interview, plus the latest 3 experiences. **Withheld below 3 experiences** (P14). |
| **Experiences tab** | The explorer's search with the company filter (Phase 6) |
| **Questions tab** | `get_company_questions(slug, kind)`: grouped by normalised text, so "Reverse … groups of k." and "… groups of K!" count as one. Most-reported first, with batches, round types, topics and links to each experience. Optional question-type filter. |
| **Home → Trending** | `trending_companies(limit)`: new published experiences in the last 120 days, lightly weighted by reads |
| **Experience page → company card** | Now shows the count, usual process and top topics |

**Visibility:** everything is computed from published experiences the student can see. Hidden posts never count. Anonymous posts count towards numbers, but no author or department can be recovered. Visitors (signed out) can't call any of it.

**Still not connected:** comments and reporting (Phase 8), moderation and admin (Phase 9).

## Tests

| Suite | Proves |
|---|---|
| `supabase/tests/10_companies_test.sql` (33) | On a fresh fictional company with hand-countable numbers: threshold, average (4.0), selections out of disclosed outcomes, top process seen twice, round, topic and batch counts, hidden posts excluded everywhere, question grouping and type filter, no author leakage, page counts, merge redirect, unknown slug, alias search, empty and merged companies left out, A–Z + industry, trending, visitors locked out |
| `npm run test:companies` (33, live) | Amazon and Zoho in the demo data: every insight cross-checked against the raw feed (counts, average, outcomes, process totals, batches, per-experience topic counts, question ordering and links, type filter), the unverified company has no description, below-threshold behaviour, not-found, trending |
