import { useEffect, useRef } from 'react';
import type { PlayerView } from '@daily-rack/core/mahjong';
import { playSound } from '../lib/sounds.ts';

interface Snapshot {
  gameId: string;
  discards: number;
  exposures: number;
  wall: number;
  drawn: number | null;
  ended: boolean;
  claim: number | null;
  passStep: string | null;
}

/** What the sounds follow: a player's view, or (at a two-player table) one shaped like it. */
export type SoundView = Pick<PlayerView, 'seat' | 'discards' | 'wallCount' | 'drawn'> & {
  phase: { kind: string; round?: number; direction?: string };
  players: { exposures: readonly unknown[] }[];
  prompt: { type: string; tile?: number } | null;
  result: { kind: string } | null;
};

function snapshot(gameId: string, view: SoundView): Snapshot {
  const phase = view.phase;
  return {
    gameId,
    discards: view.discards.length,
    exposures: view.players.reduce((n, p) => n + p.exposures.length, 0),
    wall: view.wallCount,
    drawn: view.drawn,
    ended: view.result !== null,
    claim: view.prompt?.type === 'claim' ? (view.prompt.tile ?? null) : null,
    passStep: phase.kind === 'charleston' ? `${phase.round}${phase.direction}` : phase.kind === 'courtesy-select' ? 'courtesy' : null,
  };
}

/**
 * Plays the table's sounds as the hand changes: a clack for every discard, a lighter click
 * for each draw (quieter for other players'), the group going down when someone calls, two
 * knocks when a discard is yours to call, a shuffle when a new hand is dealt and the rack
 * tipping over on Mahjong. Nothing plays for what was already there when the table opened.
 *
 * `ownDiscard` holds the tile you just threw: its clack already played when you tapped, so
 * it isn't played again when the server confirms it.
 */
export function useTableSounds(gameId: string, view: SoundView, ownDiscard: { current: number | null }) {
  const previous = useRef<Snapshot | null>(null);
  useEffect(() => {
    const now = snapshot(gameId, view);
    const before = previous.current;
    previous.current = now;
    if (!before) return;
    if (before.gameId !== gameId) {
      playSound('shuffle');
      return;
    }
    if (now.ended && !before.ended) {
      playSound(view.result?.kind === 'mahjong' ? 'reveal' : 'wall');
      return;
    }
    let discarded = false;
    if (now.exposures > before.exposures) playSound('call');
    else if (now.discards > before.discards) {
      const last = view.discards[view.discards.length - 1]!;
      discarded = true;
      if (last.seat === view.seat && ownDiscard.current === last.tile) ownDiscard.current = null;
      else playSound('place');
    }
    // The next player draws as soon as a discard goes uncalled; let the clack land first.
    const later = (fn: () => void) => (discarded ? setTimeout(fn, 260) : fn());
    if (now.drawn !== null && now.drawn !== before.drawn) later(() => playSound('draw'));
    else if (now.wall < before.wall) later(() => playSound('draw', 0.45));
    if (now.claim !== null && now.claim !== before.claim) later(() => playSound('cue'));
    // Tiles passed to you in the Charleston or courtesy pass arrive.
    if (before.passStep !== null && now.passStep !== before.passStep) playSound('draw', 0.8);
  });
}
