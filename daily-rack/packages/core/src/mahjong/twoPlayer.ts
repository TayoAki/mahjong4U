import type { Card, ConcreteGroup, ConcreteHand } from './card.ts';
import { deadReasonFrom, type DeadReason } from './dead.ts';
import { GameError } from './game.ts';
import { eachHandFittingExposures, exposureOptions, findWin, type Exposure } from './match.ts';
import { isJoker, keyOf, shuffledWall } from './set.ts';

// Two-player mahjong, our house rules (written up for players in the app's "Two-player
// rules" sheet and for developers in docs/TWO-PLAYER.md). Two players share the whole
// 152-tile wall. Each holds 27 tiles and builds two hands from the same card at once: the
// concealed tiles are one pool, split however the player likes, and every exposure belongs
// to hand 1 or hand 2. There is no Charleston. Declaring Mahjong locks one hand; the game
// ends with a player's second Mahjong, or when the wall runs out.
//
// Like game.ts this is a pure state machine: applyTwoPlayerAction(card, state, seat, action)
// returns the next state. Seat 0 is East and starts by drawing a 28th tile.

export type TwoSeat = 0 | 1;
export const TWO_SEATS: readonly TwoSeat[] = [0, 1];
export const TWO_PLAYER_WINDS = ['East', 'West'] as const;

/** Which of a player's two hands: 0 is "Hand 1", 1 is "Hand 2". */
export type HandSlot = 0 | 1;
export const HAND_SLOTS: readonly HandSlot[] = [0, 1];

/** Tiles each player is dealt; East draws one more to start. */
export const TWO_PLAYER_DEAL = 27;

export type TwoPlayerClaim = { type: 'pass' } | { type: 'expose'; hand: HandSlot; size: number } | { type: 'mahjong'; hand: HandSlot };

export type TwoPlayerPhase =
  | { kind: 'turn'; seat: TwoSeat; drawn: number | null }
  /** Only the other player can call a discard, so there is one answer to wait for. */
  | { kind: 'claim'; tile: number; from: TwoSeat; response: TwoPlayerClaim | null }
  | { kind: 'ended' };

export interface TwoPlayerHand {
  exposures: Exposure[];
  /** The concealed tiles laid down when this hand was declared Mahjong; null while it's in play. */
  shown: number[] | null;
  /** Why this hand can no longer win, judged from what is face up; null while it can. */
  dead: DeadReason | null;
}

export interface TwoPlayerMahjong {
  seat: TwoSeat;
  hand: HandSlot;
  /** Seat whose discard completed the hand; null when self-drawn. */
  from: TwoSeat | null;
  handId: string;
  pattern: string;
  assignment: string;
  jokerless: boolean;
  /** What the other player pays: the card value, doubled when jokerless, doubled again when final. */
  value: number;
  /** The player's second Mahjong, which ends the game. */
  final: boolean;
}

/**
 * How a game ended. The fields shared with GameResult describe the game-ending Mahjong (or
 * are empty for a wall game), so tables and stats treat both kinds of game alike.
 */
export interface TwoPlayerResult {
  kind: 'mahjong' | 'wall';
  winner: TwoSeat | null;
  from: TwoSeat | null;
  handId: string | null;
  pattern: string | null;
  assignment: string | null;
  value: number;
  jokerless: boolean;
  /** Points won (+) or paid (-) by each seat over every Mahjong this game. They sum to zero. */
  payments: number[];
  mahjongs: TwoPlayerMahjong[];
}

export interface TwoPlayerState {
  v: 1;
  variant: 'two-player';
  cardId: string;
  seed: number;
  wall: number[];
  /** `concealed` is the player's pool of hidden tiles, shared by both hands. */
  players: { concealed: number[]; hands: TwoPlayerHand[] }[];
  discards: { tile: number; seat: TwoSeat }[];
  phase: TwoPlayerPhase;
  turns: number;
  mahjongs: TwoPlayerMahjong[];
  result: TwoPlayerResult | null;
}

export type TwoPlayerAction =
  | { type: 'discard'; tile: number }
  | { type: 'exchange-joker'; tile: number; target: TwoSeat; hand: HandSlot; exposure: number }
  /** `tiles`: the concealed tiles to lay down with the hand's exposures; the best fit is found if left out. */
  | { type: 'declare-mahjong'; hand: HandSlot; tiles?: number[] }
  | { type: 'claim'; response: TwoPlayerClaim };

export type TwoPlayerEvent =
  | { type: 'play-started' }
  | { type: 'draw'; seat: TwoSeat }
  | { type: 'discard'; seat: TwoSeat; tile: number }
  | { type: 'call'; seat: TwoSeat; tile: number; size: number; hand: HandSlot }
  | { type: 'exchange'; seat: TwoSeat; target: TwoSeat; tile: number; hand: HandSlot }
  | { type: 'mahjong'; seat: TwoSeat; from: TwoSeat | null; hand: HandSlot; final: boolean; value: number }
  | { type: 'dead-hand'; seat: TwoSeat; reason: DeadReason; hand: HandSlot }
  | { type: 'wall-game' };

export const otherSeat = (seat: TwoSeat): TwoSeat => (seat === 0 ? 1 : 0);

export function newTwoPlayerGame(card: Card, options: { seed: number }): TwoPlayerState {
  const wall = shuffledWall(options.seed);
  const players = TWO_SEATS.map(() => ({ concealed: [] as number[], hands: HAND_SLOTS.map((): TwoPlayerHand => ({ exposures: [], shown: null, dead: null })) }));
  for (let i = 0; i < TWO_PLAYER_DEAL; i++) for (const p of players) p.concealed.push(wall.pop()!);
  // East draws a 28th tile and opens with a discard.
  const first = wall.pop()!;
  players[0]!.concealed.push(first);
  return {
    v: 1,
    variant: 'two-player',
    cardId: card.id,
    seed: options.seed,
    wall,
    players,
    discards: [],
    phase: { kind: 'turn', seat: 0, drawn: first },
    turns: 0,
    mahjongs: [],
    result: null,
  };
}

export function isTwoPlayerState(state: unknown): state is TwoPlayerState {
  return (state as TwoPlayerState | null)?.variant === 'two-player';
}

/** Seats that must act before the game can move on. A player whose hands can't win still plays. */
export function twoPlayerPendingSeats(state: TwoPlayerState): TwoSeat[] {
  const p = state.phase;
  if (p.kind === 'turn') return [p.seat];
  if (p.kind === 'claim') return p.response === null ? [otherSeat(p.from)] : [];
  return [];
}

/** Identifies one step of the game, in the same form as phaseKey for four players. */
export function twoPlayerPhaseKey(phase: TwoPlayerPhase | TwoPlayerPublicPhase): string {
  return phase.kind === 'claim' ? `claim:${phase.tile}` : phase.kind;
}

/** A hand can still be won: not declared yet, and not dead. */
export function isLiveHand(hand: TwoPlayerHand | TwoPlayerHandView): boolean {
  return hand.shown === null && hand.dead === null;
}

// ---------------------------------------------------------------------------
// Finding a Mahjong inside a bigger pool of tiles.

export interface PoolWin {
  concrete: ConcreteHand;
  jokerless: boolean;
  /** The concealed tiles that complete the hand with its exposures. */
  tiles: number[];
  /** What the hand is worth before any double for being the game-ending Mahjong. */
  points: number;
}

/** Card value, doubled for a jokerless hand that could have held jokers (as at four players). */
export function mahjongPoints(concrete: ConcreteHand, jokerless: boolean): number {
  return concrete.hand.value * (jokerless && concrete.groups.some((g) => g.jokerable) ? 2 : 1);
}

/**
 * Picks the concealed tiles for one concrete hand from a pool, or null if the pool can't make
 * it. Pairs and singles take naturals first, since jokers can't stand in for them; groups of
 * three or more take naturals and then jokers, or jokers first with `jokersFirst` (to keep
 * naturals for another hand).
 */
function pick(remaining: readonly ConcreteGroup[], naturals: ReadonlyMap<string, readonly number[]>, jokers: readonly number[], jokersFirst = false): number[] | null {
  const used = new Map<string, number>();
  const tiles: number[] = [];
  let j = 0;
  const order = [...remaining].sort((a, b) => Number(a.jokerable) - Number(b.jokerable));
  for (const g of order) {
    const pool = naturals.get(g.face) ?? [];
    let k = used.get(g.face) ?? 0;
    let n = 0;
    if (jokersFirst && g.jokerable) {
      // Keep one natural in the group, so a group is never only jokers.
      if (k < pool.length) {
        tiles.push(pool[k++]!);
        n++;
      }
      while (n < g.n && j < jokers.length) {
        tiles.push(jokers[j++]!);
        n++;
      }
    }
    while (n < g.n && k < pool.length) {
      tiles.push(pool[k++]!);
      n++;
    }
    while (n < g.n && g.jokerable && j < jokers.length) {
      tiles.push(jokers[j++]!);
      n++;
    }
    used.set(g.face, k);
    if (n < g.n) return null;
  }
  return tiles;
}

/**
 * The most valuable Mahjong one hand can lay down from a pool of concealed tiles, counting
 * that hand's exposures, or null. `must` is a tile that has to be part of it (a discard being
 * called). Among equal values the one using fewer jokers wins.
 */
export function bestWinFrom(
  card: Card,
  pool: readonly number[],
  exposures: readonly Exposure[],
  options: { must?: number; jokersFirst?: boolean } = {},
): PoolWin | null {
  const exposed = exposures.reduce((n, e) => n + e.tiles.length, 0);
  if (pool.length < 14 - exposed) return null;
  const naturals = new Map<string, number[]>();
  const jokers: number[] = [];
  for (const t of pool) {
    if (isJoker(t)) jokers.push(t);
    else if (t === options.must) naturals.set(keyOf(t), [t, ...(naturals.get(keyOf(t)) ?? [])]);
    else naturals.set(keyOf(t), [...(naturals.get(keyOf(t)) ?? []), t]);
  }
  const mustKey = options.must === undefined ? null : keyOf(options.must);
  const exposedJoker = exposures.some((e) => e.tiles.some(isJoker));
  let best: PoolWin | null = null;
  let bestJokers = Infinity;
  for (const { concrete, remaining } of eachHandFittingExposures(card, exposures)) {
    if (mustKey !== null && !remaining.some((g) => g.face === mustKey)) continue;
    // A quick count first: most hands are nowhere near.
    if (remaining.some((g) => !g.jokerable && (naturals.get(g.face)?.length ?? 0) < g.n)) continue;
    const tiles = pick(remaining, naturals, jokers, options.jokersFirst);
    if (!tiles) continue;
    const used = tiles.filter(isJoker).length;
    const jokerless = used === 0 && !exposedJoker;
    const points = mahjongPoints(concrete, jokerless);
    if (!best || points > best.points || (points === best.points && used < bestJokers)) {
      best = { concrete, jokerless, tiles, points };
      bestJokers = used;
    }
  }
  return best;
}

// ---------------------------------------------------------------------------
// Moves.

export function applyTwoPlayerAction(card: Card, input: TwoPlayerState, seat: TwoSeat, action: TwoPlayerAction): { state: TwoPlayerState; events: TwoPlayerEvent[] } {
  if (card.id !== input.cardId) throw new GameError('wrong_card', 'This game was dealt with a different card.');
  const state = structuredClone(input);
  const events: TwoPlayerEvent[] = [];
  const phase = state.phase;
  const me = state.players[seat];
  if (!me) throw new GameError('bad_seat', 'There is no such seat.');
  const wrongTime = () => new GameError('not_now', 'That move is not available right now.');
  const myTurn = () => {
    if (phase.kind !== 'turn' || phase.seat !== seat) throw wrongTime();
  };

  switch (action.type) {
    case 'discard': {
      myTurn();
      takeFrom(me.concealed, action.tile);
      state.discards.push({ tile: action.tile, seat });
      events.push({ type: 'discard', seat, tile: action.tile });
      openClaim(card, state, seat, action.tile, events);
      break;
    }
    case 'exchange-joker': {
      myTurn();
      if (isJoker(action.tile) || !me.concealed.includes(action.tile)) throw new GameError('bad_tile', 'Exchange a natural tile from your hand.');
      const hand = state.players[action.target]?.hands[action.hand];
      const exposure = hand?.exposures[action.exposure];
      if (!hand || !exposure) throw new GameError('bad_exposure', 'That exposure does not exist.');
      if (hand.shown) throw new GameError('hand_declared', 'That hand is already Mahjong, so its jokers stay where they are.');
      if (exposure.key !== keyOf(action.tile)) throw new GameError('bad_exchange', 'Your tile must match the exposed group.');
      const jokerIndex = exposure.tiles.findIndex(isJoker);
      if (jokerIndex === -1) throw new GameError('no_joker', 'That exposure has no joker to take.');
      const joker = exposure.tiles[jokerIndex]!;
      exposure.tiles[jokerIndex] = action.tile;
      takeFrom(me.concealed, action.tile);
      me.concealed.push(joker);
      events.push({ type: 'exchange', seat, target: action.target, tile: action.tile, hand: action.hand });
      updateDead(card, state, events);
      break;
    }
    case 'declare-mahjong': {
      myTurn();
      const hand = handOf(me, action.hand);
      let win: PoolWin | null;
      if (action.tiles) {
        if (new Set(action.tiles).size !== action.tiles.length || action.tiles.some((t) => !me.concealed.includes(t))) {
          throw new GameError('bad_tile', 'Lay down tiles from your own hand.');
        }
        const found = findWin(card, action.tiles, hand.exposures);
        win = found ? { ...found, tiles: [...action.tiles], points: mahjongPoints(found.concrete, found.jokerless) } : null;
      } else {
        win = bestWinFrom(card, me.concealed, hand.exposures);
      }
      if (!win) throw new GameError('not_mahjong', 'Those tiles do not make a hand on the card yet.');
      declare(state, seat, action.hand, null, win, events);
      // The first Mahjong doesn't end the turn: the player goes on to discard.
      if (state.phase.kind !== 'ended') {
        state.phase = { kind: 'turn', seat, drawn: null };
        updateDead(card, state, events);
      }
      break;
    }
    case 'claim': {
      if (phase.kind !== 'claim' || phase.from === seat || phase.response !== null) throw wrongTime();
      const response = action.response;
      if (response.type !== 'pass') {
        const option = twoPlayerClaimOptions(card, state, seat, phase.tile).find((o) => o.hand === response.hand);
        if (response.type === 'expose' && !option?.sizes.includes(response.size)) {
          throw new GameError('bad_call', 'You cannot expose that group on that hand with this tile.');
        }
        if (response.type === 'mahjong' && !option?.canMahjong) {
          throw new GameError('not_mahjong', 'That tile does not complete that hand.');
        }
      }
      phase.response = response;
      resolveClaim(card, state, events);
      break;
    }
    default:
      throw new GameError('bad_action', 'That move is not part of a two-player game.');
  }
  return { state, events };
}

function handOf(player: TwoPlayerState['players'][number], slot: HandSlot): TwoPlayerHand {
  const hand = player.hands[slot];
  if (!hand) throw new GameError('bad_hand', 'Choose hand 1 or hand 2.');
  if (hand.shown) throw new GameError('hand_declared', 'That hand is already Mahjong.');
  if (hand.dead) throw new GameError('dead_hand', 'That hand is dead, so it can’t win.');
  return hand;
}

function takeFrom(tiles: number[], tile: number) {
  const i = tiles.indexOf(tile);
  if (i === -1) throw new GameError('bad_tile', 'That tile is not in your hand.');
  tiles.splice(i, 1);
}

/** Lays a hand down as Mahjong and scores it. A player's second Mahjong ends the game. */
function declare(state: TwoPlayerState, seat: TwoSeat, slot: HandSlot, from: TwoSeat | null, win: PoolWin, events: TwoPlayerEvent[]) {
  const me = state.players[seat]!;
  for (const t of win.tiles) takeFrom(me.concealed, t);
  me.hands[slot]!.shown = [...win.tiles];
  const final = state.mahjongs.some((m) => m.seat === seat);
  const mahjong: TwoPlayerMahjong = {
    seat,
    hand: slot,
    from,
    handId: win.concrete.hand.id,
    pattern: win.concrete.hand.pattern,
    assignment: win.concrete.label,
    jokerless: win.jokerless,
    value: win.points * (final ? 2 : 1),
    final,
  };
  state.mahjongs.push(mahjong);
  events.push({ type: 'mahjong', seat, from, hand: slot, final, value: mahjong.value });
  if (final) finish(state, mahjong, events);
}

/** Every Mahjong's value moves from the other player to the one who declared it. */
export function twoPlayerPayments(mahjongs: readonly TwoPlayerMahjong[]): number[] {
  const payments = [0, 0];
  for (const m of mahjongs) {
    payments[m.seat] = payments[m.seat]! + m.value;
    payments[otherSeat(m.seat)] = payments[otherSeat(m.seat)]! - m.value;
  }
  return payments;
}

function finish(state: TwoPlayerState, last: TwoPlayerMahjong | null, events: TwoPlayerEvent[]) {
  state.phase = { kind: 'ended' };
  const payments = twoPlayerPayments(state.mahjongs);
  const mahjongs = structuredClone(state.mahjongs);
  state.result = last
    ? { kind: 'mahjong', winner: last.seat, from: last.from, handId: last.handId, pattern: last.pattern, assignment: last.assignment, value: last.value, jokerless: last.jokerless, payments, mahjongs }
    : { kind: 'wall', winner: null, from: null, handId: null, pattern: null, assignment: null, value: 0, jokerless: false, payments, mahjongs };
  if (!last) events.push({ type: 'wall-game' });
}

export interface TwoPlayerClaimOption {
  hand: HandSlot;
  /** The tile completes this hand, so it can be called for Mahjong. */
  canMahjong: boolean;
  /** Sizes of group the player could expose on this hand with the tile. */
  sizes: number[];
}

/**
 * What a player could do with the other player's discard, hand by hand. Jokers can't be
 * called, and declared or dead hands take nothing.
 */
export function twoPlayerClaimOptions(card: Card, state: Pick<TwoPlayerState, 'players'>, seat: TwoSeat, tile: number): TwoPlayerClaimOption[] {
  const p = state.players[seat]!;
  return twoPlayerClaimOptionsFor(card, p.concealed, p.hands, tile);
}

/** twoPlayerClaimOptions for a pool of concealed tiles and its two hands (a player's view has both). */
export function twoPlayerClaimOptionsFor(card: Card, concealed: readonly number[], hands: readonly (TwoPlayerHand | TwoPlayerHandView)[], tile: number): TwoPlayerClaimOption[] {
  if (isJoker(tile)) return [];
  const options: TwoPlayerClaimOption[] = [];
  for (const slot of HAND_SLOTS) {
    const hand = hands[slot]!;
    if (!isLiveHand(hand)) continue;
    const canMahjong = bestWinFrom(card, [...concealed, tile], hand.exposures, { must: tile }) !== null;
    const sizes = exposureOptions(card, concealed, hand.exposures, keyOf(tile));
    if (canMahjong || sizes.length > 0) options.push({ hand: slot, canMahjong, sizes });
  }
  return options;
}

/** After a discard, the other player gets a chance to call it only if they have a legal call. */
function openClaim(card: Card, state: TwoPlayerState, from: TwoSeat, tile: number, events: TwoPlayerEvent[]) {
  if (twoPlayerClaimOptions(card, state, otherSeat(from), tile).length > 0) {
    state.phase = { kind: 'claim', tile, from, response: null };
    return;
  }
  nextTurn(card, state, from, events);
}

function resolveClaim(card: Card, state: TwoPlayerState, events: TwoPlayerEvent[]) {
  const phase = state.phase;
  if (phase.kind !== 'claim' || !phase.response) return;
  const response = phase.response;
  if (response.type === 'pass') return nextTurn(card, state, phase.from, events);
  const seat = otherSeat(phase.from);
  const p = state.players[seat]!;
  state.discards.pop();
  if (response.type === 'mahjong') {
    p.concealed.push(phase.tile);
    const win = bestWinFrom(card, p.concealed, p.hands[response.hand]!.exposures, { must: phase.tile });
    if (!win) throw new GameError('not_mahjong', 'That tile does not complete that hand.');
    declare(state, seat, response.hand, phase.from, win, events);
    if (state.phase.kind === 'ended') return;
  } else {
    const key = keyOf(phase.tile);
    const naturals = p.concealed.filter((t) => !isJoker(t) && keyOf(t) === key);
    const used = [...naturals, ...p.concealed.filter(isJoker)].slice(0, response.size - 1);
    for (const t of used) takeFrom(p.concealed, t);
    p.hands[response.hand]!.exposures.push({ key, tiles: [phase.tile, ...used] });
    events.push({ type: 'call', seat, tile: phase.tile, size: response.size, hand: response.hand });
  }
  // Calling takes the place of drawing: the caller discards next.
  state.phase = { kind: 'turn', seat, drawn: null };
  updateDead(card, state, events);
}

/** Natural tiles face up for both players: discards, exposures and declared hands. */
export function twoPlayerVisibleCounts(state: Pick<TwoPlayerState, 'discards'> & { players: { hands: (TwoPlayerHand | TwoPlayerHandView)[] }[] }, liveTile: number | null = null): Map<string, number> {
  const counts = new Map<string, number>();
  const add = (t: number) => {
    if (isJoker(t) || t === liveTile) return;
    counts.set(keyOf(t), (counts.get(keyOf(t)) ?? 0) + 1);
  };
  for (const d of state.discards) add(d.tile);
  for (const p of state.players) {
    for (const h of p.hands) {
      for (const e of h.exposures) for (const t of e.tiles) add(t);
      for (const t of h.shown ?? []) add(t);
    }
  }
  return counts;
}

/** Marks every hand that has just become dead, using the four-player rules hand by hand. */
function updateDead(card: Card, state: TwoPlayerState, events: TwoPlayerEvent[]) {
  const seen = twoPlayerVisibleCounts(state);
  for (const seat of TWO_SEATS) {
    for (const slot of HAND_SLOTS) {
      const hand = state.players[seat]!.hands[slot]!;
      if (!isLiveHand(hand)) continue;
      const reason = deadReasonFrom(card, hand.exposures, seen);
      if (!reason) continue;
      hand.dead = reason;
      events.push({ type: 'dead-hand', seat, reason, hand: slot });
    }
  }
}

/** The other player draws, unless the wall is empty or neither player can win another hand. */
function nextTurn(card: Card, state: TwoPlayerState, from: TwoSeat, events: TwoPlayerEvent[]) {
  updateDead(card, state, events);
  const anyLive = state.players.some((p) => p.hands.some(isLiveHand));
  const seat = otherSeat(from);
  const tile = anyLive ? state.wall.pop() : undefined;
  if (tile === undefined) return finish(state, null, events);
  state.players[seat]!.concealed.push(tile);
  state.turns += 1;
  state.phase = { kind: 'turn', seat, drawn: tile };
  events.push({ type: 'draw', seat });
}

// ---------------------------------------------------------------------------
// What one player is allowed to see and do.

export interface TwoPlayerExchange {
  tile: number;
  target: TwoSeat;
  hand: HandSlot;
  exposure: number;
}

export type TwoPlayerPrompt =
  /** `mahjong`: hands that can be declared now. */
  | { type: 'turn'; mahjong: HandSlot[]; exchanges: TwoPlayerExchange[] }
  | { type: 'claim'; tile: number; from: TwoSeat; options: TwoPlayerClaimOption[] };

/** Matches the four-player PublicPhase shapes, so shared helpers read both. */
export type TwoPlayerPublicPhase = { kind: 'turn'; seat: TwoSeat; drew: boolean } | { kind: 'claim'; tile: number; from: TwoSeat } | { kind: 'ended' };

export type TwoPlayerHandView = TwoPlayerHand;

export interface TwoPlayerView {
  variant: 'two-player';
  seat: TwoSeat;
  phase: TwoPlayerPublicPhase;
  /** Your concealed tiles: one pool for both hands. */
  concealed: number[];
  drawn: number | null;
  /** Both players' public information: how many tiles they hide, and each hand's exposures. */
  players: { seat: TwoSeat; concealedCount: number; hands: TwoPlayerHandView[] }[];
  discards: { tile: number; seat: TwoSeat }[];
  wallCount: number;
  prompt: TwoPlayerPrompt | null;
  mahjongs: TwoPlayerMahjong[];
  /** Points so far this game. */
  payments: number[];
  /** With everyone's concealed tiles once the game is over. */
  result: (TwoPlayerResult & { concealed: number[][] }) | null;
}

export function twoPlayerView(card: Card, state: TwoPlayerState, seat: TwoSeat): TwoPlayerView {
  const me = state.players[seat]!;
  const p = state.phase;
  const waiting = twoPlayerPendingSeats(state);
  return {
    variant: 'two-player',
    seat,
    phase: p.kind === 'turn' ? { kind: 'turn', seat: p.seat, drew: p.drawn !== null } : p.kind === 'claim' ? { kind: 'claim', tile: p.tile, from: p.from } : { kind: 'ended' },
    concealed: [...me.concealed],
    drawn: p.kind === 'turn' && p.seat === seat ? p.drawn : null,
    players: TWO_SEATS.map((s) => ({ seat: s, concealedCount: state.players[s]!.concealed.length, hands: structuredClone(state.players[s]!.hands) })),
    discards: [...state.discards],
    wallCount: state.wall.length,
    prompt: waiting.includes(seat) ? twoPlayerPrompt(card, state, seat) : null,
    mahjongs: structuredClone(state.mahjongs),
    payments: twoPlayerPayments(state.mahjongs),
    result: state.result ? { ...structuredClone(state.result), concealed: state.players.map((pl) => [...pl.concealed]) } : null,
  };
}

export function twoPlayerPrompt(card: Card, state: TwoPlayerState, seat: TwoSeat): TwoPlayerPrompt | null {
  const p = state.phase;
  const me = state.players[seat]!;
  if (p.kind === 'turn') {
    if (p.seat !== seat) return null;
    const exchanges: TwoPlayerExchange[] = [];
    for (const target of TWO_SEATS) {
      state.players[target]!.hands.forEach((h, slot) => {
        if (h.shown) return;
        h.exposures.forEach((e, exposure) => {
          if (!e.tiles.some(isJoker)) return;
          const tile = me.concealed.find((t) => !isJoker(t) && keyOf(t) === e.key);
          if (tile !== undefined) exchanges.push({ tile, target, hand: slot as HandSlot, exposure });
        });
      });
    }
    const mahjong = HAND_SLOTS.filter((slot) => isLiveHand(me.hands[slot]!) && bestWinFrom(card, me.concealed, me.hands[slot]!.exposures) !== null);
    return { type: 'turn', mahjong, exchanges };
  }
  if (p.kind === 'claim') {
    if (p.from === seat || p.response !== null) return null;
    return { type: 'claim', tile: p.tile, from: p.from, options: twoPlayerClaimOptions(card, state, seat, p.tile) };
  }
  return null;
}
