-- =====================================================================
-- PSG InterviewShare · 0810 · Admin on the real database (Phase 9, part 2)
-- Shapes match the prototype's src/api/admin.js. Admin-only, audited,
-- and D7-safe: no admin view reveals an anonymous author except
-- admin_unmask (reason required, audited).
-- =====================================================================

alter table public.companies
  add column merged_at timestamptz,
  add column merged_by uuid references public.profiles (id) on delete set null;

create or replace function public._require_admin()
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_admin() then perform public.raise_app_error('forbidden', 'Only admins can do that.'); end if;
end
$$;

create or replace function public._primary_role(p_user uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when exists (select 1 from public.user_roles where user_id = p_user and role = 'admin') then 'admin'
              when exists (select 1 from public.user_roles where user_id = p_user and role = 'moderator') then 'moderator'
              else 'student' end
$$;

-- Lazily lift suspensions whose end date has passed (audited as System).
create or replace function public._expire_suspensions()
returns void language plpgsql security definer set search_path = '' as $$
declare
  r record;
begin
  for r in update public.profiles set status = 'active', suspended_until = null, suspension_reason = null, suspended_by = null, suspended_at = null
           where status = 'suspended' and suspended_until is not null and suspended_until < now() returning id loop
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (null, 'user.unsuspend', 'user', r.id::text, '{"reason": "Suspension ended", "before": "suspended", "after": "active"}');
  end loop;
end
$$;

-- ------------------------------------------------------------ overview
create or replace function public.admin_overview()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_summaries jsonb[];
begin
  perform public._require_admin();
  select coalesce(array_agg(s), '{}') into v_summaries from public._mod_all_summaries() s;
  return jsonb_build_object(
    'kpis', jsonb_build_object(
      'students', (select count(*) from public.profiles where onboarded_at is not null),
      'students_new_7d', (select count(*) from public.profiles where created_at >= now() - interval '7 days'),
      'students_new_prev_7d', (select count(*) from public.profiles where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days'),
      'published', (select count(*) from public.experiences where status = 'published'),
      'published_new_7d', (select count(*) from public.experiences where status = 'published' and published_at >= now() - interval '7 days'),
      'published_new_prev_7d', (select count(*) from public.experiences where status = 'published' and published_at >= now() - interval '14 days' and published_at < now() - interval '7 days'),
      'open_reports', (select count(*) from public.reports where status in ('open', 'escalated')),
      'open_items', (select count(*) from unnest(v_summaries) s where (s ->> 'active_count')::int > 0),
      'escalated_items', (select count(*) from unnest(v_summaries) s where (s ->> 'active_count')::int > 0 and s ->> 'state' = 'escalated'),
      'median_resolution_ms', (select round(extract(epoch from percentile_cont(0.5) within group (order by resolved_at - created_at)) * 1000)
                               from public.reports where resolved_at >= now() - interval '90 days'),
      'resolved_90d', (select count(*) from public.reports where resolved_at >= now() - interval '90 days')),
    'signups', (select jsonb_agg(jsonb_build_object('start', w, 'value', (select count(*) from public.profiles p where p.created_at >= w and p.created_at < w + interval '1 week'),
                  'current', w = date_trunc('week', now())) order by w)
                from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w),
    'publishes', (select jsonb_agg(jsonb_build_object('start', w, 'value', (select count(*) from public.experiences e where e.status = 'published' and e.published_at >= w and e.published_at < w + interval '1 week'),
                  'current', w = date_trunc('week', now())) order by w)
                from generate_series(date_trunc('week', now()) - interval '7 weeks', date_trunc('week', now()), interval '1 week') w),
    'top_companies', coalesce((select jsonb_agg(jsonb_build_object('slug', c.slug, 'name', c.name, 'count', x.n) order by x.n desc, c.name)
                      from (select company_id, count(*) n from public.experiences where status = 'published' and published_at >= now() - interval '30 days'
                            group by 1 order by 2 desc limit 6) x join public.companies c on c.id = x.company_id), '[]'),
    'attention', jsonb_build_object(
      'escalated', (select count(*) from unnest(v_summaries) s where (s ->> 'active_count')::int > 0 and s ->> 'state' = 'escalated'),
      'open', (select count(*) from unnest(v_summaries) s where (s ->> 'active_count')::int > 0),
      'unverified_companies', (select count(*) from public.companies where not is_verified and merged_into_id is null),
      'suspended_users', (select count(*) from public.profiles where status = 'suspended'))
  );
end
$$;

-- ------------------------------------------------------------ users
create or replace function public._admin_user_row(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id, 'full_name', p.full_name, 'handle', p.handle, 'email', u.email,
    'department', d.code, 'department_id', p.department_id, 'graduation_year', p.graduation_year,
    'role', public._primary_role(p.id),
    'status', case when p.status = 'suspended' then 'suspended' when p.onboarded_at is not null then 'active' else 'onboarding' end,
    'created_at', p.created_at,
    'published_count', (select count(*) from public.experiences e where e.author_id = p.id and e.status = 'published'),
    'comment_count', (select count(*) from public.comments c where c.author_id = p.id and c.status = 'visible'),
    'suspension', case when p.status = 'suspended' then jsonb_build_object('until', p.suspended_until, 'reason', p.suspension_reason,
                    'by', case when p.suspended_by is null then null else public._name_of(p.suspended_by) end, 'at', p.suspended_at) end)
  from public.profiles p join auth.users u on u.id = p.id left join public.departments d on d.id = p.department_id
  where p.id = p_id
$$;

-- p: { q, role, status, dept, batch }
create or replace function public.admin_users(p jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_items jsonb;
  q text := lower(trim(coalesce(p ->> 'q', '')));
begin
  perform public._require_admin();
  perform public._expire_suspensions();
  select coalesce(jsonb_agg(r order by r ->> 'created_at' desc), '[]') into v_items
  from (select public._admin_user_row(pr.id) r from public.profiles pr) x
  where (q = '' or lower(r ->> 'full_name') like '%' || q || '%' or lower(coalesce(r ->> 'handle', '')) like '%' || q || '%' or lower(r ->> 'email') like '%' || q || '%')
    and (coalesce(p ->> 'role', 'all') = 'all' or r ->> 'role' = p ->> 'role')
    and (coalesce(p ->> 'status', 'all') = 'all' or r ->> 'status' = p ->> 'status')
    and (coalesce(p ->> 'dept', 'all') = 'all' or r ->> 'department_id' = p ->> 'dept')
    and (coalesce(p ->> 'batch', 'all') = 'all' or r ->> 'graduation_year' = p ->> 'batch');
  return jsonb_build_object('items', v_items, 'total', jsonb_array_length(v_items));
end
$$;

create or replace function public.admin_user_facets()
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'departments', coalesce((select jsonb_agg(jsonb_build_object('value', d.id, 'label', d.code) order by d.code)
                    from public.departments d where exists (select 1 from public.profiles p where p.department_id = d.id)), '[]'),
    'batches', coalesce((select jsonb_agg(jsonb_build_object('value', y::text, 'label', '’' || right(y::text, 2) || ' (' || y || ')') order by y)
                from (select distinct graduation_year y from public.profiles where graduation_year is not null) x), '[]'));
end
$$;

create or replace function public.admin_user_detail(p_id uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_row jsonb;
begin
  perform public._require_admin();
  perform public._expire_suspensions();
  v_row := public._admin_user_row(p_id);
  if v_row is null then perform public.raise_app_error('not_found', 'This user doesn’t exist.'); end if;
  return v_row || (select jsonb_build_object(
    'bio', p.bio, 'onboarded_at', p.onboarded_at, 'profile_visibility', p.profile_visibility,
    -- named experiences only: anonymous ones are counted, never listed (D7)
    'experiences', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'title', public._target_preview('experience', e.id) ->> 'title',
                    'status', e.status, 'published_at', e.published_at, 'helpful_count', e.helpful_count) order by e.published_at desc nulls last)
                  from public.experiences e where e.author_id = p.id and e.status not in ('draft') and not e.is_anonymous), '[]'),
    'anonymous_count', (select count(*) from public.experiences e where e.author_id = p.id and e.status <> 'draft' and e.is_anonymous),
    'helpful_received', (select coalesce(sum(helpful_count), 0) from public.experiences e where e.author_id = p.id and e.status <> 'draft'),
    -- reports on anonymous content are excluded so this view can't unmask anyone
    'reports_against', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'key', r.target_type::text || ':' || r.target_id::text, 'target_type', r.target_type,
                         'title', public._target_preview(r.target_type, r.target_id) ->> 'title', 'reason', r.reason, 'status', r.status, 'created_at', r.created_at)
                         order by r.created_at desc)
                       from public.reports r
                       where public._target_author(r.target_type, r.target_id) = p.id and not public._target_masked(r.target_type, r.target_id)), '[]'),
    'activity', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'actor', public._name_of(l.actor_id), 'metadata', l.metadata, 'created_at', l.created_at)
                  order by l.created_at desc) from (select * from public.audit_logs where entity = 'user' and entity_id = p.id::text order by created_at desc limit 8) l), '[]'),
    'is_self', p.id = auth.uid(),
    'is_last_admin', public._primary_role(p.id) = 'admin' and (select count(*) from public.user_roles where role = 'admin') <= 1)
  from public.profiles p where p.id = p_id);
end
$$;

-- days: 1 | 7 | 30 | 0 (until lifted)
create or replace function public._suspend(p_user uuid, p_days int, p_reason text, p_source jsonb default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fields jsonb := '{}';
  v_until timestamptz;
  v_before jsonb;
begin
  if p_days is null or p_days not in (0, 1, 7, 30) then v_fields := v_fields || '{"days": "Choose how long the suspension lasts."}'; end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    v_fields := v_fields || '{"reason": "Give a reason of at least 10 characters. The student sees it when they sign in."}';
  elsif char_length(trim(p_reason)) > 300 then
    v_fields := v_fields || '{"reason": "Keep the reason under 300 characters."}';
  end if;
  if v_fields <> '{}' then perform public.raise_app_error('validation', 'Check the highlighted fields.', v_fields::text); end if;
  if p_user is null or not exists (select 1 from public.profiles where id = p_user) then perform public.raise_app_error('not_found', 'This user doesn’t exist.'); end if;
  if p_user = auth.uid() then perform public.raise_app_error('forbidden', 'You can’t suspend yourself.'); end if;
  if public._primary_role(p_user) = 'admin' then perform public.raise_app_error('forbidden', 'Admins can’t be suspended. Change their role first.'); end if;
  select jsonb_build_object('status', status, 'suspended_until', suspended_until) into v_before from public.profiles where id = p_user;
  v_until := case when p_days = 0 then null else now() + make_interval(days => p_days) end;
  update public.profiles set status = 'suspended', suspended_until = v_until, suspension_reason = trim(p_reason), suspended_by = auth.uid(), suspended_at = now()
  where id = p_user;
  delete from public.user_roles where user_id = p_user;
  perform public.write_audit('user.suspend', 'user', p_user::text, jsonb_strip_nulls(jsonb_build_object('until', v_until, 'reason', trim(p_reason), 'before', v_before,
    'after', jsonb_build_object('status', 'suspended', 'suspended_until', v_until), 'source', p_source)));
  perform public.notify_user(p_user, 'account_suspended', jsonb_build_object('until', v_until, 'reason', trim(p_reason)));
  return jsonb_build_object('until', v_until);
end
$$;

create or replace function public.admin_suspend(p_user uuid, p_days int, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return public._suspend(p_user, p_days, p_reason);
end
$$;

create or replace function public.admin_lift_suspension(p_user uuid)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_before jsonb;
begin
  perform public._require_admin();
  select jsonb_build_object('status', status, 'suspended_until', suspended_until) into v_before from public.profiles where id = p_user;
  if v_before is null then perform public.raise_app_error('not_found', 'This user doesn’t exist.'); end if;
  if v_before ->> 'status' <> 'suspended' then perform public.raise_app_error('conflict', 'This account isn’t suspended.'); end if;
  update public.profiles set status = 'active', suspended_until = null, suspension_reason = null, suspended_by = null, suspended_at = null where id = p_user;
  perform public.write_audit('user.unsuspend', 'user', p_user::text, jsonb_build_object('before', v_before, 'after', jsonb_build_object('status', 'active')));
  return true;
end
$$;

-- ------------------------------------------------------------ companies
create or replace function public._source_out(p public.description_source)
returns text language sql immutable set search_path = '' as $$ select case p when 'official_site' then 'company_website' else p::text end $$;

create or replace function public._admin_company_row(p_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'id', c.id, 'slug', c.slug, 'name', c.name,
    'aliases', coalesce((select jsonb_agg(a.alias order by a.alias) from public.company_aliases a where a.company_id = c.id), '[]'),
    'industry', coalesce(c.industry, ''), 'website', coalesce(c.website, ''), 'description', coalesce(c.description, ''),
    'description_source', public._source_out(c.description_source), 'is_verified', c.is_verified,
    'merged_into', (select jsonb_build_object('id', t.id, 'slug', t.slug, 'name', t.name) from public.companies t where t.id = c.merged_into_id),
    'merged_at', c.merged_at,
    'experience_count', (select count(*) from public.experiences e where e.company_id = c.id and e.status not in ('draft', 'removed')),
    'published_count', (select count(*) from public.experiences e where e.company_id = c.id and e.status = 'published'),
    'created_by', case when c.created_by is null then null else public._name_of(c.created_by) end,
    'created_at', c.created_at)
  from public.companies c where c.id = p_id
$$;

-- status: all | verified | unverified | merged
create or replace function public.admin_companies(p_q text default '', p_status text default 'all')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  q text := lower(trim(coalesce(p_q, '')));
begin
  perform public._require_admin();
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(public._admin_company_row(c.id) order by lower(c.name)) from public.companies c
      where (case when p_status = 'merged' then c.merged_into_id is not null else c.merged_into_id is null end)
        and (p_status <> 'verified' or c.is_verified) and (p_status <> 'unverified' or not c.is_verified)
        and (q = '' or lower(c.name) like '%' || q || '%' or c.slug like '%' || q || '%'
             or exists (select 1 from public.company_aliases a where a.company_id = c.id and lower(a.alias) like '%' || q || '%'))), '[]'),
    'counts', jsonb_build_object(
      'all', (select count(*) from public.companies where merged_into_id is null),
      'verified', (select count(*) from public.companies where merged_into_id is null and is_verified),
      'unverified', (select count(*) from public.companies where merged_into_id is null and not is_verified),
      'merged', (select count(*) from public.companies where merged_into_id is not null)));
end
$$;

create or replace function public.admin_company(p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v jsonb;
begin
  perform public._require_admin();
  v := public._admin_company_row(p_id);
  if v is null then perform public.raise_app_error('not_found', 'This company doesn’t exist.'); end if;
  return v || jsonb_build_object(
    'merged_from', coalesce((select jsonb_agg(jsonb_build_object('id', x.id, 'slug', x.slug, 'name', x.name, 'merged_at', x.merged_at) order by x.merged_at desc nulls last)
                    from public.companies x where x.merged_into_id = p_id), '[]'),
    'history', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'action', l.action, 'actor', public._name_of(l.actor_id), 'created_at', l.created_at, 'metadata', l.metadata)
                 order by l.created_at desc)
                 from (select * from public.audit_logs where entity = 'company' and (entity_id = p_id::text or metadata ->> 'into' = p_id::text)
                       order by created_at desc limit 8) l), '[]'));
end
$$;

-- p: { name, aliases[], industry, website, description, description_source }. p_id null → create.
create or replace function public.admin_save_company(p_id uuid, p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fields jsonb := '{}';
  v_name text := trim(coalesce(p ->> 'name', ''));
  v_aliases text[];
  v_industry text := trim(coalesce(p ->> 'industry', ''));
  v_website text := lower(regexp_replace(regexp_replace(trim(coalesce(p ->> 'website', '')), '^https?://', '', 'i'), '/+$', ''));
  v_desc text := nullif(trim(coalesce(p ->> 'description', '')), '');
  v_source text := p ->> 'description_source';
  v_clash text;
  v_before jsonb;
  v_id uuid := p_id;
  v_slug text;
  v_n int := 1;
begin
  perform public._require_admin();
  perform public._rpc_audited();
  select coalesce(array_agg(distinct a), '{}') into v_aliases
  from (select trim(x) a from jsonb_array_elements_text(coalesce(p -> 'aliases', '[]')) x) y where a <> '' and lower(a) <> lower(v_name);

  if char_length(v_name) < 2 then v_fields := v_fields || '{"name": "Enter the company’s name."}';
  elsif char_length(v_name) > 80 then v_fields := v_fields || '{"name": "Keep the name under 80 characters."}';
  else
    select c.name into v_clash from public.companies c
    where c.id is distinct from p_id and c.merged_into_id is null
      and (lower(c.name) = lower(v_name) or exists (select 1 from public.company_aliases a where a.company_id = c.id and lower(a.alias) = lower(v_name)))
    limit 1;
    if v_clash is not null then v_fields := v_fields || jsonb_build_object('name', '“' || v_clash || '” already uses this name. Merge instead of creating a duplicate.'); end if;
  end if;
  if exists (select 1 from unnest(v_aliases) a where char_length(a) > 60) then v_fields := v_fields || '{"aliases": "Each alias must be under 60 characters."}'; end if;
  if cardinality(v_aliases) > 10 then v_fields := v_fields || '{"aliases": "Add at most 10 aliases."}'; end if;
  select c.name into v_clash from public.company_aliases a join public.companies c on c.id = a.company_id
  where a.company_id is distinct from p_id and lower(a.alias) in (select lower(x) from unnest(v_aliases) x) limit 1;
  if v_clash is not null then v_fields := v_fields || jsonb_build_object('aliases', 'One of these aliases already belongs to “' || v_clash || '”.'); end if;
  if v_industry = '' then v_fields := v_fields || '{"industry": "Add an industry so students can browse by it."}'; end if;
  if v_website <> '' and v_website !~ '^[a-z0-9-]+(\.[a-z0-9-]+)+(/\S*)?$' then v_fields := v_fields || '{"website": "Enter a domain like zoho.com."}'; end if;
  if char_length(coalesce(v_desc, '')) > 600 then v_fields := v_fields || '{"description": "Keep the description under 600 characters."}'; end if;
  if v_desc is not null and coalesce(v_source, '') not in ('admin_curated', 'company_website', 'student_submitted') then
    v_fields := v_fields || '{"description_source": "Say where the description comes from."}';
  end if;
  if v_fields <> '{}' then perform public.raise_app_error('validation', 'Check the highlighted fields.', v_fields::text); end if;

  if p_id is null then
    v_slug := coalesce(nullif(public.slugify(v_name), ''), 'company');
    while exists (select 1 from public.companies where slug = v_slug) loop v_n := v_n + 1; v_slug := public.slugify(v_name) || '-' || v_n; end loop;
    insert into public.companies (name, slug, industry, website, description, description_source, is_verified, created_by)
    values (v_name, v_slug, v_industry, nullif(v_website, ''), v_desc,
            case when v_desc is null then null else (case v_source when 'company_website' then 'official_site' else v_source end)::public.description_source end,
            true, auth.uid())
    returning id into v_id;
  else
    v_before := public._admin_company_row(p_id);
    if v_before is null then perform public.raise_app_error('not_found', 'This company doesn’t exist.'); end if;
    update public.companies set name = v_name, industry = v_industry, website = nullif(v_website, ''), description = v_desc,
      description_source = case when v_desc is null then null else (case v_source when 'company_website' then 'official_site' else v_source end)::public.description_source end
    where id = p_id;
  end if;
  delete from public.company_aliases where company_id = v_id;
  insert into public.company_aliases (company_id, alias) select v_id, a from unnest(v_aliases) a;
  perform public.refresh_experience_search(e.id) from public.experiences e where e.company_id = v_id;
  perform public.write_audit(case when p_id is null then 'company.create' else 'company.update' end, 'company', v_id::text,
    jsonb_strip_nulls(jsonb_build_object('before', v_before, 'after', public._admin_company_row(v_id))));
  return public._admin_company_row(v_id);
end
$$;

create or replace function public.admin_set_company_verified(p_id uuid, p_verified boolean)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  c public.companies;
begin
  perform public._require_admin();
  perform public._rpc_audited();
  select * into c from public.companies where id = p_id;
  if c.id is null then perform public.raise_app_error('not_found', 'This company doesn’t exist.'); end if;
  if c.merged_into_id is not null then perform public.raise_app_error('conflict', 'Merged companies can’t be changed.'); end if;
  if c.is_verified <> p_verified then
    update public.companies set is_verified = p_verified where id = p_id;
    perform public.write_audit(case when p_verified then 'company.verify' else 'company.unverify' end, 'company', p_id::text,
      jsonb_build_object('before', c.is_verified, 'after', p_verified));
  end if;
  return public._admin_company_row(p_id);
end
$$;

create or replace function public._merge_check(p_source uuid, p_target uuid)
returns void language plpgsql stable security definer set search_path = '' as $$
begin
  if p_source is null or p_target is null then perform public.raise_app_error('validation', 'Choose both companies.'); end if;
  if p_source = p_target then perform public.raise_app_error('validation', 'Choose two different companies.'); end if;
  if (select count(*) from public.companies where id in (p_source, p_target)) < 2 then
    perform public.raise_app_error('not_found', 'One of these companies no longer exists.');
  end if;
  if exists (select 1 from public.companies where id in (p_source, p_target) and merged_into_id is not null) then
    perform public.raise_app_error('conflict', 'One of these companies was already merged.');
  end if;
end
$$;

create or replace function public._merge_aliases_added(p_source uuid, p_target uuid)
returns text[] language sql stable security definer set search_path = '' as $$
  select coalesce(array_agg(distinct a order by a), '{}') from (
    select name a from public.companies where id = p_source
    union select alias from public.company_aliases where company_id = p_source) x
  where lower(a) <> lower((select name from public.companies where id = p_target))
    and lower(a) not in (select lower(alias) from public.company_aliases where company_id = p_target)
$$;

create or replace function public.admin_merge_preview(p_source uuid, p_target uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  perform public._merge_check(p_source, p_target);
  return jsonb_build_object(
    'source', public._admin_company_row(p_source),
    'target', public._admin_company_row(p_target),
    'experiences', coalesce((select jsonb_agg(jsonb_build_object('id', e.id, 'role_title', e.role_title, 'status', e.status, 'graduation_year', e.graduation_year,
                     'interview_month', e.interview_month, 'published_at', e.published_at) order by e.published_at desc nulls last)
                   from public.experiences e where e.company_id = p_source and e.status <> 'draft'), '[]'),
    'draft_count', (select count(*) from public.experiences where company_id = p_source and status = 'draft'),
    'aliases_added', to_jsonb(public._merge_aliases_added(p_source, p_target)),
    'redirects', to_jsonb(array(select slug from public.companies where id = p_source union all select slug from public.companies where merged_into_id = p_source)));
end
$$;

-- Supersedes the 0250 version: also moves aliases, keeps redirect chains one hop, records who/when.
create or replace function public.admin_merge_companies(p_source uuid, p_target uuid)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_added text[];
  v_moved uuid[];
  v_redirects text[];
  v_source_name text;
begin
  perform public._require_admin();
  perform public._merge_check(p_source, p_target);
  perform public._rpc_audited();
  v_added := public._merge_aliases_added(p_source, p_target);
  v_redirects := array(select slug from public.companies where id = p_source union all select slug from public.companies where merged_into_id = p_source);
  select name into v_source_name from public.companies where id = p_source;

  with m as (update public.experiences set company_id = p_target where company_id = p_source returning id) select coalesce(array_agg(id), '{}') into v_moved from m;
  delete from public.company_aliases where company_id = p_source;
  insert into public.company_aliases (company_id, alias) select p_target, left(a, 60) from unnest(v_added) a on conflict do nothing;
  update public.companies set merged_into_id = p_target where merged_into_id = p_source;   -- keep chains one hop long
  update public.companies set merged_into_id = p_target, merged_at = now(), merged_by = auth.uid() where id = p_source;
  perform public.refresh_experience_search(e.id) from public.experiences e where e.company_id = p_target;
  perform public.write_audit('company.merge', 'company', p_source::text, jsonb_build_object('into', p_target, 'name', v_source_name, 'moved', v_moved,
    'aliases_added', v_added, 'redirects', v_redirects));
  return jsonb_build_object('moved', cardinality(v_moved), 'target', public._admin_company_row(p_target),
    'redirect_slug', (select slug from public.companies where id = p_target));
end
$$;

-- ------------------------------------------------------------ reports (admin view)
-- status: escalated | open | resolved | all
create or replace function public.admin_reports(p_status text default 'escalated', p_q text default '')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_all jsonb[];
  q text := lower(trim(coalesce(p_q, '')));
begin
  perform public._require_admin();
  select coalesce(array_agg(s), '{}') into v_all from public._mod_all_summaries() s where (s ->> 'report_count')::int > 0;
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(s order by s ->> 'last_reported_at' desc) from unnest(v_all) s
      where (p_status = 'all'
             or (p_status = 'escalated' and (s ->> 'active_count')::int > 0 and s ->> 'state' = 'escalated')
             or (p_status = 'open' and (s ->> 'active_count')::int > 0)
             or (p_status = 'resolved' and (s ->> 'active_count')::int = 0))
        and (q = '' or lower(s -> 'preview' ->> 'title') like '%' || q || '%'
             or exists (select 1 from jsonb_array_elements(coalesce(s -> 'reporters', '[]')) u where lower(u ->> 'full_name') like '%' || q || '%'))), '[]'),
    'counts', jsonb_build_object(
      'escalated', (select count(*) from unnest(v_all) s where (s ->> 'active_count')::int > 0 and s ->> 'state' = 'escalated'),
      'open', (select count(*) from unnest(v_all) s where (s ->> 'active_count')::int > 0),
      'resolved', (select count(*) from unnest(v_all) s where (s ->> 'active_count')::int = 0),
      'all', cardinality(v_all),
      'reports', (select count(*) from public.reports)));
end
$$;

create or replace function public.admin_remove_content(p_type public.report_target, p_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  v_status text := public._target_status(p_type, p_id);
  v_active uuid[];
  v_author uuid := public._target_author(p_type, p_id);
begin
  perform public._require_admin();
  if p_type = 'profile' then perform public.raise_app_error('validation', 'Profiles can’t be removed. Suspend the account instead.'); end if;
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    perform public.raise_app_error('validation', 'Check the highlighted fields.', '{"reason": "Give a reason of at least 10 characters."}');
  end if;
  if v_status is null then perform public.raise_app_error('not_found', 'This content no longer exists.'); end if;
  if v_status = 'removed' then perform public.raise_app_error('conflict', 'This was already removed.'); end if;
  if v_author = auth.uid() then perform public.raise_app_error('forbidden', 'You can’t moderate your own content.'); end if;
  v_active := array(select id from public.reports where target_type = p_type and target_id = p_id and status in ('open', 'escalated'));
  if p_type = 'experience' then
    update public.experiences set status = 'removed', deleted_at = now(), removal_reason = left(trim(p_reason), 300) where id = p_id;
  else
    update public.comments set status = 'removed', deleted_at = now() where id = p_id;
  end if;
  update public.reports set status = 'actioned', resolution = 'removed', resolved_by = auth.uid(), resolved_at = now() where id = any (v_active);
  perform public.notify_user(v_author, 'content_removed', jsonb_build_object('target_type', p_type, 'target_id', p_id, 'title', 'Your ' || p_type::text || ' was removed', 'body', trim(p_reason)));
  insert into public.moderation_actions (actor_id, target_type, target_id, action, note, report_ids) values (auth.uid(), p_type, p_id, 'remove', left(trim(p_reason), 500), v_active);
  perform public.write_audit(p_type::text || '.remove', p_type::text, p_id::text, jsonb_build_object('reason', trim(p_reason), 'reports', v_active, 'before', v_status, 'after', 'removed'));
  return true;
end
$$;

-- Suspends whoever wrote the target without revealing who it is.
create or replace function public.admin_suspend_author(p_type public.report_target, p_id uuid, p_days int, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid := public._target_author(p_type, p_id);
  v_res jsonb;
begin
  perform public._require_admin();
  if v_author is null then perform public.raise_app_error('not_found', 'We couldn’t find the author.'); end if;
  if (select status from public.profiles where id = v_author) = 'suspended' then perform public.raise_app_error('conflict', 'The author is already suspended.'); end if;
  v_res := public._suspend(v_author, p_days, p_reason, jsonb_build_object('type', p_type, 'id', p_id));
  insert into public.moderation_actions (actor_id, target_type, target_id, action, note) values (auth.uid(), p_type, p_id, 'suspend_author', left(trim(p_reason), 500));
  return v_res;
end
$$;

-- D7: the only way to see who wrote anonymous content. Reason required, always audited.
create or replace function public.admin_unmask(p_type public.report_target, p_id uuid, p_reason text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_author uuid := public._target_author(p_type, p_id);
  v_out jsonb;
begin
  perform public._require_admin();
  if char_length(trim(coalesce(p_reason, ''))) < 10 then
    perform public.raise_app_error('validation', 'Check the highlighted fields.', '{"reason": "Give a reason of at least 10 characters."}');
  end if;
  if public._target_status(p_type, p_id) is null then perform public.raise_app_error('not_found', 'This content no longer exists.'); end if;
  if not public._target_masked(p_type, p_id) then perform public.raise_app_error('conflict', 'This author isn’t anonymous.'); end if;
  select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'handle', p.handle, 'email', u.email,
      'department', (select code from public.departments where id = p.department_id), 'graduation_year', p.graduation_year, 'status', p.status)
    into v_out from public.profiles p join auth.users u on u.id = p.id where p.id = v_author;
  if v_out is null then perform public.raise_app_error('not_found', 'The author’s account no longer exists.'); end if;
  perform public.write_audit(p_type::text || '.unmask', p_type::text, p_id::text, jsonb_build_object('reason', trim(p_reason)));
  insert into public.moderation_actions (actor_id, target_type, target_id, action, note) values (auth.uid(), p_type, p_id, 'unmask', left(trim(p_reason), 500));
  return v_out;
end
$$;

-- ------------------------------------------------------------ audit log
-- p: { actor ('system' | uuid), action, entity, from 'YYYY-MM-DD', to 'YYYY-MM-DD' }
create or replace function public.admin_audit(p jsonb default '{}')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  perform public._require_admin();
  return jsonb_build_object(
    'items', coalesce((select jsonb_agg(jsonb_build_object('id', l.id, 'actor_id', coalesce(l.actor_id::text, 'system'), 'action', l.action, 'entity', l.entity,
                'entity_id', l.entity_id, 'metadata', l.metadata, 'created_at', l.created_at, 'actor_name', public._name_of(l.actor_id)) order by l.created_at desc, l.id desc)
              from (select * from public.audit_logs a
                    where (coalesce(p ->> 'actor', 'all') = 'all' or coalesce(a.actor_id::text, 'system') = p ->> 'actor')
                      and (coalesce(p ->> 'action', 'all') = 'all' or a.action = p ->> 'action')
                      and (coalesce(p ->> 'entity', 'all') = 'all' or a.entity = p ->> 'entity')
                      and (nullif(p ->> 'from', '') is null or a.created_at >= (p ->> 'from')::date)
                      and (nullif(p ->> 'to', '') is null or a.created_at < (p ->> 'to')::date + 1)
                    order by a.created_at desc, a.id desc limit 1000) l), '[]'),
    'total', (select count(*) from public.audit_logs),
    'facets', jsonb_build_object(
      'actors', coalesce((select jsonb_agg(jsonb_build_object('value', v, 'label', lbl) order by lbl)
                 from (select distinct coalesce(actor_id::text, 'system') v, public._name_of(actor_id) lbl from public.audit_logs) x), '[]'),
      'actions', coalesce((select jsonb_agg(distinct action) from public.audit_logs), '[]'),
      'entities', coalesce((select jsonb_agg(distinct entity) from public.audit_logs), '[]')));
end
$$;

-- Exports contain personal data, so the export itself is audited.
create or replace function public.admin_audit_export(p_count int, p_filters jsonb default '{}')
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  perform public._require_admin();
  perform public.write_audit('audit.export', 'audit', 'csv', jsonb_build_object('rows', p_count, 'filters', p_filters));
  return true;
end
$$;

-- ------------------------------------------------------------ settings
create or replace function public.admin_save_settings(p jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fields jsonb := '{}';
  a jsonb := coalesce(p -> 'announcement', '{}');
  v_text text := trim(coalesce(a ->> 'text', ''));
  v_rules jsonb := '{"publish_per_day": [1, 50], "comments_per_hour": [1, 200], "reports_per_day": [1, 100], "auto_hide_threshold": [2, 10]}';
  k text;
  v numeric;
  v_th numeric;
  v_before public.platform_settings;
  v_after public.platform_settings;
  v_changes jsonb := '{}';
begin
  perform public._require_admin();
  if char_length(v_text) > 200 then v_fields := v_fields || '{"announcement.text": "Keep the announcement under 200 characters."}'; end if;
  if coalesce(a ->> 'tone', '') not in ('info', 'warning') then v_fields := v_fields || '{"announcement.tone": "Choose a tone."}'; end if;
  if nullif(a ->> 'expires_at', '') is not null and (a ->> 'expires_at')::timestamptz <= now() then
    v_fields := v_fields || '{"announcement.expires_at": "Pick a date in the future, or leave it empty."}';
  end if;
  for k in select jsonb_object_keys(v_rules) loop
    v := case when jsonb_typeof(p -> 'limits' -> k) = 'number' then (p -> 'limits' ->> k)::numeric end;
    if v is null or v <> trunc(v) or v < (v_rules -> k ->> 0)::int or v > (v_rules -> k ->> 1)::int then
      v_fields := v_fields || jsonb_build_object('limits.' || k, format('Enter a whole number from %s to %s.', v_rules -> k ->> 0, v_rules -> k ->> 1));
    end if;
  end loop;
  v_th := case when jsonb_typeof(p -> 'landing_stats_threshold') = 'number' then (p ->> 'landing_stats_threshold')::numeric end;
  if v_th is null or v_th <> trunc(v_th) or v_th < 0 or v_th > 10000 then
    v_fields := v_fields || '{"landing_stats_threshold": "Enter a whole number from 0 to 10,000."}';
  end if;
  if v_fields <> '{}' then perform public.raise_app_error('validation', 'Check the highlighted fields.', v_fields::text); end if;

  select * into v_before from public.platform_settings where id for update;
  update public.platform_settings set
    announcement = jsonb_build_object('text', v_text, 'tone', a ->> 'tone', 'expires_at', case when v_text = '' then null else nullif(a ->> 'expires_at', '') end),
    flags = jsonb_build_object('comments', coalesce((p -> 'flags' ->> 'comments')::boolean, false), 'anonymous_posting', coalesce((p -> 'flags' ->> 'anonymous_posting')::boolean, false),
                               'new_companies', coalesce((p -> 'flags' ->> 'new_companies')::boolean, false)),
    limits = (select jsonb_object_agg(k2, (p -> 'limits' ->> k2)::int) from jsonb_object_keys(v_rules) k2),
    landing_stats_threshold = v_th::int, updated_by = auth.uid(), updated_at = now()
  where id returning * into v_after;

  select coalesce(jsonb_object_agg(path, jsonb_build_object('before', b, 'after', af)), '{}') into v_changes from (
    select g || '.' || key path, (to_jsonb(v_before) -> g) -> key b, (to_jsonb(v_after) -> g) -> key af
    from unnest(array['announcement', 'flags', 'limits']) g, jsonb_object_keys(to_jsonb(v_after) -> g) key
    union all select 'landing_stats_threshold', to_jsonb(v_before.landing_stats_threshold), to_jsonb(v_after.landing_stats_threshold)) x
  where b is distinct from af;
  if v_changes <> '{}' then perform public.write_audit('settings.update', 'settings', 'global', jsonb_build_object('changes', v_changes)); end if;
  return jsonb_build_object('announcement', v_after.announcement, 'flags', v_after.flags, 'limits', v_after.limits, 'landing_stats_threshold', v_after.landing_stats_threshold);
end
$$;

-- ------------------------------------------------------------ grants
revoke execute on function public._require_admin(), public._primary_role(uuid), public._expire_suspensions(), public._admin_user_row(uuid),
  public._suspend(uuid, int, text, jsonb), public._source_out(public.description_source), public._admin_company_row(uuid), public._merge_check(uuid, uuid),
  public._merge_aliases_added(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.admin_overview(), public.admin_users(jsonb), public.admin_user_facets(), public.admin_user_detail(uuid), public.admin_suspend(uuid, int, text),
  public.admin_lift_suspension(uuid), public.admin_companies(text, text), public.admin_company(uuid), public.admin_save_company(uuid, jsonb),
  public.admin_set_company_verified(uuid, boolean), public.admin_merge_preview(uuid, uuid), public.admin_merge_companies(uuid, uuid), public.admin_reports(text, text),
  public.admin_remove_content(public.report_target, uuid, text), public.admin_suspend_author(public.report_target, uuid, int, text),
  public.admin_unmask(public.report_target, uuid, text), public.admin_audit(jsonb), public.admin_audit_export(int, jsonb), public.admin_save_settings(jsonb) from public, anon;
grant execute on function public.admin_overview(), public.admin_users(jsonb), public.admin_user_facets(), public.admin_user_detail(uuid), public.admin_suspend(uuid, int, text),
  public.admin_lift_suspension(uuid), public.admin_companies(text, text), public.admin_company(uuid), public.admin_save_company(uuid, jsonb),
  public.admin_set_company_verified(uuid, boolean), public.admin_merge_preview(uuid, uuid), public.admin_merge_companies(uuid, uuid), public.admin_reports(text, text),
  public.admin_remove_content(public.report_target, uuid, text), public.admin_suspend_author(public.report_target, uuid, int, text),
  public.admin_unmask(public.report_target, uuid, text), public.admin_audit(jsonb), public.admin_audit_export(int, jsonb), public.admin_save_settings(jsonb) to authenticated;
