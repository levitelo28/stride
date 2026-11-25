# Supabase backend (project `tlslogvdbwjttfehesrr`, "Stride")

`schema.sql` was exported read-only from the live project on 2026-11-25. It covers the tables, row-level security policies, triggers, the `stride_coach_inputs` view and the `meal-photos` storage bucket.

## State on 2026-11-25
- **Used by the app:** `stride_user_state` (one JSON blob per user, currently 3 runs, revision 8) and `stride_training_overrides` (57 planned sessions).
- **Created but empty, never used by the app:** `stride_runs`, `stride_meals`, `stride_sleep`, `stride_checkins`, `stride_strength_sessions`. `stride_runs` already has the per-run shape Phase 1 needs (`run_id` primary key, `source`).
- **Edge functions:** none deployed. `stride-coach` and `analyze-meal`, which `cloud.js` calls, were never deployed and aren't in any of the downloaded ZIPs (v8 included); ChatGPT described them but the code never left its workspace. So the AI coach and meal-photo estimate buttons cannot work yet.
- **Security:** RLS is on for every table, and anonymous users can't read anything. The coach view uses `security_invoker`, so the base-table rules apply.

## Migrations
- `migrations/20261126000000_core_tables.sql` — **applied 2026-11-26.** Adds `activities`, `daily_metrics`, `plans` and `plan_sessions`, all owner-only under RLS with no anonymous access. Before it was applied, a rolled-back test checked owner isolation, constraints, the one-active-plan rule and the cross-user plan foreign key. `schema.sql` predates this migration.

- `migrations/20261126010000_replace_active_plan.sql` — **applied 2026-11-26.** Adds `stride_replace_active_plan(goal, warnings, sessions)`, which archives the active plan and saves a new one in a single transaction. It runs as the caller (security invoker), so RLS still applies; only signed-in users can call it. A rolled-back test checked replacement, atomicity on bad input, and isolation between users before it was applied.

The new app copies the v9 record into these tables on every load (`app/src/domain/sync.ts`). The copy is idempotent: rows are keyed by `v9:<id>` external IDs, and plans created in the new app are never overwritten.
