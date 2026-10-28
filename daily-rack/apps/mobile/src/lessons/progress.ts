import { useEffect, useState } from 'react';
import { readJson, remove, writeJson } from '../lib/storage.ts';

// Which lessons are finished, kept on this device only (lessons work offline). Shared
// across screens like prefs: finishing a lesson ticks it on the list straight away.

export const LESSONS_DONE_KEY = 'dr:lessons-done';

let current: Set<string> = new Set();
let ready = false;
let loaded: Promise<void> | null = null;
const listeners = new Set<(done: Set<string>) => void>();

function load(): Promise<void> {
  loaded ??= readJson<unknown>(LESSONS_DONE_KEY, []).then((stored) => {
    const ids = Array.isArray(stored) ? stored.filter((id): id is string => typeof id === 'string') : [];
    // Keep anything finished while the read was in flight.
    current = new Set([...ids, ...current]);
    ready = true;
    for (const l of listeners) l(current);
  });
  return loaded;
}

export function markLessonDone(id: string): void {
  if (current.has(id)) return;
  current = new Set([...current, id]);
  for (const l of listeners) l(current);
  // Write after the first read so a quick finish can't overwrite what was stored.
  void load().then(() => writeJson(LESSONS_DONE_KEY, [...current]));
}

/** Forgets every finished lesson, for a "delete everything" flow on this device. */
export function resetLessonProgress(): void {
  const clear = () => {
    current = new Set();
    for (const l of listeners) l(current);
  };
  clear();
  // Clear again once the first read lands, so it can't bring old ticks back.
  void load().then(() => {
    clear();
    return remove(LESSONS_DONE_KEY);
  });
}

export function useLessonProgress(): { done: Set<string>; markDone(id: string): void; loaded: boolean } {
  const [state, setState] = useState({ done: current, loaded: ready });
  useEffect(() => {
    const listener = (done: Set<string>) => setState({ done, loaded: ready });
    listeners.add(listener);
    void load().then(() => setState({ done: current, loaded: true }));
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { done: state.done, markDone: markLessonDone, loaded: state.loaded };
}
