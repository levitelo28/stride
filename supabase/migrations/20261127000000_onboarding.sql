-- Launch prep: remember when a user finished the first-run intro, so it shows once per account (not per device).
alter table public.profiles add column onboarded_at timestamptz;
