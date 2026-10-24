// Content days follow one shared publication calendar (America/New_York by default)
// so every player gets the same rack on the same day. Timestamps stay UTC elsewhere.

export const CONTENT_TIME_ZONE = 'America/New_York';

/** 'YYYY-MM-DD' for the instant in the given time zone. */
export function contentDay(instant: Date, timeZone = CONTENT_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday for a content day. */
export function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay();
}

/**
 * Current streak of consecutive content days. A streak stays alive through today
 * if yesterday was completed and today is not done yet.
 */
export function currentStreak(completedDays: Iterable<string>, today: string): number {
  const done = new Set(completedDays);
  let cursor = done.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (done.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function bestStreak(completedDays: Iterable<string>): number {
  const days = [...new Set(completedDays)].sort();
  let best = 0;
  let run = 0;
  let previous: string | null = null;
  for (const day of days) {
    run = previous !== null && daysBetween(previous, day) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
    previous = day;
  }
  return best;
}

/** Monday-to-Sunday dates of the week containing `day`. */
export function calendarWeek(day: string): string[] {
  const weekday = weekdayOf(day);
  const monday = addDays(day, weekday === 0 ? -6 : 1 - weekday);
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(monday, i));
}

export const STREAK_MILESTONES = [3, 7, 14, 30, 50, 100];

export function isStreakMilestone(streak: number): boolean {
  return STREAK_MILESTONES.includes(streak);
}
