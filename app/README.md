# Stride app (Expo)

iPhone-first React Native app; see `../docs/PLAN.md` for the roadmap.

```
npm install
npm run web        # browser preview at http://localhost:8081
npm test           # domain tests (plan generator, legacy data reader)
npm run typecheck
npx expo lint
```

- `src/app/` — screens (Expo Router). `(tabs)/` holds Today, Training, Progress, Settings.
- `src/domain/` — pure TypeScript: plan generator, stats, the v9 data reader, sample data. No React; fully unit-tested.
- `src/data/store.tsx` — session and data loading (Supabase, or sample data).
- `src/lib/` — Supabase clients (native uses expo-sqlite storage, web uses localStorage).

Until milestone 2, the app reads the v9 web app's `stride_user_state` record and `stride_training_overrides`, read-only.
