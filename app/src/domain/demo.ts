// Sample data for "Explore with sample data" (also handy for App Store review and screenshots).
import { addDays, weekStart } from './dates';
import { buildPlan } from './plan';
import type { CoachReview, Proposal } from './proposals';
import type { Activity, ISODate, UserData } from './types';

export function demoData(asOf: ISODate): UserData {
  const activities: Activity[] = [];
  const start = addDays(weekStart(asOf), -7 * 10);
  // Deterministic pseudo-random so screenshots are stable.
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let w = 0; w < 11; w++) {
    const wk = addDays(start, w * 7);
    const scale = 1 + w * 0.05;
    [
      [2, 6],
      [4, 5],
      [6, 11],
    ].forEach(([offset, km], i) => {
      const date = addDays(wk, offset);
      if (date >= asOf || rand() < 0.12) return; // occasional missed run
      const distanceKm = Math.round(km * scale * (0.9 + rand() * 0.2) * 10) / 10;
      activities.push({
        id: `demo-${date}`,
        date,
        kind: 'run',
        name: i === 2 ? 'Long run' : 'Easy run',
        distanceKm,
        durationSec: Math.round(distanceKm * (360 + rand() * 40)),
        avgHr: Math.round(140 + rand() * 15),
        source: 'apple_health',
      });
    });
    const gym = addDays(wk, 0);
    if (gym < asOf)
      activities.push({ id: `demo-gym-${gym}`, date: gym, kind: 'strength', name: 'Strength', durationSec: 2400, source: 'manual' });
  }
  activities.sort((a, b) => (a.date < b.date ? 1 : -1));
  const plan = buildPlan(
    {
      type: 'half',
      name: 'Spring Half',
      targetDate: addDays(weekStart(asOf), 7 * 14 + 6),
      runDays: 3,
      strengthDays: 1,
      baseWeeklyKm: 22,
      currentLongestKm: 12,
    },
    asOf,
  );
  const sleep = Array.from({ length: 14 }, (_, i) => ({
    date: addDays(asOf, -i - 1),
    hours: Math.round((6.4 + rand() * 1.8) * 10) / 10,
    source: 'apple_health' as const,
  }));
  return { activities, plan, sleep };
}

/** A canned review for sample mode (the real coach needs an account). Proposals target the sample plan. */
export function demoReview(data: UserData, asOf: ISODate): CoachReview {
  const upcoming = Object.values(data.plan?.sessions ?? {})
    .filter((s) => s.date >= asOf && s.kind === 'run')
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const proposals: Proposal[] = [];
  const first = upcoming[0];
  if (first?.distanceKm)
    proposals.push({
      action: 'change',
      date: first.date,
      new_date: null,
      kind: null,
      label: 'Easy recovery run',
      distance_km: Math.max(3, Math.round((first.distanceKm - 1.5) * 10) / 10),
      minutes: null,
      reason: 'Your sleep has been a little short this week, so keep this one shorter and very easy.',
    });
  const second = upcoming[1];
  if (second) {
    const free = [1, 2, 3].map((n) => addDays(second.date, n)).find((d) => !data.plan?.sessions[d]);
    if (free)
      proposals.push({
        action: 'move',
        date: second.date,
        new_date: free,
        kind: null,
        label: null,
        distance_km: null,
        minutes: null,
        reason: 'Spacing runs out leaves a recovery day before your long run.',
      });
  }
  return {
    summary: 'A steady block: weekly distance has grown gradually and most planned runs got done. (Sample review.)',
    going_well: ['Long runs are building steadily week to week.', 'You completed most planned runs over the last two weeks.'],
    needs_attention: ['Sleep has averaged under 7 hours on several nights.'],
    today: 'Keep today’s run conversational; if you feel flat, cut it short.',
    proposals,
  };
}
