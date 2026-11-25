# Stride

Personal training, nutrition and recovery app. The live v9 web app is the static site in `stride-v9/`, hosted on Netlify (`stridehealth.netlify.app`), data in Supabase.

## Layout
- `stride-v9/` — the site Netlify publishes (no build step)
- `netlify.toml` — publish folder and headers
- `supabase/` — (to add) database migrations and edge functions pulled from the live project

## Run locally
```
python -m http.server 8090 -d stride-v9
```
Then open http://localhost:8090. Without signing in, the app runs in device-only mode and never writes to Supabase.

## History
Git history was rebuilt from the ChatGPT-generated build ZIPs (safe hosting → cloud sync → marathon build → v6 → v7 → v9). v8 (`Stride_v8_Smart_Netlify.zip`) turned up later and isn't in the history, so v7 → v9 is one commit. It only has the front-end files (no Supabase functions or SQL), and v9 contains all of its features.

## Phase 0 checklist
- [x] Git repo with history of past builds
- [x] `netlify.toml` so Netlify can deploy straight from Git
- [x] v9 tested locally: goal setup, plan preview/save, session edit/move, Strava CSV import (270 runs, re-import adds no duplicates), no overflow at 390 px
- [ ] Push to a private GitHub repo and link it to the existing Netlify site
- [ ] Pull Supabase schema + edge functions (`stride-coach`, `analyze-meal`) into `supabase/`
- [ ] Export a backup from the live app, deploy v9, re-import the Strava CSV, confirm "Cloud saved"
