// A card is a list of winning hands written in a compact pattern language. The
// Daily Rack house card below is original; it does not reproduce any League card.
//
// Pattern tokens (space separated, one token per group):
//   F, FF, FFF...        flowers
//   N / E / S / W runs   winds, e.g. NNNN, or single E
//   D..a / D..b / D..c   the dragon that matches suit a/b/c (Red-Crak, Green-Bam, White-Dot)
//   0, 00 ...            white dragon used as zero
//   2a, 444b, 6666c      number groups in suit a/b/c
//   x y z u v (+ suit)   variable ranks X, X+1, X+2, X+3, X+4 in a run, e.g. xxxa yyyya
//   p q (+ suit)         any numbers, different from each other, e.g. pppppa qqqqqa
// Suit letters a, b, c always stand for three different suits.
//
// A token written with more than one symbol is several groups printed together, the way a
// card prints singles: 2026a is 2a 0 2a 6a, 113579a is 11a 3a 5a 7a 9a, NEWS is N E W S.
// A rule token limits a variable to some numbers: x=13579 (odd), x=2468 (even), x=26.
// " | " separates different ways to make the same hand; the card shows the first one.

export type SuitVar = 'a' | 'b' | 'c';
/** Free number variables: any number, each different from the others. */
export type FreeVar = 'p' | 'q';
/** Variables a rule token can limit: the start of a run (x) and the free numbers. */
export type NumberVar = 'x' | FreeVar;
export type TileSpec =
  | { k: 'flower' }
  | { k: 'wind'; w: 'NORTH' | 'EAST' | 'SOUTH' | 'WEST' }
  | { k: 'dragon'; s: SuitVar }
  | { k: 'soap' }
  | { k: 'num'; rank: number; s: SuitVar }
  | { k: 'var'; offset: number; s: SuitVar }
  | { k: 'free'; v: FreeVar; s: SuitVar };

export interface GroupSpec {
  tile: TileSpec;
  n: number;
  token: string;
}

/** One way to make a hand: its groups, and the numbers its variables may take. */
export interface HandWay {
  /** This way as written, e.g. "NNN xxxxa xxxxb SSS x=13579". */
  pattern: string;
  groups: GroupSpec[];
  /** Allowed numbers for a variable, when a rule token limits it. */
  numbers: Partial<Record<NumberVar, number[]>>;
}

export interface CardHand {
  id: string;
  section: string;
  /** The pattern as written: one or more ways separated by " | ". The card shows the first. */
  pattern: string;
  /** The groups of the first way (the one the card shows). */
  groups: GroupSpec[];
  /** Every way the hand can be made. Most hands have exactly one. */
  ways: HandWay[];
  concealed: boolean;
  value: number;
  note?: string;
}

export interface Card {
  id: string;
  name: string;
  description: string;
  sections: { id: string; label: string }[];
  hands: CardHand[];
}

const WIND_OF: Record<string, 'NORTH' | 'EAST' | 'SOUTH' | 'WEST'> = { N: 'NORTH', E: 'EAST', S: 'SOUTH', W: 'WEST' };
const VAR_OFFSET: Record<string, number> = { x: 0, y: 1, z: 2, u: 3, v: 4 };
const FREE_VARS: readonly string[] = ['p', 'q'];

function isSuitVar(ch: string | undefined): ch is SuitVar {
  return ch === 'a' || ch === 'b' || ch === 'c';
}

/** Parses one group: a single symbol repeated once per tile, plus a suit letter if it takes one. */
export function parseToken(token: string): GroupSpec {
  const fail = () => {
    throw new Error(`bad pattern token "${token}"`);
  };
  const suffix = token.at(-1);
  const hasSuit = isSuitVar(suffix);
  const body = hasSuit ? token.slice(0, -1) : token;
  const symbol = body[0];
  if (!symbol || [...body].some((ch) => ch !== symbol)) fail();
  const n = body.length;
  const s = suffix as SuitVar;
  let tile: TileSpec | null = null;
  if (symbol === 'F' && !hasSuit) tile = { k: 'flower' };
  else if (WIND_OF[symbol!] && !hasSuit) tile = { k: 'wind', w: WIND_OF[symbol!]! };
  else if (symbol === 'D' && hasSuit) tile = { k: 'dragon', s };
  else if (symbol === '0' && !hasSuit) tile = { k: 'soap' };
  else if (/[1-9]/.test(symbol!) && hasSuit) tile = { k: 'num', rank: Number(symbol), s };
  else if (VAR_OFFSET[symbol!] !== undefined && hasSuit) tile = { k: 'var', offset: VAR_OFFSET[symbol!]!, s };
  else if (FREE_VARS.includes(symbol!) && hasSuit) tile = { k: 'free', v: symbol as FreeVar, s };
  if (!tile || n < 1 || n > 6) fail();
  return { tile: tile!, n, token };
}

/** Symbols that never take a suit letter. The white dragon may still sit inside a suited token (2026a). */
function suitless(symbol: string): boolean {
  return symbol === 'F' || symbol === '0' || WIND_OF[symbol] !== undefined;
}

/**
 * Parses a token that may print several groups together: each run of one symbol is a group,
 * and the suit letter at the end applies to every group that takes a suit. "2026a" is
 * 2a 0 2a 6a, "113579a" is 11a 3a 5a 7a 9a, "1Da" is 1a Da, "NEWS" is N E W S.
 */
export function parseGroups(token: string): GroupSpec[] {
  const suffix = token.at(-1);
  const hasSuit = isSuitVar(suffix);
  const body = hasSuit ? token.slice(0, -1) : token;
  const runs = body.match(/(.)\1*/g) ?? [];
  if (runs.length <= 1) return [parseToken(token)];
  return runs.map((run) => {
    const symbol = run[0]!;
    // Flowers and winds can't share a token with suited groups; a suitless token can't hold suited ones.
    if (hasSuit && suitless(symbol) && symbol !== '0') throw new Error(`bad pattern token "${token}"`);
    const part = hasSuit && !suitless(symbol) ? run + suffix : run;
    try {
      return parseToken(part);
    } catch {
      throw new Error(`bad pattern token "${token}"`);
    }
  });
}

/** Parses one way to make a hand: groups, plus rule tokens such as x=13579. */
function parseWay(source: string): HandWay {
  const groups: GroupSpec[] = [];
  const numbers: Partial<Record<NumberVar, number[]>> = {};
  for (const token of source.split(/\s+/).filter(Boolean)) {
    if (token.includes('=')) {
      const rule = /^([xpq])=([1-9]+)$/.exec(token);
      if (!rule) throw new Error(`bad number rule "${token}" (write it like x=13579)`);
      const v = rule[1] as NumberVar;
      if (numbers[v]) throw new Error(`bad pattern "${source}": two rules for ${v}`);
      numbers[v] = [...new Set([...rule[2]!].map(Number))].sort((a, b) => a - b);
      continue;
    }
    groups.push(...parseGroups(token));
  }
  if (groups.length === 0) throw new Error(`bad pattern "${source}": no groups`);
  for (const v of Object.keys(numbers) as NumberVar[]) {
    const used = groups.some((g) => (v === 'x' ? g.tile.k === 'var' : g.tile.k === 'free' && g.tile.v === v));
    if (!used) throw new Error(`bad pattern "${source}": the rule for ${v} names a variable the pattern doesn't use`);
  }
  return { pattern: source, groups, numbers };
}

/** Splits a pattern into its ways (separated by " | ") and parses each. Throws on anything malformed. */
export function parsePattern(pattern: string): HandWay[] {
  const parts = pattern.split('|').map((p) => p.trim());
  if (parts.some((p) => p === '')) throw new Error(`bad pattern "${pattern}": empty way`);
  return parts.map(parseWay);
}

export interface PatternPiece {
  /** What to print, e.g. "2026", "DDD", "NEWS". */
  text: string;
  /** The suit letter that colours it, or null for flowers, winds and other suitless groups. */
  suit: SuitVar | null;
}

/**
 * How a pattern reads on a printed card: the first way, token by token, with rule tokens
 * left out and variables shown as example numbers. A run starts at the lowest number its
 * rule allows (x=2468 shows 2222), so "1 2 3" mean any consecutive numbers unless a rule
 * says otherwise; free numbers show as the lowest numbers they may take.
 */
export function patternPieces(pattern: string): PatternPiece[] {
  const way = parseWay(pattern.split('|')[0]!.trim());
  const starts = runStarts(way);
  const x = starts[0] ?? 1;
  const shown = new Map<string, number>();
  for (const v of freeVarsOf(way)) {
    const n = (way.numbers[v] ?? NUMBERS).find((k) => ![...shown.values()].includes(k)) ?? 1;
    shown.set(v, n);
  }
  return way.pattern
    .split(/\s+/)
    .filter((token) => token && !token.includes('='))
    .map((token) => {
      const suit = isSuitVar(token.at(-1)) ? (token.at(-1) as SuitVar) : null;
      const body = suit ? token.slice(0, -1) : token;
      const text = [...body]
        .map((ch) => (VAR_OFFSET[ch] !== undefined ? String(x + VAR_OFFSET[ch]!) : shown.has(ch) ? String(shown.get(ch)) : ch))
        .join('');
      return { text, suit };
    });
}

/** patternPieces as plain text, e.g. "FFF 2468 FFF 2222" for "FFF 2468a FFF xxxxb x=2468". */
export function patternText(pattern: string): string {
  return patternPieces(pattern)
    .map((p) => p.text)
    .join(' ');
}

function hand(id: string, section: string, pattern: string, value: number, options: { concealed?: boolean; note?: string } = {}): CardHand {
  const ways = parsePattern(pattern);
  return {
    id,
    section,
    pattern,
    groups: ways[0]!.groups,
    ways,
    concealed: options.concealed ?? false,
    value,
    note: options.note,
  };
}

export const HOUSE_CARD: Card = {
  id: 'daily-rack-house-2026',
  name: 'Daily Rack House Card',
  description:
    'An original practice card for playing in the app. It follows standard American mahjong conventions but is not the National Mah Jongg League card.',
  sections: [
    { id: 'evens', label: 'Evens' },
    { id: 'odds', label: 'Odds' },
    { id: 'runs', label: 'Runs' },
    { id: 'like', label: 'Like Numbers' },
    { id: 'quints', label: 'Quints' },
    { id: '369', label: '3 · 6 · 9' },
    { id: 'winds', label: 'Winds & Dragons' },
    { id: 'pairs', label: 'Pairs' },
  ],
  hands: [
    hand('ev1', 'evens', 'FF 2222a 44a 66a 8888a', 25, { note: 'One suit' }),
    hand('ev2', 'evens', '222a 444a 66b 88b FFFF', 25, { note: 'Two suits' }),
    hand('ev3', 'evens', '2222a 4444b 6666c 88a', 30, { note: 'Three suits' }),
    hand('ev4', 'evens', 'FFF 22a 44a 666b 8888c', 25, { note: 'Three suits' }),
    hand('ev5', 'evens', 'FF 444a 666a 444b 666b', 25, { note: 'Fours and sixes in two suits' }),
    hand('od1', 'odds', '11a 333a 555a 777a 999a', 30, { note: 'One suit' }),
    hand('od2', 'odds', 'FF 1111a 3333b 5555c', 25, { note: 'Three suits' }),
    hand('od3', 'odds', '111a 33a 555b 77b 9999c', 25, { note: 'Three suits' }),
    hand('od4', 'odds', 'FFFF 1a 3a 5a 777a 9999a', 30, { note: 'One suit; 1, 3, 5 are singles' }),
    hand('ru1', 'runs', 'FF xxxxa yyyya zzzza', 25, { note: 'Three consecutive numbers, one suit' }),
    hand('ru2', 'runs', 'xxxa yyyya zzzb uuuub', 25, { note: 'Four consecutive numbers, two suits' }),
    hand('ru3', 'runs', 'FF xxxxa yyyyb zzzzc', 25, { note: 'Three consecutive numbers, three suits' }),
    hand('ru4', 'runs', 'xxa yya zza FFFF uuuub', 30, { note: 'Four consecutive numbers, two suits' }),
    hand('ln1', 'like', 'FF xxxxa xxxxb xxxxc', 25, { note: 'Any one number in three suits' }),
    hand('ln2', 'like', 'xxxa xxxb xxxxc DDDDa', 25, { note: 'Any number, dragon of the first suit' }),
    hand('ln3', 'like', 'FFF xxa xxxb xxxxc DDc', 30, { note: 'Any number, dragon of the third suit' }),
    hand('qu1', 'quints', 'FFFF xxxxxa yyyyya', 40, { note: 'Two consecutive quints, one suit' }),
    hand('qu2', 'quints', '22222a 44444b DDDDb', 45, { note: 'Even quints with a matching dragon' }),
    hand('qu3', 'quints', 'NNNNN SSSSS FFFF', 45, { note: 'North and South quints' }),
    hand('qu4', 'quints', 'FFFFF xxxxxa xxxxb', 40, { note: 'Any like number' }),
    hand('t1', '369', 'FF 333a 666a 999a 666b', 25, { note: 'Two suits' }),
    hand('t2', '369', '3333a 6666b 9999c FF', 25, { note: 'Three suits' }),
    hand('t3', '369', '33a 666a 99a 3333b DDDb', 30, { note: 'Two suits with a matching dragon' }),
    hand('t4', '369', '3a 6a 9a 3b 6b 9b 3c 6c 9c FFFFF', 50, { concealed: true, note: 'Concealed' }),
    hand('wd1', 'winds', 'NNNN EEEE WWWW SS', 25),
    hand('wd2', 'winds', 'FF NNN EEE WWW SSS', 25),
    hand('wd3', 'winds', 'DDDDa DDDDb DDDDc NN', 30, { note: 'All three dragons' }),
    hand('wd4', 'winds', 'FF NN EE WW SS DDDDa', 30, { note: 'Any one dragon' }),
    hand('wd5', 'winds', 'NNN SSS xxxxa xxxxb', 30, { note: 'Any like number in two suits' }),
    hand('pa1', 'pairs', 'FF 22a 44a 66a 88a 22b 44b', 50, { concealed: true, note: 'Concealed, no jokers' }),
    hand('pa2', 'pairs', 'FF 11a 33a 55a 77a 99a 11b', 50, { concealed: true, note: 'Concealed, no jokers' }),
    hand('pa3', 'pairs', 'NN EE WW SS DDa DDb DDc', 50, { concealed: true, note: 'Concealed, no jokers' }),
    hand('pa4', 'pairs', 'xxa yya zza xxb yyb zzb FF', 50, { concealed: true, note: 'Three consecutive numbers in two suits; concealed, no jokers' }),
  ],
};

// ---------------------------------------------------------------------------
// Concrete hands: every way a pattern can be realised with real suits and numbers.

const SUITS = ['DOT', 'BAMBOO', 'CHARACTER'] as const;
type Suit = (typeof SUITS)[number];
const DRAGON_OF: Record<Suit, string> = { DOT: 'DRAGON_WHITE', BAMBOO: 'DRAGON_GREEN', CHARACTER: 'DRAGON_RED' };

export interface ConcreteGroup {
  /** Match key: a face code, with every flower collapsed to 'FLOWER'. */
  face: string;
  n: number;
  /** Jokers may stand in for groups of three or more. */
  jokerable: boolean;
}

export interface ConcreteHand {
  hand: CardHand;
  groups: ConcreteGroup[];
  /** Human-readable assignment, e.g. "a=Dot b=Crak X=3". */
  label: string;
}

function permutations<T>(items: readonly T[], k: number): T[][] {
  if (k === 0) return [[]];
  return items.flatMap((item, i) => permutations([...items.slice(0, i), ...items.slice(i + 1)], k - 1).map((rest) => [item, ...rest]));
}

const NUMBERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

/** The run starts a way allows: every X whose whole run stays within 1-9, limited by an x= rule. */
function runStarts(way: HandWay): number[] {
  const maxOffset = Math.max(-1, ...way.groups.map((g) => (g.tile.k === 'var' ? g.tile.offset : -1)));
  if (maxOffset < 0) return [];
  return NUMBERS.filter((x) => x + maxOffset <= 9 && (!way.numbers.x || way.numbers.x.includes(x)));
}

function freeVarsOf(way: HandWay): FreeVar[] {
  return [...new Set(way.groups.flatMap((g) => (g.tile.k === 'free' ? [g.tile.v] : [])))].sort();
}

/** Every way to give the free variables different numbers, each within its rule. */
function freeAssignments(vars: readonly FreeVar[], numbers: HandWay['numbers'], taken: readonly number[] = []): Map<FreeVar, number>[] {
  if (vars.length === 0) return [new Map()];
  const [first, ...rest] = vars as [FreeVar, ...FreeVar[]];
  return (numbers[first] ?? NUMBERS)
    .filter((n) => !taken.includes(n))
    .flatMap((n) => freeAssignments(rest, numbers, [...taken, n]).map((m) => new Map([[first, n], ...m])));
}

/** The concrete hands of one way. `prefix` tells ways apart in labels when a hand has several. */
function concretizeWay(hand: CardHand, way: HandWay, prefix: string | null): ConcreteHand[] {
  const vars = [...new Set(way.groups.flatMap((g) => ('s' in g.tile ? [g.tile.s] : [])))].sort() as SuitVar[];
  const hasRun = way.groups.some((g) => g.tile.k === 'var');
  const xs = hasRun ? runStarts(way) : [0];
  const frees = freeAssignments(freeVarsOf(way), way.numbers);
  const out: ConcreteHand[] = [];
  for (const perm of permutations(SUITS, vars.length)) {
    const suitOf = new Map(vars.map((v, i) => [v, perm[i]!]));
    for (const x of xs) {
      for (const free of frees) {
        const groups = way.groups.map((g): ConcreteGroup => {
          const t = g.tile;
          let face: string;
          switch (t.k) {
            case 'flower':
              face = 'FLOWER';
              break;
            case 'wind':
              face = `WIND_${t.w}`;
              break;
            case 'dragon':
              face = DRAGON_OF[suitOf.get(t.s)!];
              break;
            case 'soap':
              face = 'DRAGON_WHITE';
              break;
            case 'num':
              face = `${suitOf.get(t.s)}_${t.rank}`;
              break;
            case 'var':
              face = `${suitOf.get(t.s)}_${x + t.offset}`;
              break;
            case 'free':
              face = `${suitOf.get(t.s)}_${free.get(t.v)}`;
              break;
          }
          return { face, n: g.n, jokerable: g.n >= 3 };
        });
        const parts = vars.map((v) => `${v}=${suitOf.get(v)}`);
        if (prefix) parts.unshift(prefix);
        if (hasRun) parts.push(`X=${x}`);
        for (const [v, n] of free) parts.push(`${v.toUpperCase()}=${n}`);
        out.push({ hand, groups, label: parts.join(' ') });
      }
    }
  }
  return out;
}

export function concretize(hand: CardHand): ConcreteHand[] {
  const several = hand.ways.length > 1;
  return dedupe(hand.ways.flatMap((way, i) => concretizeWay(hand, way, several ? `#${i + 1}` : null)));
}

/**
 * Hands that use fewer suit letters than suits, and ways that repeat another way, produce
 * identical concrete hands; keep the first.
 */
function dedupe(hands: ConcreteHand[]): ConcreteHand[] {
  const seen = new Set<string>();
  return hands.filter((h) => {
    const key = h.groups.map((g) => `${g.face}x${g.n}`).sort().join('|');
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

const concreteCache = new Map<string, ConcreteHand[]>();

export function concreteHands(card: Card): ConcreteHand[] {
  let cached = concreteCache.get(card.id);
  if (!cached) {
    cached = card.hands.flatMap(concretize);
    concreteCache.set(card.id, cached);
  }
  return cached;
}

/** Problems that would make a card unplayable. */
export function validateCard(card: Card): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();
  const sections = new Set(card.sections.map((s) => s.id));
  for (const h of card.hands) {
    if (ids.has(h.id)) errors.push(`${h.id}: duplicate id`);
    ids.add(h.id);
    if (!sections.has(h.section)) errors.push(`${h.id}: unknown section ${h.section}`);
    h.ways.forEach((way, i) => {
      const where = h.ways.length > 1 ? ` (way ${i + 1})` : '';
      const total = way.groups.reduce((n, g) => n + g.n, 0);
      if (total !== 14) errors.push(`${h.id}${where}: ${total} tiles, expected 14`);
      if (concretizeWay(h, way, null).length === 0) errors.push(`${h.id}${where}: no concrete hands`);
    });
    const variants = concretize(h);
    for (const c of variants) {
      const natOnly = new Map<string, number>();
      const all = new Map<string, number>();
      for (const g of c.groups) {
        all.set(g.face, (all.get(g.face) ?? 0) + g.n);
        if (!g.jokerable) natOnly.set(g.face, (natOnly.get(g.face) ?? 0) + g.n);
      }
      let jokersNeeded = 0;
      for (const [face, n] of all) {
        const copies = face === 'FLOWER' ? 8 : 4;
        if ((natOnly.get(face) ?? 0) > copies) errors.push(`${h.id} (${c.label}): needs more natural ${face} than exist`);
        jokersNeeded += Math.max(0, n - copies);
      }
      if (jokersNeeded > 8) errors.push(`${h.id} (${c.label}): needs ${jokersNeeded} jokers`);
    }
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Cards as data: the house card ships with the engine; other cards (a club card, or a
// published card the owner has the right to use) can be loaded from JSON at runtime.

export interface CardSpec {
  id: string;
  name: string;
  description: string;
  sections: { id: string; label: string }[];
  hands: { id: string; section: string; pattern: string; value: number; concealed?: boolean; note?: string }[];
}

/** Builds a card from plain data. Throws on a pattern the card language can't read. */
export function cardFromSpec(spec: CardSpec): Card {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    sections: spec.sections.map((s) => ({ id: s.id, label: s.label })),
    hands: spec.hands.map((h) => hand(h.id, h.section, h.pattern.trim(), h.value, { concealed: h.concealed, note: h.note })),
  };
}

export function cardToSpec(card: Card): CardSpec {
  return {
    id: card.id,
    name: card.name,
    description: card.description,
    sections: card.sections,
    hands: card.hands.map((h) => ({ id: h.id, section: h.section, pattern: h.pattern, value: h.value, concealed: h.concealed, ...(h.note ? { note: h.note } : {}) })),
  };
}

const registry = new Map<string, Card>([[HOUSE_CARD.id, HOUSE_CARD]]);

/** Makes a card available by id (to tables, hints and the card view). */
export function registerCard(card: Card): void {
  concreteCache.delete(card.id);
  registry.set(card.id, card);
}

/** The card with this id, or the house card if it isn't known here. */
export function cardById(id: string | null | undefined): Card {
  return (id && registry.get(id)) || HOUSE_CARD;
}

export function hasCard(id: string): boolean {
  return registry.has(id);
}

export function allCards(): Card[] {
  return [...registry.values()];
}
