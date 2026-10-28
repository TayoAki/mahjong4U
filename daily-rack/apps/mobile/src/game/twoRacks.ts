import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../lib/storage.ts';

// In a two-player game your concealed tiles are one pool, shown as two racks: one for each
// hand you're building. How you've split them is yours, so it's kept on this device, one
// entry per game, and holds through new moves from the server and a reload.

const KEY = 'dr:two-racks';
const KEEP_GAMES = 8;

/** Tile ids in rack order: hand 1's rack, then hand 2's. */
export type TwoRacks = [number[], number[]];

interface Saved {
  gameId: string;
  racks: TwoRacks;
}

let saved: Saved[] = [];
let loaded: Promise<void> | null = null;
let ready = false;
const listeners = new Set<() => void>();

const isTiles = (r: unknown): r is number[] => Array.isArray(r) && r.every((t) => Number.isInteger(t));
const isSaved = (e: unknown): e is Saved => {
  const s = e as Partial<Saved> | null;
  return typeof s?.gameId === 'string' && Array.isArray(s.racks) && s.racks.length === 2 && s.racks.every(isTiles);
};

function load(): Promise<void> {
  loaded ??= readJson<unknown>(KEY, []).then((stored) => {
    const entries = Array.isArray(stored) ? stored.filter(isSaved) : [];
    saved = [...saved, ...entries.filter((e) => !saved.some((s) => s.gameId === e.gameId))].slice(0, KEEP_GAMES);
    ready = true;
    for (const l of listeners) l();
  });
  return loaded;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/**
 * Your two racks for this game, if you've had any yet, a way to change them, and whether
 * what's stored on the device has been read (until then a new split shouldn't be saved over it).
 */
export function useTwoRacks(gameId: string): [TwoRacks | null, (racks: TwoRacks) => void, boolean] {
  const entry = useSyncExternalStore(subscribe, () => saved.find((s) => s.gameId === gameId)?.racks ?? null);
  const [isReady, setReady] = useState(ready);
  useEffect(() => {
    void load().then(() => setReady(true));
  }, []);
  const save = useCallback(
    (racks: TwoRacks) => {
      saved = [{ gameId, racks }, ...saved.filter((s) => s.gameId !== gameId)].slice(0, KEEP_GAMES);
      for (const l of listeners) l();
      void load().then(() => writeJson(KEY, saved));
    },
    [gameId],
  );
  return [entry, save, isReady];
}

/**
 * The racks as they stand now. Tiles that have gone (discarded, called with, laid down)
 * drop out; new ones go to whichever rack `place` picks, at the right-hand end. A hand
 * that's been declared has no rack: its tiles join the other one.
 */
export function reconcileRacks(racks: TwoRacks | null, concealed: readonly number[], place: (fresh: number[]) => TwoRacks, declared: [boolean, boolean]): TwoRacks {
  const inHand = new Set(concealed);
  const first = (racks?.[0] ?? []).filter((t) => inHand.has(t));
  const taken = new Set(first);
  const second = (racks?.[1] ?? []).filter((t) => inHand.has(t) && !taken.has(t));
  for (const t of second) taken.add(t);
  const fresh = concealed.filter((t) => !taken.has(t));
  let next: TwoRacks = [first, second];
  if (fresh.length > 0) {
    const [a, b] = place(fresh);
    next = [
      [...first, ...a],
      [...second, ...b],
    ];
  }
  if (declared[0]) next = [[], [...next[1], ...next[0]]];
  if (declared[1]) next = [[...next[0], ...next[1]], []];
  return next;
}

export function sameRacks(a: TwoRacks | null, b: TwoRacks): boolean {
  return Boolean(a) && a![0].join(',') === b[0].join(',') && a![1].join(',') === b[1].join(',');
}
