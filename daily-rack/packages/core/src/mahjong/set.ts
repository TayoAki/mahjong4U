// The 152-tile American set. A tile is identified by its index; faces never change.

const SUITS = ['DOT', 'BAMBOO', 'CHARACTER'] as const;
const WINDS = ['EAST', 'SOUTH', 'WEST', 'NORTH'] as const;
const DRAGONS = ['RED', 'GREEN', 'WHITE'] as const;

function buildFaces(): string[] {
  const faces: string[] = [];
  for (const suit of SUITS) for (let rank = 1; rank <= 9; rank++) for (let c = 0; c < 4; c++) faces.push(`${suit}_${rank}`);
  for (const wind of WINDS) for (let c = 0; c < 4; c++) faces.push(`WIND_${wind}`);
  for (const dragon of DRAGONS) for (let c = 0; c < 4; c++) faces.push(`DRAGON_${dragon}`);
  for (let v = 1; v <= 8; v++) faces.push(`FLOWER_${v}`);
  for (let c = 0; c < 8; c++) faces.push('JOKER');
  return faces;
}

/** Face code of every tile id, 0-151. */
export const TILE_FACES: readonly string[] = buildFaces();
export const TILE_COUNT = TILE_FACES.length;

export function faceOf(tile: number): string {
  const face = TILE_FACES[tile];
  if (face === undefined) throw new Error(`no tile ${tile}`);
  return face;
}

/** Key used for matching: every flower is the same. */
export function keyOf(tile: number): string {
  const face = faceOf(tile);
  return face.startsWith('FLOWER_') ? 'FLOWER' : face;
}

export function isJoker(tile: number): boolean {
  return faceOf(tile) === 'JOKER';
}

/** Small, fast, seedable generator (mulberry32) so deals and bots are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffledWall(seed: number): number[] {
  const random = rng(seed);
  const wall = Array.from({ length: TILE_COUNT }, (_, i) => i);
  for (let i = wall.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [wall[i], wall[j]] = [wall[j]!, wall[i]!];
  }
  return wall;
}
