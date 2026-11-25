# Supabase backend (project `tlslogvdbwjttfehesrr`, "Stride")

`schema.sql` was exported read-only from the live project on 2026-11-25. It covers the tables, row-level security policies, triggers, the `stride_coach_inputs` view and the `meal-photos` storage bucket.

## State on 2026-11-25
- **Used by the app:** `stride_user_state` (one JSON blob per user, currently 3 runs, revision 8) and `stride_training_overrides` (57 planned sessions).
- **Created but empty, never used by the app:** `stride_runs`, `stride_meals`, `stride_sleep`, `stride_checkins`, `stride_strength_sessions`. `stride_runs` already has the per-run shape Phase 1 needs (`run_id` primary key, `source`).
- **Edge functions:** none deployed. `stride-coach` and `analyze-meal`, which `cloud.js` calls, were never deployed and aren't in any of the downloaded ZIPs (v8 included); ChatGPT described them but the code never left its workspace. So the AI coach and meal-photo estimate buttons cannot work yet.
- **Security:** RLS is on for every table, and anonymous users can't read anything. The coach view uses `security_invoker`, so the base-table rules apply.
