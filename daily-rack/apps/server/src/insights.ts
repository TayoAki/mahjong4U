import type { Hono } from 'hono';
import type { Env } from './app.ts';
import type { Db } from './db.ts';
import type { SeatSpec } from './tables.ts';

// How Daily Rack is doing, for the owner: players, the path from first lesson to a real
// table for new players, the daily rack, games, friends and Game Nights, Plus, what's
// waiting in the inbox, the app's milestone events and blog page views. Counts only:
// no names, no messages. Served to moderators at /v1/admin/summary (see scripts/reports.mjs).

const DAY = 86_400_000;

export interface Summary {
  period: { days: number; from: string; to: string };
  players: { total: number; new: number; active: number };
  /** New players this period, and how many of them have reached each step since. */
  path: { step: string; players: number }[];
  dailyRack: { answers: number; players: number; discardsFinished: number; shared: number; sharedLinksOpened: number };
  games: {
    hands: number;
    players: number;
    handsBy: { fourPlayer: number; twoPlayer: number; offline: number };
    tablesOpened: { vsComputer: number; withPeople: number; twoPlayer: number; quickMatch: number; ranked: number };
    practiceRounds: number;
  };
  social: { friendships: number; nightsPlanned: number; nightsConfirmed: number; voiceJoins: number };
  plus: { members: number; screenOpened: number; purchases: number };
  inbox: { openProblemReports: number; openPlayerReports: number; messages: number };
  blog: { views: number; pages: { path: string; views: number }[]; from: { referrer: string; views: number }[] };
  events: { name: string; count: number; players: number }[];
  byDay: { day: string; newPlayers: number; activePlayers: number; rackAnswers: number; hands: number; blogViews: number }[];
}

/** Counts a blog page view: day, page and referring site only. */
export function recordPageView(db: Db, at: Date, path: string, referrer: string): void {
  db.prepare(
    `INSERT INTO page_views (day, path, referrer, views) VALUES (?, ?, ?, 1)
     ON CONFLICT (day, path, referrer) DO UPDATE SET views = views + 1`,
  ).run(at.toISOString().slice(0, 10), path, referrer);
}

export function summary(db: Db, now: Date, days: number): Summary {
  const from = new Date(now.getTime() - days * DAY).toISOString();
  const fromDay = from.slice(0, 10);
  const one = (sql: string, ...params: (string | number)[]) => Number((db.prepare(sql).get(...params) as { n: number | null } | undefined)?.n ?? 0);
  const ids = (sql: string, ...params: (string | number)[]) => new Set((db.prepare(sql).all(...params) as { id: string }[]).map((r) => r.id));
  const real = `principal_id IN (SELECT id FROM principals WHERE kind != 'test')`;
  const event = (name: string) => one(`SELECT COUNT(*) AS n FROM events WHERE name = ? AND received_at >= ? AND ${real}`, name, from);

  // Anyone who answered a rack, played a hand or used the app this period.
  const activeSql = `
    SELECT principal_id AS id, substr(received_at, 1, 10) AS day FROM events WHERE received_at >= ? AND ${real}
    UNION SELECT principal_id, substr(created_at, 1, 10) FROM attempts WHERE created_at >= ? AND ${real}
    UNION SELECT principal_id, substr(played_at, 1, 10) FROM hand_results WHERE played_at >= ? AND ${real}`;
  const activeRows = db.prepare(activeSql).all(from, from, from) as { id: string; day: string }[];

  // Tables that dealt at least once, and who sat at them.
  const dealt = (db.prepare('SELECT seats, kind, ranked, variant, created_at FROM tables WHERE hand_number > 0').all() as {
    seats: string;
    kind: string;
    ranked: number;
    variant: string;
    created_at: string;
  }[]).map((t) => ({ ...t, people: (JSON.parse(t.seats) as SeatSpec[]).map((s) => s.principalId).filter((id): id is string => Boolean(id)) }));
  const playedWithPeople = new Set(dealt.filter((t) => t.people.length >= 2).flatMap((t) => t.people));
  const opened = dealt.filter((t) => t.created_at >= from);

  const cohort = ids(`SELECT id FROM principals WHERE kind != 'test' AND created_at >= ?`, from);
  const reached = (set: Set<string>) => [...cohort].filter((id) => set.has(id)).length;
  const didEvent = (name: string) => ids('SELECT DISTINCT principal_id AS id FROM events WHERE name = ? AND principal_id IS NOT NULL', name);

  const handsBy = db
    .prepare(
      `SELECT CASE WHEN h.source = 'offline' THEN 'offline' WHEN t.variant = 'two-player' THEN 'two' ELSE 'four' END AS kind, COUNT(*) AS n
       FROM hand_results h LEFT JOIN games g ON g.id = h.game_id LEFT JOIN tables t ON t.id = g.table_id
       WHERE h.played_at >= ? AND h.${real} GROUP BY kind`,
    )
    .all(from) as { kind: string; n: number }[];
  const hands = (kind: string) => Number(handsBy.find((r) => r.kind === kind)?.n ?? 0);

  const chartDays = Math.min(days, 31);
  const byDay = Array.from({ length: chartDays }, (_, i) => new Date(now.getTime() - (chartDays - 1 - i) * DAY).toISOString().slice(0, 10)).map((day) => ({
    day,
    newPlayers: one(`SELECT COUNT(*) AS n FROM principals WHERE kind != 'test' AND substr(created_at, 1, 10) = ?`, day),
    activePlayers: new Set(activeRows.filter((r) => r.day === day).map((r) => r.id)).size,
    rackAnswers: one(`SELECT COUNT(*) AS n FROM attempts WHERE synthetic = 0 AND substr(created_at, 1, 10) = ? AND ${real}`, day),
    hands: one(`SELECT COUNT(*) AS n FROM hand_results WHERE substr(played_at, 1, 10) = ? AND ${real}`, day),
    blogViews: one('SELECT SUM(views) AS n FROM page_views WHERE day = ?', day),
  }));

  return {
    period: { days, from, to: now.toISOString() },
    players: {
      total: one(`SELECT COUNT(*) AS n FROM principals WHERE kind != 'test'`),
      new: cohort.size,
      active: new Set(activeRows.map((r) => r.id)).size,
    },
    path: [
      { step: 'Started', players: cohort.size },
      { step: 'Finished a lesson', players: reached(didEvent('lesson_completed')) },
      { step: 'Started a practice round', players: reached(didEvent('practice_started')) },
      { step: 'Finished a practice round', players: reached(didEvent('practice_finished')) },
      { step: 'Played a hand', players: reached(ids(`SELECT DISTINCT principal_id AS id FROM hand_results`)) },
      { step: 'Played with other people', players: reached(playedWithPeople) },
      { step: 'Joined a Game Night', players: reached(ids('SELECT host_id AS id FROM nights UNION SELECT principal_id FROM night_members')) },
    ],
    dailyRack: {
      answers: one(`SELECT COUNT(*) AS n FROM attempts WHERE synthetic = 0 AND created_at >= ? AND ${real}`, from),
      players: one(`SELECT COUNT(DISTINCT principal_id) AS n FROM attempts WHERE synthetic = 0 AND created_at >= ? AND ${real}`, from),
      discardsFinished: event('discards_finished'),
      shared: event('share_handoff_opened'),
      sharedLinksOpened: event('shared_link_opened'),
    },
    games: {
      hands: one(`SELECT COUNT(*) AS n FROM hand_results WHERE played_at >= ? AND ${real}`, from),
      players: one(`SELECT COUNT(DISTINCT principal_id) AS n FROM hand_results WHERE played_at >= ? AND ${real}`, from),
      handsBy: { fourPlayer: hands('four'), twoPlayer: hands('two'), offline: hands('offline') },
      tablesOpened: {
        vsComputer: opened.filter((t) => t.kind === 'private' && t.variant === 'four' && t.people.length === 1).length,
        withPeople: opened.filter((t) => t.kind === 'private' && t.variant === 'four' && t.people.length >= 2).length,
        twoPlayer: opened.filter((t) => t.variant === 'two-player').length,
        quickMatch: opened.filter((t) => t.kind === 'public' && !t.ranked).length,
        ranked: opened.filter((t) => t.kind === 'public' && t.ranked).length,
      },
      practiceRounds: event('practice_finished'),
    },
    social: {
      friendships: one(`SELECT COUNT(*) AS n FROM friendships WHERE status = 'accepted' AND responded_at >= ?`, from),
      nightsPlanned: one('SELECT COUNT(*) AS n FROM nights WHERE created_at >= ?', from),
      nightsConfirmed: one(`SELECT COUNT(*) AS n FROM nights WHERE created_at >= ? AND status = 'confirmed'`, from),
      voiceJoins: event('voice_joined'),
    },
    plus: {
      members: one('SELECT COUNT(*) AS n FROM plus_members WHERE until IS NULL OR until > ?', now.toISOString()),
      screenOpened: event('plus_opened'),
      purchases: event('plus_purchased'),
    },
    inbox: {
      openProblemReports: one(`SELECT COUNT(*) AS n FROM bug_reports WHERE status = 'open'`),
      openPlayerReports: one(`SELECT COUNT(*) AS n FROM reports WHERE status = 'open'`),
      messages: one('SELECT COUNT(*) AS n FROM feedback WHERE created_at >= ?', from),
    },
    blog: {
      views: one('SELECT SUM(views) AS n FROM page_views WHERE day >= ?', fromDay),
      pages: db.prepare('SELECT path, SUM(views) AS views FROM page_views WHERE day >= ? GROUP BY path ORDER BY views DESC LIMIT 10').all(fromDay) as Summary['blog']['pages'],
      from: db.prepare('SELECT referrer, SUM(views) AS views FROM page_views WHERE day >= ? GROUP BY referrer ORDER BY views DESC LIMIT 10').all(fromDay) as Summary['blog']['from'],
    },
    events: db
      .prepare(`SELECT name, COUNT(*) AS count, COUNT(DISTINCT principal_id) AS players FROM events WHERE received_at >= ? AND ${real} GROUP BY name ORDER BY count DESC`)
      .all(from) as Summary['events'],
    byDay,
  };
}

export function registerInsightsRoutes(api: Hono<Env>, { db, now }: { db: Db; now: () => Date }): void {
  // Behind the moderator token, like every /admin route (see safety-routes.ts).
  api.get('/admin/summary', (c) => {
    const days = Math.min(365, Math.max(1, Math.floor(Number(c.req.query('days') ?? 7)) || 7));
    return c.json(summary(db, now(), days));
  });
}
