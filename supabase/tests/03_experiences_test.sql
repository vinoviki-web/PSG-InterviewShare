-- Experiences: RPC-only writes, draft privacy, validation, duplicates,
-- rate limits, anonymity masking (D7), suspension, deletion.
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('alice', pg_temp.make_user('26z001@psgtech.ac.in', 'Alice A')),
  ('bob',   pg_temp.make_user('26z002@psgtech.ac.in', 'Bob B')),
  ('carol', pg_temp.make_user('26z003@psgtech.ac.in', 'Carol C')),
  ('mod',   pg_temp.make_user('26z004@psgtech.ac.in', 'Mod M')),
  ('admin', pg_temp.make_user('26z005@psgtech.ac.in', 'Admin A'));
insert into user_roles (user_id, role) select v, 'moderator' from ids where k = 'mod';
insert into user_roles (user_id, role) select v, 'admin' from ids where k = 'admin';

-- ---- drafts are private
select pg_temp.login((select v from ids where k = 'alice'));
insert into ids select 'd1', (save_draft(pg_temp.payload()) ->> 'id')::uuid;
select is(pg_temp.err($$insert into experiences (author_id, role_title) values (auth.uid(), 'Direct')$$), '42501', 'no direct inserts into experiences');
select is(pg_temp.err($$update experiences set role_title = 'x' where id = (select v from ids where k = 'd1')$$), '42501', 'no direct updates to experiences');
select is(pg_temp.err($$insert into experience_rounds (experience_id, position, round_type) values ((select v from ids where k = 'd1'), 2, 'hr')$$), '42501', 'no direct writes to rounds');
select is(pg_temp.n($$select 1 from experiences where id = (select v from ids where k = 'd1')$$), 1::bigint, 'the author sees their own draft');
select is(pg_temp.n($$select 1 from experience_rounds where experience_id = (select v from ids where k = 'd1')$$), 1::bigint, 'the author sees their draft’s rounds');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.n($$select 1 from experience_feed where id = (select v from ids where k = 'd1')$$), 0::bigint, 'others cannot see a draft in the feed');
select is(pg_temp.err($$select get_experience((select v from ids where k = 'd1'))$$), 'not_found', 'others cannot open a draft');
select is(pg_temp.n($$select 1 from experience_rounds where experience_id = (select v from ids where k = 'd1')$$), 0::bigint, 'a draft’s rounds are hidden from others');
select is(pg_temp.n($$select 1 from questions where experience_id = (select v from ids where k = 'd1')$$), 0::bigint, 'a draft’s questions are hidden from others');
select is(pg_temp.err($$select save_draft(pg_temp.payload() || jsonb_build_object('id', (select v from ids where k = 'd1')))$$), 'not_found', 'others cannot edit a draft');
select is(pg_temp.err($$select publish_experience((select v from ids where k = 'd1'))$$), 'not_found', 'others cannot publish a draft');
select is(pg_temp.err($$select delete_experience((select v from ids where k = 'd1'))$$), 'forbidden', 'others cannot delete a draft');
select pg_temp.logout();

-- ---- validation, publish, duplicates
select pg_temp.login((select v from ids where k = 'alice'));
insert into ids select 'd2', (save_draft('{"role_title": "Analyst"}') ->> 'id')::uuid;
select is(pg_temp.err($$select publish_experience((select v from ids where k = 'd2'))$$), 'validation', 'an incomplete draft cannot be published');
select is(pg_temp.err($$select publish_experience((select v from ids where k = 'd2'),
  pg_temp.payload('zoho-corporation', 'Analyst', '{"rounds": [{"round_type": "hr", "description": "short"}]}'))$$),
  'validation', 'each round needs a description or a question');
select is(pg_temp.err($$select publish_experience((select v from ids where k = 'd2'),
  pg_temp.payload('zoho-corporation', 'Analyst', '{"interview_month": "2099-01-01"}'))$$),
  'validation', 'a future interview month is rejected');
select is(pg_temp.err($$select publish_experience((select v from ids where k = 'd2'),
  pg_temp.payload('zoho-corporation', 'Analyst', '{"confirmed_own": false}'))$$),
  'validation', 'the own-experience confirmation is required');
select is(pg_temp.err($$select save_draft(pg_temp.payload() || '{"resources": [{"title": "Bad link", "url": "javascript:alert(1)"}]}')$$),
  'ok', 'a draft with a bad link still saves…');
select is((select count(*)::int from experience_resources where url like 'javascript:%'), 0, '…but a non-https link is never stored');
select is(publish_experience((select v from ids where k = 'd1')) ->> 'status', 'published', 'a complete draft publishes');
select is(pg_temp.err($$select save_draft(pg_temp.payload() || jsonb_build_object('id', (select v from ids where k = 'd1')))$$), 'published', 'a published experience is no longer a draft');
insert into ids select 'd3', (save_draft(pg_temp.payload()) ->> 'id')::uuid;
select is(pg_temp.err($$select publish_experience((select v from ids where k = 'd3'))$$), 'duplicate', 'a second experience for the same drive is blocked');
select is(publish_experience((select v from ids where k = 'd3'),
  pg_temp.payload('amazon', 'SDE Intern', '{"duplicate_reason": "Second attempt through an off-campus drive"}')) ->> 'status',
  'published', 'a duplicate is allowed with a reason');
select pg_temp.logout();
select ok((select count(*) from audit_logs where action = 'experience.publish' and entity_id = (select v from ids where k = 'd3')::text) = 1, 'publishing is audited');
select pg_temp.login((select v from ids where k = 'alice'));

-- edit a published experience
select is(publish_experience((select v from ids where k = 'd1'), pg_temp.payload('amazon', 'SDE Intern', '{"advice": "Updated advice."}')) ->> 'version', '2', 'editing bumps the version');
select ok((select edited from experiences where id = (select v from ids where k = 'd1')), 'an edited experience is marked edited');

-- new company from the wizard
insert into ids select 'd5', (save_draft(pg_temp.payload('amazon', 'Data Analyst', '{"company_id": null, "new_company_name": "Acme Robotics"}')) ->> 'id')::uuid;
select is(publish_experience((select v from ids where k = 'd5')) ->> 'status', 'published', 'publishing with a new company name succeeds');
select pg_temp.logout();
select is((select is_verified from companies where name = 'Acme Robotics'), false, 'a student-added company starts unverified');

-- rate limit
update platform_settings set limits = limits || '{"publish_per_day": 3}';
select pg_temp.login((select v from ids where k = 'alice'));
insert into ids select 'd4', (save_draft(pg_temp.payload('microsoft', 'Software Engineer Intern')) ->> 'id')::uuid;
select is(pg_temp.err($$select publish_experience((select v from ids where k = 'd4'))$$), 'rate_limited', 'the daily publishing limit applies');
select pg_temp.logout();
update platform_settings set limits = limits || '{"publish_per_day": 5}';

-- ---- reading
select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.n($$select 1 from experience_feed where id = (select v from ids where k = 'd1')$$), 1::bigint, 'others see a published experience in the feed');
select is(pg_temp.n($$select 1 from experiences where id = (select v from ids where k = 'd1')$$), 0::bigint, 'others cannot read the base table row');
select is(get_experience((select v from ids where k = 'd1')) -> 'author' ->> 'full_name', 'Alice A', 'a named experience shows its author');
select is(pg_temp.n($$select 1 from questions where experience_id = (select v from ids where k = 'd1')$$), 1::bigint, 'questions of a published experience are readable');
select ok(pg_temp.n($$select 1 from experience_feed where search_vector @@ to_tsquery('simple', 'amazon')$$) >= 1, 'full-text search finds by company name');
select ok(pg_temp.n($$select 1 from experience_feed where search_vector @@ websearch_to_tsquery('english', 'linked list')$$) >= 1, 'full-text search finds by question text');

-- ---- anonymity (D7): masked for everyone but the author, admins included
insert into ids select 'anon1', (save_draft(pg_temp.payload('zoho-corporation', 'Member Technical Staff', '{"is_anonymous": true, "hide_department": true}')) ->> 'id')::uuid;
select is(publish_experience((select v from ids where k = 'anon1')) ->> 'status', 'published', 'an anonymous experience publishes');
select ok((select author_name is null and author_id is null and author_handle is null from experience_feed where id = (select v from ids where k = 'anon1')) is false, 'the author sees their own name on an anonymous post');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'alice'));
select ok((select author_name is null and author_id is null and author_handle is null and department_id is null from experience_feed where id = (select v from ids where k = 'anon1')), 'students see no author or department on an anonymous post');
select is(get_experience((select v from ids where k = 'anon1')) -> 'author', 'null'::jsonb, 'get_experience masks the anonymous author');
select is(get_experience((select v from ids where k = 'anon1')) -> 'department', 'null'::jsonb, 'get_experience masks a hidden department');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'mod'));
select ok((select author_name is null from experience_feed where id = (select v from ids where k = 'anon1')), 'moderators see no author on an anonymous post');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'admin'));
select ok((select author_name is null from experience_feed where id = (select v from ids where k = 'anon1')), 'admins see no author in the feed either');
select is(get_experience((select v from ids where k = 'anon1')) -> 'author', 'null'::jsonb, 'admins see no author via get_experience');
select is(pg_temp.n($$select 1 from experiences where id = (select v from ids where k = 'anon1')$$), 0::bigint, 'admins cannot read the base row (author_id) directly');
select pg_temp.logout();

-- private profiles: name shown, author_id not enumerable through the feed
update profiles set profile_visibility = 'private' where id = (select v from ids where k = 'alice');
select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.n($$select 1 from experience_feed where author_id = (select v from ids where k = 'alice')$$), 0::bigint, 'a private profile’s posts can’t be listed by author');
select is((select author_name from experience_feed where id = (select v from ids where k = 'd1')), 'Alice A', 'the name still shows on the post itself');
select pg_temp.logout();

-- ---- suspension
update profiles set status = 'suspended', suspended_until = now() + interval '7 days', suspension_reason = 'Spam' where id = (select v from ids where k = 'carol');
select pg_temp.login((select v from ids where k = 'carol'));
select is(pg_temp.n('select 1 from experience_feed'), 0::bigint, 'a suspended student reads nothing');
select is(pg_temp.err($$select save_draft(pg_temp.payload())$$), 'forbidden', 'a suspended student cannot write');
select pg_temp.logout();
update profiles set suspended_until = now() - interval '1 day' where id = (select v from ids where k = 'carol');
select pg_temp.login((select v from ids where k = 'carol'));
select ok(pg_temp.n('select 1 from experience_feed') > 0, 'an expired suspension no longer blocks reading');
select pg_temp.logout();

-- ---- deletion
select pg_temp.login((select v from ids where k = 'alice'));
select is(pg_temp.err($$select delete_experience((select v from ids where k = 'd1'))$$), 'ok', 'the author can delete their experience');
select is((select status::text from experiences where id = (select v from ids where k = 'd1')), 'removed', 'a published experience is soft-deleted');
select is(pg_temp.err($$select delete_experience((select v from ids where k = 'd2'))$$), 'ok', 'the author can delete a draft');
select is(pg_temp.n($$select 1 from experiences where id = (select v from ids where k = 'd2')$$), 0::bigint, 'a deleted draft is gone');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.n($$select 1 from experience_feed where id = (select v from ids where k = 'd1')$$), 0::bigint, 'a deleted experience leaves the feed');
select is(pg_temp.err($$select get_experience((select v from ids where k = 'd1'))$$), 'not_found', 'a deleted experience cannot be opened');
select pg_temp.logout();

select * from finish();
rollback;
