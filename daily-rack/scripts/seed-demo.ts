// Adds labelled demo answers to a puzzle so the community split can be seen during development.
// Demo answers come from 'test' principals, are counted as synthetic, and the app says so on screen.
// Usage: DATABASE_PATH=data/daily-rack.db npm run seed:demo -- [revisionId] [count]
import { randomUUID } from 'node:crypto';
import { join, resolve } from 'node:path';
import { contentDay, isPassable } from '@daily-rack/core';
import { loadContent, syncRevisions } from '../apps/server/src/content.ts';
import { openDb, transaction } from '../apps/server/src/db.ts';
import { insertAttempt } from '../apps/server/src/store.ts';

const root = resolve(import.meta.dirname, '..');
const db = openDb(process.env.DATABASE_PATH ?? join(root, 'data/daily-rack.db'));
const content = loadContent(process.env.CONTENT_DIR ?? join(root, 'content'), { devRotate: true });
const now = new Date();
syncRevisions(db, content, now);

const today = contentDay(now, content.schedule.timeZone);
const revisionId = process.argv[2] ?? content.dailyFor(today)?.revisionId;
const count = Number(process.argv[3] ?? 40);
const puzzle = revisionId ? content.revisions.get(revisionId) : undefined;
if (!puzzle) throw new Error(`Unknown revision ${revisionId}`);

// Deterministic generator so repeated seeds give the same demo split.
let seed = 42;
const random = () => {
  seed = (seed * 1103515245 + 12345) % 2147483648;
  return seed / 2147483648;
};

const suggested = new Set(puzzle.answer.suggestion.tileInstanceIds);
const passable = puzzle.tiles.filter((t) => isPassable(t.faceCode)).map((t) => t.instanceId);

transaction(db, () => {
  for (let i = 0; i < count; i++) {
    const principalId = randomUUID();
    db.prepare('INSERT INTO principals (id, kind, token_hash, created_at) VALUES (?, ?, NULL, ?)').run(principalId, 'test', now.toISOString());
    // Weight the suggested tiles so the demo looks like a plausible split, not an observation.
    const pool = [...passable];
    const picks: string[] = [];
    while (picks.length < 3) {
      const weights = pool.map((id) => (suggested.has(id) ? 4 : 1));
      let r = random() * weights.reduce((a, b) => a + b, 0);
      const index = weights.findIndex((w) => (r -= w) < 0);
      picks.push(pool.splice(index === -1 ? 0 : index, 1)[0]!);
    }
    const sectionIndex = random() < 0.7 ? 0 : Math.floor(random() * puzzle.sections.length);
    insertAttempt(db, {
      principal: { id: principalId, kind: 'test' },
      puzzle,
      sectionId: puzzle.sections[sectionIndex]!.id,
      tileInstanceIds: picks,
      playedDay: today,
      publicationDay: today,
      viaLinkId: null,
      now,
    });
  }
});
console.log(`Added ${count} labelled demo answers to ${puzzle.revisionId}.`);
