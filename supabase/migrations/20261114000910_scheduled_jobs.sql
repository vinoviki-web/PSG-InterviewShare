-- Phase 10: nightly housekeeping, run by pg_cron (DECISIONS LA3).
--
--   * Soft-deleted / removed experiences and comments are purged 30 days after
--     deletion (docs/01 "Deletion policy"). Hidden content is kept: a
--     moderator may still restore it.
--   * Drafts idle for 90 days are deleted ("Drafts are kept for 90 days" on
--     the Share screen). Their authors get a notice 7 days before.
--   * Suspensions whose end date has passed are lifted (also done lazily).
--   * Read notifications older than 180 days are pruned.
--
-- Everything lives in one internal function so it can be run by hand and
-- tested. One System audit row is written per run that changed something.

create extension if not exists pg_cron;

create or replace function public._run_maintenance()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_experiences int := 0;
  v_comments    int := 0;
  v_round       int;
  v_drafts      int := 0;
  v_notices     int := 0;
  v_lifted      int := 0;
  v_notes       int := 0;
  v_result      jsonb;
begin
  -- 1. Purge experiences removed or deleted more than 30 days ago (children cascade).
  delete from public.experiences e
  where e.status = 'removed' and e.deleted_at is not null and e.deleted_at < now() - interval '30 days';
  get diagnostics v_experiences = row_count;

  -- 2. Purge deleted / removed comments older than 30 days. Only comments
  --    without replies, so a reply still on screen is never cascaded away;
  --    a thread unwinds from its leaves over successive runs.
  loop
    delete from public.comments c
    where c.status in ('deleted', 'removed') and c.deleted_at is not null and c.deleted_at < now() - interval '30 days'
      and not exists (select 1 from public.comments r where r.parent_id = c.id);
    get diagnostics v_round = row_count;
    v_comments := v_comments + v_round;
    exit when v_round = 0;
  end loop;

  -- 3. Warn authors of drafts that will expire within 7 days (once per draft).
  with due as (
    select e.id, e.author_id, e.updated_at, c.name as company
    from public.experiences e left join public.companies c on c.id = e.company_id
    where e.status = 'draft' and e.author_id is not null
      and e.updated_at < now() - interval '83 days' and e.updated_at >= now() - interval '90 days'
      and not exists (select 1 from public.notifications n where n.user_id = e.author_id and n.type = 'draft_expiring'
                      and n.payload ->> 'experience_id' = e.id::text)
  )
  insert into public.notifications (user_id, type, payload)
  select author_id, 'draft_expiring', jsonb_build_object(
    'experience_id', id, 'company', company, 'expires_at', updated_at + interval '90 days',
    'message', 'Your draft' || coalesce(' for ' || company, '') || ' hasn’t been edited in 83 days. Open it within a week to keep it.')
  from due;
  get diagnostics v_notices = row_count;

  -- 4. Delete drafts idle for 90 days.
  delete from public.experiences e where e.status = 'draft' and e.updated_at < now() - interval '90 days';
  get diagnostics v_drafts = row_count;

  -- 5. Lift ended suspensions (audited individually as System).
  select count(*) into v_lifted from public.profiles
  where status = 'suspended' and suspended_until is not null and suspended_until < now();
  perform public._expire_suspensions();

  -- 6. Prune old read notifications.
  delete from public.notifications n where n.read_at is not null and n.created_at < now() - interval '180 days';
  get diagnostics v_notes = row_count;

  v_result := jsonb_build_object(
    'experiences_purged', v_experiences, 'comments_purged', v_comments, 'drafts_expired', v_drafts,
    'draft_notices', v_notices, 'suspensions_lifted', v_lifted, 'notifications_pruned', v_notes);

  if v_experiences + v_comments + v_drafts + v_notices + v_lifted + v_notes > 0 then
    insert into public.audit_logs (actor_id, action, entity, entity_id, metadata)
    values (null, 'system.maintenance', 'platform', null, v_result);
  end if;
  return v_result;
end
$$;

revoke all on function public._run_maintenance() from public, anon, authenticated;

-- Nightly at 03:17 IST (21:47 UTC). cron.schedule upserts by name, so
-- re-running this migration is harmless.
select cron.schedule('roundwise-maintenance', '47 21 * * *', 'select public._run_maintenance()');
