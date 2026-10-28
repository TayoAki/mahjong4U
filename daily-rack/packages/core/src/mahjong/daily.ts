import type { Alignment } from '../puzzle.ts';
import type { TileInstance } from '../tiles.ts';
import type { Card } from './card.ts';
import { rankDiscards, type Seen, type TileChoice } from './coach.ts';
import type { Seat } from './game.ts';
import { bestDistance } from './match.ts';
import { TILE_COUNT, TILE_FACES, isJoker, keyOf, rng } from './set.ts';

// The daily rack at a table. A puzzle's tiles become engine tiles so the coach can rank
// them, and after the pass the same deal plays on for three discards. Everything is seeded
// from the puzzle revision, so every player gets the same tiles passed in and the same
// draws, and starts from the same hand: the deal with the strong pass gone.

/** Where you sit for the daily rack: South, so East, on your left, opens the play. */
export const DAILY_SEAT: Seat = 1;
/** Turns in the daily discards. */
export const DAILY_TURNS = 3;
/** Tiles left in the wall once four hands are dealt (East takes 14). */
export const DEALT_WALL = TILE_COUNT - 13 * 4 - 1;

const JOKER = 'JOKER';
const keyFor = (tile: number) => (isJoker(tile) ? JOKER : keyOf(tile));

/**
 * Engine tiles for a deal, by instance id. Each tile takes the lowest free id with its face
 * (a flower takes any free flower once its own is used), so a deal always maps the same way.
 */
export function dealTiles(tiles: readonly Pick<TileInstance, 'instanceId' | 'faceCode'>[]): Map<string, number> {
  const used = new Set<number>();
  const take = (fits: (face: string) => boolean) => {
    const tile = TILE_FACES.findIndex((face, t) => !used.has(t) && fits(face));
    if (tile >= 0) used.add(tile);
    return tile;
  };
  const ids = new Map<string, number>();
  for (const { instanceId, faceCode } of tiles) {
    let tile = take((face) => face === faceCode);
    if (tile < 0 && faceCode.startsWith('FLOWER_')) tile = take((face) => face.startsWith('FLOWER_'));
    if (tile < 0) throw new Error(`no tile left for ${faceCode}`);
    ids.set(instanceId, tile);
  }
  return ids;
}

/** A 32-bit seed from text (FNV-1a), so a revision id always deals the same tiles. */
export function seedOf(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** A throw on the table. */
export interface TableDiscard {
  seat: Seat;
  tile: number;
}

export interface DailyDiscards {
  /** Your 13 tiles once the strong pass has gone out and three tiles have come in. */
  start: number[];
  /** The three tiles passed to you by the player on your left. Never jokers. */
  received: number[];
  /** The tile you draw on each turn. */
  draws: number[];
  /** What the other players throw before each of your turns, in the order they play. */
  before: TableDiscard[][];
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/**
 * The same deal played on after the first Charleston, seeded from the puzzle revision:
 * the deal less the strong pass, three tiles passed in, and three turns of draws.
 */
export function dailyDiscards(tiles: readonly TileInstance[], strongPass: readonly string[], revisionId: string): DailyDiscards {
  const ids = dealTiles(tiles);
  const dealt = new Set(ids.values());
  const wall = Array.from({ length: TILE_COUNT }, (_, t) => t).filter((t) => !dealt.has(t));
  const random = rng(seedOf(revisionId));
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [wall[i], wall[j]] = [wall[j]!, wall[i]!];
  }
  // Jokers can't be passed, and the other players keep theirs; your own draws can be anything.
  const next = (jokerOk: boolean) => wall.splice(wall.findIndex((t) => jokerOk || !isJoker(t)), 1)[0]!;

  const received = [next(false), next(false), next(false)];
  const passed = new Set(strongPass.map((id) => ids.get(id)));
  const start = [...tiles.map((t) => ids.get(t.instanceId)!).filter((t) => !passed.has(t)), ...received];
  const before: TableDiscard[][] = [];
  const draws: number[] = [];
  for (let turn = 0; turn < DAILY_TURNS; turn++) {
    // East opens with a throw from fourteen tiles; after that the other three play in turn.
    const seats = turn === 0 ? range(0, DAILY_SEAT) : range(DAILY_SEAT + 1, DAILY_SEAT + 4).map((s) => s % 4);
    before.push(seats.map((seat) => ({ seat: seat as Seat, tile: next(false) })));
    draws.push(next(true));
  }
  return { start, received, draws, before };
}

/** Tiles everyone can see, by match key, as the coach counts them (jokers aside). */
function seenOn(table: readonly TableDiscard[]): Seen {
  const seen = new Map<string, number>();
  for (const { tile } of table) if (!isJoker(tile)) seen.set(keyOf(tile), (seen.get(keyOf(tile)) ?? 0) + 1);
  return seen;
}

export interface DiscardTurn {
  /** Your 14 tiles once you've drawn. */
  hand: number[];
  drawn: number;
  /** Every throw on the table before yours, in order. */
  table: TableDiscard[];
  /** Tiles left in the wall after your draw. */
  wallCount: number;
  /** Every tile you could throw, best first, judged from what you can see. */
  ranking: TileChoice[];
  /** Your throw, once you've made it, and whether it was one of the best. */
  pick: number | null;
  best: boolean | null;
}

/** The daily discards played through your throws so far: each turn you've reached, ranked. */
export function playDiscards(card: Card, drill: DailyDiscards, picks: readonly number[]): DiscardTurn[] {
  const turns: DiscardTurn[] = [];
  const table: TableDiscard[] = [];
  let held = [...drill.start];
  let wallCount = DEALT_WALL;
  for (let turn = 0; turn < DAILY_TURNS; turn++) {
    for (const d of drill.before[turn] ?? []) {
      // Everyone draws before throwing, except East's opening throw.
      if (turn > 0 || d.seat !== 0) wallCount -= 1;
      table.push(d);
    }
    const drawn = drill.draws[turn]!;
    wallCount -= 1;
    const hand = [...held, drawn];
    const ranking = rankDiscards(card, hand, [], seenOn(table));
    const pick = picks[turn] !== undefined && hand.includes(picks[turn]!) ? picks[turn]! : null;
    const choice = pick === null ? undefined : ranking.find((c) => c.key === keyFor(pick));
    turns.push({ hand, drawn, table: [...table], wallCount, ranking, pick, best: choice ? choice.best : null });
    if (pick === null) break;
    table.push({ seat: DAILY_SEAT, tile: pick });
    held = hand.filter((t) => t !== pick);
  }
  return turns;
}

/** One row of the pass review: a face from the deal, and what passing it would cost. */
export interface PassRow {
  /** Match key, as the coach uses it: a face code, 'FLOWER' or 'JOKER'. */
  key: string;
  /** The deal's tiles with this face. */
  instanceIds: string[];
  /** The coach's view of passing one of them; null for jokers, which can't be passed. */
  choice: TileChoice | null;
}

/**
 * Every face in the deal, best to pass first, with jokers last. `now` is how many tiles the
 * deal needs for its nearest hand, so a row's cost is its distance minus `now`.
 */
export function rankPass(card: Card, tiles: readonly TileInstance[]): { now: number; rows: PassRow[] } {
  const ids = dealTiles(tiles);
  const hand = tiles.map((t) => ids.get(t.instanceId)!);
  const members = new Map<string, string[]>();
  for (const t of tiles) {
    const key = keyFor(ids.get(t.instanceId)!);
    members.set(key, [...(members.get(key) ?? []), t.instanceId]);
  }
  const ranked = rankDiscards(card, hand, []);
  const rows = [...ranked.filter((c) => c.key !== JOKER), ...ranked.filter((c) => c.key === JOKER)].map((c) => ({
    key: c.key,
    instanceIds: members.get(c.key) ?? [],
    choice: c.key === JOKER ? null : c,
  }));
  return { now: bestDistance(card, hand, []), rows };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "Oct 28" for the content day '2026-10-28'. */
export function shortDay(day: string): string {
  const [, month, date] = day.split('-').map(Number);
  return `${MONTHS[(month ?? 1) - 1] ?? ''} ${date ?? ''}`.trim();
}

const PASS_WORDS: Record<Alignment, string> = {
  matches: 'strong ✓',
  alternate: 'strong ✓',
  close: '2 of 3 strong',
  different: 'my own take',
};

/**
 * The day's result as text to share, with nothing that gives the rack away:
 * "Daily Rack · Oct 28 · Pass: strong ✓ · Discards 🟩🟩⬜". The discards show once all three are played.
 */
export function dailyShareText({ brand = 'Daily Rack', day, alignment, discards }: { brand?: string; day: string; alignment: Alignment; discards: readonly boolean[] | null }): string {
  const parts = [brand, shortDay(day), `Pass: ${PASS_WORDS[alignment]}`];
  if (discards && discards.length >= DAILY_TURNS) parts.push(`Discards ${discards.map((best) => (best ? '🟩' : '⬜')).join('')}`);
  return parts.join(' · ');
}
