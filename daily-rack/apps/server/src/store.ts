import { randomUUID } from 'node:crypto';
import {
  alignmentOf,
  bestStreak,
  currentStreak,
  facesInAttempt,
  isStreakMilestone,
  splitFromCounts,
  calendarWeek,
  type PuzzleRevision,
  type Split,
} from '@daily-rack/core';
import { transaction, type Db } from './db.ts';
import type { Content } from './content.ts';

export interface Principal {
  id: string;
  kind: 'guest' | 'account' | 'test';
}

export interface AttemptRow {
  id: string;
  principal_id: string;
  puzzle_id: string;
  revision_id: string;
  section_id: string;
  tile_ids: string;
  played_day: string;
  publication_day: string | null;
  counts_for_split: number;
  synthetic: number;
  via_link_id: string | null;
  created_at: string;
}

export interface NewAttempt {
  principal: Principal;
  puzzle: PuzzleRevision;
  sectionId: string;
  tileInstanceIds: string[];
  playedDay: string;
  publicationDay: string | null;
  viaLinkId: string | null;
  now: Date;
}

/**
 * Inserts the counted first attempt and its split contribution in one step.
 * Must run inside a transaction so a failure leaves neither behind.
 */
export function insertAttempt(db: Db, attempt: NewAttempt): string {
  const id = randomUUID();
  const synthetic = attempt.principal.kind === 'test' ? 1 : 0;
  db.prepare(
    `INSERT INTO attempts (id, principal_id, puzzle_id, revision_id, section_id, tile_ids, played_day,
       publication_day, counts_for_split, synthetic, via_link_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
  ).run(
    id,
    attempt.principal.id,
    attempt.puzzle.puzzleId,
    attempt.puzzle.revisionId,
    attempt.sectionId,
    JSON.stringify(attempt.tileInstanceIds),
    attempt.playedDay,
    attempt.publicationDay,
    synthetic,
    attempt.viaLinkId,
    attempt.now.toISOString(),
  );
  applySplitDelta(db, attempt.puzzle, attempt.tileInstanceIds, +1, synthetic, attempt.now);
  return id;
}

function applySplitDelta(
  db: Db,
  puzzle: PuzzleRevision,
  tileIds: readonly string[],
  delta: 1 | -1,
  synthetic: number,
  now: Date,
): void {
  const revision = puzzle.revisionId;
  db.prepare(
    `INSERT INTO split_totals (revision_id, eligible, synthetic, version, computed_at) VALUES (?, 0, 0, 0, ?)
     ON CONFLICT (revision_id) DO NOTHING`,
  ).run(revision, now.toISOString());
  db.prepare(
    `UPDATE split_totals SET eligible = eligible + ?, synthetic = synthetic + ?, version = version + 1, computed_at = ?
     WHERE revision_id = ?`,
  ).run(delta, delta * synthetic, now.toISOString(), revision);
  const tile = db.prepare(
    `INSERT INTO split_tile_counts (revision_id, tile_id, count) VALUES (?, ?, ?)
     ON CONFLICT (revision_id, tile_id) DO UPDATE SET count = count + excluded.count`,
  );
  for (const id of tileIds) tile.run(revision, id, delta);
  const face = db.prepare(
    `INSERT INTO split_face_counts (revision_id, face_key, count) VALUES (?, ?, ?)
     ON CONFLICT (revision_id, face_key) DO UPDATE SET count = count + excluded.count`,
  );
  for (const key of facesInAttempt(puzzle.tiles, tileIds)) face.run(revision, key, delta);
}

export interface SplitSnapshot extends Split {
  syntheticAttemptCount: number;
  computedAt: string;
  version: number;
}

export function readSplit(db: Db, puzzle: PuzzleRevision, threshold: number): SplitSnapshot {
  const totals = db
    .prepare('SELECT eligible, synthetic, version, computed_at FROM split_totals WHERE revision_id = ?')
    .get(puzzle.revisionId) as { eligible: number; synthetic: number; version: number; computed_at: string } | undefined;
  const tileCounts = new Map(
    (
      db.prepare('SELECT tile_id, count FROM split_tile_counts WHERE revision_id = ?').all(puzzle.revisionId) as {
        tile_id: string;
        count: number;
      }[]
    ).map((r) => [r.tile_id, r.count]),
  );
  const faceCounts = new Map(
    (
      db.prepare('SELECT face_key, count FROM split_face_counts WHERE revision_id = ?').all(puzzle.revisionId) as {
        face_key: string;
        count: number;
      }[]
    ).map((r) => [r.face_key, r.count]),
  );
  const split = splitFromCounts(puzzle.tiles, totals?.eligible ?? 0, tileCounts, faceCounts, threshold);
  return {
    ...split,
    syntheticAttemptCount: totals?.synthetic ?? 0,
    computedAt: totals?.computed_at ?? new Date(0).toISOString(),
    version: totals?.version ?? 0,
  };
}

/** Recomputes a revision's aggregate from canonical attempts (repair path). */
export function rebuildSplit(db: Db, puzzle: PuzzleRevision, now: Date): void {
  transaction(db, () => {
    db.prepare('DELETE FROM split_tile_counts WHERE revision_id = ?').run(puzzle.revisionId);
    db.prepare('DELETE FROM split_face_counts WHERE revision_id = ?').run(puzzle.revisionId);
    db.prepare('UPDATE split_totals SET eligible = 0, synthetic = 0 WHERE revision_id = ?').run(puzzle.revisionId);
    const rows = db
      .prepare('SELECT tile_ids, synthetic FROM attempts WHERE revision_id = ? AND counts_for_split = 1')
      .all(puzzle.revisionId) as { tile_ids: string; synthetic: number }[];
    for (const row of rows) applySplitDelta(db, puzzle, JSON.parse(row.tile_ids), +1, row.synthetic, now);
  });
}

/** Deletes a principal and everything it owns, taking its answers back out of every split. */
export function deletePrincipal(db: Db, content: Content, principalId: string, now: Date): void {
  transaction(db, () => {
    const attempts = db
      .prepare('SELECT * FROM attempts WHERE principal_id = ? AND counts_for_split = 1')
      .all(principalId) as unknown as AttemptRow[];
    for (const a of attempts) {
      const puzzle = content.revisions.get(a.revision_id);
      if (puzzle) applySplitDelta(db, puzzle, JSON.parse(a.tile_ids), -1, a.synthetic, now);
    }
    db.prepare('DELETE FROM events WHERE principal_id = ?').run(principalId);
    db.prepare('DELETE FROM principals WHERE id = ?').run(principalId);
  });
}

export interface Progress {
  streak: number;
  bestStreak: number;
  racksSolved: number;
  strongPasses: number;
  milestone: boolean;
  today: string;
  playedToday: boolean;
  week: { day: string; done: boolean }[];
  sections: { label: string; count: number }[];
}

export function progressFor(db: Db, content: Content, principalId: string, today: string): Progress {
  const attempts = db
    .prepare('SELECT * FROM attempts WHERE principal_id = ? ORDER BY created_at')
    .all(principalId) as unknown as AttemptRow[];
  const dailyDays = attempts.filter((a) => a.publication_day !== null && a.publication_day === a.played_day);
  const days = dailyDays.map((a) => a.played_day);
  const streak = currentStreak(days, today);
  const sectionCounts = new Map<string, number>();
  let strongPasses = 0;
  for (const a of attempts) {
    const puzzle = content.revisions.get(a.revision_id);
    if (!puzzle) continue;
    const label = puzzle.sections.find((s) => s.id === a.section_id)?.label ?? a.section_id;
    sectionCounts.set(label, (sectionCounts.get(label) ?? 0) + 1);
    const alignment = alignmentOf(puzzle, JSON.parse(a.tile_ids));
    if (alignment === 'matches' || alignment === 'alternate') strongPasses += 1;
  }
  const doneDays = new Set(days);
  return {
    streak,
    bestStreak: bestStreak(days),
    racksSolved: attempts.length,
    strongPasses,
    milestone: doneDays.has(today) && isStreakMilestone(streak),
    today,
    playedToday: doneDays.has(today),
    week: calendarWeek(today).map((day) => ({ day, done: doneDays.has(day) })),
    sections: [...sectionCounts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
  };
}
