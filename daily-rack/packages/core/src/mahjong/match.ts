import { concreteHands, type Card, type ConcreteGroup, type ConcreteHand } from './card.ts';
import { isJoker, keyOf } from './set.ts';

/** A group laid face up on the table after calling a discard. */
export interface Exposure {
  key: string;
  tiles: number[];
}

export interface HandFit {
  concrete: ConcreteHand;
  /** Tiles still needed to complete this hand (0 = Mahjong). */
  distance: number;
  /** Concealed groups still to fill, after exposures are taken out. */
  remaining: ConcreteGroup[];
}

interface Counts {
  naturals: Map<string, number>;
  jokers: number;
}

function count(tiles: readonly number[]): Counts {
  const naturals = new Map<string, number>();
  let jokers = 0;
  for (const t of tiles) {
    if (isJoker(t)) jokers += 1;
    else naturals.set(keyOf(t), (naturals.get(keyOf(t)) ?? 0) + 1);
  }
  return { naturals, jokers };
}

/**
 * Takes the exposed groups out of a concrete hand. Each exposure must match a distinct
 * group of the same face and size. Returns the groups left to fill, or null.
 */
function withoutExposures(groups: readonly ConcreteGroup[], exposures: readonly Exposure[]): ConcreteGroup[] | null {
  const remaining = [...groups];
  for (const e of exposures) {
    const i = remaining.findIndex((g) => g.face === e.key && g.n === e.tiles.length && g.jokerable);
    if (i === -1) return null;
    remaining.splice(i, 1);
  }
  return remaining;
}

/** Tiles still needed to fill `groups` from the concealed tiles, using jokers only where allowed. */
function deficit(groups: readonly ConcreteGroup[], counts: Counts): number {
  const natOnly = new Map<string, number>();
  const jokerable = new Map<string, number>();
  for (const g of groups) {
    const into = g.jokerable ? jokerable : natOnly;
    into.set(g.face, (into.get(g.face) ?? 0) + g.n);
  }
  let missingNatural = 0;
  let missingJokerable = 0;
  for (const [face, need] of natOnly) missingNatural += Math.max(0, need - (counts.naturals.get(face) ?? 0));
  for (const [face, need] of jokerable) {
    const spare = Math.max(0, (counts.naturals.get(face) ?? 0) - (natOnly.get(face) ?? 0));
    missingJokerable += Math.max(0, need - spare);
  }
  return missingNatural + Math.max(0, missingJokerable - counts.jokers);
}

/** Every concrete hand the player could still make, closest first. */
export function analyze(card: Card, concealed: readonly number[], exposures: readonly Exposure[]): HandFit[] {
  const counts = count(concealed);
  const fits: HandFit[] = [];
  for (const concrete of concreteHands(card)) {
    if (concrete.hand.concealed && exposures.length > 0) continue;
    const remaining = withoutExposures(concrete.groups, exposures);
    if (!remaining) continue;
    fits.push({ concrete, distance: deficit(remaining, counts), remaining });
  }
  fits.sort((a, b) => a.distance - b.distance || b.concrete.hand.value - a.concrete.hand.value);
  return fits;
}

export function bestDistance(card: Card, concealed: readonly number[], exposures: readonly Exposure[]): number {
  let best = Infinity;
  const counts = count(concealed);
  for (const concrete of concreteHands(card)) {
    if (concrete.hand.concealed && exposures.length > 0) continue;
    const remaining = withoutExposures(concrete.groups, exposures);
    if (!remaining) continue;
    best = Math.min(best, deficit(remaining, counts));
    if (best === 0) break;
  }
  return best;
}

export interface Win {
  concrete: ConcreteHand;
  jokerless: boolean;
}

/**
 * Checks a complete 14-tile hand. `concealed` plus every exposure must be exactly the
 * tiles of one concrete hand, with jokers only in groups of three or more.
 */
export function findWin(card: Card, concealed: readonly number[], exposures: readonly Exposure[]): Win | null {
  const total = concealed.length + exposures.reduce((n, e) => n + e.tiles.length, 0);
  if (total !== 14) return null;
  const counts = count(concealed);
  let best: Win | null = null;
  for (const concrete of concreteHands(card)) {
    if (concrete.hand.concealed && exposures.length > 0) continue;
    const remaining = withoutExposures(concrete.groups, exposures);
    if (!remaining || deficit(remaining, counts) !== 0) continue;
    const jokerless = counts.jokers === 0 && exposures.every((e) => !e.tiles.some(isJoker));
    if (!best || concrete.hand.value > best.concrete.hand.value) best = { concrete, jokerless };
  }
  return best;
}

/**
 * Whether a discard of `key` could be called to expose a group of `size`: the player
 * needs size - 1 matching naturals or jokers, and some open hand they could still make
 * must contain a group of exactly that face and size.
 */
export function exposureOptions(card: Card, concealed: readonly number[], exposures: readonly Exposure[], key: string): number[] {
  const counts = count(concealed);
  const have = (counts.naturals.get(key) ?? 0) + counts.jokers;
  const sizes = new Set<number>();
  for (const concrete of concreteHands(card)) {
    if (concrete.hand.concealed) continue;
    const remaining = withoutExposures(concrete.groups, exposures);
    if (!remaining) continue;
    for (const g of remaining) if (g.face === key && g.jokerable && g.n - 1 <= have) sizes.add(g.n);
  }
  return [...sizes].sort((a, b) => a - b);
}
