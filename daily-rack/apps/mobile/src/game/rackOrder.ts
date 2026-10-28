import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { readJson, writeJson } from '../lib/storage.ts';

// The order you arranged your rack in, one per game, kept on this device so it holds
// through new moves from the server and a reload. Only the last few games are kept.

const ORDER_KEY = 'dr:rack-order';
const KEEP_GAMES = 8;

export interface RackOrder {
  order: number[];
  /** False once you switch back to a sort; the order stays so you can switch back to it. */
  active: boolean;
}

interface Saved extends RackOrder {
  gameId: string;
}

let saved: Saved[] = [];
let loaded: Promise<void> | null = null;
const listeners = new Set<() => void>();

const isSaved = (e: unknown): e is Saved => {
  const s = e as Partial<Saved> | null;
  return typeof s?.gameId === 'string' && typeof s.active === 'boolean' && Array.isArray(s.order) && s.order.every((t) => Number.isInteger(t));
};

function load(): Promise<void> {
  loaded ??= readJson<unknown>(ORDER_KEY, []).then((stored) => {
    const entries = Array.isArray(stored) ? stored.filter(isSaved) : [];
    // Keep anything arranged while the read was in flight.
    saved = [...saved, ...entries.filter((e) => !saved.some((s) => s.gameId === e.gameId))].slice(0, KEEP_GAMES);
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

/** Your arrangement for this game, if you've made one, and a way to change it. */
export function useRackOrder(gameId: string): [RackOrder | null, (next: RackOrder) => void] {
  const entry = useSyncExternalStore(subscribe, () => saved.find((s) => s.gameId === gameId) ?? null);
  useEffect(() => {
    void load();
  }, []);
  const save = useCallback(
    (next: RackOrder) => {
      saved = [{ gameId, order: next.order, active: next.active }, ...saved.filter((s) => s.gameId !== gameId)].slice(0, KEEP_GAMES);
      for (const l of listeners) l();
      // Write after the first read so it can't overwrite older games still loading.
      void load().then(() => writeJson(ORDER_KEY, saved));
    },
    [gameId],
  );
  return [entry, save];
}

// "Drag tiles to arrange them" shows in your first few hands, until you arrange a rack.

const HINT_KEY = 'dr:arrange-hint';
const HINT_HANDS = 3;
let hintDone = false;

export function useArrangeHint(gameId: string): [boolean, () => void] {
  const [show, setShow] = useState(false);
  useEffect(() => {
    let live = true;
    setShow(false);
    void readJson<{ done?: boolean; games?: unknown }>(HINT_KEY, {}).then((stored) => {
      const games = Array.isArray(stored.games) ? stored.games.filter((g): g is string => typeof g === 'string') : [];
      hintDone ||= stored.done === true;
      if (!live || hintDone) return;
      if (!games.includes(gameId)) {
        if (games.length >= HINT_HANDS) return;
        void writeJson(HINT_KEY, { done: false, games: [...games, gameId] });
      }
      setShow(true);
    });
    return () => {
      live = false;
    };
  }, [gameId]);
  const dismiss = useCallback(() => {
    setShow(false);
    if (hintDone) return;
    hintDone = true;
    void writeJson(HINT_KEY, { done: true });
  }, []);
  return [show, dismiss];
}
