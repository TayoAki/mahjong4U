import type { Card } from './card.ts';
import { deadReasonFrom, visibleCounts } from './dead.ts';
import { applyAction, pendingSeats, promptFor, type Action, type GameState, type Seat } from './game.ts';
import { analyze, bestDistance, type Exposure } from './match.ts';
import { isJoker, keyOf } from './set.ts';

// Computer players. They aim for the hands closest to complete, keep tiles those hands
// need, and only call when it brings them closer. Levels differ in how many target hands
// they weigh and how often they make a careless choice.

export type BotLevel = 'easy' | 'normal' | 'hard';

const TARGETS: Record<BotLevel, number> = { easy: 3, normal: 8, hard: 8 };
const SLOPPINESS: Record<BotLevel, number> = { easy: 0.2, normal: 0.12, hard: 0 };

/** How much each tile helps the hands this bot is aiming for. Jokers always help. */
export function tileScores(card: Card, hand: readonly number[], exposures: readonly Exposure[], level: BotLevel): Map<number, number> {
  const fits = analyze(card, hand, exposures);
  const best = fits[0]?.distance ?? Infinity;
  const targets = fits.filter((f) => f.distance <= best + 2).slice(0, TARGETS[level]);
  const scores = new Map<number, number>(hand.map((t) => [t, isJoker(t) ? 100 : 0]));
  for (const fit of targets) {
    const weight = Math.exp(-(fit.distance - best)) * (1 + fit.concrete.hand.value / 100);
    const need = new Map<string, number>();
    for (const g of fit.remaining) need.set(g.face, (need.get(g.face) ?? 0) + g.n);
    for (const t of hand) {
      if (isJoker(t)) continue;
      const key = keyOf(t);
      const left = need.get(key) ?? 0;
      if (left > 0) {
        need.set(key, left - 1);
        scores.set(t, (scores.get(t) ?? 0) + weight);
      }
    }
  }
  return scores;
}

function lowest(scores: Map<number, number>, count: number, random: () => number, allowJokers = false): number[] {
  return [...scores.entries()]
    .filter(([t]) => allowJokers || !isJoker(t))
    .map(([t, s]) => ({ t, s: s + random() * 0.001 }))
    .sort((a, b) => a.s - b.s)
    .slice(0, count)
    .map((x) => x.t);
}

function randomNonJokers(hand: readonly number[], count: number, random: () => number): number[] {
  const pool = hand.filter((t) => !isJoker(t));
  const picks: number[] = [];
  while (picks.length < count && pool.length > 0) picks.push(pool.splice(Math.floor(random() * pool.length), 1)[0]!);
  return picks;
}

export function botAction(card: Card, state: GameState, seat: Seat, level: BotLevel, random: () => number): Action {
  const prompt = promptFor(card, state, seat);
  const me = state.players[seat]!;
  const careless = () => random() < SLOPPINESS[level];
  if (!prompt) throw new Error(`seat ${seat} has nothing to do`);

  switch (prompt.type) {
    case 'charleston-pass':
      return {
        type: 'charleston-pass',
        tiles: careless() ? randomNonJokers(me.hand, 3, random) : lowest(tileScores(card, me.hand, me.exposures, level), 3, random),
      };
    case 'charleston-vote': {
      if (level === 'easy') return { type: 'charleston-vote', continue: random() < 0.5 };
      return { type: 'charleston-vote', continue: bestDistance(card, me.hand, me.exposures) > 6 };
    }
    case 'courtesy-count': {
      const scores = tileScores(card, me.hand, me.exposures, level);
      const useless = [...scores.entries()].filter(([t, s]) => !isJoker(t) && s === 0).length;
      return { type: 'courtesy-count', count: level === 'easy' ? Math.floor(random() * 4) : Math.min(3, useless) };
    }
    case 'courtesy-pass':
      return { type: 'courtesy-pass', tiles: lowest(tileScores(card, me.hand, me.exposures, level), prompt.count, random) };
    case 'turn': {
      if (prompt.canMahjong) return { type: 'declare-mahjong' };
      // A joker is worth more than the natural it replaces, so take it when offered.
      const exchange = prompt.exchanges[0];
      if (exchange && !(level === 'easy' && random() < 0.5)) {
        return { type: 'exchange-joker', tile: exchange.tile, target: exchange.target, exposure: exchange.exposure };
      }
      return { type: 'discard', tile: chooseDiscard(card, me.hand, me.exposures, level, random, unseenCounts(state, seat)) };
    }
    case 'claim': {
      if (prompt.canMahjong) return { type: 'claim', response: { type: 'mahjong' } };
      if (prompt.sizes.length === 0 || careless()) return { type: 'claim', response: { type: 'pass' } };
      const before = bestDistance(card, me.hand, me.exposures);
      let bestSize: number | null = null;
      let bestAfter = before;
      for (const size of prompt.sizes) {
        const { hand, exposures } = withExposure(me.hand, me.exposures, prompt.tile, size);
        // Never make a call that would leave the hand dead for everyone to see.
        if (wouldBeDead(card, state, me.hand, hand, exposures)) continue;
        const after = bestDistance(card, hand, exposures);
        if (after < bestAfter) {
          bestAfter = after;
          bestSize = size;
        }
      }
      // Calling locks in a hand; easy bots hesitate, the others call whenever it gets them closer.
      if (bestSize === null || (level === 'easy' && random() < 0.5)) return { type: 'claim', response: { type: 'pass' } };
      return { type: 'claim', response: { type: 'expose', size: bestSize } };
    }
  }
}

function withExposure(hand: readonly number[], exposures: readonly Exposure[], tile: number, size: number) {
  const key = keyOf(tile);
  const rest = [...hand];
  const used: number[] = [];
  for (const pick of [(t: number) => !isJoker(t) && keyOf(t) === key, isJoker]) {
    for (let i = 0; i < rest.length && used.length < size - 1; ) {
      if (pick(rest[i]!)) used.push(rest.splice(i, 1)[0]!);
      else i++;
    }
  }
  return { hand: rest, exposures: [...exposures, { key, tiles: [tile, ...used] }] };
}

/** Whether exposing tiles from `before` (leaving `after` concealed) would make the hand dead. */
function wouldBeDead(card: Card, state: GameState, before: readonly number[], after: readonly number[], exposures: readonly Exposure[]): boolean {
  // The called tile is face up either way; the naturals laid down with it become visible too.
  const seen = visibleCounts(state, null);
  const rest = [...after];
  for (const t of before) {
    const i = rest.indexOf(t);
    if (i !== -1) rest.splice(i, 1);
    else if (!isJoker(t)) seen.set(keyOf(t), (seen.get(keyOf(t)) ?? 0) + 1);
  }
  return deadReasonFrom(card, exposures, seen) !== null;
}

/** Copies of each face this seat cannot see: not in its hand, any exposure or the discards. */
function unseenCounts(state: GameState, seat: Seat): Map<string, number> {
  const unseen = new Map<string, number>();
  for (const face of ['DOT', 'BAMBOO', 'CHARACTER'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${s}_${r}`))) unseen.set(face, 4);
  for (const w of ['EAST', 'SOUTH', 'WEST', 'NORTH']) unseen.set(`WIND_${w}`, 4);
  for (const d of ['RED', 'GREEN', 'WHITE']) unseen.set(`DRAGON_${d}`, 4);
  unseen.set('FLOWER', 8);
  unseen.set('JOKER', 8);
  const seen = [
    ...state.players[seat]!.hand,
    ...state.players.flatMap((p) => p.exposures.flatMap((e) => e.tiles)),
    ...state.discards.map((d) => d.tile),
  ];
  for (const t of seen) {
    const key = isJoker(t) ? 'JOKER' : keyOf(t);
    unseen.set(key, Math.max(0, (unseen.get(key) ?? 0) - 1));
  }
  return unseen;
}

const FACE_SAMPLE: Record<string, number> = {};

/** Unseen tiles that would bring the hand one step closer (more outs = faster hands). */
function outs(card: Card, hand: number[], exposures: readonly Exposure[], distance: number, unseen: Map<string, number>): number {
  let total = 0;
  for (const [key, copies] of unseen) {
    if (copies === 0) continue;
    const sample = FACE_SAMPLE[key] ?? (FACE_SAMPLE[key] = sampleTile(key));
    if (bestDistance(card, [...hand, sample], exposures) < distance) total += copies;
  }
  return total;
}

function sampleTile(key: string): number {
  for (let t = 0; t < 152; t++) if ((isJoker(t) ? 'JOKER' : keyOf(t)) === key) return t;
  throw new Error(`no tile for ${key}`);
}

function chooseDiscard(
  card: Card,
  hand: readonly number[],
  exposures: readonly Exposure[],
  level: BotLevel,
  random: () => number,
  unseen: Map<string, number>,
): number {
  const scores = tileScores(card, hand, exposures, level);
  const candidates = [...new Map(hand.filter((t) => !isJoker(t)).map((t) => [keyOf(t), t])).values()];
  if (candidates.length === 0) return hand[0]!;
  const ranked = candidates
    .map((t) => {
      const rest = [...hand];
      rest.splice(rest.indexOf(t), 1);
      const distance = bestDistance(card, rest, exposures);
      return { t, distance, score: scores.get(t) ?? 0, jitter: random(), rest };
    })
    .sort((a, b) => a.distance - b.distance || a.score - b.score || a.jitter - b.jitter);
  if (level === 'easy' && random() < SLOPPINESS.easy) return ranked[Math.min(ranked.length - 1, Math.floor(random() * 3))]!.t;
  if (level !== 'hard') return ranked[0]!.t;
  // Hard bots break ties among the closest options by counting live outs.
  const closest = ranked.filter((r) => r.distance === ranked[0]!.distance).slice(0, 6);
  return closest
    .map((r) => ({ ...r, outs: outs(card, r.rest, exposures, r.distance, unseen) }))
    .sort((a, b) => b.outs - a.outs || a.score - b.score || a.jitter - b.jitter)[0]!.t;
}

/** Plays every pending bot seat until a human must act or the game ends. */
export function runBots(
  card: Card,
  state: GameState,
  bots: Partial<Record<Seat, BotLevel>>,
  random: () => number,
  maxSteps = 2000,
): GameState {
  let current = state;
  for (let i = 0; i < maxSteps; i++) {
    const seat = pendingSeats(current).find((s) => bots[s] !== undefined);
    if (seat === undefined) return current;
    current = applyAction(card, current, seat, botAction(card, current, seat, bots[seat]!, random)).state;
  }
  throw new Error('bots did not finish');
}
