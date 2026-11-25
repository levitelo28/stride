/**
 * Deterministic starter-plan generator, ported from the v9 web app (goal-core.js).
 * The AI coach will later propose edits; these rules remain the safety baseline.
 *
 * Changes from v9:
 * - Progression only advances on build weeks, so the week after a recovery week
 *   no longer jumps ~15% above the last build week.
 * - The long run is capped at 45% of weekly volume (3 or fewer run days) or 38% (4–5 days);
 *   v9 allowed up to 49%.
 * - Strength days honour the requested count (v9 capped running plans at 2).
 */
import { addDays, isISODate, weekStart } from './dates';
import type { GoalInput, GoalType, ISODate, Plan, PlannedSession, WeekSummary } from './types';

export const GOAL_TYPES: GoalType[] = ['5k', '10k', 'half', 'marathon', 'general', 'strength', 'custom'];
export const GOAL_LABELS: Record<GoalType, string> = {
  '5k': '5K',
  '10k': '10K',
  half: 'Half marathon',
  marathon: 'Marathon',
  general: 'General fitness',
  strength: 'Build strength',
  custom: 'Custom running goal',
};

const EVENT_KM: Partial<Record<GoalType, number>> = { '5k': 5, '10k': 10, half: 21.0975, marathon: 42.195 };
const IDEAL_LONGEST: Record<string, number> = { '5k': 10, '10k': 14, half: 23, marathon: 30, custom: 16 };
const PEAK_WEEK: Record<string, number> = { '5k': 24, '10k': 35, half: 45, marathon: 60, custom: 36 };
/** Run-day offsets from Monday, by runs per week. The last one is the long run. */
const RUN_DAYS: Record<number, number[]> = { 2: [2, 6], 3: [2, 4, 6], 4: [1, 2, 4, 6], 5: [1, 2, 3, 4, 6] };
/** Preferred strength-day offsets, in priority order. */
const STRENGTH_PREF = [0, 3, 1, 5, 4];

const WEEKLY_GROWTH = 1.07;
const LONG_RUN_GROWTH = 1.09;
const MAX_WEEKS = 80;

const round1 = (x: number) => Math.round(x * 10) / 10;

export class PlanInputError extends Error {}

export function validateGoal(input: GoalInput): GoalInput {
  const g = { ...input };
  if (!GOAL_TYPES.includes(g.type)) throw new PlanInputError('Choose a supported goal type');
  if (!isISODate(g.targetDate)) throw new PlanInputError('Choose a valid target date');
  g.baseWeeklyKm = Number(g.baseWeeklyKm ?? 0);
  g.currentLongestKm = Number(g.currentLongestKm ?? 0);
  if (!Number.isFinite(g.baseWeeklyKm) || g.baseWeeklyKm < 0 || g.baseWeeklyKm > 250)
    throw new PlanInputError('Enter current weekly kilometres between 0 and 250');
  if (!Number.isFinite(g.currentLongestKm) || g.currentLongestKm < 0 || g.currentLongestKm > 200)
    throw new PlanInputError('Enter a reasonable current long run');
  if (![2, 3, 4, 5].includes(g.runDays) || ![1, 2, 3, 4].includes(g.strengthDays))
    throw new PlanInputError('Choose valid days per week');
  g.name = (g.name ?? '').trim().slice(0, 100);
  g.constraints = (g.constraints ?? '').trim().slice(0, 600);
  return g;
}

export function buildPlan(input: GoalInput, asOf: ISODate): Plan {
  const goal = validateGoal(input);
  if (goal.targetDate < asOf) throw new PlanInputError('Target date must be today or in the future');
  const start = weekStart(asOf);
  const weeks =
    Math.round((Date.parse(weekStart(goal.targetDate)) - Date.parse(start)) / (7 * 86_400_000)) + 1;
  if (weeks > MAX_WEEKS) throw new PlanInputError(`Choose a goal date within the next ${MAX_WEEKS} weeks`);

  const sessions: Record<ISODate, PlannedSession> = {};
  const summary: WeekSummary[] = [];
  const warnings: string[] = [];
  const inRange = (d: ISODate) => d >= asOf && d <= goal.targetDate;
  const isRunning = goal.type in IDEAL_LONGEST;

  if (weeks < 8 && (goal.type === 'half' || goal.type === 'marathon'))
    warnings.push('This deadline allows little preparation. Consider a later event; no schedule guarantees readiness.');
  if (goal.type === 'marathon' && (goal.baseWeeklyKm < 25 || goal.currentLongestKm < 12))
    warnings.push(
      'Your current running base is limited for a marathon. The plan caps long runs and weekly increases; reassess readiness before race day.',
    );
  if (goal.constraints)
    warnings.push('You reported a limitation. The plan cannot assess injuries or medical risk; adjust with qualified support.');

  if (isRunning) {
    const runDays = RUN_DAYS[goal.runDays];
    const strengthDays = STRENGTH_PREF.filter((d) => !runDays.includes(d)).slice(0, goal.strengthDays);
    const base = Math.max(6, goal.baseWeeklyKm || 8);
    const baseLong = Math.max(3, Math.min(goal.currentLongestKm || 4, base * 0.55));
    const longShare = goal.runDays <= 3 ? 0.45 : 0.38;
    let build = 0; // number of completed build weeks; recovery weeks don't advance it

    for (let k = 0; k < weeks; k++) {
      const wk = addDays(start, k * 7);
      const recovery = k % 4 === 3 && k < weeks - 2;
      const taper = k === weeks - 2 ? 0.68 : k === weeks - 1 ? 0.4 : 1;
      const level = Math.min(PEAK_WEEK[goal.type], base * WEEKLY_GROWTH ** build);
      const target = round1(level * (recovery ? 0.8 : 1) * taper);
      const longest = round1(
        Math.min(
          IDEAL_LONGEST[goal.type],
          baseLong * LONG_RUN_GROWTH ** build * (recovery ? 0.78 : 1) * taper,
          target * longShare,
        ),
      );
      if (!recovery) build++;

      // Split the rest of the week evenly across the other run days (min 1 km each).
      const others = runDays.slice(0, -1);
      const rest = Math.max(0, target - longest);
      const each = Math.max(1, Math.floor((rest / others.length) * 10) / 10);
      others.forEach((offset, i) => {
        const date = addDays(wk, offset);
        const km = i === others.length - 1 ? Math.max(1, round1(rest - each * (others.length - 1))) : each;
        if (inRange(date))
          sessions[date] = {
            date,
            kind: 'run',
            label: i === 0 ? 'Easy run' : 'Recovery run',
            distanceKm: km,
            note: 'Easy conversational pace. Shorten or skip for pain or unusual fatigue.',
          };
      });
      const longDay = addDays(wk, runDays[runDays.length - 1]);
      if (inRange(longDay))
        sessions[longDay] = {
          date: longDay,
          kind: 'long',
          label: 'Long easy run',
          distanceKm: longest,
          note: 'Comfortable effort; walk breaks are fine. Keep it under about 3 hours and practise fuelling.',
        };
      if (k < weeks - 1)
        strengthDays.forEach((offset) => {
          const date = addDays(wk, offset);
          if (inRange(date) && !sessions[date])
            sessions[date] = {
              date,
              kind: 'strength',
              label: 'Strength & conditioning',
              minutes: recovery ? 25 : 35,
              note: 'Moderate effort to support your running.',
            };
        });
      summary.push({ weekStart: wk, plannedKm: target, longRunKm: longest });
    }

    const eventKm = EVENT_KM[goal.type];
    if (eventKm)
      sessions[goal.targetDate] = {
        date: goal.targetDate,
        kind: 'event',
        label: goal.name || GOAL_LABELS[goal.type],
        distanceKm: round1(eventKm),
        note: 'Goal event. How you pace it depends on how training actually went.',
      };
  } else {
    const slots = [[0], [0, 3], [0, 2, 4], [0, 1, 3, 4]][goal.strengthDays - 1];
    for (let k = 0; k < weeks; k++) {
      const wk = addDays(start, k * 7);
      const recovery = k % 4 === 3;
      slots.forEach((offset, j) => {
        const date = addDays(wk, offset);
        const cardio = goal.type === 'general' && j % 2 === 1;
        if (inRange(date))
          sessions[date] = {
            date,
            kind: cardio ? 'other' : 'strength',
            label: cardio ? 'Cardio / mobility' : 'Strength workout',
            minutes: recovery ? 25 : Math.min(60, 30 + Math.floor(k / 3) * 5),
            note: recovery
              ? 'Lighter recovery week; focus on technique.'
              : 'Adapt exercises to your equipment and experience; track weights and recovery.',
          };
      });
      if (goal.type === 'general') {
        const date = addDays(wk, 5);
        if (inRange(date) && !sessions[date])
          sessions[date] = {
            date,
            kind: 'other',
            label: 'Easy aerobic activity',
            minutes: recovery ? 20 : Math.min(45, 25 + Math.floor(k / 4) * 5),
            note: 'Walk, cycle, swim or anything enjoyable at an easy effort.',
          };
      }
      summary.push({ weekStart: wk, sessions: slots.length + (goal.type === 'general' ? 1 : 0) });
    }
  }

  return { goal, createdAt: new Date().toISOString(), sessions, weeks: summary, warnings };
}
