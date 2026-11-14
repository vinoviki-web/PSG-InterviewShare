-- Profiles: own-row access, column limits. Roles: no self-escalation (C6).
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;
insert into ids values
  ('alice', pg_temp.make_user('25z001@psgtech.ac.in', 'Alice A')),
  ('bob',   pg_temp.make_user('25z002@psgtech.ac.in', 'Bob B')),
  ('carol', pg_temp.make_user('25z003@psgtech.ac.in', 'Carol C')),
  ('newbie', pg_temp.make_user('25z004@psgtech.ac.in', 'New N', 'cse', 2027::smallint, false));
update profiles set profile_visibility = 'private', bio = 'Carol private bio' where id = (select v from ids where k = 'carol');

-- ---- profiles
select pg_temp.login((select v from ids where k = 'alice'));
select is(pg_temp.n('select 1 from profiles'), 1::bigint, 'a student reads only their own base profile row');
select is(pg_temp.err($$update profiles set bio = 'Hello' where id = auth.uid()$$), 'ok', 'a student can edit their own bio');
select is(pg_temp.err($$update profiles set status = 'active' where id = auth.uid()$$), '42501', 'a student cannot touch their status column');
select is(pg_temp.err($$update profiles set onboarded_at = null where id = auth.uid()$$), '42501', 'a student cannot touch onboarded_at');
select is(pg_temp.err($$update profiles set bio = 'hacked' where id = (select v from ids where k = 'bob')$$), 'ok', 'updating another profile is a silent no-op…');
select pg_temp.logout();
select is((select bio from profiles where id = (select v from ids where k = 'bob')), '', '…and the other profile is unchanged');
select pg_temp.login((select v from ids where k = 'alice'));
select is(pg_temp.err($$update profiles set handle = 'alice-new' where id = auth.uid()$$), 'ok', 'first handle change is allowed');
select is(pg_temp.err($$update profiles set handle = 'alice-again' where id = auth.uid()$$), 'handle_cooldown', 'second handle change within 30 days is blocked');
select is(pg_temp.err($$update profiles set bio = repeat('x', 281) where id = auth.uid()$$), '23514', 'bio over 280 characters is rejected by the database');

-- public_profiles view masks private profiles
select is((select bio from public_profiles where id = (select v from ids where k = 'carol')), null, 'a private profile’s bio is hidden from others');
select ok((select is_private from public_profiles where id = (select v from ids where k = 'carol')), 'a private profile is flagged as private');
select pg_temp.login((select v from ids where k = 'carol'));
select is((select bio from public_profiles where id = auth.uid()), 'Carol private bio', 'the owner still sees their own bio');
select pg_temp.logout();

-- onboarding
select pg_temp.login((select v from ids where k = 'newbie'));
select is(pg_temp.n('select 1 from experience_feed'), 0::bigint, 'a student who hasn’t onboarded reads no experiences');
select is(pg_temp.err($$select save_draft('{}')$$), 'forbidden', 'a student who hasn’t onboarded cannot write');
select is(pg_temp.err($$select complete_onboarding('N', 'nope', 2027::smallint)$$), 'validation', 'onboarding validates its fields');
select is(pg_temp.err($$select complete_onboarding('New Student', 'cse', 2027::smallint)$$), 'ok', 'valid onboarding succeeds');
select isnt((select onboarded_at from profiles where id = auth.uid()), null, 'onboarding sets onboarded_at and a handle');
select pg_temp.logout();

-- ---- roles
select pg_temp.login((select v from ids where k = 'alice'));
select is(pg_temp.err($$insert into user_roles (user_id, role) values (auth.uid(), 'admin')$$), '42501', 'a student cannot insert a role row');
select is(pg_temp.err($$update user_roles set role = 'admin'$$), '42501', 'a student cannot update role rows');
select is(pg_temp.err($$delete from user_roles$$), '42501', 'a student cannot delete role rows');
select is(pg_temp.err($$select admin_set_role(auth.uid(), 'admin')$$), 'forbidden', 'a student cannot grant themselves admin');
select is(pg_temp.err($$select admin_set_role((select v from ids where k = 'bob'), 'moderator')$$), 'forbidden', 'a student cannot grant others roles');
select ok(not is_admin() and not is_moderator(), 'the student is still a plain student');
select pg_temp.logout();

-- admin flows
insert into ids values ('admin', pg_temp.make_user('25z009@psgtech.ac.in', 'Admin A'));
insert into user_roles (user_id, role) select v, 'admin' from ids where k = 'admin';
select pg_temp.login((select v from ids where k = 'admin'));
select is(pg_temp.err($$select admin_set_role((select v from ids where k = 'bob'), 'moderator')$$), 'ok', 'an admin can make a student a moderator');
select is(pg_temp.n('select 1 from user_roles where user_id = (select v from ids where k = ''bob'')'), 1::bigint, 'the admin sees the new role row');
select is(pg_temp.err($$select admin_set_role(auth.uid(), null)$$), 'forbidden', 'an admin cannot change their own role');
select is(pg_temp.err($$select admin_set_role((select v from ids where k = 'bob'), null)$$), 'ok', 'an admin can remove a role');
select is((select count(*)::int from audit_logs where action = 'role.set' and entity_id = (select v from ids where k = 'bob')::text), 2, 'every role change is audited');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'bob'));
select ok(not is_moderator(), 'a removed role takes effect immediately');
select is(pg_temp.n('select 1 from user_roles'), 0::bigint, 'a student sees no role rows of their own');
select pg_temp.logout();

select * from finish();
rollback;
