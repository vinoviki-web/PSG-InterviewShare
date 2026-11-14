-- =====================================================================
-- PSG InterviewShare · 0300 · Security: RLS, grants, masked views, storage
-- Default deny everywhere. Strategy: docs/01-product-discovery.md §10
--
-- Read model
--   * Students read OTHER people's experiences/comments/profiles only via
--     the masked views (experience_feed, comment_feed, public_profiles) and
--     get_experience(). Base tables expose only the caller's own rows.
--   * Anonymous authors are masked for everyone, admins included (D7).
--     admin_reveal_author() is the only unmasking path, and it is audited.
-- Write model
--   * Experiences, reports, moderation, roles, settings: RPCs only.
--   * Votes, bookmarks, comments, own profile: direct writes with RLS +
--     column grants + guard triggers.
-- =====================================================================

-- ------------------------------------------------------------ RLS on
alter table public.departments          enable row level security;
alter table public.domains              enable row level security;
alter table public.topics               enable row level security;
alter table public.profiles             enable row level security;
alter table public.user_roles           enable row level security;
alter table public.companies            enable row level security;
alter table public.company_aliases      enable row level security;
alter table public.experiences          enable row level security;
alter table public.experience_rounds    enable row level security;
alter table public.questions            enable row level security;
alter table public.question_topics      enable row level security;
alter table public.experience_topics    enable row level security;
alter table public.experience_resources enable row level security;
alter table public.helpful_votes        enable row level security;
alter table public.bookmarks            enable row level security;
alter table public.experience_views     enable row level security;
alter table public.comments             enable row level security;
alter table public.reports              enable row level security;
alter table public.moderation_actions   enable row level security;
alter table public.audit_logs           enable row level security;
alter table public.notifications        enable row level security;
alter table public.platform_settings    enable row level security;

-- ------------------------------------------------------------ privileges: start from nothing
revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
-- Future objects must be granted explicitly in their own migration.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;

alter table public.helpful_votes alter column user_id set default auth.uid();
alter table public.bookmarks alter column user_id set default auth.uid();

-- ------------------------------------------------------------ lookups
grant select on public.departments, public.topics to authenticated;
grant insert, update, delete on public.departments, public.topics to authenticated;
create policy "psg read departments" on public.departments for select to authenticated using (public.is_psg_user());
create policy "admin write departments" on public.departments for all to authenticated using (public.is_admin()) with check (public.is_admin());
-- Domains (MD1): read by every PSG student, written only by admins.
grant select, insert, update, delete on public.domains to authenticated;
create policy "psg read domains" on public.domains for select to authenticated using ((select public.is_psg_user()));
create policy "admin insert domains" on public.domains for insert to authenticated with check ((select public.is_admin()));
create policy "admin update domains" on public.domains for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin delete domains" on public.domains for delete to authenticated using ((select public.is_admin()));
create policy "psg read topics" on public.topics for select to authenticated using (public.is_psg_user());
create policy "admin write topics" on public.topics for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- ------------------------------------------------------------ profiles
grant select on public.profiles to authenticated;
grant update (full_name, handle, department_id, graduation_year, avatar_path, bio, interests, topic_ids,
              profile_visibility, default_anonymous, default_hide_department) on public.profiles to authenticated;
create policy "own profile read" on public.profiles for select to authenticated
  using (id = auth.uid() and public.is_psg_user());
create policy "own profile update" on public.profiles for update to authenticated
  using (id = auth.uid() and public.is_psg_user()) with check (id = auth.uid());
-- No insert (created by trigger), no delete (account deletion via Edge Function, Phase 4).

-- ------------------------------------------------------------ roles (C6: no client writes at all)
grant select on public.user_roles to authenticated;
create policy "own roles read" on public.user_roles for select to authenticated
  using ((user_id = auth.uid() and public.is_psg_user()) or public.is_admin());

-- ------------------------------------------------------------ companies
grant select on public.companies, public.company_aliases to authenticated;
grant insert (name, slug, industry, website, logo_path, description, description_source, is_verified),
      update (name, slug, industry, website, logo_path, description, description_source, is_verified)
  on public.companies to authenticated;
grant insert, delete on public.company_aliases to authenticated;
create policy "psg read companies" on public.companies for select to authenticated using (public.is_psg_user());
create policy "admin insert companies" on public.companies for insert to authenticated with check (public.is_admin());
create policy "admin update companies" on public.companies for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "psg read aliases" on public.company_aliases for select to authenticated using (public.is_psg_user());
create policy "admin insert aliases" on public.company_aliases for insert to authenticated with check (public.is_admin());
create policy "admin delete aliases" on public.company_aliases for delete to authenticated using (public.is_admin());

-- ------------------------------------------------------------ experiences (own rows only; others via feed)
grant select on public.experiences, public.experience_rounds, public.questions, public.question_topics,
                public.experience_topics, public.experience_resources to authenticated;
create policy "own experiences read" on public.experiences for select to authenticated
  using (author_id = auth.uid() and public.is_psg_user());
create policy "readable rounds" on public.experience_rounds for select to authenticated using (public.can_read_experience(experience_id));
create policy "readable questions" on public.questions for select to authenticated using (public.can_read_experience(experience_id));
create policy "readable question topics" on public.question_topics for select to authenticated
  using (exists (select 1 from public.questions q where q.id = question_id and public.can_read_experience(q.experience_id)));
create policy "readable experience topics" on public.experience_topics for select to authenticated using (public.can_read_experience(experience_id));
create policy "readable resources" on public.experience_resources for select to authenticated using (public.can_read_experience(experience_id));

-- ------------------------------------------------------------ votes, bookmarks, views
grant select, delete on public.helpful_votes, public.bookmarks to authenticated;
grant insert (user_id, experience_id) on public.helpful_votes, public.bookmarks to authenticated;
grant select on public.experience_views to authenticated;
create policy "own votes read" on public.helpful_votes for select to authenticated using (user_id = auth.uid());
create policy "vote on others' published" on public.helpful_votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_vote_on(experience_id));
create policy "remove own vote" on public.helpful_votes for delete to authenticated using (user_id = auth.uid());
create policy "own bookmarks read" on public.bookmarks for select to authenticated using (user_id = auth.uid());
create policy "bookmark readable" on public.bookmarks for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user() and public.can_read_experience(experience_id));
create policy "remove own bookmark" on public.bookmarks for delete to authenticated using (user_id = auth.uid());
create policy "own views read" on public.experience_views for select to authenticated using (user_id = auth.uid());

-- ------------------------------------------------------------ comments (own rows only; others via comment_feed)
grant select on public.comments to authenticated;
grant insert (experience_id, parent_id, body), update (body, status) on public.comments to authenticated;
create policy "own comments read" on public.comments for select to authenticated using (author_id = auth.uid() and public.is_psg_user());
create policy "comment on readable" on public.comments for insert to authenticated
  with check (author_id = auth.uid() and public.is_active_user() and public.can_read_experience(experience_id));
create policy "edit own comment" on public.comments for update to authenticated
  using (author_id = auth.uid() and public.is_active_user()) with check (author_id = auth.uid());

-- ------------------------------------------------------------ moderation data
grant select on public.reports, public.moderation_actions, public.audit_logs to authenticated;
create policy "admin read reports" on public.reports for select to authenticated using (public.is_admin());
create policy "team read moderation actions" on public.moderation_actions for select to authenticated using (public.is_moderator());
create policy "admin read audit" on public.audit_logs for select to authenticated using (public.is_admin());

grant select, update (read_at) on public.notifications to authenticated;
create policy "own notifications read" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "own notifications mark read" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.platform_settings to authenticated;
create policy "psg read settings" on public.platform_settings for select to authenticated using (public.is_psg_user());

-- ------------------------------------------------------------ masked read views
-- Owned by postgres (bypasses RLS); every row filter is in the WHERE clause.
-- security_barrier stops user-supplied filters running before the masks.
create view public.experience_feed with (security_barrier = true) as
select
  e.id,
  e.company_id, c.slug as company_slug, c.name as company_name, c.is_verified as company_verified,
  e.role_title, e.domain_id, e.opportunity_type, e.hiring_mode,
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
   or (e.author_id = auth.uid() and e.status in ('published', 'hidden') and public.is_psg_user())
   or (e.status in ('published', 'hidden') and public.is_moderator());

create view public.comment_feed with (security_barrier = true) as
select
  cm.id, cm.experience_id, cm.parent_id,
  case when cm.status = 'visible' then cm.body end as body,
  cm.status, cm.created_at, cm.edited_at,
  (cm.author_id = auth.uid()) as is_owner,
  (cm.author_id is not null and cm.author_id = e.author_id) as is_experience_author,
  case when cm.author_id is null or (e.is_anonymous and cm.author_id = e.author_id) then null else p.full_name end as author_name,
  case when cm.author_id is null or (e.is_anonymous and cm.author_id = e.author_id) then null else p.handle end as author_handle,
  (cm.author_id = auth.uid() and cm.status = 'visible' and cm.created_at > now() - interval '15 minutes') as can_edit
from public.comments cm
join public.experiences e on e.id = cm.experience_id
left join public.profiles p on p.id = cm.author_id
where cm.status <> 'removed' and public.can_read_experience(cm.experience_id);

create view public.public_profiles with (security_barrier = true) as
select
  p.id, p.handle, p.full_name, p.department_id, p.graduation_year, p.avatar_path,
  case when p.profile_visibility = 'private' and p.id <> auth.uid() then null else p.bio end as bio,
  (p.profile_visibility = 'private') as is_private,
  (p.id = auth.uid()) as is_self
from public.profiles p
where p.onboarded_at is not null and public.is_active_user();

grant select on public.experience_feed, public.comment_feed, public.public_profiles to authenticated;

-- ------------------------------------------------------------ function execute grants
-- Helpers referenced by policies / guard triggers run as the caller.
grant execute on function
  public.is_psg_email(text), public.is_psg_user(), public.has_role(public.app_role), public.is_admin(), public.is_moderator(),
  public.is_active_user(), public.can_read_experience(uuid), public.can_vote_on(uuid),
  public.setting_int(text, text), public.setting_flag(text), public.raise_app_error(text, text, text), public.is_trusted_context()
to authenticated;

-- RPCs
grant execute on function
  public.complete_onboarding(text, text, smallint, text[], text[]),
  public.save_draft(jsonb),
  public.check_duplicate_experience(uuid, text, public.opportunity_type, smallint, uuid),
  public.publish_experience(uuid, jsonb),
  public.delete_experience(uuid),
  public.record_view(uuid),
  public.get_experience(uuid),
  public.experience_facets(),
  public.create_report(public.report_target, uuid, public.report_reason, text),
  public.mod_set_content_status(public.report_target, uuid, text, text, text),
  public.mod_dismiss_reports(public.report_target, uuid, text),
  public.mod_escalate(public.report_target, uuid, text),
  public.mod_list_reports(public.report_status[]),
  public.admin_set_role(uuid, public.app_role),
  public.admin_suspend_user(uuid, timestamptz, text),
  public.admin_unsuspend_user(uuid),
  public.admin_reveal_author(uuid, text),
  public.admin_list_users(text, int, int),
  public.admin_update_settings(jsonb),
  public.admin_merge_companies(uuid, uuid)
to authenticated;

-- The only anon-callable function (D11)
grant execute on function public.get_public_stats() to anon, authenticated;

-- Auth hook + domain trigger run as supabase_auth_admin
grant usage on schema public to supabase_auth_admin;
grant execute on function public.hook_before_user_created(jsonb), public.is_psg_email(text) to supabase_auth_admin;

-- ------------------------------------------------------------ storage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('company-logos', 'company-logos', true, 1048576, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do nothing;

-- avatars/{user_id}/… : owner writes, PSG students read (served via signed URLs)
create policy "psg read avatars" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and public.is_psg_user());
create policy "own avatar insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_user());
create policy "own avatar update" on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text and public.is_active_user());
create policy "own avatar delete" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "admin write logos" on storage.objects for insert to authenticated
  with check (bucket_id = 'company-logos' and public.is_admin());
create policy "admin update logos" on storage.objects for update to authenticated
  using (bucket_id = 'company-logos' and public.is_admin()) with check (bucket_id = 'company-logos' and public.is_admin());
create policy "admin delete logos" on storage.objects for delete to authenticated
  using (bucket_id = 'company-logos' and public.is_admin());
