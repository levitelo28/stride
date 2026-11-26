/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildCoachInput, computeInsights } from './coach';
import { addDays } from './dates';
import { buildPlan } from './plan';
import { checkProposal, type Proposal } from './proposals';
import type { Activity, UserData } from './types';

const today = '2026-11-25'; // Wednesday
const plan = buildPlan(
  { type: 'half', targetDate: '2027-03-07', runDays: 3, strengthDays: 1, baseWeeklyKm: 25, currentLongestKm: 12 },
  '2026-11-09',
);
const run = (date: string, km: number, rpe?: number): Activity => ({
  id: `r-${date}`,
  date,
  kind: 'run',
  distanceKm: km,
  durationSec: km * 360,
  rpe,
  source: 'manual',
});
const p = (x: Partial<Proposal>): Proposal => ({
  action: 'change',
  date: today,
  new_date: null,
  kind: null,
  label: null,
  distance_km: null,
  minutes: null,
  reason: 'test',
  ...x,
});

test('coach input is a compact summary with six weeks, load, upcoming sessions and insights', () => {
  const data: UserData = { activities: [run('2026-11-22', 12), run('2026-11-18', 6, 5)], plan, sleep: [{ date: '2026-11-24', hours: 7.2, source: 'manual' }] };
  const input = buildCoachInput(data, today);
  assert.equal(input.weeks.length, 6);
  assert.equal(input.weeks[5].weekStart, '2026-11-23');
  assert.equal(input.load.last7Km, 12);
  assert.ok(input.upcoming.every((s) => s.date >= today && s.date <= addDays(today, 13)));
  assert.equal(input.goal?.type, 'half');
  assert.ok(JSON.stringify(input).length < 20_000);
  // Planned run days so far in the last 14 days (Nov 12-25) and how many had a logged run.
  const plannedDays = Object.values(plan.sessions).filter(
    (s) => ['run', 'long', 'event'].includes(s.kind) && s.date >= '2026-11-12' && s.date <= today,
  );
  assert.equal(input.totals.last14Days.plannedRuns, plannedDays.length);
  assert.equal(input.totals.last14Days.completedRuns, plannedDays.filter((s) => ['2026-11-22', '2026-11-18'].includes(s.date)).length);
  assert.equal(input.totals.last14Days.runKm, 18);
  assert.deepEqual(input.totals.allTime, { runs: 2, runKm: 18 });
});

test('insights flag missed sessions, a load spike, short sleep and hard efforts', () => {
  const spiky: UserData = {
    activities: [run('2026-11-25', 14, 9), run('2026-11-23', 12, 8), run('2026-11-21', 10), run('2026-10-30', 5), run('2026-11-05', 5)],
    plan,
    sleep: ['2026-11-22', '2026-11-23', '2026-11-24'].map((date) => ({ date, hours: 6, source: 'manual' as const })),
  };
  const ids = computeInsights(spiky, today).map((i) => i.id);
  for (const id of ['load-spike', 'sleep-low', 'effort-high']) assert.ok(ids.includes(id), `${id} in ${ids}`);

  const sessions = Object.keys(plan.sessions).filter((d) => d >= '2026-11-16' && d <= today);
  const consistent: UserData = { activities: sessions.map((d) => run(d, plan.sessions[d].distanceKm ?? 5)), plan, sleep: [] };
  assert.ok(computeInsights(consistent, today).some((i) => i.id === 'consistency-good'));
  const lazy: UserData = { activities: [], plan, sleep: [] };
  assert.ok(computeInsights(lazy, today).some((i) => i.id === 'consistency-low'));
});

test('proposals: safe reductions and moves pass; past dates, race day and clashes are refused', () => {
  const acts = [run('2026-11-22', 12)];
  const runDay = Object.keys(plan.sessions).find((d) => d >= today && plan.sessions[d].kind === 'run')!;
  const shorter = checkProposal(plan, acts, p({ date: runDay, distance_km: 3 }), today);
  assert.ok(shorter.ok, JSON.stringify(shorter));
  assert.equal(checkProposal(plan, acts, p({ date: '2026-11-20', distance_km: 3 }), today).ok, false);
  assert.equal(checkProposal(plan, acts, p({ date: '2027-03-07', distance_km: 10 }), today).ok, false);
  const free = [1, 2, 3, 4, 5, 6].map((n) => addDays(runDay, n)).find((d) => !plan.sessions[d])!;
  assert.ok(checkProposal(plan, acts, p({ action: 'move', date: runDay, new_date: free }), today).ok);
  const taken = Object.keys(plan.sessions).find((d) => d > runDay)!;
  assert.equal(checkProposal(plan, acts, p({ action: 'move', date: runDay, new_date: taken }), today).ok, false);
  assert.ok(checkProposal(plan, acts, p({ action: 'remove', date: runDay }), today).ok);
});

test('proposals: big jumps in weekly or long-run distance are refused', () => {
  const acts = [run('2026-11-22', 12)];
  const runDay = Object.keys(plan.sessions).find((d) => d >= today && plan.sessions[d].kind === 'run')!;
  const huge = checkProposal(plan, acts, p({ date: runDay, distance_km: 25 }), today);
  assert.equal(huge.ok, false);
  const free = [1, 2, 3, 4, 5, 6].map((n) => addDays(runDay, n)).find((d) => !plan.sessions[d])!;
  const extra = checkProposal(plan, acts, p({ action: 'add', date: free, kind: 'run', label: 'Bonus run', distance_km: 15 }), today);
  assert.equal(extra.ok, false);
  const easyAdd = checkProposal(plan, acts, p({ action: 'add', date: free, kind: 'other', label: 'Mobility', minutes: 20 }), today);
  assert.ok(easyAdd.ok, JSON.stringify(easyAdd));
});
