// Tile faces for the American mahjong set: 3 suits of 1-9, winds, dragons,
// flowers and jokers. Face codes are stable strings stored in puzzle content.

export type Suit = 'DOT' | 'BAMBOO' | 'CHARACTER';
export type Wind = 'EAST' | 'SOUTH' | 'WEST' | 'NORTH';
export type DragonColor = 'RED' | 'GREEN' | 'WHITE';

export type TileFace =
  | { kind: 'suited'; suit: Suit; rank: number }
  | { kind: 'wind'; wind: Wind }
  | { kind: 'dragon'; color: DragonColor }
  | { kind: 'flower'; variant: number }
  | { kind: 'joker' };

export interface TileInstance {
  instanceId: string;
  faceCode: string;
  spokenLabel?: string;
}

const SUITS: readonly Suit[] = ['DOT', 'BAMBOO', 'CHARACTER'];
const WINDS: readonly Wind[] = ['EAST', 'SOUTH', 'WEST', 'NORTH'];
const DRAGONS: readonly DragonColor[] = ['RED', 'GREEN', 'WHITE'];

const NUMBER_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const SUIT_WORDS: Record<Suit, string> = { DOT: 'dot', BAMBOO: 'bamboo', CHARACTER: 'character' };
const SUIT_SHORT: Record<Suit, string> = { DOT: 'Dot', BAMBOO: 'Bam', CHARACTER: 'Crak' };

export function parseFace(faceCode: string): TileFace | null {
  const [head, tail, extra] = faceCode.split('_');
  if (extra !== undefined) return null;
  if (head === 'JOKER' && tail === undefined) return { kind: 'joker' };
  if (tail === undefined) return null;
  if (SUITS.includes(head as Suit)) {
    const rank = Number(tail);
    if (!Number.isInteger(rank) || rank < 1 || rank > 9 || String(rank) !== tail) return null;
    return { kind: 'suited', suit: head as Suit, rank };
  }
  if (head === 'WIND' && WINDS.includes(tail as Wind)) return { kind: 'wind', wind: tail as Wind };
  if (head === 'DRAGON' && DRAGONS.includes(tail as DragonColor)) {
    return { kind: 'dragon', color: tail as DragonColor };
  }
  if (head === 'FLOWER') {
    const variant = Number(tail);
    if (!Number.isInteger(variant) || variant < 1 || variant > 8 || String(variant) !== tail) return null;
    return { kind: 'flower', variant };
  }
  return null;
}

export function isValidFace(faceCode: string): boolean {
  return parseFace(faceCode) !== null;
}

/** Spoken label used for screen readers and as the default caption name. */
export function spokenLabel(faceCode: string): string {
  const face = parseFace(faceCode);
  if (!face) return 'Unknown tile';
  switch (face.kind) {
    case 'suited':
      return `${NUMBER_WORDS[face.rank]} ${SUIT_WORDS[face.suit]}`;
    case 'wind':
      return `${capitalize(face.wind)} wind`;
    case 'dragon':
      return `${capitalize(face.color)} dragon`;
    case 'flower':
      return 'Flower';
    case 'joker':
      return 'Joker';
  }
}

/** Short label for captions and split rows, e.g. "7 Crak", "Red Dragon". */
export function shortLabel(faceCode: string): string {
  const face = parseFace(faceCode);
  if (!face) return '?';
  switch (face.kind) {
    case 'suited':
      return `${face.rank} ${SUIT_SHORT[face.suit]}`;
    case 'wind':
      return `${capitalize(face.wind)} Wind`;
    case 'dragon':
      return face.color === 'WHITE' ? 'Soap' : `${capitalize(face.color)} Dragon`;
    case 'flower':
      return 'Flower';
    case 'joker':
      return 'Joker';
  }
}

/** Groups faces that count against the same multiplicity limit. */
export function multiplicityKey(faceCode: string): string {
  const face = parseFace(faceCode);
  if (!face) return faceCode;
  if (face.kind === 'flower') return 'FLOWER';
  return faceCode;
}

/** Copies of a face in a standard 152-tile American set. */
export function maxCopies(faceCode: string): number {
  const face = parseFace(faceCode);
  if (!face) return 0;
  if (face.kind === 'flower' || face.kind === 'joker') return 8;
  return 4;
}

/** Jokers may never be passed in the Charleston. */
export function isPassable(faceCode: string): boolean {
  return parseFace(faceCode)?.kind !== 'joker';
}

/** Two tiles are interchangeable for split grouping (all flowers count as one face). */
export function sameFace(a: string, b: string): boolean {
  return multiplicityKey(a) === multiplicityKey(b);
}

const KIND_ORDER = { suited: 0, wind: 1, dragon: 2, flower: 3, joker: 4 } as const;

/** Sort key: dots, bams, craks by rank, then winds, dragons, flowers, jokers. */
export function sortKey(faceCode: string): number {
  const face = parseFace(faceCode);
  if (!face) return 9999;
  const base = KIND_ORDER[face.kind] * 100;
  switch (face.kind) {
    case 'suited':
      return SUITS.indexOf(face.suit) * 10 + face.rank;
    case 'wind':
      return base + WINDS.indexOf(face.wind);
    case 'dragon':
      return base + DRAGONS.indexOf(face.color);
    case 'flower':
      return base + face.variant;
    case 'joker':
      return base;
  }
}

export function sortBySuit<T extends { faceCode: string; instanceId: string }>(tiles: readonly T[]): T[] {
  return [...tiles].sort(
    (a, b) => sortKey(a.faceCode) - sortKey(b.faceCode) || a.instanceId.localeCompare(b.instanceId),
  );
}

function capitalize(word: string): string {
  return word.charAt(0) + word.slice(1).toLowerCase();
}
