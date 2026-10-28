import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../lib/api.ts';
import { track } from '../lib/analytics.ts';
import { useRealtime, useRealtimeMessages } from '../lib/realtime.tsx';
import { useSafety } from '../lib/safety.tsx';
import { useSession } from '../lib/session.tsx';
import { VoiceCall, type PeerInfo } from './VoiceCall.ts';
// No extension, so Metro picks webrtc.web.ts for the web build and webrtc.ts on phones.
import { loadWebRTC } from './webrtc';

export interface Voice {
  /** False where the device can't do voice chat (such as Expo Go). */
  available: boolean;
  joined: boolean;
  joining: boolean;
  /** Everyone in the table's call right now, you included once you join. */
  members: string[];
  peers: PeerInfo[];
  muted: boolean;
  error: string | null;
  join: () => Promise<void>;
  leave: () => void;
  toggleMute: () => void;
  togglePeer: (id: string) => void;
}

/** Voice chat for one private table. Leaving the table screen leaves the call. */
export function useVoice(tableId: string, enabled: boolean): Voice {
  const { principalId } = useSession();
  const { send, connected } = useRealtime();
  const { lastBlocked } = useSafety();
  const rtc = useMemo(loadWebRTC, []);
  const [members, setMembers] = useState<string[]>([]);
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [muted, setMuted] = useState(false);
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [error, setError] = useState<string | null>(null);
  const call = useRef<VoiceCall | null>(null);

  useRealtimeMessages((m) => {
    if (!('tableId' in m) || m.tableId !== tableId) return;
    if (m.type === 'voice-roster') {
      setMembers(m.members);
      call.current?.roster(m.members);
    } else if (m.type === 'voice-signal') {
      void call.current?.signal(m.from, m.data);
    } else if (m.type === 'voice-denied') {
      setError('Voice chat isn’t available at this table.');
      leave();
    }
  });

  const leave = useCallback(() => {
    call.current?.end();
    call.current = null;
    setPeers([]);
    setJoined(false);
    send({ type: 'voice-leave', tableId });
  }, [send, tableId]);

  const join = useCallback(async () => {
    if (!rtc || !principalId || call.current) return;
    setJoining(true);
    setError(null);
    try {
      const [{ iceServers }, stream] = await Promise.all([
        api.voiceConfig(),
        rtc.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false }),
      ]);
      call.current = new VoiceCall(
        rtc,
        principalId,
        stream,
        iceServers,
        (to, data) => send({ type: 'voice-signal', tableId, to, data }),
        () => setPeers(call.current?.list() ?? []),
      );
      call.current.setMuted(false);
      setMuted(false);
      setJoined(true);
      send({ type: 'voice-join', tableId });
      track('voice_joined', { tableId });
    } catch (e) {
      const name = (e as { name?: string }).name;
      setError(name === 'NotAllowedError' || name === 'PermissionDeniedError' ? 'Microphone access is off. Turn it on in Settings to talk.' : 'Couldn’t start voice chat. Check your connection and try again.');
    } finally {
      setJoining(false);
    }
  }, [principalId, rtc, send, tableId]);

  // After a reconnect the server may have forgotten the call: say we're still in it.
  useEffect(() => {
    if (connected && call.current) send({ type: 'voice-join', tableId });
  }, [connected, send, tableId]);

  // A player you block is dropped from your call straight away.
  useEffect(() => {
    if (lastBlocked) call.current?.close(lastBlocked.id);
  }, [lastBlocked]);

  // Leave when the screen goes away or voice stops being allowed here.
  useEffect(() => {
    if (!enabled && call.current) leave();
  }, [enabled, leave]);
  useEffect(() => () => {
    call.current?.end();
    call.current = null;
    send({ type: 'voice-leave', tableId });
  }, [send, tableId]);

  return {
    available: Boolean(rtc),
    joined,
    joining,
    members,
    peers,
    muted,
    error,
    join,
    leave,
    toggleMute: () => {
      const next = !muted;
      call.current?.setMuted(next);
      setMuted(next);
    },
    togglePeer: (id) => {
      const peer = peers.find((p) => p.id === id);
      call.current?.mutePeer(id, !peer?.muted);
    },
  };
}
