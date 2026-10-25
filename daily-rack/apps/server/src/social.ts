import { randomBytes, randomUUID } from 'node:crypto';
import { isBlockedEitherWay } from './blocks.ts';
import type { Db } from './db.ts';
import type { Hub } from './realtime.ts';

// Profiles, friends and chat. Friend codes are short and easy to read aloud.

export interface Profile {
  id: string;
  name: string;
  code: string;
  color: string;
}

const COLORS = ['#99028F', '#1B4F9C', '#B62226', '#164D3F', '#C77700', '#5B3FA0', '#00796B', '#AD1457'];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const NAME_MAX = 24;
export const MESSAGE_MAX = 500;

function friendCode(): string {
  const bytes = randomBytes(8);
  return [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

interface ProfileRow {
  principal_id: string;
  display_name: string;
  friend_code: string;
  color: string;
}

const toProfile = (r: ProfileRow): Profile => ({ id: r.principal_id, name: r.display_name, code: r.friend_code, color: r.color });

/** Every player gets a profile the first time anyone asks for it. */
export function ensureProfile(db: Db, principalId: string, now: Date): Profile {
  const existing = db.prepare('SELECT * FROM profiles WHERE principal_id = ?').get(principalId) as ProfileRow | undefined;
  if (existing) return toProfile(existing);
  const color = COLORS[randomBytes(1)[0]! % COLORS.length]!;
  const name = `Player ${principalId.slice(0, 4).toUpperCase()}`;
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      db.prepare('INSERT INTO profiles (principal_id, display_name, friend_code, color, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)').run(
        principalId,
        name,
        friendCode(),
        color,
        now.toISOString(),
        now.toISOString(),
      );
      break;
    } catch (error) {
      if (attempt === 4) throw error;
    }
  }
  return toProfile(db.prepare('SELECT * FROM profiles WHERE principal_id = ?').get(principalId) as unknown as ProfileRow);
}

export function profilesFor(db: Db, ids: readonly string[], now: Date): Map<string, Profile> {
  return new Map(ids.map((id) => [id, ensureProfile(db, id, now)]));
}

export function cleanName(raw: string): string | null {
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return name.length >= 1 && name.length <= NAME_MAX ? name : null;
}

export function renameProfile(db: Db, principalId: string, name: string, now: Date): Profile {
  ensureProfile(db, principalId, now);
  db.prepare('UPDATE profiles SET display_name = ?, updated_at = ? WHERE principal_id = ?').run(name, now.toISOString(), principalId);
  return ensureProfile(db, principalId, now);
}

// ---------------------------------------------------------------------------
// Friends

export function areFriends(db: Db, a: string, b: string): boolean {
  const row = db
    .prepare(
      `SELECT 1 FROM friendships WHERE status = 'accepted' AND ((requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?))`,
    )
    .get(a, b, b, a);
  return Boolean(row);
}

export function friendIds(db: Db, principalId: string): string[] {
  const rows = db
    .prepare(
      `SELECT CASE WHEN requester = ? THEN addressee ELSE requester END AS id FROM friendships
       WHERE status = 'accepted' AND (requester = ? OR addressee = ?)`,
    )
    .all(principalId, principalId, principalId) as { id: string }[];
  return rows.map((r) => r.id);
}

export function friendsOverview(db: Db, hub: Hub, principalId: string, now: Date) {
  const incoming = db.prepare(`SELECT requester AS id FROM friendships WHERE addressee = ? AND status = 'pending'`).all(principalId) as { id: string }[];
  const outgoing = db.prepare(`SELECT addressee AS id FROM friendships WHERE requester = ? AND status = 'pending'`).all(principalId) as { id: string }[];
  const withPresence = (id: string) => ({ ...ensureProfile(db, id, now), online: hub.isOnline(id) });
  return {
    me: ensureProfile(db, principalId, now),
    friends: friendIds(db, principalId)
      .map(withPresence)
      .sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name)),
    incoming: incoming.map((r) => ensureProfile(db, r.id, now)),
    outgoing: outgoing.map((r) => ensureProfile(db, r.id, now)),
  };
}

export type FriendRequestResult = 'requested' | 'accepted' | 'already-friends';

/** Sends a request by friend code. If they already asked you, this accepts it. */
export function requestFriend(db: Db, principalId: string, code: string, now: Date): { result: FriendRequestResult; friend: Profile } | null {
  const target = db.prepare('SELECT * FROM profiles WHERE friend_code = ?').get(code.trim().toUpperCase()) as ProfileRow | undefined;
  // A block either way looks the same as a wrong code, so nobody learns they were blocked.
  if (!target || target.principal_id === principalId || isBlockedEitherWay(db, principalId, target.principal_id)) return null;
  const friend = toProfile(target);
  if (areFriends(db, principalId, friend.id)) return { result: 'already-friends', friend };
  const reverse = db.prepare(`SELECT 1 FROM friendships WHERE requester = ? AND addressee = ? AND status = 'pending'`).get(friend.id, principalId);
  if (reverse) {
    db.prepare(`UPDATE friendships SET status = 'accepted', responded_at = ? WHERE requester = ? AND addressee = ?`).run(now.toISOString(), friend.id, principalId);
    return { result: 'accepted', friend };
  }
  db.prepare(`INSERT OR IGNORE INTO friendships (requester, addressee, status, created_at) VALUES (?, ?, 'pending', ?)`).run(principalId, friend.id, now.toISOString());
  return { result: 'requested', friend };
}

export function acceptFriend(db: Db, principalId: string, requesterId: string, now: Date): boolean {
  if (isBlockedEitherWay(db, principalId, requesterId)) return false;
  const result = db
    .prepare(`UPDATE friendships SET status = 'accepted', responded_at = ? WHERE requester = ? AND addressee = ? AND status = 'pending'`)
    .run(now.toISOString(), requesterId, principalId);
  return Number(result.changes) > 0;
}

/** Declines, cancels or unfriends, whichever applies. */
export function removeFriend(db: Db, principalId: string, otherId: string): boolean {
  const result = db
    .prepare('DELETE FROM friendships WHERE (requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?)')
    .run(principalId, otherId, otherId, principalId);
  return Number(result.changes) > 0;
}

// ---------------------------------------------------------------------------
// Chat

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  body: string;
  createdAt: string;
}

interface ConversationRow {
  id: string;
  kind: 'direct' | 'table' | 'night';
  ref: string;
  created_at: string;
}

export function directKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}

export function conversationFor(db: Db, kind: ConversationRow['kind'], ref: string, now: Date): ConversationRow {
  db.prepare('INSERT OR IGNORE INTO conversations (id, kind, ref, created_at) VALUES (?, ?, ?, ?)').run(randomUUID(), kind, ref, now.toISOString());
  return db.prepare('SELECT * FROM conversations WHERE kind = ? AND ref = ?').get(kind, ref) as unknown as ConversationRow;
}

/** Who belongs to a conversation right now. Direct chats need an accepted friendship. */
export function conversationMembers(db: Db, conversation: ConversationRow): string[] {
  switch (conversation.kind) {
    case 'direct': {
      const [a, b] = conversation.ref.split('|') as [string, string];
      return areFriends(db, a, b) ? [a, b] : [];
    }
    case 'table': {
      const row = db.prepare('SELECT seats FROM tables WHERE id = ?').get(conversation.ref) as { seats: string } | undefined;
      if (!row) return [];
      return (JSON.parse(row.seats) as { principalId: string | null }[]).flatMap((s) => (s.principalId ? [s.principalId] : []));
    }
    case 'night': {
      const rows = db.prepare('SELECT principal_id FROM night_members WHERE night_id = ?').all(conversation.ref) as { principal_id: string }[];
      return rows.map((r) => r.principal_id);
    }
  }
}

export function getConversation(db: Db, id: string): ConversationRow | null {
  return (db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined) ?? null;
}

export function postMessage(db: Db, hub: Hub, conversation: ConversationRow, senderId: string, body: string, now: Date): Message {
  const message: Message = { id: randomUUID(), conversationId: conversation.id, senderId, body, createdAt: now.toISOString() };
  db.prepare('INSERT INTO messages (id, conversation_id, sender_id, body, created_at) VALUES (?, ?, ?, ?, ?)').run(
    message.id,
    message.conversationId,
    message.senderId,
    message.body,
    message.createdAt,
  );
  markRead(db, conversation.id, senderId, now);
  const recipients = conversationMembers(db, conversation).filter((id) => id === senderId || !isBlockedEitherWay(db, senderId, id));
  hub.sendMany(recipients, { type: 'message', conversationId: conversation.id, message });
  return message;
}

/**
 * Messages one player can see: not removed by a moderator, not from a suspended player,
 * not from anyone they blocked or who blocked them, and not ones they reported.
 */
export function listMessages(db: Db, conversationId: string, viewerId: string, before: string | null, limit = 50): Message[] {
  const rows = db
    .prepare(
      `SELECT m.* FROM messages m LEFT JOIN profiles p ON p.principal_id = m.sender_id
       WHERE m.conversation_id = ? AND m.created_at < ? AND m.hidden_at IS NULL AND p.suspended_at IS NULL
         AND (m.sender_id IS NULL OR m.sender_id NOT IN (
           SELECT blocked_id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id FROM blocks WHERE blocked_id = ?))
         AND m.id NOT IN (SELECT message_id FROM reports WHERE reporter_id = ? AND message_id IS NOT NULL)
       ORDER BY m.created_at DESC LIMIT ?`,
    )
    .all(conversationId, before ?? '9999', viewerId, viewerId, viewerId, limit) as { id: string; conversation_id: string; sender_id: string | null; body: string; created_at: string }[];
  return rows.reverse().map((r) => ({ id: r.id, conversationId: r.conversation_id, senderId: r.sender_id, body: r.body, createdAt: r.created_at }));
}

export function markRead(db: Db, conversationId: string, principalId: string, now: Date): void {
  db.prepare(
    `INSERT INTO conversation_reads (conversation_id, principal_id, last_read_at) VALUES (?, ?, ?)
     ON CONFLICT (conversation_id, principal_id) DO UPDATE SET last_read_at = excluded.last_read_at`,
  ).run(conversationId, principalId, now.toISOString());
}

/** Direct chats with each friend, newest activity first, with an unread count. */
export function directInbox(db: Db, principalId: string, now: Date) {
  return friendIds(db, principalId)
    .map((friendId) => {
      const conversation = conversationFor(db, 'direct', directKey(principalId, friendId), now);
      const last = db
        .prepare('SELECT body, sender_id, created_at FROM messages WHERE conversation_id = ? AND hidden_at IS NULL ORDER BY created_at DESC LIMIT 1')
        .get(conversation.id) as { body: string; sender_id: string | null; created_at: string } | undefined;
      const read = db
        .prepare('SELECT last_read_at FROM conversation_reads WHERE conversation_id = ? AND principal_id = ?')
        .get(conversation.id, principalId) as { last_read_at: string } | undefined;
      const unread = db
        .prepare('SELECT COUNT(*) AS n FROM messages WHERE conversation_id = ? AND created_at > ? AND hidden_at IS NULL AND (sender_id IS NULL OR sender_id != ?)')
        .get(conversation.id, read?.last_read_at ?? '', principalId) as { n: number };
      return {
        conversationId: conversation.id,
        friend: ensureProfile(db, friendId, now),
        last: last ? { body: last.body, senderId: last.sender_id, createdAt: last.created_at } : null,
        unread: Number(unread.n),
      };
    })
    .sort((a, b) => (b.last?.createdAt ?? '').localeCompare(a.last?.createdAt ?? ''));
}
