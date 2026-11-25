# Stride v9 — Personal Goals & Editable Plans

This release extends v8's Evergreen Minimal design. It does not automatically deploy to Netlify and does not change your production Supabase database.

## What's new and functional
- **Personal goal setup** in Settings, Today, and Training: 5K, 10K, half marathon, marathon, strength, general fitness, custom running goal. Pick a deadline, runs/week, strength days, current comfortable weekly km, current long run and optional limitations.
- **Preview before applying:** deterministic starter schedule with progressive weekly loading, recovery weeks and taper where applicable; includes warnings for short preparation windows or limited marathon history. This is NOT AI model-generated coaching, and a displayed event is not proof of safe readiness.
- **Editable planned sessions:** change date, workout type, km, duration, name and notes. Remove a scheduled session without deleting workouts already logged. Previously generated personal plans can be restored (last three).
- **Per-account persistence:** goal profile and plan are saved in the existing private Supabase `stride_user_state` JSON snapshot, protected by its existing RLS and revision conflict logic. Existing Stride users keep their prior program until they intentionally approve a new plan. New users see a goal setup prompt, not someone else's marathon schedule.
- **All v8 features preserved:** logging unplanned workouts, module on/off switches, Food, Recovery, Progress, cloud login, backup export, and rules-based Smart Coach.

## What is NOT yet activated
- Model-generated plans / adaptive AI coaching: need the private API-backed coach service, informed user consent, and rigorous output validation. The new starter planner is deterministic, not an AI service.
- iPhone HealthKit automatic import: needs a signed native iOS app with HealthKit entitlement and permissions. The PWA itself cannot access HealthKit. See `docs/iphone-healthkit-integration.md`.
- Automatic Strava OAuth sync: subject to Strava's 2026 API policy. Data coming from the Strava API may not be used as AI coaching input.

## Deploy (optional)
1. **Before installing**, open your existing Stride app and export a complete backup from Settings. Your production cloud snapshot currently has 3 manually recorded runs, though an earlier check had 270 imported entries; reconcile any missing archive records before replacing a device copy.
2. Download `Stride_v9_Personal_Goals_Netlify.zip`; extract it on Windows.
3. Upload the extracted `stride-v9` folder (containing `index.html`) to **the same** Netlify site (`stridehealth.netlify.app`) under Deploys.
4. Check `Settings → Version 9 · Personal Goals` and the `Your goals` section. Your old schedule should remain unchanged until you explicitly preview and accept a new plan.
5. In a fresh signed-in account, open `Set a goal`, preview, approve, and edit a sample workout. Verify `Cloud saved` only after Supabase confirms a successful save.

Do **not** restore an old backup without inspecting it: backup restoration can overwrite newer locally saved records.

## QA
- Node syntax checks: `app.js`, `cloud.js` and `goal-core.js` passed.
- Deterministic goal generator tested for all seven goal types and plan-date limits.
- Local Chromium DOM interaction tested: all primary screens; goal form; draft preview; save; editable workout; legacy snapshot hydration; no horizontal overflow at 390 px.
- Production Supabase not modified in this build; its 57 historical planned sessions remain available for the original account.
- Live authentication, iPhone hardware and native HealthKit have not been tested on a device.
