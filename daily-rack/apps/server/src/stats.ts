import { randomUUID } from 'node:crypto';
import { HOUSE_CARD, type BotLevel, type GameResult } from '@daily-rack/core/mahjong';
import type { Db } from './db.ts';
import { ensureProfile, type Profile } from './social.ts';

// Results, ratings and leaderboards. Every finished hand writes one row per person at the
// table; ranked hands also move ratings. Ratings are pairwise Elo over the four seats,
// ordered by what each seat won or paid, with computer players at fixed ratings.

export const START_RATING = 1200;
export const BOT_RATING: Record<BotLevel, number> = { easy: 1000, normal: 1200, hard: 1400 };
/** Ranked games before someone shows on the rating leaderboard. */
export const MIN_RANKED_GAMES = 3;
const K = 32;

export interface SeatOutcome {
  principalId: string | null;
  bot: BotLevel | null;
  /** Engine seat, so it lines up with the result's payments. */
  seat: number;
}

export function ratingOf(db: Db, principalId: string): { rating: number; games: number; wins: number } {
  const row = db.prepare('SELECT rating, games, wins FROM ratings WHERE principal_id = ?').get(principalId) as { rating: number; games: number; wins: number } | undefined;
  return row ?? { rating: START_RATING, games: 0, wins: 0 };
}

/** Rating changes for every person at a ranked table, from each pair of seats' results. */
export function ratingChanges(players: { rating: number; human: boolean }[], scores: number[]): number[] {
  return players.map((me, i) => {
    if (!me.human) return 0;
    let delta = 0;
    players.forEach((other, j) => {
      if (j === i) return;
      const actual = scores[i]! > scores[j]! ? 1 : scores[i]! < scores[j]! ? 0 : 0.5;
      const expected = 1 / (1 + 10 ** ((other.rating - me.rating) / 400));
      delta += (K / (players.length - 1)) * (actual - expected);
    });
    return Math.round(delta * 10) / 10;
  });
}

function saveRating(db: Db, principalId: string, rating: number, won: boolean, now: Date) {
  db.prepare(
    `INSERT INTO ratings (principal_id, rating, games, wins, updated_at) VALUES (?, ?, 1, ?, ?)
     ON CONFLICT (principal_id) DO UPDATE SET rating = excluded.rating, games = games + 1, wins = wins + excluded.wins, updated_at = excluded.updated_at`,
  ).run(principalId, rating, won ? 1 : 0, now.toISOString());
}

/**
 * Writes a finished hand for everyone at the table. Call inside the transaction that ends
 * the hand. Seats whose person left a ranked hand were already charged in recordAbandon.
 */
export function recordHand(db: Db, gameId: string, cardId: string, ranked: boolean, seats: SeatOutcome[], result: GameResult, now: Date): void {
  const changes = ranked
    ? ratingChanges(
        seats.map((s) => ({ rating: s.principalId ? ratingOf(db, s.principalId).rating : BOT_RATING[s.bot ?? 'normal'], human: Boolean(s.principalId) })),
        seats.map((s) => result.payments[s.seat] ?? 0),
      )
    : seats.map(() => 0);
  seats.forEach((s, i) => {
    if (!s.principalId) return;
    const won = result.winner === s.seat;
    let after: number | null = null;
    if (ranked) {
      after = Math.round((ratingOf(db, s.principalId).rating + changes[i]!) * 10) / 10;
      saveRating(db, s.principalId, after, won, now);
    }
    db.prepare(
      `INSERT OR IGNORE INTO hand_results (id, principal_id, game_id, source, card_id, ranked, won, self_drawn, jokerless, wall_game, fed, hand_id, value, payment, rating_after, played_at)
       VALUES (?, ?, ?, 'table', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      randomUUID(),
      s.principalId,
      gameId,
      cardId,
      ranked ? 1 : 0,
      won ? 1 : 0,
      won && result.from === null ? 1 : 0,
      won && result.jokerless ? 1 : 0,
      result.kind === 'wall' ? 1 : 0,
      result.from === s.seat ? 1 : 0,
      won ? result.handId : null,
      won ? result.value : 0,
      result.payments[s.seat] ?? 0,
      after,
      now.toISOString(),
    );
  });
}

/** Someone left a ranked hand before it ended: it counts as finishing below everyone else. */
export function recordAbandon(db: Db, gameId: string, cardId: string, principalId: string, others: { rating: number }[], now: Date): void {
  const me = ratingOf(db, principalId);
  const players = [{ rating: me.rating, human: true }, ...others.map((o) => ({ rating: o.rating, human: false }))];
  const [delta] = ratingChanges(players, [-1, ...others.map(() => 0)]);
  const after = Math.round((me.rating + delta!) * 10) / 10;
  saveRating(db, principalId, after, false, now);
  db.prepare(
    `INSERT OR IGNORE INTO hand_results (id, principal_id, game_id, source, card_id, ranked, won, abandoned, rating_after, played_at)
     VALUES (?, ?, ?, 'table', ?, 1, 0, 1, ?, ?)`,
  ).run(randomUUID(), principalId, gameId, cardId, after, now.toISOString());
}

export interface OfflineResult {
  id: string;
  won: boolean;
  selfDrawn: boolean;
  jokerless: boolean;
  wallGame: boolean;
  fed: boolean;
  handId: string | null;
  value: number;
  payment: number;
  playedAt: string;
}

/** Hands played on the device without the server. They count for your stats, never for ranking. */
export function importOffline(db: Db, principalId: string, results: OfflineResult[], now: Date): number {
  const handIds = new Set(HOUSE_CARD.hands.map((h) => h.id));
  let added = 0;
  for (const r of results) {
    const played = new Date(r.playedAt);
    if (Number.isNaN(played.getTime()) || played.getTime() > now.getTime() + 60_000) continue;
    const handId = r.won && r.handId && handIds.has(r.handId) ? r.handId : null;
    const inserted = db
      .prepare(
        `INSERT OR IGNORE INTO hand_results (id, principal_id, game_id, source, card_id, ranked, won, self_drawn, jokerless, wall_game, fed, hand_id, value, payment, played_at)
         VALUES (?, ?, ?, 'offline', ?, 0, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        randomUUID(),
        principalId,
        `offline:${r.id}`,
        HOUSE_CARD.id,
        r.won ? 1 : 0,
        r.won && r.selfDrawn ? 1 : 0,
        r.won && r.jokerless ? 1 : 0,
        r.wallGame ? 1 : 0,
        r.fed ? 1 : 0,
        handId,
        handId ? Math.max(0, Math.min(500, Math.round(r.value))) : 0,
        Math.max(-1000, Math.min(1000, Math.round(r.payment))),
        played.toISOString(),
      );
    added += Number(inserted.changes);
  }
  return added;
}

interface ResultRow {
  won: number;
  self_drawn: number;
  jokerless: number;
  wall_game: number;
  fed: number;
  abandoned: number;
  hand_id: string | null;
  value: number;
  payment: number;
  ranked: number;
  source: 'table' | 'offline';
  rating_after: number | null;
  played_at: string;
}

/** Everything the Stats screen shows. */
export function statsFor(db: Db, principalId: string) {
  const rows = db
    .prepare('SELECT won, self_drawn, jokerless, wall_game, fed, abandoned, hand_id, value, payment, ranked, source, rating_after, played_at FROM hand_results WHERE principal_id = ? ORDER BY played_at')
    .all(principalId) as unknown as ResultRow[];
  const played = rows.filter((r) => !r.abandoned);
  const wins = played.filter((r) => r.won);
  let current = 0;
  let best = 0;
  for (const r of played) {
    current = r.won ? current + 1 : 0;
    best = Math.max(best, current);
  }
  const biggest = wins.reduce<ResultRow | null>((top, r) => (!top || r.value > top.value ? r : top), null);
  const completed = new Map<string, number>();
  for (const r of wins) if (r.hand_id) completed.set(r.hand_id, (completed.get(r.hand_id) ?? 0) + 1);
  const hand = (id: string | null) => HOUSE_CARD.hands.find((h) => h.id === id) ?? null;
  const rating = ratingOf(db, principalId);
  return {
    hands: played.length,
    wins: wins.length,
    winRate: played.length ? Math.round((wins.length / played.length) * 100) : 0,
    selfDrawn: wins.filter((r) => r.self_drawn).length,
    jokerless: wins.filter((r) => r.jokerless).length,
    wallGames: played.filter((r) => r.wall_game).length,
    fed: played.filter((r) => r.fed).length,
    points: played.reduce((n, r) => n + r.payment, 0),
    streak: { current, best },
    biggest: biggest && biggest.hand_id ? { value: biggest.value, handId: biggest.hand_id, pattern: hand(biggest.hand_id)?.pattern ?? null } : null,
    card: {
      id: HOUSE_CARD.id,
      total: HOUSE_CARD.hands.length,
      completed: [...completed.entries()].map(([handId, times]) => ({ handId, times })),
      sections: HOUSE_CARD.sections.map((s) => {
        const hands = HOUSE_CARD.hands.filter((h) => h.section === s.id);
        return { id: s.id, label: s.label, total: hands.length, completed: hands.filter((h) => completed.has(h.id)).length };
      }),
    },
    ranked: { rating: Math.round(rating.rating), games: rating.games, wins: rating.wins, rank: rating.games >= MIN_RANKED_GAMES ? rankOf(db, rating.rating) : null },
    offline: { hands: played.filter((r) => r.source === 'offline').length, wins: wins.filter((r) => r.source === 'offline').length },
    recent: played
      .slice(-10)
      .reverse()
      .map((r) => ({ playedAt: r.played_at, won: Boolean(r.won), value: r.value, payment: r.payment, handId: r.hand_id, pattern: hand(r.hand_id)?.pattern ?? null, ranked: Boolean(r.ranked), offline: r.source === 'offline', wallGame: Boolean(r.wall_game) })),
  };
}

function rankOf(db: Db, rating: number): number {
  const above = db.prepare('SELECT COUNT(*) AS n FROM ratings WHERE games >= ? AND rating > ?').get(MIN_RANKED_GAMES, rating) as { n: number };
  return Number(above.n) + 1;
}

/** Monday 00:00 UTC of this week. */
export function weekStart(now: Date): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d;
}

export interface LeaderboardEntry {
  rank: number;
  player: Profile;
  score: number;
  games: number;
  wins: number;
  isYou: boolean;
}

/**
 * The top 50 by rating (at least a few ranked games) or by points won in ranked games this
 * week, plus where the viewer stands. Suspended players are left out.
 */
export function leaderboard(db: Db, board: 'rating' | 'weekly', viewerId: string, now: Date): { board: string; since: string | null; entries: LeaderboardEntry[]; you: LeaderboardEntry | null } {
  const rows =
    board === 'rating'
      ? (db
          .prepare(
            `SELECT r.principal_id AS id, r.rating AS score, r.games AS games, r.wins AS wins FROM ratings r
             LEFT JOIN profiles p ON p.principal_id = r.principal_id
             WHERE r.games >= ? AND p.suspended_at IS NULL ORDER BY r.rating DESC, r.updated_at ASC`,
          )
          .all(MIN_RANKED_GAMES) as { id: string; score: number; games: number; wins: number }[])
      : (db
          .prepare(
            `SELECT h.principal_id AS id, SUM(h.payment) AS score, COUNT(*) AS games, SUM(h.won) AS wins FROM hand_results h
             LEFT JOIN profiles p ON p.principal_id = h.principal_id
             WHERE h.ranked = 1 AND h.played_at >= ? AND p.suspended_at IS NULL GROUP BY h.principal_id ORDER BY score DESC, games ASC`,
          )
          .all(weekStart(now).toISOString()) as { id: string; score: number; games: number; wins: number }[]);
  const entries = rows.map((r, i) => ({
    rank: i + 1,
    player: ensureProfile(db, r.id, now),
    score: Math.round(Number(r.score)),
    games: Number(r.games),
    wins: Number(r.wins),
    isYou: r.id === viewerId,
  }));
  return { board, since: board === 'weekly' ? weekStart(now).toISOString() : null, entries: entries.slice(0, 50), you: entries.find((e) => e.isYou) ?? null };
}
