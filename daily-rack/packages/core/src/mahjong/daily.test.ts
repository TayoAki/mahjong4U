import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { PuzzleRevision } from '../puzzle.ts';
import { DAILY_SEAT, DAILY_TURNS, DEALT_WALL, HOUSE_CARD, dailyDiscards, dailyShareText, dealTiles, faceOf, isJoker, keyOf, playDiscards, rankPass, rankPassTiles, seedOf, shortDay } from './index.ts';

const contentDir = join(import.meta.dirname, '../../../../content/puzzles');
const puzzles: PuzzleRevision[] = readdirSync(contentDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(contentDir, f), 'utf8')) as PuzzleRevision);
const puzzle = puzzles.find((p) => p.puzzleId === 'demo-charleston-001')!;
const strong = puzzle.answer.suggestion.tileInstanceIds;
const drillOf = (p: PuzzleRevision) => dailyDiscards(p.tiles, p.answer.suggestion.tileInstanceIds, p.revisionId);

describe('daily rack tiles', () => {
  it.each(puzzles.map((p) => [p.revisionId, p] as const))('%s maps to distinct engine tiles with the same faces', (_id, p) => {
    const ids = dealTiles(p.tiles);
    expect(new Set(ids.values()).size).toBe(p.tiles.length);
    for (const t of p.tiles) expect(faceOf(ids.get(t.instanceId)!)).toBe(t.faceCode);
    // Deterministic: the same deal maps the same way every time.
    expect([...dealTiles(p.tiles)]).toEqual([...ids]);
  });

  it('gives a second copy of a flower another flower', () => {
    const ids = dealTiles([
      { instanceId: 'a', faceCode: 'FLOWER_1' },
      { instanceId: 'b', faceCode: 'FLOWER_1' },
      { instanceId: 'c', faceCode: 'DOT_5' },
      { instanceId: 'd', faceCode: 'DOT_5' },
    ]);
    expect(faceOf(ids.get('a')!)).toBe('FLOWER_1');
    expect(faceOf(ids.get('b')!)).toMatch(/^FLOWER_/);
    expect(ids.get('a')).not.toBe(ids.get('b'));
    expect(ids.get('c')).not.toBe(ids.get('d'));
  });

  it('ranks every face of the deal for the pass, with jokers last and never best', () => {
    const withJoker = puzzles.find((p) => p.tiles.some((t) => t.faceCode === 'JOKER'))!;
    const { now, rows } = rankPass(HOUSE_CARD, withJoker.tiles);
    expect(rows.flatMap((r) => r.instanceIds).sort()).toEqual(withJoker.tiles.map((t) => t.instanceId).sort());
    expect(rows.at(-1)!.key).toBe('JOKER');
    expect(rows.at(-1)!.choice).toBeNull();
    const ranked = rows.filter((r) => r.choice);
    expect(ranked.map((r) => r.key)).toEqual(rankPassTiles(HOUSE_CARD, [...dealTiles(withJoker.tiles).values()]).map((c) => c.key));
    expect(ranked[0]!.choice!.best).toBe(true);
    // Passing a tile never brings you closer than you are now.
    expect(ranked.every((r) => r.choice!.distance >= now)).toBe(true);
  });
});

describe('daily discards', () => {
  it('deals the same incoming tiles and draws to everyone, seeded from the revision', () => {
    const a = drillOf(puzzle);
    const b = dailyDiscards(structuredClone(puzzle.tiles), [...strong], puzzle.revisionId);
    expect(b).toEqual(a);
    // Another revision of the same deal plays out differently.
    expect(dailyDiscards(puzzle.tiles, strong, `${puzzle.puzzleId}-r2`)).not.toEqual(a);
    expect(seedOf(puzzle.revisionId)).toBe(seedOf(puzzle.revisionId));
    expect(seedOf('a')).not.toBe(seedOf('b'));
  });

  it.each(puzzles.map((p) => [p.revisionId, p] as const))('%s starts from the deal less the strong pass', (_id, p) => {
    const drill = drillOf(p);
    const ids = dealTiles(p.tiles);
    const passed = p.answer.suggestion.tileInstanceIds.map((id) => ids.get(id)!);
    expect(drill.start).toHaveLength(13);
    expect(drill.start.some((t) => passed.includes(t))).toBe(false);
    expect(drill.received).toHaveLength(3);
    expect(drill.received.some(isJoker)).toBe(false);
    expect(drill.start.slice(-3)).toEqual(drill.received);
    expect(drill.draws).toHaveLength(DAILY_TURNS);
    // Every tile is a real, different tile: nothing dealt twice.
    const all = [...ids.values(), ...drill.received, ...drill.draws, ...drill.before.flat().map((d) => d.tile)];
    expect(new Set(all).size).toBe(all.length);
    // East opens, then the three players after you throw before each of your turns.
    expect(drill.before.map((b) => b.map((d) => d.seat))).toEqual([[0], [2, 3, 0], [2, 3, 0]]);
    expect(drill.before.flat().some((d) => isJoker(d.tile))).toBe(false);
  });

  it('ranks each turn, marks the throw and plays on from it', () => {
    const drill = drillOf(puzzle);
    const first = playDiscards(HOUSE_CARD, drill, []);
    expect(first).toHaveLength(1);
    expect(first[0]!.hand).toEqual([...drill.start, drill.draws[0]]);
    expect(first[0]!.pick).toBeNull();
    expect(first[0]!.wallCount).toBe(DEALT_WALL - 1);
    expect(new Set(first[0]!.ranking.map((c) => c.key)).size).toBe(new Set(first[0]!.hand.map((t) => (isJoker(t) ? 'JOKER' : keyOf(t)))).size);

    // Throw the best tile, then the worst, then the best again.
    const best = (i: number, picks: number[]) => playDiscards(HOUSE_CARD, drill, picks)[i]!.ranking[0]!.tile;
    const worst = (i: number, picks: number[]) => playDiscards(HOUSE_CARD, drill, picks)[i]!.ranking.at(-1)!;
    const picks = [best(0, [])];
    const last = worst(1, picks);
    expect(last.best).toBe(false);
    picks.push(last.tile);
    picks.push(best(2, picks));
    const turns = playDiscards(HOUSE_CARD, drill, picks);
    expect(turns).toHaveLength(DAILY_TURNS);
    expect(turns.map((t) => t.best)).toEqual([true, false, true]);
    expect(turns.map((t) => t.wallCount)).toEqual([DEALT_WALL - 1, DEALT_WALL - 5, DEALT_WALL - 9]);
    // Your throws land on the table, and the next hand no longer has them.
    expect(turns[1]!.table).toContainEqual({ seat: DAILY_SEAT, tile: picks[0] });
    expect(turns[1]!.hand).not.toContain(picks[0]);
    expect(turns[2]!.hand).toHaveLength(14);
    expect(turns[2]!.table).toHaveLength(1 + 1 + 3 + 1 + 3);
    // The same throws always score the same.
    expect(playDiscards(HOUSE_CARD, drill, picks)).toEqual(turns);
  });

  it('ignores a throw of a tile you are not holding', () => {
    const drill = drillOf(puzzle);
    const stranger = drill.draws[1]!;
    const turns = playDiscards(HOUSE_CARD, drill, [stranger]);
    expect(turns).toHaveLength(1);
    expect(turns[0]!.pick).toBeNull();
  });
});

describe('sharing the day', () => {
  it('says how it went without giving the rack away', () => {
    expect(shortDay('2026-10-28')).toBe('Oct 28');
    expect(shortDay('2027-01-05')).toBe('Jan 5');
    expect(dailyShareText({ day: '2026-10-28', alignment: 'matches', discards: [true, true, false] })).toBe('Daily Rack · Oct 28 · Pass: strong ✓ · Discards 🟩🟩⬜');
    expect(dailyShareText({ day: '2026-10-28', alignment: 'close', discards: null })).toBe('Daily Rack · Oct 28 · Pass: 2 of 3 strong');
    // Discards show only once all three are played.
    expect(dailyShareText({ brand: 'Rack', day: '2026-10-28', alignment: 'different', discards: [true] })).toBe('Rack · Oct 28 · Pass: my own take');
  });
});
