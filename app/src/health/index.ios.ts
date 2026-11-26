// Apple Health reader (iPhone). Read-only: Stride never writes to Health.
import {
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  queryWorkoutSamplesWithAnchor,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import { dailyAverages, sleepNights, workoutToActivity } from '@/domain/health';

import type { HealthRead } from './types';

export type { HealthRead } from './types';

export const healthSupported = true;

const READ = [
  'HKWorkoutTypeIdentifier',
  'HKCategoryTypeIdentifierSleepAnalysis',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
] as const;

/** First sync looks back this far; later syncs use HealthKit's change anchor for workouts. */
const FIRST_SYNC_DAYS = 365;
/** Sleep and daily metrics are re-read for this window on every sync (cheap, and catches late Watch uploads). */
const METRIC_DAYS = 30;

export function healthAvailable(): boolean {
  try {
    return isHealthDataAvailable();
  } catch {
    return false;
  }
}

/** Shows Apple's permission sheet. iOS never reveals which read permissions were granted; denied types just return no data. */
export async function connectHealth(): Promise<boolean> {
  return requestAuthorization({ toRead: READ });
}

export async function readHealth(anchor: string | null): Promise<HealthRead> {
  const now = new Date();
  const since = (days: number) => new Date(now.getTime() - days * 86_400_000);

  const workouts = await queryWorkoutSamplesWithAnchor({
    limit: 0,
    anchor: anchor ?? undefined,
    filter: anchor ? undefined : { date: { startDate: since(FIRST_SYNC_DAYS) } },
  });
  const metricsFilter = { date: { startDate: since(METRIC_DAYS) } };
  const [sleep, resting, hrv] = await Promise.all([
    queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', { limit: 0, filter: metricsFilter }),
    queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', { limit: 0, filter: metricsFilter, unit: 'count/min' }),
    queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { limit: 0, filter: metricsFilter, unit: 'ms' }),
  ]);

  return {
    activities: workouts.workouts.map((w) =>
      workoutToActivity({
        uuid: w.uuid,
        workoutActivityType: Number(w.workoutActivityType),
        startDate: w.startDate,
        endDate: w.endDate,
        duration: w.duration,
        totalDistance: w.totalDistance,
        totalEnergyBurned: w.totalEnergyBurned,
        sourceName: w.sourceRevision?.source?.name,
      }),
    ),
    deletedIds: workouts.deletedSamples.map((d) => d.uuid),
    sleep: sleepNights(sleep.map((s) => ({ value: Number(s.value), startDate: s.startDate, endDate: s.endDate }))),
    restingHr: dailyAverages(resting.map((s) => ({ quantity: s.quantity, startDate: s.startDate }))),
    hrv: dailyAverages(hrv.map((s) => ({ quantity: s.quantity, startDate: s.startDate }))),
    anchor: workouts.newAnchor,
  };
}
