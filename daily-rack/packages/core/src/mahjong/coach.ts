import type { Card, CardHand } from './card.ts';
import { copiesOf } from './dead.ts';
import { claimOptionsFor } from './game.ts';
import { analyze, bestDistance, helpfulFaces, type Exposure } from './match.ts';
import { isJoker, keyOf } from './set.ts';

// A coach for one decision at a time: which tile to throw, which three to pass, whether to
// call a discard. Each choice is judged the way a teacher talks it through: how many tiles
// you'd still need for your nearest hand, how many unseen tiles would bring you a step
// closer, and how many lines on the card stay that close. The practice round and the
// daily rack's answer review both use it.

const JOKER = 'JOKER';
const JOKER_COPIES = 8;

export interface TileChoice {
  /** A tile of this face from the hand (the first one). */
  tile: number;
  /** Match key: a face code, 'FLOWER' for any flower, 'JOKER' for a joker. */
  key: string;
  /** Tiles still needed for the nearest hand once this tile is gone. */
  distance: number;
  /** Unseen tiles that would bring the nearest hand a tile closer. */
  helpers: number;
  /** Lines on the card at that nearest distance. */
  lines: number;
  /** The nearest line once this tile is gone. */
  nearest: CardHand | null;
  /** 1 for the best choice; equal choices share a rank. */
  rank: number;
  best: boolean;
}

/** Tiles counted as seen, by match key: discards and exposures (see dead.visibleCounts). */
export type Seen = ReadonlyMap<string, number>;

const keyFor = (tile: number) => (isJoker(tile) ? JOKER : keyOf(tile));

function without(hand: readonly number[], tile: number): number[] {
  const rest = [...hand];
  rest.splice(rest.indexOf(tile), 1);
  return rest;
}

/** Copies of `key` you can't see: not in your hand (`held`), not on the table. */
function unseen(key: string, held: readonly number[], seen: Seen): number {
  const copies = key === JOKER ? JOKER_COPIES : copiesOf(key);
  return Math.max(0, copies - held.filter((t) => keyFor(t) === key).length - (seen.get(key) ?? 0));
}

/** How good what's left of a hand is (see TileChoice). */
export type Judgement = Pick<TileChoice, 'distance' | 'helpers' | 'lines' | 'nearest'>;

/** How good `rest` is: the nearest hand, the useful draws and the lines that close. */
function judge(card: Card, rest: readonly number[], exposures: readonly Exposure[], held: readonly number[], seen: Seen): Judgement {
  const fits = analyze(card, rest, exposures);
  if (fits.length === 0) return { distance: Infinity, helpers: 0, lines: 0, nearest: null };
  const distance = fits[0]!.distance;
  const closest = fits.filter((f) => f.distance === distance);
  const faces = new Set(closest.flatMap((f) => helpfulFaces(f, rest)));
  return {
    distance,
    helpers: [...faces].reduce((n, face) => n + unseen(face, held, seen), 0),
    lines: new Set(closest.map((f) => f.concrete.hand.id)).size,
    nearest: closest[0]!.concrete.hand,
  };
}

const compare = (a: Judgement, b: Judgement) => a.distance - b.distance || b.helpers - a.helpers || b.lines - a.lines;

function ranked(choices: (Judgement & Pick<TileChoice, 'tile' | 'key'>)[]): TileChoice[] {
  const sorted = [...choices].sort(compare);
  let rank = 0;
  return sorted.map((c, i) => {
    if (i === 0 || compare(sorted[i - 1]!, c) !== 0) rank = i + 1;
    return { ...c, rank, best: rank === 1 };
  });
}

/**
 * Every tile you could discard, best first: one row per face, judged by what's left. The
 * hand is your concealed tiles including the one you just drew.
 */
export function rankDiscards(card: Card, concealed: readonly number[], exposures: readonly Exposure[], seen: Seen = new Map()): TileChoice[] {
  const firsts = new Map<string, number>();
  for (const t of concealed) if (!firsts.has(keyFor(t))) firsts.set(keyFor(t), t);
  return ranked([...firsts].map(([key, tile]) => ({ tile, key, ...judge(card, without(concealed, tile), exposures, concealed, seen) })));
}

/** Every tile you could pass in a Charleston, best to pass first. Jokers can't be passed. */
export function rankPassTiles(card: Card, hand: readonly number[], seen: Seen = new Map()): TileChoice[] {
  return rankDiscards(card, hand, [], seen).filter((c) => c.key !== JOKER);
}

/**
 * What's left once `tiles` have gone from the hand (a pass, say), judged the way a discard
 * is. Lets a choice of several tiles be compared with the coach's.
 */
export function judgeRest(card: Card, hand: readonly number[], tiles: readonly number[], exposures: readonly Exposure[] = [], seen: Seen = new Map()): Judgement {
  return judge(card, tiles.reduce<number[]>((rest, t) => without(rest, t), [...hand]), exposures, hand, seen);
}

/** A pass of `count` tiles, chosen one at a time: always the tile that costs the least. */
export function suggestPass(card: Card, hand: readonly number[], count = 3, seen: Seen = new Map()): number[] {
  let rest = [...hand];
  const picks: number[] = [];
  for (let i = 0; i < count; i++) {
    const first = rankPassTiles(card, rest, seen)[0];
    if (!first) break;
    picks.push(first.tile);
    rest = without(rest, first.tile);
  }
  return picks;
}

export interface ClaimAdvice {
  /** Call it for Mahjong, call it to expose a group, or let it go. */
  call: 'mahjong' | 'expose' | 'pass';
  /** The group to expose, when calling is worth it. */
  size: number | null;
  /** Tiles needed for your nearest hand now, and after calling and discarding your best tile. */
  before: number;
  after: number;
  /** Your nearest hand now is concealed, and exposing would rule it out. */
  givesUpConcealed: boolean;
  /** Your nearest line after calling (or now, if you shouldn't). */
  nearest: CardHand | null;
}

/**
 * Whether to call another player's discard. Calling is worth it when, after exposing and
 * then throwing your best tile, you're closer than you are now. Exposing takes matching
 * tiles first and jokers after, the way the engine does.
 */
export function adviseClaim(card: Card, concealed: readonly number[], exposures: readonly Exposure[], tile: number, seen: Seen = new Map()): ClaimAdvice {
  const before = bestDistance(card, concealed, exposures);
  const now = analyze(card, concealed, exposures)[0]?.concrete.hand ?? null;
  const options = claimOptionsFor(card, concealed, exposures, tile);
  if (options.canMahjong) return { call: 'mahjong', size: null, before, after: 0, givesUpConcealed: false, nearest: now };
  const key = keyOf(tile);
  let best: { size: number; choice: TileChoice } | null = null;
  for (const size of options.sizes) {
    const used = [...concealed.filter((t) => !isJoker(t) && keyOf(t) === key), ...concealed.filter(isJoker)].slice(0, size - 1);
    const rest = used.reduce<number[]>((hand, t) => without(hand, t), [...concealed]);
    const choice = rankDiscards(card, rest, [...exposures, { key, tiles: [tile, ...used] }], seen)[0];
    if (choice && (!best || compare(choice, best.choice) < 0)) best = { size, choice };
  }
  const givesUpConcealed = Boolean(now?.concealed);
  if (!best || best.choice.distance >= before) return { call: 'pass', size: null, before, after: best?.choice.distance ?? before, givesUpConcealed, nearest: now };
  return { call: 'expose', size: best.size, before, after: best.choice.distance, givesUpConcealed, nearest: best.choice.nearest };
}
