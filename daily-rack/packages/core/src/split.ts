import { multiplicityKey, type TileInstance } from './tiles.ts';

export const DEFAULT_SPLIT_THRESHOLD = 30;

export interface SplitRow {
  tileInstanceId: string;
  count: number;
  rate: number;
}

export interface SplitGroup {
  faceKey: string;
  /** Distinct attempts that passed at least one tile of this face. */
  count: number;
  rate: number;
  tileInstanceIds: string[];
}

export interface Split {
  eligibleAttemptCount: number;
  minimumSampleMet: boolean;
  threshold: number;
  rows: SplitRow[];
  groups: SplitGroup[];
}

/**
 * Per-tile rate = counted attempts that passed that tile / all counted attempts.
 * Rates across all 13 tiles sum to 300% because every attempt passes three.
 */
export function computeSplit(
  tiles: readonly TileInstance[],
  attempts: readonly (readonly string[])[],
  threshold = DEFAULT_SPLIT_THRESHOLD,
): Split {
  const known = new Set(tiles.map((t) => t.instanceId));
  const tileCounts = new Map<string, number>();
  const groupCounts = new Map<string, number>();
  for (const ids of attempts) {
    for (const id of ids) {
      if (known.has(id)) tileCounts.set(id, (tileCounts.get(id) ?? 0) + 1);
    }
    for (const face of facesInAttempt(tiles, ids)) groupCounts.set(face, (groupCounts.get(face) ?? 0) + 1);
  }
  return splitFromCounts(tiles, attempts.length, tileCounts, groupCounts, threshold);
}

/** Builds a split from stored per-tile counts (the server keeps counts, not every attempt row in memory). */
export function splitFromCounts(
  tiles: readonly TileInstance[],
  eligibleAttemptCount: number,
  tileCounts: ReadonlyMap<string, number>,
  groupCounts: ReadonlyMap<string, number>,
  threshold = DEFAULT_SPLIT_THRESHOLD,
): Split {
  const rate = (n: number) => (eligibleAttemptCount === 0 ? 0 : n / eligibleAttemptCount);
  const rows = tiles.map((t) => {
    const count = tileCounts.get(t.instanceId) ?? 0;
    return { tileInstanceId: t.instanceId, count, rate: rate(count) };
  });
  const groupMembers = new Map<string, string[]>();
  for (const t of tiles) {
    const key = multiplicityKey(t.faceCode);
    groupMembers.set(key, [...(groupMembers.get(key) ?? []), t.instanceId]);
  }
  const groups = [...groupMembers].map(([faceKey, ids]) => {
    const count = groupCounts.get(faceKey) ?? 0;
    return { faceKey, count, rate: rate(count), tileInstanceIds: ids };
  });
  return {
    eligibleAttemptCount,
    minimumSampleMet: eligibleAttemptCount >= threshold,
    threshold,
    rows,
    groups,
  };
}

/** Face keys an attempt contributes to, each counted once per attempt. */
export function facesInAttempt(tiles: readonly TileInstance[], ids: readonly string[]): string[] {
  const faceOf = new Map(tiles.map((t) => [t.instanceId, multiplicityKey(t.faceCode)]));
  return [...new Set(ids.map((id) => faceOf.get(id)).filter((f): f is string => f !== undefined))];
}

export function formatRate(rate: number): string {
  return `${Math.round(rate * 100)}%`;
}
