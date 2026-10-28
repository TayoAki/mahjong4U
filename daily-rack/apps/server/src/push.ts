import type { Db } from './db.ts';
import type { Hub } from './realtime.ts';

// Push notifications through Expo's push service: "your move" at turn-based tables, table
// and friend invites, messages from friends, and Game Night news. Nobody gets a push while
// the app is open in front of them, since the app already shows it; each player picks
// which kinds they want.

export const PUSH_CATEGORIES = ['turns', 'invites', 'messages', 'nights'] as const;
export type PushCategory = (typeof PUSH_CATEGORIES)[number];
export type NotificationSettings = Record<PushCategory, boolean>;

export interface PushNote {
  category: PushCategory;
  title: string;
  body: string;
  /** Where tapping it opens the app, e.g. /table/<id>. */
  url: string;
  /** Notes with the same key are sent at most once per `throttleMs` (until `forget`). */
  key?: string;
  throttleMs?: number;
}

/** One message in Expo's push API format. */
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data: { url: string; category: PushCategory };
  sound: 'default';
  channelId: PushCategory;
  priority: 'high' | 'default';
}
export type ExpoTicket = { status: 'ok'; id: string } | { status: 'error'; message: string; details?: { error?: string } };
export type PushSender = (messages: ExpoMessage[]) => Promise<ExpoTicket[]>;

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';
const BATCH = 100;

/** Sends through Expo's push service. An access token is only needed if "enhanced push security" is on. */
export function expoPushSender(accessToken?: string | null): PushSender {
  return async (messages) => {
    const tickets: ExpoTicket[] = [];
    for (let i = 0; i < messages.length; i += BATCH) {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', ...(accessToken ? { authorization: `Bearer ${accessToken}` } : {}) },
        body: JSON.stringify(messages.slice(i, i + BATCH)),
      });
      if (!res.ok) throw new Error(`Expo push service answered HTTP ${res.status}`);
      const json = (await res.json()) as { data?: ExpoTicket[] };
      tickets.push(...(json.data ?? []));
    }
    return tickets;
  };
}

export const EXPO_TOKEN = /^Expo(nent)?PushToken\[[A-Za-z0-9_-]{8,}\]$/;

export class Notifier {
  private sent = new Map<string, number>();

  constructor(
    private db: Db,
    private hub: Hub,
    private sender: PushSender | null,
    private now: () => Date = () => new Date(),
  ) {}

  saveToken(principalId: string, token: string, platform: 'ios' | 'android'): void {
    const at = this.now().toISOString();
    // A phone that starts over as a new guest takes its token with it.
    this.db
      .prepare(
        `INSERT INTO push_tokens (token, principal_id, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(token) DO UPDATE SET principal_id = excluded.principal_id, platform = excluded.platform, updated_at = excluded.updated_at`,
      )
      .run(token, principalId, platform, at, at);
  }

  removeToken(principalId: string, token: string): void {
    this.db.prepare('DELETE FROM push_tokens WHERE token = ? AND principal_id = ?').run(token, principalId);
  }

  devices(principalId: string): number {
    return Number((this.db.prepare('SELECT COUNT(*) AS n FROM push_tokens WHERE principal_id = ?').get(principalId) as { n: number }).n);
  }

  settings(principalId: string): NotificationSettings {
    const row = this.db.prepare('SELECT turns, invites, messages, nights FROM notification_settings WHERE principal_id = ?').get(principalId) as
      | Record<PushCategory, number>
      | undefined;
    return Object.fromEntries(PUSH_CATEGORIES.map((c) => [c, row ? Boolean(row[c]) : true])) as NotificationSettings;
  }

  updateSettings(principalId: string, change: Partial<NotificationSettings>): NotificationSettings {
    const next = { ...this.settings(principalId), ...change };
    this.db
      .prepare(
        `INSERT INTO notification_settings (principal_id, turns, invites, messages, nights, updated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(principal_id) DO UPDATE SET turns = excluded.turns, invites = excluded.invites, messages = excluded.messages, nights = excluded.nights, updated_at = excluded.updated_at`,
      )
      .run(principalId, Number(next.turns), Number(next.invites), Number(next.messages), Number(next.nights), this.now().toISOString());
    return next;
  }

  /** Lets the next note with this key through, e.g. once a player has taken their turn. */
  forget(principalId: string, key: string): void {
    this.sent.delete(`${principalId}:${key}`);
  }

  /** Sends a note to each player who wants it and isn't looking at the app. Never throws. */
  notify(principalIds: Iterable<string>, note: PushNote): void {
    if (!this.sender) return;
    const messages: ExpoMessage[] = [];
    const at = this.now().getTime();
    for (const principalId of new Set(principalIds)) {
      if (this.hub.isActive(principalId) || !this.settings(principalId)[note.category]) continue;
      if (note.key) {
        const throttleKey = `${principalId}:${note.key}`;
        const last = this.sent.get(throttleKey);
        if (last !== undefined && at - last < (note.throttleMs ?? 0)) continue;
        this.sent.set(throttleKey, at);
      }
      const tokens = this.db.prepare('SELECT token FROM push_tokens WHERE principal_id = ?').all(principalId) as { token: string }[];
      for (const { token } of tokens) {
        messages.push({
          to: token,
          title: note.title,
          body: note.body.length > 180 ? `${note.body.slice(0, 179)}…` : note.body,
          data: { url: note.url, category: note.category },
          sound: 'default',
          channelId: note.category,
          priority: note.category === 'turns' || note.category === 'invites' ? 'high' : 'default',
        });
      }
    }
    if (this.sent.size > 20_000) this.sent.clear();
    if (messages.length > 0) void this.deliver(messages);
  }

  private async deliver(messages: ExpoMessage[]): Promise<void> {
    try {
      const tickets = await this.sender!(messages);
      tickets.forEach((ticket, i) => {
        if (ticket.status !== 'error') return;
        // The app was deleted or notifications were turned off: stop sending to that phone.
        if (ticket.details?.error === 'DeviceNotRegistered') this.db.prepare('DELETE FROM push_tokens WHERE token = ?').run(messages[i]!.to);
        else console.log(JSON.stringify({ level: 'warn', message: 'push_failed', error: ticket.details?.error ?? ticket.message }));
      });
    } catch (error) {
      console.log(JSON.stringify({ level: 'warn', message: 'push_failed', error: (error as Error).message }));
    }
  }
}
