// Apple Health reader (iPhone). Read-only: Stride never writes to Health.
import {
  isHealthDataAvailable,
  queryCategorySamples,
  queryQuantitySamples,
  queryWorkoutSamplesWithAnchor,
  requestAuthorization,
} from '@kingstinct/react-native-healthkit';

import { DISTANCE_TYPE, dailyAverages, sleepNights, workoutKind, workoutToActivity } from '@/domain/health';

import type { HealthRead } from './types';

export type { HealthRead } from './types';

export const healthSupported = true;

// iOS hides a workout's distance and heart-rate figures unless the app may read those data types too.
const READ = [
  'HKWorkoutTypeIdentifier',
  'HKQuantityTypeIdentifierDistanceWalkingRunning',
  'HKQuantityTypeIdentifierDistanceCycling',
  'HKQuantityTypeIdentifierDistanceSwimming',
  'HKQuantityTypeIdentifierHeartRate',
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

  // Newer Watch workouts keep distance in per-type statistics rather than the deprecated totalDistance.
  const activities = await Promise.all(
    workouts.workouts.map(async (w) => {
      const type = Number(w.workoutActivityType);
      const distanceType = DISTANCE_TYPE[workoutKind(type)];
      const [distance, heart] = await Promise.all([
        !w.totalDistance && distanceType
          ? w.getStatistic(distanceType as Parameters<typeof w.getStatistic>[0], 'm').catch(() => undefined)
          : undefined,
        w.getStatistic('HKQuantityTypeIdentifierHeartRate', 'count/min').catch(() => undefined),
      ]);
      return workoutToActivity({
        uuid: w.uuid,
        workoutActivityType: type,
        startDate: w.startDate,
        endDate: w.endDate,
        duration: w.duration,
        totalDistance: w.totalDistance ?? (distance?.sumQuantity ? { quantity: distance.sumQuantity.quantity, unit: 'm' } : undefined),
        totalEnergyBurned: w.totalEnergyBurned,
        avgHr: heart?.averageQuantity?.quantity,
        sourceName: w.sourceRevision?.source?.name,
      });
    }),
  );

  return {
    activities,
    deletedIds: workouts.deletedSamples.map((d) => d.uuid),
    sleep: sleepNights(sleep.map((s) => ({ value: Number(s.value), startDate: s.startDate, endDate: s.endDate }))),
    restingHr: dailyAverages(resting.map((s) => ({ quantity: s.quantity, startDate: s.startDate }))),
    hrv: dailyAverages(hrv.map((s) => ({ quantity: s.quantity, startDate: s.startDate }))),
    anchor: workouts.newAnchor,
  };
}
