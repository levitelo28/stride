/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { fromLegacyState, planFromOverrides } from './legacy';
import { weeklyStats } from './stats';

test('run logs in miles become kilometres, and duplicates across sources collapse', () => {
  const data = fromLegacyState({
    runLogs: [
      { id: 'strava-1', date: '2026-11-16', distance: 6.22, seconds: 3442, hr: 161, source: 'Strava CSV' },
      { id: 'm-1', date: '2026-11-16', distance: 6.2, seconds: 3400, source: 'Manual' },
      { id: 'm-2', date: '2026-11-18', distance: 3, seconds: 1700, source: 'Manual' },
      { id: 'bad', date: 'nope', distance: 3 },
    ],
    customWorkouts: [{ id: 'c1', date: '2026-11-17', type: 'gym', minutes: 40, name: 'Leg day' }],
  });
  assert.equal(data.activities.length, 3);
  const strava = data.activities.find((a) => a.id === 'strava-1');
  assert.equal(strava?.distanceKm, 10.01);
  assert.equal(strava?.source, 'strava_csv');
  const gym = data.activities.find((a) => a.id === 'c1');
  assert.equal(gym?.kind, 'strength');
  assert.equal(gym?.durationSec, 2400);
});

test('override rows map to the original marathon plan', () => {
  const plan = planFromOverrides([
    { training_date: '2026-11-25', activity: 'Easy run', planned_km: 5, instructions: null },
    { training_date: '2026-11-29', activity: 'Long easy run', planned_km: 12, instructions: 'Fuel' },
    { training_date: '2027-03-07', activity: 'Marathon race', planned_km: 42.2, instructions: null },
    { training_date: '2026-11-26', activity: 'Rest', planned_km: null, instructions: null },
  ]);
  assert.ok(plan);
  assert.equal(Object.keys(plan.sessions).length, 3);
  assert.equal(plan.sessions['2026-11-29'].kind, 'long');
  assert.equal(plan.sessions['2027-03-07'].kind, 'event');
  assert.equal(plan.goal.targetDate, '2027-03-07');
});

test('a saved v9 personal plan takes priority over overrides', () => {
  const data = fromLegacyState(
    {
      personalPlan: {
        profile: { type: 'half', targetDate: '2027-04-01', runDays: 3, strengthDays: 1 },
        sessions: { '2026-11-27': { date: '2026-11-27', kind: 'gymA', label: 'Strength', minutes: 35 } },
      },
    },
    [{ training_date: '2026-11-25', activity: 'Easy run', planned_km: 5, instructions: null }],
  );
  assert.equal(data.plan?.goal.type, 'half');
  assert.equal(data.plan?.sessions['2026-11-27'].kind, 'strength');
});

test('weekly stats sum runs and planned km per Monday-start week', () => {
  const data = fromLegacyState({
    runLogs: [
      { id: 'a', date: '2026-11-23', distance: 3.106856, source: 'Manual' }, // 5 km, Monday
      { id: 'b', date: '2026-11-29', distance: 6.213712, source: 'Manual' }, // 10 km, Sunday
    ],
  });
  const weeks = weeklyStats(data.activities, null, '2026-11-25', 2);
  assert.equal(weeks[1].weekStart, '2026-11-23');
  assert.equal(weeks[1].runKm, 15);
  assert.equal(weeks[1].runs, 2);
});
