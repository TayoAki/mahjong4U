import {
  adviseClaim,
  analyze,
  bestDistance,
  cardById,
  isJoker,
  judgeRest,
  keyOf,
  passTarget,
  playerView,
  rankDiscards,
  suggestPass,
  visibleCounts,
  type Action,
  type Card,
  type CardHand,
  type ClaimAdvice,
  type Exposure,
  type GameState,
  type Judgement,
  type PlayerView,
  type Seat,
  type Seen,
  type TileChoice,
} from '@daily-rack/core/mahjong';
import type { TablePayload } from '../lib/api.ts';
import { tileShort } from '../game/tiles.ts';
import { actOffline, botStep, newOfflineGame, offlinePayload, type OfflineSave, type OfflineSettings } from '../offline/OfflineTable.ts';

// A practice round: one untimed hand against computer players, with Pip coaching every
// decision. The hand runs on the device like the offline game. On top of that it keeps the
// game as it was before each of your moves, so any move can be taken back, and notes each
// choice beside Pip's for the review at the end. Nothing here goes into your stats.

/** Pip's view of the move in front of you. */
export type Advice =
  /** A Charleston or courtesy pass: Pip's tiles, and how close you'd be after passing them. */
  | { kind: 'pass'; count: number; pip: number[]; before: number; after: Judgement }
  /** Your turn: every discard, best first, unless you can declare Mahjong. */
  | { kind: 'discard'; rows: TileChoice[]; canMahjong: boolean }
  | { kind: 'claim'; tile: number; from: Seat; advice: ClaimAdvice }
  /** Whether to pass again in a second Charleston. */
  | { kind: 'vote'; distance: number; again: boolean }
  /** How many tiles to offer in the courtesy pass. */
  | { kind: 'offer'; count: number };

/** One side of a decision: the tiles, and how close they leave you. */
export interface Choice {
  tiles: number[];
  /** Tiles still needed for the nearest hand. */
  distance: number;
  /** Unseen tiles that would bring it a step closer. */
  helpers: number;
  /** The nearest hand on the card, by id. */
  nearest: string | null;
}

/** Something you chose, next to what Pip would have chosen. */
export interface Decision {
  kind: 'pass' | 'discard' | 'claim';
  /** When it was, such as “Your 4th discard” or “Rosie’s 5 Bam”. */
  when: string;
  mine: Choice;
  pip: Choice;
  /** For a call: what you did and what Pip said. */
  call?: { tile: number; mine: ClaimAdvice['call']; pip: ClaimAdvice['call'] };
  /** Pip would have declared Mahjong. */
  mahjong?: boolean;
  /** Your choice was Pip's, or just as good. */
  followed: boolean;
}

interface Snapshot {
  game: OfflineSave;
  decisions: number;
  movedAt: string;
}

export interface PracticeSave {
  v: 1;
  game: OfflineSave;
  /** The game just before each of your moves, newest last. */
  history: Snapshot[];
  decisions: Decision[];
  takeBacks: number;
  /** When you last moved; Pip's notes are about what's happened since. */
  movedAt: string;
}

/** Log lines kept with a snapshot: the table only shows the last few. */
const SNAPSHOT_LOG = 3;
/** Stands in for "no hand fits" in saved distances (Infinity doesn't survive JSON). */
const FAR = 99;

const finite = (n: number) => (Number.isFinite(n) ? n : FAR);
const keyFor = (tile: number) => (isJoker(tile) ? 'JOKER' : keyOf(tile));
/** You always sit at position 0; this is your seat in the engine. */
export const mySeat = (save: PracticeSave) => ((4 - save.game.dealer) % 4) as Seat;
export const practiceCard = (save: PracticeSave): Card => cardById(save.game.state.cardId);
export const practiceEnded = (save: PracticeSave) => save.game.state.phase.kind === 'ended';

export function newPractice(settings: OfflineSettings, me: string): PracticeSave {
  return { v: 1, game: newOfflineGame(settings, me), history: [], decisions: [], takeBacks: 0, movedAt: new Date(0).toISOString() };
}

/** What Pip thinks of the move this view is waiting for, or null when it isn't your move. */
export function adviceFor(card: Card, state: GameState, view: PlayerView): Advice | null {
  const prompt = view.prompt;
  if (!prompt) return null;
  const hand = view.hand;
  const exposures = view.players[view.seat]?.exposures ?? [];
  const seen = visibleCounts(state);
  switch (prompt.type) {
    case 'charleston-pass':
    case 'courtesy-pass': {
      const pip = suggestPass(card, hand, prompt.count, seen);
      return { kind: 'pass', count: prompt.count, pip, before: bestDistance(card, hand, []), after: judgeRest(card, hand, pip, [], seen) };
    }
    case 'charleston-vote': {
      const distance = bestDistance(card, hand, []);
      // Like the computer players: a hand that's still far off is worth another round.
      return { kind: 'vote', distance, again: distance > 6 };
    }
    case 'courtesy-count':
      return { kind: 'offer', count: freeTiles(card, hand, seen) };
    case 'turn':
      return { kind: 'discard', rows: rankDiscards(card, hand, exposures, seen), canMahjong: prompt.canMahjong };
    case 'claim':
      return { kind: 'claim', tile: prompt.tile, from: prompt.from, advice: adviseClaim(card, hand, exposures, prompt.tile, seen) };
  }
}

/**
 * Pip's discards: the best one or two. Pip never suggests throwing a joker, even when your
 * closest hand can't use one (pairs hands can't), since another hand you may switch to can.
 */
export function pipPicks(rows: readonly TileChoice[]): TileChoice[] {
  const naturals = rows.filter((r) => r.key !== 'JOKER');
  if (naturals.length === 0) return rows.slice(0, 1);
  return naturals.filter((r) => r.rank === naturals[0]!.rank).slice(0, 2);
}

/** Closer is better; as close with more useful tiles is better too. */
export const asGood = (a: Pick<Choice, 'distance' | 'helpers'>, b: Pick<Choice, 'distance' | 'helpers'>) =>
  a.distance < b.distance || (a.distance === b.distance && a.helpers >= b.helpers);

/** How many tiles (up to 3) you could give away without moving further from your nearest hand. */
function freeTiles(card: Card, hand: readonly number[], seen: Seen): number {
  const before = bestDistance(card, hand, []);
  const pip = suggestPass(card, hand, 3, seen);
  let count = 0;
  while (count < pip.length && judgeRest(card, hand, pip.slice(0, count + 1), [], seen).distance <= before) count += 1;
  return count;
}

const choiceOf = (tiles: number[], j: Judgement): Choice => ({ tiles, distance: finite(j.distance), helpers: j.helpers, nearest: j.nearest?.id ?? null });

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}

/** Where you'd be after calling `tile` for a group of `size` and throwing your best tile. */
function afterCall(card: Card, hand: readonly number[], exposures: readonly Exposure[], tile: number, size: number, seen: Seen): Choice {
  const key = keyOf(tile);
  // Matching tiles go down first, then jokers, as the engine does it.
  const used = [...hand.filter((t) => !isJoker(t) && keyOf(t) === key), ...hand.filter(isJoker)].slice(0, size - 1);
  const best = rankDiscards(
    card,
    hand.filter((t) => !used.includes(t)),
    [...exposures, { key, tiles: [tile, ...used] }],
    seen,
  )[0];
  return best ? choiceOf([], best) : { tiles: [], distance: FAR, helpers: 0, nearest: null };
}

/** Your move set beside Pip's advice for it, or null for moves Pip doesn't score. */
function judgeMove(card: Card, state: GameState, view: PlayerView, advice: Advice, action: Action, decisions: Decision[], nameOf: (seat: Seat) => string): Decision | null {
  const hand = view.hand;
  const exposures = view.players[view.seat]?.exposures ?? [];
  const seen = visibleCounts(state);
  if (advice.kind === 'pass' && (action.type === 'charleston-pass' || action.type === 'courtesy-pass')) {
    const phase = view.phase;
    const when =
      phase.kind === 'charleston' ? `${phase.round === 2 ? 'Second Charleston' : 'Charleston'}: passing ${phase.direction} to ${nameOf(passTarget(view.seat, phase.direction))}` : 'Courtesy pass';
    const mine = choiceOf(action.tiles, judgeRest(card, hand, action.tiles, [], seen));
    const pip = choiceOf(advice.pip, advice.after);
    return { kind: 'pass', when, mine, pip, followed: asGood(mine, pip) };
  }
  if (advice.kind === 'discard' && (action.type === 'discard' || action.type === 'declare-mahjong')) {
    const when = `Your ${ordinal(decisions.filter((d) => d.kind === 'discard').length + 1)} discard`;
    const picks = pipPicks(advice.rows);
    const best = picks[0]!;
    if (advice.canMahjong) {
      const win: Choice = { tiles: [], distance: 0, helpers: 0, nearest: analyze(card, hand, exposures)[0]?.concrete.hand.id ?? null };
      if (action.type === 'declare-mahjong') return { kind: 'discard', when: 'Your Mahjong', mine: win, pip: win, mahjong: true, followed: true };
      const row = advice.rows.find((r) => r.key === keyFor(action.tile)) ?? best;
      return { kind: 'discard', when, mine: choiceOf([action.tile], row), pip: win, mahjong: true, followed: false };
    }
    if (action.type !== 'discard') return null;
    const row = advice.rows.find((r) => r.key === keyFor(action.tile)) ?? best;
    const pip = choiceOf(
      picks.map((r) => r.tile),
      best,
    );
    return { kind: 'discard', when, mine: choiceOf([action.tile], row), pip, followed: row.key !== 'JOKER' && asGood(row, best) };
  }
  if (advice.kind === 'claim' && action.type === 'claim') {
    const { advice: a, tile } = advice;
    const now: Choice = { tiles: [], distance: finite(a.before), helpers: 0, nearest: analyze(card, hand, exposures)[0]?.concrete.hand.id ?? null };
    const win: Choice = { tiles: [tile], distance: 0, helpers: 0, nearest: a.nearest?.id ?? null };
    const response = action.response;
    const mine = response.type === 'mahjong' ? win : response.type === 'expose' ? { ...afterCall(card, hand, exposures, tile, response.size, seen), tiles: [tile] } : now;
    const pip = a.call === 'mahjong' ? win : a.call === 'expose' ? { tiles: [tile], distance: finite(a.after), helpers: 0, nearest: a.nearest?.id ?? null } : now;
    return { kind: 'claim', when: `${nameOf(advice.from)}’s ${tileShort(tile)}`, mine, pip, call: { tile, mine: response.type, pip: a.call }, followed: response.type === a.call };
  }
  return null;
}

/** Your move. Throws the engine's error if the move isn't allowed. */
export function practiceAct(save: PracticeSave, action: Action, me: string): PracticeSave {
  const movedAt = new Date().toISOString();
  const game = actOffline(save.game, action, me);
  const card = practiceCard(save);
  const view = playerView(card, save.game.state, mySeat(save));
  const advice = adviceFor(card, save.game.state, view);
  // Letting a discard go when Pip would too is hardly a choice. It isn't scored, and a
  // take-back skips past it to the move you'd want back, such as the discard before it.
  if (action.type === 'claim' && action.response.type === 'pass' && advice?.kind === 'claim' && advice.advice.call === 'pass') return { ...save, game };
  const seats = offlinePayload(save.game, me).table.seats;
  const nameOf = (seat: Seat) => seats[(seat + save.game.dealer) % 4]!.name.replace(' (computer)', '');
  const decision = advice && judgeMove(card, save.game.state, view, advice, action, save.decisions, nameOf);
  return {
    ...save,
    game,
    history: [...save.history, { game: { ...save.game, log: save.game.log.slice(-SNAPSHOT_LOG) }, decisions: save.decisions.length, movedAt: save.movedAt }],
    decisions: decision ? [...save.decisions, decision] : save.decisions,
    movedAt,
  };
}

/** Back to just before your last move, computer moves since then and all. */
export function takeBack(save: PracticeSave): PracticeSave {
  const last = save.history.at(-1);
  if (!last) return save;
  return { ...save, game: last.game, history: save.history.slice(0, -1), decisions: save.decisions.slice(0, last.decisions), takeBacks: save.takeBacks + 1, movedAt: last.movedAt };
}

/** The next computer move that's due, or null when it's your move (or the hand is over). */
export function practiceBotStep(save: PracticeSave, me: string): PracticeSave | null {
  const game = botStep(save.game, me);
  return game ? { ...save, game } : null;
}

/** The table for the game screen. A finished practice hand has no next hand to deal. */
export function practicePayload(save: PracticeSave, me: string): TablePayload {
  const payload = offlinePayload(save.game, me);
  return { ...payload, table: { ...payload.table, id: `practice-${save.game.id}`, status: practiceEnded(save) ? 'closed' : 'playing' } };
}

/** How much a decision cost against Pip's choice: a tile further away counts far more than useful tiles. */
export function costOf(d: Decision): number {
  if (d.followed) return 0;
  if (d.pip.distance === 0 && d.mine.distance > 0) return 10_000;
  return Math.max(0, (d.mine.distance - d.pip.distance) * 100 + d.pip.helpers - d.mine.helpers);
}

export interface Review {
  won: boolean;
  /** The hand you were building toward most of the time. */
  aim: CardHand | null;
  /** Your nearest hand at the end, and how many tiles it still needed. */
  nearest: { hand: CardHand; distance: number } | null;
  matched: number;
  total: number;
  takeBacks: number;
  /** The decision that cost you most, if any did. */
  key: Decision | null;
}

export function reviewOf(save: PracticeSave): Review {
  const card = practiceCard(save);
  const state = save.game.state;
  const seat = mySeat(save);
  const handById = (id: string | null) => card.hands.find((h) => h.id === id) ?? null;
  const won = state.result?.kind === 'mahjong' && state.result.winner === seat;
  // What you went for: the nearest hand you played toward most often once play began.
  const played = save.decisions.filter((d) => d.kind !== 'pass');
  const tally = new Map<string, number>();
  for (const d of played.length > 0 ? played : save.decisions) if (d.mine.nearest) tally.set(d.mine.nearest, (tally.get(d.mine.nearest) ?? 0) + 1);
  const aim = handById([...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null);
  const me = state.players[seat]!;
  const fit = analyze(card, me.hand, me.exposures)[0];
  const nearest = won ? { hand: handById(state.result!.handId)!, distance: 0 } : fit ? { hand: fit.concrete.hand, distance: fit.distance } : null;
  const costly = save.decisions.filter((d) => costOf(d) > 0).sort((a, b) => costOf(b) - costOf(a));
  return {
    won,
    aim: aim ?? nearest?.hand ?? null,
    nearest,
    matched: save.decisions.filter((d) => d.followed).length,
    total: save.decisions.length,
    takeBacks: save.takeBacks,
    key: costly[0] ?? null,
  };
}
