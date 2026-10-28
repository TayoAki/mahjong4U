import { shortLabel } from '../tiles.ts';

// Wording shared by the plain-English explanations (dead hands, "why can't I call this?").
// Tiles are named the way the app names them everywhere else, e.g. "5 Bam", "Red Dragon".

const NUMBER_WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'];

export function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? String(n);
}

/** A match key ('FLOWER' or a face code) as the app labels it. */
export function tileName(key: string): string {
  return key === 'FLOWER' ? 'Flower' : shortLabel(key);
}

/** "Red Dragons", "North Winds", "Flowers"; number tiles read fine as they are ("5 Bam"). */
export function tileNames(key: string): string {
  const name = tileName(key);
  return /^\d/.test(name) ? name : `${name}s`;
}

export const GROUP_NAMES: Record<number, string> = { 3: 'pung', 4: 'kong', 5: 'quint', 6: 'sextet' };

export function groupName(size: number): string {
  return GROUP_NAMES[size] ?? `group of ${size}`;
}

/** "a pung (3 of a kind)", for readers new to the words. */
export function groupWithMeaning(size: number): string {
  return `a ${groupName(size)} (${size} of a kind)`;
}

/** "A", "A and B", "A, B and C" (or "or"). */
export function listOf(items: readonly string[], joiner: 'and' | 'or' = 'and'): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ${joiner} ${items.at(-1)}`;
}

/** How many of one tile a hand needs, as a phrase: "a single 1 Dot", "a pair of Red Dragons". */
export function needPhrase(key: string, count: number): string {
  if (count === 1) return `a single ${tileName(key)}`;
  if (count === 2) return `a pair of ${tileNames(key)}`;
  return `${numberWord(count)} ${tileNames(key)}`;
}
