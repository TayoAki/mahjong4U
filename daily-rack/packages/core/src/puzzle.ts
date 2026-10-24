import { isPassable, isValidFace, maxCopies, multiplicityKey, spokenLabel, type TileInstance } from './tiles.ts';

export const DEAL_SIZE = 13;
export const PASS_SIZE = 3;

export type PuzzleMode = 'charleston-pass';

export interface Section {
  id: string;
  label: string;
}

export interface Suggestion {
  label: string;
  sectionId: string;
  tileInstanceIds: string[];
  headline: string;
  explanation: string;
  reasons: Record<string, string>;
}

export interface AlternatePass {
  tileInstanceIds: string[];
  note: string;
}

export interface ReviewState {
  teacherReviewed: boolean;
  reviewer?: string;
  reviewedAt?: string;
  notes?: string;
}

/** A full puzzle revision as authored. `answer` is server-only until a player submits. */
export interface PuzzleRevision {
  puzzleId: string;
  revisionId: string;
  revision: number;
  mode: PuzzleMode;
  title: string;
  question: string;
  prompt: string;
  tiles: TileInstance[];
  sections: Section[];
  review: ReviewState;
  answer: {
    suggestion: Suggestion;
    alternates: AlternatePass[];
  };
}

/** What a player may see before submitting: no suggestion, no split. */
export type PublicPuzzle = Omit<PuzzleRevision, 'answer'>;

export function toPublicPuzzle(puzzle: PuzzleRevision): PublicPuzzle {
  const { answer: _answer, ...rest } = puzzle;
  return {
    ...rest,
    tiles: rest.tiles.map((t) => ({ ...t, spokenLabel: t.spokenLabel ?? spokenLabel(t.faceCode) })),
  };
}

export function validatePuzzle(puzzle: PuzzleRevision): string[] {
  const errors: string[] = [];
  if (puzzle.mode !== 'charleston-pass') errors.push(`unsupported mode ${puzzle.mode}`);
  if (puzzle.tiles.length !== DEAL_SIZE) errors.push(`deal has ${puzzle.tiles.length} tiles, expected ${DEAL_SIZE}`);

  const ids = new Set<string>();
  const copies = new Map<string, number>();
  for (const tile of puzzle.tiles) {
    if (ids.has(tile.instanceId)) errors.push(`duplicate instance id ${tile.instanceId}`);
    ids.add(tile.instanceId);
    if (!isValidFace(tile.faceCode)) {
      errors.push(`unknown face ${tile.faceCode} on ${tile.instanceId}`);
      continue;
    }
    const key = multiplicityKey(tile.faceCode);
    copies.set(key, (copies.get(key) ?? 0) + 1);
  }
  for (const [key, count] of copies) {
    const limit = key === 'FLOWER' ? 8 : maxCopies(key);
    if (count > limit) errors.push(`${count} copies of ${key}, a set has ${limit}`);
  }

  const sectionIds = new Set(puzzle.sections.map((s) => s.id));
  if (puzzle.sections.length < 2) errors.push('a puzzle needs at least two section choices');
  if (sectionIds.size !== puzzle.sections.length) errors.push('duplicate section ids');

  const { suggestion, alternates } = puzzle.answer;
  if (!sectionIds.has(suggestion.sectionId)) errors.push(`suggestion section ${suggestion.sectionId} is not offered`);
  errors.push(...selectionErrors(puzzle, suggestion.tileInstanceIds).map((e) => `suggestion: ${e}`));
  for (const id of suggestion.tileInstanceIds) {
    if (!suggestion.reasons[id]?.trim()) errors.push(`suggestion has no reason for ${id}`);
  }
  alternates.forEach((alt, i) => {
    errors.push(...selectionErrors(puzzle, alt.tileInstanceIds).map((e) => `alternate ${i + 1}: ${e}`));
  });
  return errors;
}

/** Rules every submitted pass must satisfy: exactly three distinct, passable tiles from this deal. */
export function selectionErrors(puzzle: Pick<PuzzleRevision, 'tiles'>, tileInstanceIds: readonly string[]): string[] {
  const errors: string[] = [];
  if (tileInstanceIds.length !== PASS_SIZE) errors.push(`choose exactly ${PASS_SIZE} tiles`);
  if (new Set(tileInstanceIds).size !== tileInstanceIds.length) errors.push('a tile was chosen twice');
  const byId = new Map(puzzle.tiles.map((t) => [t.instanceId, t]));
  for (const id of tileInstanceIds) {
    const tile = byId.get(id);
    if (!tile) errors.push(`tile ${id} is not in this deal`);
    else if (!isPassable(tile.faceCode)) errors.push(`${spokenLabel(tile.faceCode)} cannot be passed`);
  }
  return errors;
}

export type Alignment = 'matches' | 'alternate' | 'close' | 'different';

/** How a pass relates to the reviewed suggestion. Never a verdict of right or wrong. */
export function alignmentOf(puzzle: PuzzleRevision, tileInstanceIds: readonly string[]): Alignment {
  const chosen = new Set(tileInstanceIds);
  const overlap = (ids: readonly string[]) => ids.filter((id) => chosen.has(id)).length;
  if (overlap(puzzle.answer.suggestion.tileInstanceIds) === PASS_SIZE) return 'matches';
  if (puzzle.answer.alternates.some((alt) => overlap(alt.tileInstanceIds) === PASS_SIZE)) return 'alternate';
  if (overlap(puzzle.answer.suggestion.tileInstanceIds) === PASS_SIZE - 1) return 'close';
  return 'different';
}

export const ALIGNMENT_COPY: Record<Alignment, string> = {
  matches: 'You found one strong pass.',
  alternate: 'Another strong pass.',
  close: 'Two of your three line up.',
  different: 'A different take.',
};
