-- Phase 10: security invariants across the WHOLE schema. These fail if any
-- future migration forgets a protection (RLS, grants, search_path …).
begin;
\ir helpers.psql
select no_plan();

-- Row-level security everywhere
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  '', 'every public table has row-level security enabled');

-- Visitors (anon) can't touch any table or view
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'v', 'm')
     and (has_table_privilege('anon', c.oid, 'select') or has_table_privilege('anon', c.oid, 'insert')
          or has_table_privilege('anon', c.oid, 'update') or has_table_privilege('anon', c.oid, 'delete'))),
  '', 'visitors have no privileges on any table or view');

-- The only function a visitor may call
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and has_function_privilege('anon', p.oid, 'execute')),
  'get_public_stats', 'visitors can execute only get_public_stats()');

-- Every SECURITY DEFINER function pins search_path
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.prosecdef and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%')),
  '', 'every SECURITY DEFINER function sets search_path');

-- Internal helpers (leading underscore) are never callable by signed-in users
select is(
  (select coalesce(string_agg(p.proname, ', ' order by p.proname), '') from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname like '\_%' and has_function_privilege('authenticated', p.oid, 'execute')),
  '', 'no internal helper is callable by students');

select ok(not has_function_privilege('authenticated', 'public.write_audit(text, text, text, jsonb)', 'execute'), 'students can’t write audit rows');
select ok(not has_function_privilege('authenticated', 'public.notify_user(uuid, text, jsonb)', 'execute'), 'students can’t send notifications');
select ok(not has_function_privilege('authenticated', 'public.refresh_experience_search(uuid)', 'execute'), 'students can’t rebuild search vectors');

-- Writes students may NOT make directly
select ok(not has_table_privilege('authenticated', 'public.user_roles', 'insert') and not has_table_privilege('authenticated', 'public.user_roles', 'update'), 'nobody can write roles directly');
select ok(not has_table_privilege('authenticated', 'public.audit_logs', 'insert'), 'nobody can insert audit rows directly');
select ok(not has_table_privilege('authenticated', 'public.experiences', 'insert') and not has_table_privilege('authenticated', 'public.experiences', 'update'), 'experiences are written only through RPCs');
select ok(not has_table_privilege('authenticated', 'public.reports', 'insert'), 'reports are filed only through the RPC');
select ok(not has_column_privilege('authenticated', 'public.profiles', 'status', 'update')
          and not has_column_privilege('authenticated', 'public.profiles', 'onboarded_at', 'update')
          and not has_column_privilege('authenticated', 'public.profiles', 'suspended_until', 'update'), 'students can’t edit protected profile columns');
select ok(not has_column_privilege('authenticated', 'public.comments', 'author_id', 'update'), 'comment authorship can’t be changed');

-- Masked read views are security barriers
select is(
  (select coalesce(string_agg(c.relname, ', ' order by c.relname), '') from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'v' and not coalesce('security_barrier=true' = any (c.reloptions), false)),
  '', 'every public view is a security barrier');

-- Storage
select ok((select not public from storage.buckets where id = 'avatars'), 'the avatars bucket is private');
select ok((select allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'] from storage.buckets where id = 'avatars'), 'avatar uploads are limited to PNG, JPEG and WebP');

-- Auth domain guard is wired
select ok(exists (select 1 from pg_trigger where tgname = 'enforce_psg_domain' and tgrelid = 'auth.users'::regclass and tgenabled <> 'D'), 'the PSG domain trigger is active on auth.users');

select * from finish();
rollback;
