# Phase 9: Moderation & Admin on the Real Database

> **Status:** Complete. **The whole app now runs on the database.** 380 database tests and 162 live checks (sign-in 29, wizard 26, browse 25, companies 33, community 24, moderation/admin 25) passing. Checked in the browser as moderator and admin.
> **Date:** 2026-11-14 · **Decisions:** MA1–MA5 in [DECISIONS.md](DECISIONS.md)

## What is live (`npm run dev:db`)

### Moderation (`/mod`, migration 0800)
| Screen / action | SQL function | Rules |
|---|---|---|
| Queue: Open · Hidden · Resolved | `mod_queue(tab)` | Escalated items first, then most active reports, then oldest. Tab counts. Reason labels. **Reporter identity never returned to moderators.** |
| Item drawer | `mod_item(type, id)` | Content (anonymous authors masked even for admins), reports, the author's history counts, escalation, full action history incl. system auto-hides, and permissions (`own`, `escalated`, `removed`, `missing`) |
| Dismiss | `mod_dismiss` | Closes reports and restores auto-hidden content |
| Hide | `mod_hide` | Reason + a 20–600 character message to the author (sent as a notification) |
| Restore | `mod_restore` | Hidden → visible, closes reports |
| Escalate | `mod_escalate_to_admin` | Hands the item to admins. Moderators can then only watch. |
| Undo | `mod_undo` | Restores content and reports from the stored before-snapshot and withdraws the notification. Only your own actions (admins: any). |

### Admin (`/admin`, migration 0810)
| Screen | SQL functions |
|---|---|
| Overview | `admin_overview()`: KPIs with week-over-week, 8-week sign-up and publish charts, median report resolution, top companies, attention counts |
| Users | `admin_users(filters)`, `admin_user_facets()`, `admin_user_detail(id)`. Emails shown to admins only. Anonymous posts are counted, never listed. Expired suspensions lift automatically (logged as System). |
| Suspend / lift / roles | `admin_suspend(user, 1/7/30/0 days, reason)`, `admin_lift_suspension`, `admin_set_role`. No self-suspension or self-role change, admins can't be suspended, no team role while suspended. The student sees the reason. |
| Companies | `admin_companies`, `admin_company`, `admin_save_company` (name and alias clashes, domain-only websites, normalised, source required with a description), `admin_set_company_verified`, `admin_merge_preview`, `admin_merge_companies` (moves experiences and aliases, keeps redirects one hop long) |
| Reports | `admin_reports(status, q)` with reporter names and emails. `admin_remove_content` (reason required, author notified). `admin_suspend_author` (suspends without revealing who it is). |
| Reveal author | `admin_unmask(type, id, reason)`: **the only way to see an anonymous author** (D7). 10+ character reason, always audited. |
| Audit log | `admin_audit(filters)` (actor incl. System, action, entity, date range, newest 1,000), `admin_audit_export` (exports are themselves audited) |
| Settings | `admin_save_settings`: per-field validation (limit ranges, 200-character announcement, future expiry), audits only what changed |

**One audit entry per admin action.** Functions that write their own descriptive audit row set a transaction-local flag. The generic company trigger then stays quiet, so there are no duplicates. Clients can't set the flag (`set_config` isn't exposed through the API).

## Found and fixed in this phase

**Suspended students could still read their own posts** (found by the live admin test). The feed's "your own rows" rule only checked for a PSG account. Migration 0820 makes it require an *active* account, matching "You can't read or post while suspended". Two pgTAP tests lock it in.

## Tests

| Suite | Proves |
|---|---|
| `supabase/tests/11_moderation_admin_test.sql` (80) | Every new function runs. Students and moderators are locked out of admin, students out of moderation. Auto-hide state and labels. Reporter privacy. Own-content and escalation blocks (UI flag and server). Masking in the drawer. Hide validation, effect, notification and attribution. Undo by the actor only, restoring post, report and notification. Dismiss restores. Escalation lock. Admin reporter view with emails. Unmask rules and audit. Suspend-author. Removal. Users search, status and roles. Suspended authors read nothing. Lift and double-lift. Automatic expiry audited as System. Company validation, normalisation, source round trip, verify, single audit rows, merge preview, merge and re-merge refusal. Audit filters and System actor. Export audit. Settings validation and change-only audit. Overview shape. |
| `npm run test:admin` (25, live) | Real moderator and admin accounts signed in with emailed codes: the full queue → hide → notify → undo → dismiss → escalate → admin unmask → audit → suspend author → locked out → lift → remove → company add/merge/redirect → settings → announcement → overview |

## Operations note

After Docker Desktop restarts, the local Edge Functions container can come back stuck (account deletion returns 503). Fix it with:

```bash
npm run db:stop && npm run db:start
```
