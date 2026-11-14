-- Phase 10: the nightly housekeeping job (_run_maintenance, pg_cron).
begin;
\ir helpers.psql
select no_plan();

-- The job is scheduled and private.
select ok(exists (select 1 from cron.job where jobname = 'roundwise-maintenance' and command like '%_run_maintenance()%' and active), 'the nightly job is scheduled in pg_cron');
select ok(not has_function_privilege('authenticated', 'public._run_maintenance()', 'execute'), 'students can’t run maintenance');
select ok(not has_function_privilege('anon', 'public._run_maintenance()', 'execute'), 'visitors can’t run maintenance');

-- Clear the slate so counts below are exact (rolled back at the end).
select public._run_maintenance();

-- Fixtures. Triggers are off while backdating timestamps.
create temp table ids (k text primary key, v uuid);
insert into ids values ('a', pg_temp.make_user('22z901@psgtech.ac.in', 'Maint A')),
                       ('b', pg_temp.make_user('22z902@psgtech.ac.in', 'Maint B'));
set session_replication_role = replica;

create function pg_temp.exp(p_key text, p_status public.experience_status, p_updated interval, p_deleted interval default null)
returns void language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.experiences (id, author_id, company_id, role_title, opportunity_type, hiring_mode, department_id,
    graduation_year, interview_month, difficulty, outcome, published_at, confirmed_own, status, created_at, updated_at, deleted_at)
  values (v, (select ids.v from ids where k = 'a'), (select id from public.companies order by name limit 1), 'Maintenance test ' || p_key, 'internship', 'on_campus', 'cse',
    2026, date '2026-01-01', 3, 'selected', case when p_status = 'draft' then null else now() - interval '200 days' end,
    p_status <> 'draft', p_status, now() - interval '200 days', now() - p_updated, now() - p_deleted);
  insert into ids values (p_key, v);
end $$;

select pg_temp.exp('removed_old',   'removed',   '40 days', '31 days');
select pg_temp.exp('removed_new',   'removed',   '10 days', '10 days');
select pg_temp.exp('hidden_old',    'hidden',    '60 days');
select pg_temp.exp('published',     'published', '200 days');
select pg_temp.exp('draft_expired', 'draft',     '91 days');
select pg_temp.exp('draft_warn',    'draft',     '85 days');
select pg_temp.exp('draft_fresh',   'draft',     '20 days');

create function pg_temp.cmt(p_key text, p_parent text, p_status public.comment_status, p_deleted interval default null)
returns void language plpgsql as $$
declare v uuid := gen_random_uuid();
begin
  insert into public.comments (id, experience_id, author_id, parent_id, body, status, created_at, deleted_at)
  values (v, (select ids.v from ids where k = 'published'), (select ids.v from ids where k = 'b'),
          (select ids.v from ids where k = p_parent), 'A comment body', p_status, now() - interval '100 days', now() - p_deleted);
  insert into ids values (p_key, v);
end $$;

select pg_temp.cmt('c_deleted_old',  null, 'deleted', '40 days');
select pg_temp.cmt('c_removed_old',  null, 'removed', '35 days');
select pg_temp.cmt('c_deleted_new',  null, 'deleted', '5 days');
select pg_temp.cmt('c_parent_old',   null, 'deleted', '40 days');
select pg_temp.cmt('c_live_reply',   'c_parent_old', 'visible');
select pg_temp.cmt('c_chain_root',   null, 'deleted', '40 days');
select pg_temp.cmt('c_chain_reply',  'c_chain_root', 'removed', '40 days');
select pg_temp.cmt('c_hidden',       null, 'hidden');

-- Suspensions and notifications
update public.profiles set status = 'suspended', suspended_until = now() - interval '1 hour', suspension_reason = 'Test'
  where id = (select v from ids where k = 'b');
insert into public.notifications (user_id, type, read_at, created_at) values
  ((select v from ids where k = 'a'), 'test_old_read',   now() - interval '190 days', now() - interval '200 days'),
  ((select v from ids where k = 'a'), 'test_old_unread', null,                        now() - interval '200 days'),
  ((select v from ids where k = 'a'), 'test_new_read',   now(),                       now() - interval '10 days');

set session_replication_role = origin;

-- Run it
create temp table run as select public._run_maintenance() as r;
create function pg_temp.exists_exp(p text) returns boolean language sql as $$ select exists (select 1 from public.experiences where id = (select v from ids where k = p)) $$;
create function pg_temp.exists_cmt(p text) returns boolean language sql as $$ select exists (select 1 from public.comments where id = (select v from ids where k = p)) $$;

select is((select r from run), '{"experiences_purged": 1, "comments_purged": 4, "drafts_expired": 1, "draft_notices": 1, "suspensions_lifted": 1, "notifications_pruned": 1}'::jsonb,
  'the run reports what it did');

select ok(not pg_temp.exists_exp('removed_old'), 'removed experiences are purged after 30 days');
select ok(pg_temp.exists_exp('removed_new'), 'recently removed experiences are kept');
select ok(pg_temp.exists_exp('hidden_old'), 'hidden experiences are never purged (a moderator may restore them)');
select ok(pg_temp.exists_exp('published'), 'old published experiences are untouched');
select ok(not pg_temp.exists_exp('draft_expired'), 'drafts idle for 90 days are deleted');
select ok(pg_temp.exists_exp('draft_warn') and pg_temp.exists_exp('draft_fresh'), 'younger drafts are kept');

select ok(not pg_temp.exists_cmt('c_deleted_old') and not pg_temp.exists_cmt('c_removed_old'), 'deleted and removed comments are purged after 30 days');
select ok(pg_temp.exists_cmt('c_deleted_new'), 'recently deleted comments are kept');
select ok(pg_temp.exists_cmt('c_parent_old') and pg_temp.exists_cmt('c_live_reply'), 'a deleted comment with a visible reply is kept, so the reply survives');
select ok(not pg_temp.exists_cmt('c_chain_root') and not pg_temp.exists_cmt('c_chain_reply'), 'a fully deleted thread is purged from the leaves up');
select ok(pg_temp.exists_cmt('c_hidden'), 'hidden comments are never purged');
select is((select comment_count from public.experiences where id = (select v from ids where k = 'published')), 1, 'the comment count stays correct');

select is((select count(*)::int from public.notifications where type = 'draft_expiring' and payload ->> 'experience_id' = (select v from ids where k = 'draft_warn')::text), 1,
  'the author is warned before a draft expires');
select ok((select payload ->> 'message' from public.notifications where type = 'draft_expiring' and user_id = (select v from ids where k = 'a')) like '%within a week%', 'the notice says what to do');

select is((select status::text from public.profiles where id = (select v from ids where k = 'b')), 'active', 'ended suspensions are lifted');
select ok(exists (select 1 from public.audit_logs where action = 'user.unsuspend' and actor_id is null and entity_id = (select v from ids where k = 'b')::text), 'the lift is audited as System');

select ok(not exists (select 1 from public.notifications where type = 'test_old_read'), 'old read notifications are pruned');
select ok(exists (select 1 from public.notifications where type = 'test_old_unread') and exists (select 1 from public.notifications where type = 'test_new_read'), 'unread and recent notifications are kept');

select is((select metadata from public.audit_logs where action = 'system.maintenance' order by id desc limit 1), (select r from run), 'the run is audited as System with its counts');

-- A second run is a no-op: no duplicate notice, no extra audit row.
select is(public._run_maintenance(), '{"experiences_purged": 0, "comments_purged": 0, "drafts_expired": 0, "draft_notices": 0, "suspensions_lifted": 0, "notifications_pruned": 0}'::jsonb,
  'a second run changes nothing');
select is((select count(*)::int from public.audit_logs where action = 'system.maintenance' and created_at = now()), 1, 'a run that changed nothing writes no audit row');

select * from finish();
rollback;
