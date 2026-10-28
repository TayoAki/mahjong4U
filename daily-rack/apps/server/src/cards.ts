import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { cardFromSpec, registerCard, validateCard, type CardSpec } from '@daily-rack/core/mahjong';

// Extra cards live as JSON files in content/cards (see the README there). Each is checked
// with the same rules as the house card; a card with any problem is left out, and the
// problems are reported so they can be fixed.

export function loadCards(dir: string): { loaded: string[]; errors: string[] } {
  const loaded: string[] = [];
  const errors: string[] = [];
  if (!existsSync(dir)) return { loaded, errors };
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.json') && !f.startsWith('_'))) {
    try {
      const card = cardFromSpec(JSON.parse(readFileSync(join(dir, file), 'utf8')) as CardSpec);
      const problems = validateCard(card);
      if (problems.length > 0) errors.push(`${file}: ${problems.slice(0, 5).join('; ')}${problems.length > 5 ? ` (and ${problems.length - 5} more)` : ''}`);
      else {
        registerCard(card);
        loaded.push(card.id);
      }
    } catch (error) {
      errors.push(`${file}: ${(error as Error).message}`);
    }
  }
  return { loaded, errors };
}
