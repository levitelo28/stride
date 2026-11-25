// Sample data for "Explore with sample data" (also handy for App Store review and screenshots).
import { addDays, weekStart } from './dates';
import { buildPlan } from './plan';
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
