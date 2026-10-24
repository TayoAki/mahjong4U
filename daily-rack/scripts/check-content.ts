// Validates every puzzle and the publication schedule before content ships.
// Usage: npm run content:check
import { join, resolve } from 'node:path';
import { loadContent } from '../apps/server/src/content.ts';

const root = resolve(import.meta.dirname, '..');
try {
  const content = loadContent(process.env.CONTENT_DIR ?? join(root, 'content'), { devRotate: false });
  const unreviewed = [...content.revisions.values()].filter((p) => !p.review.teacherReviewed);
  console.log(`${content.revisions.size} puzzles valid; ${Object.keys(content.schedule.days).length} scheduled days.`);
  if (unreviewed.length > 0) {
    console.log(`Not yet teacher-reviewed (shown with a practice notice): ${unreviewed.map((p) => p.revisionId).join(', ')}`);
  }
} catch (error) {
  console.error(`Content check failed: ${(error as Error).message}`);
  process.exit(1);
}
