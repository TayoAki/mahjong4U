import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, contentDay, daysBetween, validatePuzzle, type PuzzleRevision } from '@daily-rack/core';
import type { Db } from './db.ts';

export interface Schedule {
  timeZone: string;
  days: Record<string, string>;
}

export interface Content {
  revisions: Map<string, PuzzleRevision>;
  schedule: Schedule;
  /** Revision id per publication day, for streak credit. */
  publicationDayOf(revisionId: string): string | null;
  dailyFor(day: string): PuzzleRevision | null;
}

export function loadContent(dir: string, options: { devRotate: boolean }): Content {
  const revisions = new Map<string, PuzzleRevision>();
  const puzzleDir = join(dir, 'puzzles');
  for (const file of readdirSync(puzzleDir).filter((f) => f.endsWith('.json')).sort()) {
    const puzzle = JSON.parse(readFileSync(join(puzzleDir, file), 'utf8')) as PuzzleRevision;
    const errors = validatePuzzle(puzzle);
    if (errors.length > 0) throw new Error(`${file}: ${errors.join('; ')}`);
    if (revisions.has(puzzle.revisionId)) throw new Error(`${file}: duplicate revision ${puzzle.revisionId}`);
    revisions.set(puzzle.revisionId, puzzle);
  }
  const schedule = JSON.parse(readFileSync(join(dir, 'schedule.json'), 'utf8')) as Schedule;
  for (const [day, revisionId] of Object.entries(schedule.days)) {
    if (!revisions.has(revisionId)) throw new Error(`schedule ${day}: unknown revision ${revisionId}`);
  }

  // Development rotation cycles through every revision so any day has a rack to play.
  const rotation = [...revisions.values()].sort((a, b) => a.puzzleId.localeCompare(b.puzzleId));
  const anchor = Object.keys(schedule.days).sort()[0] ?? '2026-01-01';

  const dailyFor = (day: string): PuzzleRevision | null => {
    const scheduled = schedule.days[day];
    if (scheduled) return revisions.get(scheduled) ?? null;
    if (!options.devRotate || rotation.length === 0) return null;
    const index = ((daysBetween(anchor, day) % rotation.length) + rotation.length) % rotation.length;
    return rotation[index] ?? null;
  };

  const publicationDayOf = (revisionId: string): string | null => {
    for (const [day, id] of Object.entries(schedule.days)) if (id === revisionId) return day;
    return null;
  };

  return { revisions, schedule, dailyFor, publicationDayOf };
}

export function contentHash(puzzle: PuzzleRevision): string {
  return createHash('sha256').update(JSON.stringify(puzzle)).digest('hex');
}

/** Inserts new revisions and refuses to silently change a published one. */
export function syncRevisions(db: Db, content: Content, now: Date): void {
  const select = db.prepare('SELECT content_hash FROM puzzle_revisions WHERE revision_id = ?');
  const insert = db.prepare(
    `INSERT INTO puzzle_revisions (revision_id, puzzle_id, revision, content_hash, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const totals = db.prepare('INSERT OR IGNORE INTO split_totals (revision_id, computed_at) VALUES (?, ?)');
  for (const puzzle of content.revisions.values()) {
    const hash = contentHash(puzzle);
    const existing = select.get(puzzle.revisionId) as { content_hash: string } | undefined;
    if (existing && existing.content_hash !== hash) {
      throw new Error(
        `${puzzle.revisionId} changed after publication. Publish a new revision instead of editing this one.`,
      );
    }
    if (!existing) {
      insert.run(puzzle.revisionId, puzzle.puzzleId, puzzle.revision, hash, JSON.stringify(puzzle), now.toISOString());
    }
    totals.run(puzzle.revisionId, now.toISOString());
  }
}

/** First instant of the next content day in the schedule's time zone. */
export function nextPublicationAt(now: Date, timeZone: string): Date {
  const tomorrow = addDays(contentDay(now, timeZone), 1);
  let t = new Date(Math.floor(now.getTime() / 900_000) * 900_000);
  for (let i = 0; i < 200 && contentDay(t, timeZone) !== tomorrow; i++) t = new Date(t.getTime() + 900_000);
  return t;
}
