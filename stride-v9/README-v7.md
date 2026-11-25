# Stride v7 — Evergreen Minimal

Mobile-first redesign of Stride's six approved pages, built on top of v6's working data model and Supabase adapter.

## How to deploy to your existing Netlify site

1. On the currently deployed Stride site, go to **Settings → Export my data** and download a backup **before** uploading any update. If the account is signed in, confirm the cloud indicator says **Cloud saved** before switching versions.
2. Unzip `Stride_v7_Evergreen_Netlify.zip` on your Windows PC.
3. In Netlify, open the **existing** `stridehealth.netlify.app` site and go to **Deploys**. Upload the extracted folder that directly contains `index.html`, `app.js`, `v7.css`, etc. Do not create a new site.
4. Open `https://stridehealth.netlify.app` in Safari, refresh, and check the Settings version label: **Version 7 · Evergreen Minimal**. If an installed iPhone home-screen PWA is showing an older screen, fully close/reopen it and try Safari first. **Do not clear website data** while you may have unsynced local records.
5. Sign in to your same Supabase account. Wait for the status **Cloud saved** after any change. On Training, navigate to February 14, 2027 and check the 32 km base run and 35 km conditional stretch goal.

## What's new

- Consistent dark Evergreen palette: background `#0B1914`, hero cards `#244934`, sage `#B8D69B`, bright metrics `#F7FAF4`.
- Today: compact week calendar, next session, planned vs completed running, shortcuts to food, cold plunge, sleep and Recovery.
- Training: week navigation, run and strength filters, workout details, optional Tuesday runs and the existing marathon plan.
- Food: photo-first meal logging, editable calorie/macronutrient entries, recent meals, personalized fueling suggestions. AI estimates still require an independently configured `analyze-meal` Supabase Edge Function.
- Recovery: sleep recording, personal cold-plunge routine, actual ice-bath logs, optional Achilles/energy check-in, mobility instructions.
- Progress: actual vs planned weekly running chart, recent records, gym/recovery history. It never counts a scheduled run as completed.
- Settings: cloud status, secure sign-in, export/import, Strava CSV import, preferences and honest integration statuses.

## What is preserved

- The Supabase project at `https://tlslogvdbwjttfehesrr.supabase.co` and its publishable **client** key. No secret API keys are included.
- Same `stride-v1` localStorage state key, account snapshot format and private Supabase row-level-security access.
- Existing imported Strava run logs, manually entered workouts and meals, sleep, gym weights, ice-bath logs and recovery preferences.
- Cloud-loaded training overrides (more current than the offline fallback schedule). Changes to underlying Supabase tables are not necessary for this redesign.

## What is not included

- **No automatic Apple Health/HealthKit sync from a browser** — this needs an authorized native iPhone implementation.
- **No live Strava/Garmin API sync** — existing imported history stays available.
- **No functioning AI photo analysis until its backend has actually been deployed and configured**; photo/manual logging still works.
- **No live Netlify deployment** performed while building the ZIP. You must deploy it to your own existing site.

## QA and safety

- Passed JavaScript syntax checks and local Chromium-based UI checks at 320, 375, 390, 430, and 1024 px; no horizontal overflow or page errors.
- Exercised navigation to all six screens; workout details modal; running/strength filter; food log modal; recovery check-in save.
- Supabase database inspected read-only before packaging: 57 training schedule entries; 32 km Feb 14 with conditional 35 km stretch; 270 imported running records remain in cloud. The production cloud sign-in/save path still needs verification after deployment.
- A 32–35 km long run is conditional and does not guarantee marathon readiness. Do not force progress through Achilles pain or unusual fatigue.
- User's 3.5–4.5°C cold plunge preference is tracked as self-reported, not prescribed. Near-freezing immersion has significant cold-shock risks; use extra caution and never plunge alone.

## Architecture

Static HTML/CSS/JS web app, service worker/PWA, optional Supabase JS cloud adapter. No build step needed for Netlify. The local fallback exists so UI can still open without cloud access; your personal cloud data will load once successfully signed in.
