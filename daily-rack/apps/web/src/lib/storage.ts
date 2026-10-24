// localStorage can be unavailable (private mode, blocked site data). Every access is
// guarded so the app keeps working, just without the convenience being remembered.

export function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function writeJson(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the draft simply is not remembered.
  }
}

export function remove(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export function clearAll(): void {
  try {
    window.localStorage.clear();
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
}

export const PREFS_KEY = 'dr:prefs';
export const FIRST_OPEN_KEY = 'dr:first-open-done';
export const PREFS_ASKED_KEY = 'dr:prefs-asked';

export function readPrefs(): Preferences {
  return readJson<Preferences>(PREFS_KEY, { card: null, frequency: null, captionStyle: 'blue' });
}
