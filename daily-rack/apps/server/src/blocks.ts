import type { Db } from './db.ts';

// Blocking works both ways: once either player blocks the other, neither sees the other's
// messages, requests or tables.

export function isBlockedEitherWay(db: Db, a: string, b: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM blocks WHERE (blocker_id = ? AND blocked_id = ?) OR (blocker_id = ? AND blocked_id = ?)').get(a, b, b, a));
}

/** Everyone this player has blocked or been blocked by. */
export function blockedEitherWay(db: Db, principalId: string): Set<string> {
  const rows = db
    .prepare('SELECT blocked_id AS id FROM blocks WHERE blocker_id = ? UNION SELECT blocker_id AS id FROM blocks WHERE blocked_id = ?')
    .all(principalId, principalId) as { id: string }[];
  return new Set(rows.map((r) => r.id));
}
