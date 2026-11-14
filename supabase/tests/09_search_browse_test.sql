-- Phase 6: explorer search and browse visibility.
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('alice', pg_temp.make_user('32z001@psgtech.ac.in', 'Alice A')),
  ('bob',   pg_temp.make_user('32z002@psgtech.ac.in', 'Bob B'));

select pg_temp.login((select v from ids where k = 'alice'));
-- a named Freshworks post with a distinctive question
insert into ids select 'fw', (save_draft(pg_temp.payload('freshworks', 'Quasar Engineer', jsonb_build_object(
  'rounds', jsonb_build_array(jsonb_build_object('round_type', 'coding', 'mode', 'online', 'description', 'Two problems on a shared editor with a friendly interviewer.',
    'questions', jsonb_build_array(jsonb_build_object('body', 'Group words that are anagrams of each other.', 'kind', 'coding', 'topics', jsonb_build_array('hashing')))))))) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'fw'));
-- an anonymous TCS post with a hidden department
insert into ids select 'tcs', (save_draft(pg_temp.payload('tata-consultancy-services', 'Quasar Analyst', '{"is_anonymous": true, "hide_department": true}')) ->> 'id')::uuid;
select publish_experience((select v from ids where k = 'tcs'));
-- a draft that must never be searchable
insert into ids select 'draft', (save_draft(pg_temp.payload('microsoft', 'Quokka Engineer')) ->> 'id')::uuid;
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'bob'));
select ok(exists (select 1 from search_feed('fresh') where id = (select v from ids where k = 'fw')), 'a company name prefix finds the post (“fresh” → Freshworks)');
select ok(exists (select 1 from search_feed('anagram') where id = (select v from ids where k = 'fw')), 'question text is searchable, with stemming (“anagram” → “anagrams”)');
select ok(exists (select 1 from search_feed('quasar engineer') where id = (select v from ids where k = 'fw')), 'role words are searchable');
select ok(exists (select 1 from search_feed('tcs') where id = (select v from ids where k = 'tcs')), 'a company alias finds the post (“tcs”)');
select ok(not exists (select 1 from search_feed('fresh zoho') where id = (select v from ids where k = 'fw')), 'every word must match');
select is((select count(*)::int from search_feed('quokka')), 0, 'drafts are never searchable');
select ok((select author_name is null and author_id is null and department_id is null from search_feed('tcs') where id = (select v from ids where k = 'tcs')), 'search results keep anonymity and hidden departments masked');
select is((select count(*) from search_feed(null)), (select count(*) from experience_feed), 'an empty query returns the whole feed');
select is(pg_temp.err($$select count(*) from search_feed('''); drop table public.experiences; --')$$), 'ok', 'hostile input is just text');
select ok((select count(*) from experiences) >= 0, '…and nothing was dropped');
select ok(exists (select 1 from search_feed(null) where pipeline @> array['coding'] and id = (select v from ids where k = 'fw')), 'the round-type filter (pipeline contains) works');
select is((select count(*)::int from search_feed(null) where department_id = 'cse' and id = (select v from ids where k = 'tcs')), 0, 'a hidden department never matches a department filter');
select ok((experience_facets() -> 'type' ->> 'internship')::int >= 2, 'facet counts include published posts');
select pg_temp.logout();

select pg_temp.anon();
select is(pg_temp.err($$select count(*) from search_feed('fresh')$$), '42501', 'visitors can’t search');
select pg_temp.logout();

select * from finish();
rollback;
