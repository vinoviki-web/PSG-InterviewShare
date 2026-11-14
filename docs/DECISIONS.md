# Decision Log: PSG InterviewShare

Status legend: ✅ Approved · 🟡 Proposed (awaiting approval) · ❓ Open question · 📌 Action item (owner) · ⛔ Rejected

## Constraints set by the product owner (✅ 2026-11-13)
| ID | Decision |
|---|---|
| C1 | PSG-only platform. Accounts must be `@psgtech.ac.in` and verified, enforced on the server. |
| C2 | Frontend: React + JavaScript + Tailwind + React Router + Lucide. Deploy on Vercel. |
| C3 | Backend: Supabase (Postgres, Auth, RLS, Storage, Edge Functions). No Express for MVP unless justified. |
| C4 | Light theme primary, premium minimal SaaS aesthetic. |
| C5 | No implementation before plan approval. Work phase by phase, with tests per module. |
| C6 | Roles: Student, Moderator, Admin. Students can never self-escalate. |

## Approved product and architecture decisions (✅ 2026-11-13, "Accept recommendations")
| ID | Decision | Rationale |
|---|---|---|
| D1 | ⛔ *Superseded by D19 (2026-11-14).* ~~Google sign-in (PSG Workspace) primary + 6-digit email OTP fallback. No magic links, no passwords.~~ | PSG mail is on Google Workspace (verified via MX). Lowest friction, and verifies ownership. |
| D2 | Domain enforcement via Supabase Before-User-Created hook + RLS `is_psg_user()` on every policy | Defence in depth. The UI check is cosmetic. |
| D3 | Questions stored as structured, topic-tagged rows | Enables question bank, company insights and future AI |
| D4 | Helpful votes, no star ratings | Ratings carried no signal on the reference |
| D5 | Frontend additions: TanStack Query, react-hook-form + zod, Radix UI primitives, react-markdown (no raw HTML) | Each removes a class of hand-written bugs |
| D6 | Post-moderation: publish instantly, auto-hide at 3 distinct reports, moderator review | Pre-moderation bottlenecks a volunteer-run product |
| D7 | Anonymous posting allowed. Anonymity enforced in the DB (masked feed). Only admins can unmask, and every unmask is audited. | UI-only anonymity leaks via the API |
| D8 | No roll number collected. Email never shown publicly. | Data minimisation. The email local part identifies the student. |
| D9 | No AI in MVP. AI tagging and grounded company summaries in v1.1. | Value depends on content volume |
| D10 | "Load more" cursor pagination with URL-synced filters | Back-button restore, shareable links |
| D11 | Content is gated to verified students. The public landing page shows only aggregate counts and company names. | Exclusivity and privacy |
| D12 | Alumni: a verified user may link a personal email as a secondary sign-in method *while their PSG email is still active* (v1.1) | PSG accounts may be deactivated after graduation |
| D13 | No compensation (CTC/stipend) data in MVP | Sensitive, may conflict with placement-cell policy |
| D14 | Account deletion: user chooses "delete my posts" or "keep anonymised" (default: keep anonymised as "Former PSG student") | Preserves community knowledge with consent |
| D15 | Do not use the "InterviewShare" name or the official PSG logo without permission. Pick a distinct brand. | Name collision with the reference, institutional permission |
| D16 | Budget: free tiers during development. Paid Supabase tier at launch (backups, no pausing). Custom SMTP (e.g. Resend) for OTP. | |
| D17 | Accent colour: deep teal `#0E7C6B` | Distinct from the reference's electric blue. 5.1:1 contrast on white. |
| D18 | Initial admin: product owner (`22e646@psgtech.ac.in`). Moderators: 1 or 2 placement reps per department, appointed by admin. | |
| D19 | **Sign-in uses the college email only** (decided by the product owner 2026-11-14): the student enters their @psgtech.ac.in address and types a 6-digit code sent to that inbox. No Google sign-in, no magic links, no passwords. Replaces D1. | Owner’s decision. Proves ownership of the official college mailbox and removes the Google Cloud OAuth setup. Code delivery to the college inbox (Google Workspace) needs a properly authenticated sender (SPF/DKIM) and possibly a PSG IT allowlist: see A3. |

## Phase 1 design decisions (✅ 2026-11-13, Phase 1 spec approved: [02-ux-spec-and-design-system.md](02-ux-spec-and-design-system.md))
| ID | Decision |
|---|---|
| P11 | Explorer uses a single-column list of rich rows beside a filter rail (not a 3-column card grid) |
| P12 | "Not selected" outcome is styled neutral, not red. Rejection isn't an error state. |
| P13 | Anonymous posts can additionally hide department (k-anonymity: small department + batch + company can identify someone) |
| P14 | Company insights are shown only when 3 or more published experiences exist |
| P15 | Font: Geist Sans / Geist Mono (self-hosted via Fontsource) |
| P16 | Working brand name "Roundwise" until you choose a final name (see Q13) |

## Phase 2 implementation decisions (✅ 2026-11-13, Phase 2 started)
| ID | Decision | Rationale |
|---|---|---|
| I1 | Vite 8 + React 19 (JavaScript), React Router (library mode, `createBrowserRouter`), Tailwind CSS v4 (tokens via `@theme` in CSS instead of `tailwind.config.js`) | Current stable majors. Tailwind v4's CSS-first tokens map 1:1 to the design-token spec. |
| I2 | Prototype runs on an in-memory **mock API** (`src/api/*`) behind TanStack Query hooks. Phase 3+ swaps the implementations to Supabase without touching pages. | Pages are built once. The data layer is replaced, not rewritten. |
| I3 | A dev-only **Prototype controls** panel switches role (visitor/student/moderator/admin), simulates empty data, slow network and errors | Every state in §4 of the spec can be reviewed |
| I4 | Prototype content is fictional and labelled as such in the UI. Companies are shown as monogram tiles, not real logos. | Honesty principle, trademark caution |
| I5 | `cn()` uses tailwind-merge (configured for our custom type scale) so responsive overrides like `hidden sm:inline-flex` reliably beat component defaults | Found in mobile QA: duplicated pills and a page wider than the phone screen |
| I6 | Post-sign-in return path is kept in sessionStorage until the student lands inside the app, and only same-origin paths are honoured | Deep links survive sign-in and onboarding without open redirects |
| I7 | Wizard validates on Continue/Publish (then live while fixing), not on blur. Editing a published experience keeps changes on the device until “Update”, so a half-finished edit never touches the live post. | Blur validation flagged freshly added empty questions. Live posts stay consistent. |
| I8 | Every moderation action stores a before-snapshot so it can be undone. Escalated items are read-only for moderators. Exporting the audit log is itself audited. | Reversible moderation, clear escalation ownership, personal-data accountability |
| I9 | Reports are limited per day (`reports_per_day`) and can’t target removed content | Prevents report spam and abuse of auto-hide |

## Phase 3 database decisions (✅ 2026-11-14, Phase 3 started on the owner’s go-ahead)
| ID | Decision | Rationale |
|---|---|---|
| DB1 | Local development on the Supabase CLI + Docker (`npm run db:*`). Tests are pgTAP via `supabase test db`. | Same Postgres/Auth/Storage as production, with reproducible migrations |
| DB2 | Experiences are written **only** through RPCs (`save_draft`, `publish_experience`, `delete_experience`). Other students read through the masked `experience_feed` view / `get_experience()`. | One place for validation. Anonymity can’t leak through the base table. |
| DB3 | Anonymous authors are masked even for admins and moderators. Unmasking is only `admin_reveal_author()` (reason required, audited). | Implements D7 strictly |
| DB4 | All privileges are revoked by default (including default privileges for future objects). Every grant is explicit, including column-level grants. | Fail closed when a migration forgets something |
| DB5 | RPC errors use SQLSTATE P0001 with a stable code in DETAIL (field errors as JSON in HINT) | Matches the mock API’s `ApiError` codes, so the UI doesn’t change |
| DB6 | Avatars bucket is private (served by signed URLs in Phase 4). The company-logos bucket is public. | Student photos stay inside the community (D11). Logos aren’t sensitive. |
| DB7 | A private profile hides its bio and stops its posts being listed by author. The name still shows on each named post. | Privacy setting is meaningful without hiding authorship the student chose |
| DB8 | Duplicate-drive check runs on first publish (friendly error) and is backed by a partial unique index. A written reason overrides it. | Legitimate repeats (e.g. on-campus then off-campus) stay possible |

## Phase 4 auth decisions (✅ 2026-11-14, Phase 4 started on the owner’s go-ahead)
Details: [04-auth-and-profiles.md](04-auth-and-profiles.md)
| ID | Decision |
|---|---|
| AU1 | Email confirmation ON, so an API password sign-up can’t create a usable account without mailbox ownership |
| AU2 | Only the anon key in the browser. Service-role key only in the Edge Function environment. Env files are gitignored. |
| AU3 | Edge Functions identify the caller from the JWT, never the request body. CORS is limited to configured origins. |
| AU4 | Private avatars bucket served by 1-hour signed URLs. Storage enforces the MIME allowlist and 2 MB limit. |
| AU5 | Account deletion: content step as the student (RLS + audit), auth-user deletion by the service role. The last admin can’t delete their account. |
| AU6 | `npm run dev:db` (Vite mode) switches to the real database. Unconnected sections show “Not connected yet”, never silent sample data. |

## Phase 5 share-wizard decisions (✅ 2026-11-14, Phase 5 started on the owner’s go-ahead)
Details: [05-share-wizard.md](05-share-wizard.md)
| ID | Decision |
|---|---|
| SW1 | The database adapts to the wizard’s contract (company slug, `confirmed`, `draft_max_step`, field-path errors), not the other way round. The UI is unchanged between prototype and database mode. |
| SW2 | Drafts keep partial content, but invalid resource links are never stored. Publish reports them per field. |
| SW3 | A new company name that matches an existing name or alias reuses that company. Only genuinely new names create an unverified company. |
| SW4 | `delete_draft` is separate from `delete_experience` so the wizard can never remove a published post |
| SW5 | Seeded local accounts are created with Auth-compatible empty token columns, and server-side Auth errors are never shown raw |

## Phase 6 browse decisions (✅ 2026-11-14, Phase 6 started on the owner’s go-ahead)
Details: [06-browse-and-read.md](06-browse-and-read.md)
| ID | Decision |
|---|---|
| BR1 | Search matches every word as a prefix in both the ‘simple’ (names, topics) and ‘english’ (stemmed text) configurations. `search_feed` is set-returning, so filters, sort, paging and counts compose on top. Postgres full-text search, no external search service (as planned in doc 01). |
| BR2 | Helpful votes and Saved moved into Phase 6 (from 8) because the experience page’s main buttons depend on them. Comments and reports remain Phase 8. |
| BR3 | Paging is offset-based with an exact total (fine at PSG scale). Revisit keyset paging if the feed grows past ~10k rows. |
| BR4 | `seed-demo.sql` (fictional, generated from the prototype) is for local development only and must never be loaded into staging or production |
| BR5 | Unconnected panels on connected pages (e.g. the company card on the experience page) show nothing rather than misleading zeros |

## Phase 7 company decisions (✅ 2026-11-14, Phase 7 started on the owner’s go-ahead)
Details: [07-companies.md](07-companies.md)
| ID | Decision |
|---|---|
| CO1 | Company aggregates are SQL functions (SECURITY INVOKER) over `experience_feed`, so they inherit every visibility rule rather than re-implementing it |
| CO2 | Insights stay withheld below 3 published experiences (P14). The threshold lives in `company_insight_threshold()`, so it can move to admin settings later. |
| CO3 | Questions are grouped by normalised text (case and punctuation-insensitive). Smarter near-duplicate grouping is a v1.1 candidate (AI tagging). |
| CO4 | Aggregates are computed on request. Revisit with a materialised view only if the directory or insights get slow (> ~10k experiences). |

## Phase 8 community decisions (✅ 2026-11-14, Phase 8 started on the owner’s go-ahead)
Details: [08-comments-and-reports.md](08-comments-and-reports.md)
| ID | Decision |
|---|---|
| CM1 | Comments are written directly under RLS (no RPC): the guard triggers already enforce every rule, and direct writes keep the UI’s optimistic flows simple |
| CM2 | Deleted and hidden comments keep their place (text removed) so reply threads stay readable. Moderator-removed comments disappear entirely. |
| CM3 | Notifications for comments and replies stay v1.1. Rows for moderation events are already written (`notifications`) for the future UI. |

## Phase 9 moderation & admin decisions (✅ 2026-11-14, Phase 9 started on the owner’s go-ahead)
Details: [09-moderation-and-admin.md](09-moderation-and-admin.md)
| ID | Decision |
|---|---|
| MA1 | Moderation and admin logic lives in SECURITY DEFINER SQL functions that return the UI’s exact shapes. The adapters are one-liners. |
| MA2 | Moderators never see reporters. Admins do (with email). Anonymous authors stay masked for everyone, admins included, except through `admin_unmask` (reason, audited). |
| MA3 | Every moderation action stores a before-snapshot, so Undo restores content, reports and the author notification exactly |
| MA4 | Admin RPCs write one descriptive audit row. A transaction-local flag (not client-settable) suppresses duplicate trigger rows. |
| MA5 | Suspension blocks all reading, including a student’s own posts (migration 0820, found by the live test) |

## Phase 10 launch decisions (✅ 2026-11-14, Phase 10 started on the owner’s go-ahead)
Details: [10-launch.md](10-launch.md)
| ID | Decision |
|---|---|
| LA1 | Reference data (departments, topics, companies) ships as an idempotent migration. `seed.sql` and `seed-demo.sql` are local-only and never pushed. |
| LA2 | Database builds contain no fictional data: the mock store and seed are aliased to an empty stub, and CI fails if sample names appear in the bundle. The `/dev/ui` showcase is excluded from production. |
| LA3 | Housekeeping runs nightly in the database (pg_cron → `_run_maintenance()`), not in an external scheduler: 30-day purge of removed/deleted content (hidden content kept), 90-day draft expiry with a 7-day warning, suspension lifting, 180-day read-notification pruning. One System audit row per run that changed something. |
| LA4 | Browser tests run against the real database-mode app, not the prototype, and every main page must pass axe WCAG 2.1 AA. Muted text uses `ink-500` (4.9:1); `ink-400` is for borders and icons only. |
| LA5 | Backups are weekly, logical (roles, schema, data) and always encrypted, because they contain student emails. Kept 30 days in GitHub, plus a monthly copy with the placement cell. |
| LA6 | Security headers live in `vercel.json`. CSP keeps scripts same-origin and allows network only to `*.supabase.co`; inline styles are allowed for Radix positioning. No HSTS `preload` (a `vercel.app` subdomain can't be preloaded). |
| LA7 | Supabase's new key types: the site uses the publishable key (legacy anon key accepted as fallback); the account-deletion function reads `SUPABASE_SECRET_KEYS` (legacy service-role fallback) and runs with `verify_jwt = false`, because the platform check only understands legacy keys. The function's own `getUser()` check is the gate; live tests prove it refuses missing, forged, public-key and deleted-user tokens. Allowed callers come from the `ALLOWED_ORIGINS` secret. |
| LA8 | Any Vercel build without `VITE_DATA_SOURCE=supabase` fails, so the prototype (demo sign-in code) can never be deployed by mistake. `VITE_PROTOTYPE=1` is the explicit opt-out for a hosted prototype demo. |
| LA9 | Access rules evaluate `auth.uid()` and role helpers once per query (`(select …)`), admin write rules are split per action, and every foreign key is indexed (migration 0920, from Supabase's advisor). The 3 security-definer views stay by design (masking, D7) and are covered by test 12. |
| LA10 | **₹0 hosting** (owner decision, 2026-11-14): Supabase Free (Mumbai), Vercel Hobby on the free `vercel.app` address, no custom domain, no paid add-ons or AI APIs. Sign-in codes go through a dedicated Gmail account over SMTP (app password), capped at 20 emails/hour, because free transactional providers need a verified domain. Backups are the weekly encrypted GitHub workflow. No upgrade without the owner's explicit approval. |
| LA11 | **Independent student project** (owner decision): name *PSG InterviewShare*; no PSG logo or claim of endorsement; "independent student project, not affiliated with or endorsed by PSG College of Technology" on every page, About, Terms and the sign-in email. Official branding only after placement-cell permission (A2). |
| LA12 | The GitHub repository stays **public** (owner decision, 2026-11-14). Accepted: encrypted backup artifacts are downloadable by signed-in GitHub users (unreadable without the passphrase), scheduled backups pause after 60 days without commits, and the demo admin address is visible. No secrets are in the repository; pull-request test runs get no secrets. |

## Open questions (❓)
| ID | Question | Recommendation |
|---|---|---|
| Q13 | ✅ Resolved 2026-11-14: **PSG InterviewShare** (owner's choice). Note: the reference site is titled "InterviewShare"; see A1. | — |

## Action items (📌)
| ID | Item | Owner |
|---|---|---|
| A1 | Contact the maintainer of interview-share.vercel.app (titled "InterviewShare") before launch: the names are close, so explain the project and avoid confusion. Never copy their content. | Product owner |
| A2 | Later, with a working demo: ask the placement cell about official recognition, branding and moderator nominations. Until then the project stays independent (LA11). | Product owner |
| A3 | ✅ Decided (LA10): a dedicated Gmail account sends codes over SMTP; no domain. Revisit if volume outgrows ~480 emails/day. | Product owner |
| A4 | Verify the department/programme list (migration `20261114000900_reference_data.sql`, 21 entries) against PSG Tech’s official list before launch | Product owner |
