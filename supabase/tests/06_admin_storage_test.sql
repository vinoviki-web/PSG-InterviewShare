-- Admin operations, audit log integrity, companies, storage.
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('alice', pg_temp.make_user('29z001@psgtech.ac.in', 'Alice A')),
  ('bob',   pg_temp.make_user('29z002@psgtech.ac.in', 'Bob B')),
  ('admin', pg_temp.make_user('29z009@psgtech.ac.in', 'Admin A'));
insert into user_roles (user_id, role) select v, 'admin' from ids where k = 'admin';

select pg_temp.login((select v from ids where k = 'alice'));
insert into ids select 'anon', (save_draft(pg_temp.payload('amazon', 'SDE Intern', '{"is_anonymous": true}')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'anon'));

-- ---- students are locked out of every admin path
select is(pg_temp.err($$select admin_reveal_author((select v from ids where k = 'anon'), 'curious')$$), 'forbidden', 'students can’t reveal anonymous authors');
select is(admin_list_users(), null, 'students can’t list users or emails');
select is(pg_temp.err($$select admin_update_settings('{"flags": {"comments": false}}')$$), 'forbidden', 'students can’t change settings');
select is(pg_temp.err($$select admin_suspend_user((select v from ids where k = 'bob'), null, 'because')$$), 'forbidden', 'students can’t suspend anyone');
select is(pg_temp.err($$select admin_merge_companies((select id from companies where slug = 'amazon'), (select id from companies where slug = 'microsoft'))$$), 'forbidden', 'students can’t merge companies');
select is(pg_temp.err($$insert into companies (name, slug) values ('Fake Co', 'fake-co')$$), '42501', 'students can’t create companies directly');
select is(pg_temp.err($$update companies set is_verified = true where slug = 'kissflow'$$), 'ok', 'updating a company is a silent no-op for students…');
select pg_temp.logout();
select is((select is_verified from companies where slug = 'kissflow'), false, '…and nothing changes');
select pg_temp.login((select v from ids where k = 'alice'));
select is(pg_temp.n('select 1 from audit_logs'), 0::bigint, 'students can’t read the audit log');
select is(pg_temp.err($$insert into audit_logs (action, entity) values ('fake', 'x')$$), '42501', 'nobody can write audit rows directly');
select is(pg_temp.err($$select write_audit('fake', 'x', null)$$), '42501', 'students can’t call the audit writer');
select is(pg_temp.err($$select notify_user(auth.uid(), 'spam', '{}')$$), '42501', 'students can’t send notifications');
select is(pg_temp.err($$select _apply_experience_payload((select v from ids where k = 'anon'), '{}')$$), '42501', 'internal functions aren’t callable');
select is(pg_temp.err($$update platform_settings set landing_stats_threshold = 0$$), '42501', 'students can’t write settings directly');
select pg_temp.logout();

-- ---- reveal author (D7)
select pg_temp.login((select v from ids where k = 'admin'));
select is(pg_temp.err($$select admin_reveal_author((select v from ids where k = 'anon'), 'x')$$), 'validation', 'revealing an author needs a reason');
select is(admin_reveal_author((select v from ids where k = 'anon'), 'Harassment report #12') ->> 'full_name', 'Alice A', 'an admin can reveal with a reason');
select ok(exists (select 1 from audit_logs where action = 'experience.unmask' and entity_id = (select v from ids where k = 'anon')::text and metadata ->> 'reason' = 'Harassment report #12'), 'every reveal is audited with its reason');

-- ---- users and suspension
select ok(admin_list_users('29z002')::text like '%29z002@psgtech.ac.in%', 'admins can search users by email');
select is(pg_temp.err($$select admin_suspend_user((select v from ids where k = 'bob'), now() + interval '7 days', '')$$), 'validation', 'suspending needs a reason');
select is(pg_temp.err($$select admin_suspend_user(auth.uid(), null, 'Testing')$$), 'forbidden', 'admins can’t suspend themselves');
select is(pg_temp.err($$select admin_suspend_user((select v from ids where k = 'bob'), now() + interval '7 days', 'Repeated spam comments')$$), 'ok', 'an admin can suspend a student');
select is(pg_temp.err($$select admin_set_role((select v from ids where k = 'bob'), 'moderator')$$), 'invalid', 'a suspended student can’t be given a team role');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.n('select 1 from experience_feed'), 0::bigint, 'the suspended student is locked out immediately');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'admin'));
select is(pg_temp.err($$select admin_unsuspend_user((select v from ids where k = 'bob'))$$), 'ok', 'an admin can lift a suspension');

-- ---- settings
select is(pg_temp.err($$select admin_update_settings('{"limits": {"publish_per_day": 0}}')$$), 'validation', 'limits are range-checked');
select is(pg_temp.err($$select admin_update_settings('{"limits": {"drop_tables": 1}}')$$), 'validation', 'unknown limit keys are rejected');
select is((admin_update_settings('{"announcement": {"text": "Zoho drive on Friday", "tone": "info"}, "flags": {"comments": false, "evil": true}}') -> 'flags' ->> 'comments'), 'false', 'an admin can change settings');
select ok(not (select flags ? 'evil' from platform_settings), 'unknown flags are ignored');
select ok(exists (select 1 from audit_logs where action = 'settings.update'), 'settings changes are audited with before/after');

-- ---- companies
select is(pg_temp.err($$insert into companies (name, slug, industry) values ('Amazon India', 'amazon-india', 'E-commerce')$$), 'ok', 'an admin can create a company');
select ok(exists (select 1 from audit_logs where action = 'company.create' and metadata -> 'after' ->> 'slug' = 'amazon-india'), 'direct company writes are audited');
select pg_temp.logout();
-- move the anonymous post to the duplicate company, then merge it back
update experiences set company_id = (select id from companies where slug = 'amazon-india') where id = (select v from ids where k = 'anon');
select pg_temp.login((select v from ids where k = 'admin'));
select is((admin_merge_companies((select id from companies where slug = 'amazon-india'), (select id from companies where slug = 'amazon')) ->> 'moved')::int, 1, 'merging moves experiences to the target');
select is((select company_slug from experience_feed where id = (select v from ids where k = 'anon')), 'amazon', 'the experience now belongs to the target company');
select ok(exists (select 1 from company_aliases a join companies c on c.id = a.company_id where c.slug = 'amazon' and a.alias = 'Amazon India'), 'the merged name becomes an alias');
select isnt((select merged_into_id from companies where slug = 'amazon-india'), null, 'the old company points at the new one for redirects');
select ok(pg_temp.n('select 1 from audit_logs') > 0, 'admins can read the audit log');
select pg_temp.logout();

-- ---- storage
select pg_temp.login((select v from ids where k = 'alice'));
select is(pg_temp.err($$insert into storage.objects (bucket_id, name) values ('avatars', auth.uid()::text || '/avatar.webp')$$), 'ok', 'a student can upload to their own avatar folder');
select is(pg_temp.err($$insert into storage.objects (bucket_id, name) values ('avatars', (select v from ids where k = 'bob')::text || '/avatar.webp')$$), '42501', 'a student can’t write to someone else’s avatar folder');
select is(pg_temp.err($$insert into storage.objects (bucket_id, name) values ('company-logos', 'amazon.png')$$), '42501', 'students can’t upload company logos');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'bob'));
select ok(pg_temp.err($$delete from storage.objects where bucket_id = 'avatars' and name like (select v from ids where k = 'alice')::text || '/%'$$) in ('ok', '42501'), 'deleting someone else’s avatar is refused…');
select pg_temp.logout();
select is((select count(*)::int from storage.objects where bucket_id = 'avatars' and name like (select v from ids where k = 'alice')::text || '/%'), 1, '…and the file is still there');
select pg_temp.login((select v from ids where k = 'admin'));
select is(pg_temp.err($$insert into storage.objects (bucket_id, name) values ('company-logos', 'amazon.png')$$), 'ok', 'admins can upload company logos');
select pg_temp.logout();
select is((select file_size_limit from storage.buckets where id = 'avatars'), 2097152::bigint, 'avatars are limited to 2 MB');
select ok((select not public from storage.buckets where id = 'avatars'), 'the avatars bucket is private');

select * from finish();
rollback;
