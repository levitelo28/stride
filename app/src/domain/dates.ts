import type { ISODate } from './types';

// All date math runs at UTC noon so DST shifts never move a calendar day.
const atNoon = (d: ISODate) => new Date(d + 'T12:00:00Z');

export function addDays(d: ISODate, n: number): ISODate {
  const x = atNoon(d);
  x.setUTCDate(x.getUTCDate() + n);
  return x.toISOString().slice(0, 10);
}

/** Monday of the week containing `d`. */
export function weekStart(d: ISODate): ISODate {
  const x = atNoon(d);
  x.setUTCDate(x.getUTCDate() - ((x.getUTCDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((atNoon(b).getTime() - atNoon(a).getTime()) / 86_400_000);
}

/** Today in the device's local time zone. */
export function today(now = new Date()): ISODate {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(atNoon(s).getTime());
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function weekdayShort(d: ISODate): string {
  return WEEKDAYS[atNoon(d).getUTCDay()];
}

export function formatDay(d: ISODate): string {
  const x = atNoon(d);
  return `${WEEKDAYS[x.getUTCDay()]}, ${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`;
}

export function formatShort(d: ISODate): string {
  const x = atNoon(d);
  return `${MONTHS[x.getUTCMonth()]} ${x.getUTCDate()}`;
}
