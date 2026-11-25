/** Parsing and validation for the app's forms. Inputs are the raw strings typed by the user. */
import { isISODate } from './dates';
import { PlanInputError, validateGoal } from './plan';
import type { Activity, ActivityKind, GoalInput, GoalType, ISODate, Plan, PlannedSession, SessionKind } from './types';

export type Result<T> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const err = <T>(error: string): Result<T> => ({ ok: false, error });

/** Parse an optional positive number ("" → undefined). Accepts a decimal comma. */
function optNumber(raw: string, label: string, max: number): Result<number | undefined> {
  const t = raw.trim().replace(',', '.');
  if (!t) return ok(undefined);
  const v = Number(t);
  if (!Number.isFinite(v) || v <= 0) return err(`${label} must be a positive number`);
  if (v >= max) return err(`${label} must be less than ${max}`);
  return ok(v);
}

export interface SessionForm {
  date: string;
  kind: SessionKind;
  label: string;
  distanceKm: string;
  minutes: string;
  note: string;
}

export function sessionToForm(s: PlannedSession): SessionForm {
  return {
    date: s.date,
    kind: s.kind,
    label: s.label,
    distanceKm: s.distanceKm ? String(s.distanceKm) : '',
    minutes: s.minutes ? String(s.minutes) : '',
    note: s.note ?? '',
  };
}

export function parseSessionForm(f: SessionForm): Result<PlannedSession> {
  if (!isISODate(f.date.trim())) return err('Enter the date as YYYY-MM-DD');
  const label = f.label.trim();
  if (!label) return err('Give the session a name');
  if (label.length > 200) return err('Name is too long');
  const km = optNumber(f.distanceKm, 'Distance', 500);
  if (!km.ok) return km;
  const min = optNumber(f.minutes, 'Minutes', 1440);
  if (!min.ok) return min;
  if (f.note.length > 1000) return err('Note is too long');
  return ok({
    date: f.date.trim(),
    kind: f.kind,
    label,
    distanceKm: km.value,
    minutes: min.value === undefined ? undefined : Math.round(min.value),
    note: f.note.trim() || undefined,
    edited: true,
  });
}

/** Apply an edit (possibly a move) to a plan. Returns the new plan, or an error if the target day is taken. */
export function applySessionEdit(plan: Plan, fromDate: ISODate, edited: PlannedSession): Result<Plan> {
  if (edited.date !== fromDate && plan.sessions[edited.date])
    return err(`There is already a session on ${edited.date}. Move or remove that one first.`);
  const sessions = { ...plan.sessions };
  const original = sessions[fromDate];
  delete sessions[fromDate];
  sessions[edited.date] = { ...edited, id: original?.id };
  return ok({ ...plan, sessions });
}

export function removeSession(plan: Plan, date: ISODate): Plan {
  const sessions = { ...plan.sessions };
  delete sessions[date];
  return { ...plan, sessions };
}

export interface ActivityForm {
  date: string;
  kind: ActivityKind;
  name: string;
  distanceKm: string;
  minutes: string;
  rpe: string;
  notes: string;
}

export function parseActivityForm(f: ActivityForm, todayDate: ISODate): Result<Omit<Activity, 'id'>> {
  const date = f.date.trim();
  if (!isISODate(date)) return err('Enter the date as YYYY-MM-DD');
  if (date > todayDate) return err('You can only log workouts for today or earlier');
  const km = optNumber(f.distanceKm, 'Distance', 1000);
  if (!km.ok) return km;
  const min = optNumber(f.minutes, 'Duration', 2880);
  if (!min.ok) return min;
  if (f.kind === 'run' && !km.value) return err('Enter the distance for a run');
  if (!km.value && !min.value) return err('Enter a distance or a duration');
  let rpe: number | undefined;
  if (f.rpe.trim()) {
    rpe = Number(f.rpe.trim());
    if (!Number.isInteger(rpe) || rpe < 1 || rpe > 10) return err('Effort must be a whole number from 1 to 10');
  }
  if (f.notes.length > 2000) return err('Notes are too long');
  return ok({
    date,
    kind: f.kind,
    name: f.name.trim().slice(0, 200) || undefined,
    distanceKm: km.value,
    durationSec: min.value ? Math.round(min.value * 60) : undefined,
    rpe,
    notes: f.notes.trim() || undefined,
    source: 'manual',
  });
}

export interface GoalForm {
  type: GoalType;
  name: string;
  targetDate: string;
  runDays: number;
  strengthDays: number;
  baseWeeklyKm: string;
  currentLongestKm: string;
  constraints: string;
}

export function parseGoalForm(f: GoalForm): Result<GoalInput> {
  const num = (s: string) => (s.trim() ? Number(s.trim().replace(',', '.')) : 0);
  try {
    return ok(
      validateGoal({
        type: f.type,
        name: f.name,
        targetDate: f.targetDate.trim(),
        runDays: f.runDays as GoalInput['runDays'],
        strengthDays: f.strengthDays as GoalInput['strengthDays'],
        baseWeeklyKm: num(f.baseWeeklyKm),
        currentLongestKm: num(f.currentLongestKm),
        constraints: f.constraints,
      }),
    );
  } catch (e) {
    if (e instanceof PlanInputError) return err(e.message);
    throw e;
  }
}
