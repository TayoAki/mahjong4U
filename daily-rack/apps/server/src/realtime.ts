import { createHash, randomBytes } from 'node:crypto';

// Pushes updates to every open connection a player has (phone and laptop at once).
// Clients connect with a one-time ticket so session tokens never appear in URLs.

export interface Socket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export type ServerMessage =
  | { type: 'hello'; principalId: string }
  | { type: 'table'; tableId: string; payload: unknown }
  | { type: 'message'; conversationId: string; message: unknown }
  | { type: 'friends' }
  | { type: 'night'; nightId: string }
  | { type: 'presence'; principalId: string; online: boolean }
  | { type: 'match'; tableId: string; mode: 'casual' | 'ranked' }
  | { type: 'voice-roster'; tableId: string; members: string[] }
  | { type: 'voice-signal'; tableId: string; from: string; data: unknown }
  | { type: 'voice-denied'; tableId: string }
  | { type: 'pong' };

const TICKET_TTL_MS = 60_000;

export class Hub {
  private sockets = new Map<string, Set<Socket>>();
  /** Connections whose app said it went to the background (phones keep the socket a while). */
  private background = new WeakSet<Socket>();
  private tickets = new Map<string, { principalId: string; expiresAt: number }>();

  issueTicket(principalId: string): string {
    const ticket = randomBytes(24).toString('base64url');
    this.tickets.set(hash(ticket), { principalId, expiresAt: Date.now() + TICKET_TTL_MS });
    if (this.tickets.size > 5_000) this.prune();
    return ticket;
  }

  /** Each ticket works once and only for a minute. */
  redeemTicket(ticket: string): string | null {
    const key = hash(ticket);
    const entry = this.tickets.get(key);
    this.tickets.delete(key);
    if (!entry || entry.expiresAt < Date.now()) return null;
    return entry.principalId;
  }

  connect(principalId: string, socket: Socket): void {
    let set = this.sockets.get(principalId);
    const wasOnline = Boolean(set?.size);
    if (!set) {
      set = new Set();
      this.sockets.set(principalId, set);
    }
    set.add(socket);
    socket.send(JSON.stringify({ type: 'hello', principalId } satisfies ServerMessage));
    if (!wasOnline) this.onPresence?.(principalId, true);
  }

  disconnect(principalId: string, socket: Socket): void {
    const set = this.sockets.get(principalId);
    if (!set) return;
    set.delete(socket);
    if (set.size === 0) {
      this.sockets.delete(principalId);
      this.onPresence?.(principalId, false);
    }
  }

  isOnline(principalId: string): boolean {
    return Boolean(this.sockets.get(principalId)?.size);
  }

  /** True while the player has the app open in front of them on some device. */
  isActive(principalId: string): boolean {
    for (const socket of this.sockets.get(principalId) ?? []) if (!this.background.has(socket)) return true;
    return false;
  }

  /** The app says whether it's in front ("active") or in the background. */
  setActive(socket: Socket, active: boolean): void {
    if (active) this.background.delete(socket);
    else this.background.add(socket);
  }

  send(principalId: string, message: ServerMessage): void {
    const set = this.sockets.get(principalId);
    if (!set) return;
    const data = JSON.stringify(message);
    for (const socket of set) {
      try {
        socket.send(data);
      } catch {
        set.delete(socket);
      }
    }
  }

  sendMany(principalIds: Iterable<string>, message: ServerMessage): void {
    for (const id of new Set(principalIds)) this.send(id, message);
  }

  /** Set by the app so friends hear when someone comes online. */
  onPresence?: (principalId: string, online: boolean) => void;

  /** Set by the app to handle what clients send over their sockets (voice chat setup). */
  onClientMessage?: (principalId: string, message: Record<string, unknown>) => void;

  private prune() {
    const now = Date.now();
    for (const [key, entry] of this.tickets) if (entry.expiresAt < now) this.tickets.delete(key);
  }
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
