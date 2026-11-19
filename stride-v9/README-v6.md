# Stride v6 — Ice Bath Log + 35 km conditional marathon training

This is a static website ready for an existing Netlify site. The Supabase URL and publishable browser key are unchanged from your prior Cloud Connected build. NEVER place a Supabase service role key in this folder.

## New
- Any-day ice bath log: actual °C, actual minutes, how it felt, notes.
- Recovery settings display your reported 3.5–4.5°C, 5 minutes, around twice weekly once your private account loads. These are NOT recommended temperatures.
- The 32 km February long run and 35 km conditional stretch remain in your private Supabase schedule.
- Logging an ice bath saves through the existing private account snapshot, not a new database table.
- Older logs and original imported running history remain untouched.

## Install
1. On your existing Stride website, open Settings -> Download backup, and save the JSON backup.
2. Unzip Stride_Ice_Bath_Log_v6_Netlify.zip.
3. Upload the extracted **stride** folder (which contains index.html at its top level) into the Deploys area of your existing Netlify site. Do not create a new site.
4. Open https://stridehealth.netlify.app in Safari and refresh. If the old app is cached, close the home-screen app then reopen; if necessary open the website in Safari to refresh the service worker.
5. Open Settings; look for **Stride v6 · Ice Bath Log**. Check that you are signed in and the Cloud Saved indicator appears.
6. Open Today, select any date, tap Ice bath, and record actual details.

## Important limitations
- This package alone DOES NOT deploy Netlify; you must upload the extracted folder.
- Supabase private account data and plan require successful sign-in, and Apple Health does not auto-sync through the web app.
- The cold-bath tracker records what you do. Near-freezing plunges can be hazardous; the UI advises a warmer recovery range.
- Avoid conflicting edits on two devices before both have synced.
