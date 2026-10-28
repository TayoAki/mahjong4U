import { describe, expect, it } from 'vitest';
import { HOUSE_CARD, TILE_FACES, adviseClaim, bestDistance, cardById, concreteHands, isJoker, keyOf, rankDiscards, rankPassTiles, suggestPass, type ConcreteGroup } from './index.ts';

const card = HOUSE_CARD;

/** Hands out distinct tile ids by face, like taking them from a fresh set. */
function tileTaker() {
  const used = new Set<number>();
  return (face: string, n = 1): number[] => {
    const out: number[] = [];
    for (let t = 0; t < TILE_FACES.length && out.length < n; t++) {
      const f = TILE_FACES[t]!;
      if (!used.has(t) && (face === 'FLOWER' ? f.startsWith('FLOWER_') : f === face)) {
        used.add(t);
        out.push(t);
      }
    }
    if (out.length < n) throw new Error(`not enough ${face}`);
    return out;
  };
}

// An open hand with a pung of a suited tile: F is that tile, G a tile from another group,
// and S a stray tile the hand doesn't use at all.
const target = concreteHands(card).find(
  (c) => !c.hand.concealed && c.groups.some((g) => g.n === 3 && g.jokerable && /^(DOT|BAMBOO|CHARACTER)_/.test(g.face)) && !c.groups.some((g) => g.face === 'FLOWER'),
)!;
const F = target.groups.find((g) => g.n === 3 && g.jokerable && /^(DOT|BAMBOO|CHARACTER)_/.test(g.face))!.face;
const G = target.groups.find((g) => g.face !== F)!.face;
const faces = new Set(target.groups.map((g: ConcreteGroup) => g.face));
const S = [...new Set(TILE_FACES)].find((f) => f !== 'JOKER' && !f.startsWith('FLOWER_') && !faces.has(f))!;

/** The target hand's tiles, without `missing` (one tile each), plus `extra` faces. */
function handOf(missing: string[], extra: string[], take = tileTaker()): number[] {
  const tiles = target.groups.flatMap((g) => take(g.face, g.n));
  for (const face of missing) tiles.splice(tiles.findIndex((t) => keyOf(t) === face), 1);
  return [...tiles, ...extra.flatMap((face) => take(face))];
}

describe('coach', () => {
  it('ranks every discard, and throwing the stray keeps you one tile away', () => {
    const hand = handOf([F], [S]);
    const choices = rankDiscards(card, hand, []);
    expect(new Set(choices.map((c) => c.key)).size).toBe(new Set(hand.map(keyOf)).size);
    expect(choices.map((c) => c.rank)).toEqual([...choices.map((c) => c.rank)].sort((a, b) => a - b));
    const best = choices.filter((c) => c.best);
    expect(best.map((c) => c.key)).toContain(S);
    expect(best[0]!.distance).toBe(1);
    expect(choices.every((c) => c.best === (c.rank === 1))).toBe(true);
    // Throwing a tile the hand needs leaves you further away.
    expect(choices.find((c) => c.key === G)!.distance).toBeGreaterThan(1);
  });

  it('counts the unseen tiles that would help, and fewer once some are out', () => {
    const hand = handOf([F], [S]);
    const stray = rankDiscards(card, hand, []).find((c) => c.key === S)!;
    const heldF = hand.filter((t) => keyOf(t) === F).length;
    // The missing F (four copies, minus those held) and any of the eight jokers fill the pung.
    expect(stray.helpers).toBeGreaterThanOrEqual(4 - heldF + 8);
    const later = rankDiscards(card, hand, [], new Map([[F, 1]])).find((c) => c.key === S)!;
    expect(later.helpers).toBe(stray.helpers - 1);
  });

  it('suggests a Charleston pass without jokers that does no worse than passing needed tiles', () => {
    const take = tileTaker();
    const hand = [...handOf([F, G], [S], take), ...take('JOKER')].slice(0, 13);
    expect(hand).toHaveLength(13);
    expect(rankPassTiles(card, hand).some((c) => c.key === 'JOKER')).toBe(false);
    const pass = suggestPass(card, hand);
    expect(pass).toHaveLength(3);
    expect(pass.some(isJoker)).toBe(false);
    expect(new Set(pass).size).toBe(3);
    const after = (out: number[]) => bestDistance(card, hand.filter((t) => !out.includes(t)), []);
    const needed = hand.filter((t) => !isJoker(t) && keyOf(t) !== S).slice(0, 3);
    expect(after(pass)).toBeLessThanOrEqual(after(needed));
  });

  it('says call it for Mahjong, call it to expose, or let it go', () => {
    const take = tileTaker();
    const waiting = handOf([F], [], take);
    expect(adviseClaim(card, waiting, [], take(F)[0]!).call).toBe('mahjong');

    const take2 = tileTaker();
    const twoAway = handOf([F, G], [S], take2);
    const pung = adviseClaim(card, twoAway, [], take2(F)[0]!);
    expect(pung.call).toBe('expose');
    expect(pung.size).toBe(3);
    expect(pung.after).toBeLessThan(pung.before);

    const take3 = tileTaker();
    const other = handOf([F, G], [S], take3);
    const useless = TILE_FACES.find((f) => f !== 'JOKER' && !f.startsWith('FLOWER_') && !faces.has(f) && f !== S)!;
    expect(adviseClaim(card, other, [], take3(useless)[0]!).call).toBe('pass');
  });

  it('works on the 2026 card too', () => {
    const card2026 = cardById('card-2026');
    const take = tileTaker();
    const hand = ['DOT_2', 'DOT_2', 'DRAGON_WHITE', 'BAMBOO_2', 'BAMBOO_2', 'BAMBOO_2', 'BAMBOO_6', 'CHARACTER_6', 'CHARACTER_6', 'WIND_NORTH', 'WIND_EAST', 'FLOWER', 'FLOWER', 'JOKER'].flatMap((f) => take(f));
    const choices = rankDiscards(card2026, hand, []);
    expect(choices.length).toBeGreaterThan(0);
    expect(choices[0]!.best).toBe(true);
  });
});
