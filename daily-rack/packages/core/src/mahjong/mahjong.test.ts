import { describe, expect, it } from 'vitest';
import {
  HOUSE_CARD,
  TILE_FACES,
  applyAction,
  botAction,
  concretize,
  exposureOptions,
  findWin,
  keyOf,
  newGame,
  parseToken,
  passTarget,
  pendingSeats,
  playerView,
  rng,
  runBots,
  validateCard,
  type BotLevel,
  type GameState,
  type Seat,
} from './index.ts';

const card = HOUSE_CARD;

/** Picks unused tile ids by face so tests can build exact hands. */
function picker() {
  const used = new Set<number>();
  return (face: string, n = 1): number[] => {
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
}

/** Every tile is somewhere exactly once. */
function assertConserved(state: GameState) {
  const all = [
    ...state.wall,
    ...state.discards.map((d) => d.tile),
    ...state.players.flatMap((p) => [...p.hand, ...p.exposures.flatMap((e) => e.tiles)]),
  ];
  expect(all).toHaveLength(152);
  expect(new Set(all).size).toBe(152);
}

function playState(hands: number[][], wall: number[] = [], turnSeat: Seat = 0): GameState {
  return {
    v: 1,
    cardId: card.id,
    seed: 1,
    options: { secondCharleston: true, courtesyPass: true, skipCharleston: false },
    wall,
    players: hands.map((hand) => ({ hand, exposures: [] })),
    discards: [],
    phase: { kind: 'turn', seat: turnSeat, drawn: null },
    turns: 0,
    result: null,
  };
}

describe('the house card', () => {
  it('is playable: every hand has 14 tiles that a real set can supply', () => {
    expect(validateCard(card)).toEqual([]);
    expect(card.hands.length).toBeGreaterThanOrEqual(30);
  });

  it('parses pattern tokens and rejects malformed ones', () => {
    expect(parseToken('444b')).toMatchObject({ n: 3, tile: { k: 'num', rank: 4, s: 'b' } });
    expect(parseToken('DDDa')).toMatchObject({ n: 3, tile: { k: 'dragon', s: 'a' } });
    expect(parseToken('yyyyc')).toMatchObject({ n: 4, tile: { k: 'var', offset: 1, s: 'c' } });
    for (const bad of ['42a', 'FFa', '2', 'DD', 'Q', 'xxxd']) expect(() => parseToken(bad)).toThrow();
  });

  it('expands suits and numbers into distinct concrete hands', () => {
    const like = card.hands.find((h) => h.id === 'ln1')!;
    // FF xxxxa xxxxb xxxxc: 9 numbers; suit order does not matter once all three are used.
    expect(concretize(like)).toHaveLength(9);
  });
});

describe('winning hands', () => {
  it('accepts a natural hand and marks it jokerless', () => {
    const pick = picker();
    const hand = [...pick('FLOWER', 2), ...pick('DOT_5', 4), ...pick('BAMBOO_5', 4), ...pick('CHARACTER_5', 4)];
    const win = findWin(card, hand, []);
    expect(win?.concrete.hand.id).toBe('ln1');
    expect(win?.jokerless).toBe(true);
  });

  it('lets jokers fill groups of three or more, never pairs or singles', () => {
    const pick = picker();
    const withJokers = [...pick('FLOWER', 2), ...pick('DOT_5', 2), ...pick('JOKER', 2), ...pick('BAMBOO_5', 4), ...pick('CHARACTER_5', 4)];
    expect(findWin(card, withJokers, [])?.jokerless).toBe(false);
    const pick2 = picker();
    const jokerInPair = [...pick2('FLOWER', 1), ...pick2('JOKER', 1), ...pick2('DOT_5', 4), ...pick2('BAMBOO_5', 4), ...pick2('CHARACTER_5', 4)];
    expect(findWin(card, jokerInPair, [])).toBeNull();
  });

  it('requires exposures to match a group exactly and keeps concealed hands concealed', () => {
    const pick = picker();
    const exposedKong = { key: 'DOT_5', tiles: pick('DOT_5', 4) };
    const rest = [...pick('FLOWER', 2), ...pick('BAMBOO_5', 4), ...pick('CHARACTER_5', 4)];
    expect(findWin(card, rest, [exposedKong])?.concrete.hand.id).toBe('ln1');
    const pick2 = picker();
    const pung = { key: 'DOT_5', tiles: pick2('DOT_5', 3) };
    const rest2 = [...pick2('FLOWER', 2), ...pick2('DOT_5', 1), ...pick2('BAMBOO_5', 4), ...pick2('CHARACTER_5', 4)];
    expect(findWin(card, rest2, [pung])).toBeNull();

    const pick3 = picker();
    // pa3: NN EE WW SS DDa DDb DDc, concealed; any exposure disqualifies it.
    const pairs = ['WIND_NORTH', 'WIND_EAST', 'WIND_WEST', 'WIND_SOUTH', 'DRAGON_RED', 'DRAGON_GREEN', 'DRAGON_WHITE'].flatMap((f) => pick3(f, 2));
    expect(findWin(card, pairs, [])?.concrete.hand.id).toBe('pa3');
  });

  it('offers only calls that fit an open hand the player could still make', () => {
    const pick = picker();
    const hand = [...pick('DOT_5', 2), ...pick('WIND_EAST', 1), ...pick('BAMBOO_1', 1)];
    expect(exposureOptions(card, hand, [], 'DOT_5')).toEqual([3]);
    expect(exposureOptions(card, [...hand, ...pick('JOKER', 1)], [], 'DOT_5')).toEqual([3, 4]);
    expect(exposureOptions(card, hand, [], 'WIND_SOUTH')).toEqual([]);
  });
});

describe('dealing and the Charleston', () => {
  it('deals 14 to East and 13 to everyone else', () => {
    const state = newGame(card, { seed: 7 });
    expect(state.players.map((p) => p.hand.length)).toEqual([14, 13, 13, 13]);
    expect(state.wall).toHaveLength(152 - 53);
    assertConserved(state);
  });

  it('passes right, across and left, rejecting jokers and wrong counts', () => {
    let state = newGame(card, { seed: 11 });
    const first = state.players.map((p) => p.hand.filter((t) => TILE_FACES[t] !== 'JOKER').slice(0, 3));
    const joker = state.players.flatMap((p) => p.hand).find((t) => TILE_FACES[t] === 'JOKER');
    if (joker !== undefined) {
      const owner = state.players.findIndex((p) => p.hand.includes(joker)) as Seat;
      const others = state.players[owner]!.hand.filter((t) => t !== joker).slice(0, 2);
      expect(() => applyAction(card, state, owner, { type: 'charleston-pass', tiles: [joker, ...others] })).toThrow(/Jokers/);
    }
    expect(() => applyAction(card, state, 0, { type: 'charleston-pass', tiles: first[0]!.slice(0, 2) })).toThrow(/exactly 3/);
    for (const s of [0, 1, 2, 3] as Seat[]) state = applyAction(card, state, s, { type: 'charleston-pass', tiles: first[s]! }).state;
    for (const s of [0, 1, 2, 3] as Seat[]) {
      expect(state.players[passTarget(s, 'right')]!.hand).toEqual(expect.arrayContaining(first[s]!));
    }
    expect(state.phase).toMatchObject({ kind: 'charleston', round: 1, pass: 1 });
    assertConserved(state);
  });

  it('skips the second Charleston if anyone says no, then runs the courtesy pass', () => {
    let state = newGame(card, { seed: 3 });
    for (let pass = 0; pass < 3; pass++) {
      for (const s of [0, 1, 2, 3] as Seat[]) {
        const tiles = state.players[s]!.hand.filter((t) => TILE_FACES[t] !== 'JOKER').slice(0, 3);
        state = applyAction(card, state, s, { type: 'charleston-pass', tiles }).state;
      }
    }
    expect(state.phase.kind).toBe('charleston-vote');
    state = applyAction(card, state, 0, { type: 'charleston-vote', continue: true }).state;
    state = applyAction(card, state, 1, { type: 'charleston-vote', continue: false }).state;
    expect(state.phase.kind).toBe('courtesy-count');
    const counts = [3, 1, 0, 2];
    for (const s of [0, 1, 2, 3] as Seat[]) state = applyAction(card, state, s, { type: 'courtesy-count', count: counts[s]! }).state;
    // East (3) and West (0) swap 0; South (1) and North (2) swap 1.
    expect(state.phase).toMatchObject({ kind: 'courtesy-select', sizes: [0, 1, 0, 1] });
    expect(pendingSeats(state)).toEqual([1, 3]);
    for (const s of [1, 3] as Seat[]) {
      const tiles = state.players[s]!.hand.filter((t) => TILE_FACES[t] !== 'JOKER').slice(0, 1);
      state = applyAction(card, state, s, { type: 'courtesy-pass', tiles }).state;
    }
    expect(state.phase).toEqual({ kind: 'turn', seat: 0, drawn: null });
    expect(state.players.map((p) => p.hand.length)).toEqual([14, 13, 13, 13]);
    assertConserved(state);
  });
});

describe('play', () => {
  it('lets only the player whose turn it is discard, then moves on with a draw', () => {
    const pick = picker();
    const hands = [pick('BAMBOO_1', 3).concat(pick('BAMBOO_9', 3), pick('CHARACTER_2', 3), pick('DOT_7', 3), pick('WIND_EAST', 2)), pick('DOT_1', 3).concat(pick('DOT_3', 3), pick('DOT_9', 3), pick('BAMBOO_8', 4)), pick('CHARACTER_8', 4).concat(pick('CHARACTER_4', 4), pick('BAMBOO_4', 4), pick('WIND_WEST', 1)), pick('CHARACTER_9', 4).concat(pick('CHARACTER_1', 4), pick('BAMBOO_3', 4), pick('WIND_NORTH', 1))];
    const wall = pick('DOT_2', 2);
    let state = playState(hands, wall);
    expect(() => applyAction(card, state, 1, { type: 'discard', tile: hands[1]![0]! })).toThrow(/not available/);
    state = applyAction(card, state, 0, { type: 'discard', tile: hands[0]!.at(-1)! }).state;
    expect(state.phase).toMatchObject({ kind: 'turn', seat: 1 });
    expect(state.players[1]!.hand).toHaveLength(14);
  });

  it('gives a discard to Mahjong before an exposure, whatever the seat order', () => {
    const pick = picker();
    const winning = [...pick('FLOWER', 2), ...pick('DOT_5', 4), ...pick('BAMBOO_5', 4), ...pick('CHARACTER_5', 3)];
    const discard = pick('CHARACTER_5', 1)[0]!;
    const caller = [...pick('JOKER', 2), ...pick('CHARACTER_6', 4), ...pick('CHARACTER_7', 4), ...pick('WIND_SOUTH', 3)];
    const east = [discard, ...pick('BAMBOO_9', 4), ...pick('DOT_9', 4), ...pick('WIND_NORTH', 4), ...pick('DRAGON_GREEN', 1)];
    const north = [...pick('BAMBOO_2', 4), ...pick('BAMBOO_3', 4), ...pick('DOT_2', 4), ...pick('WIND_WEST', 1)];
    let state = playState([east, caller, winning, north], pick('DOT_1', 3));
    state = applyAction(card, state, 0, { type: 'discard', tile: discard }).state;
    expect(state.phase.kind).toBe('claim');
    for (const s of pendingSeats(state)) {
      const response = s === 2 ? { type: 'mahjong' as const } : s === 1 ? { type: 'expose' as const, size: 3 } : { type: 'pass' as const };
      state = applyAction(card, state, s, { type: 'claim', response }).state;
    }
    expect(state.result).toMatchObject({ kind: 'mahjong', winner: 2, from: 0, handId: 'ln1', jokerless: true });
    // Discarder pays double, the others single; jokerless doubles the value.
    expect(state.result!.payments).toEqual([-100, -50, 200, -50]);
    expect(state.result!.payments.reduce((a, b) => a + b, 0)).toBe(0);
  });

  it('exposes a called group and lets anyone swap a natural for its joker', () => {
    const pick = picker();
    const discard = pick('DOT_5', 1)[0]!;
    const caller = [...pick('DOT_5', 1), ...pick('JOKER', 1), ...pick('BAMBOO_5', 3), ...pick('CHARACTER_5', 4), ...pick('DRAGON_WHITE', 4)];
    const east = [discard, ...pick('BAMBOO_9', 4), ...pick('DOT_9', 4), ...pick('WIND_NORTH', 4), ...pick('DRAGON_GREEN', 1)];
    const west = [...pick('DOT_5', 1), ...pick('BAMBOO_1', 4), ...pick('BAMBOO_2', 4), ...pick('CHARACTER_1', 4)];
    const north = [...pick('BAMBOO_3', 4), ...pick('CHARACTER_2', 4), ...pick('DOT_2', 4), ...pick('WIND_WEST', 1)];
    let state = playState([east, caller, west, north], pick('DOT_1', 4));
    state = applyAction(card, state, 0, { type: 'discard', tile: discard }).state;
    for (const s of pendingSeats(state)) {
      state = applyAction(card, state, s, { type: 'claim', response: s === 1 ? { type: 'expose', size: 3 } : { type: 'pass' } }).state;
    }
    expect(state.players[1]!.exposures).toHaveLength(1);
    expect(state.players[1]!.exposures[0]!.tiles.map((t) => TILE_FACES[t])).toEqual(['DOT_5', 'DOT_5', 'JOKER']);
    expect(state.phase).toEqual({ kind: 'turn', seat: 1, drawn: null });

    // South discards; West later draws and swaps the last DOT_5 for South's joker.
    state = applyAction(card, state, 1, { type: 'discard', tile: state.players[1]!.hand.find((t) => keyOf(t) === 'DRAGON_WHITE')! }).state;
    while (state.phase.kind === 'claim') state = applyAction(card, state, pendingSeats(state)[0]!, { type: 'claim', response: { type: 'pass' } }).state;
    expect(state.phase).toMatchObject({ kind: 'turn', seat: 2 });
    const view = playerView(card, state, 2);
    expect(view.prompt).toMatchObject({ type: 'turn', exchanges: [{ target: 1, exposure: 0 }] });
    const ex = (view.prompt as { exchanges: { tile: number; target: Seat; exposure: number }[] }).exchanges[0]!;
    state = applyAction(card, state, 2, { type: 'exchange-joker', ...ex }).state;
    expect(state.players[1]!.exposures[0]!.tiles.some((t) => TILE_FACES[t] === 'JOKER')).toBe(false);
    expect(state.players[2]!.hand.some((t) => TILE_FACES[t] === 'JOKER')).toBe(true);
    assertConservedSubset(state);
  });

  it('refuses a false Mahjong and ends in a wall game when the wall runs out', () => {
    const pick = picker();
    const hands = [pick('BAMBOO_1', 4).concat(pick('BAMBOO_9', 4), pick('CHARACTER_2', 4), pick('DOT_7', 2)), pick('DOT_1', 4).concat(pick('DOT_3', 4), pick('DOT_9', 4), pick('WIND_EAST', 1)), pick('CHARACTER_8', 4).concat(pick('CHARACTER_4', 4), pick('BAMBOO_4', 4), pick('WIND_WEST', 1)), pick('CHARACTER_9', 4).concat(pick('CHARACTER_1', 4), pick('BAMBOO_3', 4), pick('WIND_NORTH', 1))];
    const state = playState(hands, []);
    expect(() => applyAction(card, state, 0, { type: 'declare-mahjong' })).toThrow(/do not make a hand/);
    const after = applyAction(card, state, 0, { type: 'discard', tile: hands[0]!.at(-1)! }).state;
    expect(after.result).toMatchObject({ kind: 'wall', payments: [0, 0, 0, 0] });
  });

  it('shows each player only their own tiles', () => {
    const state = newGame(card, { seed: 21 });
    const view = playerView(card, state, 2);
    expect(view.hand).toEqual(state.players[2]!.hand);
    expect(view.players.map((p) => p.handCount)).toEqual([14, 13, 13, 13]);
    const json = JSON.stringify(view);
    for (const t of state.players[0]!.hand.filter((t) => !state.players[2]!.hand.includes(t))) {
      expect(view.hand).not.toContain(t);
    }
    expect(json).not.toContain('"wall"');
  });
});

function assertConservedSubset(state: GameState) {
  const all = [
    ...state.wall,
    ...state.discards.map((d) => d.tile),
    ...state.players.flatMap((p) => [...p.hand, ...p.exposures.flatMap((e) => e.tiles)]),
  ];
  expect(new Set(all).size).toBe(all.length);
}

describe('computer players', () => {
  it.each(['easy', 'normal', 'hard'] as BotLevel[])('%s bots finish full games without breaking a rule', (level) => {
    for (let i = 0; i < 6; i++) {
      const state = runBots(card, newGame(card, { seed: 900 + i }), { 0: level, 1: level, 2: level, 3: level }, rng(i));
      expect(state.phase.kind).toBe('ended');
      expect(state.result!.payments.reduce((a, b) => a + b, 0)).toBe(0);
      assertConserved(state);
    }
  });

  it('wins most normal-level games instead of walling', () => {
    let wins = 0;
    for (let i = 0; i < 12; i++) {
      const state = runBots(card, newGame(card, { seed: 300 + i }), { 0: 'normal', 1: 'normal', 2: 'normal', 3: 'normal' }, rng(i));
      if (state.result?.kind === 'mahjong') wins += 1;
    }
    expect(wins).toBeGreaterThanOrEqual(9);
  });

  it('always declares a Mahjong it holds', () => {
    const pick = picker();
    const hand = [...pick('FLOWER', 2), ...pick('DOT_5', 4), ...pick('BAMBOO_5', 4), ...pick('CHARACTER_5', 4)];
    const state = playState([hand, pick('DOT_1', 4).concat(pick('DOT_2', 4), pick('DOT_3', 4), pick('DOT_4', 1)), pick('BAMBOO_2', 4).concat(pick('BAMBOO_3', 4), pick('BAMBOO_4', 4), pick('DOT_6', 1)), pick('DOT_7', 4).concat(pick('DOT_8', 4), pick('DOT_9', 4), pick('BAMBOO_1', 1))]);
    expect(botAction(card, state, 0, 'easy', rng(1))).toEqual({ type: 'declare-mahjong' });
  });
});
