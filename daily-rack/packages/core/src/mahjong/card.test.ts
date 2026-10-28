import { describe, expect, it } from 'vitest';
import {
  HOUSE_CARD,
  TILE_FACES,
  arrangeWin,
  cardFromSpec,
  cardToSpec,
  concretize,
  findWin,
  parseGroups,
  parsePattern,
  parseToken,
  patternPieces,
  patternText,
  validateCard,
  type Card,
  type CardSpec,
} from './index.ts';

// The pattern language beyond single groups: tokens that print several groups together,
// rule tokens that limit a variable's numbers, free numbers (p, q), and hands that can be
// made more than one way.

function cardOf(...hands: { pattern: string; concealed?: boolean }[]): Card {
  return cardFromSpec({
    id: `test-${Math.random()}`,
    name: 'Test card',
    description: '',
    sections: [{ id: 's', label: 'S' }],
    hands: hands.map((h, i) => ({ id: `h${i + 1}`, section: 's', value: 25, ...h })),
  } satisfies CardSpec);
}

function only(pattern: string) {
  return cardOf({ pattern }).hands[0]!;
}

/** Tiles for a hand given as [face, count] pairs, plus jokers. */
function tiles(groups: [string, number][], jokers = 0): number[] {
  const used = new Set<number>();
  const take = (face: string, n: number) => {
    const out: number[] = [];
    for (let t = 0; t < TILE_FACES.length && out.length < n; t++) {
      const f = TILE_FACES[t]!;
      if (!used.has(t) && (face === 'FLOWER' ? f.startsWith('FLOWER_') : f === face)) {
        used.add(t);
        out.push(t);
      }
    }
    if (out.length < n) throw new Error(`not enough ${face}`);
    return out;
  };
  return [...groups.flatMap(([face, n]) => take(face, n)), ...take('JOKER', jokers)];
}

describe('tokens that print several groups together', () => {
  it('splits a token into runs of one symbol, each a group in the token suit', () => {
    const shape = (token: string) => parseGroups(token).map((g) => [g.tile.k, g.n, 's' in g.tile ? g.tile.s : null]);
    expect(shape('2026a')).toEqual([
      ['num', 1, 'a'],
      ['soap', 1, null],
      ['num', 1, 'a'],
      ['num', 1, 'a'],
    ]);
    expect(parseGroups('113579b').map((g) => [g.tile.k === 'num' && g.tile.rank, g.n])).toEqual([
      [1, 2],
      [3, 1],
      [5, 1],
      [7, 1],
      [9, 1],
    ]);
    expect(shape('1Dc')).toEqual([
      ['num', 1, 'c'],
      ['dragon', 1, 'c'],
    ]);
    expect(parseGroups('NEWS').map((g) => g.tile.k === 'wind' && g.tile.w)).toEqual(['NORTH', 'EAST', 'WEST', 'SOUTH']);
    expect(parseGroups('xyzua').map((g) => g.tile.k === 'var' && g.tile.offset)).toEqual([0, 1, 2, 3]);
    // A plain group is still one group.
    expect(parseGroups('4444b')).toEqual([parseToken('4444b')]);
  });

  it('rejects mixtures that could not be printed on a card', () => {
    // Flowers and winds never take a suit; numbers and dragons always do.
    for (const bad of ['F2a', '2Na', 'N2', '20', 'DN', 'Fa', 'NEWSa', 'x2']) expect(() => parseGroups(bad)).toThrow(/bad pattern token/);
    // parseToken itself still reads exactly one group.
    expect(() => parseToken('42a')).toThrow();
  });

  it('matches exactly like the same groups written apart', () => {
    const together = concretize(only('FF 2026a 2026b 2026c'));
    const apart = concretize(only('FF 2a 0 2a 6a 2b 0 2b 6b 2c 0 2c 6c'));
    expect(together.map((c) => c.groups)).toEqual(apart.map((c) => c.groups));
  });
});

describe('rule tokens and free numbers', () => {
  it('limits a run start to the numbers a rule lists', () => {
    const odd = concretize(only('NNN xxxxa xxxxb SSS x=13579'));
    expect(odd.map((c) => c.label.match(/X=(\d)/)![1]).sort()).toEqual(['1', '1', '1', '3', '3', '3', '5', '5', '5', '7', '7', '7', '9', '9', '9']);
    const kongs = concretize(only('FFF 2468a FFF xxxxb x=2468'));
    expect(new Set(kongs.map((c) => c.groups.at(-1)!.face.split('_')[1]))).toEqual(new Set(['2', '4', '6', '8']));
  });

  it('keeps a whole run within 1-9 when a rule allows a start that would run off the end', () => {
    // x=789 with y and z in the run: only 7 8 9 fits.
    const runs = concretize(only('FF xxxxa yyyya zzzza x=789'));
    expect(runs.map((c) => c.label)).toEqual(['a=DOT X=7', 'a=BAMBOO X=7', 'a=CHARACTER X=7']);
  });

  it('gives free numbers different values, each within its own rule', () => {
    const quints = concretize(only('pppppa qqqqqa DDDDb'));
    // 36 pairs of different numbers, 3 suits for the numbers, 2 dragons that don't match.
    expect(quints).toHaveLength(216);
    for (const c of quints) expect(c.groups[0]!.face).not.toBe(c.groups[1]!.face);
    const evenOdd = concretize(only('FF ppppa ppppb qqqqa p=2468 q=13579'));
    // 4 even numbers, 5 odd ones, and 6 ways to pick the two suits.
    expect(evenOdd).toHaveLength(120);
    for (const c of evenOdd) {
      expect(Number(c.groups[1]!.face.split('_')[1]) % 2).toBe(0);
      expect(Number(c.groups[3]!.face.split('_')[1]) % 2).toBe(1);
    }
  });

  it('rejects rules it cannot use', () => {
    expect(() => parsePattern('NNN 1111a 1111b SSS x=13579')).toThrow(/doesn't use/);
    expect(() => parsePattern('xxxxa yyyya y=2')).toThrow(/bad number rule/);
    expect(() => parsePattern('xxxxa x=0')).toThrow(/bad number rule/);
    expect(() => parsePattern('xxxxa x=1 x=2')).toThrow(/two rules/);
    expect(() => parsePattern('xxxxa x=')).toThrow(/bad number rule/);
    expect(() => parsePattern('FF x=13')).toThrow();
  });
});

describe('hands with several ways', () => {
  const pairAnyOdd = '113579a 1111b 1111c | 133579a 3333b 3333c | 135579a 5555b 5555c | 135779a 7777b 7777c | 135799a 9999b 9999c';

  it('parses each way and keeps the first as the hand shown on the card', () => {
    const h = only(pairAnyOdd);
    expect(h.ways).toHaveLength(5);
    expect(h.groups).toBe(h.ways[0]!.groups);
    expect(h.pattern).toBe(pairAnyOdd);
    expect(() => parsePattern('FF 2222a |')).toThrow(/empty way/);
  });

  it('labels every concrete hand uniquely, naming its way', () => {
    const concrete = concretize(only(pairAnyOdd));
    expect(concrete).toHaveLength(15);
    expect(new Set(concrete.map((c) => c.label)).size).toBe(15);
    expect(concrete[0]!.label).toBe('#1 a=DOT b=BAMBOO c=CHARACTER');
    // One-way hands keep their old labels.
    expect(concretize(HOUSE_CARD.hands.find((h) => h.id === 'ln1')!)[0]!.label).toBe('a=DOT b=BAMBOO c=CHARACTER X=1');
  });

  it('drops ways that repeat another way', () => {
    // DDa and DDc are the same hand once suits are chosen (both kongs are alike).
    expect(concretize(only('FF xxxxa xxb xxxxc DDa | FF xxxxa xxb xxxxc DDc'))).toHaveLength(concretize(only('FF xxxxa xxb xxxxc DDa')).length);
  });

  it('wins with any way and lays the win out by that way', () => {
    const card = cardOf({ pattern: pairAnyOdd });
    const hand = tiles([
      ['DOT_1', 1],
      ['DOT_3', 1],
      ['DOT_5', 1],
      ['DOT_7', 2],
      ['DOT_9', 1],
      ['BAMBOO_7', 4],
      ['CHARACTER_7', 3],
    ], 1);
    const win = findWin(card, hand, [])!;
    expect(win.concrete.label).toMatch(/^#4 /);
    const groups = arrangeWin(card, 'h1', win.concrete.label, hand, [])!;
    expect(groups.map((g) => g.length)).toEqual([1, 1, 1, 2, 1, 4, 4]);
    // Pair 7 with kongs of 5 is not a way to make it.
    const wrong = tiles([
      ['DOT_1', 1],
      ['DOT_3', 1],
      ['DOT_5', 1],
      ['DOT_7', 2],
      ['DOT_9', 1],
      ['BAMBOO_5', 4],
      ['CHARACTER_5', 4],
    ]);
    expect(findWin(card, wrong, [])).toBeNull();
  });

  it('checks every way: tile count, and that it can be made at all', () => {
    const card = cardOf({ pattern: 'FF 2222a 44a 66a 8888a | FF 2222a' }, { pattern: 'FF xxxxa yyyya zzzza | FF xxxxa yyyya zzzza x=89' });
    expect(validateCard(card)).toEqual(['h1 (way 2): 6 tiles, expected 14', 'h2 (way 2): no concrete hands']);
  });
});

describe('how patterns print', () => {
  it('shows the first way, without rules, with variables as example numbers', () => {
    expect(patternText('FFF 2468a FFF xxxxb x=2468')).toBe('FFF 2468 FFF 2222');
    expect(patternText('NNN xxxxa xxxxb SSS x=13579')).toBe('NNN 1111 1111 SSS');
    expect(patternText('2026a DDDa xxxxb DDDb x=26')).toBe('2026 DDD 2222 DDD');
    expect(patternText('FFF xxxxa yzua vvvva')).toBe('FFF 1111 234 5555');
    expect(patternText('FF 3369a 3333b 3333c | FF 3669a 6666b 6666c')).toBe('FF 3369 3333 3333');
    expect(patternText('pppppa qqqqqa DDDDb')).toBe('11111 22222 DDDD');
    expect(patternText('ppppa qqqqb p=2468 q=2468')).toBe('2222 4444');
  });

  it('colours each printed token by its suit letter', () => {
    expect(patternPieces('22a 00 222b 666b NEWS')).toEqual([
      { text: '22', suit: 'a' },
      { text: '00', suit: null },
      { text: '222', suit: 'b' },
      { text: '666', suit: 'b' },
      { text: 'NEWS', suit: null },
    ]);
  });

  it('prints house card hands as before', () => {
    expect(patternText(HOUSE_CARD.hands.find((h) => h.id === 'ru2')!.pattern)).toBe('111 2222 333 4444');
    expect(patternText(HOUSE_CARD.hands.find((h) => h.id === 't4')!.pattern)).toBe('3 6 9 3 6 9 3 6 9 FFFFF');
  });
});

describe('cards as data, with the new syntax', () => {
  it('round-trips ways and rules unchanged', () => {
    const card = cardOf({ pattern: 'NNN xxxxa xxxxb SSS x=13579' }, { pattern: 'FF 3369a 3333b 3333c | FF 3669a 6666b 6666c | FF 3699a 9999b 9999c', concealed: true });
    const copy = cardFromSpec(cardToSpec(card));
    expect(copy.hands.map((h) => h.pattern)).toEqual(card.hands.map((h) => h.pattern));
    expect(copy.hands.map((h) => concretize(h).length)).toEqual([15, 9]);
    expect(validateCard(copy)).toEqual([]);
  });
});
