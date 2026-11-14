-- PSG InterviewShare · 0920 · Pre-launch performance (Supabase advisor findings, DECISIONS LA9)
--
-- 1. Row-level security rules evaluated auth.uid() and the role helpers once
--    PER ROW. Wrapping them in (select …) lets Postgres evaluate them once per
--    query. The rules themselves are unchanged (same conditions, same roles);
--    the 423 pgTAP tests prove the allow/deny behaviour is identical.
-- 2. The admin "write" rules on departments/topics were FOR ALL, which made
--    two permissive SELECT rules apply to every read. Split into
--    insert/update/delete so reads use one rule.
-- 3. Indexes for foreign keys that had none (joins, and ON DELETE SET NULL
--    when an account is deleted).

-- 1 ---------------------------------------------------------------------
alter policy "bookmark readable" on public.bookmarks
  with check (user_id = (select auth.uid()) and (select public.is_active_user()) and public.can_read_experience(experience_id));
alter policy "own bookmarks read" on public.bookmarks using (user_id = (select auth.uid()));
alter policy "remove own bookmark" on public.bookmarks using (user_id = (select auth.uid()));

alter policy "comment on readable" on public.comments
  with check (author_id = (select auth.uid()) and (select public.is_active_user()) and public.can_read_experience(experience_id));
alter policy "edit own comment" on public.comments
  using (author_id = (select auth.uid()) and (select public.is_active_user()))
  with check (author_id = (select auth.uid()));
alter policy "own comments read" on public.comments using (author_id = (select auth.uid()) and (select public.is_psg_user()));

alter policy "own views read" on public.experience_views using (user_id = (select auth.uid()));
alter policy "own experiences read" on public.experiences using (author_id = (select auth.uid()) and (select public.is_psg_user()));

alter policy "own votes read" on public.helpful_votes using (user_id = (select auth.uid()));
alter policy "remove own vote" on public.helpful_votes using (user_id = (select auth.uid()));
alter policy "vote on others' published" on public.helpful_votes
  with check (user_id = (select auth.uid()) and public.can_vote_on(experience_id));

alter policy "own notifications mark read" on public.notifications
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
alter policy "own notifications read" on public.notifications using (user_id = (select auth.uid()));

alter policy "own profile read" on public.profiles using (id = (select auth.uid()) and (select public.is_psg_user()));
alter policy "own profile update" on public.profiles
  using (id = (select auth.uid()) and (select public.is_psg_user())) with check (id = (select auth.uid()));

alter policy "own roles read" on public.user_roles
  using ((user_id = (select auth.uid()) and (select public.is_psg_user())) or (select public.is_admin()));

alter policy "psg read departments" on public.departments using ((select public.is_psg_user()));
alter policy "psg read topics" on public.topics using ((select public.is_psg_user()));

-- 2 ---------------------------------------------------------------------
drop policy "admin write departments" on public.departments;
create policy "admin insert departments" on public.departments for insert to authenticated with check ((select public.is_admin()));
create policy "admin update departments" on public.departments for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin delete departments" on public.departments for delete to authenticated using ((select public.is_admin()));

drop policy "admin write topics" on public.topics;
create policy "admin insert topics" on public.topics for insert to authenticated with check ((select public.is_admin()));
create policy "admin update topics" on public.topics for update to authenticated using ((select public.is_admin())) with check ((select public.is_admin()));
create policy "admin delete topics" on public.topics for delete to authenticated using ((select public.is_admin()));

-- 3 ---------------------------------------------------------------------
create index if not exists bookmarks_experience_idx            on public.bookmarks (experience_id);
create index if not exists experience_views_experience_idx     on public.experience_views (experience_id);
create index if not exists comments_parent_idx                 on public.comments (parent_id);
create index if not exists comments_hidden_by_idx              on public.comments (hidden_by);
create index if not exists companies_created_by_idx            on public.companies (created_by);
create index if not exists companies_merged_by_idx             on public.companies (merged_by);
create index if not exists companies_merged_into_idx           on public.companies (merged_into_id);
create index if not exists experiences_duplicate_of_idx        on public.experiences (duplicate_of);
create index if not exists experiences_hidden_by_idx           on public.experiences (hidden_by);
create index if not exists moderation_actions_actor_idx        on public.moderation_actions (actor_id);
create index if not exists platform_settings_updated_by_idx    on public.platform_settings (updated_by);
create index if not exists profiles_department_idx             on public.profiles (department_id);
create index if not exists profiles_suspended_by_idx           on public.profiles (suspended_by);
create index if not exists reports_escalated_by_idx            on public.reports (escalated_by);
create index if not exists reports_resolved_by_idx             on public.reports (resolved_by);
create index if not exists user_roles_granted_by_idx           on public.user_roles (granted_by);
