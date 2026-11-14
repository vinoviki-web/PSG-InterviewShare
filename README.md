# PSG InterviewShare

A platform for PSG College of Technology students to share and explore real interview experiences, across every branch: software, core electronics, electrical, mechanical, civil and more.

> **Independent student project.** Not affiliated with or endorsed by PSG College of Technology or its placement cell.

> **Status:** Phase 10 complete and audited: **ready to deploy on free plans (₹0)** following [docs/10](docs/10-launch.md). The whole app runs on the real Supabase database: college-email sign-in, profiles, sharing, browsing, search, companies, comments, reporting, moderation and admin (docs [04](docs/04-auth-and-profiles.md)–[09](docs/09-moderation-and-admin.md)). Launch hardening, the go-live runbook and what's needed from the owner: [docs/10](docs/10-launch.md).

## Database (Phase 3)

```bash
npm run db:start   # needs Docker; first run downloads images
npm run db:reset   # migrations + seed
npm run db:test    # pgTAP allow/deny suite
```

See [docs/03-database-and-security.md](docs/03-database-and-security.md).

## Run the app against the real database (Phase 4)

```bash
npm run db:start                     # local Supabase + Mailpit + Edge Functions
npx supabase status                  # copy API URL + publishable key into .env.db.local (see .env.example)
npm run dev:db                       # app in database mode (http://localhost:5173)
npm run test:auth                    # live sign-in integration test
npm run test:wizard                  # live share-wizard integration test
npm run test:browse                  # live browse/read integration test (needs the demo seed: npm run db:reset)
npm run test:companies               # live companies integration test (needs the demo seed)
npm run test:community               # live comments + reporting integration test
npm run test:admin                   # live moderation + admin integration test (needs the seed)
npm run test:e2e                     # browser end-to-end + accessibility tests (Playwright, uses installed Chrome)
npm run test:all                     # everything above plus npm run db:test
```

Sign in with any `@psgtech.ac.in` address. The 6-digit code arrives in **Mailpit** at http://127.0.0.1:54324 (local only; real emails need the production sender, decision A3). In database mode every section is live, including moderation and admin. Demo team accounts: moderator `21z235`, admin `22e646`. `npm run db:reset` also loads fictional local-only demo content (24 students, ~54 experiences). Plain `npm run dev` still runs the full prototype on sample data.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173. Use the **Prototype** button (bottom-left) to:

- **View as** a visitor, a new student (onboarding), a student, a moderator or an admin.
- Simulate a **slow network** (skeletons), **empty data** (empty states) and **failing requests** (error states).
- **Reset prototype data.** Changes persist in `localStorage` until reset.

Sign-in is college email only (D19): enter any `@psgtech.ac.in` address, then the demo code `123456` (`000000` simulates an expired code). Typing or pasting a non-college address shows the PSG-only error.

## Docs

| Doc | What |
|---|---|
| [docs/01-product-discovery.md](docs/01-product-discovery.md) | Reference analysis, PRD-level scope, architecture, auth, DB design, roadmap |
| [docs/02-ux-spec-and-design-system.md](docs/02-ux-spec-and-design-system.md) | Design tokens, components, states, page specs, journeys |
| [docs/03-database-and-security.md](docs/03-database-and-security.md) | Schema, access rules, RPC error contract, test coverage |
| [docs/04-auth-and-profiles.md](docs/04-auth-and-profiles.md) | Email-code sign-in, sessions, profiles, avatars, account deletion |
| [docs/05-share-wizard.md](docs/05-share-wizard.md) | Drafts, autosave, publish and edit on the database |
| [docs/06-browse-and-read.md](docs/06-browse-and-read.md) | Explore, search, experience pages, votes and saves on the database; local demo content |
| [docs/07-companies.md](docs/07-companies.md) | Company directory, pages, insights, questions, trending on the database |
| [docs/08-comments-and-reports.md](docs/08-comments-and-reports.md) | Comments, replies and reporting on the database |
| [docs/09-moderation-and-admin.md](docs/09-moderation-and-admin.md) | Moderation queue, admin area, audit, settings on the database |
| [docs/10-launch.md](docs/10-launch.md) | Launch hardening, test totals, free-tier limits, the ₹0 deployment runbook, backups |
| [docs/DECISIONS.md](docs/DECISIONS.md) | Approved decisions, open questions, action items |

## Structure

```
src/
  api/          Mock API + Supabase adapters (api/sb/), same signatures
  mocks/        Fictional seed data + in-memory db (prototype only; stub.js replaces it in database builds)
  components/
    ui/         Design-system primitives (Button, Field, Select, Dialog, Toast…)
    experience/ ExperienceRow, ExperienceArticle, RoundPipeline, Comments…
    company/    CompanyCard, insights
    explore/    Filter panel
  layouts/      AppShell (top nav, mobile bottom nav, ⌘K), PublicLayout
  pages/        Route pages (lazy-loaded)
  routes/       Auth / role guards
  dev/          Prototype controls, /dev/ui component showcase
  styles/       Tailwind v4 tokens (@theme)
e2e/            Playwright end-to-end + axe accessibility tests
supabase/       Migrations, pgTAP tests, local seed, email template, Edge Function
scripts/        Live integration tests, demo-seed generator, encrypted backup
.github/        CI (all tests on every push) and the weekly backup workflow
```

`/dev/ui` shows every design-system component and token (dev server and prototype builds only).
