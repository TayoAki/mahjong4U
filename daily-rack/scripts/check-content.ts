// Validates every puzzle and the publication schedule before content ships.
// Usage: npm run content:check
import { join, resolve } from 'node:path';
import { loadContent } from '../apps/server/src/content.ts';
import { loadCards } from '../apps/server/src/cards.ts';

const root = resolve(import.meta.dirname, '..');
try {
  const content = loadContent(process.env.CONTENT_DIR ?? join(root, 'content'), { devRotate: false });
  const unreviewed = [...content.revisions.values()].filter((p) => !p.review.teacherReviewed);
  console.log(`${content.revisions.size} puzzles valid; ${Object.keys(content.schedule.days).length} scheduled days.`);
  if (unreviewed.length > 0) {
    console.log(`Not yet teacher-reviewed (shown with a practice notice): ${unreviewed.map((p) => p.revisionId).join(', ')}`);
  }
  // Extra cards in content/cards must pass the same checks as the house card.
  const cards = loadCards(join(process.env.CONTENT_DIR ?? join(root, 'content'), 'cards'));
  console.log(`Extra cards: ${cards.loaded.length ? cards.loaded.join(', ') : 'none'}.`);
  if (cards.errors.length > 0) throw new Error(`card problems:\n  ${cards.errors.join('\n  ')}`);
} catch (error) {
  console.error(`Content check failed: ${(error as Error).message}`);
  process.exit(1);
}
