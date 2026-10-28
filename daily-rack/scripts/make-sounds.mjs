// Synthesizes the table sounds as 16-bit mono WAV files in apps/mobile/assets/sounds.
// Usage: node scripts/make-sounds.mjs
//
// No recordings are used, so the sounds are ours to ship. Each impact is modal synthesis
// of a small hard tile: a sub-millisecond contact click plus a handful of damped sine
// "modes" (the tile ringing for a few milliseconds), with a low thump when it lands on
// felt. Tile-on-tile clacks ring longer and brighter. Output is deterministic.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RATE = 32000;
const OUT = join(import.meta.dirname, '../apps/mobile/assets/sounds');

/** Seeded random numbers (mulberry32), so every run writes the same files. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The ringing of a melamine tile about 26 x 34 x 20 mm: [frequency Hz, decay s, gain].
const TILE_MODES = [
  [2150, 0.02, 0.45],
  [3380, 0.016, 0.8],
  [4760, 0.012, 1],
  [6220, 0.009, 0.7],
  [7950, 0.007, 0.45],
  [9700, 0.005, 0.3],
];

/**
 * Adds one tile impact to `buf` at time `at` (seconds).
 * bright: scales the mode frequencies; ring: scales how long they ring; felt: how much of
 * the low thump of a felt-covered table to add (0 for tile on tile).
 */
function impact(buf, at, { gain = 1, bright = 1, ring = 1, felt = 0, random }) {
  const start = Math.floor(at * RATE);
  const ramp = Math.round(0.0003 * RATE); // a hair of attack so the click isn't harsh
  const add = (i, v) => {
    const j = start + i;
    if (j >= 0 && j < buf.length) buf[j] += i < ramp ? v * (i / ramp) : v;
  };
  for (const [f0, d0, g0] of TILE_MODES) {
    const f = Math.min(f0 * bright * (0.97 + random() * 0.06), RATE * 0.45);
    const d = d0 * ring * (0.85 + random() * 0.3);
    const g = g0 * (0.8 + random() * 0.4);
    const phase = random() * Math.PI * 2;
    const length = Math.floor(d * 7 * RATE);
    for (let i = 0; i < length; i++) add(i, gain * g * Math.exp(-i / (d * RATE)) * Math.sin((2 * Math.PI * f * i) / RATE + phase));
  }
  // The contact itself: a burst of high-passed noise lasting about a millisecond.
  let prev = 0;
  for (let i = 0; i < Math.floor(0.005 * RATE); i++) {
    const n = random() * 2 - 1;
    add(i, gain * 0.7 * (n - prev) * Math.exp(-i / (0.0011 * RATE)));
    prev = n;
  }
  if (felt > 0) {
    // The table under the felt: a short, low, heavily damped thump.
    const f = 165 + random() * 30;
    let low = 0;
    for (let i = 0; i < Math.floor(0.06 * RATE); i++) {
      low += 0.08 * (random() * 2 - 1 - low);
      add(i, gain * felt * (0.55 * Math.sin((2 * Math.PI * f * i) / RATE) + 1.6 * low) * Math.exp(-i / (0.011 * RATE)));
    }
  }
}

/** Low, rustling noise: tiles sliding over felt. */
function slide(buf, at, length, gain, random) {
  const start = Math.floor(at * RATE);
  const n = Math.floor(length * RATE);
  let low = 0;
  for (let i = 0; i < n && start + i < buf.length; i++) {
    low += 0.12 * (random() * 2 - 1 - low);
    const env = Math.sin((Math.PI * i) / n) ** 2;
    buf[start + i] += gain * low * env;
  }
}

/** A small bell: inharmonic partials with long decays. */
function chime(buf, at, freq, gain) {
  const start = Math.floor(at * RATE);
  const partials = [
    [1, 1, 1.1],
    [2.01, 0.45, 0.7],
    [3.02, 0.22, 0.45],
    [4.18, 0.12, 0.28],
  ];
  for (const [ratio, g, d] of partials) {
    const f = freq * ratio;
    if (f > RATE * 0.45) continue;
    for (let i = 0; start + i < buf.length; i++) {
      const env = Math.exp(-i / (d * RATE)) * Math.min(1, i / (0.002 * RATE));
      if (env < 1e-4 && i > 0.01 * RATE) break;
      buf[start + i] += gain * g * env * Math.sin((2 * Math.PI * f * i) / RATE);
    }
  }
}

function render(seconds, draw, seed, peakDb = -2) {
  const buf = new Float64Array(Math.ceil(seconds * RATE));
  draw(buf, rng(seed));
  const fade = Math.floor(0.008 * RATE);
  for (let i = 0; i < fade; i++) buf[buf.length - 1 - i] *= i / fade;
  let peak = 0;
  for (const v of buf) peak = Math.max(peak, Math.abs(v));
  const scale = peak > 0 ? 10 ** (peakDb / 20) / peak : 0;
  return buf.map((v) => v * scale);
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => data.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(v * 32767))), i * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

const sounds = {
  // A tile put down on the felt, with the little settle that follows.
  ...Object.fromEntries(
    [1, 2, 3].map((k) => [
      `place-${k}`,
      render(
        0.2,
        (b, r) => {
          impact(b, 0.002, { gain: 1, felt: 1, random: r });
          impact(b, 0.02 + r() * 0.01, { gain: 0.18, bright: 1.05, felt: 0.3, random: r });
        },
        100 + k,
      ),
    ]),
  ),
  // Calling a discard: the tile taken, then the group laid down face up.
  ...Object.fromEntries(
    [1, 2].map((k) => [
      `call-${k}`,
      render(
        0.4,
        (b, r) => {
          impact(b, 0.002, { gain: 1, bright: 1.12, ring: 2.2, random: r });
          impact(b, 0.085, { gain: 0.8, ring: 1.6, felt: 0.6, random: r });
          impact(b, 0.115, { gain: 0.65, bright: 1.05, ring: 1.6, felt: 0.4, random: r });
        },
        200 + k,
      ),
    ]),
  ),
  // Drawing from the wall: a light pick, then the tile set on your rack.
  ...Object.fromEntries(
    [1, 2].map((k) => [
      `draw-${k}`,
      render(
        0.25,
        (b, r) => {
          impact(b, 0.002, { gain: 0.45, bright: 1.2, ring: 0.8, random: r });
          impact(b, 0.08 + r() * 0.02, { gain: 0.75, felt: 0.4, ring: 1.2, random: r });
        },
        300 + k,
      ),
    ]),
  ),
  // Picking a tile in your rack.
  tap: render(0.08, (b, r) => impact(b, 0.001, { gain: 0.6, bright: 1.3, ring: 0.6, random: r }), 400),
  // Passing tiles in the Charleston: a slide and three soft taps.
  pass: render(
    0.42,
    (b, r) => {
      slide(b, 0, 0.2, 0.12, r);
      [0.14, 0.2, 0.26].forEach((t) => impact(b, t, { gain: 0.6, felt: 0.7, ring: 1.1, random: r }));
    },
    500,
  ),
  // A new hand: tiles mixed face down on the felt.
  shuffle: render(
    1.7,
    (b, r) => {
      slide(b, 0, 1.6, 0.35, r);
      for (let k = 0; k < 70; k++) {
        const t = 0.05 + 1.5 * Math.sqrt(r()) * (r() < 0.5 ? r() : 1 - r() * 0.5);
        impact(b, t, { gain: 0.15 + r() * 0.55, bright: 0.9 + r() * 0.3, ring: 1.5 + r(), felt: r() * 0.3, random: r });
      }
    },
    600,
  ),
  // Mahjong: a rack of tiles tipped down face up, then a small two-note chime.
  reveal: render(
    2.1,
    (b, r) => {
      for (let k = 0; k < 14; k++) impact(b, 0.01 + k * 0.028 + r() * 0.006, { gain: 0.55 + r() * 0.2, felt: 0.5, ring: 1.6, random: r });
      chime(b, 0.55, 1318.5, 0.22);
      chime(b, 0.78, 1975.5, 0.2);
    },
    700,
  ),
  // A wall game: tiles pushed in, quietly.
  wall: render(
    0.9,
    (b, r) => {
      slide(b, 0, 0.8, 0.3, r);
      for (let k = 0; k < 8; k++) impact(b, 0.1 + r() * 0.6, { gain: 0.25 + r() * 0.2, felt: 0.6, ring: 1.4, random: r });
    },
    800,
  ),
  // A discard you can call: two light knocks to get your attention.
  cue: render(
    0.3,
    (b, r) => {
      impact(b, 0.002, { gain: 0.7, bright: 1.35, ring: 0.9, random: r });
      impact(b, 0.12, { gain: 0.7, bright: 1.5, ring: 0.9, random: r });
    },
    900,
  ),
};

mkdirSync(OUT, { recursive: true });
for (const [name, samples] of Object.entries(sounds)) {
  const file = join(OUT, `${name}.wav`);
  writeFileSync(file, wav(samples));
  console.log(`${name}.wav  ${(samples.length / RATE).toFixed(2)} s  ${Math.round((44 + samples.length * 2) / 1024)} KB`);
}
