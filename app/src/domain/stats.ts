import { addDays, weekStart } from './dates';
import type { Activity, ISODate, Plan } from './types';

export interface WeekStats {
  weekStart: ISODate;
  runKm: number;
  plannedKm: number;
  runs: number;
  activities: number;
}

const DISTANCE_KINDS = new Set(['run']);

/** Weekly totals for the `count` weeks ending with the week containing `asOf`. */
export function weeklyStats(activities: Activity[], plan: Plan | null, asOf: ISODate, count: number): WeekStats[] {
  const first = addDays(weekStart(asOf), -7 * (count - 1));
  const weeks: WeekStats[] = Array.from({ length: count }, (_, i) => ({
    weekStart: addDays(first, i * 7),
    runKm: 0,
    plannedKm: 0,
    runs: 0,
    activities: 0,
  }));
  const index = new Map(weeks.map((w, i) => [w.weekStart, i]));
  for (const a of activities) {
    const i = index.get(weekStart(a.date));
    if (i === undefined) continue;
    weeks[i].activities++;
    if (DISTANCE_KINDS.has(a.kind) && a.distanceKm) {
      weeks[i].runKm += a.distanceKm;
      weeks[i].runs++;
    }
  }
  if (plan)
    for (const s of Object.values(plan.sessions)) {
      const i = index.get(weekStart(s.date));
      if (i !== undefined && s.distanceKm && s.kind !== 'event') weeks[i].plannedKm += s.distanceKm;
    }
  for (const w of weeks) {
    w.runKm = Math.round(w.runKm * 10) / 10;
    w.plannedKm = Math.round(w.plannedKm * 10) / 10;
  }
  return weeks;
}

const SOURCE_RANK: Record<Activity['source'], number> = {
  apple_health: 0,
  health_connect: 0,
  strava_csv: 1,
  manual: 2,
  legacy: 3,
};

/** Same workout recorded twice: by the Watch and Strava in Apple Health, or logged by hand as well. */
function sameWorkout(a: Activity, b: Activity): boolean {
  if (a.kind !== b.kind || a.date !== b.date) return false;
  // Both have start times (two Health records): they overlap if they started within 10 minutes.
  if (a.startedAt && b.startedAt) return Math.abs(Date.parse(a.startedAt) - Date.parse(b.startedAt)) <= 10 * 60_000;
  if (a.distanceKm && b.distanceKm)
    return Math.abs(a.distanceKm - b.distanceKm) <= Math.max(0.3, 0.05 * Math.max(a.distanceKm, b.distanceKm));
  if (a.durationSec && b.durationSec && !a.distanceKm && !b.distanceKm)
    return Math.abs(a.durationSec - b.durationSec) <= Math.max(180, 0.1 * Math.max(a.durationSec, b.durationSec));
  return false;
}

/** How much a record tells us; on a tie between sources, the fuller record wins. */
const detail = (a: Activity) => (a.distanceKm ? 2 : 0) + (a.avgHr ? 1 : 0) + (a.startedAt ? 1 : 0);

function better(a: Activity, b: Activity): boolean {
  if (SOURCE_RANK[a.source] !== SOURCE_RANK[b.source]) return SOURCE_RANK[a.source] < SOURCE_RANK[b.source];
  return detail(a) > detail(b);
}

/**
 * Collapse the same workout recorded by several sources. The best record is kept (device over CSV over
 * manual, then the most detailed); effort and notes the user typed on a dropped copy are carried over.
 */
export function dedupeActivities(activities: Activity[]): Activity[] {
  const byDate = new Map<string, Activity[]>();
  for (const a of activities) {
    const day = byDate.get(a.date) ?? [];
    const i = day.findIndex((k) => sameWorkout(k, a));
    if (i < 0) day.push(a);
    else {
      const [keep, drop] = better(a, day[i]) ? [a, day[i]] : [day[i], a];
      day[i] = { ...keep, rpe: keep.rpe ?? drop.rpe, notes: keep.notes ?? drop.notes };
    }
    byDate.set(a.date, day);
  }
  return [...byDate.values()].flat().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

export function formatPace(km?: number, sec?: number): string | undefined {
  if (!km || !sec) return undefined;
  const per = sec / km;
  return `${Math.floor(per / 60)}:${String(Math.round(per % 60)).padStart(2, '0')}/km`;
}

export function formatDuration(sec?: number): string | undefined {
  if (!sec) return undefined;
  const h = Math.floor(sec / 3600);
  const m = Math.round((sec % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m} min`;
}
