alter table nutrition_meal_entries
  add column if not exists external_id text;

create unique index if not exists nutrition_meal_entries_idempotency_idx
  on nutrition_meal_entries (user_id, source, external_id)
  where external_id is not null;
