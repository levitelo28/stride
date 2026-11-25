-- AI coach: per-user consent and a history of coach reviews. Owner-only under RLS.

create table public.profiles (
  user_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  -- When the user agreed to send their training summary to the AI coach; null = not agreed / withdrawn.
  ai_coach_consent_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.coach_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind text not null default 'weekly' check (kind in ('weekly')),
  review jsonb not null check (jsonb_typeof(review) = 'object'),
  model text,
  input_tokens integer,
  output_tokens integer,
  created_at timestamptz not null default now()
);
create index coach_reviews_user_created_idx on public.coach_reviews (user_id, created_at desc);

create trigger profiles_touch before update on public.profiles
  for each row execute function public.stride_touch_updated_at();

alter table public.profiles enable row level security;
alter table public.coach_reviews enable row level security;

create policy profiles_select_own on public.profiles for select to authenticated using ((select auth.uid()) = user_id);
create policy profiles_insert_own on public.profiles for insert to authenticated with check ((select auth.uid()) = user_id);
create policy profiles_update_own on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- Reviews are written by the coach function (acting as the signed-in user) and are never edited.
create policy coach_reviews_select_own on public.coach_reviews for select to authenticated using ((select auth.uid()) = user_id);
create policy coach_reviews_insert_own on public.coach_reviews for insert to authenticated with check ((select auth.uid()) = user_id);
create policy coach_reviews_delete_own on public.coach_reviews for delete to authenticated using ((select auth.uid()) = user_id);

revoke all on public.profiles from anon;
revoke all on public.coach_reviews from anon;
