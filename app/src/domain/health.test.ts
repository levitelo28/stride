/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dailyAverages, sleepNights, workoutToActivity } from './health';

// Local-time helper: new Date(y, m-1, d, h, min) is in the device's time zone, like HealthKit dates.
const at = (d: number, h: number, min = 0) => new Date(2026, 10, d, h, min);

test('workouts map to Stride activities with km and seconds', () => {
  const run = workoutToActivity({
    uuid: 'A1',
    workoutActivityType: 37,
    startDate: at(24, 7),
    endDate: at(24, 7, 50),
    duration: { quantity: 2940, unit: 's' },
    totalDistance: { quantity: 8420, unit: 'm' },
    sourceName: 'Strava',
  });
  assert.equal(run.kind, 'run');
  assert.equal(run.date, '2026-11-24');
  assert.equal(run.distanceKm, 8.42);
  assert.equal(run.durationSec, 2940);
  assert.equal(run.source, 'apple_health');
  assert.equal(run.name, 'Run · Strava');

  const miles = workoutToActivity({ uuid: 'A2', workoutActivityType: 37, startDate: at(23, 18), endDate: at(23, 18, 40), totalDistance: { quantity: 5, unit: 'mi' } });
  assert.equal(miles.distanceKm, 8.047);
  assert.equal(miles.durationSec, 2400); // from start/end when duration is missing

  const yoga = workoutToActivity({ uuid: 'A3', workoutActivityType: 57, startDate: at(22, 9), endDate: at(22, 9, 30) });
  assert.equal(yoga.kind, 'mobility');
  assert.equal(yoga.distanceKm, undefined);
  assert.equal(workoutToActivity({ uuid: 'A4', workoutActivityType: 999, startDate: at(22, 9), endDate: at(22, 10) }).kind, 'other');
});

test('sleep: Watch stages win over coarser sources, awake time is excluded, night dated by the morning', () => {
  const nights = sleepNights([
    // Apple Watch stages, 23:00 → 06:30
    { value: 3, startDate: at(23, 23), endDate: at(24, 2) },
    { value: 4, startDate: at(24, 2), endDate: at(24, 3) },
    { value: 2, startDate: at(24, 3), endDate: at(24, 3, 30) }, // awake: not counted
    { value: 5, startDate: at(24, 3, 30), endDate: at(24, 6, 30) },
    // iPhone/other app recording the same night: must not double-count
    { value: 1, startDate: at(23, 23, 30), endDate: at(24, 6) },
    // in-bed sample is ignored when stage data exists
    { value: 0, startDate: at(23, 22, 30), endDate: at(24, 7) },
  ]);
  // 23:00–02:00 core + 02:00–03:00 deep + 03:30–06:30 REM = 7 h; the iPhone record and in-bed time are ignored.
  assert.deepEqual(nights, [{ date: '2026-11-24', hours: 7 }]);
});

test('sleep: overlapping generic records from two apps are merged, not added', () => {
  const nights = sleepNights([
    { value: 1, startDate: at(23, 23), endDate: at(24, 6) },
    { value: 1, startDate: at(24, 0), endDate: at(24, 7) },
  ]);
  assert.deepEqual(nights, [{ date: '2026-11-24', hours: 8 }]);
});

test('sleep: in-bed only nights use time in bed; short fragments are dropped', () => {
  const nights = sleepNights([
    { value: 0, startDate: at(20, 23), endDate: at(21, 7) },
    { value: 1, startDate: at(21, 14), endDate: at(21, 14, 20) }, // 20-minute nap only → dropped
  ]);
  assert.deepEqual(nights, [{ date: '2026-11-21', hours: 8 }]);
});

test('daily averages combine several readings per day', () => {
  const hrv = dailyAverages([
    { quantity: 40, startDate: at(24, 1) },
    { quantity: 50, startDate: at(24, 4) },
    { quantity: 61, startDate: at(25, 3) },
    { quantity: 0, startDate: at(25, 5) },
  ]);
  assert.deepEqual(hrv, [
    { date: '2026-11-24', value: 45 },
    { date: '2026-11-25', value: 61 },
  ]);
});
