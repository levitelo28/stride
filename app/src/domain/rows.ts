/**
 * Conversions between database rows (supabase/migrations/20261126000000_core_tables.sql)
 * and the app's domain types. Pure functions, unit-tested.
 */
import type { Activity, ActivityKind, ActivitySource, DailyValue, GoalInput, ISODate, Plan, PlannedSession, SessionKind, SleepEntry } from './types';

export interface ActivityRow {
  id?: string;
  user_id: string;
  source: ActivitySource;
  external_id: string | null;
  kind: ActivityKind;
  name: string | null;
  local_date: ISODate;
  started_at?: string | null;
  duration_sec: number | null;
  distance_km: number | string | null; // numeric columns come back as strings from PostgREST
  avg_hr: number | null;
  max_hr?: number | null;
  rpe: number | null;
  notes: string | null;
}

export interface MetricRow {
  user_id: string;
  local_date: ISODate;
  metric: 'sleep_hours' | 'resting_hr' | 'hrv_sdnn_ms' | 'steps' | 'vo2max' | 'weight_kg';
  value: number | string;
  source: ActivitySource;
}

export interface PlanRow {
  id: string;
  user_id: string;
  status: 'active' | 'archived';
  source: 'rules' | 'coach' | 'legacy';
  goal: GoalInput;
  warnings: string[];
  legacy_fingerprint: string | null;
  created_at: string;
}

export interface PlanSessionRow {
  id?: string;
  plan_id: string;
  user_id: string;
  local_date: ISODate;
  kind: SessionKind;
  label: string;
  distance_km: number | string | null;
  minutes: number | null;
  note: string | null;
  edited: boolean;
}

const n = (x: number | string | null | undefined): number | undefined => {
  if (x === null || x === undefined || x === '') return undefined;
  const v = Number(x);
  return Number.isFinite(v) ? v : undefined;
};
const clampInt = (x: number | undefined, lo: number, hi: number) =>
  x === undefined ? null : Math.min(hi, Math.max(lo, Math.round(x)));

/** legacy_fingerprint value marking a copied plan the user has edited in the new app; the web app no longer overwrites it. */
export const DETACHED = 'detached';

/** Prefix for external IDs of records copied from the v9 web app. */
export const V9_PREFIX = 'v9:';

export function activityToRow(a: Activity, userId: string, externalId: string | null): ActivityRow {
  return {
    user_id: userId,
    source: a.source,
    external_id: externalId,
    kind: a.kind,
    name: a.name?.slice(0, 200) ?? null,
    local_date: a.date,
    started_at: a.startedAt ?? null,
    duration_sec: a.durationSec && a.durationSec > 0 && a.durationSec < 172800 ? Math.round(a.durationSec) : null,
    distance_km: a.distanceKm && a.distanceKm > 0 && a.distanceKm < 1000 ? Math.round(a.distanceKm * 1000) / 1000 : null,
    avg_hr: a.avgHr && a.avgHr >= 20 && a.avgHr <= 250 ? Math.round(a.avgHr) : null,
    max_hr: a.maxHr && a.maxHr >= 20 && a.maxHr <= 250 ? Math.round(a.maxHr) : null,
    rpe: clampInt(a.rpe, 1, 10),
    notes: a.notes?.slice(0, 2000) ?? null,
  };
}

export function activityFromRow(r: ActivityRow): Activity {
  return {
    id: r.id ?? `${r.source}:${r.external_id}`,
    date: r.local_date,
    startedAt: r.started_at ?? undefined,
    kind: r.kind,
    name: r.name ?? undefined,
    distanceKm: n(r.distance_km),
    durationSec: r.duration_sec ?? undefined,
    avgHr: r.avg_hr ?? undefined,
    maxHr: r.max_hr ?? undefined,
    rpe: r.rpe ?? undefined,
    notes: r.notes ?? undefined,
    source: r.source,
    fromWebApp: !!r.external_id?.startsWith(V9_PREFIX),
  };
}

export function sleepToRow(s: SleepEntry, userId: string): MetricRow {
  return { user_id: userId, local_date: s.date, metric: 'sleep_hours', value: s.hours, source: s.source };
}

const SOURCE_RANK: Record<ActivitySource, number> = { apple_health: 0, health_connect: 0, manual: 1, strava_csv: 2, legacy: 3 };

/** One sleep entry per night; a device measurement beats a manual entry for the same night. */
export function sleepFromRows(rows: MetricRow[]): SleepEntry[] {
  const best = new Map<ISODate, MetricRow>();
  for (const r of rows) {
    if (r.metric !== 'sleep_hours') continue;
    const prev = best.get(r.local_date);
    if (!prev || SOURCE_RANK[r.source] < SOURCE_RANK[prev.source]) best.set(r.local_date, r);
  }
  return [...best.values()]
    .map((r) => ({ date: r.local_date, hours: Number(r.value), source: r.source }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** Daily series for one metric (resting HR, HRV), oldest first. */
export function seriesFromRows(rows: MetricRow[], metric: MetricRow['metric']): DailyValue[] {
  return rows
    .filter((r) => r.metric === metric)
    .map((r) => ({ date: r.local_date, value: Number(r.value) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

export function sessionToRow(s: PlannedSession, planId: string, userId: string): PlanSessionRow {
  return {
    plan_id: planId,
    user_id: userId,
    local_date: s.date,
    kind: s.kind,
    label: (s.label || 'Session').slice(0, 200),
    distance_km: s.distanceKm && s.distanceKm > 0 && s.distanceKm < 500 ? Math.round(s.distanceKm * 100) / 100 : null,
    minutes: s.minutes && s.minutes > 0 && s.minutes < 1440 ? Math.round(s.minutes) : null,
    note: s.note?.slice(0, 1000) ?? null,
    edited: !!s.edited,
  };
}

export function planFromRows(plan: PlanRow, sessions: PlanSessionRow[]): Plan {
  const out: Record<ISODate, PlannedSession> = {};
  for (const s of sessions)
    out[s.local_date] = {
      id: s.id,
      date: s.local_date,
      kind: s.kind,
      label: s.label,
      distanceKm: n(s.distance_km),
      minutes: s.minutes ?? undefined,
      note: s.note ?? undefined,
      edited: s.edited,
    };
  return {
    id: plan.id,
    source: plan.source,
    goal: plan.goal,
    createdAt: plan.created_at,
    sessions: out,
    weeks: [],
    warnings: plan.warnings ?? [],
  };
}

/** Stable fingerprint of a plan's sessions, used to detect changes made in the web app. */
export function planFingerprint(plan: Plan): string {
  const text = JSON.stringify(
    Object.keys(plan.sessions)
      .sort()
      .map((d) => {
        const s = plan.sessions[d];
        return [d, s.kind, s.label, s.distanceKm ?? null, s.minutes ?? null, s.note ?? null];
      }),
  );
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${text.length}-${h.toString(16)}`;
}
