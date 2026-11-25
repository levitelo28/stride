/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addDays, weekStart } from './dates';
import { buildPlan, GOAL_TYPES, PlanInputError } from './plan';
import type { GoalInput } from './types';

const asOf = '2026-11-25';
const base: GoalInput = {
  type: 'marathon',
  targetDate: '2027-03-07',
  runDays: 3,
  strengthDays: 2,
  baseWeeklyKm: 30,
  currentLongestKm: 16,
};

test('every goal type builds a plan with sessions only between today and the target', () => {
  for (const type of GOAL_TYPES) {
    const plan = buildPlan({ ...base, type }, asOf);
    const dates = Object.keys(plan.sessions);
    assert.ok(dates.length > 0, type);
    for (const d of dates) assert.ok(d >= asOf && d <= base.targetDate, `${type} ${d}`);
  }
});

test('week-to-week planned volume never rises more than 10% over the last build week', () => {
  const plan = buildPlan(base, asOf);
  let lastBuild = 0;
  plan.weeks.forEach((w, i) => {
    const km = w.plannedKm ?? 0;
    const recovery = i % 4 === 3 && i < plan.weeks.length - 2;
    if (lastBuild && !recovery) assert.ok(km <= lastBuild * 1.1 + 0.1, `week ${i}: ${km} vs ${lastBuild}`);
    if (!recovery) lastBuild = Math.max(lastBuild, km);
  });
});

test('long run stays within its share of the week and the 30 km marathon cap', () => {
  const plan = buildPlan(base, asOf);
  for (const w of plan.weeks) {
    assert.ok((w.longRunKm ?? 0) <= 30);
    assert.ok((w.longRunKm ?? 0) <= (w.plannedKm ?? 0) * 0.45 + 0.1, JSON.stringify(w));
  }
});

test('race day is the event and the last two weeks taper', () => {
  const plan = buildPlan(base, asOf);
  assert.equal(plan.sessions['2027-03-07'].kind, 'event');
  const n = plan.weeks.length;
  const peak = Math.max(...plan.weeks.map((w) => w.plannedKm ?? 0));
  assert.ok((plan.weeks[n - 1].plannedKm ?? 0) < peak * 0.5);
  assert.ok((plan.weeks[n - 2].plannedKm ?? 0) < peak * 0.75);
});

test('strength days honour the requested count and never replace a run', () => {
  const plan = buildPlan({ ...base, strengthDays: 3 }, '2026-11-23');
  const wk = weekStart('2026-11-30');
  const week = Array.from({ length: 7 }, (_, i) => plan.sessions[addDays(wk, i)]).filter(Boolean);
  assert.equal(week.filter((s) => s.kind === 'strength').length, 3);
  assert.equal(week.filter((s) => s.kind === 'run' || s.kind === 'long').length, 3);
});

test('short marathon prep and low base produce warnings', () => {
  const plan = buildPlan({ ...base, targetDate: '2026-12-20', baseWeeklyKm: 10, currentLongestKm: 5 }, asOf);
  assert.equal(plan.warnings.length, 2);
});

test('invalid input is rejected', () => {
  assert.throws(() => buildPlan({ ...base, targetDate: '2026-01-01' }, asOf), PlanInputError);
  assert.throws(() => buildPlan({ ...base, targetDate: '2029-01-01' }, asOf), PlanInputError);
  assert.throws(() => buildPlan({ ...base, baseWeeklyKm: 900 }, asOf), PlanInputError);
});
