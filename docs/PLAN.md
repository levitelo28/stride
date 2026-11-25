# Stride 2.0 — product and build plan

Decided 2026-11-25: rebuild as an Expo (React Native) app, iPhone first, Android next, Claude-powered coach, Supabase backend. The v9 web app stays live at stridehealth.netlify.app until the new app replaces it.

## What Stride should be
An app that knows what you did without being told, understands how you're recovering, and tells you what to do next and why.

1. **Automatic data.** On iPhone, Apple Health already gathers workouts, sleep, resting heart rate, HRV, steps and VO2 max from Apple Watch, Garmin, Strava, Oura, Whoop and others. Stride reads it (with permission) on open and in the background. Android uses Health Connect the same way. Manual logging stays for anything not captured.
2. **A plan that adapts.** Any goal (5K → marathon, strength, general fitness, custom). The plan is generated, editable, and adjusted week to week by the coach: suggestions the user accepts or rejects, never silent rewrites.
3. **A coach that explains.** Daily readiness (sleep, HRV and resting-HR trends against your baseline, recent load, soreness) → today's recommendation. A weekly review of what went well, what didn't, and specific changes. Ask-the-coach chat about your own data.
4. **For everyone.** Onboarding, units (km/mi), privacy controls, data export and account deletion, App Store distribution.

## Architecture
```
iPhone / Android app (Expo, TypeScript, expo-router)
   │  HealthKit / Health Connect (native modules, read-only)
   │  Supabase Auth (email link, Sign in with Apple)
   ▼
Supabase Postgres  ← row-level security on every table
   activities · daily_metrics · goals · plans · plan_sessions · checkins · meals · coach_reviews
   ▼
Supabase Edge Functions (Deno, TypeScript)
   coach-daily · coach-weekly · coach-chat  →  Claude API (Anthropic SDK)
   plan-generate (deterministic rules from goal-core.js, then coach refines)
```
- **Rules guard the AI.** The coach returns structured proposals (move, shorten, swap or add a session). A deterministic validator enforces safety limits before anything is shown: weekly volume growth, long-run share of the week, no hard days back-to-back, taper. The user approves each change.
- **Data rules.** Strava API data never goes to the AI (Strava terms); Strava and Garmin activities arrive through Apple Health instead. Health data goes to the AI only after explicit in-app consent, and that consent can be revoked. Nothing is used for advertising.
- **Dedup.** Each activity keeps `source` + `external_id` (the HealthKit UUID). The same run recorded by Watch and Strava is merged by time overlap and distance.

## Milestones
| # | Milestone | Result | Needs from you |
|---|-----------|--------|----------------|
| 1 | Foundation | Expo app in `app/`, Evergreen design system, sign-in, Today/Training/Progress screens on real Supabase data; runs on web for quick testing | — |
| 2 | Data model | New per-record tables (migrations reviewed before applying), import of the old JSON blob + Strava CSV | Approve migrations on production |
| 3 | Goals and plans | v9 goal planner ported and tested; editable plan; logging | — |
| 4 | Apple Health | Native HealthKit read of workouts, sleep, HRV and resting HR; background sync; dedup | Apple Developer account, Expo account, iPhone for testing |
| 5 | Coach | Daily readiness, weekly review, approve-able plan changes, chat | Anthropic API key (stored as a Supabase secret) |
| 6 | Launch prep | Onboarding, consent, privacy policy, export/delete account, TestFlight beta | App Store listing details |
| 7 | Android | Health Connect, Play Store | Google Play account ($25 once) |

## Start these now (they take days)
- **Apple Developer Program:** enroll at developer.apple.com/programs. Individual is fastest; enrolling as a company needs a D-U-N-S number.
- **Expo account:** expo.dev (free). Lets us build iPhone apps from Windows.
- **Anthropic API key:** platform.claude.com → API keys, with a monthly spend limit set.
