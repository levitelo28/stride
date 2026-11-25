/**
 * Reads the v9 web app's single JSON record (stride_user_state.state) into typed data.
 * Temporary bridge until per-record tables land (milestone 2).
 */
import { dedupeActivities } from './stats';
import { isISODate } from './dates';
import type { Activity, ActivityKind, ActivitySource, Plan, PlannedSession, SessionKind, SleepEntry, UserData } from './types';

const MI = 1.609344; // the web app stored run distances in miles

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const arr = (x: unknown): Obj[] => (Array.isArray(x) ? x.filter(isObj) : []);
const num = (x: unknown): number | undefined => {
  const n = Number(x);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const str = (x: unknown): string | undefined => (typeof x === 'string' && x.trim() ? x.trim() : undefined);

function sourceOf(x: unknown): ActivitySource {
  const s = String(x ?? '').toLowerCase();
  if (s.includes('strava')) return 'strava_csv';
  if (s.includes('apple') || s.includes('health')) return 'apple_health';
  if (s.includes('manual') || s.includes('custom')) return 'manual';
  return 'legacy';
}

function runFrom(r: Obj, fallbackSource: ActivitySource): Activity | null {
  const date = r.date;
  const miles = num(r.distance);
  if (!isISODate(date) || !miles) return null;
  return {
    id: String(r.id ?? `run-${date}-${miles}`),
    date,
    kind: 'run',
    distanceKm: Math.round(miles * MI * 100) / 100,
    durationSec: num(r.seconds),
    avgHr: num(r.hr),
    rpe: num(r.rpe),
    notes: str(r.notes),
    source: r.source ? sourceOf(r.source) : fallbackSource,
  };
}

const KIND_MAP: Record<string, ActivityKind> = {
  run: 'run',
  walk: 'walk',
  ride: 'ride',
  bike: 'ride',
  cycle: 'ride',
  swim: 'swim',
  gym: 'strength',
  strength: 'strength',
  mobility: 'mobility',
  yoga: 'mobility',
};

function customFrom(w: Obj): Activity | null {
  if (!isISODate(w.date)) return null;
  const kind = KIND_MAP[String(w.type ?? '').toLowerCase()] ?? 'other';
  const minutes = num(w.minutes);
  return {
    id: String(w.id ?? `custom-${w.date}`),
    date: w.date,
    kind,
    name: str(w.name) ?? str(w.title),
    distanceKm: num(w.distanceKm),
    durationSec: minutes ? Math.round(minutes * 60) : undefined,
    rpe: num(w.rpe),
    notes: str(w.notes),
    source: 'manual',
  };
}

const SESSION_KIND: Record<string, SessionKind> = {
  run: 'run',
  long: 'long',
  event: 'event',
  gymA: 'strength',
  gymB: 'strength',
  strength: 'strength',
  other: 'other',
};

function planFrom(p: unknown): Plan | null {
  if (!isObj(p) || !isObj(p.sessions) || !isObj(p.profile)) return null;
  const sessions: Record<string, PlannedSession> = {};
  for (const s of Object.values(p.sessions)) {
    if (!isObj(s) || !isISODate(s.date)) continue;
    sessions[s.date] = {
      date: s.date,
      kind: SESSION_KIND[String(s.kind)] ?? 'other',
      label: str(s.label) ?? 'Session',
      distanceKm: num(s.distanceKm),
      minutes: num(s.minutes),
      note: str(s.note),
      edited: s.source === 'User edited',
    };
  }
  const prof = p.profile;
  return {
    goal: {
      type: (str(prof.type) ?? 'custom') as Plan['goal']['type'],
      name: str(prof.name),
      targetDate: isISODate(prof.targetDate) ? prof.targetDate : '',
      runDays: (num(prof.runDays) ?? 3) as Plan['goal']['runDays'],
      strengthDays: (num(prof.strengthDays) ?? 2) as Plan['goal']['strengthDays'],
      baseWeeklyKm: num(prof.baseWeeklyKm) ?? 0,
      currentLongestKm: num(prof.currentLongestKm) ?? 0,
      constraints: str(prof.constraints),
    },
    createdAt: str(p.createdAt) ?? '',
    sessions,
    weeks: [],
    warnings: Array.isArray(p.warnings) ? p.warnings.filter((w): w is string => typeof w === 'string') : [],
  };
}

/** Training-plan rows from stride_training_overrides (the original marathon schedule). */
export interface OverrideRow {
  training_date: string;
  activity: string | null;
  planned_km: number | null;
  instructions: string | null;
}

export function planFromOverrides(rows: OverrideRow[]): Plan | null {
  const sessions: Record<string, PlannedSession> = {};
  for (const r of rows) {
    if (!isISODate(r.training_date)) continue;
    const label = (r.activity ?? '').trim();
    const lower = label.toLowerCase();
    if (!label || lower.includes('rest')) continue;
    const km = num(r.planned_km);
    const kind: SessionKind = /gym|strength/.test(lower)
      ? 'strength'
      : /marathon|race|event/.test(lower) && (km ?? 0) >= 40
        ? 'event'
        : /long/.test(lower)
          ? 'long'
          : km
            ? 'run'
            : 'other';
    sessions[r.training_date] = { date: r.training_date, kind, label, distanceKm: km, note: r.instructions ?? undefined };
  }
  const dates = Object.keys(sessions).sort();
  if (!dates.length) return null;
  return {
    goal: {
      type: 'marathon',
      name: 'Marathon',
      targetDate: dates[dates.length - 1],
      runDays: 3,
      strengthDays: 2,
      baseWeeklyKm: 0,
      currentLongestKm: 0,
    },
    createdAt: '',
    sessions,
    weeks: [],
    warnings: [],
  };
}

/** Every activity in the web-app record, without cross-source deduplication (used when copying to tables). */
export function legacyActivities(state: unknown): Activity[] {
  const s = isObj(state) ? state : {};
  return [
    ...arr(s.runLogs).map((r) => runFrom(r, 'manual')),
    ...arr(s.healthRuns).map((r) => runFrom(r, 'apple_health')),
    ...arr(s.customWorkouts).map(customFrom),
  ].filter((a): a is Activity => a !== null);
}

export function fromLegacyState(state: unknown, overrides: OverrideRow[] = []): UserData {
  const s = isObj(state) ? state : {};
  const activities = dedupeActivities(legacyActivities(state));
  const sleep: SleepEntry[] = arr(s.sleep)
    .filter((x) => isISODate(x.date) && num(x.hours))
    .map((x) => ({ date: x.date as string, hours: Number(x.hours), source: sourceOf(x.source) }));
  const plan = planFrom(s.personalPlan) ?? (s.legacySchedule === false ? null : planFromOverrides(overrides));
  return { activities, plan, sleep };
}
