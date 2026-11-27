/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dedupeActivities } from './stats';
import type { Activity } from './types';

const health = (id: string, startedAt: string, extra: Partial<Activity> = {}): Activity => ({
  id,
  date: startedAt.slice(0, 10),
  startedAt,
  kind: 'run',
  source: 'apple_health',
  ...extra,
});

test('the same run from the Watch and Strava (both via Apple Health) is kept once, the fuller copy', () => {
  const out = dedupeActivities([
    health('strava', '2026-11-20T15:00:40Z', { durationSec: 1057, distanceKm: 3.0 }),
    health('watch', '2026-11-20T15:00:05Z', { durationSec: 1058, distanceKm: 3.02, avgHr: 152 }),
  ]);
  assert.deepEqual(out.map((a) => a.id), ['watch']);
});

test('two runs on one day that started hours apart both stay', () => {
  const out = dedupeActivities([
    health('am', '2026-11-22T07:00:00Z', { distanceKm: 5 }),
    health('pm', '2026-11-22T18:00:00Z', { distanceKm: 5 }),
  ]);
  assert.equal(out.length, 2);
});

test('a run logged by hand collapses into the Health record, keeping the effort and notes typed', () => {
  const out = dedupeActivities([
    { id: 'v9:1', date: '2026-11-25', kind: 'run', distanceKm: 5.01, durationSec: 1860, rpe: 6, notes: 'windy', source: 'manual' },
    health('hk', '2026-11-25T16:00:00Z', { distanceKm: 4.93, durationSec: 1847 }),
  ]);
  assert.equal(out.length, 1);
  assert.equal(out[0].id, 'hk');
  assert.equal(out[0].rpe, 6);
  assert.equal(out[0].notes, 'windy');
});

test('different distances on the same day are different runs; other kinds never merge with runs', () => {
  const out = dedupeActivities([
    { id: 'a', date: '2026-11-25', kind: 'run', distanceKm: 5, source: 'manual' },
    { id: 'b', date: '2026-11-25', kind: 'run', distanceKm: 10, source: 'strava_csv' },
    { id: 'c', date: '2026-11-25', kind: 'walk', distanceKm: 5, source: 'manual' },
  ]);
  assert.equal(out.length, 3);
});
