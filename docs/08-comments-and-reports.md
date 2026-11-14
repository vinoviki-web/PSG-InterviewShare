# Phase 8: Comments & Reporting on the Real Database

> **Status:** Complete. 300 database tests and 137 live checks (sign-in 29, wizard 26, browse 25, companies 33, community 24) passing. Commented and reported from the browser and confirmed in the database.
> **Date:** 2026-11-14 · **Decisions:** CM1–CM3 in [DECISIONS.md](DECISIONS.md)

## What is live (`npm run dev:db`)

Everything a student uses now runs on the database. Only moderation and admin (Phase 9) remain on prototype data.

| Action | Server side |
|---|---|
| Read comments | `comment_feed` view: deleted and hidden comments keep their place but lose their text, and moderator-removed comments vanish. An anonymous experience's author replies as "Author" with no name. |
| Comment / reply | Insert under RLS + guard trigger: published experiences only, one reply level, 2–2,000 characters, hourly limit, comments flag, authorship forced to the signed-in student |
| Edit | Own comment, within 15 minutes, marked "edited" |
| Delete / Undo | Own comment: visible ↔ deleted only. Moderation states can't be set by students. The comment count follows. |
| Report an experience or comment | `create_report`: one report per student per item, daily limit, nothing hidden or removed can be reported. **3 different reporters auto-hide** the item, the author is notified and the auto-hide is audited as a system action. Reporters stay private, and students can't read any reports. |

These rules were enforced and pgTAP-tested since Phase 3 (`04_community`, `05_moderation`). This phase connects the UI and proves the whole path live.

## Tests

| Suite | Proves |
|---|---|
| `npm run test:community` (24, live, five real signed-in students) | Comment, named reply marked as author, reply depth, length limit, no impersonation, edit + "edited", can't edit others' comments, no self-moderation, delete hides text and the count follows, Undo, anonymous author reply, report + dedupe, reports private, two reports don't hide, three do, the author sees the reason and is notified, no comments or re-reports on hidden posts, three reports hide a comment |
| Browser | Posted a comment and reported an experience through the dialog. Both rows confirmed in the database. |
