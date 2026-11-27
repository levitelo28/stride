/**
 * Apple Health (HealthKit) → Stride mapping. Pure functions over plain objects, so they're unit-tested
 * without a device. The shapes mirror @kingstinct/react-native-healthkit's samples.
 */
import { today as localDate } from './dates';
import type { Activity, ActivityKind, ISODate } from './types';

export interface HealthQuantity {
  quantity: number;
  unit: string;
}

export interface HealthWorkout {
  uuid: string;
  workoutActivityType: number;
  startDate: Date;
  endDate: Date;
  duration?: HealthQuantity;
  totalDistance?: HealthQuantity;
  totalEnergyBurned?: HealthQuantity;
  /** Average heart rate during the workout (bpm), from the workout's statistics. */
  avgHr?: number;
  maxHr?: number;
  sourceName?: string;
}

export interface HealthCategorySample {
  value: number;
  startDate: Date;
  endDate: Date;
}

export interface HealthQuantitySample {
  quantity: number;
  startDate: Date;
}

/** HKWorkoutActivityType raw values (Apple's enum) → Stride kinds. */
const WORKOUT_KIND: Record<number, ActivityKind> = {
  37: 'run', // running
  52: 'walk', // walking
  24: 'walk', // hiking
  13: 'ride', // cycling
  46: 'swim', // swimming
  50: 'strength', // traditionalStrengthTraining
  20: 'strength', // functionalStrengthTraining
  59: 'strength', // coreTraining
  11: 'strength', // crossTraining
  57: 'mobility', // yoga
  62: 'mobility', // flexibility
  66: 'mobility', // pilates
};
const KIND_NAME: Record<ActivityKind, string> = {
  run: 'Run',
  walk: 'Walk',
  ride: 'Ride',
  swim: 'Swim',
  strength: 'Strength',
  mobility: 'Mobility',
  other: 'Workout',
};

const TO_KM: Record<string, number> = {
  m: 0.001,
  meter: 0.001,
  meters: 0.001,
  km: 1,
  kilometers: 1,
  mi: 1.609344,
  miles: 1.609344,
  yd: 0.0009144,
  ft: 0.0003048,
};
const TO_SEC: Record<string, number> = { s: 1, min: 60, hr: 3600, ms: 0.001 };

function km(q?: HealthQuantity): number | undefined {
  if (!q || !(q.quantity > 0)) return undefined;
  const f = TO_KM[q.unit];
  return f ? Math.round(q.quantity * f * 1000) / 1000 : undefined;
}

/** The HealthKit distance type recorded for each kind of workout (asked for so iOS reveals workout distances). */
export const DISTANCE_TYPE: Partial<Record<ActivityKind, string>> = {
  run: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  walk: 'HKQuantityTypeIdentifierDistanceWalkingRunning',
  ride: 'HKQuantityTypeIdentifierDistanceCycling',
  swim: 'HKQuantityTypeIdentifierDistanceSwimming',
};

export function workoutKind(workoutActivityType: number): ActivityKind {
  return WORKOUT_KIND[workoutActivityType] ?? 'other';
}

export function workoutToActivity(w: HealthWorkout): Activity {
  const kind = workoutKind(w.workoutActivityType);
  const durSec =
    w.duration && w.duration.quantity > 0 && TO_SEC[w.duration.unit]
      ? w.duration.quantity * TO_SEC[w.duration.unit]
      : (w.endDate.getTime() - w.startDate.getTime()) / 1000;
  return {
    id: w.uuid,
    date: localDate(w.startDate),
    startedAt: w.startDate.toISOString(),
    kind,
    name: w.sourceName ? `${KIND_NAME[kind]} · ${w.sourceName}` : KIND_NAME[kind],
    distanceKm: km(w.totalDistance),
    durationSec: durSec > 0 ? Math.round(durSec) : undefined,
    avgHr: w.avgHr && w.avgHr >= 20 && w.avgHr <= 250 ? Math.round(w.avgHr) : undefined,
    maxHr: w.maxHr && w.maxHr >= 20 && w.maxHr <= 250 ? Math.round(w.maxHr) : undefined,
    source: 'apple_health',
  };
}

// HKCategoryValueSleepAnalysis: 0 inBed, 1 asleepUnspecified, 2 awake, 3 core, 4 deep, 5 REM.
const STAGES = new Set([3, 4, 5]);
const UNSPECIFIED = 1;
const IN_BED = 0;

/** Total length of the union of [start, end) intervals, in ms (overlaps counted once). */
function unionMs(intervals: [number, number][]): number {
  const sorted = intervals.filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0]);
  let total = 0;
  let curS = -Infinity;
  let curE = -Infinity;
  for (const [s, e] of sorted) {
    if (s > curE) {
      if (curE > curS) total += curE - curS;
      curS = s;
      curE = e;
    } else curE = Math.max(curE, e);
  }
  if (curE > curS) total += curE - curS;
  return total;
}

/**
 * Hours asleep per night, dated by the morning the sleep ended.
 * - Sleep-stage data (Apple Watch: core/deep/REM) is the most accurate; when a night has it, only it is used.
 *   Otherwise generic "asleep" records are used, and failing that, time in bed.
 * - Overlapping records within the chosen level (several apps) are merged, not added.
 * - Daytime naps (starting 10:00–18:00) are left out of nightly sleep.
 */
export function sleepNights(samples: HealthCategorySample[]): { date: ISODate; hours: number }[] {
  const byNight = new Map<ISODate, { stages: [number, number][]; unspecified: [number, number][]; inBed: [number, number][] }>();
  for (const s of samples) {
    const startHour = s.startDate.getHours();
    if (startHour >= 10 && startHour < 18) continue;
    // A sample ending before 6pm belongs to that morning's night; later ones (naps, early bedtimes) to the next day.
    const end = s.endDate;
    const night = end.getHours() < 18 ? localDate(end) : localDate(new Date(end.getTime() + 12 * 3600 * 1000));
    const slot = byNight.get(night) ?? { stages: [], unspecified: [], inBed: [] };
    const iv: [number, number] = [s.startDate.getTime(), s.endDate.getTime()];
    if (STAGES.has(s.value)) slot.stages.push(iv);
    else if (s.value === UNSPECIFIED) slot.unspecified.push(iv);
    else if (s.value === IN_BED) slot.inBed.push(iv);
    byNight.set(night, slot);
  }
  const out: { date: ISODate; hours: number }[] = [];
  for (const [date, slot] of byNight) {
    const ms = unionMs(slot.stages.length ? slot.stages : slot.unspecified.length ? slot.unspecified : slot.inBed);
    const hours = Math.round((ms / 3_600_000) * 10) / 10;
    if (hours >= 1 && hours <= 20) out.push({ date, hours });
  }
  return out.sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Average of each day's samples (e.g. several HRV readings per day). */
export function dailyAverages(samples: HealthQuantitySample[], decimals = 0): { date: ISODate; value: number }[] {
  const byDay = new Map<ISODate, number[]>();
  for (const s of samples) {
    if (!(s.quantity > 0)) continue;
    const d = localDate(s.startDate);
    byDay.set(d, [...(byDay.get(d) ?? []), s.quantity]);
  }
  const f = 10 ** decimals;
  return [...byDay.entries()]
    .map(([date, v]) => ({ date, value: Math.round((v.reduce((t, x) => t + x, 0) / v.length) * f) / f }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}
