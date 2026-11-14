-- Reports, auto-hide (D6), moderator powers and their limits.
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('alice', pg_temp.make_user('28z001@psgtech.ac.in', 'Alice A')),
  ('r1', pg_temp.make_user('28z011@psgtech.ac.in', 'Reporter 1')),
  ('r2', pg_temp.make_user('28z012@psgtech.ac.in', 'Reporter 2')),
  ('r3', pg_temp.make_user('28z013@psgtech.ac.in', 'Reporter 3')),
  ('r4', pg_temp.make_user('28z014@psgtech.ac.in', 'Reporter 4')),
  ('mod', pg_temp.make_user('28z020@psgtech.ac.in', 'Mod M')),
  ('admin', pg_temp.make_user('28z021@psgtech.ac.in', 'Admin A'));
insert into user_roles (user_id, role) select v, 'moderator' from ids where k = 'mod';
insert into user_roles (user_id, role) select v, 'admin' from ids where k = 'admin';

select pg_temp.login((select v from ids where k = 'alice'));
insert into ids select 'e1', (save_draft(pg_temp.payload()) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'e1'));
insert into ids select 'e2', (save_draft(pg_temp.payload('zoho-corporation', 'Member Technical Staff')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'e2'));
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'mod'));
insert into ids select 'emod', (save_draft(pg_temp.payload('microsoft', 'Software Engineer Intern')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'emod'));
select pg_temp.logout();

-- ---- reporting
select pg_temp.login((select v from ids where k = 'r1'));
select is(pg_temp.err($$select create_report('experience', (select v from ids where k = 'e1'), 'misleading', 'Rounds are wrong')$$), 'ok', 'a student can report an experience');
select is(pg_temp.err($$select create_report('experience', (select v from ids where k = 'e1'), 'spam')$$), 'duplicate', 'you can’t report the same thing twice');
select is(pg_temp.err($$insert into reports (target_type, target_id, reason) values ('experience', (select v from ids where k = 'e1'), 'spam')$$), '42501', 'reports can only be filed through the RPC');
select is(pg_temp.n('select 1 from reports'), 0::bigint, 'students can’t read reports, including their own');
select is(mod_list_reports(), null, 'students can’t read the moderation queue');
select is(pg_temp.err($$select mod_set_content_status('experience', (select v from ids where k = 'e1'), 'hide', 'Because')$$), 'forbidden', 'students can’t moderate');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'r2'));
select create_report('experience', (select v from ids where k = 'e1'), 'misleading');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'alice'));
select is((select status::text from experience_feed where id = (select v from ids where k = 'e1')), 'published', 'two reports don’t hide anything');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'r3'));
select create_report('experience', (select v from ids where k = 'e1'), 'confidential');
select is(pg_temp.n($$select 1 from experience_feed where id = (select v from ids where k = 'e1')$$), 0::bigint, 'three distinct reports auto-hide the experience for students');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'alice'));
select is((select hidden_reason from experience_feed where id = (select v from ids where k = 'e1')), 'Auto-hidden after 3 reports', 'the author still sees it, with the reason');
select is(pg_temp.n($$select 1 from notifications where type = 'experience_hidden'$$), 1::bigint, 'the author is notified');
select pg_temp.logout();
select ok(exists (select 1 from audit_logs where action = 'experience.auto_hide' and actor_id is null and entity_id = (select v from ids where k = 'e1')::text), 'auto-hide is audited as a system action');

-- ---- moderator view
select pg_temp.login((select v from ids where k = 'mod'));
select is(pg_temp.n($$select 1 from experience_feed where id = (select v from ids where k = 'e1') and status = 'hidden'$$), 1::bigint, 'moderators see hidden content');
select is((select count(*)::int from jsonb_array_elements(mod_list_reports()) r where (r ->> 'target_id')::uuid in (select v from ids)), 3, 'moderators see the open reports');
select ok(not exists (select 1 from jsonb_array_elements(mod_list_reports()) r where r ->> 'reporter_id' is not null), 'moderators never see who reported');
select is(pg_temp.n('select 1 from reports'), 0::bigint, 'moderators can’t read the reports table directly');
select is(pg_temp.err($$select mod_dismiss_reports('experience', (select v from ids where k = 'e1'), 'Rounds match other reports')$$), 'ok', 'a moderator can dismiss reports');
select is((select status::text from experience_feed where id = (select v from ids where k = 'e1')), 'published', 'dismissing restores auto-hidden content');
select is(pg_temp.err($$select mod_set_content_status('experience', (select v from ids where k = 'e1'), 'hide', '')$$), 'validation', 'hiding needs a reason');
select is(pg_temp.err($$select mod_set_content_status('experience', (select v from ids where k = 'e1'), 'hide', 'Personal attack in round 2', 'Please remove names')$$), 'ok', 'a moderator can hide with a reason');
select is((select before ->> 'status' from moderation_actions where target_id = (select v from ids where k = 'e1') and action = 'hide'), 'published', 'the action stores a before-snapshot for undo');
select is(pg_temp.err($$select mod_set_content_status('experience', (select v from ids where k = 'e1'), 'restore')$$), 'ok', 'a moderator can restore');
select is(pg_temp.err($$select mod_set_content_status('experience', (select v from ids where k = 'e1'), 'remove', 'Spam')$$), 'forbidden', 'only admins can permanently remove');
select is(pg_temp.err($$select mod_set_content_status('experience', (select v from ids where k = 'emod'), 'hide', 'Self hide')$$), 'conflict_of_interest', 'moderators can’t moderate their own content');
select is(pg_temp.err($$select mod_dismiss_reports('experience', (select v from ids where k = 'emod'))$$), 'conflict_of_interest', 'moderators can’t dismiss reports on their own content');
select pg_temp.logout();

-- ---- escalation
select pg_temp.login((select v from ids where k = 'r4'));
select create_report('experience', (select v from ids where k = 'e2'), 'privacy', 'Names the interviewer');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'mod'));
select is(pg_temp.err($$select mod_escalate('experience', (select v from ids where k = 'e2'), 'Needs an admin call')$$), 'ok', 'a moderator can escalate');
select is(pg_temp.err($$select mod_set_content_status('experience', (select v from ids where k = 'e2'), 'hide', 'Trying anyway')$$), 'escalated', 'escalated items are read-only for moderators');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'admin'));
select ok(exists (select 1 from jsonb_array_elements(mod_list_reports()) r where r ->> 'reporter_id' is not null), 'admins can see who reported');
select is(pg_temp.n('select 1 from reports where target_id in (select v from ids)'), 4::bigint, 'admins can read the reports table');
select is(pg_temp.err($$select mod_set_content_status('experience', (select v from ids where k = 'e2'), 'remove', 'Names a private individual')$$), 'ok', 'an admin can remove escalated content');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'r1'));
select is(pg_temp.err($$select create_report('experience', (select v from ids where k = 'e2'), 'spam')$$), 'not_found', 'removed content can’t be reported');
select pg_temp.logout();

-- ---- report rate limit
update platform_settings set limits = limits || '{"reports_per_day": 1}';
select pg_temp.login((select v from ids where k = 'r1'));
select is(pg_temp.err($$select create_report('experience', (select v from ids where k = 'emod'), 'spam')$$), 'rate_limited', 'the daily report limit applies');
select pg_temp.logout();

select * from finish();
rollback;
