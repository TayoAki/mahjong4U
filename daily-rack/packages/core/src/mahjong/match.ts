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

export interface ExposureFit {
  concrete: ConcreteHand;
  /** Groups left to fill once the exposures are taken out. */
  remaining: ConcreteGroup[];
}

/**
 * Every concrete hand that is still consistent with a seat's exposures, judged from the
 * exposures alone (so anyone at the table can work it out). Once a seat has exposed,
 * concealed hands are out.
 */
export function handsFittingExposures(card: Card, exposures: readonly Exposure[]): ExposureFit[] {
  return [...eachHandFittingExposures(card, exposures)];
}

/** handsFittingExposures one at a time, for callers that can stop early. */
export function* eachHandFittingExposures(card: Card, exposures: readonly Exposure[]): Generator<ExposureFit> {
  for (const concrete of concreteHands(card)) {
    if (concrete.hand.concealed && exposures.length > 0) continue;
    const remaining = withoutExposures(concrete.groups, exposures);
    if (remaining) yield { concrete, remaining };
  }
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

/**
 * Faces that would bring this fit a tile closer if drawn: any face its remaining groups
 * still need, plus 'JOKER' when a joker could fill a gap. `concealed` is the hand the fit
 * was measured from. Used to count useful draws.
 */
export function helpfulFaces(fit: HandFit, concealed: readonly number[]): string[] {
  const counts = count(concealed);
  const faces: string[] = [];
  for (const face of new Set(fit.remaining.map((g) => g.face))) {
    const more = new Map(counts.naturals).set(face, (counts.naturals.get(face) ?? 0) + 1);
    if (deficit(fit.remaining, { naturals: more, jokers: counts.jokers }) < fit.distance) faces.push(face);
  }
  if (deficit(fit.remaining, { naturals: counts.naturals, jokers: counts.jokers + 1 }) < fit.distance) faces.push('JOKER');
  return faces;
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

/**
 * Lays a winning hand out group by group, in card order, the way a player shows it:
 * exposed groups as they were called, then the concealed tiles sorted into the rest,
 * with jokers filling out groups of three or more. Null if the tiles don't make the
 * named hand (the caller can fall back to a plain sorted row).
 */
export function arrangeWin(card: Card, handId: string, label: string, concealed: readonly number[], exposures: readonly Exposure[]): number[][] | null {
  const concrete = concreteHands(card).find((c) => c.hand.id === handId && c.label === label);
  if (!concrete) return null;
  const groups: (number[] | null)[] = concrete.groups.map(() => null);
  for (const e of exposures) {
    const i = concrete.groups.findIndex((g, j) => groups[j] === null && g.face === e.key && g.n === e.tiles.length && g.jokerable);
    if (i === -1) return null;
    groups[i] = [...e.tiles];
  }
  const naturals = new Map<string, number[]>();
  const jokers: number[] = [];
  for (const t of concealed) {
    if (isJoker(t)) jokers.push(t);
    else naturals.set(keyOf(t), [...(naturals.get(keyOf(t)) ?? []), t]);
  }
  // Pairs and singles take naturals first, since jokers can't stand in for them.
  const order = concrete.groups.map((g, i) => ({ g, i })).sort((a, b) => Number(a.g.jokerable) - Number(b.g.jokerable));
  for (const { g, i } of order) {
    if (groups[i] !== null) continue;
    const pool = naturals.get(g.face) ?? [];
    const tiles = pool.splice(0, g.n);
    while (tiles.length < g.n && g.jokerable && jokers.length > 0) tiles.push(jokers.shift()!);
    if (tiles.length < g.n) return null;
    groups[i] = tiles;
  }
  if (jokers.length > 0 || [...naturals.values()].some((p) => p.length > 0)) return null;
  return groups as number[][];
}
