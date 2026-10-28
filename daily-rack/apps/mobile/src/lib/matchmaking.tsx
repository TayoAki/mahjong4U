import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { router } from 'expo-router';
import { ApiError, api, type QueueMode, type QueueStatus } from './api.ts';
import { useRealtimeMessages } from './realtime.tsx';
import { useSafety } from './safety.tsx';
import { useSession } from './session.tsx';
import { track } from './analytics.ts';
import { playSound } from './sounds.ts';
import { usePlus } from './plus.tsx';

// Waiting for a public match. The wait carries on while you look around the app; when the
// server seats you, the table opens wherever you are.

interface Matchmaking {
  queue: QueueStatus | null;
  busy: boolean;
  error: string | null;
  find: (mode: QueueMode) => Promise<void>;
  cancel: () => Promise<void>;
}

const MatchmakingContext = createContext<Matchmaking>({
  queue: null,
  busy: false,
  error: null,
  find: async () => undefined,
  cancel: async () => undefined,
});

export function useMatchmaking(): Matchmaking {
  return useContext(MatchmakingContext);
}

export function MatchmakingProvider({ children }: { children: ReactNode }) {
  const { ready } = useSession();
  const { guard } = useSafety();
  const { handlePlusError } = usePlus();
  const [queue, setQueue] = useState<QueueStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pick up a wait that was already running (say, after reopening the app).
  useEffect(() => {
    if (!ready) return;
    api
      .matchmaking()
      .then((r) => setQueue(r.queue))
      .catch(() => undefined);
  }, [ready]);

  // While waiting, check now and then that the server still has us in line.
  useEffect(() => {
    if (!queue) return;
    const timer = setInterval(() => {
      api
        .matchmaking()
        .then((r) => {
          if (r.queue) setQueue(r.queue);
          else {
            setQueue(null);
            setError('The search stopped. Try again.');
          }
        })
        .catch(() => undefined);
    }, 6000);
    return () => clearInterval(timer);
  }, [queue?.mode, queue?.since]);

  useRealtimeMessages((m) => {
    if (m.type !== 'match') return;
    setQueue(null);
    setError(null);
    playSound('shuffle');
    track('match_found', { mode: m.mode });
    router.push(`/table/${m.tableId}`);
  });

  const find = useCallback(
    async (mode: QueueMode) => {
      setBusy(true);
      setError(null);
      try {
        const r = await guard(() => api.findMatch(mode));
        if (r) {
          setQueue(r.queue);
          track('match_search', { mode });
        }
      } catch (e) {
        if (e instanceof ApiError && e.code === 'in_match' && typeof e.extra.tableId === 'string') router.push(`/table/${e.extra.tableId}`);
        else if (!handlePlusError(e)) setError((e as Error).message);
      } finally {
        setBusy(false);
      }
    },
    [guard, handlePlusError],
  );

  const cancel = useCallback(async () => {
    setQueue(null);
    await api.cancelMatch().catch(() => undefined);
  }, []);

  return <MatchmakingContext.Provider value={{ queue, busy, error, find, cancel }}>{children}</MatchmakingContext.Provider>;
}
