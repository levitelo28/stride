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

/** Collapse the same run recorded by two sources (e.g. Strava CSV and manual) on the same day. */
export function dedupeActivities(activities: Activity[]): Activity[] {
  const seen = new Map<string, Activity>();
  const rank: Record<Activity['source'], number> = {
    apple_health: 0,
    health_connect: 0,
    strava_csv: 1,
    manual: 2,
    legacy: 3,
  };
  for (const a of activities) {
    const key =
      a.kind === 'run' && a.distanceKm ? `${a.date}|run|${Math.round(a.distanceKm * 2) / 2}` : `${a.id}`;
    const prev = seen.get(key);
    if (!prev || rank[a.source] < rank[prev.source]) seen.set(key, a);
  }
  return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
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
