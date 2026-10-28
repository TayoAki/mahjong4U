import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  TILE_FACES,
  analyze,
  arrangeWin,
  cardFromSpec,
  concreteHands,
  findWin,
  handsFittingExposures,
  isJoker,
  keyOf,
  newGame,
  patternText,
  registerCard,
  rng,
  runBots,
  validateCard,
  type BotLevel,
  type CardSpec,
  type ConcreteGroup,
  type Exposure,
  type GameState,
} from './index.ts';

// The 2026 card, as encoded in content/cards/card-2026.json from the owner's printed hand
// tracker. These tests pin every line to what the tracker prints (with the corrections
// noted below), and check the rules its notes spell out.

const file = join(import.meta.dirname, '../../../../content/cards/card-2026.json');
const card = cardFromSpec(JSON.parse(readFileSync(file, 'utf8')) as CardSpec);
registerCard(card);

/**
 * Every line as it prints in the app, in card order: id, how it reads, X or C, points.
 * Lines marked "corrected" differ from the printed tracker, whose line there has 13 or 15
 * tiles; each uses the 14-tile reading closest to the print and to its sibling lines.
 */
const LINES: [string, string, 'X' | 'C', number][] = [
  // 2026
  ['2026-1', '222 000 2222 6666', 'X', 25],
  ['2026-2', '2026 DDD 2222 DDD', 'X', 25],
  ['2026-3', 'FFF 2026 222 6666', 'X', 25],
  ['2026-4', '22 00 222 666 NEWS', 'X', 30],
  // 2468
  ['2468-1', '222 444 6666 8888', 'X', 25],
  ['2468-2', '222 444 6666 8888', 'X', 25],
  ['2468-3', 'FF 2222 44 66 8888', 'X', 25],
  ['2468-4', 'EE 22 444 666 88 WW', 'X', 30],
  ['2468-5', '2222 DDD 8888 DDD', 'X', 30],
  ['2468-6', 'FFF 22 44 666 8888', 'X', 25],
  ['2468-7', '2468 2222 D 2222 D', 'X', 25],
  ['2468-8', 'FFF 2468 FFF 2222', 'X', 30],
  ['2468-9', 'FF 246 888 246 888', 'C', 30],
  // Any Like Number
  ['like-1', '1111 FFFFFF 1111', 'X', 30],
  ['like-2', '1111 D 111 D 1111 D', 'X', 25],
  ['like-3', 'FF 1111 11 1111 DD', 'X', 25],
  // Quints
  ['quints-1', '11111 1111 11111', 'X', 40],
  ['quints-2', 'FF 11111 22 33333', 'X', 45],
  ['quints-3', '11111 44444 DDDD', 'X', 40],
  // Consecutive Run
  ['run-1', '11 222 33 444 5555', 'X', 25],
  ['run-2', '55 666 77 888 9999', 'X', 25],
  ['run-3', 'FFF 1111 234 5555', 'X', 25],
  ['run-4', 'FFF 1111 234 5555', 'X', 25],
  ['run-5', '11 22 111 222 3333', 'X', 25],
  ['run-6', '111 222 3333 4444', 'X', 25], // corrected: printed 111 222 333 4444 (13 tiles)
  ['run-7', '111 222 3333 4444', 'X', 25], // corrected: printed 111 222 333 4444 (13 tiles)
  ['run-8', 'FFF 11 22 333 DDDD', 'X', 25],
  ['run-9', 'FFF 11 22 333 DDDD', 'X', 25],
  ['run-10', '1111 FFFFFF 2222', 'X', 30],
  ['run-11', 'FF 1111 2222 3333', 'X', 25],
  ['run-12', 'FF 1111 2222 3333', 'X', 25],
  ['run-13', '111 222 3333 4444', 'X', 25], // corrected: printed 11 222 3333 4444 (13 tiles)
  ['run-14', '122 333 122 333 44', 'C', 35],
  // 13579
  ['13579-1', '11 333 55 777 9999', 'X', 25],
  ['13579-2', '11 333 55 777 9999', 'X', 25],
  ['13579-3', '111 333 3333 5555', 'X', 25],
  ['13579-4', '555 777 7777 9999', 'X', 25],
  ['13579-5', 'NN 1111 33 5555 SS', 'X', 30],
  ['13579-6', 'NN 5555 77 9999 SS', 'X', 30],
  ['13579-7', '113579 1111 1111', 'X', 25],
  ['13579-8', 'FFF 11 33 555 DDDD', 'X', 25],
  ['13579-9', 'FFF 55 77 999 DDDD', 'X', 25],
  ['13579-10', '11 33 111 333 5555', 'X', 25],
  ['13579-11', '55 77 555 777 9999', 'X', 25],
  ['13579-12', '1111 33 55 77 9999', 'X', 30],
  ['13579-13', '1111 33 55 77 9999', 'X', 30],
  ['13579-14', 'FF 11 33 55 111 111', 'C', 35],
  ['13579-15', 'FF 55 77 99 555 555', 'C', 35],
  ['13579-16', 'FF 135 777 999 DDD', 'C', 30],
  // Winds - Dragons
  ['winds-1', 'NNNN EEE WWW SSSS', 'X', 25], // corrected: printed NNNN EEE WWWW SSSS (15 tiles)
  ['winds-2', 'NNN EEEE WWWW SSS', 'X', 25],
  ['winds-3', '1234 DDD DDD DDDD', 'X', 25],
  ['winds-4', 'NNN 1111 1111 SSS', 'X', 25],
  ['winds-5', 'EEE 2222 2222 WWW', 'X', 25],
  ['winds-6', 'FFF NNNN FFF DDDD', 'X', 25],
  ['winds-7', '1 N 2 EE 3 WWW 4 SSSS', 'X', 25],
  ['winds-8', 'FF NNNN SSSS DD DD', 'X', 25],
  ['winds-9', 'FF EEEE WWWW DD DD', 'X', 25],
  ['winds-10', 'NN EEE 2026 WWW SS', 'C', 30],
  // 369
  ['369-1', '333 666 6666 9999', 'X', 25],
  ['369-2', '333 666 6666 9999', 'X', 25],
  ['369-3', '33 66 333 666 9999', 'X', 25],
  ['369-4', 'FFF 33 666 99 DDDD', 'X', 25],
  ['369-5', 'FFF 33 666 99 DDDD', 'X', 25],
  ['369-6', '33 66 666 999 NEWS', 'X', 25],
  ['369-7', 'FF 3369 3333 3333', 'X', 25],
  ['369-8', 'FF 333 666 999 369', 'C', 30],
  // Singles and Pairs
  ['pairs-1', 'NN EE WW SS 1D 1D 1D', 'C', 50],
  ['pairs-2', '2 4 66 88 2 4 66 88 88', 'C', 50],
  ['pairs-3', 'FF 3369 3369 3369', 'C', 50],
  ['pairs-4', '11 22 33 44 55 66 77', 'C', 50],
  ['pairs-5', '11 357 99 11 357 99', 'C', 50],
  ['pairs-6', 'FF 2026 2026 2026', 'C', 50],
];

/**
 * How many suits each line uses. Where the tracker's colours and its "Any N Suits" note
 * disagree (run-12, 13579-2, 13579-13, pairs-3), this follows the colours.
 */
const SUITS_USED: Record<string, number> = {
  '2026-1': 2, '2026-2': 2, '2026-3': 3, '2026-4': 2,
  '2468-1': 1, '2468-2': 2, '2468-3': 2, '2468-4': 1, '2468-5': 2, '2468-6': 1, '2468-7': 3, '2468-8': 2, '2468-9': 2,
  'like-1': 2, 'like-2': 3, 'like-3': 3,
  'quints-1': 3, 'quints-2': 1, 'quints-3': 1,
  'run-1': 1, 'run-2': 1, 'run-3': 1, 'run-4': 2, 'run-5': 3, 'run-6': 1, 'run-7': 2, 'run-8': 1, 'run-9': 2, 'run-10': 1, 'run-11': 1, 'run-12': 3, 'run-13': 3, 'run-14': 2,
  '13579-1': 1, '13579-2': 2, '13579-3': 2, '13579-4': 2, '13579-5': 1, '13579-6': 1, '13579-7': 3, '13579-8': 1, '13579-9': 1, '13579-10': 3, '13579-11': 3, '13579-12': 1, '13579-13': 3, '13579-14': 3, '13579-15': 3, '13579-16': 1,
  'winds-1': 0, 'winds-2': 0, 'winds-3': 1, 'winds-4': 2, 'winds-5': 2, 'winds-6': 0, 'winds-7': 1, 'winds-8': 0, 'winds-9': 0, 'winds-10': 1,
  '369-1': 2, '369-2': 3, '369-3': 3, '369-4': 1, '369-5': 1, '369-6': 2, '369-7': 3, '369-8': 2,
  'pairs-1': 3, 'pairs-2': 3, 'pairs-3': 3, 'pairs-4': 1, 'pairs-5': 2, 'pairs-6': 3,
};

const hand = (id: string) => card.hands.find((h) => h.id === id)!;
const SUIT_OF_FACE = (face: string) => (/^(DOT|BAMBOO|CHARACTER)_/.exec(face) ?? [])[1];

/** Builds hands from faces so each test gets distinct tile ids. */
function tableTiles() {
  const used = new Set<number>();
  return (face: string, n: number, allowShort = false): number[] => {
    const out: number[] = [];
    for (let t = 0; t < TILE_FACES.length && out.length < n; t++) {
      const f = TILE_FACES[t]!;
      if (!used.has(t) && (face === 'FLOWER' ? f.startsWith('FLOWER_') : f === face)) {
        used.add(t);
        out.push(t);
      }
    }
    if (out.length < n && !allowShort) throw new Error(`not enough ${face}`);
    return out;
  };
}

/** A hand as [face, count] groups, with `jokers` jokers added. */
function tiles(groups: [string, number][], jokers = 0): number[] {
  const take = tableTiles();
  return [...groups.flatMap(([face, n]) => take(face, n)), ...take('JOKER', jokers)];
}

/**
 * The tiles for one concrete hand. Pairs and singles take naturals first; groups of three
 * or more fill up with jokers when the naturals run out (quints) and, with `jokerEach`, put
 * one joker in every group of three or more.
 */
function tilesFor(groups: readonly ConcreteGroup[], jokerEach = false): number[] {
  const take = tableTiles();
  const order = [...groups].sort((a, b) => Number(a.jokerable) - Number(b.jokerable));
  const out: number[] = [];
  for (const g of order) {
    const wantJoker = jokerEach && g.jokerable ? 1 : 0;
    const naturals = take(g.face, g.n - wantJoker, g.jokerable);
    const jokers = take('JOKER', g.n - naturals.length);
    out.push(...naturals, ...jokers);
  }
  return out;
}

const winner = (groups: [string, number][], jokers = 0, exposures: Exposure[] = []) => findWin(card, tiles(groups, jokers), exposures)?.concrete.hand.id ?? null;

describe('the 2026 card', () => {
  it('loads, passes the same checks as the house card, and names itself', () => {
    expect(validateCard(card)).toEqual([]);
    expect(card.id).toBe('card-2026');
    expect(card.name).toBe('2026 card');
    expect(card.description).toMatch(/not affiliated with or endorsed by the National Mah Jongg League/);
  });

  it('has the sections of the printed card, in order, with as many hands as each shows', () => {
    expect(card.sections.map((s) => s.label)).toEqual(['2026', '2468', 'Any Like Number', 'Quints', 'Consecutive Run', '13579', 'Winds – Dragons', '369', 'Singles and Pairs']);
    const counts = card.sections.map((s) => card.hands.filter((h) => h.section === s.id).length);
    expect(counts).toEqual([4, 9, 3, 3, 14, 16, 10, 8, 6]);
    expect(card.hands).toHaveLength(73);
  });

  it('prints every line as the card does, with its X or C and points', () => {
    expect(card.hands.map((h) => [h.id, patternText(h.pattern), h.concealed ? 'C' : 'X', h.value])).toEqual(LINES);
    for (const h of card.hands) expect(h.note, h.id).toBeTruthy();
  });

  it('uses as many suits as each line says', () => {
    for (const h of card.hands) {
      for (const c of concreteHands(card).filter((x) => x.hand === h)) {
        const suits = new Set(c.groups.map((g) => SUIT_OF_FACE(g.face)).filter(Boolean));
        expect(suits.size, `${h.id} ${c.label}`).toBe(SUITS_USED[h.id]);
      }
    }
  });

  it('never lets two lines accept the same tiles', () => {
    const owner = new Map<string, string>();
    for (const c of concreteHands(card)) {
      const counts = new Map<string, number>();
      for (const g of c.groups) counts.set(g.face, (counts.get(g.face) ?? 0) + g.n);
      const key = [...counts].sort().join();
      expect(owner.get(key) ?? c.hand.id, key).toBe(c.hand.id);
      owner.set(key, c.hand.id);
    }
  });

  it('recognises every way to make every line as a win of that line, with and without jokers', () => {
    const concrete = concreteHands(card);
    expect(concrete.length).toBeGreaterThan(1000);
    for (const c of concrete) {
      const natural = tilesFor(c.groups);
      const win = findWin(card, natural, []);
      expect(win?.concrete.hand.id, `${c.hand.id} ${c.label}`).toBe(c.hand.id);
      if (c.groups.some((g) => g.jokerable)) {
        // Jokers can make the same tiles fit a second line too; the player then scores the
        // better one. Either way this line must be complete, and the win lays out by it.
        const withJokers = tilesFor(c.groups, true);
        const jokerWin = findWin(card, withJokers, []);
        expect(jokerWin?.jokerless, `${c.hand.id} ${c.label} with jokers`).toBe(false);
        expect(jokerWin!.concrete.hand.value).toBeGreaterThanOrEqual(c.hand.value);
        expect(analyze(card, withJokers, []).some((f) => f.distance === 0 && f.concrete === c), `${c.hand.id} ${c.label} with jokers`).toBe(true);
        const laid = arrangeWin(card, c.hand.id, c.label, withJokers, []);
        expect(laid?.map((g) => g.length), `${c.hand.id} ${c.label} layout`).toEqual(c.groups.map((g) => g.n));
      }
    }
  }, 60_000);
});

describe('rules from the notes', () => {
  it('2026 with dragons: the kong is 2s or 6s, never 4s', () => {
    const base: [string, number][] = [
      ['DOT_2', 2],
      ['DRAGON_WHITE', 1],
      ['DOT_6', 1],
      ['DRAGON_WHITE', 3],
      ['DRAGON_GREEN', 3],
    ];
    expect(winner([...base, ['BAMBOO_2', 4]])).toBe('2026-2');
    expect(winner([...base, ['BAMBOO_6', 4]])).toBe('2026-2');
    expect(winner([...base, ['BAMBOO_4', 4]])).toBeNull();
    // Each suit's dragons must match it.
    expect(winner([['DOT_2', 2], ['DRAGON_WHITE', 1], ['DOT_6', 1], ['DRAGON_RED', 3], ['DRAGON_GREEN', 3], ['BAMBOO_2', 4]])).toBeNull();
  });

  it('like kongs of 2, 4, 6 or 8 only', () => {
    const like = (n: number): [string, number][] => [
      ['DOT_2', 1],
      ['DOT_4', 1],
      ['DOT_6', 1],
      ['DOT_8', 1],
      [`BAMBOO_${n}`, 4],
      ['DRAGON_GREEN', 1],
      [`CHARACTER_${n}`, 4],
      ['DRAGON_RED', 1],
    ];
    for (const n of [2, 4, 6, 8]) expect(winner(like(n))).toBe('2468-7');
    for (const n of [1, 3, 5, 7, 9]) expect(winner(like(n))).toBeNull();
    // The kongs must be alike.
    expect(winner([['DOT_2', 1], ['DOT_4', 1], ['DOT_6', 1], ['DOT_8', 1], ['BAMBOO_2', 4], ['DRAGON_GREEN', 1], ['CHARACTER_4', 4], ['DRAGON_RED', 1]])).toBeNull();
    const kong = (n: number): [string, number][] => [['FLOWER', 6], ['DOT_2', 1], ['DOT_4', 1], ['DOT_6', 1], ['DOT_8', 1], [`CHARACTER_${n}`, 4]];
    expect(winner(kong(8))).toBe('2468-8');
    expect(winner(kong(3))).toBeNull();
  });

  it('like odd numbers with North and South; like even numbers with East and West', () => {
    const odd = (n: number): [string, number][] => [['WIND_NORTH', 3], [`DOT_${n}`, 4], [`BAMBOO_${n}`, 4], ['WIND_SOUTH', 3]];
    for (const n of [1, 3, 5, 7, 9]) expect(winner(odd(n))).toBe('winds-4');
    for (const n of [2, 4, 6, 8]) expect(winner(odd(n))).toBeNull();
    const even = (n: number): [string, number][] => [['WIND_EAST', 3], [`DOT_${n}`, 4], [`CHARACTER_${n}`, 4], ['WIND_WEST', 3]];
    for (const n of [2, 4, 6, 8]) expect(winner(even(n))).toBe('winds-5');
    for (const n of [1, 3, 5, 7, 9]) expect(winner(even(n))).toBeNull();
  });

  it('pair any odd number (or 3, 6, 9) with kongs that match the pair', () => {
    const odd = (pair: number, kongs: number): [string, number][] => [
      ...[1, 3, 5, 7, 9].map((n): [string, number] => [`BAMBOO_${n}`, n === pair ? 2 : 1]),
      [`DOT_${kongs}`, 4],
      [`CHARACTER_${kongs}`, 4],
    ];
    for (const n of [1, 3, 5, 7, 9]) expect(winner(odd(n, n))).toBe('13579-7');
    expect(winner(odd(3, 5))).toBeNull();
    const t = (pair: number, kongs: number): [string, number][] => [
      ['FLOWER', 2],
      ...[3, 6, 9].map((n): [string, number] => [`DOT_${n}`, n === pair ? 2 : 1]),
      [`BAMBOO_${kongs}`, 4],
      [`CHARACTER_${kongs}`, 4],
    ];
    for (const n of [3, 6, 9]) expect(winner(t(n, n))).toBe('369-7');
    expect(winner(t(6, 3))).toBeNull();
  });

  it('matching and opposite dragons', () => {
    const t369 = (dragon: string): [string, number][] => [['FLOWER', 3], ['DOT_3', 2], ['DOT_6', 3], ['DOT_9', 2], [dragon, 4]];
    expect(winner(t369('DRAGON_WHITE'))).toBe('369-4');
    expect(winner(t369('DRAGON_GREEN'))).toBe('369-5');
    expect(winner(t369('DRAGON_RED'))).toBe('369-5');
    const odd = (dragon: string): [string, number][] => [['FLOWER', 2], ['BAMBOO_1', 1], ['BAMBOO_3', 1], ['BAMBOO_5', 1], ['BAMBOO_7', 3], ['BAMBOO_9', 3], [dragon, 3]];
    expect(winner(odd('DRAGON_RED'))).toBe('13579-16');
    expect(winner(odd('DRAGON_GREEN'))).toBeNull();
    const matching = (dragon: string): [string, number][] => [['FLOWER', 3], ['CHARACTER_1', 2], ['CHARACTER_3', 2], ['CHARACTER_5', 3], [dragon, 4]];
    expect(winner(matching('DRAGON_RED'))).toBe('13579-8');
    expect(winner(matching('DRAGON_WHITE'))).toBeNull();
    const quints = (dragon: string): [string, number][] => [['DOT_2', 4], ['DOT_7', 4], [dragon, 4]];
    expect(winner(quints('DRAGON_RED'), 2)).toBe('quints-3');
    expect(winner(quints('DRAGON_GREEN'), 2)).toBe('quints-3');
    expect(winner(quints('DRAGON_WHITE'), 2)).toBeNull();
  });

  it('dragons that match the middle number of a run', () => {
    const run = (dragon: string): [string, number][] => [['FLOWER', 3], ['DOT_4', 2], ['BAMBOO_5', 2], ['DOT_6', 3], [dragon, 4]];
    expect(winner(run('DRAGON_GREEN'))).toBe('run-9');
    expect(winner(run('DRAGON_WHITE'))).toBeNull();
  });

  it('any dragon, any wind, any two dragons, all three dragons', () => {
    for (const dragon of ['DRAGON_RED', 'DRAGON_GREEN', 'DRAGON_WHITE']) {
      expect(winner([['FLOWER', 2], ['DOT_5', 4], ['BAMBOO_5', 2], ['CHARACTER_5', 4], [dragon, 2]])).toBe('like-3');
      for (const wind of ['WIND_NORTH', 'WIND_EAST', 'WIND_WEST', 'WIND_SOUTH']) {
        expect(winner([['FLOWER', 6], [wind, 4], [dragon, 4]])).toBe('winds-6');
      }
      const others = ['DRAGON_RED', 'DRAGON_GREEN', 'DRAGON_WHITE'].filter((d) => d !== dragon);
      expect(winner([['CHARACTER_6', 1], ['CHARACTER_7', 1], ['CHARACTER_8', 1], ['CHARACTER_9', 1], [others[0]!, 3], [others[1]!, 3], [dragon, 4]])).toBe('winds-3');
    }
    expect(winner([['FLOWER', 2], ['WIND_NORTH', 4], ['WIND_SOUTH', 4], ['DRAGON_RED', 2], ['DRAGON_WHITE', 2]])).toBe('winds-8');
    expect(winner([['FLOWER', 2], ['WIND_NORTH', 4], ['WIND_SOUTH', 4], ['DRAGON_RED', 4]])).toBeNull();
  });

  it('named winds only, and these numbers only', () => {
    expect(winner([['WIND_EAST', 2], ['DOT_2', 2], ['DOT_4', 3], ['DOT_6', 3], ['DOT_8', 2], ['WIND_WEST', 2]])).toBe('2468-4');
    expect(winner([['WIND_NORTH', 2], ['DOT_2', 2], ['DOT_4', 3], ['DOT_6', 3], ['DOT_8', 2], ['WIND_SOUTH', 2]])).toBeNull();
    expect(winner([['WIND_NORTH', 2], ['BAMBOO_1', 4], ['BAMBOO_3', 2], ['BAMBOO_5', 4], ['WIND_SOUTH', 2]])).toBe('13579-5');
    expect(winner([['WIND_EAST', 2], ['BAMBOO_1', 4], ['BAMBOO_3', 2], ['BAMBOO_5', 4], ['WIND_WEST', 2]])).toBeNull();
    const ladder = (from: number): [string, number][] => [
      [`DOT_${from}`, 1],
      ['WIND_NORTH', 1],
      [`DOT_${from + 1}`, 1],
      ['WIND_EAST', 2],
      [`DOT_${from + 2}`, 1],
      ['WIND_WEST', 3],
      [`DOT_${from + 3}`, 1],
      ['WIND_SOUTH', 4],
    ];
    expect(winner(ladder(1))).toBe('winds-7');
    expect(winner(ladder(2))).toBeNull();
    const fiveRun = (from: number): [string, number][] => [0, 1, 2, 3, 4].map((k): [string, number] => [`CHARACTER_${from + k}`, [2, 3, 2, 3, 4][k]!]);
    expect(winner(fiveRun(1))).toBe('run-1');
    expect(winner(fiveRun(5))).toBe('run-2');
    expect(winner(fiveRun(2))).toBeNull();
  });

  it('any 7 consecutive pairs, and any 5 consecutive numbers', () => {
    const pairs = (from: number): [string, number][] => [0, 1, 2, 3, 4, 5, 6].map((k): [string, number] => [`BAMBOO_${from + k}`, 2]);
    for (const from of [1, 2, 3]) expect(winner(pairs(from))).toBe('pairs-4');
    expect(winner([...pairs(1).slice(0, 6), ['BAMBOO_9', 2]])).toBeNull();
    const five = (from: number): [string, number][] => [['FLOWER', 3], [`DOT_${from}`, 4], [`DOT_${from + 1}`, 1], [`DOT_${from + 2}`, 1], [`DOT_${from + 3}`, 1], [`DOT_${from + 4}`, 4]];
    for (const from of [1, 3, 5]) expect(winner(five(from))).toBe('run-3');
  });

  it('keeps concealed hands concealed, and lets exposed hands be called', () => {
    const take = tableTiles();
    // FF 246 888 246 888 (C): fine from the rack, not with an exposed pung.
    const pung = { key: 'DOT_8', tiles: take('DOT_8', 3) };
    const rest = [...take('FLOWER', 2), ...take('DOT_2', 1), ...take('DOT_4', 1), ...take('DOT_6', 1), ...['BAMBOO_2', 'BAMBOO_4', 'BAMBOO_6'].flatMap((f) => take(f, 1)), ...take('BAMBOO_8', 3)];
    expect(findWin(card, [...rest, ...pung.tiles], [])?.concrete.hand.id).toBe('2468-9');
    expect(findWin(card, rest, [pung])).toBeNull();
    // FF 11 33 55 111 111 (C) likewise.
    const take1 = tableTiles();
    const ones = { key: 'CHARACTER_1', tiles: take1('CHARACTER_1', 3) };
    const others = [...take1('FLOWER', 2), ...take1('DOT_1', 2), ...take1('DOT_3', 2), ...take1('DOT_5', 2), ...take1('BAMBOO_1', 3)];
    expect(findWin(card, [...others, ...ones.tiles], [])?.concrete.hand.id).toBe('13579-14');
    expect(findWin(card, others, [ones])).toBeNull();
    // A seat that has exposed can no longer be offered calls toward concealed hands: 13579-14 needs
    // a pung of 1 Crak, but with a kong of 8 Bams exposed only open hands count.
    const fits = handsFittingExposures(card, [{ key: 'BAMBOO_8', tiles: take1('BAMBOO_8', 4) }]);
    expect(fits.length).toBeGreaterThan(0);
    expect(fits.every((f) => !f.concrete.hand.concealed)).toBe(true);

    // 222 444 6666 8888 (X) with the kong of 8s exposed.
    const take2 = tableTiles();
    const kong = { key: 'BAMBOO_8', tiles: [...take2('BAMBOO_8', 3), ...take2('JOKER', 1)] };
    const concealed = [...take2('BAMBOO_2', 3), ...take2('BAMBOO_4', 2), ...take2('JOKER', 1), ...take2('BAMBOO_6', 4)];
    expect(findWin(card, concealed, [kong])?.concrete.hand.id).toBe('2468-1');
  });
});

describe('computer players on the 2026 card', () => {
  function assertConserved(state: GameState) {
    const all = [...state.wall, ...state.discards.map((d) => d.tile), ...state.players.flatMap((p) => [...p.hand, ...p.exposures.flatMap((e) => e.tiles)])];
    expect(all).toHaveLength(152);
    expect(new Set(all).size).toBe(152);
  }

  it.each([
    ['normal', 6],
    ['hard', 2],
  ] as [BotLevel, number][])('%s bots finish games: they end, tiles are conserved and payments balance', (level, games) => {
    let wins = 0;
    for (let i = 0; i < games; i++) {
      const state = runBots(card, newGame(card, { seed: 2026 + i }), { 0: level, 1: level, 2: level, 3: level }, rng(i));
      expect(state.phase.kind).toBe('ended');
      assertConserved(state);
      expect(state.result!.payments.reduce((a, b) => a + b, 0)).toBe(0);
      if (state.result!.kind === 'mahjong') {
        wins += 1;
        const winnerSeat = state.result!.winner!;
        const me = state.players[winnerSeat]!;
        const win = findWin(card, me.hand, me.exposures)!;
        expect(win.concrete.hand.id).toBe(state.result!.handId);
        expect(card.hands.some((h) => h.id === state.result!.handId)).toBe(true);
        const laid = arrangeWin(card, state.result!.handId!, state.result!.assignment!, me.hand, me.exposures)!;
        expect(laid.flat()).toHaveLength(14);
        // Jokers only ever stand in groups of three or more.
        for (const g of laid) if (g.some(isJoker)) expect(g.length).toBeGreaterThanOrEqual(3);
        expect(laid.every((g) => g.filter((t) => !isJoker(t)).every((t) => keyOf(t) === keyOf(g.find((x) => !isJoker(x))!)))).toBe(true);
      }
    }
    expect(wins).toBeGreaterThan(0);
  }, 60_000);
});
