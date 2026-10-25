import { useEffect, useState } from 'react';
import { DEFAULT_PREFS, PREFS_KEY, readPrefs, writeJson, type Preferences } from './storage.ts';

// Preferences shared across screens: a change on the You tab shows up at the table at once.

let current: Preferences = DEFAULT_PREFS;
let loaded: Promise<void> | null = null;
const listeners = new Set<(p: Preferences) => void>();

function load(): Promise<void> {
  loaded ??= readPrefs().then((p) => {
    current = p;
    for (const l of listeners) l(current);
  });
  return loaded;
}

export function updatePrefs(change: Partial<Preferences>): void {
  current = { ...current, ...change };
  void writeJson(PREFS_KEY, current);
  for (const l of listeners) l(current);
}

export function usePrefs(): Preferences {
  const [prefs, setPrefs] = useState(current);
  useEffect(() => {
    listeners.add(setPrefs);
    void load().then(() => setPrefs(current));
    return () => {
      listeners.delete(setPrefs);
    };
  }, []);
  return prefs;
}
