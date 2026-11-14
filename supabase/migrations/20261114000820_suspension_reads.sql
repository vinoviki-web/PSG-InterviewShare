-- =====================================================================
-- PSG InterviewShare · 0820 · Suspension means no reading at all (Phase 9 fix)
-- Found by the live admin test: a suspended student could still read their
-- OWN published posts through the feed, because the "own rows" branches
-- only required a PSG account. They now require an active (onboarded,
-- not suspended) account, matching "You can’t read or post while suspended".
-- =====================================================================

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
        or (e.author_id = auth.uid() and e.status <> 'removed' and public.is_active_user())
        or (e.status in ('published', 'hidden') and public.is_moderator())
      )
  )
$$;

create or replace view public.experience_feed with (security_barrier = true) as
select
  e.id,
  e.company_id, c.slug as company_slug, c.name as company_name, c.is_verified as company_verified,
  e.role_title, e.opportunity_type, e.hiring_mode,
  case when e.hide_department and e.author_id is distinct from auth.uid() then null else e.department_id end as department_id,
  e.graduation_year, e.interview_month, e.difficulty, e.outcome, e.is_anonymous, e.status,
  case when e.author_id = auth.uid() or public.is_moderator() then e.hidden_reason end as hidden_reason,
  e.published_at, e.updated_at, e.edited, e.helpful_count, e.comment_count, e.view_count, e.search_vector,
  -- author_id is exposed only for named posts by public profiles (so private
  -- profiles can't be enumerated through the feed); the name still shows.
  case when e.is_anonymous and e.author_id is distinct from auth.uid() then null
       when p.profile_visibility = 'private' and e.author_id is distinct from auth.uid() then null
       else e.author_id end as author_id,
  case when e.is_anonymous and e.author_id is distinct from auth.uid() then null else p.full_name end as author_name,
  case when e.is_anonymous and e.author_id is distinct from auth.uid() then null else p.handle end as author_handle,
  (e.author_id = auth.uid()) as is_owner,
  exists (select 1 from public.helpful_votes h where h.experience_id = e.id and h.user_id = auth.uid()) as has_voted,
  exists (select 1 from public.bookmarks b where b.experience_id = e.id and b.user_id = auth.uid()) as has_saved,
  array(select et.topic_id from public.experience_topics et where et.experience_id = e.id order by et.topic_id) as topic_ids,
  array(select r.round_type::text from public.experience_rounds r where r.experience_id = e.id order by r.position) as pipeline,
  (select count(*) from public.questions q where q.experience_id = e.id)::int as question_count,
  left(regexp_replace(coalesce(e.advice, e.preparation, ''), '[*`_#>]', '', 'g'), 220) as excerpt
from public.experiences e
join public.companies c on c.id = e.company_id
left join public.profiles p on p.id = e.author_id
where (e.status = 'published' and public.is_active_user())
   or (e.author_id = auth.uid() and e.status in ('published', 'hidden') and public.is_active_user())
   or (e.status in ('published', 'hidden') and public.is_moderator());
