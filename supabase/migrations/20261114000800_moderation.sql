-- =====================================================================
-- Roundwise · 0800 · Moderation on the real database (Phase 9, part 1)
-- Returns the exact shapes of the prototype's src/api/moderation.js.
-- Every function is SECURITY DEFINER with an explicit role check, writes
-- moderation_actions (with a before-snapshot for Undo) and audit_logs,
-- and never reveals an anonymous author or (to moderators) a reporter.
-- =====================================================================

-- ------------------------------------------------------------ schema
alter table public.experiences
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles (id) on delete set null,
  add column removal_reason text check (char_length(removal_reason) <= 300);
alter table public.comments
  add column hidden_reason text check (char_length(hidden_reason) <= 300),
  add column hidden_at timestamptz,
  add column hidden_by uuid references public.profiles (id) on delete set null;
alter table public.reports
  add column escalated_by uuid references public.profiles (id) on delete set null,
  add column escalated_at timestamptz,
  add column escalation_note text check (char_length(escalation_note) <= 500);
alter table public.moderation_actions
  add column reason_code text,
  add column message text check (char_length(message) <= 600),
  add column note text check (char_length(note) <= 500),
  add column notification_id uuid,
  add column undone_at timestamptz;
alter table public.moderation_actions drop constraint moderation_actions_action_check;
alter table public.moderation_actions add constraint moderation_actions_action_check
  check (action in ('hide', 'restore', 'remove', 'dismiss', 'escalate', 'suspend_user', 'unsuspend_user', 'reveal_author', 'suspend_author', 'unmask'));
alter table public.profiles
  add column suspended_by uuid references public.profiles (id) on delete set null,
  add column suspended_at timestamptz;

-- RPCs that write their own descriptive audit rows set this transaction-local
-- flag; generic audit triggers then stay quiet (no duplicate entries).
-- Clients can't set it: set_config is not exposed through the API.
create or replace function public._rpc_audited()
returns void language sql set search_path = '' as $$ select set_config('roundwise.rpc_audit', 'on', true) $$;

create or replace function public.audit_company_change()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if current_setting('roundwise.rpc_audit', true) = 'on' then
    return null;
  end if;
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), case tg_op when 'INSERT' then 'company.create' else 'company.update' end, 'company', new.id::text,
          jsonb_build_object('before', case when tg_op = 'UPDATE' then to_jsonb(old) end, 'after', to_jsonb(new)));
  return null;
end
$$;

-- ------------------------------------------------------------ labels
create or replace function public.report_reason_label(p_reason text)
returns text language sql immutable set search_path = '' as $$
  select case p_reason
    when 'spam' then 'Spam or advertising'
    when 'misleading' then 'Misleading or fabricated'
    when 'confidential' then 'Shares confidential test content'
    when 'abusive' then 'Abusive or personal attack'
    when 'privacy' then 'Reveals someone’s private information'
    when 'other' then 'Something else'
    else p_reason end
$$;

create or replace function public.moderation_action_label(p_action text)
returns text language sql immutable set search_path = '' as $$
  select case p_action
    when 'dismiss' then 'Dismissed reports' when 'hide' then 'Hid content' when 'restore' then 'Restored content'
    when 'escalate' then 'Escalated to admins' when 'remove' then 'Removed content' when 'suspend_author' then 'Suspended the author'
    when 'unmask' then 'Revealed the author' when 'reveal_author' then 'Revealed the author'
    when 'suspend_user' then 'Suspended the account' when 'unsuspend_user' then 'Lifted the suspension'
    else p_action end
$$;

create or replace function public._name_of(p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case when p_id is null then 'System' else coalesce((select nullif(full_name, '') from public.profiles where id = p_id), 'Unknown') end
$$;

-- ------------------------------------------------------------ target helpers
create or replace function public._target_author(p_type public.report_target, p_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'experience' then (select author_id from public.experiences where id = p_id)
    when 'comment' then (select author_id from public.comments where id = p_id)
    else p_id end
$$;

-- Is the author masked from readers (D7)?
create or replace function public._target_masked(p_type public.report_target, p_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'experience' then coalesce((select is_anonymous from public.experiences where id = p_id), false)
    when 'comment' then coalesce((select e.is_anonymous and e.author_id = c.author_id from public.comments c join public.experiences e on e.id = c.experience_id where c.id = p_id), false)
    else false end
$$;

create or replace function public._target_status(p_type public.report_target, p_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select case p_type
    when 'experience' then (select status::text from public.experiences where id = p_id)
    when 'comment' then (select status::text from public.comments where id = p_id)
    else (select status::text from public.profiles where id = p_id) end
$$;

create or replace function public._clip(p text, p_n int default 140)
returns text language sql immutable set search_path = '' as $$
  select case when char_length(t) > p_n then rtrim(left(t, p_n - 1)) || '…' else t end
  from (select trim(regexp_replace(regexp_replace(coalesce(p, ''), '[*`_#>]', '', 'g'), '\s+', ' ', 'g')) t) x
$$;

create or replace function public._target_preview(p_type public.report_target, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  r record;
begin
  if p_type = 'experience' then
    select e.id, e.role_title, e.advice, e.preparation, e.application_process, c.name company into r
    from public.experiences e left join public.companies c on c.id = e.company_id where e.id = p_id;
    if r.id is null then return jsonb_build_object('title', 'Content no longer exists', 'excerpt', '', 'href', null); end if;
    return jsonb_build_object('title', coalesce(r.company, 'Unknown company') || ' · ' || coalesce(r.role_title, ''),
      'excerpt', public._clip(coalesce(r.advice, r.preparation, r.application_process)), 'href', '/experiences/' || r.id);
  elsif p_type = 'comment' then
    select cm.id, cm.body, e.id eid, e.role_title, c.name company into r
    from public.comments cm left join public.experiences e on e.id = cm.experience_id left join public.companies c on c.id = e.company_id where cm.id = p_id;
    if r.id is null then return jsonb_build_object('title', 'Content no longer exists', 'excerpt', '', 'href', null); end if;
    return jsonb_build_object('title', public._clip(r.body, 110),
      'excerpt', case when r.eid is null then 'Comment' else 'Comment on ' || coalesce(r.company, 'an experience') || ' · ' || coalesce(r.role_title, '') end,
      'href', case when r.eid is null then null else '/experiences/' || r.eid end);
  end if;
  select p.id, p.full_name, p.handle into r from public.profiles p where p.id = p_id;
  if r.id is null then return jsonb_build_object('title', 'Content no longer exists', 'excerpt', '', 'href', null); end if;
  return jsonb_build_object('title', coalesce(nullif(r.full_name, ''), 'Unnamed student'),
    'excerpt', case when r.handle is null then 'Profile' else 'Profile · @' || r.handle end,
    'href', case when r.handle is null then null else '/u/' || r.handle end);
end
$$;

-- ------------------------------------------------------------ summary (one queue row)
create or replace function public._mod_summary(p_type public.report_target, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text := public._target_status(p_type, p_id);
  v_exists boolean := v_status is not null;
  v_total int;
  v_active int;
  v_escalated boolean;
  v_reasons jsonb;
  v_state text;
  v_hidden_reason text;
  v_hidden_at timestamptz;
  v_hidden_by uuid;
  v_last record;
  v_author uuid := public._target_author(p_type, p_id);
  v_first timestamptz;
  v_latest timestamptz;
begin
  select count(*), count(*) filter (where status in ('open', 'escalated')), bool_or(status = 'escalated'), min(created_at), max(created_at)
    into v_total, v_active, v_escalated, v_first, v_latest
  from public.reports where target_type = p_type and target_id = p_id;

  select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'label', public.report_reason_label(reason), 'count', n) order by n desc, reason), '[]')
    into v_reasons
  from (select reason::text reason, count(*) n from public.reports
        where target_type = p_type and target_id = p_id and (v_active = 0 or status in ('open', 'escalated')) group by 1) x;

  select resolution, resolved_at, resolved_by into v_last from public.reports
  where target_type = p_type and target_id = p_id and resolved_at is not null order by resolved_at desc limit 1;

  v_state := case
    when v_status = 'removed' then 'removed'
    when coalesce(v_escalated, false) then 'escalated'
    when v_active > 0 and v_status = 'hidden' then 'auto_hidden'
    when v_active > 0 then 'needs_review'
    when v_status = 'hidden' then 'hidden'
    when v_last.resolution = 'restored' then 'restored'
    when v_last.resolution = 'hidden' then 'hidden'
    else 'dismissed' end;

  if p_type = 'experience' then
    select hidden_reason, hidden_at, hidden_by into v_hidden_reason, v_hidden_at, v_hidden_by from public.experiences where id = p_id;
  elsif p_type = 'comment' then
    select hidden_reason, hidden_at, hidden_by into v_hidden_reason, v_hidden_at, v_hidden_by from public.comments where id = p_id;
  end if;
  if v_status = 'hidden' and v_hidden_at is null then
    v_hidden_at := coalesce((select max(created_at) from public.audit_logs where entity = p_type::text and entity_id = p_id::text and action like '%auto_hide'), v_latest);
  end if;

  return jsonb_build_object(
    'key', p_type::text || ':' || p_id::text,
    'target_type', p_type, 'target_id', p_id,
    'preview', public._target_preview(p_type, p_id),
    'exists', v_exists,
    'state', v_state,
    'content_status', v_status,
    'hidden_reason', v_hidden_reason,
    'hidden_at', v_hidden_at,
    'hidden_by', case when v_status = 'hidden' then coalesce(v_hidden_by::text, 'system') end,
    'report_count', v_total,
    'active_count', v_active,
    'top_reason', v_reasons -> 0 ->> 'reason',
    'top_reason_label', v_reasons -> 0 ->> 'label',
    'reasons', v_reasons,
    'first_reported_at', v_first,
    'last_reported_at', v_latest,
    'resolved_at', v_last.resolved_at,
    'resolved_by', case when v_last.resolved_at is null then null else public._name_of(v_last.resolved_by) end,
    'is_own', v_author is not null and v_author = auth.uid(),
    -- reporter identity: admins only
    'reporters', case when public.is_admin() then coalesce((
      select jsonb_agg(jsonb_build_object('id', p.id, 'full_name', p.full_name, 'handle', p.handle, 'email', u.email) order by r.created_at)
      from public.reports r join public.profiles p on p.id = r.reporter_id join auth.users u on u.id = p.id
      where r.target_type = p_type and r.target_id = p_id), '[]') end
  );
end
$$;

-- Every target ever reported, plus hidden content without reports.
create or replace function public._mod_targets()
returns table (target_type public.report_target, target_id uuid)
language sql stable security definer set search_path = '' as $$
  select distinct r.target_type, r.target_id from public.reports r
  union select 'experience'::public.report_target, e.id from public.experiences e where e.status = 'hidden'
  union select 'comment'::public.report_target, c.id from public.comments c where c.status = 'hidden'
$$;

create or replace function public._mod_all_summaries()
returns setof jsonb language sql stable security definer set search_path = '' as $$
  select public._mod_summary(t.target_type, t.target_id) from public._mod_targets() t
$$;

-- tab: open | hidden | resolved  →  { items, counts }
create or replace function public.mod_queue(p_tab text default 'open')
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_all jsonb[];
begin
  if not public.is_moderator() then
    perform public.raise_app_error('forbidden', 'Only moderators can see the queue.');
  end if;
  select coalesce(array_agg(s), '{}') into v_all from public._mod_all_summaries() s;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(s order by
        case when p_tab = 'open' then (s ->> 'state' = 'escalated')::int end desc,
        case when p_tab = 'open' then (s ->> 'active_count')::int end desc,
        case when p_tab = 'open' then s ->> 'first_reported_at' end asc,
        case when p_tab = 'hidden' then s ->> 'hidden_at' end desc,
        case when p_tab = 'resolved' then s ->> 'resolved_at' end desc)
      from unnest(v_all) s
      where (p_tab = 'open' and (s ->> 'active_count')::int > 0)
         or (p_tab = 'hidden' and s ->> 'content_status' = 'hidden')
         or (p_tab = 'resolved' and (s ->> 'active_count')::int = 0 and (s ->> 'report_count')::int > 0)), '[]'),
    'counts', jsonb_build_object(
      'open', (select count(*) from unnest(v_all) s where (s ->> 'active_count')::int > 0),
      'hidden', (select count(*) from unnest(v_all) s where s ->> 'content_status' = 'hidden'),
      'resolved', (select count(*) from unnest(v_all) s where (s ->> 'active_count')::int = 0 and (s ->> 'report_count')::int > 0),
      'escalated', (select count(*) from unnest(v_all) s where (s ->> 'active_count')::int > 0 and s ->> 'state' = 'escalated'))
  );
end
$$;

-- ------------------------------------------------------------ item detail
create or replace function public.mod_item(p_type public.report_target, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
declare
  v_summary jsonb;
  v_admin boolean := public.is_admin();
  v_author uuid := public._target_author(p_type, p_id);
  v_masked boolean := public._target_masked(p_type, p_id);
  v_content jsonb;
  v_blocked text;
  v_esc record;
  v_own_targets jsonb;
  r record;
begin
  if not public.is_moderator() then
    perform public.raise_app_error('forbidden', 'Only moderators can open this.');
  end if;
  if public._target_status(p_type, p_id) is null and not exists (select 1 from public.reports where target_type = p_type and target_id = p_id) then
    perform public.raise_app_error('not_found', 'This item no longer exists.');
  end if;
  v_summary := public._mod_summary(p_type, p_id);

  if p_type = 'experience' and v_summary ->> 'content_status' in ('published', 'hidden') then
    v_content := public.get_experience(p_id);   -- author stays masked, even for admins
  elsif p_type = 'comment' then
    select cm.id, cm.body, cm.status, cm.created_at, cm.author_id, cm.parent_id, e.id eid, e.author_id e_author into r
    from public.comments cm left join public.experiences e on e.id = cm.experience_id where cm.id = p_id;
    if r.id is not null then
      v_content := jsonb_build_object(
        'id', r.id, 'body', r.body, 'status', r.status, 'created_at', r.created_at,
        'author', case when v_masked or r.author_id is null then null else (select jsonb_build_object('full_name', full_name, 'handle', handle) from public.profiles where id = r.author_id) end,
        'is_experience_author', r.eid is not null and r.e_author = r.author_id,
        'experience', case when r.eid is null then null else jsonb_build_object('id', r.eid, 'title', public._target_preview('experience', r.eid) ->> 'title') end,
        'parent', (select jsonb_build_object('body', pc.body, 'created_at', pc.created_at,
                     'author', case when public._target_masked('comment', pc.id) then 'Anonymous' else public._name_of(pc.author_id) end)
                   from public.comments pc where pc.id = r.parent_id));
    end if;
  elsif p_type = 'profile' then
    select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'handle', p.handle, 'bio', p.bio,
      'department', (select code from public.departments where id = p.department_id), 'graduation_year', p.graduation_year, 'status', p.status)
      into v_content from public.profiles p where p.id = p_id;
  end if;

  v_blocked := case
    when (v_summary ->> 'is_own')::boolean then 'own'
    when not (v_summary ->> 'exists')::boolean then 'missing'
    when v_summary ->> 'state' = 'removed' then 'removed'
    when v_summary ->> 'state' = 'escalated' and not v_admin then 'escalated' end;

  select escalated_at, escalated_by, escalation_note into v_esc from public.reports
  where target_type = p_type and target_id = p_id and status = 'escalated' order by escalated_at desc nulls last limit 1;

  -- the author's other content, for history counts (never their identity when masked)
  select coalesce(jsonb_agg(k), '[]') into v_own_targets from (
    select 'experience:' || id k from public.experiences where author_id = v_author
    union all select 'comment:' || id from public.comments where author_id = v_author
    union all select 'profile:' || v_author) x
  where v_author is not null and k <> p_type::text || ':' || p_id::text;

  return v_summary || jsonb_build_object(
    'content', v_content,
    'reports', coalesce((
      select jsonb_agg(jsonb_build_object('id', rp.id, 'reason', rp.reason, 'reason_label', public.report_reason_label(rp.reason::text),
        'details', rp.details, 'status', rp.status, 'created_at', rp.created_at, 'resolved_at', rp.resolved_at,
        'reporter', case when v_admin then (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'handle', p.handle, 'email', u.email)
                                            from public.profiles p join auth.users u on u.id = p.id where p.id = rp.reporter_id) end)
        order by rp.created_at desc)
      from public.reports rp where rp.target_type = p_type and rp.target_id = p_id), '[]'),
    'author', jsonb_build_object(
      'masked', v_masked,
      'user', case when v_masked or v_author is null then null
                   else (select jsonb_build_object('id', p.id, 'full_name', p.full_name, 'handle', p.handle) from public.profiles p where p.id = v_author) end,
      'member_since', case when v_masked then null else (select created_at from public.profiles where id = v_author) end,
      'prior_actions', (select count(*) from public.moderation_actions a where a.undone_at is null and a.action in ('hide', 'remove')
                        and v_own_targets ? (a.target_type::text || ':' || a.target_id::text)),
      'other_reports', (select count(*) from public.reports rr where v_own_targets ? (rr.target_type::text || ':' || rr.target_id::text))),
    'escalation', case when v_esc.escalated_at is null then null
                       else jsonb_build_object('at', v_esc.escalated_at, 'by', public._name_of(v_esc.escalated_by), 'note', nullif(v_esc.escalation_note, '')) end,
    'history', coalesce((
      select jsonb_agg(h order by h ->> 'created_at' desc) from (
        select jsonb_build_object('id', a.id::text, 'label', public.moderation_action_label(a.action), 'action', a.action, 'actor', public._name_of(a.actor_id),
          'reason', public.report_reason_label(a.reason_code), 'note', coalesce(nullif(a.note, ''), nullif(a.message, '')), 'created_at', a.created_at, 'undone_at', a.undone_at) h
        from public.moderation_actions a where a.target_type = p_type and a.target_id = p_id
          and (a.action not in ('unmask', 'reveal_author') or v_admin)
        union all
        select jsonb_build_object('id', 'audit-' || l.id, 'label', 'Auto-hidden after ' || coalesce(l.metadata ->> 'reports', '3') || ' reports',
          'action', 'auto_hide', 'actor', 'System', 'created_at', l.created_at)
        from public.audit_logs l where l.entity = p_type::text and l.entity_id = p_id::text and l.action like '%auto_hide') x), '[]'),
    'permissions', jsonb_build_object('can_act', v_blocked is null, 'blocked', v_blocked, 'is_admin', v_admin)
  );
end
$$;

-- ------------------------------------------------------------ mutations
-- Shared guard: returns the active (open/escalated) report ids.
create or replace function public._mod_guard(p_type public.report_target, p_id uuid)
returns uuid[] language plpgsql stable security definer set search_path = '' as $$
declare
  v_status text := public._target_status(p_type, p_id);
begin
  if not public.is_moderator() then perform public.raise_app_error('forbidden', 'Only moderators can do that.'); end if;
  if v_status is null then perform public.raise_app_error('not_found', 'This content no longer exists.'); end if;
  if public._target_author(p_type, p_id) = auth.uid() then
    perform public.raise_app_error('forbidden', 'You can’t moderate your own content. Another moderator will review it.');
  end if;
  if v_status = 'removed' then perform public.raise_app_error('conflict', 'This content was already removed by an admin.'); end if;
  if not public.is_admin() and exists (select 1 from public.reports where target_type = p_type and target_id = p_id and status = 'escalated') then
    perform public.raise_app_error('forbidden', 'This was escalated to admins, so they’ll make the call.');
  end if;
  return array(select id from public.reports where target_type = p_type and target_id = p_id and status in ('open', 'escalated'));
end
$$;

create or replace function public._mod_snapshot(p_type public.report_target, p_id uuid, p_reports uuid[])
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'content', case p_type
      when 'experience' then (select jsonb_build_object('status', status, 'hidden_reason', hidden_reason, 'hidden_at', hidden_at, 'hidden_by', hidden_by) from public.experiences where id = p_id)
      when 'comment' then (select jsonb_build_object('status', status, 'hidden_reason', hidden_reason, 'hidden_at', hidden_at, 'hidden_by', hidden_by) from public.comments where id = p_id)
      else null end,
    'reports', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'status', status, 'resolved_by', resolved_by, 'resolved_at', resolved_at,
                 'resolution', resolution, 'escalated_by', escalated_by, 'escalated_at', escalated_at, 'escalation_note', escalation_note))
               from public.reports where id = any (p_reports)), '[]'))
$$;

create or replace function public._set_content_visibility(p_type public.report_target, p_id uuid, p_hidden boolean, p_reason text)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if p_type = 'experience' then
    update public.experiences set
      status = case when p_hidden then 'hidden' else 'published' end::public.experience_status,
      hidden_reason = case when p_hidden then p_reason end, hidden_at = case when p_hidden then now() end, hidden_by = case when p_hidden then auth.uid() end
    where id = p_id and status = case when p_hidden then 'published' else 'hidden' end::public.experience_status;
  elsif p_type = 'comment' then
    update public.comments set
      status = case when p_hidden then 'hidden' else 'visible' end::public.comment_status,
      hidden_reason = case when p_hidden then p_reason end, hidden_at = case when p_hidden then now() end, hidden_by = case when p_hidden then auth.uid() end
    where id = p_id and status = case when p_hidden then 'visible' else 'hidden' end::public.comment_status;
  else
    return false;
  end if;
  get diagnostics n = row_count;
  return n > 0;
end
$$;

-- Dismiss: closes reports; restores content that was auto-hidden.
create or replace function public.mod_dismiss(p_type public.report_target, p_id uuid, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_active uuid[] := public._mod_guard(p_type, p_id);
  v_before jsonb;
  v_restored boolean;
  v_action bigint;
begin
  if cardinality(v_active) = 0 then perform public.raise_app_error('conflict', 'There are no open reports to dismiss.'); end if;
  v_before := public._mod_snapshot(p_type, p_id, v_active);
  update public.reports set status = 'dismissed', resolution = 'dismissed', resolved_by = auth.uid(), resolved_at = now() where id = any (v_active);
  v_restored := public._set_content_visibility(p_type, p_id, false, null);
  insert into public.moderation_actions (actor_id, target_type, target_id, action, note, before, report_ids)
  values (auth.uid(), p_type, p_id, 'dismiss', nullif(left(trim(coalesce(p_note, '')), 500), ''), v_before, v_active) returning id into v_action;
  perform public.write_audit('report.dismiss', p_type::text, p_id::text,
    jsonb_strip_nulls(jsonb_build_object('reports', v_active, 'restored', v_restored, 'note', nullif(trim(coalesce(p_note, '')), ''))));
  return jsonb_build_object('action_id', v_action, 'restored', v_restored);
end
$$;

-- Hide: reason + a message to the author (≥ 20 chars).
create or replace function public.mod_hide(p_type public.report_target, p_id uuid, p_reason text, p_message text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_fields jsonb := '{}';
  v_active uuid[];
  v_before jsonb;
  v_note uuid;
  v_action bigint;
  v_author uuid;
begin
  if not public.is_moderator() then perform public.raise_app_error('forbidden', 'Only moderators can do that.'); end if;
  if p_type = 'profile' then perform public.raise_app_error('validation', 'Profiles can’t be hidden. Escalate to an admin instead.'); end if;
  if p_reason is null or p_reason not in ('spam', 'misleading', 'confidential', 'abusive', 'privacy', 'other') then
    v_fields := v_fields || '{"reason": "Choose why this is being hidden."}';
  end if;
  if char_length(trim(coalesce(p_message, ''))) < 20 then
    v_fields := v_fields || '{"message": "Write at least 20 characters so the author knows what to fix."}';
  elsif char_length(trim(p_message)) > 600 then
    v_fields := v_fields || '{"message": "Keep the message under 600 characters."}';
  end if;
  if v_fields <> '{}' then perform public.raise_app_error('validation', 'Check the highlighted fields.', v_fields::text); end if;

  v_active := public._mod_guard(p_type, p_id);
  if public._target_status(p_type, p_id) = 'hidden' then
    perform public.raise_app_error('conflict', 'This is already hidden. Dismiss or restore it instead.');
  end if;
  v_before := public._mod_snapshot(p_type, p_id, v_active);
  perform public._set_content_visibility(p_type, p_id, true, 'Hidden by moderators: ' || public.report_reason_label(p_reason));
  update public.reports set status = 'actioned', resolution = 'hidden', resolved_by = auth.uid(), resolved_at = now() where id = any (v_active);

  v_author := public._target_author(p_type, p_id);
  if v_author is not null then
    insert into public.notifications (user_id, type, payload)
    values (v_author, 'content_hidden', jsonb_build_object('target_type', p_type, 'target_id', p_id, 'title', 'Your ' || p_type::text || ' was hidden', 'body', trim(p_message)))
    returning id into v_note;
  end if;
  insert into public.moderation_actions (actor_id, target_type, target_id, action, reason_code, reason, message, notification_id, before, report_ids)
  values (auth.uid(), p_type, p_id, 'hide', p_reason, public.report_reason_label(p_reason), trim(p_message), v_note, v_before, v_active)
  returning id into v_action;
  perform public.write_audit(p_type::text || '.hide', p_type::text, p_id::text, jsonb_build_object('reason', p_reason, 'reports', v_active, 'before', v_before -> 'content' ->> 'status', 'after', 'hidden'));
  return jsonb_build_object('action_id', v_action);
end
$$;

create or replace function public.mod_restore(p_type public.report_target, p_id uuid, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_active uuid[] := public._mod_guard(p_type, p_id);
  v_before jsonb;
  v_action bigint;
begin
  if public._target_status(p_type, p_id) <> 'hidden' then perform public.raise_app_error('conflict', 'This content isn’t hidden.'); end if;
  v_before := public._mod_snapshot(p_type, p_id, v_active);
  perform public._set_content_visibility(p_type, p_id, false, null);
  update public.reports set status = 'dismissed', resolution = 'restored', resolved_by = auth.uid(), resolved_at = now() where id = any (v_active);
  insert into public.moderation_actions (actor_id, target_type, target_id, action, note, before, report_ids)
  values (auth.uid(), p_type, p_id, 'restore', nullif(left(trim(coalesce(p_note, '')), 500), ''), v_before, v_active) returning id into v_action;
  perform public.write_audit(p_type::text || '.restore', p_type::text, p_id::text, jsonb_build_object('reports', v_active, 'before', 'hidden', 'after', public._target_status(p_type, p_id)));
  return jsonb_build_object('action_id', v_action);
end
$$;

create or replace function public.mod_escalate_to_admin(p_type public.report_target, p_id uuid, p_note text default '')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_active uuid[] := public._mod_guard(p_type, p_id);
  v_open uuid[];
  v_before jsonb;
  v_action bigint;
begin
  v_open := array(select id from public.reports where id = any (v_active) and status = 'open');
  if cardinality(v_open) = 0 then perform public.raise_app_error('conflict', 'There are no open reports to escalate.'); end if;
  if char_length(coalesce(p_note, '')) > 500 then
    perform public.raise_app_error('validation', 'Keep the note under 500 characters.', '{"note": "Keep the note under 500 characters."}');
  end if;
  v_before := public._mod_snapshot(p_type, p_id, v_open);
  update public.reports set status = 'escalated', escalated_by = auth.uid(), escalated_at = now(), escalation_note = nullif(trim(coalesce(p_note, '')), '')
  where id = any (v_open);
  insert into public.moderation_actions (actor_id, target_type, target_id, action, note, before, report_ids)
  values (auth.uid(), p_type, p_id, 'escalate', nullif(trim(coalesce(p_note, '')), ''), v_before, v_open) returning id into v_action;
  perform public.write_audit('report.escalate', p_type::text, p_id::text, jsonb_strip_nulls(jsonb_build_object('reports', v_open, 'note', nullif(trim(coalesce(p_note, '')), ''))));
  return jsonb_build_object('action_id', v_action);
end
$$;

-- Undo a dismiss / hide / restore / escalate from its before-snapshot.
create or replace function public.mod_undo(p_action_id bigint)
returns boolean language plpgsql security definer set search_path = '' as $$
declare
  a public.moderation_actions;
  c jsonb;
  s jsonb;
begin
  if not public.is_moderator() then perform public.raise_app_error('forbidden', 'Only moderators can do that.'); end if;
  select * into a from public.moderation_actions where id = p_action_id for update;
  if a.id is null or a.before is null or a.action not in ('dismiss', 'hide', 'restore', 'escalate') then
    perform public.raise_app_error('not_found', 'That action can’t be undone.');
  end if;
  if a.actor_id is distinct from auth.uid() and not public.is_admin() then
    perform public.raise_app_error('forbidden', 'You can only undo your own actions.');
  end if;
  if a.undone_at is not null then return true; end if;

  c := a.before -> 'content';
  if c is not null and jsonb_typeof(c) = 'object' then
    if a.target_type = 'experience' then
      update public.experiences set status = (c ->> 'status')::public.experience_status, hidden_reason = c ->> 'hidden_reason',
        hidden_at = (c ->> 'hidden_at')::timestamptz, hidden_by = (c ->> 'hidden_by')::uuid where id = a.target_id;
    elsif a.target_type = 'comment' then
      update public.comments set status = (c ->> 'status')::public.comment_status, hidden_reason = c ->> 'hidden_reason',
        hidden_at = (c ->> 'hidden_at')::timestamptz, hidden_by = (c ->> 'hidden_by')::uuid where id = a.target_id;
    end if;
  end if;
  for s in select * from jsonb_array_elements(coalesce(a.before -> 'reports', '[]')) loop
    update public.reports set status = (s ->> 'status')::public.report_status, resolved_by = (s ->> 'resolved_by')::uuid,
      resolved_at = (s ->> 'resolved_at')::timestamptz, resolution = s ->> 'resolution', escalated_by = (s ->> 'escalated_by')::uuid,
      escalated_at = (s ->> 'escalated_at')::timestamptz, escalation_note = s ->> 'escalation_note'
    where id = (s ->> 'id')::uuid;
  end loop;
  if a.notification_id is not null then delete from public.notifications where id = a.notification_id; end if;
  update public.moderation_actions set undone_at = now() where id = a.id;
  perform public.write_audit('moderation.undo', a.target_type::text, a.target_id::text, jsonb_build_object('undone', a.action, 'action_id', a.id));
  return true;
end
$$;

-- ------------------------------------------------------------ grants
revoke execute on function public._rpc_audited(), public._name_of(uuid), public._target_author(public.report_target, uuid), public._target_masked(public.report_target, uuid),
  public._target_status(public.report_target, uuid), public._clip(text, int), public._target_preview(public.report_target, uuid), public._mod_summary(public.report_target, uuid),
  public._mod_targets(), public._mod_all_summaries(), public._mod_guard(public.report_target, uuid), public._mod_snapshot(public.report_target, uuid, uuid[]),
  public._set_content_visibility(public.report_target, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.report_reason_label(text), public.moderation_action_label(text), public.mod_queue(text), public.mod_item(public.report_target, uuid),
  public.mod_dismiss(public.report_target, uuid, text), public.mod_hide(public.report_target, uuid, text, text), public.mod_restore(public.report_target, uuid, text),
  public.mod_escalate_to_admin(public.report_target, uuid, text), public.mod_undo(bigint) from public, anon;
grant execute on function public.report_reason_label(text), public.moderation_action_label(text), public.mod_queue(text), public.mod_item(public.report_target, uuid),
  public.mod_dismiss(public.report_target, uuid, text), public.mod_hide(public.report_target, uuid, text, text), public.mod_restore(public.report_target, uuid, text),
  public.mod_escalate_to_admin(public.report_target, uuid, text), public.mod_undo(bigint) to authenticated;
