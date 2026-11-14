-- D1/D2: only verified @psgtech.ac.in accounts, enforced on the server.
begin;
\ir helpers.psql
select no_plan();

select ok(is_psg_email('22E646@PSGTECH.AC.IN'), 'uppercase PSG email accepted');
select ok(not is_psg_email('x@psgtech.ac.in.evil.com'), 'look-alike suffix rejected');
select ok(not is_psg_email('x@sub.psgtech.ac.in'), 'subdomain rejected');
select ok(not is_psg_email('a@b@psgtech.ac.in'), 'double @ rejected');
select ok(not is_psg_email('psgtech.ac.in'), 'bare domain rejected');
select ok(not coalesce(is_psg_email(null), false), 'null rejected');

-- Layer 3a: auth hook
select is(hook_before_user_created('{"user":{"email":"someone@gmail.com"}}') -> 'error' ->> 'http_code', '403', 'auth hook rejects a Gmail sign-up');
select is(hook_before_user_created('{"user":{"email":"22z999@psgtech.ac.in"}}'), '{}'::jsonb, 'auth hook allows a PSG sign-up');

-- Layer 3b: table trigger, whatever path creates the user
select is(pg_temp.err($$insert into auth.users (instance_id, id, aud, role, email)
  values ('00000000-0000-0000-0000-000000000000', gen_random_uuid(), 'authenticated', 'authenticated', 'someone@gmail.com')$$),
  '42501', 'a non-PSG auth user cannot be created');
select isnt(pg_temp.make_user('23z001@psgtech.ac.in', 'New Student', 'cse', 2027::smallint, false), null, 'a PSG auth user can be created');
select is((select count(*)::int from profiles p join auth.users u on u.id = p.id where u.email = '23z001@psgtech.ac.in'), 1, 'profile row is created automatically');
select is(pg_temp.err($$update auth.users set email = 'x@gmail.com' where email = '23z001@psgtech.ac.in'$$), '42501', 'email cannot be changed to a non-PSG address');

-- Layer 4: a valid user id with a non-PSG email claim gets nothing
create temp table ids (k text primary key, v uuid);
grant select on ids to authenticated, anon;
insert into ids values ('alice', pg_temp.make_user('23z002@psgtech.ac.in', 'Alice'));
select set_config('request.jwt.claims', json_build_object('sub', (select v from ids where k = 'alice'), 'role', 'authenticated', 'email', 'alice@gmail.com')::text, true);
select set_config('role', 'authenticated', true);
select ok(not is_psg_user(), 'non-PSG email claim is not a PSG user');
select is(pg_temp.n('select 1 from experience_feed'), 0::bigint, 'non-PSG claim reads no experiences');
select is(pg_temp.n('select 1 from companies'), 0::bigint, 'non-PSG claim reads no companies');
select is(pg_temp.err($$select save_draft('{}')$$), 'forbidden', 'non-PSG claim cannot write');
select pg_temp.logout();

-- Visitors (anon) get aggregates only
select pg_temp.anon();
select is(pg_temp.err('select * from experience_feed'), '42501', 'anon cannot read the feed');
select is(pg_temp.err('select * from experiences'), '42501', 'anon cannot read experiences');
select is(pg_temp.err('select * from companies'), '42501', 'anon cannot read companies');
select is(pg_temp.err('select * from profiles'), '42501', 'anon cannot read profiles');
select is(pg_temp.err($$select save_draft('{}')$$), '42501', 'anon cannot call write RPCs');
select ok((get_public_stats() ? 'experiences') and not (get_public_stats()::text ilike '%@psgtech%'), 'anon gets aggregate stats with no personal data');
select pg_temp.logout();

select * from finish();
rollback;
