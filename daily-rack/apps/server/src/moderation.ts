import { randomUUID, timingSafeEqual } from 'node:crypto';
import { RegExpMatcher, englishDataset, englishRecommendedTransformers } from 'obscenity';
import { transaction, type Db } from './db.ts';
import { ensureProfile, type Profile } from './social.ts';

// Player safety: community rules, a word filter, blocking, reports and the moderator's
// tools. App stores require all four for apps where players can message each other.

export class ModerationError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

// ---------------------------------------------------------------------------
// Word filter

const matcher = new RegExpMatcher({ ...englishDataset.build(), ...englishRecommendedTransformers });

/** True when text contains slurs or profanity, including common disguises like "sh1t". */
export function isObjectionable(text: string): boolean {
  return matcher.hasMatch(text);
}

// ---------------------------------------------------------------------------
// Community rules and suspension

interface SafetyRow {
  rules_accepted_at: string | null;
  suspended_at: string | null;
}

function safetyOf(db: Db, principalId: string, now: Date): SafetyRow {
  ensureProfile(db, principalId, now);
  return db.prepare('SELECT rules_accepted_at, suspended_at FROM profiles WHERE principal_id = ?').get(principalId) as unknown as SafetyRow;
}

export function safetyStatus(db: Db, principalId: string, now: Date): { rulesAccepted: boolean; suspended: boolean } {
  const row = safetyOf(db, principalId, now);
  return { rulesAccepted: row.rules_accepted_at !== null, suspended: row.suspended_at !== null };
}

export function acceptRules(db: Db, principalId: string, now: Date): void {
  ensureProfile(db, principalId, now);
  db.prepare('UPDATE profiles SET rules_accepted_at = COALESCE(rules_accepted_at, ?) WHERE principal_id = ?').run(now.toISOString(), principalId);
}

/** Throws unless the player may message people, add friends or join a game night. */
export function requireSocial(db: Db, principalId: string, now: Date): void {
  const row = safetyOf(db, principalId, now);
  if (row.suspended_at) {
    throw new ModerationError(403, 'suspended', 'Chat and friend features are paused on your account after a report. Contact support if you think this is a mistake.');
  }
  if (!row.rules_accepted_at) throw new ModerationError(403, 'rules_required', 'Agree to the community rules first.');
}

// ---------------------------------------------------------------------------
// Blocking

/**
 * Blocks a player: ends any friendship or pending request, and takes each of them out of
 * the other's game nights. Messages between them stop showing (see listMessages).
 */
export function blockPlayer(db: Db, blockerId: string, blockedId: string, now: Date): void {
  if (blockerId === blockedId) throw new ModerationError(400, 'self_block', 'You can’t block yourself.');
  if (!db.prepare('SELECT 1 FROM principals WHERE id = ?').get(blockedId)) throw new ModerationError(404, 'player_not_found', 'That player no longer exists.');
  transaction(db, () => {
    db.prepare('INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)').run(blockerId, blockedId, now.toISOString());
    db.prepare('DELETE FROM friendships WHERE (requester = ? AND addressee = ?) OR (requester = ? AND addressee = ?)').run(blockerId, blockedId, blockedId, blockerId);
    db.prepare(
      `DELETE FROM night_members WHERE principal_id = ? AND night_id IN (SELECT id FROM nights WHERE host_id = ? AND status != 'cancelled')`,
    ).run(blockedId, blockerId);
    db.prepare(
      `DELETE FROM night_members WHERE principal_id = ? AND night_id IN (SELECT id FROM nights WHERE host_id = ? AND status != 'cancelled')`,
    ).run(blockerId, blockedId);
  });
}

export function unblockPlayer(db: Db, blockerId: string, blockedId: string): boolean {
  return Number(db.prepare('DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?').run(blockerId, blockedId).changes) > 0;
}

/** Players this player has blocked (not those who blocked them). */
export function listBlocked(db: Db, blockerId: string, now: Date): Profile[] {
  const rows = db.prepare('SELECT blocked_id FROM blocks WHERE blocker_id = ? ORDER BY created_at DESC').all(blockerId) as { blocked_id: string }[];
  return rows.map((r) => ensureProfile(db, r.blocked_id, now));
}

// ---------------------------------------------------------------------------
// Reports

export const REPORT_REASONS = ['harassment', 'hate', 'sexual', 'spam', 'cheating', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/** Distinct reporters needed before a message is hidden for everyone ahead of review. */
export const AUTO_HIDE_REPORTERS = 2;

interface MessageRow {
  id: string;
  conversation_id: string;
  sender_id: string | null;
  body: string;
  created_at: string;
}

export interface ReportInput {
  playerId?: string;
  messageId?: string;
  reason: ReportReason;
  note?: string | null;
}

/**
 * Files a report about a message or a player. A reported message disappears for the
 * reporter straight away, and for everyone once enough different players report it.
 * The caller checks that the reporter can see the message.
 */
export function fileReport(db: Db, reporterId: string, input: ReportInput, now: Date): { id: string; targetId: string; hiddenForEveryone: boolean } {
  let targetId = input.playerId ?? null;
  let messageId: string | null = null;
  let snapshot: Record<string, unknown>;
  if (input.messageId) {
    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(input.messageId) as MessageRow | undefined;
    if (!message || !message.sender_id) throw new ModerationError(404, 'message_not_found', 'That message is no longer available.');
    const conversation = db.prepare('SELECT kind FROM conversations WHERE id = ?').get(message.conversation_id) as { kind: string };
    targetId = message.sender_id;
    messageId = message.id;
    snapshot = { kind: 'message', body: message.body, sentAt: message.created_at, conversation: conversation.kind, name: ensureProfile(db, targetId, now).name };
  } else {
    if (!targetId || !db.prepare('SELECT 1 FROM principals WHERE id = ?').get(targetId)) throw new ModerationError(404, 'player_not_found', 'That player no longer exists.');
    snapshot = { kind: 'player', name: ensureProfile(db, targetId, now).name };
  }
  if (targetId === reporterId) throw new ModerationError(400, 'self_report', 'You can’t report yourself.');

  const existing = messageId
    ? (db.prepare('SELECT id FROM reports WHERE reporter_id = ? AND message_id = ?').get(reporterId, messageId) as { id: string } | undefined)
    : undefined;
  const id = existing?.id ?? randomUUID();
  let hiddenForEveryone = false;
  transaction(db, () => {
    if (!existing) {
      db.prepare(
        `INSERT INTO reports (id, reporter_id, target_id, message_id, reason, note, snapshot, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, reporterId, targetId, messageId, input.reason, input.note?.trim() || null, JSON.stringify(snapshot), now.toISOString());
    }
    if (messageId) {
      const reporters = db.prepare('SELECT COUNT(DISTINCT reporter_id) AS n FROM reports WHERE message_id = ?').get(messageId) as { n: number };
      if (Number(reporters.n) >= AUTO_HIDE_REPORTERS) {
        db.prepare('UPDATE messages SET hidden_at = COALESCE(hidden_at, ?) WHERE id = ?').run(now.toISOString(), messageId);
        hiddenForEveryone = true;
      }
    }
  });
  return { id, targetId: targetId!, hiddenForEveryone };
}

// ---------------------------------------------------------------------------
// Moderator tools

export function adminTokenMatches(expected: string | null | undefined, given: string | undefined): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface ReportRow {
  id: string;
  reporter_id: string;
  target_id: string;
  message_id: string | null;
  reason: string;
  note: string | null;
  snapshot: string;
  status: string;
  action: string | null;
  created_at: string;
  resolved_at: string | null;
}

export function listReports(db: Db, status: 'open' | 'all', now: Date) {
  const rows = (
    status === 'open'
      ? db.prepare(`SELECT * FROM reports WHERE status = 'open' ORDER BY created_at LIMIT 200`).all()
      : db.prepare('SELECT * FROM reports ORDER BY created_at DESC LIMIT 200').all()
  ) as unknown as ReportRow[];
  return rows.map((r) => {
    const target = db.prepare('SELECT suspended_at FROM profiles WHERE principal_id = ?').get(r.target_id) as { suspended_at: string | null } | undefined;
    const against = db.prepare(`SELECT COUNT(*) AS n FROM reports WHERE target_id = ?`).get(r.target_id) as { n: number };
    return {
      id: r.id,
      status: r.status,
      action: r.action,
      reason: r.reason,
      note: r.note,
      createdAt: r.created_at,
      resolvedAt: r.resolved_at,
      messageId: r.message_id,
      reported: r.snapshot ? (JSON.parse(r.snapshot) as Record<string, unknown>) : null,
      reporter: ensureProfile(db, r.reporter_id, now),
      target: { ...ensureProfile(db, r.target_id, now), suspended: Boolean(target?.suspended_at), reportsAgainst: Number(against.n) },
    };
  });
}

export type ModeratorAction = 'dismiss' | 'remove-content' | 'suspend';

/**
 * Resolves a report. "remove-content" hides the message for everyone; "suspend" also stops
 * the player chatting or adding friends and hides everything they have written.
 */
export function resolveReport(db: Db, reportId: string, action: ModeratorAction, now: Date): { targetId: string } {
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId) as ReportRow | undefined;
  if (!report) throw new ModerationError(404, 'report_not_found', 'No report with that id.');
  transaction(db, () => {
    if ((action === 'remove-content' || action === 'suspend') && report.message_id) {
      db.prepare('UPDATE messages SET hidden_at = COALESCE(hidden_at, ?) WHERE id = ?').run(now.toISOString(), report.message_id);
    }
    if (action === 'suspend') {
      db.prepare('UPDATE profiles SET suspended_at = COALESCE(suspended_at, ?) WHERE principal_id = ?').run(now.toISOString(), report.target_id);
      db.prepare(`DELETE FROM friendships WHERE requester = ? AND status = 'pending'`).run(report.target_id);
    }
    // Resolving one report settles every open report about the same message.
    const status = action === 'dismiss' ? 'dismissed' : 'actioned';
    if (report.message_id) {
      db.prepare(`UPDATE reports SET status = ?, action = ?, resolved_at = ? WHERE message_id = ? AND status = 'open'`).run(status, action, now.toISOString(), report.message_id);
    }
    db.prepare('UPDATE reports SET status = ?, action = ?, resolved_at = ? WHERE id = ?').run(status, action, now.toISOString(), reportId);
  });
  return { targetId: report.target_id };
}

export function unsuspend(db: Db, principalId: string): boolean {
  return Number(db.prepare('UPDATE profiles SET suspended_at = NULL WHERE principal_id = ? AND suspended_at IS NOT NULL').run(principalId).changes) > 0;
}

/** Posts a short alert to a Slack- or Discord-style webhook so reports get seen quickly. */
export function notifyModerators(webhookUrl: string | null | undefined, text: string): void {
  if (!webhookUrl) return;
  fetch(webhookUrl, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, content: text }) }).catch((error: Error) =>
    console.log(JSON.stringify({ level: 'warn', message: 'report_webhook_failed', error: error.message })),
  );
}
