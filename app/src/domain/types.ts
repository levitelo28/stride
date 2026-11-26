/** ISO calendar date, e.g. "2026-11-25" (the user's local day). */
export type ISODate = string;

export type ActivityKind = 'run' | 'walk' | 'ride' | 'swim' | 'strength' | 'mobility' | 'other';
export type ActivitySource = 'manual' | 'apple_health' | 'health_connect' | 'strava_csv' | 'legacy';

/** Something the user actually did. Planned sessions never count as activities. */
export interface Activity {
  id: string;
  date: ISODate;
  kind: ActivityKind;
  name?: string;
  distanceKm?: number;
  durationSec?: number;
  avgHr?: number;
  rpe?: number;
  notes?: string;
  source: ActivitySource;
  /** Copied from the v9 web app; edit it there (changes here would be overwritten). */
  fromWebApp?: boolean;
}

export type SessionKind = 'run' | 'long' | 'event' | 'strength' | 'other';

export interface PlannedSession {
  /** Database row id; absent for sessions that haven't been saved (previews, sample data). */
  id?: string;
  date: ISODate;
  kind: SessionKind;
  label: string;
  distanceKm?: number;
  minutes?: number;
  note?: string;
  edited?: boolean;
}

export type GoalType = '5k' | '10k' | 'half' | 'marathon' | 'general' | 'strength' | 'custom';

export interface GoalInput {
  type: GoalType;
  name?: string;
  targetDate: ISODate;
  runDays: 2 | 3 | 4 | 5;
  strengthDays: 1 | 2 | 3 | 4;
  baseWeeklyKm: number;
  currentLongestKm: number;
  constraints?: string;
}

export interface WeekSummary {
  weekStart: ISODate;
  plannedKm?: number;
  longRunKm?: number;
  sessions?: number;
}

export type PlanSource = 'rules' | 'coach' | 'legacy';

export interface Plan {
  id?: string;
  source?: PlanSource;
  goal: GoalInput;
  createdAt: string;
  sessions: Record<ISODate, PlannedSession>;
  weeks: WeekSummary[];
  warnings: string[];
}

export interface SleepEntry {
  date: ISODate;
  hours: number;
  source: ActivitySource;
}

/** Everything the screens need for one user. */
export interface DailyValue {
  date: ISODate;
  value: number;
}

export interface UserData {
  activities: Activity[];
  plan: Plan | null;
  sleep: SleepEntry[];
  /** Daily resting heart rate (bpm) and HRV (SDNN, ms), from Apple Health. Absent when not connected. */
  restingHr?: DailyValue[];
  hrv?: DailyValue[];
}
