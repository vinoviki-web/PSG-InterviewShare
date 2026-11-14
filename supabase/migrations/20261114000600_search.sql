-- =====================================================================
-- PSG InterviewShare · 0600 · Search for the explorer (Phase 6)
-- The search_vector mixes 'simple' (company, aliases, role, topics) and
-- 'english' (questions, narrative) lexemes, so the query matches each word
-- as a PREFIX in both configurations: "fresh" → Freshworks, "anagram" →
-- "anagrams", "tcs" → the TCS alias. All words must match (AND).
-- =====================================================================

create or replace function public.search_tsquery(p_q text)
returns tsquery
language plpgsql immutable
set search_path = ''
as $$
declare
  w text;
  part tsquery;
  acc tsquery;
  n int := 0;
begin
  for w in select m[1] from regexp_matches(lower(coalesce(p_q, '')), '([[:alnum:]]+)', 'g') as m loop
    n := n + 1;
    exit when n > 8;  -- bound the query size
    part := to_tsquery('simple', w || ':*') || to_tsquery('english', w || ':*');
    acc := case when acc is null then part else acc && part end;
  end loop;
  return acc;
end
$$;

-- Set-returning so PostgREST can still filter, order, paginate and count
-- on top (rpc('search_feed', { p_q }).in(...).order(...).range(...)).
-- SECURITY INVOKER: the experience_feed view applies every visibility rule.
create or replace function public.search_feed(p_q text default null)
returns setof public.experience_feed
language sql stable
set search_path = ''
as $$
  select f.* from public.experience_feed f
  where coalesce(trim(p_q), '') = '' or f.search_vector @@ public.search_tsquery(p_q)
$$;

revoke execute on function public.search_tsquery(text), public.search_feed(text) from public, anon;
grant execute on function public.search_tsquery(text), public.search_feed(text) to authenticated;
