import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { ApiError, api, getBearer, setBearer, type MyProfile } from './api.ts';
import { readJson, writeJson } from './storage.ts';
import { syncOfflineResults } from '../offline/results.ts';
import { sendQueuedBugReports } from './bug-reports.ts';

// One guest identity per device, created on first launch. Native keeps its token in the
// keychain/keystore; the web build relies on the server's HttpOnly cookie. If the server
// can't be reached but this device has been here before, the app still opens (offline)
// with the last known profile, so offline games and lessons work, and keeps trying.

const TOKEN_KEY = 'dr.session';
const CACHE_KEY = 'dr:session-cache';
const OFFLINE_RETRY_MS = 20_000;

interface Session {
  ready: boolean;
  error: string | null;
  principalId: string | null;
  profile: MyProfile | null;
  /** True while the server can't be reached; the app runs on what it last knew. */
  offline: boolean;
  refreshProfile: () => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<Session>({
  ready: false,
  error: null,
  principalId: null,
  profile: null,
  offline: false,
  refreshProfile: async () => undefined,
  retry: () => undefined,
});

async function storedToken(): Promise<string | null> {
  if (Platform.OS === 'web') return getBearer();
  try {
    return await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ ready: boolean; error: string | null; principalId: string | null; profile: MyProfile | null; offline: boolean }>({
    ready: false,
    error: null,
    principalId: null,
    profile: null,
    offline: false,
  });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await storedToken();
        if (token) setBearer(token);
        const session = await api.guestSession();
        if (session.token && Platform.OS !== 'web') {
          setBearer(session.token);
          await SecureStore.setItemAsync(TOKEN_KEY, session.token).catch(() => undefined);
        }
        const profile = await api.profile();
        void writeJson(CACHE_KEY, { principalId: session.principalId, profile });
        // Hands played offline join your stats, and problem reports go out, once the server is reachable.
        void syncOfflineResults().catch(() => undefined);
        void sendQueuedBugReports().catch(() => undefined);
        if (!cancelled) setState({ ready: true, error: null, principalId: session.principalId, profile, offline: false });
      } catch (error) {
        const cache = error instanceof ApiError && error.code === 'network' ? await readJson<{ principalId: string; profile: MyProfile } | null>(CACHE_KEY, null) : null;
        if (cancelled) return;
        if (cache) setState({ ready: true, error: null, principalId: cache.principalId, profile: cache.profile, offline: true });
        else setState((s) => ({ ...s, ready: false, error: (error as Error).message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // While offline, keep checking for the connection to come back.
  useEffect(() => {
    if (!state.offline) return;
    const timer = setTimeout(() => setAttempt((n) => n + 1), OFFLINE_RETRY_MS);
    return () => clearTimeout(timer);
  }, [state.offline, attempt]);

  const refreshProfile = useCallback(async () => {
    const profile = await api.profile();
    setState((s) => ({ ...s, profile }));
  }, []);

  return (
    <SessionContext.Provider value={{ ...state, refreshProfile, retry: () => setAttempt((n) => n + 1) }}>{children}</SessionContext.Provider>
  );
}

export function useSession(): Session {
  return useContext(SessionContext);
}

export async function forgetSession(): Promise<void> {
  setBearer(null);
  if (Platform.OS !== 'web') await SecureStore.deleteItemAsync(TOKEN_KEY).catch(() => undefined);
}
