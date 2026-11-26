/**
 * Coaching inputs and rule-based insights. Pure and unit-tested.
 * `buildCoachInput` is the only data the AI coach ever sees: a compact summary, not raw records.
 */
import { addDays, daysBetween, weekStart } from './dates';
import type { Activity, DailyValue, ISODate, Plan, SessionKind, SleepEntry, UserData } from './types';

export interface CoachWeek {
  weekStart: ISODate;
  plannedKm: number;
  doneKm: number;
  plannedRuns: number;
  completedRuns: number; // planned run days with a logged run that day
  longRunPlannedKm: number | null;
  longestDoneKm: number | null;
  avgRpe: number | null;
}

export interface CoachInput {
  today: ISODate;
  goal: { type: string; name: string | null; targetDate: ISODate | null; daysToGoal: number | null; notes: string | null } | null;
  weeks: CoachWeek[]; // oldest first, ending with the current week
  load: { last7Km: number; weeklyAvg28Km: number; ratio: number | null };
  sleep: { avg7: number | null; avg28: number | null; nights7: number };
  recent: { date: ISODate; kind: string; km: number | null; minutes: number | null; rpe: number | null; notes: string | null }[];
  upcoming: { date: ISODate; kind: SessionKind; label: string; km: number | null; minutes: number | null }[];
  insights: { id: string; tone: Insight['tone']; title: string }[];
  /** Apple Health recovery signals: 7-day averages vs the prior 28-day baseline. Null without enough data. */
  recovery: { restingHr7: number | null; restingHrBaseline: number | null; hrv7: number | null; hrvBaseline: number | null };
  /** Pre-computed counts, so the coach quotes them instead of re-adding the tables. */
  totals: {
    last14Days: { plannedRuns: number; completedRuns: number; runKm: number };
    allTime: { runs: number; runKm: number };
  };
}

export interface Insight {
  id: string;
  tone: 'good' | 'watch' | 'info';
  title: string;
  detail: string;
}

const r1 = (x: number) => Math.round(x * 10) / 10;
const isRun = (a: Activity) => a.kind === 'run' && !!a.distanceKm;
const runKinds: SessionKind[] = ['run', 'long', 'event'];

function weekStats(data: UserData, wk: ISODate, today: ISODate): CoachWeek {
  const end = addDays(wk, 6);
  const acts = data.activities.filter((a) => a.date >= wk && a.date <= end);
  const runs = acts.filter(isRun);
  const sessions = Object.values(data.plan?.sessions ?? {}).filter((s) => s.date >= wk && s.date <= end);
  const plannedRuns = sessions.filter((s) => runKinds.includes(s.kind) && s.date <= today);
  const runDates = new Set(runs.map((a) => a.date));
  const rpes = acts.map((a) => a.rpe).filter((x): x is number => !!x);
  const long = sessions.find((s) => s.kind === 'long' || s.kind === 'event');
  return {
    weekStart: wk,
    plannedKm: r1(sessions.reduce((t, s) => t + (s.kind !== 'event' && s.distanceKm ? s.distanceKm : 0), 0)),
    doneKm: r1(runs.reduce((t, a) => t + (a.distanceKm ?? 0), 0)),
    plannedRuns: plannedRuns.length,
    completedRuns: plannedRuns.filter((s) => runDates.has(s.date)).length,
    longRunPlannedKm: long?.distanceKm ?? null,
    longestDoneKm: runs.length ? r1(Math.max(...runs.map((a) => a.distanceKm ?? 0))) : null,
    avgRpe: rpes.length ? r1(rpes.reduce((t, x) => t + x, 0) / rpes.length) : null,
  };
}

function sleepAvg(sleep: SleepEntry[], from: ISODate, to: ISODate): { avg: number | null; n: number } {
  const nights = sleep.filter((s) => s.date >= from && s.date <= to);
  return { avg: nights.length ? r1(nights.reduce((t, s) => t + s.hours, 0) / nights.length) : null, n: nights.length };
}

/** Mean of values in [from, to], or null with fewer than `min` days of data. */
function meanBetween(series: DailyValue[] | undefined, from: ISODate, to: ISODate, min: number): number | null {
  const v = (series ?? []).filter((x) => x.date >= from && x.date <= to).map((x) => x.value);
  return v.length >= min ? r1(v.reduce((t, x) => t + x, 0) / v.length) : null;
}

function recoveryOf(data: UserData, today: ISODate): CoachInput['recovery'] {
  const week = addDays(today, -6);
  const baseFrom = addDays(today, -34);
  const baseTo = addDays(today, -7);
  return {
    restingHr7: meanBetween(data.restingHr, week, today, 3),
    restingHrBaseline: meanBetween(data.restingHr, baseFrom, baseTo, 7),
    hrv7: meanBetween(data.hrv, week, today, 3),
    hrvBaseline: meanBetween(data.hrv, baseFrom, baseTo, 7),
  };
}

function loadOf(activities: Activity[], today: ISODate) {
  const km = (from: ISODate) =>
    activities.filter((a) => isRun(a) && a.date >= from && a.date <= today).reduce((t, a) => t + (a.distanceKm ?? 0), 0);
  const last7Km = r1(km(addDays(today, -6)));
  const weeklyAvg28Km = r1(km(addDays(today, -27)) / 4);
  return { last7Km, weeklyAvg28Km, ratio: weeklyAvg28Km >= 5 ? Math.round((last7Km / weeklyAvg28Km) * 100) / 100 : null };
}

export function computeInsights(data: UserData, today: ISODate): Insight[] {
  const out: Insight[] = [];
  const thisWeek = weekStart(today);
  const lastTwo = [addDays(thisWeek, -7), thisWeek].map((wk) => weekStats(data, wk, today));
  const planned = lastTwo.reduce((t, w) => t + w.plannedRuns, 0);
  const done = lastTwo.reduce((t, w) => t + w.completedRuns, 0);
  const load = loadOf(data.activities, today);
  const sleep = sleepAvg(data.sleep, addDays(today, -6), today);
  const lastWeek = lastTwo[0];

  if (planned >= 3) {
    const pct = done / planned;
    if (pct >= 0.85)
      out.push({ id: 'consistency-good', tone: 'good', title: 'Consistent training', detail: `You completed ${done} of ${planned} planned runs over the last two weeks.` });
    else if (pct < 0.6)
      out.push({ id: 'consistency-low', tone: 'watch', title: 'Missed sessions', detail: `${done} of ${planned} planned runs done in the last two weeks. Rebuild gradually rather than making up missed distance.` });
  }
  if (load.ratio !== null && load.ratio > 1.3)
    out.push({ id: 'load-spike', tone: 'watch', title: 'Running load jumped', detail: `${load.last7Km} km in the last 7 days vs a ${load.weeklyAvg28Km} km weekly average. Big jumps raise injury risk; keep the next runs easy.` });
  else if (load.ratio !== null && load.ratio < 0.7 && data.plan)
    out.push({ id: 'load-drop', tone: 'info', title: 'Lighter week', detail: `${load.last7Km} km in the last 7 days vs a ${load.weeklyAvg28Km} km weekly average. Fine for recovery; ease back in rather than catching up.` });
  if (lastWeek.longRunPlannedKm && lastWeek.longestDoneKm !== null) {
    if (lastWeek.longestDoneKm >= lastWeek.longRunPlannedKm * 0.9)
      out.push({ id: 'long-run-done', tone: 'good', title: 'Long run completed', detail: `Last week’s longest run was ${lastWeek.longestDoneKm} km (planned ${lastWeek.longRunPlannedKm} km).` });
  } else if (lastWeek.longRunPlannedKm && lastWeek.longestDoneKm === null && lastWeek.plannedRuns > 0)
    out.push({ id: 'long-run-missed', tone: 'watch', title: 'Long run missed', detail: `No run logged last week against a planned ${lastWeek.longRunPlannedKm} km long run.` });
  if (sleep.avg !== null && sleep.n >= 3 && sleep.avg < 7)
    out.push({ id: 'sleep-low', tone: 'watch', title: 'Short on sleep', detail: `Averaging ${sleep.avg} h over ${sleep.n} nights. Recovery and adaptation suffer below about 7 hours.` });
  const rec = recoveryOf(data, today);
  if (rec.restingHr7 !== null && rec.restingHrBaseline !== null && rec.restingHr7 - rec.restingHrBaseline >= 5)
    out.push({ id: 'rhr-up', tone: 'watch', title: 'Resting heart rate is up', detail: `${rec.restingHr7} bpm this week vs your usual ${rec.restingHrBaseline} bpm. That can mean fatigue, stress or illness coming on; go easy.` });
  if (rec.hrv7 !== null && rec.hrvBaseline !== null && rec.hrv7 <= rec.hrvBaseline * 0.85)
    out.push({ id: 'hrv-down', tone: 'watch', title: 'HRV below your normal', detail: `${rec.hrv7} ms this week vs your usual ${rec.hrvBaseline} ms. Your body may not have recovered fully.` });
  else if (rec.hrv7 !== null && rec.hrvBaseline !== null && rec.hrv7 >= rec.hrvBaseline * 1.05 && (rec.restingHr7 ?? 0) <= (rec.restingHrBaseline ?? Infinity))
    out.push({ id: 'recovery-good', tone: 'good', title: 'Recovering well', detail: `HRV ${rec.hrv7} ms (usual ${rec.hrvBaseline} ms) with a steady resting heart rate.` });
  const recentRpe = data.activities.filter((a) => a.rpe && a.date >= addDays(today, -6) && a.date <= today).map((a) => a.rpe!);
  if (recentRpe.length >= 2 && recentRpe.reduce((t, x) => t + x, 0) / recentRpe.length >= 8)
    out.push({ id: 'effort-high', tone: 'watch', title: 'Workouts feel hard', detail: 'Your recent effort ratings average 8+ out of 10. Most running should feel easy (3–5).' });
  if (!out.length && data.activities.length === 0)
    out.push({ id: 'no-data', tone: 'info', title: 'Log a few workouts', detail: 'Insights appear once Stride has a week or two of your training.' });
  return out;
}

function totals(data: UserData, today: ISODate): CoachInput['totals'] {
  const from = addDays(today, -13);
  const runs = data.activities.filter(isRun);
  const recentRuns = runs.filter((a) => a.date >= from && a.date <= today);
  const runDates = new Set(recentRuns.map((a) => a.date));
  const planned = Object.values(data.plan?.sessions ?? {}).filter(
    (s) => runKinds.includes(s.kind) && s.date >= from && s.date <= today,
  );
  return {
    last14Days: {
      plannedRuns: planned.length,
      completedRuns: planned.filter((s) => runDates.has(s.date)).length,
      runKm: r1(recentRuns.reduce((t, a) => t + (a.distanceKm ?? 0), 0)),
    },
    allTime: { runs: runs.length, runKm: r1(runs.reduce((t, a) => t + (a.distanceKm ?? 0), 0)) },
  };
}

export function buildCoachInput(data: UserData, today: ISODate): CoachInput {
  const thisWeek = weekStart(today);
  const weeks = Array.from({ length: 6 }, (_, i) => weekStats(data, addDays(thisWeek, -7 * (5 - i)), today));
  const s7 = sleepAvg(data.sleep, addDays(today, -6), today);
  const s28 = sleepAvg(data.sleep, addDays(today, -27), today);
  const plan: Plan | null = data.plan;
  const g = plan?.goal;
  return {
    today,
    goal: g
      ? {
          type: g.type,
          name: g.name || null,
          targetDate: g.targetDate || null,
          daysToGoal: g.targetDate ? daysBetween(today, g.targetDate) : null,
          notes: g.constraints?.slice(0, 300) || null,
        }
      : null,
    weeks,
    load: loadOf(data.activities, today),
    sleep: { avg7: s7.avg, avg28: s28.avg, nights7: s7.n },
    recent: data.activities
      .filter((a) => a.date >= addDays(today, -13) && a.date <= today)
      .slice(0, 30)
      .map((a) => ({
        date: a.date,
        kind: a.kind,
        km: a.distanceKm ? r1(a.distanceKm) : null,
        minutes: a.durationSec ? Math.round(a.durationSec / 60) : null,
        rpe: a.rpe ?? null,
        notes: a.notes?.slice(0, 200) ?? null,
      })),
    upcoming: Object.values(plan?.sessions ?? {})
      .filter((s) => s.date >= today && s.date <= addDays(today, 13))
      .sort((a, b) => (a.date < b.date ? -1 : 1))
      .map((s) => ({ date: s.date, kind: s.kind, label: s.label, km: s.distanceKm ?? null, minutes: s.minutes ?? null })),
    insights: computeInsights(data, today).map(({ id, tone, title }) => ({ id, tone, title })),
    totals: totals(data, today),
    recovery: recoveryOf(data, today),
  };
}
