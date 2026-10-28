import { createAudioPlayer, setAudioModeAsync, type AudioPlayer } from 'expo-audio';

// The table's sounds, synthesized by scripts/make-sounds.mjs. Each file gets one reusable
// player, and sounds with several takes rotate through them so a run of discards doesn't
// sound like a loop.

const SOURCES = {
  place: [require('../../assets/sounds/place-1.wav'), require('../../assets/sounds/place-2.wav'), require('../../assets/sounds/place-3.wav')],
  call: [require('../../assets/sounds/call-1.wav'), require('../../assets/sounds/call-2.wav')],
  draw: [require('../../assets/sounds/draw-1.wav'), require('../../assets/sounds/draw-2.wav')],
  tap: [require('../../assets/sounds/tap.wav')],
  pass: [require('../../assets/sounds/pass.wav')],
  shuffle: [require('../../assets/sounds/shuffle.wav')],
  reveal: [require('../../assets/sounds/reveal.wav')],
  wall: [require('../../assets/sounds/wall.wav')],
  cue: [require('../../assets/sounds/cue.wav')],
} as const;

export type SoundName = keyof typeof SOURCES;

/** How loud each sound sits in the mix: discards are the main event, taps are quiet. */
const LEVEL: Record<SoundName, number> = { place: 0.9, call: 0.9, draw: 0.55, tap: 0.3, pass: 0.7, shuffle: 0.6, reveal: 0.85, wall: 0.6, cue: 0.5 };

let enabled = true;
let configured = false;
const players = new Map<string, AudioPlayer>();
const takes = new Map<SoundName, number>();

export function setSoundsEnabled(on: boolean): void {
  enabled = on;
}

function configure() {
  if (configured) return;
  configured = true;
  // Game sounds respect the iPhone's silent switch and play over the player's own music.
  setAudioModeAsync({ playsInSilentMode: false, interruptionMode: 'mixWithOthers' }).catch(() => undefined);
}

function playerFor(name: SoundName, take: number): AudioPlayer {
  const key = `${name}-${take}`;
  let player = players.get(key);
  if (!player) {
    player = createAudioPlayer(SOURCES[name][take]);
    players.set(key, player);
  }
  return player;
}

/** Loads every sound ahead of time so the first clack isn't late. */
export function preloadSounds(): void {
  try {
    configure();
    for (const name of Object.keys(SOURCES) as SoundName[]) SOURCES[name].forEach((_, take) => playerFor(name, take));
  } catch {
    // Sounds are a nicety; the game plays without them.
  }
}

export function playSound(name: SoundName, volume = 1): void {
  if (!enabled) return;
  try {
    configure();
    const take = (takes.get(name) ?? 0) % SOURCES[name].length;
    takes.set(name, take + 1);
    const player = playerFor(name, take);
    player.volume = Math.min(1, LEVEL[name] * volume);
    // Rewind first: a player that finished last time sits at its end.
    if (player.currentTime > 0) {
      player
        .seekTo(0)
        .then(() => player.play())
        .catch(() => undefined);
    } else {
      player.play();
    }
  } catch {
    // Sounds are a nicety; the game plays without them.
  }
}
