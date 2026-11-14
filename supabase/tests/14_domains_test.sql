-- Every branch, every domain (DECISIONS MD1–MD5): domains, topics grouped by
-- domain, the new round and question types, and the domain on experiences.
begin;
\ir helpers.psql
select no_plan();

-- ---- reference data
select is((select count(*)::int from domains), 13, '13 domains are loaded');
select ok((select count(*) from topics) >= 110, 'about 110 topics are loaded');
select is((select count(*)::int from topics t where t.domain_id is not null and not exists (select 1 from domains d where d.id = t.domain_id)), 0,
  'every topic belongs to a real domain or to none (general)');
select ok(exists (select 1 from topics where id = 'power-systems' and domain_id = 'electrical'), 'core topics are grouped by their domain');
select ok(exists (select 1 from topics where id = 'quantitative-aptitude' and domain_id is null), 'aptitude topics belong to every domain');
select ok((select count(distinct domain_id) from topics where domain_id is not null) >= 12, 'every domain except Other has its own topics');
select ok(exists (select 1 from companies where slug = 'abb' and not is_verified and description is null), 'core companies start unverified with no description');

-- ---- new round and question types
select ok('written_test' = any (enum_range(null::round_type)::text[]) and 'practical' = any (enum_range(null::round_type)::text[]), 'written and practical rounds exist');
select ok('numerical' = any (enum_range(null::question_kind)::text[]) and 'design' = any (enum_range(null::question_kind)::text[]), 'numerical and design questions exist');

-- ---- who can read and write domains
create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values ('eee', pg_temp.make_user('31z101@psgtech.ac.in', 'Divya EEE', 'eee')),
                       ('admin', pg_temp.make_user('31z102@psgtech.ac.in', 'Domain Admin'));
insert into user_roles (user_id, role) select v, 'admin' from ids where k = 'admin';

select pg_temp.anon();
select is(pg_temp.err('select 1 from domains'), '42501', 'visitors can’t read domains');
select pg_temp.logout();

select pg_temp.login((select v from ids where k = 'eee'));
select is(pg_temp.n('select 1 from domains'), 13::bigint, 'students read every domain');
select is(pg_temp.err($$insert into domains (id, name) values ('zz-test', 'Test')$$), '42501', 'students can’t add domains');

-- ---- publishing needs a domain
create temp table errs (hint jsonb);
grant select, insert on errs to authenticated;
create function pg_temp.hint(p_sql text) returns jsonb language plpgsql as $$
declare h text;
begin
  execute p_sql;
  return '{}';
exception when others then
  get stacked diagnostics h = pg_exception_hint;
  return coalesce(nullif(h, '')::jsonb, '{}');
end $$;
grant execute on function pg_temp.hint(text) to authenticated;

-- A core-electrical experience with the new round and question types
create function pg_temp.core(p_extra jsonb default '{}') returns jsonb language sql as $$
  select pg_temp.payload('abb', 'Graduate Engineer Trainee', jsonb_build_object(
    'domain_id', 'electrical', 'department_id', 'eee', 'topics', jsonb_build_array('power-systems', 'electrical-machines'),
    'rounds', jsonb_build_array(
      jsonb_build_object('round_type', 'written_test', 'mode', 'offline', 'difficulty', 3,
        'description', 'Pen-and-paper test: 40 MCQs on machines and power systems plus five numericals.',
        'questions', jsonb_build_array(jsonb_build_object('body', 'Find the slip of a 4-pole, 50 Hz motor running at 1440 rpm.', 'kind', 'numerical', 'topics', jsonb_build_array('electrical-machines')))),
      jsonb_build_object('round_type', 'practical', 'mode', 'offline', 'difficulty', 4,
        'description', 'Lab round: wire a star-delta starter on the trainer kit and explain each contactor.',
        'questions', jsonb_build_array(jsonb_build_object('body', 'Design the control circuit for a star-delta starter.', 'kind', 'design', 'topics', jsonb_build_array('switchgear-protection'))))
    )) || p_extra)
$$;
grant execute on function pg_temp.core(jsonb) to authenticated;

insert into ids select 'nodomain', (save_draft(pg_temp.core() - 'domain_id') ->> 'id')::uuid;
insert into errs select pg_temp.hint($$select publish_experience((select v from ids where k = 'nodomain'))$$);
select ok((select hint ? 'domain_id' from errs), 'publishing without a domain is refused at the domain field');
select is((select hint ->> 'domain_id' from errs), 'Choose the domain this role belongs to.', 'with a clear message');
delete from errs;

insert into ids select 'baddomain', (save_draft(pg_temp.core('{"domain_id": "not-a-domain"}')) ->> 'id')::uuid;
select is((select domain_id from experiences where id = (select v from ids where k = 'baddomain')), null, 'an unknown domain is not stored');
insert into errs select pg_temp.hint($$select publish_experience((select v from ids where k = 'baddomain'))$$);
select ok((select hint ? 'domain_id' from errs), 'and the experience can’t be published until a real domain is chosen');

insert into ids select 'core', (save_draft(pg_temp.core()) ->> 'id')::uuid;
select is(pg_temp.err($$select publish_experience((select v from ids where k = 'core'))$$), 'ok', 'a core experience with written and practical rounds publishes');
select is((select pipeline from experience_feed where id = (select v from ids where k = 'core')), array['written_test', 'practical'], 'the new round types show in the pipeline');
select is((select array_agg(kind::text order by position) from questions where experience_id = (select v from ids where k = 'core')), array['numerical', 'design'],
  'numerical and design questions are stored');
select is((select domain_id from experience_feed where id = (select v from ids where k = 'core')), 'electrical', 'the feed carries the domain');
select is(get_experience((select v from ids where k = 'core')) -> 'domain' ->> 'name', 'Electrical & power', 'the detail page gets the domain name');
select is(get_experience_for_editor((select v from ids where k = 'core')) ->> 'domain_id', 'electrical', 'the editor gets the domain back');
select is(pg_temp.n($$select 1 from experience_feed where domain_id = 'electrical' and status = 'published'$$) > 0, true, 'experiences can be filtered by domain');
select ok((experience_facets() -> 'domain' ->> 'electrical')::int >= 1, 'filter counts include domains');
select ok(exists (select 1 from jsonb_array_elements(get_company('abb') -> 'domains') d where d ->> 'id' = 'electrical'), 'a company page lists the domains it hires for');

-- Anonymous with hidden department: the domain still shows (it isn't identifying)
select publish_experience((select v from ids where k = 'core'), pg_temp.core('{"is_anonymous": true, "hide_department": true}'));
select pg_temp.login((select v from ids where k = 'admin'));
select is((select domain_id from experience_feed where id = (select v from ids where k = 'core')), 'electrical', 'the domain shows even when the department is hidden');
select is((select department_id from experience_feed where id = (select v from ids where k = 'core')), null, 'while the department stays hidden');
select pg_temp.logout();

-- ---- landing page: per-domain counts follow the visitor threshold
select pg_temp.anon();
select ok(get_public_stats() ? 'domains', 'visitors get a domains object');
select pg_temp.logout();
update platform_settings set landing_stats_threshold = 10000;
select pg_temp.anon();
select is(get_public_stats() -> 'domains', '{}'::jsonb, 'below the threshold, no per-domain counts are shown');
select pg_temp.logout();
update platform_settings set landing_stats_threshold = 1;
select pg_temp.anon();
select ok((get_public_stats() -> 'domains' ->> 'electrical')::int >= 1, 'above it, visitors see how many experiences each domain has');
select pg_temp.logout();

select * from finish();
rollback;
