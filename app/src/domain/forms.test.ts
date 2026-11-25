/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { applySessionEdit, parseActivityForm, parseGoalForm, parseSessionForm, removeSession } from './forms';
import { buildPlan } from './plan';

const plan = buildPlan(
  { type: '10k', targetDate: '2027-01-31', runDays: 3, strengthDays: 1, baseWeeklyKm: 20, currentLongestKm: 8 },
  '2026-11-25',
);

test('session form: valid input, decimal comma, and errors', () => {
  const r = parseSessionForm({ date: '2026-11-27', kind: 'run', label: ' Tempo ', distanceKm: '7,5', minutes: '', note: '' });
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.distanceKm, 7.5);
    assert.equal(r.value.label, 'Tempo');
    assert.equal(r.value.edited, true);
  }
  assert.equal(parseSessionForm({ date: '27/11', kind: 'run', label: 'x', distanceKm: '', minutes: '', note: '' }).ok, false);
  assert.equal(parseSessionForm({ date: '2026-11-27', kind: 'run', label: '  ', distanceKm: '', minutes: '', note: '' }).ok, false);
  assert.equal(parseSessionForm({ date: '2026-11-27', kind: 'run', label: 'x', distanceKm: '-3', minutes: '', note: '' }).ok, false);
});

test('moving a session to a free day works; onto a taken day is refused', () => {
  const [first, second] = Object.keys(plan.sessions).sort();
  const free = '2026-11-26'; // Thursday: no session in a 3-run, 1-strength plan
  assert.equal(plan.sessions[free], undefined);
  const moved = applySessionEdit(plan, first, { ...plan.sessions[first], date: free });
  assert.ok(moved.ok);
  if (moved.ok) {
    assert.equal(moved.value.sessions[first], undefined);
    assert.equal(moved.value.sessions[free].label, plan.sessions[first].label);
    assert.equal(Object.keys(moved.value.sessions).length, Object.keys(plan.sessions).length);
  }
  const clash = applySessionEdit(plan, first, { ...plan.sessions[first], date: second });
  assert.equal(clash.ok, false);
  assert.equal(Object.keys(removeSession(plan, first).sessions).length, Object.keys(plan.sessions).length - 1);
});

test('activity form: runs need distance, nothing in the future, effort 1–10', () => {
  const base = { date: '2026-11-25', kind: 'run' as const, name: '', distanceKm: '8', minutes: '45', rpe: '6', notes: '' };
  const r = parseActivityForm(base, '2026-11-25');
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.value.durationSec, 2700);
    assert.equal(r.value.source, 'manual');
  }
  assert.equal(parseActivityForm({ ...base, distanceKm: '' }, '2026-11-25').ok, false);
  assert.equal(parseActivityForm({ ...base, date: '2026-11-26' }, '2026-11-25').ok, false);
  assert.equal(parseActivityForm({ ...base, rpe: '11' }, '2026-11-25').ok, false);
  assert.ok(parseActivityForm({ ...base, kind: 'strength', distanceKm: '', minutes: '40' }, '2026-11-25').ok);
  assert.equal(parseActivityForm({ ...base, kind: 'strength', distanceKm: '', minutes: '' }, '2026-11-25').ok, false);
});

test('goal form reports planner validation errors as messages', () => {
  const form = {
    type: 'half' as const,
    name: 'Spring half',
    targetDate: '2027-04-11',
    runDays: 3,
    strengthDays: 2,
    baseWeeklyKm: '25',
    currentLongestKm: '12',
    constraints: '',
  };
  const r = parseGoalForm(form);
  assert.ok(r.ok);
  if (r.ok) assert.equal(r.value.baseWeeklyKm, 25);
  const bad = parseGoalForm({ ...form, baseWeeklyKm: '400' });
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.match(bad.error, /weekly/);
});
