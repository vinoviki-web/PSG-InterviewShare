-- D14: account deletion keeps or removes content as the student chooses.
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('keeper', pg_temp.make_user('30z001@psgtech.ac.in', 'Keeper K')),
  ('remover', pg_temp.make_user('30z002@psgtech.ac.in', 'Remover R')),
  ('reader', pg_temp.make_user('30z003@psgtech.ac.in', 'Reader R')),
  ('admin', pg_temp.make_user('30z004@psgtech.ac.in', 'Only Admin'));
delete from user_roles where role = 'admin';
insert into user_roles (user_id, role) select v, 'admin' from ids where k = 'admin';

-- keeper: one named post + one draft + a comment on remover's post
select pg_temp.login((select v from ids where k = 'keeper'));
insert into ids select 'k_post', (save_draft(pg_temp.payload()) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'k_post'));
insert into ids select 'k_draft', (save_draft(pg_temp.payload('microsoft', 'Software Engineer Intern')) ->> 'id')::uuid;
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'remover'));
insert into ids select 'r_post', (save_draft(pg_temp.payload('zoho-corporation', 'Member Technical Staff')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'r_post'));
insert into comments (experience_id, body) values ((select v from ids where k = 'k_post'), 'Comment from remover');
select pg_temp.logout();

-- guards
select pg_temp.anon();
select is(pg_temp.err($$select prepare_account_deletion('anonymise')$$), '42501', 'visitors can’t call account deletion');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'keeper'));
select is(pg_temp.err($$select prepare_account_deletion('everything')$$), 'validation', 'the mode must be anonymise or delete');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'admin'));
select is(pg_temp.err($$select prepare_account_deletion('anonymise')$$), 'last_admin', 'the last admin can’t delete their account');
select pg_temp.logout();

-- anonymise mode
select pg_temp.login((select v from ids where k = 'keeper'));
select is((prepare_account_deletion('anonymise') ->> 'drafts_deleted')::int, 1, 'anonymise deletes drafts');
select pg_temp.logout();
delete from auth.users where id = (select v from ids where k = 'keeper');  -- what the Edge Function does
select pg_temp.login((select v from ids where k = 'reader'));
select ok((select author_name is null and is_anonymous from experience_feed where id = (select v from ids where k = 'k_post')), 'a kept post stays readable with no author');
select is(get_experience((select v from ids where k = 'k_post')) -> 'author', 'null'::jsonb, 'the kept post shows no author anywhere');
select pg_temp.logout();
select is((select count(*)::int from experiences where id = (select v from ids where k = 'k_draft')), 0, 'the draft is gone');
select is((select count(*)::int from profiles where id = (select v from ids where k = 'keeper')), 0, 'the profile is gone');

-- delete mode
select pg_temp.login((select v from ids where k = 'remover'));
select is(prepare_account_deletion('delete') ->> 'mode', 'delete', 'delete mode runs');
select pg_temp.logout();
delete from auth.users where id = (select v from ids where k = 'remover');
select pg_temp.login((select v from ids where k = 'reader'));
select is(pg_temp.n($$select 1 from experience_feed where id = (select v from ids where k = 'r_post')$$), 0::bigint, 'removed posts disappear');
select ok((select body is null and status = 'deleted' from comment_feed where experience_id = (select v from ids where k = 'k_post') limit 1), 'their comments are marked deleted');
select pg_temp.logout();
select ok(exists (select 1 from audit_logs where action = 'account.delete' and metadata ->> 'mode' = 'delete'), 'account deletion is audited');

select * from finish();
rollback;
