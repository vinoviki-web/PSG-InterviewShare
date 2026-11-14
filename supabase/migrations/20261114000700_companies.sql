-- =====================================================================
-- Roundwise · 0700 · Companies (Phase 7)
-- All functions are SECURITY INVOKER and read from experience_feed /
-- RLS-protected tables, so every visibility rule (published only,
-- anonymity, suspension, PSG-only) applies automatically. Aggregates
-- include anonymous posts but never expose who wrote them.
-- Shapes match the prototype's src/api/companies.js.
-- =====================================================================

create or replace function public.company_insight_threshold()
returns int language sql immutable set search_path = '' as $$ select 3 $$;  -- P14

-- Per-company stats over PUBLISHED experiences visible to the caller.
create or replace function public.company_stats()
returns table (
  id uuid, slug text, name text, industry text, website text, is_verified boolean, aliases text[],
  experience_count int, latest_interview date, last_published_at timestamptz, question_count int
)
language sql stable
set search_path = ''
as $$
  select c.id, c.slug, c.name, c.industry, c.website, c.is_verified,
         coalesce((select array_agg(a.alias order by a.alias) from public.company_aliases a where a.company_id = c.id), '{}'),
         coalesce(s.n, 0)::int, s.latest, s.last_pub, coalesce(s.questions, 0)::int
  from public.companies c
  left join lateral (
    select count(*) n, max(f.interview_month) latest, max(f.published_at) last_pub, sum(f.question_count) questions
    from public.experience_feed f where f.company_id = c.id and f.status = 'published'
  ) s on true
  where c.merged_into_id is null and public.is_psg_user()
$$;

-- Directory: companies with at least one published experience.
create or replace function public.company_directory(p_q text default '', p_industry text default '', p_sort text default 'experiences')
returns setof jsonb
language sql stable
set search_path = ''
as $$
  select to_jsonb(s) from public.company_stats() s
  where s.experience_count > 0
    and (coalesce(p_industry, '') = '' or s.industry = p_industry)
    and (coalesce(trim(p_q), '') = ''
         or s.name ilike '%' || trim(p_q) || '%'
         or exists (select 1 from unnest(s.aliases) a where a ilike '%' || trim(p_q) || '%'))
  order by
    case when p_sort = 'az' then lower(s.name) end asc,
    case when p_sort = 'recent' then s.last_published_at end desc nulls last,
    case when p_sort not in ('az', 'recent') then s.experience_count end desc,
    lower(s.name) asc
$$;

create or replace function public.company_industries()
returns setof text
language sql stable
set search_path = ''
as $$
  select distinct c.industry from public.companies c
  where c.merged_into_id is null and c.industry is not null and public.is_psg_user()
  order by 1
$$;

-- One company page. A merged company returns { redirect: <target slug> }.
create or replace function public.get_company(p_slug text)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  c public.companies;
  v_out jsonb;
begin
  select * into c from public.companies x where x.slug = p_slug;
  if c.id is null then
    perform public.raise_app_error('not_found', 'We couldn’t find that company.');
  end if;
  if c.merged_into_id is not null then
    return jsonb_build_object('redirect', (select t.slug from public.companies t where t.id = c.merged_into_id));
  end if;
  select to_jsonb(s) || jsonb_build_object('description', c.description, 'description_source', c.description_source)
    into v_out
  from public.company_stats() s where s.id = c.id;
  return v_out;
end
$$;

-- Student-reported insights (spec §9.8). Below the threshold, only the count.
create or replace function public.get_company_insights(p_slug text)
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_company uuid;
  v_n int;
begin
  select coalesce(c.merged_into_id, c.id) into v_company from public.companies c where c.slug = p_slug;
  if v_company is null then
    perform public.raise_app_error('not_found', 'We couldn’t find that company.');
  end if;
  select count(*) into v_n from public.experience_feed f where f.company_id = v_company and f.status = 'published';
  if v_n < public.company_insight_threshold() then
    return jsonb_build_object('n', v_n, 'sufficient', false, 'threshold', public.company_insight_threshold());
  end if;

  return (
    with pub as (
      select f.id, f.difficulty, f.outcome, f.interview_month, f.graduation_year, f.topic_ids, f.pipeline
      from public.experience_feed f where f.company_id = v_company and f.status = 'published'
    ),
    seqs as (
      select array_to_string(pipeline, '>') k, count(*) n from pub group by 1
    ),
    topic_hits as (
      -- an experience counts once per topic, whether tagged on the post or on a question
      select t.topic_id, count(distinct t.eid) n from (
        select p.id eid, unnest(p.topic_ids) topic_id from pub p
        union
        select q.experience_id, qt.topic_id from public.questions q join public.question_topics qt on qt.question_id = q.id
        where q.experience_id in (select id from pub)
      ) t group by 1
    ),
    rounds as (
      select r.round_type::text t, count(*) n from public.experience_rounds r where r.experience_id in (select id from pub) group by 1
    )
    select jsonb_build_object(
      'n', v_n,
      'sufficient', true,
      'avg_difficulty', (select round(avg(difficulty)::numeric, 1) from pub),
      'selected', (select count(*) from pub where outcome = 'selected'),
      'disclosed', (select count(*) from pub where outcome in ('selected', 'not_selected')),
      'first_month', (select min(interview_month) from pub),
      'latest_month', (select max(interview_month) from pub),
      'sequences', (select coalesce(jsonb_agg(jsonb_build_object('steps', string_to_array(k, '>'), 'count', n) order by n desc, k), '[]') from seqs),
      'topics', (select coalesce(jsonb_agg(jsonb_build_object('topic', jsonb_build_object('value', tp.id, 'label', tp.name), 'count', th.n) order by th.n desc, tp.name), '[]')
                 from (select * from topic_hits order by n desc, topic_id limit 8) th join public.topics tp on tp.id = th.topic_id),
      'rounds', (select coalesce(jsonb_agg(jsonb_build_object('type', t, 'count', n) order by n desc, t), '[]') from rounds),
      'batches', (select coalesce(jsonb_agg(jsonb_build_object('year', graduation_year, 'count', n) order by graduation_year), '[]')
                  from (select graduation_year, count(*) n from pub group by 1) b)
    )
  );
end
$$;

-- Questions reported for a company, grouped by normalised text (most reported first).
create or replace function public.get_company_questions(p_slug text, p_kind text default '')
returns jsonb
language plpgsql stable
set search_path = ''
as $$
declare
  v_company uuid;
begin
  select coalesce(c.merged_into_id, c.id) into v_company from public.companies c where c.slug = p_slug;
  if v_company is null then
    perform public.raise_app_error('not_found', 'We couldn’t find that company.');
  end if;
  return (
    with pub as (
      select f.id, f.role_title, f.graduation_year, f.published_at from public.experience_feed f
      where f.company_id = v_company and f.status = 'published'
    ),
    qs as (
      select q.id, q.body, q.body_norm, q.kind::text kind, r.round_type::text round_type, p.id eid, p.role_title, p.graduation_year, p.published_at
      from public.questions q
      join pub p on p.id = q.experience_id
      join public.experience_rounds r on r.id = q.round_id
      where coalesce(p_kind, '') = '' or q.kind::text = p_kind
    ),
    grouped as (
      select body_norm,
             (array_agg(id order by published_at desc))[1] id,
             (array_agg(body order by published_at desc))[1] body,
             (array_agg(kind order by published_at desc))[1] kind,
             array_agg(distinct round_type) round_types,
             array_agg(distinct graduation_year order by graduation_year) batches,
             jsonb_agg(distinct jsonb_build_object('id', eid, 'role_title', role_title, 'year', graduation_year)) experiences,
             count(distinct eid) n
      from qs group by body_norm
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', g.id, 'body', g.body, 'kind', g.kind, 'round_types', g.round_types, 'batches', g.batches, 'experiences', g.experiences,
      'topics', coalesce((select jsonb_agg(distinct jsonb_build_object('value', tp.id, 'label', tp.name))
                          from public.questions q2 join public.question_topics qt on qt.question_id = q2.id join public.topics tp on tp.id = qt.topic_id
                          where q2.body_norm = g.body_norm and q2.experience_id in (select id from pub)), '[]')
    ) order by g.n desc, g.body), '[]')
    from grouped g
  );
end
$$;

-- Trending: new published experiences in the last 120 days, plus a little weight for reads.
create or replace function public.trending_companies(p_limit int default 6)
returns setof jsonb
language sql stable
set search_path = ''
as $$
  select to_jsonb(s) from (
    select f.company_id, count(*) + sum(f.view_count) / 500.0 score
    from public.experience_feed f
    where f.status = 'published' and f.published_at > now() - interval '120 days'
    group by f.company_id
    order by score desc
    limit least(greatest(p_limit, 1), 20)
  ) t
  join public.company_stats() s on s.id = t.company_id
  order by t.score desc
$$;

revoke execute on function public.company_insight_threshold(), public.company_stats(), public.company_directory(text, text, text), public.company_industries(),
  public.get_company(text), public.get_company_insights(text), public.get_company_questions(text, text), public.trending_companies(int) from public, anon;
grant execute on function public.company_insight_threshold(), public.company_stats(), public.company_directory(text, text, text), public.company_industries(),
  public.get_company(text), public.get_company_insights(text), public.get_company_questions(text, text), public.trending_companies(int) to authenticated;
