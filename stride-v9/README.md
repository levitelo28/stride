# Stride — safe static-hosting package

This package deliberately contains **no personal Strava running records**. Upload its `stride` folder to private or public static HTTPS hosting. Open the resulting URL on iPhone Safari and choose Share → Add to Home Screen.

To add your running history, open Settings → Import CSV and select your Strava `activities.csv` on your phone. The data stays in that browser's local storage, not in the published website.

Core features (workouts, gym log, food photo journal, mobility, sleep check-ins, progress and backups) work locally. Photo AI analysis requires the optional server/backend from the private source package. Live Apple Health data requires a signed native iOS app with HealthKit; ChatGPT Health connection cannot be reused by this web app.

Browser data is not cloud-backed. Use Settings → Download backup regularly and keep it private.
