/**
 * The AI coach suggests plan changes; these rules decide whether a suggestion may be shown and applied.
 * The model never edits the plan directly: every change passes here, then needs the user's approval.
 */
import { addDays, formatDay, isISODate, weekStart } from './dates';
import type { Activity, ISODate, Plan, PlannedSession, SessionKind } from './types';

export interface Proposal {
  action: 'move' | 'change' | 'remove' | 'add';
  date: ISODate;
  new_date: ISODate | null;
  kind: SessionKind | null;
  label: string | null;
  distance_km: number | null;
  minutes: number | null;
  reason: string;
}

export interface CoachReview {
  summary: string;
  going_well: string[];
  needs_attention: string[];
  today: string;
  proposals: Proposal[];
}

export type Checked =
  | { ok: true; from: ISODate | null; session: PlannedSession | null; removeDate: ISODate | null; description: string }
  | { ok: false; reason: string };

const KINDS: SessionKind[] = ['run', 'long', 'strength', 'other'];
const MAX_WEEKLY_GROWTH = 1.1;
const MAX_LONG_GROWTH = 1.1;

const plannedKm = (sessions: PlannedSession[]) =>
  sessions.reduce((t, s) => t + (s.kind !== 'event' && s.distanceKm ? s.distanceKm : 0), 0);

function weekSessions(plan: Plan, wk: ISODate): PlannedSession[] {
  const end = addDays(wk, 6);
  return Object.values(plan.sessions).filter((s) => s.date >= wk && s.date <= end);
}

/** Longest run the athlete has done in the last 28 days or has planned in the two weeks before `date`. */
function longestReference(plan: Plan, activities: Activity[], date: ISODate, today: ISODate): number {
  const done = activities
    .filter((a) => a.kind === 'run' && a.date >= addDays(today, -28) && a.date <= today)
    .map((a) => a.distanceKm ?? 0);
  const planned = Object.values(plan.sessions)
    .filter((s) => s.date < date && s.date >= addDays(date, -14) && s.kind !== 'event')
    .map((s) => s.distanceKm ?? 0);
  return Math.max(0, ...done, ...planned);
}

/** Check one proposal against the current plan. Does not modify the plan. */
export function checkProposal(plan: Plan, activities: Activity[], p: Proposal, today: ISODate): Checked {
  const no = (reason: string): Checked => ({ ok: false, reason });
  if (!isISODate(p.date) || p.date < today) return no('Only today or future sessions can be changed');
  const existing = plan.sessions[p.date];
  if (existing?.kind === 'event') return no('Race day is never changed automatically');

  let from: ISODate | null = null;
  let next: PlannedSession | null = null;
  let removeDate: ISODate | null = null;

  if (p.action === 'remove') {
    if (!existing) return no('There is no session on that day');
    removeDate = p.date;
    return { ok: true, from: null, session: null, removeDate, description: `Remove ${existing.label} on ${formatDay(p.date)}` };
  }

  if (p.action === 'add') {
    if (existing) return no('That day already has a session');
    if (!p.kind || !KINDS.includes(p.kind) || !p.label) return no('A new session needs a type and name');
    next = { date: p.date, kind: p.kind, label: p.label.slice(0, 200), distanceKm: p.distance_km ?? undefined, minutes: p.minutes ?? undefined, edited: true };
  } else {
    if (!existing) return no('There is no session on that day');
    from = p.date;
    const newDate = p.action === 'move' ? p.new_date : p.date;
    if (!newDate || !isISODate(newDate) || newDate < today) return no('The new date must be today or later');
    if (newDate !== p.date && plan.sessions[newDate]) return no('The new day already has a session');
    if (plan.goal.targetDate && newDate > plan.goal.targetDate) return no('The new date is after your goal date');
    next = {
      ...existing,
      date: newDate,
      kind: p.action === 'change' && p.kind && KINDS.includes(p.kind) ? p.kind : existing.kind,
      label: p.action === 'change' && p.label ? p.label.slice(0, 200) : existing.label,
      distanceKm: p.action === 'change' && p.distance_km !== null ? p.distance_km : existing.distanceKm,
      minutes: p.action === 'change' && p.minutes !== null ? p.minutes : existing.minutes,
      edited: true,
    };
  }

  if (next.distanceKm !== undefined && (!(next.distanceKm > 0) || next.distanceKm > 60)) return no('Distance out of range');
  if (next.minutes !== undefined && (!(next.minutes > 0) || next.minutes > 300)) return no('Duration out of range');

  // Safety: increases must respect the same limits the planner uses.
  const before = from ? plan.sessions[from] : undefined;
  const addedKm = (next.distanceKm ?? 0) - (before && weekStart(before.date) === weekStart(next.date) ? (before.distanceKm ?? 0) : 0);
  if (addedKm > 0.05) {
    const wk = weekStart(next.date);
    const thisWeek = weekSessions(plan, wk).filter((s) => s.date !== from);
    const newWeekKm = plannedKm(thisWeek) + (next.distanceKm ?? 0);
    const prevWeekKm = plannedKm(weekSessions(plan, addDays(wk, -7)));
    const doneLastWeek = activities
      .filter((a) => a.kind === 'run' && a.date >= addDays(wk, -7) && a.date < wk)
      .reduce((t, a) => t + (a.distanceKm ?? 0), 0);
    const baseline = Math.max(prevWeekKm, doneLastWeek, plannedKm(weekSessions(plan, wk)));
    if (baseline > 0 && newWeekKm > baseline * MAX_WEEKLY_GROWTH + 0.1)
      return no(`That week would rise to ${newWeekKm.toFixed(1)} km, more than 10% over ${baseline.toFixed(1)} km`);
    const ref = longestReference(plan, activities, next.date, today);
    if (ref > 0 && (next.distanceKm ?? 0) > ref * MAX_LONG_GROWTH + 1)
      return no(`${next.distanceKm} km is well beyond your longest recent run (${ref.toFixed(1)} km)`);
  }

  const what = next.distanceKm ? `${next.label}, ${next.distanceKm} km` : next.minutes ? `${next.label}, ${next.minutes} min` : next.label;
  const description =
    p.action === 'add'
      ? `Add ${what} on ${formatDay(next.date)}`
      : p.action === 'move'
        ? `Move ${existing!.label} from ${formatDay(p.date)} to ${formatDay(next.date)}`
        : `Change ${formatDay(p.date)} to ${what}`;
  return { ok: true, from, session: next, removeDate, description };
}
