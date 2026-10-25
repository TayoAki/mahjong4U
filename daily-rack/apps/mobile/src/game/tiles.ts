import { shortLabel, spokenLabel } from '@daily-rack/core';
import { faceOf } from '@daily-rack/core/mahjong';

// Helpers for showing engine tiles (ids 0-151) in the app.

export { faceOf };

export const tileName = (tile: number) => spokenLabel(faceOf(tile));
export const tileShort = (tile: number) => shortLabel(faceOf(tile));

/** Face to draw for a card or hint group key ('FLOWER' stands for any flower). */
export const faceForKey = (key: string) => (key === 'FLOWER' ? 'FLOWER_1' : key);

const SUIT_ORDER: Record<string, number> = { DOT: 0, BAMBOO: 1, CHARACTER: 2 };
const HONOR_ORDER: Record<string, number> = {
  WIND_NORTH: 0,
  WIND_EAST: 1,
  WIND_WEST: 2,
  WIND_SOUTH: 3,
  DRAGON_RED: 4,
  DRAGON_GREEN: 5,
  DRAGON_WHITE: 6,
};

export type SortMode = 'suit' | 'number';

function sortKey(tile: number, mode: SortMode): number {
  const face = faceOf(tile);
  const [head, tail] = face.split('_');
  if (head === 'FLOWER') return 9000 + tile;
  if (head === 'JOKER') return 9900 + tile;
  if (head && head in SUIT_ORDER) {
    const suit = SUIT_ORDER[head]!;
    const rank = Number(tail);
    return (mode === 'suit' ? suit * 10 + rank : rank * 10 + suit) * 10 + (tile % 4);
  }
  return 5000 + (HONOR_ORDER[face] ?? 0) * 10 + (tile % 4);
}

export function sortTiles(tiles: readonly number[], mode: SortMode): number[] {
  return [...tiles].sort((a, b) => sortKey(a, mode) - sortKey(b, mode));
}

export function groupName(size: number): string {
  return size === 3 ? 'pung' : size === 4 ? 'kong' : size === 5 ? 'quint' : size === 6 ? 'sextet' : `${size} of a kind`;
}

/** Where another table position sits relative to mine: turn order goes to the right. */
export function relativeSide(mine: number, other: number): 'you' | 'right' | 'across' | 'left' {
  return (['you', 'right', 'across', 'left'] as const)[(other - mine + 4) % 4]!;
}
