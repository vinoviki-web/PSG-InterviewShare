-- Phase 9: moderation queue + admin functions (every function exercised).
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('author', pg_temp.make_user('34z001@psgtech.ac.in', 'Ann Author')),
  ('r1', pg_temp.make_user('34z011@psgtech.ac.in', 'Rita One')),
  ('r2', pg_temp.make_user('34z012@psgtech.ac.in', 'Ravi Two')),
  ('r3', pg_temp.make_user('34z013@psgtech.ac.in', 'Rosa Three')),
  ('mod', pg_temp.make_user('34z020@psgtech.ac.in', 'Mona Mod')),
  ('mod2', pg_temp.make_user('34z021@psgtech.ac.in', 'Milo Mod')),
  ('admin', pg_temp.make_user('34z030@psgtech.ac.in', 'Ada Admin')),
  ('student', pg_temp.make_user('34z040@psgtech.ac.in', 'Sam Student'));
insert into user_roles (user_id, role) select v, 'moderator' from ids where k in ('mod', 'mod2');
insert into user_roles (user_id, role) select v, 'admin' from ids where k = 'admin';

select pg_temp.login((select v from ids where k = 'author'));
insert into ids select 'named', (save_draft(pg_temp.payload('cisco', 'Network Engineer Intern')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'named'));
insert into ids select 'anon', (save_draft(pg_temp.payload('oracle', 'Member of Technical Staff', '{"is_anonymous": true}')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'anon'));
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'mod'));
insert into ids select 'modpost', (save_draft(pg_temp.payload('paypal', 'Software Engineer Intern')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'modpost'));
select pg_temp.logout();

-- reports: three on the named post (auto-hides), one on the anonymous post, one on the moderator's post
select pg_temp.login((select v from ids where k = 'r1'));
select create_report('experience', (select v from ids where k = 'named'), 'misleading', 'Rounds look wrong');
select create_report('experience', (select v from ids where k = 'anon'), 'abusive', 'Insults the interviewer');
select create_report('experience', (select v from ids where k = 'modpost'), 'spam', '');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'r2'));
select create_report('experience', (select v from ids where k = 'named'), 'misleading', '');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'r3'));
select create_report('experience', (select v from ids where k = 'named'), 'confidential', '');
select pg_temp.logout();

-- ------------------------------------------------------------------ access
select pg_temp.login((select v from ids where k = 'student'));
select is(pg_temp.err($$select mod_queue('open')$$), 'forbidden', 'students can’t open the moderation queue');
select is(pg_temp.err($$select admin_overview()$$), 'forbidden', 'students can’t open the admin overview');
select is(pg_temp.err($$select admin_users('{}')$$), 'forbidden', 'students can’t list users');
select is(pg_temp.err($$select admin_unmask('experience', (select v from ids where k = 'anon'), 'Just curious about this')$$), 'forbidden', 'students can’t unmask authors');
select pg_temp.logout();

-- ------------------------------------------------------------------ moderator: queue + item
select pg_temp.login((select v from ids where k = 'mod'));
select is(pg_temp.err($$select admin_overview()$$), 'forbidden', 'moderators can’t open the admin overview');
create temp table q as select mod_queue('open') j;
select ok((select (j -> 'counts' ->> 'open')::int from q) >= 3, 'the open tab counts reported items');
select is((select s ->> 'state' from q, jsonb_array_elements(j -> 'items') s where s ->> 'target_id' = (select v::text from ids where k = 'named')), 'auto_hidden', 'three reports show as auto-hidden');
select is((select s ->> 'top_reason_label' from q, jsonb_array_elements(j -> 'items') s where s ->> 'target_id' = (select v::text from ids where k = 'named')), 'Misleading or fabricated', 'the top reason is labelled');
select ok((select s -> 'reporters' = 'null'::jsonb or not (s ? 'reporters') from q, jsonb_array_elements(j -> 'items') s where s ->> 'target_id' = (select v::text from ids where k = 'named')), 'moderators never see who reported');
select ok((select (s ->> 'is_own')::boolean from q, jsonb_array_elements(j -> 'items') s where s ->> 'target_id' = (select v::text from ids where k = 'modpost')), 'a moderator’s own post is flagged as theirs');
select is(mod_item('experience', (select v from ids where k = 'modpost')) -> 'permissions' ->> 'blocked', 'own', 'they can’t act on their own post');
select is(pg_temp.err($$select mod_dismiss('experience', (select v from ids where k = 'modpost'), '')$$), 'forbidden', 'and the server refuses it too');

create temp table it as select mod_item('experience', (select v from ids where k = 'anon')) j;
select is((select j -> 'author' -> 'user' from it), 'null'::jsonb, 'an anonymous author stays masked in the moderation drawer');
select ok((select (j -> 'author' ->> 'masked')::boolean from it), '…and is flagged as masked');
select is((select j -> 'content' -> 'author' from it), 'null'::jsonb, 'the content preview hides the author too');
select ok((select j -> 'reports' -> 0 -> 'reporter' = 'null'::jsonb from it), 'report rows hide the reporter');

-- hide: validation, effect, notification, undo
select is(pg_temp.err($$select mod_hide('experience', (select v from ids where k = 'anon'), 'abusive', 'Too short')$$), 'validation', 'hiding needs a 20+ character message to the author');
create temp table acts (k text, v bigint);
grant select, insert on acts to authenticated;
insert into acts select 'hide', (mod_hide('experience', (select v from ids where k = 'anon'), 'abusive', 'Please remove the personal remarks about the interviewer.') ->> 'action_id')::bigint;
select is((select status::text from experience_feed where id = (select v from ids where k = 'anon')), 'hidden', 'the post is hidden');
select pg_temp.logout();
select ok(exists (select 1 from notifications where user_id = (select v from ids where k = 'author') and type = 'content_hidden'), 'the author is notified with the message');
select is((select hidden_by from experiences where id = (select v from ids where k = 'anon')), (select v from ids where k = 'mod'), 'who hid it is recorded');
select pg_temp.login((select v from ids where k = 'mod2'));
select is(pg_temp.err($$select mod_undo((select v from acts where k = 'hide'))$$), 'forbidden', 'another moderator can’t undo your action');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'mod'));
select ok(mod_undo((select v from acts where k = 'hide')), 'the moderator can undo their hide');
select pg_temp.logout();
select is((select status::text from experiences where id = (select v from ids where k = 'anon')), 'published', 'undo restores the post');
select is((select status::text from reports where target_id = (select v from ids where k = 'anon')), 'open', 'undo reopens the report');
select ok(not exists (select 1 from notifications where user_id = (select v from ids where k = 'author') and type = 'content_hidden'), 'undo withdraws the notification');

-- dismiss restores auto-hidden content; escalate locks it for moderators
select pg_temp.login((select v from ids where k = 'mod'));
select is((mod_dismiss('experience', (select v from ids where k = 'named'), 'Rounds match other reports') ->> 'restored')::boolean, true, 'dismissing restores an auto-hidden post');
select is(pg_temp.err($$select mod_dismiss('experience', (select v from ids where k = 'named'), '')$$), 'conflict', 'nothing left to dismiss');
select ok(mod_escalate_to_admin('experience', (select v from ids where k = 'anon'), 'Needs an admin decision') ? 'action_id', 'a moderator can escalate');
select is(mod_item('experience', (select v from ids where k = 'anon')) -> 'permissions' ->> 'blocked', 'escalated', 'escalated items are read-only for moderators');
select ok(mod_item('experience', (select v from ids where k = 'anon')) -> 'escalation' ->> 'by' = 'Mona Mod', 'the drawer shows who escalated');
select is(pg_temp.err($$select mod_hide('experience', (select v from ids where k = 'anon'), 'abusive', 'Trying to hide after escalation anyway.')$$), 'forbidden', 'the server refuses moderator action on escalated items');
select pg_temp.logout();

-- ------------------------------------------------------------------ admin: reports, reporters, removal, unmask, suspend-author
select pg_temp.login((select v from ids where k = 'admin'));
create temp table rep as select admin_reports('escalated', '') j;
select ok((select (j -> 'counts' ->> 'escalated')::int from rep) >= 1, 'admins see escalated items');
select ok((select jsonb_array_length(s -> 'reporters') >= 1 from rep, jsonb_array_elements(j -> 'items') s where s ->> 'target_id' = (select v::text from ids where k = 'anon')), 'admins see who reported');
select ok((select s -> 'reporters' -> 0 ->> 'email' like '%@psgtech.ac.in' from rep, jsonb_array_elements(j -> 'items') s where s ->> 'target_id' = (select v::text from ids where k = 'anon')), '…including their email');
select is(pg_temp.err($$select admin_unmask('experience', (select v from ids where k = 'named'), 'Checking this named post')$$), 'conflict', 'unmasking a named post is refused');
select is(pg_temp.err($$select admin_unmask('experience', (select v from ids where k = 'anon'), 'short')$$), 'validation', 'unmasking needs a reason of 10+ characters');
select is(admin_unmask('experience', (select v from ids where k = 'anon'), 'Harassment report ticket #42') ->> 'full_name', 'Ann Author', 'an admin can unmask with a reason');
select ok(exists (select 1 from audit_logs where action = 'experience.unmask' and metadata ->> 'reason' = 'Harassment report ticket #42'), 'every unmask is audited with its reason');
select is((admin_suspend_author('experience', (select v from ids where k = 'anon'), 7, 'Repeated personal attacks in posts') -> 'until') is not null, true, 'an admin can suspend the author without revealing them');
select is(pg_temp.err($$select admin_suspend_author('experience', (select v from ids where k = 'anon'), 7, 'Again for the same post')$$), 'conflict', 'an already-suspended author can’t be suspended again');
select is(pg_temp.err($$select admin_remove_content('experience', (select v from ids where k = 'anon'), 'too short')$$), 'validation', 'removal needs a reason of 10+ characters');
select ok(admin_remove_content('experience', (select v from ids where k = 'anon'), 'Personal attacks on a named interviewer'), 'an admin can remove content');
select pg_temp.logout();
select is((select status::text from experiences where id = (select v from ids where k = 'anon')), 'removed', 'the post is removed');
select is((select count(*)::int from reports where target_id = (select v from ids where k = 'anon') and status = 'actioned' and resolution = 'removed'), 1, 'its reports are closed as removed');
select pg_temp.login((select v from ids where k = 'admin'));

-- ------------------------------------------------------------------ admin: users
create temp table us as select admin_users('{"q": "34z0"}') j;
select ok((select (j ->> 'total')::int from us) >= 8, 'admins can search users (by email)');
select is((select u ->> 'status' from us, jsonb_array_elements(j -> 'items') u where u ->> 'id' = (select v::text from ids where k = 'author')), 'suspended', 'the suspended author shows as suspended');
select is((select u ->> 'role' from us, jsonb_array_elements(j -> 'items') u where u ->> 'id' = (select v::text from ids where k = 'mod')), 'moderator', 'roles are shown');
select ok(jsonb_array_length(admin_user_facets() -> 'departments') >= 1, 'user filter facets come back');
create temp table ud as select admin_user_detail((select v from ids where k = 'author')) j;
select is((select (j ->> 'anonymous_count')::int from ud), 1, 'anonymous posts are counted…');
select ok((select not (j -> 'experiences')::text like '%Oracle%' from ud), '…but never listed in user detail');
select is(pg_temp.err($$select admin_suspend((select v from ids where k = 'student'), 3, 'A valid reason here')$$), 'validation', 'suspension length must be 1, 7, 30 days or until lifted');
select is(pg_temp.err($$select admin_suspend(auth.uid(), 7, 'Suspending myself somehow')$$), 'forbidden', 'admins can’t suspend themselves');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'author'));
select is(pg_temp.n('select 1 from experience_feed'), 0::bigint, 'a suspended author can’t read anything, not even their own posts');
select is(pg_temp.err($$select get_experience((select v from ids where k = 'named'))$$), 'not_found', '…or open their own post');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'admin'));
select ok(admin_lift_suspension((select v from ids where k = 'author')), 'an admin can lift a suspension');
select is(pg_temp.err($$select admin_lift_suspension((select v from ids where k = 'author'))$$), 'conflict', 'lifting twice is refused');
select pg_temp.logout();
-- expired suspensions are lifted lazily, as System
update profiles set status = 'suspended', suspended_until = now() - interval '1 day', suspension_reason = 'Old' where id = (select v from ids where k = 'student');
select pg_temp.login((select v from ids where k = 'admin'));
select is((select u ->> 'status' from jsonb_array_elements(admin_users('{"q": "34z040"}') -> 'items') u), 'active', 'an expired suspension is lifted when admins look');
select pg_temp.logout();
select ok(exists (select 1 from audit_logs where action = 'user.unsuspend' and actor_id is null and entity_id = (select v::text from ids where k = 'student')), '…and the lift is audited as System');

-- ------------------------------------------------------------------ admin: companies
select pg_temp.login((select v from ids where k = 'admin'));
select is(pg_temp.err($$select admin_save_company(null, '{"name": "Amazon", "industry": "Retail"}')$$), 'validation', 'a duplicate company name is refused');
select is(pg_temp.err($$select admin_save_company(null, '{"name": "Nova Labs", "industry": "Software", "aliases": ["TCS"]}')$$), 'validation', 'an alias owned by another company is refused');
select is(pg_temp.err($$select admin_save_company(null, '{"name": "Nova Labs", "industry": "Software", "website": "not a domain"}')$$), 'validation', 'websites must be domains');
create temp table co as select admin_save_company(null, '{"name": "Nova Labs", "industry": "Software", "website": "https://NovaLabs.io/", "aliases": ["Nova"], "description": "Builds tools.", "description_source": "company_website"}') j;
select is((select j ->> 'website' from co), 'novalabs.io', 'websites are normalised');
select is((select j ->> 'description_source' from co), 'company_website', 'description source round-trips');
select is((select j -> 'aliases' from co), '["Nova"]'::jsonb, 'aliases are saved');
select ok(admin_set_company_verified((select (j ->> 'id')::uuid from co), false) ->> 'is_verified' = 'false', 'an admin can unverify a company');
select is((select count(*)::int from audit_logs where entity = 'company' and entity_id = (select j ->> 'id' from co)), 2, 'one descriptive audit row per admin action (no trigger duplicates)');
create temp table mp as select admin_merge_preview((select (j ->> 'id')::uuid from co), (select id from companies where slug = 'oracle')) j;
select ok((select j -> 'aliases_added' ? 'Nova Labs' and j -> 'aliases_added' ? 'Nova' from mp), 'the merge preview lists the aliases that will move');
select is((select (admin_merge_companies((select (j ->> 'id')::uuid from co), (select id from companies where slug = 'oracle')) ->> 'moved')::int), 0, 'merging works');
select is(pg_temp.err($$select admin_merge_preview((select (j ->> 'id')::uuid from co), (select id from companies where slug = 'oracle'))$$), 'conflict', 'a merged company can’t be merged again');
select ok((admin_companies('', 'merged') -> 'counts' ->> 'merged')::int >= 1, 'merged companies are listed separately');
select ok(admin_company((select id from companies where slug = 'oracle')) -> 'merged_from' -> 0 ->> 'name' = 'Nova Labs', 'the target shows what merged into it');

-- ------------------------------------------------------------------ admin: audit, settings, overview
create temp table au as select admin_audit('{"entity": "company"}') j;
select ok((select jsonb_array_length(j -> 'items') >= 3 and (select bool_and(i ->> 'entity' = 'company') from jsonb_array_elements(j -> 'items') i) from au), 'the audit log filters by entity');
select ok((select j -> 'facets' -> 'actors' @> '[{"value": "system"}]' from au), 'System appears as an actor');
select ok(admin_audit_export(12, '{"entity": "company"}'), 'exports are recorded');
select ok(exists (select 1 from audit_logs where action = 'audit.export'), '…in the audit log itself');
select is(pg_temp.err($$select admin_save_settings('{"announcement": {"text": "", "tone": "info"}, "flags": {}, "limits": {"publish_per_day": 0, "comments_per_hour": 30, "reports_per_day": 20, "auto_hide_threshold": 3}, "landing_stats_threshold": 25}')$$), 'validation', 'limits are range-checked');
select is(admin_save_settings('{"announcement": {"text": "Zoho drive on Friday", "tone": "info"}, "flags": {"comments": true, "anonymous_posting": true, "new_companies": true}, "limits": {"publish_per_day": 4, "comments_per_hour": 30, "reports_per_day": 20, "auto_hide_threshold": 3}, "landing_stats_threshold": 25}') -> 'limits' ->> 'publish_per_day', '4', 'settings save');
select ok(exists (select 1 from audit_logs where action = 'settings.update' and metadata -> 'changes' ? 'limits.publish_per_day'), 'only the changed settings are audited');
create temp table ov as select admin_overview() j;
select ok((select jsonb_array_length(j -> 'signups') = 8 and jsonb_array_length(j -> 'publishes') = 8 from ov), 'the overview has 8 weekly buckets');
select ok((select (j -> 'kpis' ->> 'students')::int >= 8 from ov), 'KPIs are counted');
select pg_temp.logout();

select * from finish();
rollback;
