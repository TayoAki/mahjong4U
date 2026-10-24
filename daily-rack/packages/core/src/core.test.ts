import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  addDays,
  alignmentOf,
  bestStreak,
  buildClipTimeline,
  captionAt,
  computeSplit,
  contentDay,
  currentStreak,
  isPassable,
  parseFace,
  selectionErrors,
  sortBySuit,
  spokenLabel,
  toPublicPuzzle,
  validatePuzzle,
  calendarWeek,
  type PuzzleRevision,
} from './index.ts';

const contentDir = join(import.meta.dirname, '../../../content/puzzles');
const puzzles: PuzzleRevision[] = readdirSync(contentDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(contentDir, f), 'utf8')));
const demo = puzzles.find((p) => p.puzzleId === 'demo-charleston-001')!;

describe('tile faces', () => {
  it('parses every face in the set and rejects malformed codes', () => {
    expect(parseFace('DOT_2')).toEqual({ kind: 'suited', suit: 'DOT', rank: 2 });
    expect(parseFace('WIND_EAST')).toEqual({ kind: 'wind', wind: 'EAST' });
    expect(parseFace('DRAGON_WHITE')).toEqual({ kind: 'dragon', color: 'WHITE' });
    expect(parseFace('FLOWER_8')).toEqual({ kind: 'flower', variant: 8 });
    expect(parseFace('JOKER')).toEqual({ kind: 'joker' });
    for (const bad of ['DOT_0', 'DOT_10', 'DOT_02', 'BAM_2', 'WIND_UP', 'FLOWER_9', 'JOKER_1', '']) {
      expect(parseFace(bad)).toBeNull();
    }
  });

  it('labels tiles for screen readers', () => {
    expect(spokenLabel('CHARACTER_7')).toBe('Seven character');
    expect(spokenLabel('DRAGON_RED')).toBe('Red dragon');
  });

  it('never allows a joker to be passed', () => {
    expect(isPassable('JOKER')).toBe(false);
    expect(isPassable('FLOWER_1')).toBe(true);
  });

  it('sorts by suit without losing or duplicating instances', () => {
    const sorted = sortBySuit(demo.tiles);
    expect(sorted.map((t) => t.instanceId).sort()).toEqual(demo.tiles.map((t) => t.instanceId).sort());
    expect(sorted[0]?.faceCode).toBe('DOT_2');
    expect(sorted.at(-1)?.faceCode).toBe('FLOWER_1');
  });
});

describe('puzzle content', () => {
  it.each(puzzles.map((p) => [p.revisionId, p] as const))('%s is a valid 13-tile deal', (_id, puzzle) => {
    expect(validatePuzzle(puzzle)).toEqual([]);
  });

  it('flags impossible deals', () => {
    const fiveTwos = { ...demo, tiles: demo.tiles.map((t, i) => (i < 5 ? { ...t, faceCode: 'DOT_2' } : t)) };
    expect(validatePuzzle(fiveTwos)).toContain('5 copies of DOT_2, a set has 4');
    const twelve = { ...demo, tiles: demo.tiles.slice(1) };
    expect(validatePuzzle(twelve)[0]).toMatch(/12 tiles/);
  });

  it('keeps the suggestion out of the public puzzle', () => {
    const pub = toPublicPuzzle(demo);
    expect(JSON.stringify(pub)).not.toContain('One strong pass');
    expect('answer' in pub).toBe(false);
  });

  it('validates a pass: three distinct passable tiles from this deal', () => {
    expect(selectionErrors(demo, ['t09', 't10', 't11'])).toEqual([]);
    expect(selectionErrors(demo, ['t09', 't10'])).toContain('choose exactly 3 tiles');
    expect(selectionErrors(demo, ['t09', 't09', 't10'])).toContain('a tile was chosen twice');
    expect(selectionErrors(demo, ['t09', 't10', 'x99'])).toContain('tile x99 is not in this deal');
    const withJoker = puzzles.find((p) => p.tiles.some((t) => t.faceCode === 'JOKER'))!;
    const jokerId = withJoker.tiles.find((t) => t.faceCode === 'JOKER')!.instanceId;
    expect(selectionErrors(withJoker, ['t01', 't02', jokerId])).toContain('Joker cannot be passed');
  });

  it('describes alignment without calling a pass wrong', () => {
    expect(alignmentOf(demo, ['t11', 't09', 't10'])).toBe('matches');
    expect(alignmentOf(demo, ['t09', 't10', 't12'])).toBe('alternate');
    expect(alignmentOf(demo, ['t09', 't10', 't13'])).toBe('close');
    expect(alignmentOf(demo, ['t01', 't02', 't03'])).toBe('different');
  });
});

describe('split', () => {
  it('counts each tile independently so 13 rates sum to 300%', () => {
    const attempts = [
      ['t09', 't10', 't11'],
      ['t09', 't10', 't12'],
      ['t01', 't02', 't13'],
      ['t01', 't10', 't11'],
    ];
    const split = computeSplit(demo.tiles, attempts, 30);
    expect(split.eligibleAttemptCount).toBe(4);
    expect(split.minimumSampleMet).toBe(false);
    const total = split.rows.reduce((sum, r) => sum + r.rate, 0);
    expect(total).toBeCloseTo(3);
    expect(split.rows.find((r) => r.tileInstanceId === 't10')?.count).toBe(3);
  });

  it('groups identical faces by distinct attempts, not summed instances', () => {
    const split = computeSplit(demo.tiles, [['t01', 't02', 't13'], ['t01', 't09', 't10']]);
    const twoDot = split.groups.find((g) => g.faceKey === 'DOT_2')!;
    expect(twoDot.count).toBe(2);
    expect(twoDot.rate).toBe(1);
  });

  it('handles an empty split honestly', () => {
    const split = computeSplit(demo.tiles, []);
    expect(split.eligibleAttemptCount).toBe(0);
    expect(split.rows.every((r) => r.rate === 0)).toBe(true);
  });
});

describe('content calendar and streaks', () => {
  it('uses the New York day, not UTC', () => {
    expect(contentDay(new Date('2026-10-25T03:30:00Z'))).toBe('2026-10-24');
    expect(contentDay(new Date('2026-10-25T04:30:00Z'))).toBe('2026-10-25');
  });

  it('keeps a streak alive until today is missed', () => {
    const days = ['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23'];
    expect(currentStreak(days, '2026-10-23')).toBe(4);
    expect(currentStreak(days, '2026-10-24')).toBe(4);
    expect(currentStreak(days, '2026-10-25')).toBe(0);
    expect(currentStreak([...days, '2026-10-23'], '2026-10-23')).toBe(4);
  });

  it('finds the best run and crosses month ends', () => {
    expect(bestStreak(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-05'])).toBe(3);
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(calendarWeek('2026-10-24')).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(calendarWeek('2026-10-25')[0]).toBe('2026-10-19');
  });
});

describe('clip timeline', () => {
  const timeline = buildClipTimeline({
    brand: 'Daily Rack',
    question: 'What would you pass?',
    sectionLabel: '2468',
    tiles: demo.tiles,
    passIds: ['t09', 't10', 't11'],
    reasons: demo.answer.suggestion.reasons,
    split: null,
    splitAttemptCount: 3,
    endCardUrl: null,
  });

  it('follows the 32-second template with no gaps', () => {
    expect(timeline.duration).toBe(32);
    expect(timeline.width).toBe(1080);
    expect(timeline.height).toBe(1920);
    for (let i = 1; i < timeline.segments.length; i++) {
      expect(timeline.segments[i]!.start).toBe(timeline.segments[i - 1]!.end);
    }
    expect(timeline.segments.filter((s) => s.type === 'tile')).toHaveLength(3);
  });

  it('schedules caption words in order inside their segment', () => {
    const tileSegment = timeline.segments.find((s) => s.type === 'tile')!;
    const lines = timeline.captions.filter((l) => l.start >= tileSegment.start && l.end <= tileSegment.end);
    const words = lines.flatMap((l) => l.words);
    expect(words.map((w) => w.text).join(' ')).toBe('SET ASIDE AN UNPAIRED ODD TILE.');
    for (let i = 1; i < words.length; i++) expect(words[i]!.start).toBeGreaterThanOrEqual(words[i - 1]!.end - 1e-6);
    expect(words.at(-1)!.end).toBeLessThanOrEqual(tileSegment.end);
  });

  it('says honestly when the split is too small to show', () => {
    expect(timeline.segments.find((s) => s.type === 'split')?.caption).toBe('More players are weighing in');
  });

  it('highlights the current word', () => {
    const at = captionAt(timeline, 8);
    expect(at).not.toBeNull();
    expect(at!.activeIndex).toBeGreaterThanOrEqual(0);
  });
});
