create table if not exists nutrition_daily_summaries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  summary_date date not null,
  source text not null check (source in ('ios_bridge', 'manual', 'third_party_app', 'photo_estimate', 'nutrition_label')),
  energy_kcal numeric(10, 2),
  protein_g numeric(10, 2),
  carbs_g numeric(10, 2),
  fat_g numeric(10, 2),
  fiber_g numeric(10, 2),
  sugar_g numeric(10, 2),
  sodium_mg numeric(10, 2),
  water_ml numeric(10, 2),
  meal_count integer,
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  notes text,
  generated_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, summary_date)
);

create table if not exists nutrition_meal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references users(id) on delete cascade,
  consumed_at timestamptz not null,
  meal_type text not null default 'unknown' check (meal_type in ('breakfast', 'lunch', 'dinner', 'snack', 'unknown')),
  source text not null check (source in ('ios_bridge', 'manual', 'third_party_app', 'photo_estimate', 'nutrition_label')),
  description text,
  energy_kcal numeric(10, 2),
  protein_g numeric(10, 2),
  carbs_g numeric(10, 2),
  fat_g numeric(10, 2),
  fiber_g numeric(10, 2),
  sugar_g numeric(10, 2),
  sodium_mg numeric(10, 2),
  water_ml numeric(10, 2),
  confidence numeric(4, 3) check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists nutrition_meal_entries_user_time_idx
  on nutrition_meal_entries (user_id, consumed_at desc);
