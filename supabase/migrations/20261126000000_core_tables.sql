-- Stride 2.0 core tables: one row per activity, per daily metric, per plan and planned session.
-- Replaces the single JSON record (stride_user_state) as the source of truth for the new app.
-- The v9 web app keeps using stride_user_state; the new app copies from it (idempotently) until v9 is retired.
-- Every table is private to its owner via row-level security.

-- Activities: anything the user actually did.
create table public.activities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  source text not null check (source in ('manual', 'apple_health', 'health_connect', 'strava_csv', 'legacy')),
  -- ID in the source system (HealthKit UUID, Strava activity ID, "v9:<id>" for web-app records). Used to dedupe re-imports.
  external_id text,
  kind text not null check (kind in ('run', 'walk', 'ride', 'swim', 'strength', 'mobility', 'other')),
  name text check (char_length(name) <= 200),
  local_date date not null,
  started_at timestamptz,
  duration_sec integer check (duration_sec > 0 and duration_sec < 172800),
  distance_km numeric(8, 3) check (distance_km >= 0 and distance_km < 1000),
  avg_hr smallint check (avg_hr between 20 and 250),
  max_hr smallint check (max_hr between 20 and 250),
  energy_kcal integer check (energy_kcal >= 0 and energy_kcal < 50000),
  elevation_gain_m integer check (elevation_gain_m >= 0 and elevation_gain_m < 20000),
  rpe smallint check (rpe between 1 and 10),
  notes text check (char_length(notes) <= 2000),
  device text check (char_length(device) <= 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint activities_source_external_key unique (user_id, source, external_id)
);
create index activities_user_date_idx on public.activities (user_id, local_date desc);

-- Daily metrics: one value per user, day, metric and source (sleep, resting HR, HRV, steps, ...).
create table public.daily_metrics (
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  local_date date not null,
  metric text not null check (metric in ('sleep_hours', 'resting_hr', 'hrv_sdnn_ms', 'steps', 'vo2max', 'weight_kg')),
  value numeric(10, 2) not null check (value >= 0),
  source text not null check (source in ('manual', 'apple_health', 'health_connect', 'strava_csv', 'legacy')),
  updated_at timestamptz not null default now(),
  primary key (user_id, local_date, metric, source)
);

-- Plans: a goal plus its schedule. At most one active plan per user.
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  source text not null check (source in ('rules', 'coach', 'legacy')),
  goal jsonb not null check (jsonb_typeof(goal) = 'object'),
  warnings text[] not null default '{}',
  -- For plans copied from the v9 web app: a hash of the copied sessions, so changes made in v9 can be re-synced.
  legacy_fingerprint text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint plans_id_user_key unique (id, user_id)
);
create unique index plans_one_active_per_user on public.plans (user_id) where status = 'active';

create table public.plan_sessions (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null,
  user_id uuid not null default auth.uid(),
  local_date date not null,
  kind text not null check (kind in ('run', 'long', 'event', 'strength', 'other')),
  label text not null check (char_length(label) between 1 and 200),
  distance_km numeric(6, 2) check (distance_km > 0 and distance_km < 500),
  minutes integer check (minutes > 0 and minutes < 1440),
  note text check (char_length(note) <= 1000),
  edited boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- The composite key guarantees a session can only belong to a plan owned by the same user.
  constraint plan_sessions_plan_fkey foreign key (plan_id, user_id) references public.plans (id, user_id) on delete cascade
);
create index plan_sessions_plan_date_idx on public.plan_sessions (plan_id, local_date);
create index plan_sessions_user_date_idx on public.plan_sessions (user_id, local_date);

-- updated_at maintenance (function already exists from the v9 setup).
create trigger activities_touch before update on public.activities
  for each row execute function public.stride_touch_updated_at();
create trigger daily_metrics_touch before update on public.daily_metrics
  for each row execute function public.stride_touch_updated_at();
create trigger plans_touch before update on public.plans
  for each row execute function public.stride_touch_updated_at();
create trigger plan_sessions_touch before update on public.plan_sessions
  for each row execute function public.stride_touch_updated_at();

-- Row-level security: owners only, signed-in users only.
alter table public.activities enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.plans enable row level security;
alter table public.plan_sessions enable row level security;

do $$
declare t text;
begin
  foreach t in array array['activities', 'daily_metrics', 'plans', 'plan_sessions'] loop
    execute format('create policy %I on public.%I for select to authenticated using ((select auth.uid()) = user_id)', t || '_select_own', t);
    execute format('create policy %I on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)', t || '_insert_own', t);
    execute format('create policy %I on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)', t || '_update_own', t);
    execute format('create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)', t || '_delete_own', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
