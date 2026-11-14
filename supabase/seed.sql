-- =====================================================================
-- PSG InterviewShare · LOCAL-ONLY seed (supabase db reset). Demo accounts and two
-- fictional experiences. Reference data (departments, topics, companies)
-- lives in migration 0900 so production gets it without these fixtures.
-- =====================================================================

-- ---------------------------------------------------------------------
-- LOCAL-ONLY demo accounts (never run against production).
-- Sign in locally with email OTP; codes appear in Mailpit (Phase 4).
-- ---------------------------------------------------------------------
-- Token columns must be '' (not NULL): the Auth server can't read NULLs there.
insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change, email_change_token_current, phone_change, phone_change_token, reauthentication_token)
values
  ('00000000-0000-0000-0000-000000000000', '11111111-1111-4111-8111-111111111111', 'authenticated', 'authenticated', '22z201@psgtech.ac.in', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Arjun Prakash"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '22222222-2222-4222-8222-222222222222', 'authenticated', 'authenticated', '21z235@psgtech.ac.in', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Meera Krishnan"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '33333333-3333-4333-8333-333333333333', 'authenticated', 'authenticated', '22e646@psgtech.ac.in', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Platform Admin"}', now(), now(), '', '', '', '', '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000', '44444444-4444-4444-8444-444444444444', 'authenticated', 'authenticated', '22z145@psgtech.ac.in', now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Priya Raman"}', now(), now(), '', '', '', '', '', '', '', '');

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text, jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true), 'email', now(), now(), now()
from auth.users u where u.email like '%@psgtech.ac.in';

update public.profiles p set
  handle = v.handle, department_id = v.dept, graduation_year = v.yr, onboarded_at = now(), bio = v.bio
from (values
  ('11111111-1111-4111-8111-111111111111'::uuid, 'arjun-p', 'cse', 2027::smallint, 'Pre-final year, preparing for SDE roles.'),
  ('22222222-2222-4222-8222-222222222222'::uuid, 'meera-k', 'cse', 2026::smallint, 'Placement rep, CSE ’26.'),
  ('33333333-3333-4333-8333-333333333333'::uuid, 'admin', 'eee', 2026::smallint, ''),
  ('44444444-4444-4444-8444-444444444444'::uuid, 'priya-r', 'it', 2026::smallint, '')
) as v(id, handle, dept, yr, bio)
where p.id = v.id;

insert into public.user_roles (user_id, role, granted_by) values
  ('33333333-3333-4333-8333-333333333333', 'admin', null),
  ('22222222-2222-4222-8222-222222222222', 'moderator', '33333333-3333-4333-8333-333333333333');

-- Two fictional published experiences (one anonymous)
insert into public.experiences (id, author_id, company_id, role_title, opportunity_type, hiring_mode, department_id, graduation_year,
  interview_month, application_process, preparation, advice, difficulty, outcome, is_anonymous, confirmed_own, status, published_at, draft_step)
select 'aaaaaaaa-0000-4000-8000-000000000001'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, c.id, 'SDE Intern', 'internship', 'on_campus', 'it', 2026,
  date '2025-08-01', 'Registered through the placement portal; shortlisted on CGPA.',
  'Two problems a day for three months, plus OS and DBMS revision on weekends.',
  'Trace your approach out loud before coding. They cared about the journey from brute force to optimal.',
  4, 'selected', false, true, 'published', now() - interval '3 days', 5
from public.companies c where c.slug = 'amazon';

insert into public.experiences (id, author_id, company_id, role_title, opportunity_type, hiring_mode, department_id, graduation_year,
  interview_month, preparation, advice, difficulty, outcome, is_anonymous, hide_department, confirmed_own, status, published_at, draft_step)
select 'aaaaaaaa-0000-4000-8000-000000000002'::uuid, '44444444-4444-4444-8444-444444444444'::uuid, c.id, 'Member Technical Staff', 'full_time', 'on_campus', 'it', 2026,
  date '2025-09-01', 'Aptitude from previous papers; C output questions daily.',
  'Practise writing code without autocomplete. The lab round had no IDE support.',
  3, 'not_selected', true, true, true, 'published', now() - interval '1 day', 5
from public.companies c where c.slug = 'zoho-corporation';

insert into public.experience_rounds (id, experience_id, position, round_type, mode, duration_minutes, difficulty, description) values
  ('bbbbbbbb-0000-4000-8000-000000000001', 'aaaaaaaa-0000-4000-8000-000000000001', 1, 'online_assessment', 'online', 90, 3, 'Two coding questions on their platform, proctored with webcam.'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'aaaaaaaa-0000-4000-8000-000000000001', 2, 'technical', 'online', 60, 4, 'Resume walkthrough, then two DSA problems with follow-ups.'),
  ('bbbbbbbb-0000-4000-8000-000000000003', 'aaaaaaaa-0000-4000-8000-000000000002', 1, 'aptitude', 'offline', 60, 3, 'Pen-and-paper aptitude with C output questions. Very tight on time.'),
  ('bbbbbbbb-0000-4000-8000-000000000004', 'aaaaaaaa-0000-4000-8000-000000000002', 2, 'coding', 'offline', 180, 4, 'Lab programming round with five problems of increasing difficulty.');

insert into public.questions (experience_id, round_id, position, body, kind) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 1, 'Longest substring without repeating characters.', 'coding'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'bbbbbbbb-0000-4000-8000-000000000002', 2, 'Number of islands in a grid. Follow-up: what if the grid doesn’t fit in memory?', 'coding'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'bbbbbbbb-0000-4000-8000-000000000004', 1, 'Print a matrix in spiral order.', 'coding');

insert into public.question_topics (question_id, topic_id)
select q.id, t.topic from public.questions q
join (values ('Longest substring without repeating characters.', 'sliding-window'), ('Longest substring without repeating characters.', 'strings'),
             ('Print a matrix in spiral order.', 'arrays')) as t(body, topic) on t.body = q.body;
insert into public.question_topics (question_id, topic_id)
select q.id, 'graphs' from public.questions q where q.body like 'Number of islands%';

insert into public.experience_topics (experience_id, topic_id) values
  ('aaaaaaaa-0000-4000-8000-000000000001', 'sliding-window'), ('aaaaaaaa-0000-4000-8000-000000000001', 'graphs'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'operating-systems'), ('aaaaaaaa-0000-4000-8000-000000000002', 'arrays'),
  ('aaaaaaaa-0000-4000-8000-000000000002', 'quantitative-aptitude');

select public.refresh_experience_search(id) from public.experiences;
