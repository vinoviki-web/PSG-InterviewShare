-- Phase 5: the share wizard's contract on the real database.
begin;
\ir helpers.psql
select no_plan();

create temp table ids (k text primary key, v uuid);
grant select, insert on ids to authenticated, anon;
insert into ids values
  ('alice', pg_temp.make_user('31z001@psgtech.ac.in', 'Alice A')),
  ('bob',   pg_temp.make_user('31z002@psgtech.ac.in', 'Bob B'));
-- a merged duplicate company, to check slugs follow merges
insert into companies (name, slug) values ('Amazon Dev Centre', 'amazon-dev-centre');
update companies set merged_into_id = (select id from companies where slug = 'amazon') where slug = 'amazon-dev-centre';

create function pg_temp.wiz(p_extra jsonb default '{}') returns jsonb language sql as $$
  select (pg_temp.payload() - 'company_id' - 'confirmed_own') || jsonb_build_object('company_slug', 'amazon', 'confirmed', true) || p_extra
$$;
grant execute on function pg_temp.wiz(jsonb) to authenticated;

select pg_temp.login((select v from ids where k = 'alice'));

-- ---- company by slug, merges, draft steps
insert into ids select 'd1', (save_draft(pg_temp.wiz('{"draft_step": 2, "draft_max_step": 3}')) ->> 'id')::uuid;
select is((select c.slug from experiences e join companies c on c.id = e.company_id where e.id = (select v from ids where k = 'd1')), 'amazon', 'company_slug resolves to the company');
select is((select draft_max_step from experiences where id = (select v from ids where k = 'd1')), 3::smallint, 'draft_max_step is stored');
select save_draft(pg_temp.wiz(jsonb_build_object('id', (select v from ids where k = 'd1'), 'draft_step', 1, 'draft_max_step', 1)));
select is((select draft_max_step from experiences where id = (select v from ids where k = 'd1')), 3::smallint, 'draft_max_step never goes backwards');
select save_draft(pg_temp.wiz(jsonb_build_object('id', (select v from ids where k = 'd1'), 'company_slug', 'amazon-dev-centre')));
select is((select c.slug from experiences e join companies c on c.id = e.company_id where e.id = (select v from ids where k = 'd1')), 'amazon', 'a merged company slug resolves to its target');

-- ---- eligibility is sanitised
select save_draft(pg_temp.wiz(jsonb_build_object('id', (select v from ids where k = 'd1'),
  'eligibility', '{"cgpa": "99", "branches": ["cse", "not-a-dept"], "backlogs": "maybe", "other": "Must have no arrears", "evil": "<script>"}'::jsonb)));
select is((select eligibility from experiences where id = (select v from ids where k = 'd1')),
  '{"branches": ["cse"], "backlogs": "unknown", "other": "Must have no arrears"}'::jsonb, 'eligibility keeps known keys and valid values only');

-- ---- the editor row
select is(get_experience_for_editor((select v from ids where k = 'd1')) ->> 'company_slug', 'amazon', 'the editor row carries the company slug');
select is(get_experience_for_editor((select v from ids where k = 'd1')) -> 'rounds' -> 0 -> 'questions' -> 0 -> 'topics', '["linked-lists"]'::jsonb, 'question topics come back as slugs');
select is(get_experience_for_editor((select v from ids where k = 'd1')) -> 'topics', '["arrays"]'::jsonb, 'experience topics come back as slugs');
select is((get_experience_for_editor((select v from ids where k = 'd1')) ->> 'confirmed')::boolean, true, '`confirmed` round-trips');
select pg_temp.logout();
select pg_temp.login((select v from ids where k = 'bob'));
select is(pg_temp.err($$select get_experience_for_editor((select v from ids where k = 'd1'))$$), 'forbidden', 'others can’t load your draft into the editor');
select is(pg_temp.err($$select delete_draft((select v from ids where k = 'd1'))$$), 'not_found', 'others can’t delete your draft');
-- duplicate_of can't point at someone else's post
insert into ids select 'bobd', (save_draft(pg_temp.wiz(jsonb_build_object('duplicate_of', (select v from ids where k = 'd1'), 'duplicate_reason', 'Pointing at Alice')))->> 'id')::uuid;
select is((select duplicate_of from experiences where id = (select v from ids where k = 'bobd')), null, 'duplicate_of is dropped when it isn’t your own experience');
select pg_temp.logout();

-- ---- publish errors use the wizard's field paths
select pg_temp.login((select v from ids where k = 'alice'));
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
insert into errs select pg_temp.hint($$select publish_experience((select v from ids where k = 'd1'), pg_temp.wiz('{
  "confirmed": false,
  "rounds": [{"round_type": "hr", "description": "short", "questions": []},
             {"round_type": "technical", "description": "Long enough description of the technical round here.", "questions": [{"body": "abcd", "kind": "coding"}]}],
  "resources": [{"title": "x", "url": "ftp://example.com"}]
}'))$$);
select ok((select hint ? 'rounds.0.description' from errs), 'a thin round is reported at rounds.0.description');
select ok((select hint ? 'rounds.1.questions.0.body' from errs), 'a too-short question is reported at its path');
select ok((select hint ? 'resources.0.url' and hint ? 'resources.0.title' from errs), 'resource problems are reported per field');
select ok((select hint ? 'confirmed' from errs), 'the confirmation uses the wizard’s field name');
select is((select status::text from experiences where id = (select v from ids where k = 'd1')), 'draft', 'a failed publish leaves the draft untouched');

-- ---- publish: new company, alias reuse, created_company
insert into ids select 'd2', (save_draft(pg_temp.wiz('{"company_slug": null, "new_company_name": "Orbit Labs", "role_title": "Backend Intern"}')) ->> 'id')::uuid;
select is(publish_experience((select v from ids where k = 'd2')) -> 'created_company' ->> 'name', 'Orbit Labs', 'publishing reports a newly created company');
insert into ids select 'd3', (save_draft(pg_temp.wiz('{"company_slug": null, "new_company_name": "tcs", "role_title": "Ninja"}')) ->> 'id')::uuid;
select is(publish_experience((select v from ids where k = 'd3')) -> 'created_company', 'null'::jsonb, 'a new name that matches an alias reuses the existing company');
select is((select c.slug from experiences e join companies c on c.id = e.company_id where e.id = (select v from ids where k = 'd3')), 'tata-consultancy-services', '“tcs” lands on Tata Consultancy Services');

-- ---- delete_draft never removes a published experience
select is(pg_temp.err($$select delete_draft((select v from ids where k = 'd2'))$$), 'forbidden', 'delete_draft refuses a published experience');
select is((select status::text from experiences where id = (select v from ids where k = 'd2')), 'published', '…and it stays published');
select is(pg_temp.err($$select delete_draft((select v from ids where k = 'd1'))$$), 'ok', 'delete_draft removes your own draft');
select pg_temp.logout();

select * from finish();
rollback;
