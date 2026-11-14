-- =====================================================================
-- Roundwise · 0500 · Share wizard on the real database (Phase 5)
-- Aligns the write path with the wizard's contract (src/api/drafts.js):
--   * company by slug (merged companies resolve to their target)
--   * draft_max_step, duplicate_of, `confirmed` alias
--   * eligibility sanitised to known keys
--   * field-level error paths: rounds.{i}.description, rounds.{i}.questions.{j}.body,
--     resources.{i}.title / url, company, confirmed …
--   * get_experience_for_editor(): owner-only full row for the wizard
--   * delete_draft(): hard-deletes drafts only
-- Supersedes _apply_experience_payload and publish_experience from 0250.
-- =====================================================================

alter table public.experiences
  add column draft_max_step smallint not null default 1 check (draft_max_step between 1 and 5);

-- Resolve a company slug to the live company id (following merges).
create or replace function public._company_id_for_slug(p_slug text)
returns uuid
language sql stable security definer
set search_path = ''
as $$
  select coalesce(c.merged_into_id, c.id) from public.companies c where c.slug = p_slug
$$;

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
  v_company uuid;
  v_el jsonb := p -> 'eligibility';
  v_eligibility jsonb;
  v_cgpa numeric;
  v_dup uuid;
  v_step smallint;
begin
  if jsonb_array_length(coalesce(p -> 'rounds', '[]')) > 12 then
    perform public.raise_app_error('validation', 'Too many rounds.', '{"rounds": "You can add up to 12 rounds."}');
  end if;
  v_topics := array(select distinct jsonb_array_elements_text(coalesce(p -> 'topics', '[]')));
  if cardinality(v_topics) > 15 then
    perform public.raise_app_error('validation', 'Too many topics.', '{"topics": "Pick up to 15 topics."}');
  end if;

  -- company: id, or slug (wizard), else a new name
  v_company := coalesce(nullif(p ->> 'company_id', '')::uuid, public._company_id_for_slug(nullif(p ->> 'company_slug', '')));

  -- eligibility: keep known keys only, typed and bounded
  if jsonb_typeof(v_el) = 'object' then
    v_cgpa := case when (v_el ->> 'cgpa') ~ '^\d{1,2}(\.\d{1,2})?$' then (v_el ->> 'cgpa')::numeric end;
    v_eligibility := jsonb_strip_nulls(jsonb_build_object(
      'cgpa', case when v_cgpa between 0 and 10 then v_cgpa end,
      'branches', (select coalesce(jsonb_agg(b), '[]') from jsonb_array_elements_text(case when jsonb_typeof(v_el -> 'branches') = 'array' then v_el -> 'branches' else '[]' end) b
                   where exists (select 1 from public.departments d where d.id = b)),
      'backlogs', case when v_el ->> 'backlogs' in ('no', 'yes', 'unknown') then v_el ->> 'backlogs' else 'unknown' end,
      'other', nullif(left(trim(coalesce(v_el ->> 'other', '')), 300), '')
    ));
    if v_eligibility -> 'cgpa' is null and jsonb_array_length(v_eligibility -> 'branches') = 0
       and v_eligibility ->> 'backlogs' = 'unknown' and v_eligibility -> 'other' is null then
      v_eligibility := null;
    end if;
  end if;

  -- duplicate_of may only point at one of the author's own experiences
  select e.id into v_dup from public.experiences e
  where e.id = nullif(p ->> 'duplicate_of', '')::uuid
    and e.author_id = (select x.author_id from public.experiences x where x.id = p_id);

  v_step := greatest(1, least(5, coalesce(nullif(p ->> 'draft_step', '')::smallint, 1)));

  update public.experiences e set
    company_id          = v_company,
    new_company_name    = case when v_company is null then nullif(left(trim(p ->> 'new_company_name'), 120), '') end,
    role_title          = nullif(trim(p ->> 'role_title'), ''),
    opportunity_type    = nullif(p ->> 'opportunity_type', '')::public.opportunity_type,
    hiring_mode         = nullif(p ->> 'hiring_mode', '')::public.hiring_mode,
    department_id       = nullif(p ->> 'department_id', ''),
    graduation_year     = nullif(p ->> 'graduation_year', '')::smallint,
    interview_month     = date_trunc('month', nullif(p ->> 'interview_month', '')::date)::date,
    eligibility         = v_eligibility,
    application_process = nullif(trim(p ->> 'application_process'), ''),
    preparation         = nullif(trim(p ->> 'preparation'), ''),
    advice              = nullif(trim(p ->> 'advice'), ''),
    difficulty          = nullif(p ->> 'difficulty', '')::smallint,
    outcome             = nullif(p ->> 'outcome', '')::public.outcome,
    is_anonymous        = coalesce((p ->> 'is_anonymous')::boolean, false),
    hide_department     = coalesce((p ->> 'is_anonymous')::boolean, false) and coalesce((p ->> 'hide_department')::boolean, false),
    confirmed_own       = coalesce((p ->> 'confirmed_own')::boolean, (p ->> 'confirmed')::boolean, false),
    duplicate_of        = v_dup,
    duplicate_reason    = nullif(left(trim(p ->> 'duplicate_reason'), 200), ''),
    draft_step          = v_step,
    draft_max_step      = greatest(e.draft_max_step, v_step, least(5, coalesce(nullif(p ->> 'draft_max_step', '')::smallint, 1)))
  where e.id = p_id;

  delete from public.experience_rounds r where r.experience_id = p_id;  -- cascades to questions
  delete from public.experience_topics t where t.experience_id = p_id;
  delete from public.experience_resources r where r.experience_id = p_id;

  for v_round in select * from jsonb_array_elements(coalesce(p -> 'rounds', '[]')) loop
    r_pos := r_pos + 1;
    if jsonb_array_length(coalesce(v_round -> 'questions', '[]')) > 25 then
      perform public.raise_app_error('validation', 'Too many questions.',
        jsonb_build_object(format('rounds.%s.questions', r_pos - 1), 'Up to 25 questions per round.')::text);
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
      continue when char_length(trim(coalesce(v_q ->> 'body', ''))) < 3;  -- empty rows in a draft
      q_pos := q_pos + 1;
      insert into public.questions (experience_id, round_id, position, body, kind)
      values (p_id, v_round_id, q_pos, trim(v_q ->> 'body'), coalesce(nullif(v_q ->> 'kind', ''), 'technical')::public.question_kind)
      returning id into v_q_id;
      insert into public.question_topics (question_id, topic_id)
      select v_q_id, t from (select distinct t from jsonb_array_elements_text(coalesce(v_q -> 'topics', '[]')) t limit 5) x
      where exists (select 1 from public.topics tp where tp.id = x.t);
    end loop;
  end loop;

  insert into public.experience_topics (experience_id, topic_id)
  select p_id, t from unnest(v_topics) t where exists (select 1 from public.topics x where x.id = t);

  insert into public.experience_resources (experience_id, position, title, url, kind)
  select p_id, ord, trim(r ->> 'title'), trim(r ->> 'url'), coalesce(nullif(r ->> 'kind', ''), 'other')::public.resource_kind
  from jsonb_array_elements(coalesce(p -> 'resources', '[]')) with ordinality as x(r, ord)
  where nullif(trim(r ->> 'url'), '') is not null and char_length(trim(coalesce(r ->> 'title', ''))) >= 1
    and trim(r ->> 'url') ~ '^https://[^\s<>"]+$';
end
$$;

-- Field errors for a resource list *before* it is applied (the apply step
-- skips invalid resources, so publish must catch them from the payload).
create or replace function public._resource_errors(p jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, v), '{}') from (
    select format('resources.%s.title', ord - 1) k, 'Add a title for this resource.' v
    from jsonb_array_elements(coalesce(p -> 'resources', '[]')) with ordinality as x(r, ord)
    where char_length(trim(coalesce(r ->> 'title', ''))) < 2 and (nullif(trim(r ->> 'url'), '') is not null or nullif(trim(r ->> 'title'), '') is not null)
    union all
    select format('resources.%s.url', ord - 1), 'Use a full https:// link.'
    from jsonb_array_elements(coalesce(p -> 'resources', '[]')) with ordinality as x(r, ord)
    where (nullif(trim(r ->> 'url'), '') is not null or nullif(trim(r ->> 'title'), '') is not null)
      and coalesce(trim(r ->> 'url'), '') !~ '^https://[^\s<>"]+$'
  ) e
$$;

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
  v_q record;
  v_company_id uuid;
  v_created jsonb;
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
    v_errors := public._resource_errors(p_changes);
    perform public._apply_experience_payload(p_id, p_changes);
    select * into v_row from public.experiences e where e.id = p_id;
  end if;

  -- Server-side validation mirrors the wizard's zod schema (spec §9.9).
  -- Keys match the wizard's field paths so it can jump to the exact field.
  if v_row.company_id is null and char_length(coalesce(v_row.new_company_name, '')) < 2 then
    v_errors := v_errors || '{"company": "Choose the company, or add it if it isn’t listed."}';
  end if;
  if v_row.role_title is null then v_errors := v_errors || '{"role_title": "Use 2–100 characters for the role title."}'; end if;
  if v_row.opportunity_type is null then v_errors := v_errors || '{"opportunity_type": "Choose the opportunity type."}'; end if;
  if v_row.hiring_mode is null then v_errors := v_errors || '{"hiring_mode": "Choose the hiring mode."}'; end if;
  if v_row.interview_month is null then
    v_errors := v_errors || '{"interview_month": "Choose the month you interviewed."}';
  elsif v_row.interview_month > date_trunc('month', now())::date then
    v_errors := v_errors || '{"interview_month": "That month is in the future."}';
  end if;
  if v_row.department_id is null then v_errors := v_errors || '{"department_id": "Choose your department."}'; end if;
  if v_row.graduation_year is null then v_errors := v_errors || '{"graduation_year": "Choose your batch."}'; end if;
  if v_row.difficulty is null then v_errors := v_errors || '{"difficulty": "Rate the overall difficulty."}'; end if;
  if v_row.outcome is null then v_errors := v_errors || '{"outcome": "Choose your result."}'; end if;
  if not v_row.confirmed_own then v_errors := v_errors || '{"confirmed": "Confirm this is your own experience to publish."}'; end if;
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
    v_errors := v_errors || jsonb_build_object(format('rounds.%s.description', v_round.position - 1), 'Describe this round in at least 30 characters, or add a question.');
  end loop;
  for v_q in
    select r.position as rp, q.position as qp from public.questions q join public.experience_rounds r on r.id = q.round_id
    where q.experience_id = p_id and char_length(trim(q.body)) < 5
  loop
    v_errors := v_errors || jsonb_build_object(format('rounds.%s.questions.%s.body', v_q.rp - 1, v_q.qp - 1), 'Write the question, or remove it.');
  end loop;
  if v_errors <> '{}' then
    perform public.raise_app_error('validation', 'A few things need fixing before this can go live.', v_errors::text);
  end if;

  if v_was_draft and (
    select count(*) from public.experiences e
    where e.author_id = auth.uid() and e.status <> 'draft' and e.published_at > now() - interval '1 day'
  ) >= public.setting_int('limits', 'publish_per_day') then
    perform public.raise_app_error('rate_limited',
      format('You’ve published %s experiences in the last 24 hours. Try again tomorrow; your draft is saved.', public.setting_int('limits', 'publish_per_day')));
  end if;

  v_company_id := v_row.company_id;
  if v_company_id is null then
    select coalesce(c.merged_into_id, c.id) into v_company_id from public.companies c
    where lower(c.name) = lower(trim(v_row.new_company_name))
       or exists (select 1 from public.company_aliases a where a.company_id = c.id and lower(a.alias) = lower(trim(v_row.new_company_name)))
    limit 1;
    if v_company_id is null then
      if not public.setting_flag('new_companies') then
        perform public.raise_app_error('validation', 'New companies can’t be added right now.', '{"company": "Pick a company from the list."}');
      end if;
      v_base := coalesce(nullif(public.slugify(v_row.new_company_name), ''), 'company');
      v_slug := v_base;
      while exists (select 1 from public.companies c where c.slug = v_slug) loop
        v_n := v_n + 1;
        v_slug := v_base || '-' || v_n;
      end loop;
      insert into public.companies (name, slug, is_verified, created_by)
      values (trim(v_row.new_company_name), v_slug, false, auth.uid())
      returning id into v_company_id;  -- audited by the audit_company_change trigger
      v_created := jsonb_build_object('slug', v_slug, 'name', trim(v_row.new_company_name));
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
    draft_step = 5,
    draft_max_step = 5
  where e.id = p_id
  returning * into v_row;

  perform public.refresh_experience_search(p_id);
  perform public.write_audit(
    case when v_was_draft then 'experience.publish' else 'experience.update' end, 'experience', p_id::text,
    jsonb_strip_nulls(jsonb_build_object('version', v_row.version, 'anonymous', v_row.is_anonymous,
      'duplicate_of', v_row.duplicate_of, 'duplicate_reason', v_row.duplicate_reason))
  );
  return jsonb_build_object(
    'id', v_row.id, 'status', v_row.status, 'version', v_row.version, 'published_at', v_row.published_at,
    'updated_at', v_row.updated_at, 'edited', v_row.edited, 'created_company', v_created
  );
end
$$;

-- Owner-only full row in the shape the wizard's fromRow() expects.
create or replace function public.get_experience_for_editor(p_id uuid)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v public.experiences;
begin
  select * into v from public.experiences e where e.id = p_id;
  if v.id is null or v.status = 'removed' or not public.is_psg_user() then
    perform public.raise_app_error('not_found', 'This draft doesn’t exist or was deleted.');
  end if;
  if v.author_id is distinct from auth.uid() then
    perform public.raise_app_error('forbidden', 'You can only edit your own experiences.');
  end if;
  return jsonb_build_object(
    'id', v.id, 'status', v.status,
    'company_slug', (select c.slug from public.companies c where c.id = v.company_id),
    'company', (select jsonb_build_object('slug', c.slug, 'name', c.name) from public.companies c where c.id = v.company_id),
    'new_company_name', v.new_company_name,
    'role_title', v.role_title, 'opportunity_type', v.opportunity_type, 'hiring_mode', v.hiring_mode,
    'interview_month', to_char(v.interview_month, 'YYYY-MM-DD'),
    'department_id', v.department_id, 'graduation_year', v.graduation_year,
    'eligibility', v.eligibility, 'application_process', v.application_process,
    'preparation', v.preparation, 'advice', v.advice, 'difficulty', v.difficulty, 'outcome', v.outcome,
    'is_anonymous', v.is_anonymous, 'hide_department', v.hide_department, 'confirmed', v.confirmed_own,
    'duplicate_of', v.duplicate_of, 'duplicate_reason', v.duplicate_reason,
    'draft_step', v.draft_step, 'draft_max_step', v.draft_max_step,
    'published_at', v.published_at, 'updated_at', v.updated_at, 'created_at', v.created_at, 'version', v.version,
    'topics', coalesce((select jsonb_agg(t.topic_id order by t.topic_id) from public.experience_topics t where t.experience_id = v.id), '[]'),
    'resources', coalesce((select jsonb_agg(jsonb_build_object('title', r.title, 'url', r.url, 'kind', r.kind) order by r.position)
                           from public.experience_resources r where r.experience_id = v.id), '[]'),
    'rounds', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'position', r.position, 'round_type', r.round_type, 'mode', r.mode,
        'duration_minutes', r.duration_minutes, 'difficulty', r.difficulty, 'description', r.description,
        'questions', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', q.id, 'body', q.body, 'kind', q.kind,
            'topics', coalesce((select jsonb_agg(qt.topic_id) from public.question_topics qt where qt.question_id = q.id), '[]')
          ) order by q.position) from public.questions q where q.round_id = r.id), '[]')
      ) order by r.position)
      from public.experience_rounds r where r.experience_id = v.id), '[]')
  );
end
$$;

-- The wizard's "Delete draft" must never remove a published experience.
create or replace function public.delete_draft(p_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_psg_user() then
    perform public.raise_app_error('unauthenticated', 'Sign in first.');
  end if;
  if not exists (select 1 from public.experiences e where e.id = p_id and e.author_id = auth.uid()) then
    perform public.raise_app_error('not_found', 'This draft doesn’t exist or was deleted.');
  end if;
  delete from public.experiences e where e.id = p_id and e.author_id = auth.uid() and e.status = 'draft';
  if not found then
    perform public.raise_app_error('forbidden', 'Only drafts can be deleted here.');
  end if;
end
$$;

revoke execute on function public._company_id_for_slug(text), public._resource_errors(jsonb) from public, anon, authenticated;
revoke execute on function public.get_experience_for_editor(uuid), public.delete_draft(uuid) from public, anon;
grant execute on function public.get_experience_for_editor(uuid), public.delete_draft(uuid) to authenticated;
