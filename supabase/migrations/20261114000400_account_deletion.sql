-- =====================================================================
-- Roundwise · 0400 · Account deletion (D14)
-- Step 1 (this RPC, runs as the student): prepare their content.
--   anonymise → published posts stay, shown as "Former PSG student"
--   delete    → published posts are removed for everyone
--   Drafts are always deleted. Comments stay (authorless) in anonymise
--   mode and are marked deleted in delete mode.
-- Step 2 (Edge Function `delete-account`, service role): delete the
--   avatar files and the auth user. profiles cascade; experiences.author_id
--   and comments.author_id become NULL via ON DELETE SET NULL.
-- =====================================================================

create or replace function public.prepare_account_deletion(p_mode text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_drafts int;
  v_posts int;
  v_comments int := 0;
begin
  if v_uid is null or not public.is_psg_user() then
    perform public.raise_app_error('unauthenticated', 'Sign in first.');
  end if;
  if p_mode not in ('anonymise', 'delete') then
    perform public.raise_app_error('validation', 'Choose what happens to your experiences.', '{"mode": "Choose anonymise or delete."}');
  end if;
  if exists (select 1 from public.user_roles r where r.user_id = v_uid and r.role = 'admin')
     and (select count(*) from public.user_roles r where r.role = 'admin') <= 1 then
    perform public.raise_app_error('last_admin', 'You’re the last admin. Make someone else an admin first.');
  end if;

  delete from public.experiences e where e.author_id = v_uid and e.status = 'draft';
  get diagnostics v_drafts = row_count;

  if p_mode = 'anonymise' then
    update public.experiences e set is_anonymous = true where e.author_id = v_uid;
  else
    update public.experiences e set is_anonymous = true, status = 'removed', deleted_at = coalesce(e.deleted_at, now())
    where e.author_id = v_uid;
    update public.comments c set status = 'deleted', deleted_at = now() where c.author_id = v_uid and c.status = 'visible';
    get diagnostics v_comments = row_count;
  end if;
  select count(*) into v_posts from public.experiences e where e.author_id = v_uid;

  perform public.write_audit('account.delete', 'user', v_uid::text,
    jsonb_build_object('mode', p_mode, 'drafts_deleted', v_drafts, 'experiences', v_posts, 'comments_deleted', v_comments));
  return jsonb_build_object('mode', p_mode, 'drafts_deleted', v_drafts, 'experiences', v_posts, 'comments_deleted', v_comments);
end
$$;

revoke execute on function public.prepare_account_deletion(text) from public, anon;
grant execute on function public.prepare_account_deletion(text) to authenticated;
