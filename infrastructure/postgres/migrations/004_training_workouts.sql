create table if not exists training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  agent_id text references agents(id) on delete set null,
  external_id text,
  title text not null,
  description text,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'cancelled')),
  source text not null default 'manual' check (source in ('agent_chat', 'ios_bridge', 'manual', 'import')),
  starts_on date,
  ends_on date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or starts_on is null or ends_on >= starts_on)
);

create unique index if not exists training_plans_idempotency_idx
  on training_plans (user_id, source, external_id)
  where external_id is not null;

create index if not exists training_plans_user_status_idx
  on training_plans (user_id, status, created_at desc);

create table if not exists planned_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  training_plan_id uuid references training_plans(id) on delete set null,
  created_by_agent_id text references agents(id) on delete set null,
  approval_id uuid references approvals(id) on delete set null,
  external_id text,
  title text not null,
  workout_type text not null,
  scheduled_start_at timestamptz,
  scheduled_end_at timestamptz,
  status text not null default 'planned' check (status in ('planned', 'completed', 'skipped', 'cancelled')),
  source text not null default 'manual' check (source in ('agent_chat', 'ios_bridge', 'manual', 'import')),
  target_duration_minutes numeric(10, 2),
  target_energy_kcal numeric(10, 2),
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (scheduled_end_at is null or scheduled_start_at is null or scheduled_end_at > scheduled_start_at),
  check (target_duration_minutes is null or target_duration_minutes >= 0),
  check (target_energy_kcal is null or target_energy_kcal >= 0)
);

create unique index if not exists planned_workouts_idempotency_idx
  on planned_workouts (user_id, source, external_id)
  where external_id is not null;

create index if not exists planned_workouts_user_time_idx
  on planned_workouts (user_id, scheduled_start_at desc);

create table if not exists planned_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  planned_workout_id uuid not null references planned_workouts(id) on delete cascade,
  exercise_key text,
  name text not null,
  order_index integer not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (planned_workout_id, order_index),
  check (order_index >= 0)
);

create table if not exists planned_workout_sets (
  id uuid primary key default gen_random_uuid(),
  planned_exercise_id uuid not null references planned_workout_exercises(id) on delete cascade,
  set_index integer not null,
  set_type text not null default 'working' check (set_type in ('warmup', 'working', 'drop', 'backoff', 'amrap', 'cooldown', 'unknown')),
  target_reps_min integer,
  target_reps_max integer,
  target_weight_kg numeric(10, 3),
  target_duration_seconds integer,
  target_distance_meters numeric(10, 2),
  target_rpe numeric(4, 2),
  rest_seconds integer,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (planned_exercise_id, set_index),
  check (set_index >= 0),
  check (target_reps_min is null or target_reps_min >= 0),
  check (target_reps_max is null or target_reps_max >= 0),
  check (target_reps_max is null or target_reps_min is null or target_reps_max >= target_reps_min),
  check (target_weight_kg is null or target_weight_kg >= 0),
  check (target_duration_seconds is null or target_duration_seconds >= 0),
  check (target_distance_meters is null or target_distance_meters >= 0),
  check (target_rpe is null or (target_rpe >= 0 and target_rpe <= 10)),
  check (rest_seconds is null or rest_seconds >= 0)
);

create table if not exists performed_workouts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  planned_workout_id uuid references planned_workouts(id) on delete set null,
  external_id text,
  workout_type text not null,
  source text not null check (source in ('healthkit', 'ios_bridge', 'manual', 'agent_chat', 'third_party')),
  source_device text not null default 'unknown' check (source_device in ('iphone', 'apple_watch', 'manual', 'mixed', 'unknown')),
  started_at timestamptz not null,
  ended_at timestamptz not null,
  duration_minutes numeric(10, 2),
  active_energy_kcal numeric(10, 2),
  total_energy_kcal numeric(10, 2),
  distance_meters numeric(10, 2),
  average_heart_rate_bpm numeric(6, 2),
  max_heart_rate_bpm numeric(6, 2),
  perceived_effort numeric(4, 2),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ended_at > started_at),
  check (duration_minutes is null or duration_minutes >= 0),
  check (active_energy_kcal is null or active_energy_kcal >= 0),
  check (total_energy_kcal is null or total_energy_kcal >= 0),
  check (distance_meters is null or distance_meters >= 0),
  check (average_heart_rate_bpm is null or average_heart_rate_bpm >= 0),
  check (max_heart_rate_bpm is null or max_heart_rate_bpm >= 0),
  check (perceived_effort is null or (perceived_effort >= 0 and perceived_effort <= 10))
);

create unique index if not exists performed_workouts_idempotency_idx
  on performed_workouts (user_id, source, external_id)
  where external_id is not null;

create index if not exists performed_workouts_user_time_idx
  on performed_workouts (user_id, started_at desc);

create table if not exists performed_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  performed_workout_id uuid not null references performed_workouts(id) on delete cascade,
  planned_exercise_id uuid references planned_workout_exercises(id) on delete set null,
  exercise_key text,
  name text not null,
  order_index integer not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (performed_workout_id, order_index),
  check (order_index >= 0)
);

create table if not exists performed_workout_sets (
  id uuid primary key default gen_random_uuid(),
  performed_exercise_id uuid not null references performed_workout_exercises(id) on delete cascade,
  planned_set_id uuid references planned_workout_sets(id) on delete set null,
  set_index integer not null,
  set_type text not null default 'working' check (set_type in ('warmup', 'working', 'drop', 'backoff', 'amrap', 'cooldown', 'unknown')),
  status text not null default 'completed' check (status in ('completed', 'partial', 'skipped', 'failed')),
  reps integer,
  weight_kg numeric(10, 3),
  duration_seconds integer,
  distance_meters numeric(10, 2),
  rpe numeric(4, 2),
  completed_at timestamptz,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (performed_exercise_id, set_index),
  check (set_index >= 0),
  check (reps is null or reps >= 0),
  check (weight_kg is null or weight_kg >= 0),
  check (duration_seconds is null or duration_seconds >= 0),
  check (distance_meters is null or distance_meters >= 0),
  check (rpe is null or (rpe >= 0 and rpe <= 10))
);
