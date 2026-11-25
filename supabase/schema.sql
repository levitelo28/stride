-- Stride database schema, exported read-only from the live Supabase project on 2026-11-25.
-- Reconstructed from the system catalog; review before running against a new project.


-- Functions
create or replace function public.stride_touch_updated_at() returns trigger language plpgsql as $fn$
 begin
  new.updated_at=now();
  if tg_table_name='stride_user_state' then
   new.revision=old.revision+1;
  end if;
  return new;
 end;
$fn$;

-- Tables
create table if not exists public.stride_checkins (
  user_id uuid not null,
  checkin_date date not null,
  energy integer,
  soreness text,
  notes text,
  updated_at timestamp with time zone default now() not null,
  constraint stride_checkins_pkey PRIMARY KEY (user_id, checkin_date),
  constraint stride_checkins_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint stride_checkins_energy_check CHECK (((energy >= 1) AND (energy <= 5)))
);
create table if not exists public.stride_meals (
  user_id uuid not null,
  meal_id text not null,
  meal_date date not null,
  meal_type text,
  name text not null,
  calories integer,
  protein_g numeric(8,2),
  carbs_g numeric(8,2),
  fat_g numeric(8,2),
  photo_path text,
  notes text,
  updated_at timestamp with time zone default now() not null,
  constraint stride_meals_pkey PRIMARY KEY (user_id, meal_id),
  constraint stride_meals_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint stride_meals_calories_check CHECK (((calories >= 0) AND (calories <= 50000)))
);
create table if not exists public.stride_runs (
  user_id uuid not null,
  run_id text not null,
  run_date date not null,
  distance_km numeric(8,3) not null,
  elapsed_seconds integer not null,
  source text default 'Manual'::text not null,
  avg_hr integer,
  effort text,
  notes text,
  updated_at timestamp with time zone default now() not null,
  constraint stride_runs_pkey PRIMARY KEY (user_id, run_id),
  constraint stride_runs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint stride_runs_avg_hr_check CHECK (((avg_hr >= 20) AND (avg_hr <= 250))),
  constraint stride_runs_distance_km_check CHECK (((distance_km > (0)::numeric) AND (distance_km < (1000)::numeric))),
  constraint stride_runs_elapsed_seconds_check CHECK ((elapsed_seconds > 0))
);
create table if not exists public.stride_sleep (
  user_id uuid not null,
  sleep_date date not null,
  source text default 'Manual'::text not null,
  hours numeric(5,2) not null,
  updated_at timestamp with time zone default now() not null,
  constraint stride_sleep_pkey PRIMARY KEY (user_id, sleep_date, source),
  constraint stride_sleep_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint stride_sleep_hours_check CHECK (((hours >= (0)::numeric) AND (hours <= (24)::numeric)))
);
create table if not exists public.stride_strength_sessions (
  user_id uuid not null,
  session_date date not null,
  routine text not null,
  exercises jsonb default '{}'::jsonb not null,
  completed boolean default false not null,
  updated_at timestamp with time zone default now() not null,
  constraint stride_strength_sessions_pkey PRIMARY KEY (user_id, session_date),
  constraint stride_strength_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);
create table if not exists public.stride_training_overrides (
  user_id uuid not null,
  training_date date not null,
  activity text not null,
  planned_km numeric(7,2),
  instructions text,
  updated_at timestamp with time zone default now() not null,
  constraint stride_training_overrides_pkey PRIMARY KEY (user_id, training_date),
  constraint stride_training_overrides_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint stride_training_overrides_planned_km_check CHECK (((planned_km >= (0)::numeric) AND (planned_km <= (100)::numeric)))
);
create table if not exists public.stride_user_state (
  user_id uuid not null,
  state jsonb default '{}'::jsonb not null,
  revision bigint default 1 not null,
  updated_at timestamp with time zone default now() not null,
  constraint stride_user_state_pkey PRIMARY KEY (user_id),
  constraint stride_user_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE,
  constraint stride_user_state_revision_check CHECK ((revision >= 1))
);

-- Indexes
CREATE INDEX stride_meals_date_idx ON public.stride_meals USING btree (user_id, meal_date DESC);
CREATE INDEX stride_runs_date_idx ON public.stride_runs USING btree (user_id, run_date DESC);

-- Row level security
alter table public.stride_checkins enable row level security;
alter table public.stride_meals enable row level security;
alter table public.stride_runs enable row level security;
alter table public.stride_sleep enable row level security;
alter table public.stride_strength_sessions enable row level security;
alter table public.stride_training_overrides enable row level security;
alter table public.stride_user_state enable row level security;

-- Triggers
CREATE TRIGGER stride_checkins_touch BEFORE UPDATE ON public.stride_checkins FOR EACH ROW EXECUTE FUNCTION stride_touch_updated_at();
CREATE TRIGGER stride_meals_touch BEFORE UPDATE ON public.stride_meals FOR EACH ROW EXECUTE FUNCTION stride_touch_updated_at();
CREATE TRIGGER stride_runs_touch BEFORE UPDATE ON public.stride_runs FOR EACH ROW EXECUTE FUNCTION stride_touch_updated_at();
CREATE TRIGGER stride_sleep_touch BEFORE UPDATE ON public.stride_sleep FOR EACH ROW EXECUTE FUNCTION stride_touch_updated_at();
CREATE TRIGGER stride_strength_sessions_touch BEFORE UPDATE ON public.stride_strength_sessions FOR EACH ROW EXECUTE FUNCTION stride_touch_updated_at();
CREATE TRIGGER stride_training_overrides_touch BEFORE UPDATE ON public.stride_training_overrides FOR EACH ROW EXECUTE FUNCTION stride_touch_updated_at();
CREATE TRIGGER stride_user_state_touch BEFORE UPDATE ON public.stride_user_state FOR EACH ROW EXECUTE FUNCTION stride_touch_updated_at();

-- Policies
create policy stride_meals_delete_own on storage.objects for DELETE to authenticated using (((bucket_id = 'meal-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy stride_meals_insert_own on storage.objects for INSERT to authenticated with check (((bucket_id = 'meal-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy stride_meals_read_own on storage.objects for SELECT to authenticated using (((bucket_id = 'meal-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy stride_meals_update_own on storage.objects for UPDATE to authenticated using (((bucket_id = 'meal-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text))) with check (((bucket_id = 'meal-photos'::text) AND ((storage.foldername(name))[1] = (( SELECT auth.uid() AS uid))::text)));
create policy stride_checkins_delete_own on public.stride_checkins for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_checkins_insert_own on public.stride_checkins for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_checkins_select_own on public.stride_checkins for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_checkins_update_own on public.stride_checkins for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_meals_delete_own on public.stride_meals for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_meals_insert_own on public.stride_meals for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_meals_select_own on public.stride_meals for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_meals_update_own on public.stride_meals for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_runs_delete_own on public.stride_runs for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_runs_insert_own on public.stride_runs for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_runs_select_own on public.stride_runs for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_runs_update_own on public.stride_runs for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_sleep_delete_own on public.stride_sleep for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_sleep_insert_own on public.stride_sleep for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_sleep_select_own on public.stride_sleep for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_sleep_update_own on public.stride_sleep for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_strength_sessions_delete_own on public.stride_strength_sessions for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_strength_sessions_insert_own on public.stride_strength_sessions for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_strength_sessions_select_own on public.stride_strength_sessions for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_strength_sessions_update_own on public.stride_strength_sessions for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_training_overrides_delete_own on public.stride_training_overrides for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_training_overrides_insert_own on public.stride_training_overrides for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_training_overrides_select_own on public.stride_training_overrides for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_training_overrides_update_own on public.stride_training_overrides for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_user_state_delete_own on public.stride_user_state for DELETE to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_user_state_insert_own on public.stride_user_state for INSERT to authenticated with check ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_user_state_select_own on public.stride_user_state for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy stride_user_state_update_own on public.stride_user_state for UPDATE to authenticated using ((( SELECT auth.uid() AS uid) = user_id)) with check ((( SELECT auth.uid() AS uid) = user_id));

-- Views
create or replace view public.stride_coach_inputs with (security_invoker=true) as
 SELECT user_id,
    COALESCE(( SELECT jsonb_agg(jsonb_build_object('date', (r.value ->> 'date'::text), 'distance', (r.value ->> 'distance'::text), 'seconds', (r.value ->> 'seconds'::text), 'rpe', (r.value ->> 'rpe'::text), 'source', 'Manual')) AS jsonb_agg
           FROM jsonb_array_elements(
                CASE
                    WHEN (jsonb_typeof((stride_user_state.state -> 'runLogs'::text)) = 'array'::text) THEN (stride_user_state.state -> 'runLogs'::text)
                    ELSE '[]'::jsonb
                END) r(value)
          WHERE ((r.value ->> 'source'::text) = 'Manual'::text)), '[]'::jsonb) AS manual_runs,
    COALESCE((state -> 'customWorkouts'::text), '[]'::jsonb) AS custom_workouts,
    COALESCE((state -> 'sleep'::text), '[]'::jsonb) AS manual_sleep,
    COALESCE((state -> 'recoveryCheckins'::text), '{}'::jsonb) AS recovery,
    "left"(COALESCE(((state -> 'prefs'::text) ->> 'goal'::text), 'Complete a marathon safely'::text), 140) AS goal
   FROM stride_user_state;

-- Storage buckets
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('meal-photos','meal-photos',false,8388608,'{image/jpeg,image/png,image/webp}'::text[]) on conflict (id) do nothing;
