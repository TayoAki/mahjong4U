import type { Card } from './card.ts';
import { deadHandReason, type DeadReason } from './dead.ts';
import { exposureOptions, findWin, type Exposure } from './match.ts';
import { isJoker, keyOf, shuffledWall } from './set.ts';

// American mahjong for four seats as a pure state machine: applyAction(state, seat, action)
// returns the next state. Seat 0 is East (the dealer) for the hand; play moves 0 -> 1 -> 2 -> 3.

export type Seat = 0 | 1 | 2 | 3;
export const SEATS: readonly Seat[] = [0, 1, 2, 3];
export const SEAT_WINDS = ['East', 'South', 'West', 'North'] as const;

export type PassDirection = 'right' | 'across' | 'left';
const CHARLESTON_ROUNDS: Record<1 | 2, PassDirection[]> = {
  1: ['right', 'across', 'left'],
  2: ['left', 'across', 'right'],
};

export function passTarget(seat: Seat, direction: PassDirection): Seat {
  const offset = direction === 'right' ? 1 : direction === 'across' ? 2 : 3;
  return ((seat + offset) % 4) as Seat;
}

export type ClaimResponse = { type: 'pass' } | { type: 'expose'; size: number } | { type: 'mahjong' };

export type Phase =
  | { kind: 'charleston'; round: 1 | 2; pass: number; selections: (number[] | null)[] }
  | { kind: 'charleston-vote'; votes: (boolean | null)[] }
  | { kind: 'courtesy-count'; counts: (number | null)[] }
  | { kind: 'courtesy-select'; selections: (number[] | null)[]; sizes: number[] }
  | { kind: 'turn'; seat: Seat; drawn: number | null }
  | { kind: 'claim'; tile: number; from: Seat; responses: (ClaimResponse | null)[] }
  | { kind: 'ended' };

export interface GameResult {
  kind: 'mahjong' | 'wall';
  winner: Seat | null;
  /** Seat whose discard won the hand; null when self-drawn or a wall game. */
  from: Seat | null;
  handId: string | null;
  pattern: string | null;
  assignment: string | null;
  value: number;
  jokerless: boolean;
  /** Points won (+) or paid (-) by each seat. */
  payments: number[];
}

export interface GameOptions {
  seed: number;
  /** Allow the optional second Charleston, decided by a unanimous vote. */
  secondCharleston?: boolean;
  courtesyPass?: boolean;
  /** Skip the Charleston entirely (two- or three-player style house rules, quick games). */
  skipCharleston?: boolean;
}

export interface GameState {
  v: 1;
  cardId: string;
  seed: number;
  options: Required<Omit<GameOptions, 'seed'>>;
  wall: number[];
  players: { hand: number[]; exposures: Exposure[] }[];
  discards: { tile: number; seat: Seat }[];
  phase: Phase;
  turns: number;
  result: GameResult | null;
  /**
   * Seats whose hand is dead, with the reason; null while a seat can still win. A dead seat
   * sits out the rest of the hand but still pays the winner. Missing in games saved before
   * dead hands existed, so read it through isDead / deadReason.
   */
  dead?: (DeadReason | null)[];
}

export type Action =
  | { type: 'charleston-pass'; tiles: number[] }
  | { type: 'charleston-vote'; continue: boolean }
  | { type: 'courtesy-count'; count: number }
  | { type: 'courtesy-pass'; tiles: number[] }
  | { type: 'discard'; tile: number }
  | { type: 'exchange-joker'; tile: number; target: Seat; exposure: number }
  | { type: 'declare-mahjong' }
  | { type: 'claim'; response: ClaimResponse };

export type GameEvent =
  | { type: 'charleston'; round: 1 | 2; direction: PassDirection }
  | { type: 'second-charleston'; happening: boolean }
  | { type: 'courtesy'; sizes: number[] }
  | { type: 'play-started' }
  | { type: 'draw'; seat: Seat }
  | { type: 'discard'; seat: Seat; tile: number }
  | { type: 'call'; seat: Seat; tile: number; size: number }
  | { type: 'exchange'; seat: Seat; target: Seat; tile: number }
  | { type: 'mahjong'; seat: Seat; from: Seat | null }
  | { type: 'dead-hand'; seat: Seat; reason: DeadReason }
  | { type: 'wall-game' };

export class GameError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function newGame(card: Card, options: GameOptions): GameState {
  const wall = shuffledWall(options.seed);
  const players = SEATS.map(() => ({ hand: [] as number[], exposures: [] as Exposure[] }));
  for (let i = 0; i < 13; i++) for (const p of players) p.hand.push(wall.pop()!);
  players[0]!.hand.push(wall.pop()!);
  const state: GameState = {
    v: 1,
    cardId: card.id,
    seed: options.seed,
    options: {
      secondCharleston: options.secondCharleston ?? true,
      courtesyPass: options.courtesyPass ?? true,
      skipCharleston: options.skipCharleston ?? false,
    },
    wall,
    players,
    discards: [],
    phase: { kind: 'charleston', round: 1, pass: 0, selections: [null, null, null, null] },
    turns: 0,
    result: null,
    dead: [null, null, null, null],
  };
  if (state.options.skipCharleston) state.phase = { kind: 'turn', seat: 0, drawn: null };
  return state;
}

export function currentDirection(phase: Phase): PassDirection | null {
  return phase.kind === 'charleston' ? CHARLESTON_ROUNDS[phase.round][phase.pass]! : null;
}

/**
 * Moves everyone makes at once; another player's move doesn't make yours stale. Calls
 * count too: several players may be deciding on the same discard.
 */
export const SIMULTANEOUS_ACTIONS: ReadonlySet<Action['type']> = new Set(['charleston-pass', 'charleston-vote', 'courtesy-count', 'courtesy-pass', 'claim']);

/**
 * Identifies one step of the hand, such as the second pass of the first Charleston or the
 * calls on one particular discard (tile ids are unique). Matches publicPhaseKey for the
 * same moment, so a client can say which step it acted on.
 */
export function phaseKey(phase: Phase): string {
  if (phase.kind === 'charleston') return `charleston:${phase.round}:${currentDirection(phase)}`;
  return phase.kind === 'claim' ? `claim:${phase.tile}` : phase.kind;
}

export function publicPhaseKey(phase: PublicPhase): string {
  if (phase.kind === 'charleston') return `charleston:${phase.round}:${phase.direction}`;
  return phase.kind === 'claim' ? `claim:${phase.tile}` : phase.kind;
}

/** Why this seat's hand is dead, or null while it can still win. */
export function deadReason(state: GameState, seat: Seat): DeadReason | null {
  return state.dead?.[seat] ?? null;
}

export function isDead(state: GameState, seat: Seat): boolean {
  return deadReason(state, seat) !== null;
}

/** Seats that must act before the game can move on. Dead seats never do. */
export function pendingSeats(state: GameState): Seat[] {
  const p = state.phase;
  switch (p.kind) {
    case 'charleston':
    case 'courtesy-select':
      return SEATS.filter((s) => p.selections[s] === null);
    case 'charleston-vote':
      return SEATS.filter((s) => p.votes[s] === null);
    case 'courtesy-count':
      return SEATS.filter((s) => p.counts[s] === null);
    case 'turn':
      return isDead(state, p.seat) ? [] : [p.seat];
    case 'claim':
      return SEATS.filter((s) => p.responses[s] === null && !isDead(state, s));
    case 'ended':
      return [];
  }
}

export function applyAction(card: Card, input: GameState, seat: Seat, action: Action): { state: GameState; events: GameEvent[] } {
  if (card.id !== input.cardId) throw new GameError('wrong_card', 'This game was dealt with a different card.');
  const state = structuredClone(input);
  const events: GameEvent[] = [];
  const phase = state.phase;
  const me = state.players[seat]!;
  const wrongTime = () => new GameError('not_now', 'That move is not available right now.');
  if (isDead(state, seat)) throw new GameError('dead_hand', 'Your hand is dead, so you sit out the rest of this hand.');

  switch (action.type) {
    case 'charleston-pass': {
      if (phase.kind !== 'charleston' || phase.selections[seat] !== null) throw wrongTime();
      requirePassable(me.hand, action.tiles, 3);
      phase.selections[seat] = [...action.tiles];
      if (phase.selections.every((s) => s !== null)) {
        const direction = currentDirection(phase)!;
        exchange(state, phase.selections as number[][], (s) => passTarget(s, direction));
        events.push({ type: 'charleston', round: phase.round, direction });
        if (phase.pass < 2) {
          state.phase = { kind: 'charleston', round: phase.round, pass: phase.pass + 1, selections: [null, null, null, null] };
        } else if (phase.round === 1 && state.options.secondCharleston) {
          state.phase = { kind: 'charleston-vote', votes: [null, null, null, null] };
        } else {
          afterCharleston(state, events);
        }
      }
      break;
    }
    case 'charleston-vote': {
      if (phase.kind !== 'charleston-vote' || phase.votes[seat] !== null) throw wrongTime();
      phase.votes[seat] = action.continue;
      // Any player may stop the second Charleston, so a single "no" settles it.
      if (!action.continue) {
        events.push({ type: 'second-charleston', happening: false });
        afterCharleston(state, events);
      } else if (phase.votes.every((v) => v === true)) {
        events.push({ type: 'second-charleston', happening: true });
        state.phase = { kind: 'charleston', round: 2, pass: 0, selections: [null, null, null, null] };
      }
      break;
    }
    case 'courtesy-count': {
      if (phase.kind !== 'courtesy-count' || phase.counts[seat] !== null) throw wrongTime();
      if (!Number.isInteger(action.count) || action.count < 0 || action.count > 3) {
        throw new GameError('bad_count', 'Offer between 0 and 3 tiles.');
      }
      phase.counts[seat] = action.count;
      if (phase.counts.every((c) => c !== null)) {
        // Partners across the table swap the smaller of their two offers.
        const sizes = SEATS.map((s) => Math.min(phase.counts[s]!, phase.counts[passTarget(s, 'across')]!));
        events.push({ type: 'courtesy', sizes });
        if (sizes.every((n) => n === 0)) startPlay(state, events);
        else state.phase = { kind: 'courtesy-select', sizes, selections: sizes.map((n) => (n === 0 ? [] : null)) };
      }
      break;
    }
    case 'courtesy-pass': {
      if (phase.kind !== 'courtesy-select' || phase.selections[seat] !== null) throw wrongTime();
      requirePassable(me.hand, action.tiles, phase.sizes[seat]!);
      phase.selections[seat] = [...action.tiles];
      if (phase.selections.every((s) => s !== null)) {
        exchange(state, phase.selections as number[][], (s) => passTarget(s, 'across'));
        startPlay(state, events);
      }
      break;
    }
    case 'discard': {
      if (phase.kind !== 'turn' || phase.seat !== seat) throw wrongTime();
      takeFrom(me.hand, action.tile);
      state.discards.push({ tile: action.tile, seat });
      events.push({ type: 'discard', seat, tile: action.tile });
      openClaims(card, state, seat, action.tile, events);
      break;
    }
    case 'exchange-joker': {
      if (phase.kind !== 'turn' || phase.seat !== seat) throw wrongTime();
      if (isJoker(action.tile) || !me.hand.includes(action.tile)) throw new GameError('bad_tile', 'Exchange a natural tile from your hand.');
      const exposure = state.players[action.target]?.exposures[action.exposure];
      if (!exposure) throw new GameError('bad_exposure', 'That exposure does not exist.');
      if (exposure.key !== keyOf(action.tile)) throw new GameError('bad_exchange', 'Your tile must match the exposed group.');
      const jokerIndex = exposure.tiles.findIndex(isJoker);
      if (jokerIndex === -1) throw new GameError('no_joker', 'That exposure has no joker to take.');
      const joker = exposure.tiles[jokerIndex]!;
      exposure.tiles[jokerIndex] = action.tile;
      takeFrom(me.hand, action.tile);
      me.hand.push(joker);
      events.push({ type: 'exchange', seat, target: action.target, tile: action.tile });
      // The natural is face up now, which can leave someone (even this seat) with a dead hand.
      afterPublicChange(card, state, seat, events);
      break;
    }
    case 'declare-mahjong': {
      if (phase.kind !== 'turn' || phase.seat !== seat) throw wrongTime();
      const win = findWin(card, me.hand, me.exposures);
      if (!win) throw new GameError('not_mahjong', 'Those tiles do not make a hand on the card yet.');
      finish(state, seat, null, win, events);
      break;
    }
    case 'claim': {
      if (phase.kind !== 'claim' || phase.responses[seat] !== null) throw wrongTime();
      const response = action.response;
      const options = claimOptions(card, state, seat, phase.tile);
      if (response.type === 'expose') {
        if (!options.sizes.includes(response.size)) throw new GameError('bad_call', 'You cannot expose that group with this tile.');
      } else if (response.type === 'mahjong') {
        if (!options.canMahjong) throw new GameError('not_mahjong', 'That tile does not complete a hand on the card.');
      }
      phase.responses[seat] = response;
      if (phase.responses.every((r) => r !== null)) resolveClaims(card, state, events);
      break;
    }
  }
  return { state, events };
}

function requirePassable(hand: readonly number[], tiles: readonly number[], count: number) {
  if (tiles.length !== count) throw new GameError('bad_pass', `Choose exactly ${count} tile${count === 1 ? '' : 's'}.`);
  if (new Set(tiles).size !== tiles.length) throw new GameError('bad_pass', 'A tile was chosen twice.');
  for (const t of tiles) {
    if (!hand.includes(t)) throw new GameError('bad_pass', 'You can only pass tiles in your hand.');
    if (isJoker(t)) throw new GameError('joker_pass', 'Jokers can never be passed.');
  }
}

function takeFrom(hand: number[], tile: number) {
  const i = hand.indexOf(tile);
  if (i === -1) throw new GameError('bad_tile', 'That tile is not in your hand.');
  hand.splice(i, 1);
}

function exchange(state: GameState, selections: number[][], target: (s: Seat) => Seat) {
  for (const s of SEATS) for (const t of selections[s]!) takeFrom(state.players[s]!.hand, t);
  for (const s of SEATS) state.players[target(s)]!.hand.push(...selections[s]!);
}

function afterCharleston(state: GameState, events: GameEvent[]) {
  if (state.options.courtesyPass) state.phase = { kind: 'courtesy-count', counts: [null, null, null, null] };
  else startPlay(state, events);
}

function startPlay(state: GameState, events: GameEvent[]) {
  state.phase = { kind: 'turn', seat: 0, drawn: null };
  events.push({ type: 'play-started' });
}

export interface ClaimOptions {
  /** The tile completes a hand on the card, so the seat may call it for Mahjong. */
  canMahjong: boolean;
  /** Sizes of group the seat could expose with the tile. */
  sizes: number[];
}

/**
 * What a seat could do with a discard, judged from its current hand. The engine asks a seat
 * about a discard only when this offers something; jokers and dead hands never can.
 */
export function claimOptions(card: Card, state: GameState, seat: Seat, tile: number): ClaimOptions {
  if (isDead(state, seat)) return { canMahjong: false, sizes: [] };
  const p = state.players[seat]!;
  return claimOptionsFor(card, p.hand, p.exposures, tile);
}

/** claimOptions for a given hand and exposures (shared with explainClaim, so they never disagree). */
export function claimOptionsFor(card: Card, hand: readonly number[], exposures: readonly Exposure[], tile: number): ClaimOptions {
  if (isJoker(tile)) return { canMahjong: false, sizes: [] };
  return { canMahjong: findWin(card, [...hand, tile], exposures) !== null, sizes: exposureOptions(card, hand, exposures, keyOf(tile)) };
}

/** After a discard, ask only the seats that have a legal call; everyone else passes automatically. */
function openClaims(card: Card, state: GameState, from: Seat, tile: number, events: GameEvent[]) {
  if (isJoker(tile)) return nextTurn(card, state, from, events);
  const responses = SEATS.map((s): ClaimResponse | null => {
    if (s === from) return { type: 'pass' };
    const { canMahjong, sizes } = claimOptions(card, state, s, tile);
    return canMahjong || sizes.length > 0 ? null : { type: 'pass' };
  });
  if (responses.every((r) => r !== null)) return nextTurn(card, state, from, events);
  state.phase = { kind: 'claim', tile, from, responses };
}

/** Mahjong beats an exposure; ties go to the next player in turn order after the discarder. */
function resolveClaims(card: Card, state: GameState, events: GameEvent[]) {
  const phase = state.phase;
  if (phase.kind !== 'claim') return;
  const order = [1, 2, 3].map((k) => ((phase.from + k) % 4) as Seat);
  const winner = order.find((s) => phase.responses[s]?.type === 'mahjong');
  if (winner !== undefined) {
    const p = state.players[winner]!;
    state.discards.pop();
    p.hand.push(phase.tile);
    const win = findWin(card, p.hand, p.exposures);
    if (!win) throw new GameError('not_mahjong', 'That tile does not complete a hand on the card.');
    return finish(state, winner, phase.from, win, events);
  }
  const caller = order.find((s) => phase.responses[s]?.type === 'expose');
  if (caller !== undefined) {
    const size = (phase.responses[caller] as { type: 'expose'; size: number }).size;
    const p = state.players[caller]!;
    const key = keyOf(phase.tile);
    state.discards.pop();
    const naturals = p.hand.filter((t) => !isJoker(t) && keyOf(t) === key);
    const jokers = p.hand.filter(isJoker);
    const used = [...naturals, ...jokers].slice(0, size - 1);
    for (const t of used) takeFrom(p.hand, t);
    p.exposures.push({ key, tiles: [phase.tile, ...used] });
    events.push({ type: 'call', seat: caller, tile: phase.tile, size });
    state.phase = { kind: 'turn', seat: caller, drawn: null };
    afterPublicChange(card, state, caller, events);
    return;
  }
  nextTurn(card, state, phase.from, events);
}

/**
 * Marks every hand that has just become dead; dead lasts for the rest of the hand. Runs only
 * when no discard is waiting to be called, so everything on the floor is used up.
 */
function updateDead(card: Card, state: GameState, events: GameEvent[]) {
  const dead = (state.dead ??= [null, null, null, null]);
  for (const s of SEATS) {
    if (dead[s]) continue;
    const reason = deadHandReason(card, state, s, null);
    if (!reason) continue;
    dead[s] = reason;
    events.push({ type: 'dead-hand', seat: s, reason });
  }
}

/** Something new is face up during `seat`'s turn. If that leaves the seat dead, play moves on. */
function afterPublicChange(card: Card, state: GameState, seat: Seat, events: GameEvent[]) {
  updateDead(card, state, events);
  if (isDead(state, seat)) nextTurn(card, state, seat, events);
}

/** The next seat after `from` whose hand is still live (`from` itself if it's the last), or null. */
function nextLiveSeat(state: GameState, from: Seat): Seat | null {
  for (let k = 1; k <= 4; k++) {
    const seat = ((from + k) % 4) as Seat;
    if (!isDead(state, seat)) return seat;
  }
  return null;
}

/**
 * Play moves on from `from` (its discard window has closed, or its hand just died): the
 * next live seat draws, skipping dead hands.
 */
function nextTurn(card: Card, state: GameState, from: Seat, events: GameEvent[]) {
  updateDead(card, state, events);
  const seat = nextLiveSeat(state, from);
  const tile = seat === null ? undefined : state.wall.pop();
  // A wall game when nothing is left to draw, or nobody is left who could win.
  if (seat === null || tile === undefined) {
    state.phase = { kind: 'ended' };
    state.result = { kind: 'wall', winner: null, from: null, handId: null, pattern: null, assignment: null, value: 0, jokerless: false, payments: [0, 0, 0, 0] };
    events.push({ type: 'wall-game' });
    return;
  }
  state.players[seat]!.hand.push(tile);
  state.turns += 1;
  state.phase = { kind: 'turn', seat, drawn: tile };
  events.push({ type: 'draw', seat });
}

function finish(state: GameState, winner: Seat, from: Seat | null, win: NonNullable<ReturnType<typeof findWin>>, events: GameEvent[]) {
  const hasJokerableGroup = win.concrete.groups.some((g) => g.jokerable);
  const value = win.concrete.hand.value * (win.jokerless && hasJokerableGroup ? 2 : 1);
  const payments = [0, 0, 0, 0];
  for (const s of SEATS) {
    if (s === winner) continue;
    const owed = from === null || s === from ? value * 2 : value;
    payments[s] = -owed;
    payments[winner] = (payments[winner] ?? 0) + owed;
  }
  state.phase = { kind: 'ended' };
  state.result = {
    kind: 'mahjong',
    winner,
    from,
    handId: win.concrete.hand.id,
    pattern: win.concrete.hand.pattern,
    assignment: win.concrete.label,
    value,
    jokerless: win.jokerless,
    payments,
  };
  events.push({ type: 'mahjong', seat: winner, from });
}

// ---------------------------------------------------------------------------
// What one seat is allowed to see and do.

export type Prompt =
  | { type: 'charleston-pass'; direction: PassDirection; round: 1 | 2; count: 3 }
  | { type: 'charleston-vote' }
  | { type: 'courtesy-count' }
  | { type: 'courtesy-pass'; count: number }
  | { type: 'turn'; canMahjong: boolean; exchanges: { tile: number; target: Seat; exposure: number }[] }
  | { type: 'claim'; tile: number; from: Seat; sizes: number[]; canMahjong: boolean };

export type PublicPhase =
  | { kind: 'charleston'; round: 1 | 2; direction: PassDirection; waitingFor: Seat[] }
  | { kind: 'charleston-vote'; waitingFor: Seat[] }
  | { kind: 'courtesy-count'; waitingFor: Seat[] }
  | { kind: 'courtesy-select'; waitingFor: Seat[] }
  /** `drew`: the seat drew from the wall this turn (rather than calling a discard), as everyone sees. */
  | { kind: 'turn'; seat: Seat; drew: boolean }
  | { kind: 'claim'; tile: number; from: Seat }
  | { kind: 'ended' };

export interface PlayerView {
  seat: Seat;
  phase: PublicPhase;
  hand: number[];
  drawn: number | null;
  /** Every seat's public information. `dead` is why a seat's hand is dead (it's public), or null. */
  players: { seat: Seat; handCount: number; exposures: Exposure[]; dead: DeadReason | null }[];
  discards: { tile: number; seat: Seat }[];
  wallCount: number;
  prompt: Prompt | null;
  /** True once this seat has acted in a simultaneous step (Charleston, votes). */
  submitted: boolean;
  result: (GameResult & { hands: number[][] }) | null;
}

export function playerView(card: Card, state: GameState, seat: Seat): PlayerView {
  const me = state.players[seat]!;
  const p = state.phase;
  const waiting = pendingSeats(state);
  const publicPhase: PublicPhase =
    p.kind === 'charleston'
      ? { kind: 'charleston', round: p.round, direction: currentDirection(p)!, waitingFor: waiting }
      : p.kind === 'charleston-vote'
        ? { kind: 'charleston-vote', waitingFor: waiting }
        : p.kind === 'courtesy-count'
          ? { kind: 'courtesy-count', waitingFor: waiting }
          : p.kind === 'courtesy-select'
            ? { kind: 'courtesy-select', waitingFor: waiting }
            : p.kind === 'turn'
              ? { kind: 'turn', seat: p.seat, drew: p.drawn !== null }
              : p.kind === 'claim'
                ? { kind: 'claim', tile: p.tile, from: p.from }
                : { kind: 'ended' };

  return {
    seat,
    phase: publicPhase,
    hand: [...me.hand],
    drawn: p.kind === 'turn' && p.seat === seat ? p.drawn : null,
    players: SEATS.map((s) => ({
      seat: s,
      handCount: state.players[s]!.hand.length,
      exposures: structuredClone(state.players[s]!.exposures),
      dead: structuredClone(deadReason(state, s)),
    })),
    discards: [...state.discards],
    wallCount: state.wall.length,
    prompt: waiting.includes(seat) ? promptFor(card, state, seat) : null,
    submitted: !waiting.includes(seat) && p.kind !== 'turn' && p.kind !== 'claim' && p.kind !== 'ended',
    result: state.result ? { ...state.result, hands: state.players.map((pl) => [...pl.hand]) } : null,
  };
}

export function promptFor(card: Card, state: GameState, seat: Seat): Prompt | null {
  const p = state.phase;
  const me = state.players[seat]!;
  // A dead hand sits out the rest of the hand: no turns, no calls.
  if (isDead(state, seat)) return null;
  switch (p.kind) {
    case 'charleston':
      return { type: 'charleston-pass', direction: currentDirection(p)!, round: p.round, count: 3 };
    case 'charleston-vote':
      return { type: 'charleston-vote' };
    case 'courtesy-count':
      return { type: 'courtesy-count' };
    case 'courtesy-select':
      return { type: 'courtesy-pass', count: p.sizes[seat]! };
    case 'turn': {
      if (p.seat !== seat) return null;
      const exchanges: { tile: number; target: Seat; exposure: number }[] = [];
      for (const target of SEATS) {
        state.players[target]!.exposures.forEach((e, exposure) => {
          if (!e.tiles.some(isJoker)) return;
          const tile = me.hand.find((t) => !isJoker(t) && keyOf(t) === e.key);
          if (tile !== undefined) exchanges.push({ tile, target, exposure });
        });
      }
      return { type: 'turn', canMahjong: findWin(card, me.hand, me.exposures) !== null, exchanges };
    }
    case 'claim': {
      const { sizes, canMahjong } = claimOptions(card, state, seat, p.tile);
      return { type: 'claim', tile: p.tile, from: p.from, sizes, canMahjong };
    }
    case 'ended':
      return null;
  }
}
