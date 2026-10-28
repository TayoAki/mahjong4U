import { cancelLocal, pushState, scheduleLocal, type LocalNote } from './notifications';
import { readJson, writeJson } from './storage.ts';

// Gentle reminders from Pip, scheduled on the phone: one at the time you usually play,
// a streak saver in the evening when your streak is on the line, and a few "come back"
// nudges that thin out and then stop if you've been away. With the daily rack switched
// off, the daily nudge is the next lesson or a game instead, and there's no streak to save.
// Everything is rescheduled each time the app opens, so someone who plays every day only
// ever hears one a day at most.

export interface ReminderPrefs {
  on: boolean;
  /** 'auto' follows when you last played; otherwise 'HH:MM'. */
  time: string;
}

export const REMINDER_TIMES: { value: string; label: string }[] = [
  { value: 'auto', label: 'When I usually play' },
  { value: '09:00', label: 'Morning' },
  { value: '12:30', label: 'Lunchtime' },
  { value: '19:00', label: 'Evening' },
];

const PREFS_KEY = 'dr:reminders';
const LAST_PRACTICE_KEY = 'dr:last-practice';
const DEFAULT_TIME: [number, number] = [19, 0];
/** Days after today that get a reminder if you don't come back. Then they stop. */
const COME_BACK_DAYS = [1, 2, 3, 5, 7, 14];

export async function readReminderPrefs(): Promise<ReminderPrefs> {
  return { on: true, time: 'auto', ...(await readJson<Partial<ReminderPrefs>>(PREFS_KEY, {})) };
}

export async function saveReminderPrefs(prefs: ReminderPrefs): Promise<void> {
  await writeJson(PREFS_KEY, prefs);
}

/** Call when the player practices: finishes the daily rack, a lesson or a hand. */
export async function notePractice(at = new Date()): Promise<void> {
  await writeJson(LAST_PRACTICE_KEY, at.toISOString());
}

export interface ReminderContext {
  /** Whether the daily rack is on (FEATURES.dailyRack). */
  dailyRack: boolean;
  /** Daily rack streak in days. */
  streak: number;
  /** Played today's rack, or with the daily rack off, practised at all today. */
  playedToday: boolean;
  /** The next lesson for someone still learning, or null. */
  nextLesson: { id: string; title: string; minutes: number } | null;
}

function reminderTime(prefs: ReminderPrefs, lastPractice: string | null): [number, number] {
  const fixed = /^(\d{2}):(\d{2})$/.exec(prefs.time);
  if (fixed) return [Number(fixed[1]), Number(fixed[2])];
  // "When I usually play": the time of day you last played, a few minutes early.
  if (!lastPractice) return DEFAULT_TIME;
  const last = new Date(lastPractice);
  const minutes = Math.max(8 * 60, Math.min(21 * 60, last.getHours() * 60 + last.getMinutes() - 10));
  return [Math.floor(minutes / 60), minutes % 60];
}

const DAILY = [
  { title: 'Today’s rack is ready', body: 'Pip dealt you 13 fresh tiles. Pick your three passes and you’re done!' },
  { title: 'A minute of mahjong?', body: 'Today’s rack takes about a minute. Pip saved you a seat.' },
  { title: 'Pip says hi', body: 'Your tiles are lined up and waiting. Come see what you’d pass today.' },
  { title: 'Tea and tiles?', body: 'Put the kettle on. Today’s rack is ready whenever you are.' },
];

const GAMES = [
  { title: 'A game with Pip?', body: 'Your seat is saved. Play a hand against the computer whenever you like.' },
  { title: 'Pip says hi', body: 'The tiles are shuffled and waiting. Come play a hand.' },
  { title: 'Tea and tiles?', body: 'Put the kettle on. Your table is ready whenever you are.' },
];

type Note = Omit<LocalNote, 'id' | 'date'>;

function lessonNote(lesson: NonNullable<ReminderContext['nextLesson']>): Note {
  return {
    title: 'Ready for your next lesson?',
    body: `“${lesson.title}” takes about ${lesson.minutes} minutes. Pip will be right there with you.`,
    url: `/lessons/${lesson.id}`,
  };
}

/** An everyday nudge: today's rack, or without it a game. */
function everyday(ctx: ReminderContext, n: number): Note {
  return ctx.dailyRack ? { ...DAILY[n % DAILY.length]!, url: '/rack' } : { ...GAMES[n % GAMES.length]!, url: '/play' };
}

/** What to schedule, given the time now. Pure, so the plan is easy to reason about. */
export function reminderPlan(ctx: ReminderContext, now: Date, [hour, minute]: [number, number]): LocalNote[] {
  const at = (daysAhead: number, h = hour, m = minute) => {
    const d = new Date(now);
    d.setDate(d.getDate() + daysAhead);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const soon = now.getTime() + 10 * 60_000;
  const notes: LocalNote[] = [];

  if (!ctx.playedToday) {
    // Streak saver: in the evening, while there's still time.
    const saver = at(0, 20, 30);
    const hasSaver = ctx.dailyRack && ctx.streak >= 2 && saver.getTime() > soon;
    if (hasSaver) {
      notes.push({
        id: 'dr-reminder-streak',
        date: saver,
        title: `Keep your ${ctx.streak}-day streak going`,
        body: 'Pip is guarding your streak, but it needs you before midnight. Today’s rack is quick!',
        url: '/rack',
      });
    }
    const today = at(0);
    // Skip the usual one when the streak saver is close behind it.
    if (today.getTime() > soon && !(hasSaver && saver.getTime() - today.getTime() < 90 * 60_000)) {
      // Without the daily rack, someone still learning hears about their next lesson.
      const note = !ctx.dailyRack && ctx.nextLesson ? lessonNote(ctx.nextLesson) : everyday(ctx, now.getDate());
      notes.push({ id: 'dr-reminder-0', date: today, ...note });
    }
  }

  for (const days of COME_BACK_DAYS) {
    const date = at(days);
    let note: Note;
    if (days === 14) {
      note = { title: 'Your seat is still warm', body: 'Pip will keep it that way. Come back any time. This is the last nudge for a while.', url: '/' };
    } else if (days === 7) {
      note = ctx.dailyRack
        ? { title: 'It’s been a week!', body: 'Mahjong is more fun with you at the table. Today’s rack is an easy way back in.', url: '/rack' }
        : { title: 'It’s been a week!', body: 'Mahjong is more fun with you at the table. A hand against the computer is an easy way back in.', url: '/play' };
    } else if (days === 5) {
      note = {
        title: 'Pip misses you',
        body: `No pressure! Whenever you’re ready, ${ctx.dailyRack ? 'there’s a fresh rack waiting' : 'your seat is waiting'}.`,
        url: ctx.dailyRack ? '/rack' : '/play',
      };
    } else if (days === 2 && ctx.nextLesson) {
      note = lessonNote(ctx.nextLesson);
    } else {
      note = everyday(ctx, now.getDate() + days);
    }
    notes.push({ id: `dr-reminder-${days}`, date, ...note });
  }
  return notes;
}

/** Replaces Pip's scheduled reminders with a fresh plan. Safe to call often. */
export async function refreshReminders(ctx: ReminderContext, now = new Date()): Promise<void> {
  await cancelLocal('dr-reminder');
  const prefs = await readReminderPrefs();
  if (!prefs.on || (await pushState()) !== 'granted') return;
  const last = await readJson<string | null>(LAST_PRACTICE_KEY, null);
  const time = reminderTime(prefs, last);
  // Without the daily rack, any lesson or hand today counts as playing today.
  const practisedToday = last !== null && new Date(last).toDateString() === now.toDateString();
  const plan = reminderPlan(ctx.dailyRack ? ctx : { ...ctx, playedToday: ctx.playedToday || practisedToday }, now, time);
  for (const note of plan) await scheduleLocal(note);
}

/** A reminder two hours before a Game Night you're going to; cancelled if plans change. */
export async function scheduleNightReminder(night: { id: string; title: string; when: string | null; going: boolean; location: string | null }): Promise<void> {
  const id = `dr-night-${night.id}`;
  await cancelLocal(id);
  if (!night.when || !night.going || (await pushState()) !== 'granted') return;
  const date = new Date(new Date(night.when).getTime() - 2 * 3_600_000);
  if (date.getTime() < Date.now() + 5 * 60_000) return;
  await scheduleLocal({
    id,
    date,
    title: `${night.title} is in two hours`,
    body: `${night.location ? `See you at ${night.location}! ` : ''}Pip's polishing the tiles.`,
    url: `/night/${night.id}`,
  });
}
