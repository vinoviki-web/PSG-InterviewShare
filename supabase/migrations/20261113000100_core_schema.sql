-- =====================================================================
-- Roundwise · 0100 · Core schema
-- Tables, enums, constraints, indexes. Security (RLS, grants) lives in
-- 0300; behaviour (functions, triggers, RPCs) in 0200.
-- Spec: docs/01-product-discovery.md §9, docs/DECISIONS.md
-- =====================================================================

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------- enums
create type public.app_role            as enum ('moderator', 'admin');
create type public.account_status      as enum ('active', 'suspended');
create type public.profile_visibility  as enum ('public_psg', 'private');
create type public.opportunity_type    as enum ('internship', 'full_time', 'intern_ppo', 'intern_fte');
create type public.hiring_mode         as enum ('on_campus', 'off_campus', 'referral', 'other');
create type public.outcome             as enum ('selected', 'not_selected', 'awaiting', 'withdrew', 'undisclosed');
create type public.experience_status   as enum ('draft', 'published', 'hidden', 'removed');
create type public.round_type          as enum ('online_assessment', 'aptitude', 'coding', 'technical', 'system_design', 'group_discussion', 'managerial', 'hr', 'other');
create type public.round_mode          as enum ('online', 'offline');
create type public.question_kind       as enum ('coding', 'technical', 'hr', 'behavioral', 'aptitude', 'puzzle');
create type public.resource_kind       as enum ('course', 'book', 'practice', 'video', 'other');
create type public.comment_status      as enum ('visible', 'hidden', 'deleted', 'removed');
create type public.report_target       as enum ('experience', 'comment', 'profile');
create type public.report_reason       as enum ('spam', 'misleading', 'confidential', 'abusive', 'privacy', 'other');
create type public.report_status       as enum ('open', 'escalated', 'dismissed', 'actioned');
create type public.description_source  as enum ('admin_curated', 'official_site');

-- ---------------------------------------------------------------- lookups
create table public.departments (
  id         text primary key check (id ~ '^[a-z0-9-]{2,20}$'),
  code       text not null unique check (char_length(code) between 2 and 12),
  name       text not null check (char_length(name) between 2 and 120),
  degree     text not null check (degree in ('BE', 'BTech', 'ME', 'MTech', 'MSc', 'MCA', 'MBA', 'Other')),
  sort       smallint not null default 0,
  is_active  boolean not null default true
);

create table public.topics (
  id          text primary key check (id ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (char_length(name) between 2 and 60),
  group_name  text not null check (char_length(group_name) between 2 and 60),
  sort        smallint not null default 0
);

-- ---------------------------------------------------------------- people
create table public.profiles (
  id                       uuid primary key references auth.users (id) on delete cascade,
  full_name                text not null default '' check (char_length(full_name) <= 80),
  handle                   text unique check (handle ~ '^[a-z0-9-]{3,30}$'),
  handle_changed_at        timestamptz,
  department_id            text references public.departments (id),
  graduation_year          smallint check (graduation_year between 2000 and 2100),
  avatar_path              text check (char_length(avatar_path) <= 300),
  bio                      text not null default '' check (char_length(bio) <= 280),
  interests                text[] not null default '{}' check (cardinality(interests) <= 10),
  topic_ids                text[] not null default '{}' check (cardinality(topic_ids) <= 10),
  profile_visibility       public.profile_visibility not null default 'public_psg',
  default_anonymous        boolean not null default false,
  default_hide_department  boolean not null default false,
  status                   public.account_status not null default 'active',
  suspended_until          timestamptz,
  suspension_reason        text check (char_length(suspension_reason) <= 300),
  onboarded_at             timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint onboarded_requires_fields check (
    onboarded_at is null
    or (char_length(trim(full_name)) >= 2 and department_id is not null and graduation_year is not null and handle is not null)
  )
);
comment on table public.profiles is 'One row per auth user. Email deliberately lives only in auth.users (D8). No role column: see user_roles.';

-- Roles: students are implicit. Only admin_set_role() writes here (C6).
create table public.user_roles (
  user_id     uuid not null references public.profiles (id) on delete cascade,
  role        public.app_role not null,
  granted_by  uuid references public.profiles (id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, role)
);

-- ---------------------------------------------------------------- companies
create table public.companies (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (char_length(trim(name)) between 1 and 120),
  slug                text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 80),
  industry            text check (char_length(industry) <= 60),
  website             text check (website ~ '^[a-z0-9.-]+\.[a-z]{2,}(/[^\s]*)?$' and char_length(website) <= 200),
  logo_path           text check (char_length(logo_path) <= 300),
  description         text check (char_length(description) <= 1000),
  description_source  public.description_source,
  is_verified         boolean not null default false,
  merged_into_id      uuid references public.companies (id),
  created_by          uuid references public.profiles (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint not_merged_into_self check (merged_into_id is distinct from id),
  constraint description_has_source check (description is null or description_source is not null)
);
create unique index companies_name_unique on public.companies (lower(name)) where merged_into_id is null;
create index companies_name_trgm on public.companies using gin (name extensions.gin_trgm_ops);

create table public.company_aliases (
  company_id  uuid not null references public.companies (id) on delete cascade,
  alias       text not null check (char_length(trim(alias)) between 1 and 60),
  primary key (company_id, alias)
);
create unique index company_aliases_unique on public.company_aliases (lower(alias));

-- ---------------------------------------------------------------- experiences
create table public.experiences (
  id                  uuid primary key default gen_random_uuid(),
  -- null after the author deletes their account and chose "keep anonymised" (D14)
  author_id           uuid references public.profiles (id) on delete set null,
  company_id          uuid references public.companies (id),
  new_company_name    text check (char_length(trim(new_company_name)) between 2 and 120),
  role_title          text check (char_length(trim(role_title)) between 2 and 100),
  opportunity_type    public.opportunity_type,
  hiring_mode         public.hiring_mode,
  department_id       text references public.departments (id),
  graduation_year     smallint check (graduation_year between 2000 and 2100),
  interview_month     date check (interview_month is null or (extract(day from interview_month) = 1 and interview_month >= date '2015-01-01')),
  eligibility         jsonb check (eligibility is null or jsonb_typeof(eligibility) = 'object'),
  application_process text check (char_length(application_process) <= 2000),
  preparation         text check (char_length(preparation) <= 5000),
  advice              text check (char_length(advice) <= 3000),
  difficulty          smallint check (difficulty between 1 and 5),
  outcome             public.outcome,
  is_anonymous        boolean not null default false,
  hide_department     boolean not null default false,
  confirmed_own       boolean not null default false,
  status              public.experience_status not null default 'draft',
  draft_step          smallint not null default 1 check (draft_step between 1 and 5),
  hidden_reason       text check (char_length(hidden_reason) <= 300),
  duplicate_of        uuid references public.experiences (id) on delete set null,
  duplicate_reason    text check (char_length(duplicate_reason) <= 200),
  published_at        timestamptz,
  edited              boolean not null default false,
  version             integer not null default 1,
  helpful_count       integer not null default 0 check (helpful_count >= 0),
  comment_count       integer not null default 0 check (comment_count >= 0),
  view_count          integer not null default 0 check (view_count >= 0),
  search_vector       tsvector,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz,
  -- Anything past draft must be complete. The publish RPC checks this first
  -- with friendly errors; the constraint is the backstop.
  constraint non_draft_is_complete check (
    status = 'draft' or (
      company_id is not null and role_title is not null and opportunity_type is not null and hiring_mode is not null
      and department_id is not null and graduation_year is not null and interview_month is not null
      and difficulty is not null and outcome is not null and published_at is not null and confirmed_own
    )
  ),
  constraint anonymous_if_authorless check (author_id is not null or is_anonymous),
  constraint hide_department_only_if_anonymous check (not hide_department or is_anonymous)
);
create index experiences_feed_idx on public.experiences (published_at desc, id desc) where status = 'published';
create index experiences_helpful_idx on public.experiences (helpful_count desc, published_at desc) where status = 'published';
create index experiences_company_idx on public.experiences (company_id, published_at desc);
create index experiences_author_idx on public.experiences (author_id, status);
create index experiences_dept_year_idx on public.experiences (department_id, graduation_year) where status = 'published';
create index experiences_search_idx on public.experiences using gin (search_vector);
-- One experience per author per drive, unless they explain why (spec §9.9)
create unique index experiences_no_duplicate_drive on public.experiences (author_id, company_id, lower(role_title), opportunity_type, graduation_year)
  where status in ('published', 'hidden') and duplicate_reason is null;

create table public.experience_rounds (
  id                uuid primary key default gen_random_uuid(),
  experience_id     uuid not null references public.experiences (id) on delete cascade,
  position          smallint not null check (position between 1 and 12),
  round_type        public.round_type not null,
  mode              public.round_mode,
  duration_minutes  smallint check (duration_minutes between 1 and 600),
  difficulty        smallint check (difficulty between 1 and 5),
  description       text check (char_length(description) <= 4000),
  unique (experience_id, position)
);

create table public.questions (
  id             uuid primary key default gen_random_uuid(),
  experience_id  uuid not null references public.experiences (id) on delete cascade,
  round_id       uuid not null references public.experience_rounds (id) on delete cascade,
  position       smallint not null check (position between 1 and 25),
  body           text not null check (char_length(trim(body)) between 3 and 2000),
  kind           public.question_kind not null,
  -- Normalised text powers "Also reported in N other experiences"
  body_norm      text generated always as (trim(regexp_replace(lower(body), '[^a-z0-9]+', ' ', 'g'))) stored,
  unique (round_id, position)
);
create index questions_experience_idx on public.questions (experience_id);
create index questions_body_norm_idx on public.questions (body_norm);

create table public.question_topics (
  question_id  uuid not null references public.questions (id) on delete cascade,
  topic_id     text not null references public.topics (id),
  primary key (question_id, topic_id)
);
create index question_topics_topic_idx on public.question_topics (topic_id);

create table public.experience_topics (
  experience_id  uuid not null references public.experiences (id) on delete cascade,
  topic_id       text not null references public.topics (id),
  primary key (experience_id, topic_id)
);
create index experience_topics_topic_idx on public.experience_topics (topic_id);

create table public.experience_resources (
  id             uuid primary key default gen_random_uuid(),
  experience_id  uuid not null references public.experiences (id) on delete cascade,
  position       smallint not null check (position between 1 and 15),
  title          text not null check (char_length(trim(title)) between 1 and 120),
  url            text not null check (url ~ '^https://[^\s<>"]+$' and char_length(url) <= 500),
  kind           public.resource_kind not null default 'other',
  unique (experience_id, position)
);

-- ---------------------------------------------------------------- community
create table public.helpful_votes (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  experience_id  uuid not null references public.experiences (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, experience_id)
);
create index helpful_votes_experience_idx on public.helpful_votes (experience_id);

create table public.bookmarks (
  user_id        uuid not null references public.profiles (id) on delete cascade,
  experience_id  uuid not null references public.experiences (id) on delete cascade,
  created_at     timestamptz not null default now(),
  primary key (user_id, experience_id)
);

create table public.experience_views (
  user_id         uuid not null references public.profiles (id) on delete cascade,
  experience_id   uuid not null references public.experiences (id) on delete cascade,
  last_viewed_at  timestamptz not null default now(),
  primary key (user_id, experience_id)
);
create index experience_views_recent_idx on public.experience_views (user_id, last_viewed_at desc);

create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  experience_id  uuid not null references public.experiences (id) on delete cascade,
  author_id      uuid references public.profiles (id) on delete set null default auth.uid(),
  parent_id      uuid references public.comments (id) on delete cascade,
  body           text not null check (char_length(trim(body)) between 2 and 2000),
  status         public.comment_status not null default 'visible',
  created_at     timestamptz not null default now(),
  edited_at      timestamptz,
  deleted_at     timestamptz,
  constraint not_own_parent check (parent_id is distinct from id)
);
create index comments_experience_idx on public.comments (experience_id, created_at);
create index comments_author_recent_idx on public.comments (author_id, created_at desc);

-- ---------------------------------------------------------------- moderation
create table public.reports (
  id           uuid primary key default gen_random_uuid(),
  reporter_id  uuid references public.profiles (id) on delete set null,
  target_type  public.report_target not null,
  target_id    uuid not null,
  reason       public.report_reason not null,
  details      text not null default '' check (char_length(details) <= 1000),
  status       public.report_status not null default 'open',
  resolution   text check (char_length(resolution) <= 300),
  resolved_by  uuid references public.profiles (id) on delete set null,
  resolved_at  timestamptz,
  created_at   timestamptz not null default now(),
  unique (reporter_id, target_type, target_id)
);
create index reports_target_idx on public.reports (target_type, target_id, status);
create index reports_open_idx on public.reports (created_at) where status in ('open', 'escalated');

create table public.moderation_actions (
  id           bigint generated always as identity primary key,
  actor_id     uuid references public.profiles (id) on delete set null,
  target_type  public.report_target not null,
  target_id    uuid not null,
  action       text not null check (action in ('hide', 'restore', 'remove', 'dismiss', 'escalate', 'suspend_user', 'unsuspend_user', 'reveal_author')),
  reason       text check (char_length(reason) <= 500),
  before       jsonb,
  report_ids   uuid[] not null default '{}',
  created_at   timestamptz not null default now()
);
create index moderation_actions_target_idx on public.moderation_actions (target_type, target_id);

-- Append-only. Written by triggers / SECURITY DEFINER functions only.
create table public.audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid,              -- null = system
  action      text not null check (char_length(action) <= 60),
  entity      text not null check (char_length(entity) <= 40),
  entity_id   text,
  metadata    jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
create index audit_logs_entity_idx on public.audit_logs (entity, entity_id);

create table public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles (id) on delete cascade,
  type        text not null check (char_length(type) <= 40),
  payload     jsonb not null default '{}',
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);

-- Single-row settings table
create table public.platform_settings (
  id                        boolean primary key default true check (id),
  announcement              jsonb not null default '{"text": "", "tone": "info", "expires_at": null}',
  flags                     jsonb not null default '{"comments": true, "anonymous_posting": true, "new_companies": true}',
  limits                    jsonb not null default '{"publish_per_day": 5, "comments_per_hour": 30, "reports_per_day": 20, "auto_hide_threshold": 3}',
  landing_stats_threshold   integer not null default 25 check (landing_stats_threshold between 0 and 10000),
  updated_at                timestamptz not null default now(),
  updated_by                uuid references public.profiles (id) on delete set null
);
insert into public.platform_settings (id) values (true);
