-- =====================================================================
-- Roundwise · 0200 · Helper functions, auth hooks, triggers
-- Every SECURITY DEFINER function pins search_path = '' and schema-
-- qualifies every object, so a caller can't hijack resolution.
-- =====================================================================

-- ------------------------------------------------------------ identity
create or replace function public.is_psg_email(p_email text)
returns boolean
language sql immutable
set search_path = ''
as $$
  select p_email is not null
     and p_email ~* '^[^@\s]+@psgtech\.ac\.in$'
$$;

-- Layer 4 of D2: every policy re-checks the JWT's email domain, so a
-- misconfigured auth hook can't open the database to outsiders.
create or replace function public.is_psg_user()
returns boolean
language sql stable
set search_path = ''
as $$
  select auth.uid() is not null and public.is_psg_email(auth.jwt() ->> 'email')
$$;

create or replace function public.has_role(p_role public.app_role)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.user_roles r where r.user_id = auth.uid() and r.role = p_role)
$$;

create or replace function public.is_admin()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_psg_user() and public.has_role('admin')
$$;

create or replace function public.is_moderator()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_psg_user() and (public.has_role('moderator') or public.has_role('admin'))
$$;

-- Verified PSG, onboarded, not currently suspended (expired suspensions count as active).
create or replace function public.is_active_user()
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_psg_user() and exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.onboarded_at is not null
      and (p.status = 'active' or (p.suspended_until is not null and p.suspended_until < now()))
  )
$$;

create or replace function public.can_read_experience(p_experience_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.experiences e
    where e.id = p_experience_id
      and (
        (e.status = 'published' and public.is_active_user())
        or (e.author_id = auth.uid() and e.status <> 'removed' and public.is_psg_user())
        or (e.status in ('published', 'hidden') and public.is_moderator())
      )
  )
$$;

create or replace function public.setting_int(p_group text, p_key text)
returns integer
language sql stable security definer
set search_path = ''
as $$
  select ((case p_group when 'limits' then s.limits when 'flags' then s.flags end) ->> p_key)::integer
  from public.platform_settings s where s.id
$$;

create or replace function public.setting_flag(p_key text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((s.flags ->> p_key)::boolean, false) from public.platform_settings s where s.id
$$;

create or replace function public.write_audit(p_action text, p_entity text, p_entity_id text, p_metadata jsonb default '{}')
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_metadata, '{}'))
$$;

create or replace function public.notify_user(p_user uuid, p_type text, p_payload jsonb)
returns void
language sql security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, type, payload)
  select p_user, p_type, coalesce(p_payload, '{}') where p_user is not null
$$;

-- Raises a client-safe error. SQLSTATE P0001 + a stable code in DETAIL.
create or replace function public.raise_app_error(p_code text, p_message text, p_hint text default null)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_message, detail = p_code, hint = coalesce(p_hint, '');
end
$$;

create or replace function public.slugify(p_text text)
returns text
language sql immutable
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(lower(coalesce(p_text, '')), '[^a-z0-9]+', '-', 'g'))
$$;

-- ------------------------------------------------------------ auth: domain enforcement (D2)
-- Layer 3a: Supabase "Before User Created" hook (configured in config.toml).
create or replace function public.hook_before_user_created(event jsonb)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_email text := event -> 'user' ->> 'email';
begin
  if not public.is_psg_email(v_email) then
    return jsonb_build_object('error', jsonb_build_object(
      'http_code', 403,
      'message', 'Only @psgtech.ac.in accounts can join.'
    ));
  end if;
  return '{}'::jsonb;
end
$$;

-- Layer 3b: hard guarantee at the table, whatever path creates the user.
create or replace function public.enforce_psg_domain()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_psg_email(new.email) then
    raise exception using errcode = '42501', message = 'Only @psgtech.ac.in accounts can join.';
  end if;
  return new;
end
$$;

create trigger enforce_psg_domain
  before insert or update of email on auth.users
  for each row execute function public.enforce_psg_domain();

create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    left(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', ''), 80)
  );
  return new;
end
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------ generic triggers
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger set_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.companies for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.experiences for each row execute function public.set_updated_at();

-- True when the change comes from a SECURITY DEFINER function (runs as the
-- table owner) rather than a client role. Guards below only police clients.
create or replace function public.is_trusted_context()
returns boolean
language sql stable
set search_path = ''
as $$
  select current_user not in ('authenticated', 'anon')
$$;

-- Profiles: clients may only touch their own editable columns (column GRANTs
-- in 0300 enforce which), and a handle can change once per 30 days.
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;
  if new.handle is distinct from old.handle then
    if old.handle_changed_at is not null and old.handle_changed_at > now() - interval '30 days' then
      perform public.raise_app_error('handle_cooldown', 'You can change your profile link once every 30 days.');
    end if;
    new.handle_changed_at := now();
  end if;
  return new;
end
$$;
create trigger guard_profile_update before update on public.profiles for each row execute function public.guard_profile_update();

-- ------------------------------------------------------------ counters
create or replace function public.sync_helpful_count()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(new.experience_id, old.experience_id);
begin
  update public.experiences e
     set helpful_count = (select count(*) from public.helpful_votes v where v.experience_id = v_id)
   where e.id = v_id;
  return null;
end
$$;
create trigger sync_helpful_count after insert or delete on public.helpful_votes for each row execute function public.sync_helpful_count();

create or replace function public.sync_comment_count()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_id uuid := coalesce(new.experience_id, old.experience_id);
begin
  update public.experiences e
     set comment_count = (select count(*) from public.comments c where c.experience_id = v_id and c.status = 'visible')
   where e.id = v_id;
  return null;
end
$$;
create trigger sync_comment_count after insert or delete or update of status on public.comments for each row execute function public.sync_comment_count();

-- ------------------------------------------------------------ votes
create or replace function public.can_vote_on(p_experience_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_active_user() and exists (
    select 1 from public.experiences e
    where e.id = p_experience_id and e.status = 'published' and e.author_id is distinct from auth.uid()
  )
$$;

-- ------------------------------------------------------------ comments
-- SECURITY DEFINER: it must see other people's experiences and parent
-- comments, which RLS hides from the caller. No RPC inserts comments, so the
-- only bypass is "no signed-in user" (seed scripts, service role).
create or replace function public.guard_comment_insert()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_parent public.comments;
begin
  if auth.uid() is null then
    return new;
  end if;
  if not public.setting_flag('comments') then
    perform public.raise_app_error('comments_disabled', 'Comments are turned off right now.');
  end if;
  new.author_id := auth.uid();
  new.status := 'visible';
  new.created_at := now();
  new.edited_at := null;
  new.deleted_at := null;
  if not exists (select 1 from public.experiences e where e.id = new.experience_id and e.status = 'published') then
    perform public.raise_app_error('not_found', 'You can only comment on published experiences.');
  end if;
  if new.parent_id is not null then
    select * into v_parent from public.comments c where c.id = new.parent_id;
    if v_parent.id is null or v_parent.experience_id <> new.experience_id or v_parent.parent_id is not null then
      perform public.raise_app_error('invalid_parent', 'Replies can only be one level deep.');
    end if;
  end if;
  if (select count(*) from public.comments c where c.author_id = auth.uid() and c.created_at > now() - interval '1 hour')
     >= public.setting_int('limits', 'comments_per_hour') then
    perform public.raise_app_error('rate_limited', 'You’re commenting too fast. Try again later.');
  end if;
  return new;
end
$$;
create trigger guard_comment_insert before insert on public.comments for each row execute function public.guard_comment_insert();

-- Clients may edit the body for 15 minutes, delete (visible → deleted), and
-- undo their own delete (deleted → visible). Moderation states are off-limits.
create or replace function public.guard_comment_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if public.is_trusted_context() then
    return new;
  end if;
  if new.body is distinct from old.body then
    if old.status <> 'visible' or old.created_at < now() - interval '15 minutes' then
      perform public.raise_app_error('edit_window', 'Comments can only be edited for 15 minutes.');
    end if;
    new.edited_at := now();
  end if;
  if new.status is distinct from old.status then
    if not ((old.status = 'visible' and new.status = 'deleted') or (old.status = 'deleted' and new.status = 'visible')) then
      perform public.raise_app_error('forbidden', 'You can’t change that comment’s status.');
    end if;
    new.deleted_at := case when new.status = 'deleted' then now() else null end;
  end if;
  return new;
end
$$;
create trigger guard_comment_update before update on public.comments for each row execute function public.guard_comment_update();

-- ------------------------------------------------------------ search
create or replace function public.refresh_experience_search(p_experience_id uuid)
returns void
language sql security definer
set search_path = ''
as $$
  update public.experiences e set search_vector =
      setweight(to_tsvector('simple', coalesce(c.name, '') || ' ' || coalesce((select string_agg(a.alias, ' ') from public.company_aliases a where a.company_id = c.id), '') || ' ' || coalesce(e.role_title, '')), 'A')
   || setweight(to_tsvector('simple', coalesce((select string_agg(t.name, ' ') from public.experience_topics et join public.topics t on t.id = et.topic_id where et.experience_id = e.id), '')), 'B')
   || setweight(to_tsvector('english', coalesce((select string_agg(q.body, ' ') from public.questions q where q.experience_id = e.id), '')), 'B')
   || setweight(to_tsvector('english',
        coalesce(e.advice, '') || ' ' || coalesce(e.preparation, '') || ' ' || coalesce(e.application_process, '') || ' '
        || coalesce((select string_agg(r.description, ' ') from public.experience_rounds r where r.experience_id = e.id), '')), 'C')
  from public.companies c
  where e.id = p_experience_id and c.id = e.company_id
$$;
