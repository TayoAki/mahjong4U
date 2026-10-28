import { describe, expect, it } from 'vitest';
import {
  HOUSE_CARD,
  TILE_FACES,
  applyAction,
  arrangeWin,
  botAction,
  cardById,
  cardFromSpec,
  cardToSpec,
  registerCard,
  concretize,
  deadHandReason,
  explainClaim,
  explainClaimForView,
  exposureOptions,
  SEATS,
  findWin,
  isDead,
  isJoker,
  keyOf,
  newGame,
  phaseKey,
  promptFor,
  publicPhaseKey,
  parseToken,
  passTarget,
  pendingSeats,
  playerView,
  rng,
  runBots,
  validateCard,
  type BotLevel,
  type DeadReason,
  type GameEvent,
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

  it('lays a winning hand out group by group, exposures included', () => {
    const pick = picker();
    const kong = { key: 'DOT_5', tiles: pick('DOT_5', 4) };
    const rest = [...pick('CHARACTER_5', 3), ...pick('JOKER', 1), ...pick('BAMBOO_5', 4), ...pick('FLOWER', 2)];
    const win = findWin(card, rest, [kong])!;
    const groups = arrangeWin(card, win.concrete.hand.id, win.concrete.label, rest, [kong])!;
    expect(groups.map((g) => g.length)).toEqual(win.concrete.groups.map((g) => g.n));
    expect(groups.flat().sort((a, b) => a - b)).toEqual([...rest, ...kong.tiles].sort((a, b) => a - b));
    expect(groups.find((g) => g.includes(kong.tiles[0]!))).toEqual(kong.tiles);
    const flowers = groups.find((g) => g.every((t) => keyOf(t) === 'FLOWER'));
    expect(flowers).toHaveLength(2);
    expect(arrangeWin(card, win.concrete.hand.id, win.concrete.label, rest.slice(1), [kong])).toBeNull();
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
  }, 30_000);

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

describe('phase keys', () => {
  it('names each simultaneous step the same way for the engine and a player view', () => {
    let state = newGame(HOUSE_CARD, { seed: 7 });
    const seen: string[] = [];
    for (let step = 0; step < 6 && state.phase.kind === 'charleston'; step++) {
      const key = phaseKey(state.phase);
      expect(publicPhaseKey(playerView(HOUSE_CARD, state, 2).phase)).toBe(key);
      seen.push(key);
      for (const seat of SEATS) {
        const hand = state.players[seat]!.hand.filter((t) => !isJoker(t));
        state = applyAction(HOUSE_CARD, state, seat, { type: 'charleston-pass', tiles: hand.slice(0, 3) }).state;
      }
    }
    expect(seen).toEqual(['charleston:1:right', 'charleston:1:across', 'charleston:1:left']);
    expect(phaseKey(state.phase)).toBe(publicPhaseKey(playerView(HOUSE_CARD, state, 0).phase));
  });

  it('names the calls on each discard after that tile', () => {
    expect(phaseKey({ kind: 'claim', tile: 17, from: 0, responses: [{ type: 'pass' }, null, null, null] })).toBe('claim:17');
    expect(publicPhaseKey({ kind: 'claim', tile: 17, from: 0 })).toBe('claim:17');
    expect(publicPhaseKey({ kind: 'turn', seat: 1, drew: false })).toBe('turn');
  });
});

describe('cards as data', () => {
  it('round-trips the house card and registers another card by id', () => {
    const spec = cardToSpec(card);
    const copy = cardFromSpec({ ...spec, id: 'club-card', name: 'Club card' });
    expect(validateCard(copy)).toEqual([]);
    expect(copy.hands.map((h) => h.groups.length)).toEqual(card.hands.map((h) => h.groups.length));
    expect(cardById('club-card')).toBe(card);
    registerCard(copy);
    expect(cardById('club-card').name).toBe('Club card');
    expect(cardById('nope')).toBe(card);
    expect(() => cardFromSpec({ ...spec, hands: [{ id: 'x', section: 'evens', pattern: 'QQQ', value: 25 }] })).toThrow(/bad pattern/);
    const short = cardFromSpec({ ...spec, hands: [{ id: 'x', section: 'evens', pattern: 'FF 2222a', value: 25 }] });
    expect(validateCard(short).join()).toMatch(/expected 14/);
  });
});

// ---------------------------------------------------------------------------
// Dead hands and "why can't I call this?"

const FAKE_DEAD: DeadReason = { code: 'no-hand', faces: [], text: 'test' };

/** Plays one move and returns the new state with the events it produced. */
function play(state: GameState, seat: Seat, action: Parameters<typeof applyAction>[3], onCard = card) {
  return applyAction(onCard, state, seat, action);
}

/**
 * South (seat 1) has exposed kongs of North and East, so the only hand left for it is
 * NNNN EEEE WWWW SS, and it holds three Wests. East holds the last South and a West.
 * West (seat 2) wins with the 5 Crak on top of the wall.
 */
function windsTable(southsOut: number) {
  const pick = picker();
  const souths = pick('WIND_SOUTH', 4);
  const wests = pick('WIND_WEST', 4);
  const east = [souths[3]!, wests[3]!, ...pick('CHARACTER_1', 4), ...pick('CHARACTER_2', 4), ...pick('BAMBOO_2', 4)];
  const south = [...wests.slice(0, 3), ...pick('DOT_9', 1), ...pick('DOT_8', 1)];
  const west = [...pick('FLOWER', 2), ...pick('DOT_5', 4), ...pick('BAMBOO_5', 4), ...pick('CHARACTER_5', 3)];
  const north = [...pick('BAMBOO_1', 4), ...pick('BAMBOO_3', 4), ...pick('DOT_1', 4), ...pick('CHARACTER_9', 1)];
  const state = playState([east, south, west, north], [...pick('DOT_6', 2), ...pick('CHARACTER_5', 1)]);
  state.players[1]!.exposures = [
    { key: 'WIND_NORTH', tiles: pick('WIND_NORTH', 4) },
    { key: 'WIND_EAST', tiles: pick('WIND_EAST', 4) },
  ];
  state.discards = souths.slice(0, southsOut).map((tile, i) => ({ tile, seat: (i % 2 === 0 ? 2 : 3) as Seat }));
  return { state, lastSouth: souths[3]!, west: wests[3]! };
}

/**
 * South has exposed a kong of 9 Dot and a pung of 7 Dot (only FFFF 1a 3a 5a 777a 9999a
 * fits) and holds everything but the single 1 Dot. Three 1 Dots are already out; East
 * holds the last one.
 */
function lastOneTable() {
  const pick = picker();
  const ones = pick('DOT_1', 4);
  const east = [ones[3]!, ...pick('CHARACTER_1', 4), ...pick('CHARACTER_2', 4), ...pick('BAMBOO_2', 4), ...pick('WIND_WEST', 1)];
  const south = [...pick('FLOWER', 4), ...pick('DOT_3', 1), ...pick('DOT_5', 1)];
  const west = [...pick('BAMBOO_1', 4), ...pick('BAMBOO_3', 4), ...pick('CHARACTER_9', 4), ...pick('WIND_NORTH', 1)];
  const north = [...pick('BAMBOO_4', 4), ...pick('BAMBOO_6', 4), ...pick('CHARACTER_8', 4), ...pick('WIND_SOUTH', 1)];
  const state = playState([east, south, west, north], pick('DOT_6', 2));
  state.players[1]!.exposures = [
    { key: 'DOT_9', tiles: pick('DOT_9', 4) },
    { key: 'DOT_7', tiles: pick('DOT_7', 3) },
  ];
  state.discards = [
    { tile: ones[0]!, seat: 2 },
    { tile: ones[1]!, seat: 3 },
    { tile: ones[2]!, seat: 0 },
  ];
  return { state, lastOne: ones[3]! };
}

describe('dead hands', () => {
  it('calls a hand dead when its exposures fit no hand on the card', () => {
    const pick = picker();
    const state = playState([[], [], [], []]);
    state.players[1]!.exposures = [{ key: 'DOT_1', tiles: pick('DOT_1', 3) }];
    expect(deadHandReason(card, state, 1)).toBeNull();
    state.players[1]!.exposures.push({ key: 'WIND_EAST', tiles: pick('WIND_EAST', 3) });
    expect(deadHandReason(card, state, 1)).toEqual({
      code: 'no-hand',
      faces: ['DOT_1', 'WIND_EAST'],
      text: "the exposed pung of 1 Dot and pung of East Winds don't fit any hand on the card",
    });
  });

  it('rules out concealed hands once a seat has exposed', () => {
    const tiny = cardFromSpec({
      id: 'dead-test-card',
      name: 'Test',
      description: 'Test',
      sections: [{ id: 's', label: 'S' }],
      hands: [
        { id: 'open', section: 's', pattern: 'FF 2222a 44a 66a 8888a', value: 25 },
        { id: 'secret', section: 's', pattern: 'NNN EEE WWW SSS FF', value: 50, concealed: true },
      ],
    });
    const pick = picker();
    const state = { ...playState([[], [], [], []]), cardId: tiny.id };
    state.players[2]!.exposures = [{ key: 'WIND_NORTH', tiles: pick('WIND_NORTH', 3) }];
    expect(deadHandReason(tiny, state, 2)).toMatchObject({ code: 'no-hand', text: "the exposed pung of North Winds doesn't fit any hand on the card" });
  });

  it('calls a hand dead when every hand left needs a pair or single that is used up', () => {
    const pick = picker();
    const state = playState([[], [], [], []]);
    // FFF 555b 5555c fit only FFF xxa xxxb xxxxc DDc: a pair of 5 Dot and a pair of Red Dragons.
    state.players[3]!.exposures = [
      { key: 'FLOWER', tiles: pick('FLOWER', 3) },
      { key: 'BAMBOO_5', tiles: pick('BAMBOO_5', 3) },
      { key: 'CHARACTER_5', tiles: pick('CHARACTER_5', 4) },
    ];
    const reds = pick('DRAGON_RED', 4);
    // Red Dragons hidden in someone's rack are not public, so they prove nothing.
    state.players[0]!.hand = [...reds];
    expect(deadHandReason(card, state, 3)).toBeNull();
    state.players[0]!.hand = [];
    state.discards = reds.slice(0, 2).map((tile) => ({ tile, seat: 0 as Seat }));
    expect(deadHandReason(card, state, 3)).toBeNull();
    state.discards.push({ tile: reds[2]!, seat: 1 });
    expect(deadHandReason(card, state, 3)?.text).toBe('every hand that fits these exposures needs a pair of Red Dragons, and three of the four are already out');
    state.discards.push({ tile: reds[3]!, seat: 2 });
    expect(deadHandReason(card, state, 3)).toEqual({
      code: 'tiles-gone',
      faces: ['DRAGON_RED'],
      text: 'every hand that fits these exposures needs a pair of Red Dragons, and all four are already out',
    });
  });

  it('names every used-up tile when different hands need different ones', () => {
    const tiny = cardFromSpec({
      id: 'dead-test-card-2',
      name: 'Test',
      description: 'Test',
      sections: [{ id: 's', label: 'S' }],
      hands: [
        { id: 'w1', section: 's', pattern: 'NNNN EEEE WWWW SS', value: 25 },
        { id: 'w2', section: 's', pattern: 'NNNN EEEE SSSS WW', value: 25 },
      ],
    });
    const pick = picker();
    const state = { ...playState([[], [], [], []]), cardId: tiny.id };
    state.players[1]!.exposures = [
      { key: 'WIND_NORTH', tiles: pick('WIND_NORTH', 4) },
      { key: 'WIND_EAST', tiles: pick('WIND_EAST', 4) },
    ];
    state.discards = [...pick('WIND_WEST', 4), ...pick('WIND_SOUTH', 2)].map((tile) => ({ tile, seat: 0 as Seat }));
    expect(deadHandReason(tiny, state, 1)).toBeNull();
    state.discards.push({ tile: pick('WIND_SOUTH', 1)[0]!, seat: 2 });
    expect(deadHandReason(tiny, state, 1)).toEqual({
      code: 'tiles-gone',
      faces: ['WIND_SOUTH', 'WIND_WEST'],
      text: 'every hand that fits these exposures needs a pair of South Winds or West Winds, and too many of each are already out',
    });
    state.discards.push({ tile: pick('WIND_SOUTH', 1)[0]!, seat: 3 });
    expect(deadHandReason(tiny, state, 1)?.text).toBe('every hand that fits these exposures needs a pair of South Winds or West Winds, and all of those are already out');
  });

  it('does not count a discard that can still be called: the last copy can win', () => {
    const { state, lastOne } = lastOneTable();
    expect(deadHandReason(card, state, 1)).toBeNull();
    const { state: offered, events } = play(state, 0, { type: 'discard', tile: lastOne });
    expect(offered.phase).toMatchObject({ kind: 'claim', tile: lastOne });
    expect(events.map((e) => e.type)).toEqual(['discard']);
    expect(deadHandReason(card, offered, 1)).toBeNull();
    expect(deadHandReason(card, offered, 1, null)?.text).toBe('every hand that fits these exposures needs a single 1 Dot, and all four are already out');

    const won = play(offered, 1, { type: 'claim', response: { type: 'mahjong' } }).state;
    expect(won.result).toMatchObject({ kind: 'mahjong', winner: 1, from: 0, handId: 'od4' });

    // Passing it up closes the window, and with it the hand.
    const passed = play(offered, 1, { type: 'claim', response: { type: 'pass' } });
    expect(passed.events.map((e) => e.type)).toEqual(['dead-hand', 'draw']);
    expect(passed.events[0]).toMatchObject({ type: 'dead-hand', seat: 1, reason: { code: 'tiles-gone', faces: ['DOT_1'] } });
    expect(passed.state.phase).toMatchObject({ kind: 'turn', seat: 2 });
  });

  it('skips a dead seat in turn order and still makes it pay the winner', () => {
    const { state, lastSouth } = windsTable(3);
    const { state: after, events } = play(state, 0, { type: 'discard', tile: lastSouth });
    expect(events).toEqual<GameEvent[]>([
      { type: 'discard', seat: 0, tile: lastSouth },
      {
        type: 'dead-hand',
        seat: 1,
        reason: { code: 'tiles-gone', faces: ['WIND_SOUTH'], text: 'every hand that fits these exposures needs a pair of South Winds, and all four are already out' },
      },
      { type: 'draw', seat: 2 },
    ]);
    expect(isDead(after, 1)).toBe(true);
    expect(after.phase).toMatchObject({ kind: 'turn', seat: 2 });
    expect(pendingSeats(after)).toEqual([2]);
    expect(promptFor(card, after, 1)).toBeNull();
    expect(() => play(after, 1, { type: 'declare-mahjong' })).toThrow(/dead/);
    // Dead status is public: every seat sees it.
    for (const s of SEATS) expect(playerView(card, after, s).players[1]!.dead).toEqual(after.dead![1]);
    expect(playerView(card, after, 0).players.map((p) => p.dead === null)).toEqual([true, false, true, true]);

    // West drew the tile it needed: everyone pays double for a self-drawn win, dead or not.
    const won = play(after, 2, { type: 'declare-mahjong' }).state;
    expect(won.result).toMatchObject({ kind: 'mahjong', winner: 2, handId: 'ln1', jokerless: true });
    expect(won.result!.payments).toEqual([-100, -100, 300, -100]);
  });

  it('never asks a dead seat to call a discard it could otherwise take', () => {
    const live = windsTable(1);
    const offered = play(live.state, 0, { type: 'discard', tile: live.west }).state;
    expect(offered.phase.kind).toBe('claim');
    expect(pendingSeats(offered)).toEqual([1]);

    const dead = windsTable(1);
    dead.state.dead = [null, FAKE_DEAD, null, null];
    const { state: after, events } = play(dead.state, 0, { type: 'discard', tile: dead.west });
    expect(events.map((e) => e.type)).toEqual(['discard', 'draw']);
    expect(after.phase).toMatchObject({ kind: 'turn', seat: 2 });
    expect(explainClaim(card, after, 1)).toMatchObject({
      canCall: false,
      code: 'dead-hand',
      text: 'Your hand is dead: test. You sit out the rest of this hand (no drawing, discarding or calling), but you still pay the winner like everyone else.',
    });
  });

  it('passes the turn on when a call leaves the caller dead', () => {
    const pick = picker();
    const norths = pick('WIND_NORTH', 4);
    const souths = pick('WIND_SOUTH', 3);
    const east = [norths[3]!, ...pick('CHARACTER_1', 4), ...pick('CHARACTER_2', 4), ...pick('BAMBOO_2', 4), ...pick('DOT_2', 1)];
    const south = [...norths.slice(0, 3), ...pick('WIND_EAST', 4), ...pick('WIND_WEST', 3), ...pick('DOT_9', 3)];
    const west = [...pick('BAMBOO_1', 4), ...pick('BAMBOO_3', 4), ...pick('CHARACTER_9', 4), ...pick('DOT_4', 1)];
    const north = [...pick('BAMBOO_4', 4), ...pick('BAMBOO_6', 4), ...pick('CHARACTER_8', 4), ...pick('DOT_3', 1)];
    const state = playState([east, south, west, north], pick('DOT_6', 2));
    state.discards = souths.map((tile, i) => ({ tile, seat: (2 + (i % 2)) as Seat }));
    const offered = play(state, 0, { type: 'discard', tile: norths[3]! }).state;
    expect(pendingSeats(offered)).toEqual([1]);
    // A kong of North leaves only NNNN EEEE WWWW SS, and three Souths are out.
    const { state: after, events } = play(offered, 1, { type: 'claim', response: { type: 'expose', size: 4 } });
    expect(events.map((e) => e.type)).toEqual(['call', 'dead-hand', 'draw']);
    expect(events[1]).toMatchObject({ seat: 1, reason: { text: 'every hand that fits these exposures needs a pair of South Winds, and three of the four are already out' } });
    expect(after.phase).toMatchObject({ kind: 'turn', seat: 2 });
    expect(after.players[1]!.hand.length + after.players[1]!.exposures[0]!.tiles.length).toBe(14);
  });

  it('lets a lone live seat play on, and ends in a wall game once every hand is dead', () => {
    const lone = windsTable(3);
    lone.state.dead = [null, FAKE_DEAD, FAKE_DEAD, FAKE_DEAD];
    let state = play(lone.state, 0, { type: 'discard', tile: lone.west }).state;
    expect(state.phase).toMatchObject({ kind: 'turn', seat: 0 });
    expect(state.players[0]!.hand).toHaveLength(14);
    state = play(state, 0, { type: 'discard', tile: state.players[0]!.hand[0]! }).state;
    expect(state.phase).toMatchObject({ kind: 'turn', seat: 0 });

    // East and South both need NNNN EEEE WWWW SS; the third South goes out.
    const pick = picker();
    const souths = pick('WIND_SOUTH', 4);
    const allDead = playState(
      [
        [souths[2]!, ...pick('CHARACTER_1', 4), ...pick('CHARACTER_2', 4), ...pick('BAMBOO_2', 1)],
        [...pick('DOT_9', 4), ...pick('DOT_8', 1)],
        [souths[3]!, ...pick('BAMBOO_1', 4), ...pick('BAMBOO_3', 4), ...pick('DOT_4', 4)],
        [...pick('BAMBOO_4', 4), ...pick('BAMBOO_6', 4), ...pick('CHARACTER_8', 4), ...pick('DOT_3', 1)],
      ],
      pick('DOT_6', 2),
    );
    allDead.players[0]!.exposures = [{ key: 'WIND_WEST', tiles: pick('WIND_WEST', 4) }];
    allDead.players[1]!.exposures = [
      { key: 'WIND_NORTH', tiles: pick('WIND_NORTH', 4) },
      { key: 'WIND_EAST', tiles: pick('WIND_EAST', 4) },
    ];
    allDead.discards = [
      { tile: souths[0]!, seat: 2 },
      { tile: souths[1]!, seat: 3 },
    ];
    allDead.dead = [null, null, FAKE_DEAD, FAKE_DEAD];
    expect(deadHandReason(card, allDead, 0)).toBeNull();
    const { state: ended, events } = play(allDead, 0, { type: 'discard', tile: souths[2]! });
    expect(events.map((e) => [e.type, 'seat' in e ? e.seat : null])).toEqual([
      ['discard', 0],
      ['dead-hand', 0],
      ['dead-hand', 1],
      ['wall-game', null],
    ]);
    expect(ended.result).toMatchObject({ kind: 'wall', winner: null, payments: [0, 0, 0, 0] });
    expect(pendingSeats(ended)).toEqual([]);
  });

  it('starts everyone live and copes with games saved before dead hands existed', () => {
    const fresh = newGame(card, { seed: 5 });
    expect(fresh.dead).toEqual([null, null, null, null]);
    expect(playerView(card, fresh, 0).players.map((p) => p.dead)).toEqual([null, null, null, null]);
    const { state: legacy, lastSouth } = windsTable(3);
    delete legacy.dead;
    expect(pendingSeats(legacy)).toEqual([0]);
    const after = play(legacy, 0, { type: 'discard', tile: lastSouth }).state;
    expect(after.dead).toEqual([null, expect.objectContaining({ code: 'tiles-gone' }), null, null]);
  });
});

/**
 * South has exposed kongs of North and East (only NNNN EEEE WWWW SS fits) and holds one
 * West and one South. East is about to discard; South draws a West next.
 */
function explainTable() {
  const pick = picker();
  const older = pick('DOT_4', 1)[0]!;
  const [west, south, crak, joker] = [pick('WIND_WEST', 1)[0]!, pick('WIND_SOUTH', 1)[0]!, pick('CHARACTER_1', 1)[0]!, pick('JOKER', 1)[0]!];
  const east = [west, south, crak, joker, ...pick('CHARACTER_2', 4), ...pick('BAMBOO_2', 4), ...pick('DOT_2', 2)];
  const southSeat = [...pick('WIND_WEST', 1), ...pick('WIND_SOUTH', 1), ...pick('DOT_9', 1), ...pick('BAMBOO_7', 1), ...pick('CHARACTER_3', 1)];
  const westSeat = [...pick('BAMBOO_1', 4), ...pick('BAMBOO_3', 4), ...pick('DOT_1', 4), ...pick('CHARACTER_9', 1)];
  const north = [...pick('BAMBOO_4', 4), ...pick('BAMBOO_6', 4), ...pick('DOT_3', 4), ...pick('CHARACTER_8', 1)];
  const state = playState([east, southSeat, westSeat, north], [...pick('DOT_7', 2), ...pick('WIND_WEST', 1)]);
  state.players[1]!.exposures = [
    { key: 'WIND_NORTH', tiles: pick('WIND_NORTH', 4) },
    { key: 'WIND_EAST', tiles: pick('WIND_EAST', 4) },
  ];
  state.discards = [{ tile: older, seat: 3 }];
  return { state, older, west, south, crak, joker };
}

/** East discards a 5 Dot; West holds two and North holds one plus a joker. */
function fivesTable() {
  const pick = picker();
  const fives = pick('DOT_5', 4);
  const east = [fives[0]!, ...pick('CHARACTER_1', 4), ...pick('CHARACTER_2', 4), ...pick('BAMBOO_2', 4), ...pick('WIND_WEST', 1)];
  const south = [...pick('DOT_1', 4), ...pick('DOT_3', 4), ...pick('DOT_9', 4), ...pick('WIND_NORTH', 1)];
  const west = [fives[1]!, fives[2]!, ...pick('WIND_EAST', 1), ...pick('BAMBOO_1', 4), ...pick('BAMBOO_9', 4), ...pick('CHARACTER_9', 2)];
  const north = [fives[3]!, ...pick('JOKER', 1), ...pick('BAMBOO_3', 4), ...pick('BAMBOO_4', 4), ...pick('CHARACTER_8', 3)];
  const state = playState([east, south, west, north], pick('DOT_6', 3));
  return { state: play(state, 0, { type: 'discard', tile: fives[0]! }).state, five: fives[0]! };
}

describe('why can I (not) call this?', () => {
  it('says when there is nothing to call', () => {
    expect(explainClaim(card, newGame(card, { seed: 1 }), 2)).toMatchObject({ canCall: false, code: 'nothing-to-call', tile: null });
  });

  it('explains jokers, your own discard and discards whose moment has passed', () => {
    const t = explainTable();
    expect(explainClaim(card, t.state, 2)).toMatchObject({ canCall: false, code: 'too-late', tile: t.older });

    const jokerOut = play(t.state, 0, { type: 'discard', tile: t.joker }).state;
    expect(explainClaim(card, jokerOut, 2)).toMatchObject({ canCall: false, code: 'joker', text: expect.stringMatching(/^Jokers can never be called/) });

    const after = play(t.state, 0, { type: 'discard', tile: t.west }).state;
    expect(explainClaim(card, after, 0)).toMatchObject({ canCall: false, code: 'own-discard', tile: t.west });
    expect(explainClaim(card, after, 2, t.older)).toMatchObject({
      canCall: false,
      code: 'too-late',
      text: 'You can only call the most recent discard, and only before the next player draws. The chance to call the 4 Dot has passed.',
    });
  });

  it('explains a group you cannot fill, judged on the hand you had when the tile was thrown', () => {
    const t = explainTable();
    const after = play(t.state, 0, { type: 'discard', tile: t.west }).state;
    // South has drawn a second West since, but it held only one when the West was thrown.
    expect(after.phase).toMatchObject({ kind: 'turn', seat: 1 });
    expect(after.players[1]!.hand.filter((x) => keyOf(x) === 'WIND_WEST')).toHaveLength(2);
    expect(explainClaim(card, after, 1)).toEqual({
      canCall: false,
      code: 'not-enough-tiles',
      tile: t.west,
      canMahjong: false,
      sizes: [],
      text: "To call the West Wind, you lay it face up together with matching tiles from your hand. The smallest group it fits in a hand you can still make is a kong (4 of a kind), so you'd need three West Winds or jokers already in your hand, and you have one.",
    });
    expect(explainClaim(card, after, 2)).toMatchObject({
      code: 'not-enough-tiles',
      text: expect.stringMatching(/a pung \(3 of a kind\), so you'd need two West Winds or jokers already in your hand, and you have none\.$/),
    });
  });

  it('explains pairs and singles, and tiles that fit nothing left', () => {
    const t = explainTable();
    const southOut = play(t.state, 0, { type: 'discard', tile: t.south }).state;
    expect(explainClaim(card, southOut, 1)).toMatchObject({
      canCall: false,
      code: 'pair-or-single',
      text: 'In every hand you can still make, the South Wind would only be part of a pair or a single. You can only call a discard to finish a group of three or more matching tiles (a pung, kong, quint or sextet) that you lay face up, or when it gives you Mahjong.',
    });
    const crakOut = play(t.state, 0, { type: 'discard', tile: t.crak }).state;
    expect(explainClaim(card, crakOut, 1)).toMatchObject({
      canCall: false,
      code: 'no-fit',
      text: "The 1 Crak doesn't fit any hand you can still make with the groups you've already exposed.",
    });
  });

  it('explains that concealed hands only take a discard for Mahjong', () => {
    const tiny = cardFromSpec({
      id: 'explain-test-card',
      name: 'Test',
      description: 'Test',
      sections: [{ id: 's', label: 'S' }],
      hands: [
        { id: 'open', section: 's', pattern: 'FF 2222a 44a 66a 8888a', value: 25 },
        { id: 'secret', section: 's', pattern: 'NN EE WW SS DDa DDb DDc', value: 50, concealed: true },
      ],
    });
    const pick = picker();
    const red = pick('DRAGON_RED', 1)[0]!;
    const hands = [
      [red, ...pick('CHARACTER_1', 4), ...pick('CHARACTER_3', 4), ...pick('BAMBOO_1', 4), ...pick('BAMBOO_3', 1)],
      [...pick('DOT_1', 4), ...pick('DOT_3', 4), ...pick('DOT_5', 4), ...pick('DOT_7', 1)],
      [...pick('DRAGON_RED', 1), ...pick('WIND_NORTH', 2), ...pick('BAMBOO_5', 4), ...pick('BAMBOO_7', 4), ...pick('BAMBOO_9', 2)],
      [...pick('CHARACTER_5', 4), ...pick('CHARACTER_7', 4), ...pick('CHARACTER_9', 4), ...pick('DOT_9', 1)],
    ];
    const state = { ...playState(hands, pick('DOT_6', 2)), cardId: tiny.id };
    const after = play(state, 0, { type: 'discard', tile: red }, tiny).state;
    expect(explainClaim(tiny, after, 2)).toMatchObject({
      canCall: false,
      code: 'concealed-only',
      text: "Every hand you could still make with the Red Dragon is concealed (marked C on the card). A concealed hand has to be built from tiles you pick yourself, so you can only call a discard for it when it gives you Mahjong, and this one doesn't yet.",
    });
  });

  it('says yes to a call that finishes a group, and keeps track of who has answered', () => {
    const { state, five } = fivesTable();
    expect(pendingSeats(state)).toEqual([2, 3]);
    expect(explainClaim(card, state, 2)).toEqual({
      canCall: true,
      code: 'can-expose',
      tile: five,
      canMahjong: false,
      sizes: [3],
      text: "Yes, you can call the 5 Dot to make a pung (3 of a kind) and lay that group face up. You then discard a tile, and you'll need to finish a hand that uses that group.",
    });
    expect(explainClaim(card, state, 3)).toMatchObject({ canCall: true, code: 'can-expose', sizes: [3] });
    expect(explainClaim(card, state, 1)).toMatchObject({ canCall: false, code: 'not-enough-tiles' });

    const westPassed = play(state, 2, { type: 'claim', response: { type: 'pass' } }).state;
    expect(explainClaim(card, westPassed, 2)).toMatchObject({ canCall: false, code: 'too-late', text: "You've already answered on the 5 Dot, and that choice can't be changed now." });
    expect(explainClaim(card, westPassed, 3)).toMatchObject({ canCall: true });

    const called = play(westPassed, 3, { type: 'claim', response: { type: 'expose', size: 3 } }).state;
    expect(explainClaim(card, called, 2, five)).toMatchObject({ canCall: false, code: 'too-late', text: "Another player already called the 5 Dot, so it isn't in the discards any more." });

    const allPassed = play(westPassed, 3, { type: 'claim', response: { type: 'pass' } }).state;
    expect(allPassed.phase).toMatchObject({ kind: 'turn', seat: 1 });
    expect(explainClaim(card, allPassed, 2)).toMatchObject({
      canCall: false,
      code: 'too-late',
      text: "The chance to call the 5 Dot has passed: a discard can only be called right after it's thrown, before the next player draws.",
    });
  });

  it('says yes to a Mahjong call, and explains a dead hand', () => {
    const { state, lastOne } = lastOneTable();
    const offered = play(state, 0, { type: 'discard', tile: lastOne }).state;
    expect(explainClaim(card, offered, 1)).toMatchObject({
      canCall: true,
      code: 'mahjong',
      canMahjong: true,
      text: 'Yes! The 1 Dot completes your hand, so you can call it and declare Mahjong.',
    });
    const passed = play(offered, 1, { type: 'claim', response: { type: 'pass' } }).state;
    expect(explainClaim(card, passed, 1)).toMatchObject({
      canCall: false,
      code: 'dead-hand',
      text: 'Your hand is dead: every hand that fits these exposures needs a single 1 Dot, and all four are already out. You sit out the rest of this hand (no drawing, discarding or calling), but you still pay the winner like everyone else.',
    });
  });

  it('never disagrees with the engine about who may call', () => {
    let prompts = 0;
    for (let i = 0; i < 3; i++) {
      let state = newGame(card, { seed: 500 + i, skipCharleston: true });
      const random = rng(i);
      while (state.phase.kind !== 'ended') {
        const pending = pendingSeats(state);
        for (const s of SEATS) {
          const why = explainClaim(card, state, s);
          const prompted = state.phase.kind === 'claim' && pending.includes(s);
          expect(why.canCall).toBe(prompted);
          if (prompted) {
            prompts += 1;
            expect(promptFor(card, state, s)).toMatchObject({ sizes: why.sizes, canMahjong: why.canMahjong });
            expect(['mahjong', 'can-expose']).toContain(why.code);
          }
        }
        const seat = pending[0]!;
        state = applyAction(card, state, seat, botAction(card, state, seat, 'normal', random)).state;
      }
    }
    expect(prompts).toBeGreaterThan(5);
  });

  it('gives the same answer from a player’s own view of the table as from the whole game', () => {
    let checked = 0;
    for (let i = 0; i < 3; i++) {
      let state = newGame(card, { seed: 600 + i, skipCharleston: i > 0 });
      const random = rng(40 + i);
      while (state.phase.kind !== 'ended') {
        for (const s of SEATS) {
          const tiles = [undefined, ...state.discards.slice(-2).map((d) => d.tile)];
          for (const t of tiles) {
            expect(explainClaimForView(card, playerView(card, state, s), t)).toEqual(explainClaim(card, state, s, t));
            checked += 1;
          }
        }
        const pending = pendingSeats(state);
        const seat = pending[0]!;
        state = applyAction(card, state, seat, botAction(card, state, seat, 'normal', random)).state;
      }
    }
    expect(checked).toBeGreaterThan(500);
  });
});

describe('computer players and dead hands', () => {
  it('finish games normally: dead seats sit out, still pay, and nothing breaks', () => {
    let wins = 0;
    let deadHands = 0;
    const games = [...Array.from({ length: 16 }, (_, i) => i), 38];
    for (const i of games) {
      let state = newGame(card, { seed: 300 + i });
      const random = rng(i);
      const dead = new Set<Seat>();
      for (let step = 0; state.phase.kind !== 'ended'; step++) {
        expect(step).toBeLessThan(2000);
        const seat = pendingSeats(state)[0]!;
        expect(dead.has(seat)).toBe(false);
        const { state: next, events } = applyAction(card, state, seat, botAction(card, state, seat, 'normal', random));
        for (const e of events) {
          // Nobody draws, discards, calls, swaps or wins after their hand is dead.
          if ('seat' in e && e.type !== 'dead-hand') expect(dead.has(e.seat)).toBe(false);
          if (e.type === 'dead-hand') {
            dead.add(e.seat);
            deadHands += 1;
            expect(e.reason.text).not.toMatch(/undefined|\?/);
          }
        }
        state = next;
      }
      assertConserved(state);
      expect(state.result!.payments.reduce((a, b) => a + b, 0)).toBe(0);
      if (state.result!.kind === 'mahjong') {
        wins += 1;
        for (const s of dead) expect(state.result!.payments[s]).toBeLessThan(0);
      }
    }
    expect(deadHands).toBeGreaterThanOrEqual(3);
    expect(wins).toBeGreaterThanOrEqual(Math.ceil(games.length * 0.7));
  }, 30_000);
});
