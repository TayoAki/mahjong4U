import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  HOUSE_CARD,
  TILE_FACES,
  applyTwoPlayerAction,
  bestWinFrom,
  cardFromSpec,
  keyOf,
  newTwoPlayerGame,
  planSplit,
  rng,
  suggestTwoPlayerDiscard,
  twoPlayerBotAction,
  twoPlayerClaimOptions,
  twoPlayerHints,
  twoPlayerPendingSeats,
  twoPlayerView,
  type BotLevel,
  type Card,
  type CardSpec,
  type TwoPlayerAction,
  type TwoPlayerEvent,
  type TwoPlayerMahjong,
  type TwoPlayerState,
  type TwoSeat,
} from './index.ts';

const card = HOUSE_CARD;
const card2026 = cardFromSpec(JSON.parse(readFileSync(join(import.meta.dirname, '../../../../content/cards/card-2026.json'), 'utf8')) as CardSpec);

/** Picks unused tile ids by face so tests can build exact hands. */
function picker() {
  const used = new Set<number>();
  const pick = (face: string, n = 1): number[] => {
    const out: number[] = [];
    for (let t = 0; t < TILE_FACES.length && out.length < n; t++) {
      const f = TILE_FACES[t]!;
      const matches = face === 'FLOWER' ? f.startsWith('FLOWER_') : f === face;
      if (matches && !used.has(t)) {
        used.add(t);
        out.push(t);
      }
    }
    if (out.length < n) throw new Error(`not enough ${face}`);
    return out;
  };
  /** One tile of each face not listed in `skip`, up to n tiles: a hand that can't call anything. */
  const singles = (n: number, skip: string[] = []): number[] => {
    const faces = [...new Set(TILE_FACES.filter((f) => f !== 'JOKER' && !f.startsWith('FLOWER_')))].filter((f) => !skip.includes(f));
    return faces.slice(0, n).map((f) => pick(f)[0]!);
  };
  return { pick, singles, used };
}

/** Every tile is somewhere exactly once. */
function assertConserved(state: TwoPlayerState) {
  const all = [
    ...state.wall,
    ...state.discards.map((d) => d.tile),
    ...state.players.flatMap((p) => [...p.concealed, ...p.hands.flatMap((h) => [...h.exposures.flatMap((e) => e.tiles), ...(h.shown ?? [])])]),
  ];
  expect(all).toHaveLength(152);
  expect(new Set(all).size).toBe(152);
}

/** A game in play with chosen tiles; the rest of the set is the wall, `draws` coming off it first. */
function twoState(east: number[], west: number[], { turn = 0 as TwoSeat, draws = [] as number[] } = {}): TwoPlayerState {
  const placed = new Set([...east, ...west, ...draws]);
  const rest = TILE_FACES.map((_, t) => t).filter((t) => !placed.has(t));
  return {
    v: 1,
    variant: 'two-player',
    cardId: card.id,
    seed: 1,
    wall: [...rest, ...[...draws].reverse()],
    players: [east, west].map((concealed) => ({ concealed: [...concealed], hands: [0, 1].map(() => ({ exposures: [], shown: null, dead: null })) })),
    discards: [],
    phase: { kind: 'turn', seat: turn, drawn: null },
    turns: 0,
    mahjongs: [],
    result: null,
  };
}

function act(state: TwoPlayerState, seat: TwoSeat, action: TwoPlayerAction, c: Card = card) {
  return applyTwoPlayerAction(c, state, seat, action);
}

describe('two-player: the deal', () => {
  it('deals 27 tiles each from the full set, and East draws a 28th with no Charleston', () => {
    const state = newTwoPlayerGame(card, { seed: 5 });
    expect(state.players.map((p) => p.concealed.length)).toEqual([28, 27]);
    expect(state.wall).toHaveLength(152 - 55);
    expect(state.phase).toMatchObject({ kind: 'turn', seat: 0 });
    expect(state.phase.kind === 'turn' && state.players[0]!.concealed.includes(state.phase.drawn!)).toBe(true);
    assertConserved(state);
    expect(twoPlayerPendingSeats(state)).toEqual([0]);
    expect(twoPlayerView(card, state, 0).prompt).toMatchObject({ type: 'turn' });
    // There is nothing to pass: the first move is East's discard.
    expect(() => act(state, 0, { type: 'charleston-pass', tiles: [] } as unknown as TwoPlayerAction)).toThrow();
    expect(() => act(state, 1, { type: 'discard', tile: state.players[1]!.concealed[0]! })).toThrow(/not available/);
  });

  it('shows each player only their own tiles, and the other player’s count', () => {
    const state = newTwoPlayerGame(card, { seed: 9 });
    const view = twoPlayerView(card, state, 1);
    expect(view.concealed).toEqual(state.players[1]!.concealed);
    expect(view.players.map((p) => p.concealedCount)).toEqual([28, 27]);
    expect(view.drawn).toBeNull();
    expect(view.prompt).toBeNull();
    expect(JSON.stringify(view.players)).not.toContain('concealed"');
    expect(view.concealed.some((t) => state.players[0]!.concealed.includes(t))).toBe(false);
  });
});

describe('two-player: calling a discard', () => {
  it('lets the other player call a discard onto either hand, and the exposure stays with that hand', () => {
    const { pick, singles } = picker();
    const west = [...pick('DOT_2', 2), ...singles(25, ['DOT_2'])];
    const east = [...pick('DOT_2', 1), ...singles(27, ['DOT_2']).slice(0, 27)];
    let state = twoState(east, west);
    const tile = east[0]!;
    state = act(state, 0, { type: 'discard', tile }).state;
    expect(state.phase).toMatchObject({ kind: 'claim', tile, from: 0, response: null });
    expect(twoPlayerPendingSeats(state)).toEqual([1]);
    expect(twoPlayerClaimOptions(card, state, 1, tile)).toEqual([
      { hand: 0, canMahjong: false, sizes: [3] },
      { hand: 1, canMahjong: false, sizes: [3] },
    ]);
    expect(() => act(state, 1, { type: 'claim', response: { type: 'expose', hand: 1, size: 4 } })).toThrow(/cannot expose/);
    const { state: next, events } = act(state, 1, { type: 'claim', response: { type: 'expose', hand: 1, size: 3 } });
    expect(events).toContainEqual({ type: 'call', seat: 1, tile, size: 3, hand: 1 });
    expect(next.players[1]!.hands[1]!.exposures).toEqual([{ key: 'DOT_2', tiles: [tile, ...west.slice(0, 2)] }]);
    expect(next.players[1]!.hands[0]!.exposures).toEqual([]);
    expect(next.discards).toEqual([]);
    // Calling takes the place of the draw: West discards next.
    expect(next.phase).toEqual({ kind: 'turn', seat: 1, drawn: null });
    expect(next.players[1]!.concealed).toHaveLength(25);
    const after = act(next, 1, { type: 'discard', tile: next.players[1]!.concealed.at(-1)! }).state;
    expect(after.phase).toMatchObject({ kind: 'turn', seat: 0 });
    expect(after.players[0]!.concealed).toHaveLength(28);
    assertConserved(after);
  });

  it('never offers a discarded joker, so the other player just draws', () => {
    const { pick, singles } = picker();
    // West's two jokers could make a pung of anything, but a joker can't be called.
    const west = [...pick('JOKER', 2), ...singles(25)];
    const east = [...pick('JOKER', 1), ...singles(27)];
    const state = act(twoState(east, west), 0, { type: 'discard', tile: east[0]! }).state;
    expect(state.phase).toMatchObject({ kind: 'turn', seat: 1 });
    expect(state.players[1]!.concealed).toHaveLength(28);
    expect(keyOf(state.discards[0]!.tile)).toBe('JOKER');
  });
});

describe('two-player: Mahjong', () => {
  /** FF and three kongs of 5s: ln1 on the house card, 25 points, 50 jokerless. */
  const likeFives = (pick: ReturnType<typeof picker>['pick']) => [...pick('FLOWER', 2), ...pick('DOT_5', 4), ...pick('BAMBOO_5', 4), ...pick('CHARACTER_5', 4)];
  /** NNNN EEEE WWWW SS: wd1, 25 points. */
  const winds = (pick: ReturnType<typeof picker>['pick']) => [...pick('WIND_NORTH', 4), ...pick('WIND_EAST', 4), ...pick('WIND_WEST', 4), ...pick('WIND_SOUTH', 2)];
  const skipFives = ['DOT_5', 'BAMBOO_5', 'CHARACTER_5'];

  it('locks the first hand declared, scores it, and play carries on toward the second', () => {
    const { pick, singles } = picker();
    const hand = likeFives(pick);
    const west = singles(27, skipFives);
    const east = [...hand, ...singles(14, skipFives)];
    let state = twoState(east, west);
    const view = twoPlayerView(card, state, 0);
    expect(view.prompt).toMatchObject({ type: 'turn', mahjong: [0, 1] });

    const declared = act(state, 0, { type: 'declare-mahjong', hand: 0 });
    state = declared.state;
    expect(declared.events).toContainEqual({ type: 'mahjong', seat: 0, from: null, hand: 0, final: false, value: 50 });
    expect([...state.players[0]!.hands[0]!.shown!].sort((a, b) => a - b)).toEqual([...hand].sort((a, b) => a - b));
    expect(state.mahjongs).toMatchObject([{ seat: 0, hand: 0, handId: 'ln1', jokerless: true, value: 50, final: false }]);
    expect(twoPlayerView(card, state, 1).payments).toEqual([50, -50]);
    // Still East's turn, with the other 14 tiles: discard to get down to 13.
    expect(state.phase).toEqual({ kind: 'turn', seat: 0, drawn: null });
    expect(state.players[0]!.concealed).toHaveLength(14);
    expect(() => act(state, 0, { type: 'declare-mahjong', hand: 0 })).toThrow(/already Mahjong/);
    state = act(state, 0, { type: 'discard', tile: state.players[0]!.concealed[0]! }).state;
    expect(state.phase).toMatchObject({ kind: 'turn', seat: 1 });
    expect(state.result).toBeNull();
    assertConserved(state);
  });

  it('ends the game on a player’s second Mahjong, which pays double', () => {
    const { pick, singles } = picker();
    const east = [...likeFives(pick), ...winds(pick)];
    let state = twoState(east, singles(27, [...skipFives, 'WIND_NORTH', 'WIND_EAST', 'WIND_WEST', 'WIND_SOUTH']));
    state = act(state, 0, { type: 'declare-mahjong', hand: 0 }).state;
    expect(twoPlayerView(card, state, 0).prompt).toMatchObject({ type: 'turn', mahjong: [1] });
    const { state: done, events } = act(state, 0, { type: 'declare-mahjong', hand: 1 });
    expect(events).toContainEqual({ type: 'mahjong', seat: 0, from: null, hand: 1, final: true, value: 100 });
    expect(done.phase).toEqual({ kind: 'ended' });
    expect(done.result).toMatchObject({ kind: 'mahjong', winner: 0, from: null, handId: 'wd1', value: 100, jokerless: true, payments: [150, -150] });
    expect(done.result!.mahjongs).toHaveLength(2);
    expect(() => act(done, 0, { type: 'discard', tile: done.players[0]!.concealed[0]! })).toThrow();
  });

  it('takes a discard for Mahjong of one hand, using the tiles the player chooses or the best fit', () => {
    const { pick, singles } = picker();
    const hand = likeFives(pick);
    const missing = hand.pop()!;
    // West: 13 tiles of the hand plus 14 others; East throws the last 5 Crak.
    const west = [...hand, ...singles(14, skipFives)];
    const east = [missing, ...singles(27, skipFives)];
    let state = twoState(east, west);
    state = act(state, 0, { type: 'discard', tile: missing }).state;
    expect(twoPlayerClaimOptions(card, state, 1, missing)).toEqual([
      { hand: 0, canMahjong: true, sizes: [3, 4] },
      { hand: 1, canMahjong: true, sizes: [3, 4] },
    ]);
    const { state: next, events } = act(state, 1, { type: 'claim', response: { type: 'mahjong', hand: 1 } });
    expect(events).toContainEqual({ type: 'mahjong', seat: 1, from: 0, hand: 1, final: false, value: 50 });
    expect(next.players[1]!.hands[1]!.shown).toContain(missing);
    expect(next.phase).toEqual({ kind: 'turn', seat: 1, drawn: null });
    expect(next.players[1]!.concealed).toHaveLength(14);
    assertConserved(next);

    // Declaring with chosen tiles checks exactly those tiles.
    const { pick: pick2, singles: singles2 } = picker();
    const chosen = likeFives(pick2);
    const extra = singles2(14, skipFives);
    const mine = twoState([...chosen, ...extra], singles2(27, skipFives));
    expect(() => act(mine, 0, { type: 'declare-mahjong', hand: 1, tiles: extra })).toThrow(/do not make a hand/);
    expect(act(mine, 0, { type: 'declare-mahjong', hand: 1, tiles: chosen }).state.players[0]!.hands[1]!.shown).toEqual(chosen);
  });

  it('counts a hand’s exposures toward its Mahjong, and keeps jokers out of pairs', () => {
    const { pick } = picker();
    const pool = [...pick('FLOWER', 2), ...pick('BAMBOO_5', 4), ...pick('CHARACTER_5', 3), ...pick('JOKER', 1)];
    const kong = { key: 'DOT_5', tiles: pick('DOT_5', 4) };
    const win = bestWinFrom(card, [...pool, ...pick('DOT_1', 3), ...pick('WIND_EAST', 3)], [kong]);
    expect(win?.concrete.hand.id).toBe('ln1');
    expect(win?.jokerless).toBe(false);
    expect(win?.points).toBe(25);
    expect([...win!.tiles].sort((a, b) => a - b)).toEqual([...pool].sort((a, b) => a - b));
    // A joker can't stand in for one of the flowers in the pair.
    const short = [...pick('FLOWER', 1), ...pick('JOKER', 1), ...pick('BAMBOO_2', 4)];
    expect(bestWinFrom(card, [...short, ...pool.slice(2, 9)], [kong])).toBeNull();
  });
});

describe('two-player: jokers', () => {
  it('swaps a natural for a joker in any exposure, but not in a hand already declared', () => {
    const { pick, singles } = picker();
    const east = [...pick('DOT_2', 1), ...singles(27, ['DOT_2'])];
    const west = singles(24, ['DOT_2']);
    const state = twoState(east, west);
    const joker = pick('JOKER', 1)[0]!;
    state.players[1]!.hands[0]!.exposures.push({ key: 'DOT_2', tiles: [...pick('DOT_2', 2), joker] });
    const prompt = twoPlayerView(card, state, 0).prompt;
    expect(prompt).toMatchObject({ type: 'turn', exchanges: [{ tile: east[0], target: 1, hand: 0, exposure: 0 }] });
    const { state: next, events } = act(state, 0, { type: 'exchange-joker', tile: east[0]!, target: 1, hand: 0, exposure: 0 });
    expect(events).toContainEqual({ type: 'exchange', seat: 0, target: 1, tile: east[0], hand: 0 });
    expect(next.players[0]!.concealed).toContain(joker);
    expect(next.players[1]!.hands[0]!.exposures[0]!.tiles).toContain(east[0]);
    // Still East's turn after a swap.
    expect(next.phase).toMatchObject({ kind: 'turn', seat: 0 });

    const locked = structuredClone(state);
    locked.players[1]!.hands[0]!.shown = [];
    expect(twoPlayerView(card, locked, 0).prompt).toMatchObject({ type: 'turn', exchanges: [] });
    expect(() => act(locked, 0, { type: 'exchange-joker', tile: east[0]!, target: 1, hand: 0, exposure: 0 })).toThrow(/already Mahjong/);
  });
});

describe('two-player: concealed and dead hands', () => {
  it('lets a concealed hand take a discard only for Mahjong, and only on a hand with no exposures', () => {
    const { pick, singles } = picker();
    // t4: 3 6 9 in all three suits and five flowers, concealed. West is a 9 Crak short.
    const t4 = ['DOT_3', 'DOT_6', 'DOT_9', 'BAMBOO_3', 'BAMBOO_6', 'BAMBOO_9', 'CHARACTER_3', 'CHARACTER_6'].map((f) => pick(f)[0]!).concat(pick('FLOWER', 5));
    const nine = pick('CHARACTER_9', 1)[0]!;
    const skip = ['DOT_3', 'DOT_6', 'DOT_9', 'BAMBOO_3', 'BAMBOO_6', 'BAMBOO_9', 'CHARACTER_3', 'CHARACTER_6', 'CHARACTER_9', 'DOT_2'];
    const west = [...t4, ...singles(11, skip)];
    const east = [nine, ...singles(24, skip), ...pick('FLOWER', 3)];
    let state = twoState(east, west);
    // Hand 1 already has an exposure, so it can't be a concealed hand any more.
    state.players[1]!.hands[0]!.exposures.push({ key: 'DOT_2', tiles: pick('DOT_2', 3) });
    state = act(state, 0, { type: 'discard', tile: nine }).state;
    expect(twoPlayerClaimOptions(card, state, 1, nine)).toEqual([{ hand: 1, canMahjong: true, sizes: [] }]);
    expect(() => act(state, 1, { type: 'claim', response: { type: 'expose', hand: 1, size: 3 } })).toThrow();
    expect(() => act(state, 1, { type: 'claim', response: { type: 'mahjong', hand: 0 } })).toThrow(/does not complete/);
    const done = act(state, 1, { type: 'claim', response: { type: 'mahjong', hand: 1 } }).state;
    // 50 points, doubled: jokerless, and its five flowers could have held jokers.
    expect(done.mahjongs).toMatchObject([{ seat: 1, hand: 1, handId: 't4', from: 0, jokerless: true, value: 100 }]);
  });

  it('marks a hand dead when its exposures fit no hand, and the player still plays', () => {
    const { pick, singles } = picker();
    const east = singles(28, ['DOT_1', 'BAMBOO_9']);
    const west = singles(19, ['DOT_1', 'BAMBOO_9']);
    let state = twoState(east, west);
    // Kongs of 1 Dot and 9 Bam don't share a hand on the house card.
    state.players[1]!.hands[0]!.exposures.push({ key: 'DOT_1', tiles: pick('DOT_1', 4) }, { key: 'BAMBOO_9', tiles: pick('BAMBOO_9', 4) });
    const { state: next, events } = act(state, 0, { type: 'discard', tile: east[0]! });
    const dead = events.find((e): e is Extract<TwoPlayerEvent, { type: 'dead-hand' }> => e.type === 'dead-hand');
    expect(dead).toMatchObject({ seat: 1, hand: 0, reason: { code: 'no-hand' } });
    state = next;
    expect(state.players[1]!.hands[0]!.dead?.code).toBe('no-hand');
    expect(state.players[1]!.hands[1]!.dead).toBeNull();
    // West draws and plays on, but hand 1 can't win or call.
    expect(state.phase).toMatchObject({ kind: 'turn', seat: 1 });
    expect(() => act(state, 1, { type: 'declare-mahjong', hand: 0 })).toThrow(/dead/);
    const view = twoPlayerView(card, state, 0);
    expect(view.players[1]!.hands[0]!.dead?.text).toMatch(/fit any hand/);
    state = act(state, 1, { type: 'discard', tile: state.players[1]!.concealed[0]! }).state;
    expect(state.phase.kind === 'turn' || state.phase.kind === 'claim').toBe(true);
  });

  it('ends as a wall game when the wall runs out, keeping Mahjongs already paid', () => {
    const { singles } = picker();
    const state = twoState(singles(14), singles(27).slice(14));
    state.wall = [];
    const earlier: TwoPlayerMahjong = { seat: 1, hand: 0, from: null, handId: 'ev1', pattern: 'FF 2222a 44a 66a 8888a', assignment: 'a=DOT', jokerless: false, value: 25, final: false };
    state.mahjongs.push(earlier);
    state.players[1]!.hands[0]!.shown = [];
    const { state: done, events } = act(state, 0, { type: 'discard', tile: state.players[0]!.concealed[0]! });
    expect(events.at(-1)).toEqual({ type: 'wall-game' });
    expect(done.result).toMatchObject({ kind: 'wall', winner: null, value: 0, payments: [-25, 25] });
    expect(twoPlayerPendingSeats(done)).toEqual([]);
  });
});

describe('two-player: computer players', () => {
  function playOut(c: Card, seed: number, levels: [BotLevel, BotLevel]) {
    let state = newTwoPlayerGame(c, { seed });
    const random = rng(seed * 31 + 1);
    let steps = 0;
    while (state.phase.kind !== 'ended') {
      const seat = twoPlayerPendingSeats(state)[0]!;
      const action = twoPlayerBotAction(c, twoPlayerView(c, state, seat), levels[seat]!, random);
      state = applyTwoPlayerAction(c, state, seat, action).state;
      assertConserved(state);
      if (++steps > 1000) throw new Error('game did not finish');
    }
    return state;
  }

  for (const [name, c] of [
    ['the house card', card],
    ['the 2026 card', card2026],
  ] as const) {
    it(`play whole games on ${name}: every tile accounted for, payments balanced, some games to two Mahjongs`, () => {
      const levels: [BotLevel, BotLevel][] = [
        ['hard', 'hard'],
        ['normal', 'hard'],
        ['easy', 'normal'],
        ['hard', 'easy'],
        ['normal', 'normal'],
        ['hard', 'normal'],
      ];
      const games = levels.map((l, i) => playOut(c, 400 + i, l));
      for (const g of games) {
        expect(g.result).not.toBeNull();
        expect(g.result!.payments.reduce((a, b) => a + b, 0)).toBe(0);
        // Each Mahjong is paid by the other player, the final one at double.
        for (const m of g.mahjongs) expect(m.value).toBeGreaterThanOrEqual(25 * (m.final ? 2 : 1));
      }
      expect(games.some((g) => g.result!.kind === 'mahjong' && g.mahjongs.length >= 2)).toBe(true);
      expect(games.reduce((n, g) => n + g.mahjongs.length, 0)).toBeGreaterThanOrEqual(games.length);
    });
  }

  it('plans both hands for hints, a suggested discard and the two racks', () => {
    const state = newTwoPlayerGame(card, { seed: 21 });
    const view = twoPlayerView(card, state, 0);
    const hints = twoPlayerHints(card, view);
    expect(hints).toHaveLength(2);
    for (const list of hints) {
      expect(list!.length).toBeGreaterThan(0);
      expect(list![0]!.distance).toBeGreaterThanOrEqual(0);
    }
    const tile = suggestTwoPlayerDiscard(card, view);
    expect(view.concealed).toContain(tile);
    const [a, b] = planSplit(card, view);
    expect([...a, ...b].sort((x, y) => x - y)).toEqual([...view.concealed].sort((x, y) => x - y));
    expect(Math.abs(a.length - b.length)).toBeLessThanOrEqual(2);
  });

  it('decides each move quickly, even on the 2026 card', () => {
    let state = newTwoPlayerGame(card2026, { seed: 77 });
    const random = rng(3);
    let slowest = 0;
    for (let i = 0; i < 60 && state.phase.kind !== 'ended'; i++) {
      const seat = twoPlayerPendingSeats(state)[0]!;
      const started = performance.now();
      const action = twoPlayerBotAction(card2026, twoPlayerView(card2026, state, seat), 'hard', random);
      slowest = Math.max(slowest, performance.now() - started);
      state = applyTwoPlayerAction(card2026, state, seat, action).state;
    }
    // Typically a few milliseconds; generous for slow test machines.
    expect(slowest).toBeLessThan(250);
  });
});
