import AsyncStorage from '@react-native-async-storage/async-storage';

// Small conveniences only (drafts, preferences). Anything that matters lives on the server.

export async function readJson<T>(key: string, fallback: T): Promise<T> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered; the app still works.
  }
}

export async function remove(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export async function clearAll(): Promise<void> {
  try {
    await AsyncStorage.clear();
  } catch {
    // ignore
  }
}

export interface Draft {
  sectionId: string | null;
  selected: string[];
  idempotencyKey: string;
}

export const draftKey = (revisionId: string) => `dr:draft:${revisionId}`;

export interface Preferences {
  card: 'this-year' | 'learning' | null;
  frequency: 'new' | 'weekly' | 'teach' | null;
  captionStyle: 'blue' | 'magenta';
  showHints: boolean;
}

export const PREFS_KEY = 'dr:prefs';
export const FIRST_OPEN_KEY = 'dr:first-open-done';
export const PREFS_ASKED_KEY = 'dr:prefs-asked';

export const DEFAULT_PREFS: Preferences = { card: null, frequency: null, captionStyle: 'blue', showHints: true };

export async function readPrefs(): Promise<Preferences> {
  return { ...DEFAULT_PREFS, ...(await readJson<Partial<Preferences>>(PREFS_KEY, {})) };
}

export function newKey(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    return (ch === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}
