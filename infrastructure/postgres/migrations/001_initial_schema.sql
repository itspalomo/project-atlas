create extension if not exists pgcrypto;

create table if not exists users (
  id text primary key,
  display_name text not null,
  kind text not null default 'person' check (kind in ('person', 'family')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agents (
  id text primary key,
  display_name text not null,
  agent_type text not null check (agent_type in ('personal', 'shared')),
  hermes_profile text not null unique,
  honcho_workspace text not null,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists agent_memberships (
  agent_id text not null references agents(id) on delete cascade,
  user_id text not null references users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (agent_id, user_id)
);

create table if not exists identity_channels (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  channel text not null check (channel in ('whatsapp', 'ios_bridge')),
  external_id text not null,
  agent_id text not null references agents(id) on delete restrict,
  is_enabled boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (channel, external_id)
);

create table if not exists bridge_devices (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  display_name text not null,
  token_hash text not null,
  is_enabled boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists health_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  summary_date date not null,
  source text not null check (source in ('iphone', 'apple_watch', 'manual', 'mixed')),
  steps integer,
  active_energy_kcal numeric(10, 2),
  exercise_minutes numeric(10, 2),
  stand_minutes numeric(10, 2),
  sleep_minutes numeric(10, 2),
  weight_kg numeric(10, 3),
  workouts jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, summary_date)
);

create table if not exists calendar_busy_blocks (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  availability_type text not null default 'busy' check (availability_type in ('busy', 'tentative', 'out_of_office')),
  source_calendar_hash text,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create index if not exists calendar_busy_blocks_user_time_idx
  on calendar_busy_blocks (user_id, starts_at, ends_at);

create table if not exists calendar_events (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  external_event_hash text not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  title text,
  location_label text,
  visibility text not null default 'busy_only' check (visibility in ('busy_only', 'title', 'full')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, external_event_hash)
);

create table if not exists reminders (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  external_reminder_id text,
  title text not null,
  notes text,
  due_at timestamptz,
  status text not null default 'open' check (status in ('open', 'completed', 'cancelled')),
  created_by_agent_id text references agents(id) on delete set null,
  approval_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  user_id text references users(id) on delete cascade,
  agent_id text references agents(id) on delete cascade,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists approvals (
  id uuid primary key default gen_random_uuid(),
  target_user_id text not null references users(id) on delete cascade,
  agent_id text not null references agents(id) on delete cascade,
  requested_by_agent_id text references agents(id) on delete set null,
  action_type text not null,
  action_payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'executed')),
  decided_by_user_id text references users(id) on delete set null,
  decision_reason text,
  decided_at timestamptz,
  executed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists approvals_pending_user_idx
  on approvals (target_user_id, created_at)
  where status = 'pending';

create table if not exists shared_memory_grants (
  id uuid primary key default gen_random_uuid(),
  source_user_id text not null references users(id) on delete cascade,
  target_agent_id text not null references agents(id) on delete cascade,
  source_workspace text not null,
  target_workspace text not null,
  scope text not null,
  source_ref text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  approved_by_user_id text not null references users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz
);

create table if not exists location_signals (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  observed_at timestamptz not null,
  semantic_place text not null check (semantic_place in ('home', 'work', 'gym', 'school', 'unknown')),
  confidence numeric(4, 3) not null check (confidence >= 0 and confidence <= 1),
  source text not null check (source in ('ios', 'manual')),
  created_at timestamptz not null default now()
);

create index if not exists location_signals_user_time_idx
  on location_signals (user_id, observed_at desc);

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_id text references users(id) on delete set null,
  action text not null,
  subject_type text,
  subject_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index if not exists audit_logs_created_at_idx
  on audit_logs (created_at desc);
