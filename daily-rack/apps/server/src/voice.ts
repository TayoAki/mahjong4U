import { isBlockedEitherWay } from './blocks.ts';
import type { Db } from './db.ts';
import type { Hub } from './realtime.ts';
import type { TableService } from './tables.ts';

// Voice chat at private tables. Audio goes directly between players' devices (WebRTC);
// the server only keeps track of who has joined each table's voice room and relays the
// connection setup messages between them. Only people seated at the same private table,
// who haven't blocked each other, can reach one another.

const MAX_SDP = 12_000;
const MAX_CANDIDATE = 1_000;

type Signal = { sdp: { type: 'offer' | 'answer'; sdp: string } } | { candidate: { candidate: string; sdpMid?: string | null; sdpMLineIndex?: number | null } };

function validSignal(data: unknown): data is Signal {
  if (!data || typeof data !== 'object') return false;
  const d = data as Record<string, unknown>;
  if (d.sdp && typeof d.sdp === 'object') {
    const sdp = d.sdp as Record<string, unknown>;
    return (sdp.type === 'offer' || sdp.type === 'answer') && typeof sdp.sdp === 'string' && sdp.sdp.length <= MAX_SDP;
  }
  if (d.candidate && typeof d.candidate === 'object') {
    const c = d.candidate as Record<string, unknown>;
    return typeof c.candidate === 'string' && c.candidate.length <= MAX_CANDIDATE;
  }
  return false;
}

export class VoiceRooms {
  private rooms = new Map<string, Set<string>>();

  constructor(
    private db: Db,
    private hub: Hub,
    private tables: TableService,
  ) {}

  members(tableId: string): string[] {
    return [...(this.rooms.get(tableId) ?? [])];
  }

  /** A message a client sent over its socket. Anything not about voice is ignored. */
  handle(principalId: string, message: Record<string, unknown>): void {
    const tableId = typeof message.tableId === 'string' ? message.tableId : null;
    if (!tableId) return;
    switch (message.type) {
      case 'voice-join': {
        if (!this.tables.voiceAllowed(tableId, principalId)) {
          this.hub.send(principalId, { type: 'voice-denied', tableId });
          return;
        }
        let room = this.rooms.get(tableId);
        if (!room) {
          room = new Set();
          this.rooms.set(tableId, room);
        }
        room.add(principalId);
        this.roster(tableId);
        return;
      }
      case 'voice-leave':
        this.remove(tableId, principalId);
        return;
      case 'voice-signal': {
        const to = typeof message.to === 'string' ? message.to : null;
        const room = this.rooms.get(tableId);
        if (!to || !room?.has(principalId) || !room.has(to) || !validSignal(message.data)) return;
        // Both must still be seated there (someone may have left the table) and not blocked.
        if (!this.tables.voiceAllowed(tableId, principalId) || !this.tables.voiceAllowed(tableId, to)) return;
        if (isBlockedEitherWay(this.db, principalId, to)) return;
        this.hub.send(to, { type: 'voice-signal', tableId, from: principalId, data: message.data });
        return;
      }
    }
  }

  /** Someone with no open connections left can't be in a call. */
  disconnected(principalId: string): void {
    for (const tableId of [...this.rooms.keys()]) this.remove(tableId, principalId);
  }

  private remove(tableId: string, principalId: string) {
    const room = this.rooms.get(tableId);
    if (!room?.delete(principalId)) return;
    if (room.size === 0) this.rooms.delete(tableId);
    this.roster(tableId);
  }

  /** Everyone seated hears who is in the call, so they can see it and join. */
  private roster(tableId: string) {
    const members = this.members(tableId);
    this.hub.sendMany(new Set([...this.tables.seatedPeople(tableId), ...members]), { type: 'voice-roster', tableId, members });
  }
}
