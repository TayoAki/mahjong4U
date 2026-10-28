import type { BotLevel } from './bots.ts';
import type { Card, ConcreteHand } from './card.ts';
import { deadReasonFrom } from './dead.ts';
import { eachHandFittingExposures, type Exposure } from './match.ts';
import { isJoker, keyOf } from './set.ts';
import {
  HAND_SLOTS,
  bestWinFrom,
  isLiveHand,
  twoPlayerVisibleCounts,
  type HandSlot,
  type PoolWin,
  type TwoPlayerAction,
  type TwoPlayerView,
} from './twoPlayer.ts';

// Computer players for two-player games. Each move a bot plans two target hands at once:
// it takes its few best hands for one of its two hands, finds the best second hand for the
// tiles left over (and the same the other way round), and keeps the pair that needs the
// fewest tiles between them. Plans are made from scratch every move, so a bot changes
// course as its tiles change. Bots only use what their own view shows.
//
// The 2026 card has about 1,100 concrete hands, so the counting below works on small
// arrays of tile counts rather than maps, and skips any hand that can't beat the best
// found so far.

const KEYS: readonly string[] = [
  ...['DOT', 'BAMBOO', 'CHARACTER'].flatMap((s) => [1, 2, 3, 4, 5, 6, 7, 8, 9].map((r) => `${s}_${r}`)),
  ...['EAST', 'SOUTH', 'WEST', 'NORTH'].map((w) => `WIND_${w}`),
  ...['RED', 'GREEN', 'WHITE'].map((d) => `DRAGON_${d}`),
  'FLOWER',
];
const K = KEYS.length;
const INDEX = new Map(KEYS.map((k, i) => [k, i]));
const COPIES = KEYS.map((k) => (k === 'FLOWER' ? 8 : 4));
/** Added to a plan's distance when the tiles it needs can't all exist any more. */
const IMPOSSIBLE = 40;

/** How many first choices a bot tries when pairing up its two hands, and how often it slips. */
const WIDTH: Record<BotLevel, number> = { easy: 3, normal: 6, hard: 10 };
const SLOPPINESS: Record<BotLevel, number> = { easy: 0.2, normal: 0.08, hard: 0 };

/** One concrete hand as a target: what it still needs, by key index, as [key, count, key, count...]. */
interface Target {
  concrete: ConcreteHand;
  /** Pairs and singles: naturals only. */
  nat: number[];
  /** Groups of three or more: naturals or jokers. */
  jok: number[];
  value: number;
}

interface Tiles {
  counts: Int16Array;
  jokers: number;
}

interface Context {
  card: Card;
  pool: Tiles;
  /** Tiles this player hasn't seen: in the wall or the other player's hand. */
  unseen: Tiles;
  hands: { exposures: Exposure[]; live: boolean }[];
}

interface PlanEntry {
  /** Target per hand; null for a hand that's declared or dead. */
  targets: (Target | null)[];
  distance: number;
  value: number;
}

interface Plan {
  best: PlanEntry | null;
  others: PlanEntry[];
}

const targetCache = new WeakMap<Card, Map<string, Target[]>>();

/** Every concrete hand still open to a hand with these exposures, as targets. */
function targetsFor(card: Card, exposures: readonly Exposure[]): Target[] {
  let byCard = targetCache.get(card);
  if (!byCard) targetCache.set(card, (byCard = new Map()));
  const key = exposures
    .map((e) => `${e.key}x${e.tiles.length}`)
    .sort()
    .join(',');
  let targets = byCard.get(key);
  if (!targets) {
    targets = [];
    for (const { concrete, remaining } of eachHandFittingExposures(card, exposures)) {
      const nat = new Map<number, number>();
      const jok = new Map<number, number>();
      for (const g of remaining) {
        const into = g.jokerable ? jok : nat;
        const i = INDEX.get(g.face)!;
        into.set(i, (into.get(i) ?? 0) + g.n);
      }
      targets.push({ concrete, nat: [...nat].flat(), jok: [...jok].flat(), value: concrete.hand.value });
    }
    if (byCard.size > 400) byCard.clear();
    byCard.set(key, targets);
  }
  return targets;
}

const NEED_NAT = new Int16Array(K);
const NEED_JOK = new Int16Array(K);

/** Adds n to one count. */
function bump(counts: Int16Array, f: number, n: number) {
  counts[f] = counts[f]! + n;
}

function addNeeds(t: Target) {
  for (let i = 0; i < t.nat.length; i += 2) bump(NEED_NAT, t.nat[i]!, t.nat[i + 1]!);
  for (let i = 0; i < t.jok.length; i += 2) bump(NEED_JOK, t.jok[i]!, t.jok[i + 1]!);
}

/**
 * Tiles still missing to make `a` and `b` together from `pool` (either may be null), the
 * same count as match.ts uses for one hand. Plans needing more of a tile than can still
 * turn up (the pool plus unseen tiles, with jokers) get a large penalty.
 */
function shortfall(a: Target | null, b: Target | null, pool: Tiles, unseen: Tiles): number {
  if (a) addNeeds(a);
  if (b) addNeeds(b);
  let missNat = 0;
  let missJok = 0;
  let jokersNeeded = 0;
  let impossible = false;
  for (let f = 0; f < K; f++) {
    const nat = NEED_NAT[f]!;
    const jok = NEED_JOK[f]!;
    if (nat === 0 && jok === 0) continue;
    NEED_NAT[f] = 0;
    NEED_JOK[f] = 0;
    const have = pool.counts[f]!;
    missNat += Math.max(0, nat - have);
    missJok += Math.max(0, jok - Math.max(0, have - nat));
    const supply = have + unseen.counts[f]!;
    if (nat > supply) impossible = true;
    jokersNeeded += Math.max(0, jok - Math.max(0, supply - nat));
  }
  if (jokersNeeded > pool.jokers + unseen.jokers) impossible = true;
  return missNat + Math.max(0, missJok - pool.jokers) + (impossible ? IMPOSSIBLE : 0);
}

/** The pool once `t` has taken what it would use: naturals first, then jokers for big groups. */
function leftover(pool: Tiles, t: Target): Tiles {
  const counts = pool.counts.slice();
  let jokers = pool.jokers;
  for (let i = 0; i < t.nat.length; i += 2) bump(counts, t.nat[i]!, -Math.min(t.nat[i + 1]!, counts[t.nat[i]!]!));
  for (let i = 0; i < t.jok.length; i += 2) {
    const f = t.jok[i]!;
    const take = Math.min(t.jok[i + 1]!, counts[f]!);
    bump(counts, f, -take);
    jokers -= Math.min(jokers, t.jok[i + 1]! - take);
  }
  return { counts, jokers };
}

function tilesOf(list: readonly number[]): Tiles {
  const counts = new Int16Array(K);
  let jokers = 0;
  for (const t of list) {
    if (isJoker(t)) jokers += 1;
    else bump(counts, INDEX.get(keyOf(t))!, 1);
  }
  return { counts, jokers };
}

function contextOf(card: Card, view: TwoPlayerView): Context {
  const me = view.players[view.seat]!;
  const seen = [...view.concealed, ...view.discards.map((d) => d.tile), ...view.players.flatMap((p) => p.hands.flatMap((h) => [...h.exposures.flatMap((e) => e.tiles), ...(h.shown ?? [])]))];
  const gone = tilesOf(seen);
  const unseen: Tiles = { counts: new Int16Array(K), jokers: Math.max(0, 8 - gone.jokers) };
  for (let f = 0; f < K; f++) unseen.counts[f] = Math.max(0, COPIES[f]! - gone.counts[f]!);
  return { card, pool: tilesOf(view.concealed), unseen, hands: me.hands.map((h) => ({ exposures: h.exposures, live: isLiveHand(h) })) };
}

type Scored = { t: Target; d: number };

function ranked(ctx: Context, exposures: readonly Exposure[], pool: Tiles = ctx.pool): Scored[] {
  return targetsFor(ctx.card, exposures)
    .map((t) => ({ t, d: shortfall(t, null, pool, ctx.unseen) }))
    .sort((x, y) => x.d - y.d || y.t.value - x.t.value);
}

/**
 * The best pair of target hands for the live hands, and a few runners-up. With two live
 * hands, each of the `width` best first choices for one hand is paired with the best hand
 * for the tiles it leaves, both ways round; the pair needing the fewest tiles in all wins.
 */
function plan(ctx: Context, width: number, pool: Tiles = ctx.pool, hands = ctx.hands): Plan {
  const live = HAND_SLOTS.filter((s) => hands[s]!.live);
  if (live.length === 0) return { best: null, others: [] };
  const lists = live.map((s) => ranked(ctx, hands[s]!.exposures, pool));
  if (live.length === 1) {
    const entries = lists[0]!.slice(0, 6).map(({ t, d }): PlanEntry => ({ targets: live[0] === 0 ? [t, null] : [null, t], distance: d, value: t.value }));
    return { best: entries[0] ?? null, others: entries.slice(1) };
  }
  const pairs = new Map<string, PlanEntry>();
  for (const [first, second] of [
    [0, 1],
    [1, 0],
  ] as const) {
    for (const x of lists[first]!.slice(0, width)) {
      const left = leftover(pool, x.t);
      let partner: Scored | null = null;
      // A hand's shortfall against the full pool is a lower bound for any smaller pool.
      for (const y of lists[second]!) {
        if (partner && y.d > partner.d) break;
        const d = shortfall(y.t, null, left, ctx.unseen);
        if (!partner || d < partner.d || (d === partner.d && y.t.value > partner.t.value)) partner = { t: y.t, d };
      }
      if (!partner) continue;
      const targets = first === 0 ? [x.t, partner.t] : [partner.t, x.t];
      const id = `${targets[0]!.concrete.label}|${targets[0]!.concrete.hand.id}/${targets[1]!.concrete.label}|${targets[1]!.concrete.hand.id}`;
      if (!pairs.has(id)) pairs.set(id, { targets, distance: shortfall(targets[0]!, targets[1]!, pool, ctx.unseen), value: x.t.value + partner.t.value });
    }
  }
  const sorted = [...pairs.values()].sort((p, q) => p.distance - q.distance || q.value - p.value);
  return { best: sorted[0] ?? null, others: sorted.slice(1, 6) };
}

const distanceOf = (p: Plan) => p.best?.distance ?? Infinity;

function without(pool: Tiles, f: number, n = 1): Tiles {
  const counts = pool.counts.slice();
  bump(counts, f, -n);
  return { counts, jokers: pool.jokers };
}

/** Picks the discard that keeps the plan closest, then the one fewest runner-up plans want. */
function chooseDiscard(ctx: Context, view: TwoPlayerView, level: BotLevel, random: () => number): number {
  const naturals = view.concealed.filter((t) => !isJoker(t));
  if (naturals.length === 0) return view.concealed[0]!;
  // One candidate per face; the tile just drawn stands for its face when it can.
  const byKey = new Map<string, number>();
  for (const t of naturals) if (!byKey.has(keyOf(t)) || t === view.drawn) byKey.set(keyOf(t), t);
  const candidates = [...byKey.values()];
  const current = plan(ctx, WIDTH[level]);
  const best = current.best;
  if (!best) {
    // Nothing left to win: throw what's safest, a face already out on the table.
    const seen = twoPlayerVisibleCounts(view);
    return candidates.sort((a, b) => (seen.get(keyOf(b)) ?? 0) - (seen.get(keyOf(a)) ?? 0))[0]!;
  }
  const scored = candidates
    .map((t) => {
      const f = INDEX.get(keyOf(t))!;
      const pool = without(ctx.pool, f);
      const d = shortfall(best.targets[0] ?? null, best.targets[1] ?? null, pool, ctx.unseen);
      let wanted = 0;
      for (const alt of current.others) {
        if (shortfall(alt.targets[0] ?? null, alt.targets[1] ?? null, pool, ctx.unseen) > alt.distance) wanted += Math.exp(best.distance - alt.distance);
      }
      return { t, f, d, wanted, jitter: random() };
    })
    .sort((a, b) => a.d - b.d || a.wanted - b.wanted || a.jitter - b.jitter);
  if (random() < SLOPPINESS[level]) return scored[Math.min(scored.length - 1, Math.floor(random() * 3))]!.t;
  if (level !== 'hard') return scored[0]!.t;
  // Sharp bots look one step further: plan again without each of the closest few.
  return scored
    .slice(0, 3)
    .map((s, i) => ({ ...s, i, after: distanceOf(plan(ctx, WIDTH.hard, without(ctx.pool, s.f))) }))
    .sort((a, b) => a.after - b.after || a.i - b.i)[0]!.t;
}

/** The pool and hands after calling `tile` onto `slot` for a group of `size`, as resolveClaim does it. */
function afterCall(ctx: Context, view: TwoPlayerView, tile: number, slot: HandSlot, size: number) {
  const key = keyOf(tile);
  const naturals = view.concealed.filter((t) => !isJoker(t) && keyOf(t) === key);
  const used = [...naturals, ...view.concealed.filter(isJoker)].slice(0, size - 1);
  const rest = [...view.concealed];
  for (const t of used) rest.splice(rest.indexOf(t), 1);
  const exposures = [...ctx.hands[slot]!.exposures, { key, tiles: [tile, ...used] }];
  const hands = ctx.hands.map((h, s) => (s === slot ? { exposures, live: true } : h));
  // The tile and the naturals laid down with it are face up now.
  const seen = twoPlayerVisibleCounts(view);
  for (const t of used) if (!isJoker(t)) seen.set(keyOf(t), (seen.get(keyOf(t)) ?? 0) + 1);
  return { pool: tilesOf(rest), hands, dead: deadReasonFrom(ctx.card, exposures, seen) !== null };
}

/** Which hand to declare, and with which tiles, leaving the other hand best placed. */
function chooseMahjong(ctx: Context, view: TwoPlayerView, slots: HandSlot[]): { hand: HandSlot; tiles: number[] } {
  const final = view.mahjongs.some((m) => m.seat === view.seat);
  let choice: { hand: HandSlot; win: PoolWin; score: number } | null = null;
  for (const hand of slots) {
    for (const jokersFirst of [false, true]) {
      const win = bestWinFrom(ctx.card, view.concealed, ctx.hands[hand]!.exposures, { jokersFirst });
      if (!win) continue;
      let score = win.points;
      const other = ctx.hands[hand === 0 ? 1 : 0]!;
      if (!final && other.live) {
        const rest = [...view.concealed];
        for (const t of win.tiles) rest.splice(rest.indexOf(t), 1);
        const hands = ctx.hands.map((h, s) => (s === hand ? { ...h, live: false } : h));
        score -= 8 * Math.min(IMPOSSIBLE, distanceOf(plan(ctx, 1, tilesOf(rest), hands)));
      }
      if (!choice || score > choice.score) choice = { hand, win, score };
    }
  }
  return { hand: choice!.hand, tiles: choice!.win.tiles };
}

/** The computer's move for a player, worked out from that player's view alone. */
export function twoPlayerBotAction(card: Card, view: TwoPlayerView, level: BotLevel, random: () => number): TwoPlayerAction {
  const prompt = view.prompt;
  if (!prompt) throw new Error(`seat ${view.seat} has nothing to do`);
  const ctx = contextOf(card, view);
  if (prompt.type === 'turn') {
    if (prompt.mahjong.length > 0) return { type: 'declare-mahjong', ...chooseMahjong(ctx, view, prompt.mahjong) };
    // A joker is usually worth more than the natural it replaces; take it unless the plan suffers.
    if (prompt.exchanges.length > 0 && !(level === 'easy' && random() < 0.5)) {
      const before = distanceOf(plan(ctx, WIDTH[level]));
      for (const x of prompt.exchanges) {
        const pool = without(ctx.pool, INDEX.get(keyOf(x.tile))!);
        pool.jokers += 1;
        if (distanceOf(plan(ctx, WIDTH[level], pool)) <= before) return { type: 'exchange-joker', ...x };
      }
    }
    return { type: 'discard', tile: chooseDiscard(ctx, view, level, random) };
  }
  const mahjong = prompt.options.filter((o) => o.canMahjong);
  if (mahjong.length > 0) {
    // Called tiles complete a hand from the pool plus the discard; take the more valuable.
    const value = (hand: HandSlot) => bestWinFrom(card, [...view.concealed, prompt.tile], ctx.hands[hand]!.exposures, { must: prompt.tile })?.points ?? 0;
    const hand = mahjong.map((o) => o.hand).sort((a, b) => value(b) - value(a))[0]!;
    return { type: 'claim', response: { type: 'mahjong', hand } };
  }
  if (random() < SLOPPINESS[level] || (level === 'easy' && random() < 0.5)) return { type: 'claim', response: { type: 'pass' } };
  let best: { hand: HandSlot; size: number; after: number } | null = null;
  const before = distanceOf(plan(ctx, WIDTH[level]));
  for (const option of prompt.options) {
    for (const size of option.sizes) {
      const next = afterCall(ctx, view, prompt.tile, option.hand, size);
      // Never make a call that leaves the hand dead for everyone to see.
      if (next.dead) continue;
      const after = distanceOf(plan(ctx, WIDTH[level], next.pool, next.hands));
      if (after < (best?.after ?? before)) best = { hand: option.hand, size, after };
    }
  }
  return { type: 'claim', response: best ? { type: 'expose', hand: best.hand, size: best.size } : { type: 'pass' } };
}

/** The discard a sharp computer player would make, for the Suggest button. */
export function suggestTwoPlayerDiscard(card: Card, view: TwoPlayerView): number | null {
  if (view.concealed.length === 0) return null;
  return chooseDiscard(contextOf(card, view), view, 'hard', () => 0.5);
}

export interface TwoPlayerHint {
  concrete: ConcreteHand;
  /** Tiles still needed, with the other hand's planned tiles set aside (0 = Mahjong). */
  distance: number;
}

/**
 * The closest hands on the card for each of a player's two hands (null for a hand that's
 * declared or dead). Each hand is judged from the tiles left once the other hand's planned
 * target has taken what it needs, so the two lists don't count the same tiles twice.
 */
export function twoPlayerHints(card: Card, view: TwoPlayerView, limit = 3): (TwoPlayerHint[] | null)[] {
  const ctx = contextOf(card, view);
  const best = plan(ctx, WIDTH.normal).best;
  return HAND_SLOTS.map((slot) => {
    const hand = ctx.hands[slot]!;
    if (!hand.live) return null;
    const reserved = best?.targets[slot === 0 ? 1 : 0] ?? null;
    const seen = new Set<string>();
    return ranked(ctx, hand.exposures, reserved ? leftover(ctx.pool, reserved) : ctx.pool)
      .filter(({ t }) => !seen.has(t.concrete.hand.id) && seen.add(t.concrete.hand.id))
      .slice(0, limit)
      .map(({ t, d }) => ({ concrete: t.concrete, distance: d >= IMPOSSIBLE ? d - IMPOSSIBLE : d }));
  });
}

/**
 * Sorts a player's concealed tiles into their two racks by the plan: each live hand's rack
 * gets the tiles its target uses, and the rest are shared out to even the racks up.
 */
export function planSplit(card: Card, view: TwoPlayerView): [number[], number[]] {
  const ctx = contextOf(card, view);
  const live = HAND_SLOTS.filter((s) => ctx.hands[s]!.live);
  if (live.length < 2) {
    // Everything goes to the one hand still being built (or, with both dead, the first not declared).
    const slot = live[0] ?? HAND_SLOTS.find((s) => view.players[view.seat]!.hands[s]!.shown === null) ?? 0;
    return slot === 0 ? [[...view.concealed], []] : [[], [...view.concealed]];
  }
  const best = plan(ctx, WIDTH.normal).best;
  const free = [...view.concealed];
  const racks: [number[], number[]] = [[], []];
  const takeNatural = (slot: HandSlot, key: string, n: number) => {
    for (let k = 0; k < n; k++) {
      const i = free.findIndex((t) => !isJoker(t) && keyOf(t) === key);
      if (i === -1) return k;
      racks[slot].push(free.splice(i, 1)[0]!);
    }
    return n;
  };
  // Pairs and singles first (they can only be naturals), then the bigger groups, then jokers.
  for (const slot of HAND_SLOTS) {
    const t = best?.targets[slot];
    if (t) for (let i = 0; i < t.nat.length; i += 2) takeNatural(slot, KEYS[t.nat[i]!]!, t.nat[i + 1]!);
  }
  for (const slot of HAND_SLOTS) {
    const t = best?.targets[slot];
    if (!t) continue;
    for (let i = 0; i < t.jok.length; i += 2) {
      let missing = t.jok[i + 1]! - takeNatural(slot, KEYS[t.jok[i]!]!, t.jok[i + 1]!);
      while (missing > 0) {
        const j = free.findIndex(isJoker);
        if (j === -1) break;
        racks[slot].push(free.splice(j, 1)[0]!);
        missing -= 1;
      }
    }
  }
  // What's left goes where there's room for it, so each rack holds about one hand's worth.
  const room = (slot: HandSlot) => 14 - ctx.hands[slot]!.exposures.reduce((n, e) => n + e.tiles.length, 0) - racks[slot].length;
  for (const t of free) racks[room(0) >= room(1) ? 0 : 1].push(t);
  return racks;
}
