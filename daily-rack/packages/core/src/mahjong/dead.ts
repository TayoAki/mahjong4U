import type { Card } from './card.ts';
import type { GameState, Seat } from './game.ts';
import { eachHandFittingExposures, type Exposure } from './match.ts';
import { isJoker, keyOf } from './set.ts';
import { groupName, listOf, needPhrase, numberWord, tileName, tileNames } from './words.ts';

// Dead hands. A hand is dead once it can no longer win; that seat sits out the rest of the
// hand (no drawing, discarding, calling or Mahjong) but still pays the winner. The engine
// only calls a hand dead when anyone at the table could prove it from what is face up:
// the discards and every exposure. Nobody's concealed tiles or the wall are looked at.

export type DeadReasonCode =
  /** No hand on the card fits the groups this seat has exposed. */
  | 'no-hand'
  /** Every hand that fits needs, as a pair or single, a tile that is already used up. */
  | 'tiles-gone';

export interface DeadReason {
  code: DeadReasonCode;
  /**
   * Faces involved (match keys: face codes, with 'FLOWER' for any flower). For 'no-hand',
   * the exposed groups; for 'tiles-gone', the used-up tiles the hands needed.
   */
  faces: string[];
  /**
   * A short plain-English phrase without the player's name, starting in lower case so it
   * can follow "Hazel's hand is dead: ", e.g. "every hand that fits these exposures needs
   * a pair of Red Dragons, and all four are already out".
   */
  text: string;
}

/** Copies of a match key in the set: flowers are interchangeable, so there are eight. */
function copiesOf(key: string): number {
  return key === 'FLOWER' ? 8 : 4;
}

/**
 * Natural tiles face up for everyone to see: the discards and every exposure. `liveTile`
 * is a discard that can still be called, which isn't used up yet.
 */
export function visibleCounts(state: GameState, liveTile: number | null = state.phase.kind === 'claim' ? state.phase.tile : null): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (t: number) => {
    if (isJoker(t) || t === liveTile) return;
    counts.set(keyOf(t), (counts.get(keyOf(t)) ?? 0) + 1);
  };
  for (const d of state.discards) add(d.tile);
  for (const p of state.players) for (const e of p.exposures) for (const t of e.tiles) add(t);
  return counts;
}

function describeExposure(e: Exposure): string {
  return `${groupName(e.tiles.length)} of ${tileNames(e.key)}`;
}

function outPhrase(seen: number, copies: number): string {
  return seen >= copies ? `all ${numberWord(copies)} are` : `${numberWord(seen)} of the ${numberWord(copies)} are`;
}

/**
 * Why this seat's hand is dead, judged from public information only, or null while it can
 * still win. The engine runs it after every discard window closes, every call and every
 * joker exchange. `liveTile` defaults to the discard on offer in a claim window, which can
 * still be taken (say, as the single that wins a hand), so it doesn't count as used up.
 */
export function deadHandReason(card: Card, state: GameState, seat: Seat, liveTile?: number | null): DeadReason | null {
  return deadReasonFrom(card, state.players[seat]!.exposures, visibleCounts(state, liveTile));
}

/**
 * The dead-hand test itself, for a seat's exposures and the count of each tile face up
 * (see visibleCounts). Lets a player check a call before making it.
 */
export function deadReasonFrom(card: Card, exposures: readonly Exposure[], seen: ReadonlyMap<string, number>): DeadReason | null {
  // Pairs and singles take natural tiles only. A hand is out of reach when one of them
  // needs more copies of a tile than are left unseen. One reachable hand is enough to live.
  const blockersOf: string[][] = [];
  for (const fit of eachHandFittingExposures(card, exposures)) {
    const need = new Map<string, number>();
    for (const g of fit.remaining) if (!g.jokerable) need.set(g.face, (need.get(g.face) ?? 0) + g.n);
    const blockers = [...need].filter(([face, n]) => n > copiesOf(face) - (seen.get(face) ?? 0)).map(([face, n]) => `${face}:${n}`);
    if (blockers.length === 0) return null;
    blockersOf.push(blockers);
  }
  if (blockersOf.length === 0) {
    return {
      code: 'no-hand',
      faces: [...new Set(exposures.map((e) => e.key))],
      text: `the exposed ${listOf(exposures.map(describeExposure))} ${exposures.length === 1 ? "doesn't" : "don't"} fit any hand on the card`,
    };
  }

  // Name as few used-up tiles as cover every hand, most widely needed first.
  const chosen: string[] = [];
  let open = blockersOf;
  while (open.length > 0) {
    const tally = new Map<string, number>();
    for (const blockers of open) for (const b of blockers) tally.set(b, (tally.get(b) ?? 0) + 1);
    const best = [...tally].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]![0];
    chosen.push(best);
    open = open.filter((blockers) => !blockers.includes(best));
  }
  const needs = chosen.map((b) => {
    const [face, n] = b.split(':') as [string, string];
    return { face, n: Number(n), seen: Math.min(seen.get(face) ?? 0, copiesOf(face)), copies: copiesOf(face) };
  });
  const subject = exposures.length > 0 ? 'every hand that fits these exposures' : 'every hand on the card';
  let text: string;
  if (needs.length === 1) {
    const x = needs[0]!;
    text = `${subject} needs ${needPhrase(x.face, x.n)}, and ${outPhrase(x.seen, x.copies)} already out`;
  } else {
    // "a pair of 6 Bam or 8 Dot" reads better than repeating "a pair of" each time.
    const n = needs[0]!.n;
    const wanted =
      n <= 2 && needs.every((x) => x.n === n)
        ? `${n === 1 ? 'a single' : 'a pair of'} ${listOf(needs.map((x) => (n === 1 ? tileName(x.face) : tileNames(x.face))), 'or')}`
        : listOf(needs.map((x) => needPhrase(x.face, x.n)), 'or');
    text = `${subject} needs ${wanted}, and ${needs.every((x) => x.seen >= x.copies) ? 'all of those are' : 'too many of each are'} already out`;
  }
  return { code: 'tiles-gone', faces: [...new Set(needs.map((x) => x.face))], text };
}
