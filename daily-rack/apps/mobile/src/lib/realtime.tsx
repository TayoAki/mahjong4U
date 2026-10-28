import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AppState } from 'react-native';
import { api } from './api.ts';
import { realtimeUrl } from './config.ts';
import { useSession } from './session.tsx';

// One WebSocket per app, opened with a one-time ticket. Screens subscribe to the message
// types they care about. Reconnects with backoff and whenever the app returns to the front.

export type RealtimeMessage =
  | { type: 'hello'; principalId: string }
  | { type: 'table'; tableId: string; payload: any }
  | { type: 'message'; conversationId: string; message: any }
  | { type: 'friends' }
  | { type: 'night'; nightId: string }
  | { type: 'presence'; principalId: string; online: boolean }
  | { type: 'match'; tableId: string; mode: 'casual' | 'ranked' }
  | { type: 'voice-roster'; tableId: string; members: string[] }
  | { type: 'voice-signal'; tableId: string; from: string; data: any }
  | { type: 'voice-denied'; tableId: string }
  | { type: 'pong' };

type Listener = (message: RealtimeMessage) => void;

interface Realtime {
  connected: boolean;
  subscribe: (listener: Listener) => () => void;
  /** Sends a message to the server over the socket (voice chat setup). False when offline. */
  send: (message: Record<string, unknown>) => boolean;
}

const RealtimeContext = createContext<Realtime>({ connected: false, subscribe: () => () => undefined, send: () => false });

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { ready } = useSession();
  const [connected, setConnected] = useState(false);
  const listeners = useRef(new Set<Listener>());
  const socket = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!ready) return;
    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const connect = async () => {
      if (stopped || socket.current) return;
      try {
        const { ticket } = await api.realtimeTicket();
        if (stopped) return;
        const ws = new WebSocket(realtimeUrl(ticket));
        socket.current = ws;
        ws.onopen = () => {
          attempt = 0;
          setConnected(true);
          pingTimer = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'ping' })), 25_000);
        };
        ws.onmessage = (event) => {
          try {
            const message = JSON.parse(String(event.data)) as RealtimeMessage;
            for (const listener of listeners.current) listener(message);
          } catch {
            // Ignore malformed frames.
          }
        };
        ws.onclose = () => {
          clearInterval(pingTimer);
          socket.current = null;
          setConnected(false);
          schedule();
        };
        ws.onerror = () => ws.close();
      } catch {
        schedule();
      }
    };

    const schedule = () => {
      if (stopped) return;
      clearTimeout(retryTimer);
      const delay = Math.min(30_000, 1000 * 2 ** attempt) + Math.random() * 500;
      attempt += 1;
      retryTimer = setTimeout(connect, delay);
    };

    connect();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !socket.current) {
        attempt = 0;
        connect();
      }
    });
    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      sub.remove();
      socket.current?.close();
      socket.current = null;
    };
  }, [ready]);

  const subscribe = useCallback((listener: Listener) => {
    listeners.current.add(listener);
    return () => {
      listeners.current.delete(listener);
    };
  }, []);

  const send = useCallback((message: Record<string, unknown>) => {
    const ws = socket.current;
    if (!ws || ws.readyState !== 1) return false;
    ws.send(JSON.stringify(message));
    return true;
  }, []);

  return <RealtimeContext.Provider value={{ connected, subscribe, send }}>{children}</RealtimeContext.Provider>;
}

export function useRealtime(): Realtime {
  return useContext(RealtimeContext);
}

/** Calls `onMessage` for every realtime message while the component is mounted. */
export function useRealtimeMessages(onMessage: Listener): void {
  const { subscribe } = useRealtime();
  const handler = useRef(onMessage);
  handler.current = onMessage;
  useEffect(() => subscribe((m) => handler.current(m)), [subscribe]);
}
