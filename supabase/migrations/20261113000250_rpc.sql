-- =====================================================================
-- Roundwise · 0250 · RPCs (the only write path for experiences,
-- reports, moderation and admin operations)
-- Errors: SQLSTATE P0001, DETAIL = stable code, HINT = JSON field errors
-- for 'validation'. The client maps these to ApiError (src/api/client.js).
-- =====================================================================

-- ------------------------------------------------------------ onboarding
create or replace function public.complete_onboarding(
  p_full_name text, p_department_id text, p_graduation_year smallint,
  p_interests text[] default '{}', p_topic_ids text[] default '{}'
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_errors jsonb := '{}';
  v_handle text;
  v_base text;
  v_year int := extract(year from now());
  v_profile public.profiles;
begin
  if not public.is_psg_user() then
    perform public.raise_app_error('unauthenticated', 'Sign in with your PSG account first.');
  end if;
  if char_length(trim(coalesce(p_full_name, ''))) not between 2 and 80 then
    v_errors := v_errors || '{"full_name": "Use 2–80 characters."}';
  end if;
  if p_department_id is null or not exists (select 1 from public.departments d where d.id = p_department_id and d.is_active) then
    v_errors := v_errors || '{"department_id": "Choose your department."}';
  end if;
  if p_graduation_year is null or p_graduation_year not between v_year - 6 and v_year + 6 then
    v_errors := v_errors || '{"graduation_year": "Choose a valid batch."}';
  end if;
  if exists (select 1 from unnest(coalesce(p_topic_ids, '{}')) t where not exists (select 1 from public.topics x where x.id = t)) then
    v_errors := v_errors || '{"topic_ids": "Unknown topic."}';
  end if;
  if v_errors <> '{}' then
    perform public.raise_app_error('validation', 'Please fix the highlighted fields.', v_errors::text);
  end if;

  select * into v_profile from public.profiles p where p.id = auth.uid() for update;
  v_handle := v_profile.handle;
  if v_handle is null then
    v_base := left(nullif(public.slugify(p_full_name), ''), 24);
    if v_base is null or char_length(v_base) < 3 then v_base := 'student'; end if;
    v_handle := v_base;
    while exists (select 1 from public.profiles p where p.handle = v_handle) loop
      v_handle := v_base || '-' || (10 + floor(random() * 990))::int;
    end loop;
  end if;

  update public.profiles p set
    full_name = trim(p_full_name),
    department_id = p_department_id,
    graduation_year = p_graduation_year,
    interests = coalesce(p_interests, '{}'),
    topic_ids = coalesce(p_topic_ids, '{}'),
    handle = v_handle,
    onboarded_at = coalesce(p.onboarded_at, now())
  where p.id = auth.uid()
  returning * into v_profile;

  return to_jsonb(v_profile) - 'status' - 'suspended_until' - 'suspension_reason';
end
$$;

-- ------------------------------------------------------------ experience payload (internal)
-- Applies a wizard payload to an experience row and REPLACES its children.
-- Not callable by clients (revoked in 0300).
create or replace function public._apply_experience_payload(p_id uuid, p jsonb)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_round jsonb;
  v_q jsonb;
  v_round_id uuid;
  v_q_id uuid;
  r_pos int := 0;
  q_pos int;
  v_topics text[];
begin
  if jsonb_array_length(coalesce(p -> 'rounds', '[]')) > 12 then
    perform public.raise_app_error('validation', 'Too many rounds.', '{"rounds": "Add at most 12 rounds."}');
  end if;
  v_topics := array(select jsonb_array_elements_text(coalesce(p -> 'topics', '[]')));
  if cardinality(v_topics) > 15 then
    perform public.raise_app_error('validation', 'Too many topics.', '{"topics": "Choose at most 15 topics."}');
  end if;

  update public.experiences e set
    company_id          = nullif(p ->> 'company_id', '')::uuid,
    new_company_name    = case when nullif(p ->> 'company_id', '') is null then nullif(trim(p ->> 'new_company_name'), '') end,
    role_title          = nullif(trim(p ->> 'role_title'), ''),
    opportunity_type    = nullif(p ->> 'opportunity_type', '')::public.opportunity_type,
    hiring_mode         = nullif(p ->> 'hiring_mode', '')::public.hiring_mode,
    department_id       = nullif(p ->> 'department_id', ''),
    graduation_year     = nullif(p ->> 'graduation_year', '')::smallint,
    interview_month     = date_trunc('month', nullif(p ->> 'interview_month', '')::date)::date,
    eligibility         = case when jsonb_typeof(p -> 'eligibility') = 'object' then p -> 'eligibility' end,
    application_process = nullif(trim(p ->> 'application_process'), ''),
    preparation         = nullif(trim(p ->> 'preparation'), ''),
    advice              = nullif(trim(p ->> 'advice'), ''),
    difficulty          = nullif(p ->> 'difficulty', '')::smallint,
    outcome             = nullif(p ->> 'outcome', '')::public.outcome,
    is_anonymous        = coalesce((p ->> 'is_anonymous')::boolean, false),
    hide_department     = coalesce((p ->> 'is_anonymous')::boolean, false) and coalesce((p ->> 'hide_department')::boolean, false),
    confirmed_own       = coalesce((p ->> 'confirmed_own')::boolean, false),
    duplicate_reason    = nullif(trim(p ->> 'duplicate_reason'), ''),
    draft_step          = greatest(1, least(5, coalesce(nullif(p ->> 'draft_step', '')::smallint, e.draft_step)))
  where e.id = p_id;

  delete from public.experience_rounds r where r.experience_id = p_id;  -- cascades to questions
  delete from public.experience_topics t where t.experience_id = p_id;
  delete from public.experience_resources r where r.experience_id = p_id;

  for v_round in select * from jsonb_array_elements(coalesce(p -> 'rounds', '[]')) loop
    r_pos := r_pos + 1;
    if jsonb_array_length(coalesce(v_round -> 'questions', '[]')) > 25 then
      perform public.raise_app_error('validation', 'Too many questions.', jsonb_build_object('rounds', format('Round %s: add at most 25 questions.', r_pos))::text);
    end if;
    insert into public.experience_rounds (experience_id, position, round_type, mode, duration_minutes, difficulty, description)
    values (
      p_id, r_pos,
      coalesce(nullif(v_round ->> 'round_type', ''), 'other')::public.round_type,
      nullif(v_round ->> 'mode', '')::public.round_mode,
      nullif(v_round ->> 'duration_minutes', '')::smallint,
      nullif(v_round ->> 'difficulty', '')::smallint,
      nullif(trim(v_round ->> 'description'), '')
    )
    returning id into v_round_id;

    q_pos := 0;
    for v_q in select * from jsonb_array_elements(coalesce(v_round -> 'questions', '[]')) loop
      continue when char_length(trim(coalesce(v_q ->> 'body', ''))) < 3;  -- drop empty drafts rows
      q_pos := q_pos + 1;
      insert into public.questions (experience_id, round_id, position, body, kind)
      values (p_id, v_round_id, q_pos, trim(v_q ->> 'body'), coalesce(nullif(v_q ->> 'kind', ''), 'technical')::public.question_kind)
      returning id into v_q_id;
      insert into public.question_topics (question_id, topic_id)
      select distinct v_q_id, t from jsonb_array_elements_text(coalesce(v_q -> 'topics', '[]')) t
      where exists (select 1 from public.topics x where x.id = t);
    end loop;
  end loop;

  insert into public.experience_topics (experience_id, topic_id)
  select distinct p_id, t from unnest(v_topics) t where exists (select 1 from public.topics x where x.id = t);

  insert into public.experience_resources (experience_id, position, title, url, kind)
  select p_id, ord, trim(r ->> 'title'), trim(r ->> 'url'), coalesce(nullif(r ->> 'kind', ''), 'other')::public.resource_kind
  from jsonb_array_elements(coalesce(p -> 'resources', '[]')) with ordinality as x(r, ord)
  where nullif(trim(r ->> 'url'), '') is not null;
end
$$;

-- ------------------------------------------------------------ drafts
create or replace function public.save_draft(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := nullif(p ->> 'id', '')::uuid;
  v_row public.experiences;
  v_profile public.profiles;
begin
  if not public.is_active_user() then
    perform public.raise_app_error('forbidden', 'Your account can’t write experiences right now.');
  end if;
  if v_id is null then
    if (select count(*) from public.experiences e where e.author_id = auth.uid() and e.status = 'draft') >= 20 then
      perform public.raise_app_error('rate_limited', 'You have 20 drafts already. Finish or delete one first.');
    end if;
    select * into v_profile from public.profiles where id = auth.uid();
    insert into public.experiences (author_id, department_id, graduation_year, is_anonymous, hide_department)
    values (auth.uid(), v_profile.department_id, v_profile.graduation_year, v_profile.default_anonymous, v_profile.default_anonymous and v_profile.default_hide_department)
    returning id into v_id;
  else
    select * into v_row from public.experiences e where e.id = v_id for update;
    if v_row.id is null or v_row.author_id is distinct from auth.uid() then
      perform public.raise_app_error('not_found', 'We couldn’t find that draft.');
    end if;
    if v_row.status <> 'draft' then
      perform public.raise_app_error('published', 'This experience is already published. Edit it instead.');
    end if;
  end if;

  perform public._apply_experience_payload(v_id, p);
  select * into v_row from public.experiences where id = v_id;
  return jsonb_build_object('id', v_row.id, 'updated_at', v_row.updated_at);
end
$$;

create or replace function public.check_duplicate_experience(
  p_company_id uuid, p_role_title text, p_opportunity_type public.opportunity_type, p_graduation_year smallint, p_exclude uuid default null
)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('id', e.id, 'status', e.status, 'role_title', e.role_title, 'graduation_year', e.graduation_year)
  from public.experiences e
  where e.author_id = auth.uid()
    and e.company_id = p_company_id
    and lower(e.role_title) = lower(trim(p_role_title))
    and e.opportunity_type = p_opportunity_type
    and e.graduation_year = p_graduation_year
    and e.status <> 'removed'
    and e.id is distinct from p_exclude
  order by (e.status = 'draft'), e.updated_at desc
  limit 1
$$;

-- ------------------------------------------------------------ publish / update
create or replace function public.publish_experience(p_id uuid, p_changes jsonb default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.experiences;
  v_was_draft boolean;
  v_errors jsonb := '{}';
  v_round record;
  v_company_id uuid;
  v_slug text;
  v_base text;
  v_n int := 1;
begin
  if not public.is_active_user() then
    perform public.raise_app_error('forbidden', 'Your account can’t publish right now.');
  end if;
  select * into v_row from public.experiences e where e.id = p_id for update;
  if v_row.id is null or v_row.author_id is distinct from auth.uid() or v_row.status = 'removed' then
    perform public.raise_app_error('not_found', 'We couldn’t find that experience.');
  end if;
  v_was_draft := v_row.status = 'draft';

  if p_changes is not null then
    perform public._apply_experience_payload(p_id, p_changes);
    select * into v_row from public.experiences e where e.id = p_id;
  end if;

  -- Server-side validation mirrors the wizard's zod schema (spec §9.9)
  if v_row.company_id is null and v_row.new_company_name is null then v_errors := v_errors || '{"company": "Choose the company."}'; end if;
  if v_row.role_title is null then v_errors := v_errors || '{"role_title": "Add the role title."}'; end if;
  if v_row.opportunity_type is null then v_errors := v_errors || '{"opportunity_type": "Choose internship or full-time."}'; end if;
  if v_row.hiring_mode is null then v_errors := v_errors || '{"hiring_mode": "Choose how you applied."}'; end if;
  if v_row.interview_month is null or v_row.interview_month > date_trunc('month', now())::date then
    v_errors := v_errors || '{"interview_month": "Choose when you interviewed (not in the future)."}';
  end if;
  if v_row.department_id is null then v_errors := v_errors || '{"department_id": "Choose your department."}'; end if;
  if v_row.graduation_year is null then v_errors := v_errors || '{"graduation_year": "Choose your batch."}'; end if;
  if v_row.difficulty is null then v_errors := v_errors || '{"difficulty": "Rate the overall difficulty."}'; end if;
  if v_row.outcome is null then v_errors := v_errors || '{"outcome": "Choose the result."}'; end if;
  if not v_row.confirmed_own then v_errors := v_errors || '{"confirmed_own": "Confirm this is your own experience."}'; end if;
  if v_row.is_anonymous and not public.setting_flag('anonymous_posting') then
    v_errors := v_errors || '{"is_anonymous": "Anonymous posting is turned off right now."}';
  end if;
  if not exists (select 1 from public.experience_rounds r where r.experience_id = p_id) then
    v_errors := v_errors || '{"rounds": "Add at least one round so readers know the process."}';
  end if;
  for v_round in
    select r.position from public.experience_rounds r
    where r.experience_id = p_id
      and char_length(coalesce(r.description, '')) < 30
      and not exists (select 1 from public.questions q where q.round_id = r.id)
  loop
    v_errors := v_errors || jsonb_build_object('rounds', format('Round %s needs a short description (30+ characters) or at least one question.', v_round.position));
  end loop;
  if v_errors <> '{}' then
    perform public.raise_app_error('validation', 'Some details are missing.', v_errors::text);
  end if;

  if v_was_draft and (
    select count(*) from public.experiences e
    where e.author_id = auth.uid() and e.status <> 'draft' and e.published_at > now() - interval '1 day'
  ) >= public.setting_int('limits', 'publish_per_day') then
    perform public.raise_app_error('rate_limited', 'You’ve reached today’s publishing limit. Try again tomorrow.');
  end if;

  -- New company from the wizard → unverified company row
  v_company_id := v_row.company_id;
  if v_company_id is null then
    select c.id into v_company_id from public.companies c
    where lower(c.name) = lower(v_row.new_company_name) and c.merged_into_id is null;
    if v_company_id is null then
      if not public.setting_flag('new_companies') then
        perform public.raise_app_error('validation', 'New companies can’t be added right now.', '{"company": "Choose an existing company."}');
      end if;
      v_base := coalesce(nullif(public.slugify(v_row.new_company_name), ''), 'company');
      v_slug := v_base;
      while exists (select 1 from public.companies c where c.slug = v_slug) loop
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
      end loop;
      insert into public.companies (name, slug, is_verified, created_by)
      values (v_row.new_company_name, v_slug, false, auth.uid())
      returning id into v_company_id;  -- audited by the audit_company_change trigger
    end if;
  end if;

  -- First publish only; edits are covered by experiences_no_duplicate_drive.
  if v_was_draft and v_row.duplicate_reason is null and exists (
    select 1 from public.experiences e
    where e.author_id = auth.uid() and e.id <> p_id and e.status in ('published', 'hidden')
      and e.company_id = v_company_id and lower(e.role_title) = lower(v_row.role_title)
      and e.opportunity_type = v_row.opportunity_type and e.graduation_year = v_row.graduation_year
  ) then
    perform public.raise_app_error('duplicate', 'You already shared an experience for this drive. Edit that one, or explain how this one is different.');
  end if;

  update public.experiences e set
    company_id = v_company_id,
    new_company_name = null,
    status = case when e.status = 'hidden' then 'hidden'::public.experience_status else 'published'::public.experience_status end,
    published_at = coalesce(e.published_at, now()),
    edited = not v_was_draft,
    version = case when v_was_draft then e.version else e.version + 1 end,
    draft_step = 5
  where e.id = p_id
  returning * into v_row;

  perform public.refresh_experience_search(p_id);
  perform public.write_audit(
    case when v_was_draft then 'experience.publish' else 'experience.update' end, 'experience', p_id::text,
    jsonb_strip_nulls(jsonb_build_object('version', v_row.version, 'duplicate_reason', v_row.duplicate_reason))
  );
  return jsonb_build_object('id', v_row.id, 'status', v_row.status, 'version', v_row.version);
end
$$;

create or replace function public.delete_experience(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.experiences;
begin
  select * into v_row from public.experiences e where e.id = p_id for update;
  if v_row.id is null or v_row.author_id is distinct from auth.uid() or not public.is_psg_user() then
    perform public.raise_app_error('forbidden', 'You can only delete your own experiences.');
  end if;
  if v_row.status = 'draft' then
    delete from public.experiences e where e.id = p_id;
  else
    update public.experiences e set status = 'removed', deleted_at = now() where e.id = p_id;
    perform public.write_audit('experience.delete', 'experience', p_id::text, jsonb_build_object('by', 'author'));
  end if;
end
$$;

-- ------------------------------------------------------------ reading
create or replace function public.record_view(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_prev timestamptz;
begin
  if not public.is_active_user() or not exists (select 1 from public.experiences e where e.id = p_id and e.status = 'published') then
    return;
  end if;
  select v.last_viewed_at into v_prev from public.experience_views v where v.user_id = auth.uid() and v.experience_id = p_id;
  insert into public.experience_views (user_id, experience_id, last_viewed_at) values (auth.uid(), p_id, now())
  on conflict (user_id, experience_id) do update set last_viewed_at = excluded.last_viewed_at;
  if v_prev is null or v_prev < now() - interval '24 hours' then
    update public.experiences e set view_count = e.view_count + 1 where e.id = p_id;
  end if;
end
$$;

-- Full experience for the detail page, author masked (D7: even admins see
-- anonymous authors only via admin_reveal_author, which is audited).
create or replace function public.get_experience(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v public.experiences;
  v_own boolean;
  v_out jsonb;
begin
  if not public.can_read_experience(p_id) then
    perform public.raise_app_error('not_found', 'This experience was removed or never existed.');
  end if;
  select * into v from public.experiences e where e.id = p_id;
  v_own := v.author_id = auth.uid();

  select jsonb_build_object(
    'id', v.id,
    'company', (select jsonb_build_object('id', c.id, 'slug', c.slug, 'name', c.name, 'is_verified', c.is_verified) from public.companies c where c.id = v.company_id),
    'role_title', v.role_title, 'opportunity_type', v.opportunity_type, 'hiring_mode', v.hiring_mode,
    'department', case when v.hide_department and not v_own then null else (select jsonb_build_object('id', d.id, 'code', d.code, 'name', d.name) from public.departments d where d.id = v.department_id) end,
    'graduation_year', v.graduation_year, 'interview_month', v.interview_month,
    'eligibility', v.eligibility, 'application_process', v.application_process, 'preparation', v.preparation, 'advice', v.advice,
    'difficulty', v.difficulty, 'outcome', v.outcome, 'is_anonymous', v.is_anonymous, 'hide_department', v.hide_department,
    'status', v.status, 'hidden_reason', case when v_own or public.is_moderator() then v.hidden_reason end,
    'published_at', v.published_at, 'updated_at', v.updated_at, 'edited', v.edited, 'version', v.version,
    'helpful_count', v.helpful_count, 'comment_count', v.comment_count, 'view_count', v.view_count,
    'author', case when v.is_anonymous and not v_own then null else (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'handle', p.handle) from public.profiles p where p.id = v.author_id) end,
    'is_owner', v_own,
    'has_voted', exists (select 1 from public.helpful_votes h where h.user_id = auth.uid() and h.experience_id = v.id),
    'has_saved', exists (select 1 from public.bookmarks b where b.user_id = auth.uid() and b.experience_id = v.id),
    'topics', coalesce((select jsonb_agg(jsonb_build_object('value', t.id, 'label', t.name) order by t.sort, t.name) from public.experience_topics et join public.topics t on t.id = et.topic_id where et.experience_id = v.id), '[]'),
    'resources', coalesce((select jsonb_agg(jsonb_build_object('title', r.title, 'url', r.url, 'kind', r.kind) order by r.position) from public.experience_resources r where r.experience_id = v.id), '[]'),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'position', r.position, 'round_type', r.round_type, 'mode', r.mode,
        'duration_minutes', r.duration_minutes, 'difficulty', r.difficulty, 'description', r.description,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'position', q.position, 'body', q.body, 'kind', q.kind,
            'topics', coalesce((select jsonb_agg(jsonb_build_object('value', t.id, 'label', t.name)) from public.question_topics qt join public.topics t on t.id = qt.topic_id where qt.question_id = q.id), '[]'),
            'also_in', (select count(distinct q2.experience_id) from public.questions q2 join public.experiences e2 on e2.id = q2.experience_id
                        where q2.body_norm = q.body_norm and q2.experience_id <> v.id and e2.status = 'published')
          ) order by q.position) from public.questions q where q.round_id = r.id), '[]')
      ) order by r.position)
      from public.experience_rounds r where r.experience_id = v.id), '[]')
  ) into v_out;
  return v_out;
end
$$;

create or replace function public.experience_facets()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with pub as (select * from public.experiences e where e.status = 'published' and public.is_active_user())
  select jsonb_build_object(
    'type',       (select coalesce(jsonb_object_agg(k, n), '{}') from (select opportunity_type::text k, count(*) n from pub group by 1) x),
    'hiring',     (select coalesce(jsonb_object_agg(k, n), '{}') from (select hiring_mode::text k, count(*) n from pub group by 1) x),
    'outcome',    (select coalesce(jsonb_object_agg(k, n), '{}') from (select outcome::text k, count(*) n from pub group by 1) x),
    'difficulty', (select coalesce(jsonb_object_agg(k, n), '{}') from (select difficulty::text k, count(*) n from pub group by 1) x),
    'year',       (select coalesce(jsonb_object_agg(k, n), '{}') from (select graduation_year::text k, count(*) n from pub group by 1) x),
    'dept',       (select coalesce(jsonb_object_agg(k, n), '{}') from (select department_id k, count(*) n from pub where not hide_department group by 1) x)
  )
$$;

-- The ONLY function callable by anon (D11): aggregates, no text, no people.
create or replace function public.get_public_stats()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  with pub as (select e.* from public.experiences e where e.status = 'published'),
  by_company as (select c.name, count(*) n from pub join public.companies c on c.id = pub.company_id group by c.name)
  select jsonb_build_object(
    'show_counts', (select count(*) from pub) >= (select s.landing_stats_threshold from public.platform_settings s where s.id),
    'experiences', (select count(*) from pub),
    'companies',   (select count(*) from by_company),
    'departments', (select count(distinct department_id) from pub where not hide_department),
    'questions',   (select count(*) from public.questions q join pub on pub.id = q.experience_id),
    'top_companies', coalesce((select jsonb_agg(jsonb_build_object('name', name, 'count', n) order by n desc, name) from (select * from by_company order by n desc, name limit 12) t), '[]')
  )
$$;

-- ------------------------------------------------------------ reports
create or replace function public.create_report(p_target_type public.report_target, p_target_id uuid, p_reason public.report_reason, p_details text default '')
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_open int;
  v_exp public.experiences;
begin
  if not public.is_active_user() then
    perform public.raise_app_error('forbidden', 'Sign in to report content.');
  end if;
  if (select count(*) from public.reports r where r.reporter_id = auth.uid() and r.created_at > now() - interval '1 day')
     >= public.setting_int('limits', 'reports_per_day') then
    perform public.raise_app_error('rate_limited', 'You’ve reached today’s report limit. Try again tomorrow.');
  end if;
  if not (
    (p_target_type = 'experience' and exists (select 1 from public.experiences e where e.id = p_target_id and e.status = 'published'))
    or (p_target_type = 'comment' and exists (select 1 from public.comments c join public.experiences e on e.id = c.experience_id where c.id = p_target_id and c.status = 'visible' and e.status = 'published'))
    or (p_target_type = 'profile' and exists (select 1 from public.profiles p where p.id = p_target_id and p.onboarded_at is not null))
  ) then
    perform public.raise_app_error('not_found', 'This content is no longer available.');
  end if;

  begin
    insert into public.reports (reporter_id, target_type, target_id, reason, details)
    values (auth.uid(), p_target_type, p_target_id, p_reason, left(coalesce(p_details, ''), 1000));
  exception when unique_violation then
    perform public.raise_app_error('duplicate', 'You’ve already reported this. Moderators will review it.');
  end;

  -- Auto-hide at threshold distinct open reports (D6)
  select count(distinct r.reporter_id) into v_open from public.reports r
  where r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'open';
  if p_target_type = 'experience' and v_open >= public.setting_int('limits', 'auto_hide_threshold') then
    update public.experiences e set status = 'hidden', hidden_reason = format('Auto-hidden after %s reports', v_open)
    where e.id = p_target_id and e.status = 'published'
    returning * into v_exp;
    if v_exp.id is not null then
      insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
      values (null, 'experience.auto_hide', 'experience', p_target_id::text, jsonb_build_object('reports', v_open));
      perform public.notify_user(v_exp.author_id, 'experience_hidden', jsonb_build_object('experience_id', v_exp.id, 'reason', v_exp.hidden_reason));
    end if;
  elsif p_target_type = 'comment' and v_open >= public.setting_int('limits', 'auto_hide_threshold') then
    update public.comments c set status = 'hidden' where c.id = p_target_id and c.status = 'visible';
  end if;
end
$$;

-- ------------------------------------------------------------ moderation
create or replace function public._content_owner(p_target_type public.report_target, p_target_id uuid)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select case p_target_type
    when 'experience' then (select e.author_id from public.experiences e where e.id = p_target_id)
    when 'comment'    then (select c.author_id from public.comments c where c.id = p_target_id)
    when 'profile'    then p_target_id
  end
$$;

-- action: hide | restore | remove (remove = admin only)
create or replace function public.mod_set_content_status(
  p_target_type public.report_target, p_target_id uuid, p_action text, p_reason text default null, p_message text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_owner uuid := public._content_owner(p_target_type, p_target_id);
  v_before jsonb;
  v_reports uuid[];
begin
  if not public.is_moderator() then
    perform public.raise_app_error('forbidden', 'Only moderators can do that.');
  end if;
  if p_action not in ('hide', 'restore', 'remove') or p_target_type = 'profile' then
    perform public.raise_app_error('invalid', 'Unsupported moderation action.');
  end if;
  if p_action = 'remove' and not public.is_admin() then
    perform public.raise_app_error('forbidden', 'Only admins can permanently remove content.');
  end if;
  if v_owner = auth.uid() then
    perform public.raise_app_error('conflict_of_interest', 'You can’t moderate your own content.');
  end if;
  if p_action in ('hide', 'remove') and char_length(trim(coalesce(p_reason, ''))) < 3 then
    perform public.raise_app_error('validation', 'Give a reason.', '{"reason": "Give a short reason."}');
  end if;
  if not public.is_admin() and exists (
    select 1 from public.reports r where r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'escalated'
  ) then
    perform public.raise_app_error('escalated', 'This item is escalated to admins.');
  end if;

  if p_target_type = 'experience' then
    select jsonb_build_object('status', e.status, 'hidden_reason', e.hidden_reason) into v_before from public.experiences e where e.id = p_target_id;
    if v_before is null then perform public.raise_app_error('not_found', 'Content not found.'); end if;
    update public.experiences e set
      status = case p_action when 'hide' then 'hidden' when 'restore' then 'published' else 'removed' end::public.experience_status,
      hidden_reason = case when p_action = 'restore' then null else left(p_reason, 300) end,
      deleted_at = case when p_action = 'remove' then now() else e.deleted_at end
    where e.id = p_target_id and e.status <> 'draft';
  else
    select jsonb_build_object('status', c.status) into v_before from public.comments c where c.id = p_target_id;
    if v_before is null then perform public.raise_app_error('not_found', 'Content not found.'); end if;
    update public.comments c set
      status = case p_action when 'hide' then 'hidden' when 'restore' then 'visible' else 'removed' end::public.comment_status
    where c.id = p_target_id;
  end if;

  with resolved as (
    update public.reports r set
      status = case when p_action = 'restore' then 'dismissed' else 'actioned' end::public.report_status,
      resolution = left(coalesce(p_reason, p_action), 300), resolved_by = auth.uid(), resolved_at = now()
    where r.target_type = p_target_type and r.target_id = p_target_id and r.status in ('open', 'escalated')
    returning r.id
  )
  select array_agg(id) into v_reports from resolved;

  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason, before, report_ids)
  values (auth.uid(), p_target_type, p_target_id, p_action, p_reason, v_before, coalesce(v_reports, '{}'));
  perform public.write_audit('moderation.' || p_action, p_target_type::text, p_target_id::text, jsonb_build_object('before', v_before, 'reason', p_reason));
  if p_action in ('hide', 'remove') then
    perform public.notify_user(v_owner, 'content_' || p_action, jsonb_build_object('target_type', p_target_type, 'target_id', p_target_id, 'message', coalesce(p_message, p_reason)));
  end if;
end
$$;

create or replace function public.mod_dismiss_reports(p_target_type public.report_target, p_target_id uuid, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    perform public.raise_app_error('forbidden', 'Only moderators can do that.');
  end if;
  if public._content_owner(p_target_type, p_target_id) = auth.uid() then
    perform public.raise_app_error('conflict_of_interest', 'You can’t moderate your own content.');
  end if;
  -- Dismissing restores auto-hidden content (D6)
  if p_target_type in ('experience', 'comment') and (
    (p_target_type = 'experience' and exists (select 1 from public.experiences e where e.id = p_target_id and e.status = 'hidden'))
    or (p_target_type = 'comment' and exists (select 1 from public.comments c where c.id = p_target_id and c.status = 'hidden'))
  ) then
    perform public.mod_set_content_status(p_target_type, p_target_id, 'restore', coalesce(p_note, 'Reports dismissed'));
    return;
  end if;
  update public.reports r set status = 'dismissed', resolution = left(coalesce(p_note, 'Dismissed'), 300), resolved_by = auth.uid(), resolved_at = now()
  where r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'open';
  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason) values (auth.uid(), p_target_type, p_target_id, 'dismiss', p_note);
  perform public.write_audit('moderation.dismiss', p_target_type::text, p_target_id::text, jsonb_build_object('note', p_note));
end
$$;

create or replace function public.mod_escalate(p_target_type public.report_target, p_target_id uuid, p_note text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_moderator() then
    perform public.raise_app_error('forbidden', 'Only moderators can do that.');
  end if;
  update public.reports r set status = 'escalated'
  where r.target_type = p_target_type and r.target_id = p_target_id and r.status = 'open';
  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason) values (auth.uid(), p_target_type, p_target_id, 'escalate', p_note);
  perform public.write_audit('moderation.escalate', p_target_type::text, p_target_id::text, jsonb_build_object('note', p_note));
end
$$;

-- Report queue. Moderators never see who reported; admins do.
create or replace function public.mod_list_reports(p_status public.report_status[] default '{open,escalated}')
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when not public.is_moderator() then null else coalesce(jsonb_agg(jsonb_build_object(
    'id', r.id, 'target_type', r.target_type, 'target_id', r.target_id, 'reason', r.reason, 'details', r.details,
    'status', r.status, 'created_at', r.created_at, 'resolution', r.resolution,
    'reporter_id', case when public.is_admin() then r.reporter_id end
  ) order by r.created_at), '[]') end
  from public.reports r where r.status = any (p_status)
$$;

-- ------------------------------------------------------------ admin
create or replace function public.admin_set_role(p_user uuid, p_role public.app_role)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_before public.app_role[];
begin
  if not public.is_admin() then
    perform public.raise_app_error('forbidden', 'Only admins can change roles.');
  end if;
  if p_user = auth.uid() then
    perform public.raise_app_error('forbidden', 'You can’t change your own role.');
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_user and p.onboarded_at is not null) then
    perform public.raise_app_error('not_found', 'No such student.');
  end if;
  if p_role is not null and exists (select 1 from public.profiles p where p.id = p_user and p.status = 'suspended') then
    perform public.raise_app_error('invalid', 'Unsuspend this student before giving them a team role.');
  end if;
  select coalesce(array_agg(r.role), '{}') into v_before from public.user_roles r where r.user_id = p_user;
  if 'admin' = any (v_before) and p_role is distinct from 'admin'
     and (select count(*) from public.user_roles r where r.role = 'admin') <= 1 then
    perform public.raise_app_error('last_admin', 'You can’t remove the last admin.');
  end if;
  delete from public.user_roles r where r.user_id = p_user;
  if p_role is not null then
    insert into public.user_roles (user_id, role, granted_by) values (p_user, p_role, auth.uid());
  end if;
  perform public.write_audit('role.set', 'user', p_user::text, jsonb_build_object('before', v_before, 'after', p_role));
end
$$;

create or replace function public.admin_suspend_user(p_user uuid, p_until timestamptz, p_reason text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then perform public.raise_app_error('forbidden', 'Only admins can suspend accounts.'); end if;
  if p_user = auth.uid() then perform public.raise_app_error('forbidden', 'You can’t suspend yourself.'); end if;
  if exists (select 1 from public.user_roles r where r.user_id = p_user and r.role = 'admin') then
    perform public.raise_app_error('forbidden', 'Remove the admin role before suspending this account.');
  end if;
  if char_length(trim(coalesce(p_reason, ''))) < 3 then
    perform public.raise_app_error('validation', 'Give a reason.', '{"reason": "Give a short reason."}');
  end if;
  if p_until is not null and p_until <= now() then
    perform public.raise_app_error('validation', 'End date must be in the future.', '{"until": "Choose a future date."}');
  end if;
  update public.profiles p set status = 'suspended', suspended_until = p_until, suspension_reason = left(p_reason, 300) where p.id = p_user;
  delete from public.user_roles r where r.user_id = p_user;
  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason) values (auth.uid(), 'profile', p_user, 'suspend_user', p_reason);
  perform public.write_audit('user.suspend', 'user', p_user::text, jsonb_build_object('until', p_until, 'reason', p_reason));
  perform public.notify_user(p_user, 'account_suspended', jsonb_build_object('until', p_until, 'reason', p_reason));
end
$$;

create or replace function public.admin_unsuspend_user(p_user uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then perform public.raise_app_error('forbidden', 'Only admins can do that.'); end if;
  update public.profiles p set status = 'active', suspended_until = null, suspension_reason = null where p.id = p_user;
  insert into public.moderation_actions (actor_id, target_type, target_id, action) values (auth.uid(), 'profile', p_user, 'unsuspend_user');
  perform public.write_audit('user.unsuspend', 'user', p_user::text, '{}');
end
$$;

-- D7: the only way to unmask an anonymous author. Reason required, audited.
create or replace function public.admin_reveal_author(p_experience_id uuid, p_reason text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_out jsonb;
begin
  if not public.is_admin() then perform public.raise_app_error('forbidden', 'Only admins can reveal authors.'); end if;
  if char_length(trim(coalesce(p_reason, ''))) < 5 then
    perform public.raise_app_error('validation', 'Explain why.', '{"reason": "Give a reason (5+ characters). It is logged."}');
  end if;
  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'handle', p.handle)
    into v_out
  from public.experiences e left join public.profiles p on p.id = e.author_id
  where e.id = p_experience_id;
  if v_out is null then perform public.raise_app_error('not_found', 'Experience not found.'); end if;
  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason) values (auth.uid(), 'experience', p_experience_id, 'reveal_author', p_reason);
  perform public.write_audit('experience.unmask', 'experience', p_experience_id::text, jsonb_build_object('reason', p_reason));
  return v_out;
end
$$;

-- Admin user list. The only place emails are returned (admin-only, D8).
create or replace function public.admin_list_users(p_q text default '', p_limit int default 50, p_offset int default 0)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when not public.is_admin() then null else coalesce(jsonb_agg(row_to_json(x)::jsonb), '[]') end
  from (
    select p.id, u.email, p.full_name, p.handle, p.department_id, p.graduation_year, p.status, p.suspended_until, p.created_at,
           (select array_agg(r.role) from public.user_roles r where r.user_id = p.id) as roles
    from public.profiles p join auth.users u on u.id = p.id
    where coalesce(p_q, '') = '' or p.full_name ilike '%' || p_q || '%' or p.handle ilike '%' || p_q || '%' or u.email ilike '%' || p_q || '%'
    order by p.created_at desc
    limit least(greatest(p_limit, 1), 200) offset greatest(p_offset, 0)
  ) x
$$;

create or replace function public.admin_update_settings(p jsonb)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_before public.platform_settings;
  v_after public.platform_settings;
begin
  if not public.is_admin() then perform public.raise_app_error('forbidden', 'Only admins can change settings.'); end if;
  select * into v_before from public.platform_settings s where s.id for update;
  if p ? 'limits' and exists (
    select 1 from jsonb_each(p -> 'limits') l
    where l.key not in ('publish_per_day', 'comments_per_hour', 'reports_per_day', 'auto_hide_threshold')
       or jsonb_typeof(l.value) <> 'number' or (l.value)::int not between 1 and 1000
  ) then
    perform public.raise_app_error('validation', 'Limits must be whole numbers between 1 and 1000.', '{"limits": "Use 1–1000."}');
  end if;
  if p ? 'announcement' and char_length(coalesce(p -> 'announcement' ->> 'text', '')) > 280 then
    perform public.raise_app_error('validation', 'Announcement is too long.', '{"announcement": "Use at most 280 characters."}');
  end if;
  update public.platform_settings s set
    announcement = case when p ? 'announcement' then s.announcement || (p -> 'announcement') else s.announcement end,
    flags = case when p ? 'flags' then s.flags || (select coalesce(jsonb_object_agg(k, v), '{}') from jsonb_each(p -> 'flags') f(k, v) where k in ('comments', 'anonymous_posting', 'new_companies') and jsonb_typeof(v) = 'boolean') else s.flags end,
    limits = case when p ? 'limits' then s.limits || (p -> 'limits') else s.limits end,
    landing_stats_threshold = coalesce((p ->> 'landing_stats_threshold')::int, s.landing_stats_threshold),
    updated_by = auth.uid()
  where s.id
  returning * into v_after;
  perform public.write_audit('settings.update', 'settings', null, jsonb_build_object('before', to_jsonb(v_before), 'after', to_jsonb(v_after)));
  return to_jsonb(v_after);
end
$$;

create or replace function public.admin_merge_companies(p_source uuid, p_target uuid)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_src public.companies;
  v_moved int;
begin
  if not public.is_admin() then perform public.raise_app_error('forbidden', 'Only admins can merge companies.'); end if;
  if p_source = p_target then perform public.raise_app_error('invalid', 'Choose two different companies.'); end if;
  select * into v_src from public.companies c where c.id = p_source and c.merged_into_id is null for update;
  if v_src.id is null or not exists (select 1 from public.companies c where c.id = p_target and c.merged_into_id is null) then
    perform public.raise_app_error('not_found', 'Company not found.');
  end if;
  update public.experiences e set company_id = p_target where e.company_id = p_source;
  get diagnostics v_moved = row_count;
  update public.company_aliases a set company_id = p_target
  where a.company_id = p_source and not exists (select 1 from public.company_aliases b where b.company_id = p_target and lower(b.alias) = lower(a.alias));
  update public.companies c set merged_into_id = p_target where c.id = p_source;
  insert into public.company_aliases (company_id, alias) values (p_target, left(v_src.name, 60)) on conflict do nothing;
  perform public.refresh_experience_search(e.id) from public.experiences e where e.company_id = p_target;
  perform public.write_audit('company.merge', 'company', p_source::text, jsonb_build_object('into', p_target, 'experiences_moved', v_moved));
  return jsonb_build_object('moved', v_moved, 'redirect_slug', (select c.slug from public.companies c where c.id = p_target));
end
$$;

-- Audit every company write made outside the merge RPC. SECURITY DEFINER so
-- clients never need EXECUTE on write_audit() (which would let them forge
-- audit rows). A merge therefore logs company.merge and company.update.
create or replace function public.audit_company_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (
    auth.uid(),
    case tg_op when 'INSERT' then 'company.create' else 'company.update' end, 'company', new.id::text,
    jsonb_build_object('before', case when tg_op = 'UPDATE' then to_jsonb(old) end, 'after', to_jsonb(new))
  );
  return null;
end
$$;
create trigger audit_company_change after insert or update on public.companies for each row execute function public.audit_company_change();
