/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { activityFromRow, activityToRow, planFingerprint, planFromRows, sessionToRow } from './rows';
import { planLegacySync } from './sync';
import { fromLegacyState } from './legacy';

const userId = '00000000-0000-4000-8000-00000000000a';
const legacyState = {
  runLogs: [
    { id: 'strava-1', date: '2026-11-16', distance: 6.22, seconds: 3442, hr: 161, source: 'Strava CSV' },
    { id: 'm-1', date: '2026-11-16', distance: 6.2, seconds: 3400, source: 'Manual' },
    { id: 'm-1', date: '2026-11-16', distance: 6.2, seconds: 3400, source: 'Manual' }, // duplicated in the record
  ],
  customWorkouts: [{ id: 'c1', date: '2026-11-17', type: 'gym', minutes: 40 }],
  sleep: [
    { date: '2026-11-20', hours: 7, source: 'Manual' },
    { date: '2026-11-20', hours: 7.5, source: 'Manual' },
  ],
};
const overrides = [
  { training_date: '2026-11-25', activity: 'Easy run', planned_km: 5, instructions: null },
  { training_date: '2027-03-07', activity: 'Marathon race', planned_km: 42.2, instructions: null },
];

test('copies every web-app activity once, keyed by a v9 external id', () => {
  const plan = planLegacySync({ userId, legacyState, overrides, existingV9Ids: [], activePlan: null });
  assert.deepEqual(plan.activityUpserts.map((r) => r.external_id).sort(), ['v9:c1', 'v9:m-1', 'v9:strava-1']);
  assert.ok(plan.activityUpserts.every((r) => r.user_id === userId));
  assert.equal(plan.activityUpserts.find((r) => r.external_id === 'v9:strava-1')?.source, 'strava_csv');
  assert.equal(plan.metricUpserts.length, 1);
  assert.equal(plan.metricUpserts[0].value, 7.5);
});

test('creates the plan when none exists, then does nothing while it is unchanged', () => {
  const first = planLegacySync({ userId, legacyState, overrides, existingV9Ids: [], activePlan: null });
  assert.equal(first.planAction.type, 'create');
  if (first.planAction.type !== 'create') return;
  const again = planLegacySync({
    userId,
    legacyState,
    overrides,
    existingV9Ids: [],
    activePlan: { id: 'p1', source: 'legacy', legacy_fingerprint: first.planAction.fingerprint },
  });
  assert.equal(again.planAction.type, 'none');
});

test('replaces a legacy plan that changed in the web app, never a plan made in the new app', () => {
  const changed = [...overrides, { training_date: '2026-11-27', activity: 'Recovery run', planned_km: 4, instructions: null }];
  const legacyPlan = planLegacySync({
    userId,
    legacyState,
    overrides: changed,
    existingV9Ids: [],
    activePlan: { id: 'p1', source: 'legacy', legacy_fingerprint: 'old' },
  });
  assert.equal(legacyPlan.planAction.type, 'replace');
  const ownPlan = planLegacySync({
    userId,
    legacyState,
    overrides: changed,
    existingV9Ids: [],
    activePlan: { id: 'p2', source: 'rules', legacy_fingerprint: null },
  });
  assert.equal(ownPlan.planAction.type, 'none');
});

test('deletes copies of activities removed in the web app, but not when the record is empty', () => {
  const plan = planLegacySync({
    userId,
    legacyState,
    overrides,
    existingV9Ids: ['v9:strava-1', 'v9:gone', 'other:x'],
    activePlan: null,
  });
  assert.deepEqual(plan.activityDeletes, ['v9:gone']);
  const empty = planLegacySync({ userId, legacyState: {}, overrides, existingV9Ids: ['v9:strava-1'], activePlan: null });
  assert.deepEqual(empty.activityDeletes, []);
});

test('rows round-trip back to the same activities and plan', () => {
  const data = fromLegacyState(legacyState, overrides);
  for (const a of data.activities) {
    const back = activityFromRow({ ...activityToRow(a, userId, 'v9:' + a.id), id: a.id, distance_km: String(a.distanceKm ?? '') || null });
    assert.equal(back.date, a.date);
    assert.equal(back.kind, a.kind);
    assert.equal(back.distanceKm, a.distanceKm === undefined ? undefined : Math.round(a.distanceKm * 1000) / 1000);
  }
  const plan = data.plan!;
  const rows = Object.values(plan.sessions).map((s) => sessionToRow(s, 'p1', userId));
  const back = planFromRows(
    { id: 'p1', user_id: userId, status: 'active', source: 'legacy', goal: plan.goal, warnings: [], legacy_fingerprint: null, created_at: '' },
    rows,
  );
  assert.equal(planFingerprint(back), planFingerprint(plan));
});
