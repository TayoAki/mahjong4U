import type { Card } from './card.ts';
import { SEATS, claimOptionsFor, deadReason, type GameState, type Phase, type PlayerView, type Seat } from './game.ts';
import { handsFittingExposures } from './match.ts';
import { isJoker, keyOf } from './set.ts';
import { groupWithMeaning, listOf, numberWord, tileName, tileNames } from './words.ts';

// "Why can't I call this?" A plain-English answer for one seat about a discard, written for
// beginners. It uses the engine's own claim rules (claimOptionsFor, dead hands), so it never
// says a call is possible when the game wouldn't offer it, or the other way round.

export type ClaimReasonCode =
  /** Can call: the tile completes a hand for Mahjong. */
  | 'mahjong'
  /** Can call: the tile finishes a group to lay face up. */
  | 'can-expose'
  /** Jokers can never be called. */
  | 'joker'
  /** The seat threw this tile out itself. */
  | 'own-discard'
  /** Not the latest discard, the next player has drawn, someone else took it, or the seat already answered. */
  | 'too-late'
  /** This seat's hand is dead. */
  | 'dead-hand'
  /** Every hand the seat can still make with the tile is concealed, so only a Mahjong call would do. */
  | 'concealed-only'
  /** In every hand the seat can still make, the tile is only part of a pair or a single. */
  | 'pair-or-single'
  /** The tile fits a group, but the seat doesn't hold enough matching tiles or jokers to expose it. */
  | 'not-enough-tiles'
  /** The tile isn't in any hand the seat can still make. */
  | 'no-fit'
  /** There's no discard to talk about (none yet, not a discard, or the hand is over). */
  | 'nothing-to-call';

export interface ClaimExplanation {
  /** True only while the engine is waiting on this seat's answer to this very discard. */
  canCall: boolean;
  code: ClaimReasonCode;
  /** The tile explained (the discard on offer, or the latest one); null if there is none. */
  tile: number | null;
  /** When canCall: whether calling for Mahjong is allowed (as in the claim prompt). */
  canMahjong: boolean;
  /** When canCall: the group sizes the seat may expose (as in the claim prompt). */
  sizes: number[];
  /** Friendly, specific explanation in the second person. */
  text: string;
}

/**
 * Whether `seat` can call a discard and why (or why not). `tile` defaults to the discard on
 * offer, or else the latest discard on the floor.
 */
export function explainClaim(card: Card, state: GameState, seat: Seat, tile?: number): ClaimExplanation {
  const phase = state.phase;
  const target = tile ?? (phase.kind === 'claim' ? phase.tile : state.discards.at(-1)?.tile);
  const no = (code: ClaimReasonCode, text: string): ClaimExplanation => ({ canCall: false, code, tile: target ?? null, canMahjong: false, sizes: [], text });

  if (phase.kind === 'ended') return no('nothing-to-call', "This hand is over, so there's nothing left to call.");
  if (target === undefined) return no('nothing-to-call', "There's no discard to call right now. You can only call a tile another player has just thrown out.");
  if (isJoker(target)) {
    return no('joker', 'Jokers can never be called. Once a joker is discarded, it stays in the discards for the rest of the hand.');
  }

  const key = keyOf(target);
  const name = `the ${tileName(key)}`;
  const onFloor = state.discards.find((d) => d.tile === target);
  if (onFloor?.seat === seat) {
    return no('own-discard', "That's your own discard. You can't take back a tile you've thrown out; calls are only for other players' discards.");
  }
  if (!onFloor) {
    const takenBy = state.players.findIndex((p) => p.exposures.some((e) => e.tiles.includes(target)));
    if (takenBy === seat) return no('nothing-to-call', `${capitalize(name)} is already part of a group you've exposed.`);
    if (takenBy !== -1) return no('too-late', `Another player already called ${name}, so it isn't in the discards any more.`);
    return no('nothing-to-call', `You can only call a tile from the discards, and ${name} isn't one.`);
  }

  const latest = state.discards.at(-1)?.tile === target;
  const windowOpen = phase.kind === 'claim' && phase.tile === target;
  // Right after nobody could call a discard, the next player draws straight away.
  const justClosed = !windowOpen && latest && phase.kind === 'turn' && phase.drawn !== null;
  if (!windowOpen && !justClosed) {
    return no('too-late', `You can only call the most recent discard, and only before the next player draws. The chance to call ${name} has passed.`);
  }

  const dead = deadReason(state, seat);
  if (dead) {
    return no(
      'dead-hand',
      `Your hand is dead: ${dead.text}. You sit out the rest of this hand (no drawing, discarding or calling), but you still pay the winner like everyone else.`,
    );
  }

  // Judge the hand as it was when the discard was thrown, so leave out a tile drawn since.
  const me = state.players[seat]!;
  const hand = justClosed && phase.kind === 'turn' && phase.seat === seat && phase.drawn !== null ? withoutTile(me.hand, phase.drawn) : me.hand;
  const options = claimOptionsFor(card, hand, me.exposures, target);

  if (options.canMahjong || options.sizes.length > 0) {
    if (!windowOpen) {
      return no('too-late', `The chance to call ${name} has passed: a discard can only be called right after it's thrown, before the next player draws.`);
    }
    if (phase.kind === 'claim' && phase.responses[seat] !== null) {
      return no('too-late', `You've already answered on ${name}, and that choice can't be changed now.`);
    }
    if (options.canMahjong) {
      return { canCall: true, code: 'mahjong', tile: target, ...options, text: `Yes! ${capitalize(name)} completes your hand, so you can call it and declare Mahjong.` };
    }
    return {
      canCall: true,
      code: 'can-expose',
      tile: target,
      ...options,
      text: `Yes, you can call ${name} to make ${listOf(options.sizes.map(groupWithMeaning), 'or')} and lay that group face up. You then discard a tile, and you'll need to finish a hand that uses that group.`,
    };
  }

  // Not callable. Work out the most useful reason, from the hands this seat can still make.
  const fits = handsFittingExposures(card, me.exposures);
  const openGroups = fits.filter((f) => !f.concrete.hand.concealed).flatMap((f) => f.remaining.filter((g) => g.face === key));
  const exposable = openGroups.filter((g) => g.jokerable);
  if (exposable.length > 0) {
    const needed = Math.min(...exposable.map((g) => g.n - 1));
    const have = hand.filter((t) => isJoker(t) || keyOf(t) === key).length;
    const matching = needed === 1 ? `one ${tileName(key)} or joker` : `${numberWord(needed)} ${tileNames(key)} or jokers`;
    return no(
      'not-enough-tiles',
      `To call ${name}, you lay it face up together with matching tiles from your hand. The smallest group it fits in a hand you can still make is ${groupWithMeaning(needed + 1)}, so you'd need ${matching} already in your hand, and you have ${have === 0 ? 'none' : numberWord(have)}.`,
    );
  }
  if (openGroups.length > 0) {
    return no(
      'pair-or-single',
      `In every hand you can still make, ${name} would only be part of a pair or a single. You can only call a discard to finish a group of three or more matching tiles (a pung, kong, quint or sextet) that you lay face up, or when it gives you Mahjong.`,
    );
  }
  if (fits.some((f) => f.concrete.hand.concealed && f.remaining.some((g) => g.face === key))) {
    return no(
      'concealed-only',
      `Every hand you could still make with ${name} is concealed (marked C on the card). A concealed hand has to be built from tiles you pick yourself, so you can only call a discard for it when it gives you Mahjong, and this one doesn't yet.`,
    );
  }
  return no(
    'no-fit',
    me.exposures.length > 0
      ? `${capitalize(name)} doesn't fit any hand you can still make with the groups you've already exposed.`
      : `${capitalize(name)} isn't used in any hand on the card.`,
  );
}

/**
 * explainClaim from one player's own view of the table, which is all an app has. It rebuilds
 * just the parts of the game the explanation reads, so the answer is the same as from the
 * full game (a test checks this over whole games).
 */
export function explainClaimForView(card: Card, view: PlayerView, tile?: number): ClaimExplanation {
  const seat = view.seat;
  const p = view.phase;
  // Unprompted in a claim window means the engine already has an answer for this seat
  // (an automatic pass, or the player's own choice). Only whether another player drew is
  // needed, not what they drew.
  const phase: Phase =
    p.kind === 'claim'
      ? { kind: 'claim', tile: p.tile, from: p.from, responses: SEATS.map((s) => (s === seat && view.prompt?.type === 'claim' ? null : { type: 'pass' })) }
      : p.kind === 'turn'
        ? { kind: 'turn', seat: p.seat, drawn: p.seat === seat ? view.drawn : p.drew ? -1 : null }
        : p.kind === 'ended'
          ? { kind: 'ended' }
          : { kind: 'charleston-vote', votes: [null, null, null, null] };
  const state = {
    phase,
    discards: view.discards,
    players: view.players.map((pl) => ({ hand: pl.seat === seat ? view.hand : [], exposures: pl.exposures })),
    dead: view.players.map((pl) => pl.dead),
  } as unknown as GameState;
  return explainClaim(card, state, seat, tile);
}

function withoutTile(hand: readonly number[], tile: number): number[] {
  const rest = [...hand];
  const i = rest.indexOf(tile);
  if (i !== -1) rest.splice(i, 1);
  return rest;
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
