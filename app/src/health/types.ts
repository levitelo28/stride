import type { Activity, ISODate } from '@/domain/types';

/** Everything one Health sync reads, already mapped to Stride's shapes. */
export interface HealthRead {
  activities: Activity[];
  /** HealthKit UUIDs of workouts deleted since the last anchor. */
  deletedIds: string[];
  sleep: { date: ISODate; hours: number }[];
  restingHr: { date: ISODate; value: number }[];
  hrv: { date: ISODate; value: number }[];
  /** Opaque HealthKit anchor to pass to the next sync. */
  anchor: string;
}
