import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { api, getBearer, setBearer, type Profile } from './api.ts';

// One guest identity per device, created on first launch. Native keeps its token in the
// keychain/keystore; the web build relies on the server's HttpOnly cookie.

const TOKEN_KEY = 'dr.session';

interface Session {
  ready: boolean;
  error: string | null;
  principalId: string | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  retry: () => void;
}

const SessionContext = createContext<Session>({
  ready: false,
  error: null,
  principalId: null,
  profile: null,
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
  const [state, setState] = useState<{ ready: boolean; error: string | null; principalId: string | null; profile: Profile | null }>({
    ready: false,
    error: null,
    principalId: null,
    profile: null,
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
        if (!cancelled) setState({ ready: true, error: null, principalId: session.principalId, profile });
      } catch (error) {
        if (!cancelled) setState((s) => ({ ...s, ready: false, error: (error as Error).message }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [attempt]);

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
