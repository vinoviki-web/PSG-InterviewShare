-- Phase 7: company directory, page, insights, questions, trending.
-- Fixture: a fresh fictional company with hand-countable numbers.
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('alice',  pg_temp.make_user('33z001@psgtech.ac.in', 'Alice A', 'cse', 2026::smallint)),
  ('bob',    pg_temp.make_user('33z002@psgtech.ac.in', 'Bob B', 'cse', 2027::smallint)),
  ('carol',  pg_temp.make_user('33z003@psgtech.ac.in', 'Carol C', 'it', 2027::smallint)),
  ('dave',   pg_temp.make_user('33z004@psgtech.ac.in', 'Dave D', 'ece', 2027::smallint)),
  ('reader', pg_temp.make_user('33z005@psgtech.ac.in', 'Reader R'));
insert into companies (name, slug, industry) values ('Zephyr Systems', 'zephyr-systems', 'Software'), ('Zephyr Old', 'zephyr-old', 'Software'), ('Empty Co', 'empty-co', 'Software');
insert into company_aliases (company_id, alias) select id, 'ZSYS' from companies where slug = 'zephyr-systems';
update companies set merged_into_id = (select id from companies where slug = 'zephyr-systems') where slug = 'zephyr-old';

create function pg_temp.rnd(p_type text, p_questions jsonb default '[]') returns jsonb language sql as $$
  select jsonb_build_object('round_type', p_type, 'mode', 'online',
    'description', 'A reasonably detailed description of what happened in this round.', 'questions', p_questions)
$$;
create function pg_temp.q(p_body text, p_kind text, p_topics jsonb) returns jsonb language sql as $$
  select jsonb_build_object('body', p_body, 'kind', p_kind, 'topics', p_topics)
$$;
create function pg_temp.share(p_role text, p_year int, p_diff int, p_outcome text, p_topics jsonb, p_rounds jsonb, p_extra jsonb default '{}') returns uuid language plpgsql as $$
declare v uuid;
begin
  v := (save_draft(pg_temp.payload('zephyr-systems', p_role, jsonb_build_object(
    'graduation_year', p_year, 'difficulty', p_diff, 'outcome', p_outcome, 'topics', p_topics, 'rounds', p_rounds) || p_extra)) ->> 'id')::uuid;
  perform publish_experience(v);
  return v;
end $$;
grant execute on all functions in schema pg_temp to authenticated;

-- e1  Alice ’26  OA > TECH > HR  difficulty 3  selected
select pg_temp.login((select v from ids where k = 'alice'));
insert into ids select 'e1', pg_temp.share('Backend Engineer', 2026, 3, 'selected', '["arrays"]',
  jsonb_build_array(pg_temp.rnd('online_assessment'),
                    pg_temp.rnd('technical', jsonb_build_array(pg_temp.q('Reverse a linked list in groups of k.', 'coding', '["linked-lists"]'))),
                    pg_temp.rnd('hr')));
select pg_temp.logout();

-- e2  Bob ’27  OA > TECH > HR  difficulty 5  not selected (same question, different punctuation)
select pg_temp.login((select v from ids where k = 'bob'));
insert into ids select 'e2', pg_temp.share('Backend Engineer', 2027, 5, 'not_selected', '["arrays", "graphs"]',
  jsonb_build_array(pg_temp.rnd('online_assessment'),
                    pg_temp.rnd('technical', jsonb_build_array(pg_temp.q('Reverse a linked list in groups of K!', 'coding', '["linked-lists"]'))),
                    pg_temp.rnd('hr', jsonb_build_array(pg_temp.q('Tell me about yourself.', 'hr', '["behavioral"]')))));
select pg_temp.logout();

-- below the threshold so far
select pg_temp.login((select v from ids where k = 'reader'));
select is(get_company_insights('zephyr-systems') ->> 'sufficient', 'false', 'with 2 experiences, insights are withheld');
select is((get_company_insights('zephyr-systems') ->> 'n')::int, 2, '…but the count is shown');
select pg_temp.logout();

-- e3  Carol ’27 (anonymous)  CODE > TECH  difficulty 4  undisclosed
select pg_temp.login((select v from ids where k = 'carol'));
insert into ids select 'e3', pg_temp.share('Platform Engineer', 2027, 4, 'undisclosed', '["graphs"]',
  jsonb_build_array(pg_temp.rnd('coding'),
                    pg_temp.rnd('technical', jsonb_build_array(pg_temp.q('Explain what a deadlock is.', 'technical', '["operating-systems"]')))),
  '{"is_anonymous": true}');
select pg_temp.logout();

-- e4  Dave: published then hidden by moderators: must not count anywhere
select pg_temp.login((select v from ids where k = 'dave'));
insert into ids select 'e4', pg_temp.share('Hidden Engineer', 2027, 1, 'selected', '["arrays"]',
  jsonb_build_array(pg_temp.rnd('group_discussion', jsonb_build_array(pg_temp.q('A hidden question nobody should see.', 'hr', '[]')))));
select pg_temp.logout();
update experiences set status = 'hidden' where id = (select v from ids where k = 'e4');

-- ------------------------------------------------------------------ insights
select pg_temp.login((select v from ids where k = 'reader'));
create temp table ins as select get_company_insights('zephyr-systems') j;
select is((select (j ->> 'n')::int from ins), 3, 'three published experiences (the hidden one is excluded)');
select is((select j ->> 'sufficient' from ins), 'true', 'at the threshold, insights are shown');
select is((select (j ->> 'avg_difficulty')::numeric from ins), 4.0, 'average difficulty = (3 + 5 + 4) / 3');
select is((select (j ->> 'selected')::int from ins), 1, 'one reported selection');
select is((select (j ->> 'disclosed')::int from ins), 2, 'two disclosed outcomes (undisclosed excluded)');
select is((select j -> 'sequences' -> 0 from ins), '{"steps": ["online_assessment", "technical", "hr"], "count": 2}'::jsonb, 'the most common process is OA > TECH > HR, seen twice');
select is((select jsonb_array_length(j -> 'sequences') from ins), 2, 'two distinct processes');
select is((select (r ->> 'count')::int from ins, jsonb_array_elements(j -> 'rounds') r where r ->> 'type' = 'technical'), 3, 'three technical rounds');
select ok(not exists (select 1 from ins, jsonb_array_elements(j -> 'rounds') r where r ->> 'type' = 'group_discussion'), 'the hidden post’s rounds don’t count');
select is((select (t ->> 'count')::int from ins, jsonb_array_elements(j -> 'topics') t where t -> 'topic' ->> 'value' = 'arrays'), 2, 'a topic counts once per experience');
select is((select (t ->> 'count')::int from ins, jsonb_array_elements(j -> 'topics') t where t -> 'topic' ->> 'value' = 'linked-lists'), 2, 'question topics count too');
select is((select j -> 'batches' from ins), '[{"year": 2026, "count": 1}, {"year": 2027, "count": 2}]'::jsonb, 'experiences by batch');
select is((select j ->> 'latest_month' from ins), '2025-08-01', 'latest interview month');

-- ------------------------------------------------------------------ questions
create temp table qs as select get_company_questions('zephyr-systems') j;
select is((select jsonb_array_length(j) from qs), 3, 'three distinct questions (the two linked-list variants are grouped)');
select is((select jsonb_array_length(j -> 0 -> 'experiences') from qs), 2, 'the most-reported question comes first, asked in 2 experiences');
select is((select j -> 0 -> 'batches' from qs), '[2026, 2027]'::jsonb, '…across batches ’26 and ’27');
select is((select jsonb_array_length(get_company_questions('zephyr-systems', 'hr'))), 1, 'filtering by question type works');
select ok((select j::text not like '%hidden question%' from qs), 'questions from hidden posts never appear');
select ok((select j::text not like '%Carol%' from qs), 'questions never reveal an anonymous author');

-- ------------------------------------------------------------------ page, directory, trending
select is(get_company('zephyr-systems') ->> 'name', 'Zephyr Systems', 'a company page loads');
select is((get_company('zephyr-systems') ->> 'experience_count')::int, 3, 'the page shows the published count');
select is((get_company('zephyr-systems') ->> 'question_count')::int, 4, 'and the question count (hidden excluded)');
select is(get_company('zephyr-old') ->> 'redirect', 'zephyr-systems', 'a merged company redirects to its target');
select is(pg_temp.err($$select get_company('no-such-company')$$), 'not_found', 'an unknown slug is not found');
select ok(exists (select 1 from company_directory('zsys') d where d ->> 'slug' = 'zephyr-systems'), 'the directory finds a company by alias');
select ok(not exists (select 1 from company_directory() d where d ->> 'slug' in ('empty-co', 'zephyr-old')), 'empty and merged companies are left out of the directory');
select is((select d ->> 'slug' from company_directory('', 'Software', 'az') d limit 1), (select min(slug) from companies c where c.industry = 'Software' and c.merged_into_id is null and exists (select 1 from experience_feed f where f.company_id = c.id and f.status = 'published')), 'A–Z sort and the industry filter work');
select ok(exists (select 1 from trending_companies(20) t where t ->> 'slug' = 'zephyr-systems'), 'a company with fresh experiences is trending');
select ok('Software' = any (array(select company_industries())), 'industries are listed');
select pg_temp.logout();

-- ------------------------------------------------------------------ access
select pg_temp.anon();
select is(pg_temp.err($$select get_company_insights('zephyr-systems')$$), '42501', 'visitors can’t read company insights');
select is(pg_temp.err($$select company_directory()$$), '42501', 'visitors can’t read the directory');
select pg_temp.logout();

select * from finish();
rollback;
