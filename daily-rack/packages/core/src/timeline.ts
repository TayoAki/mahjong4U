// The clip timeline is a pure data description shared by the live preview and the
// MP4 encoder, so both render exactly the same frames for the same result.

export const CLIP_WIDTH = 1080;
export const CLIP_HEIGHT = 1920;
export const CLIP_FPS = 30;
export const VOICEOVER_MAX_SECONDS = 20;
export const REASON_MAX_CHARS = 48;

export interface ClipTile {
  instanceId: string;
  faceCode: string;
}

export interface ClipSplitRow {
  tileInstanceId: string;
  rate: number;
}

export interface ClipInput {
  brand: string;
  question: string;
  sectionLabel: string;
  tiles: ClipTile[];
  passIds: [string, string, string];
  reasons: Record<string, string>;
  /** null when the split is below the sample threshold or unavailable. */
  split: ClipSplitRow[] | null;
  splitAttemptCount: number;
  endCardUrl: string | null;
  creatorHandle?: string | null;
}

export type SegmentType = 'hook' | 'rack' | 'tile' | 'split' | 'question' | 'end';

export interface Segment {
  type: SegmentType;
  start: number;
  end: number;
  caption: string;
  /** For 'tile' segments: which passed tile (0-2) slides out. */
  passIndex?: number;
}

export interface CaptionWord {
  text: string;
  start: number;
  end: number;
}

export interface CaptionLine {
  start: number;
  end: number;
  words: CaptionWord[];
}

export interface ClipTimeline {
  version: 1;
  width: number;
  height: number;
  fps: number;
  duration: number;
  input: ClipInput;
  segments: Segment[];
  captions: CaptionLine[];
}

/** 32-second template from the screen spec: hook, rack, 3 tiles, split, question, end card. */
export function buildClipTimeline(input: ClipInput): ClipTimeline {
  const segments: Segment[] = [
    { type: 'hook', start: 0, end: 3, caption: '' },
    { type: 'rack', start: 3, end: 7, caption: `Going for ${input.sectionLabel}` },
  ];
  input.passIds.forEach((id, i) => {
    const start = 7 + i * 4;
    segments.push({ type: 'tile', start, end: start + 4, caption: clampReason(input.reasons[id] ?? ''), passIndex: i });
  });
  segments.push(
    {
      type: 'split',
      start: 19,
      end: 25,
      caption: input.split ? 'How everyone passed' : 'More players are weighing in',
    },
    { type: 'question', start: 25, end: 29, caption: 'What would you pass? Comment below' },
    { type: 'end', start: 29, end: 32, caption: '' },
  );

  const captions = segments.flatMap((s) => (s.caption ? scheduleCaption(s.caption, s.start, s.end) : []));
  return { version: 1, width: CLIP_WIDTH, height: CLIP_HEIGHT, fps: CLIP_FPS, duration: 32, input, segments, captions };
}

export function clampReason(text: string): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  return clean.length <= REASON_MAX_CHARS ? clean : `${clean.slice(0, REASON_MAX_CHARS - 1).trimEnd()}…`;
}

const WORDS_PER_LINE = 3;
const LEAD_IN = 0.25;
const TAIL_HOLD = 0.4;

/**
 * Splits a caption into lines of up to three words and gives each word a highlight
 * window weighted by its length, inside [start + lead-in, end - tail].
 */
export function scheduleCaption(text: string, start: number, end: number): CaptionLine[] {
  const words = text.toUpperCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const spokenStart = start + LEAD_IN;
  const spokenEnd = Math.max(spokenStart + 0.2 * words.length, end - TAIL_HOLD);
  const weights = words.map((w) => 1 + w.replace(/[^A-Z0-9]/g, '').length);
  const totalWeight = weights.reduce((a, b) => a + b, 0);
  const span = spokenEnd - spokenStart;

  let cursor = spokenStart;
  const timed: CaptionWord[] = words.map((text, i) => {
    const length = (span * (weights[i] ?? 1)) / totalWeight;
    const word = { text, start: round(cursor), end: round(cursor + length) };
    cursor += length;
    return word;
  });

  const lines: CaptionLine[] = [];
  for (let i = 0; i < timed.length; i += WORDS_PER_LINE) {
    const chunk = timed.slice(i, i + WORDS_PER_LINE);
    const isLast = i + WORDS_PER_LINE >= timed.length;
    lines.push({
      start: chunk[0]?.start ?? start,
      end: isLast ? end : (timed[i + WORDS_PER_LINE]?.start ?? end),
      words: chunk,
    });
  }
  return lines;
}

export function segmentAt(timeline: ClipTimeline, t: number): Segment {
  return (
    timeline.segments.find((s) => t >= s.start && t < s.end) ??
    timeline.segments[timeline.segments.length - 1] ?? { type: 'end', start: 0, end: timeline.duration, caption: '' }
  );
}

/** Caption line visible at time t and the index of the highlighted word (-1 before the first word). */
export function captionAt(timeline: ClipTimeline, t: number): { line: CaptionLine; activeIndex: number } | null {
  const line = timeline.captions.find((l) => t >= l.start && t < l.end);
  if (!line) return null;
  let activeIndex = -1;
  line.words.forEach((w, i) => {
    if (t >= w.start) activeIndex = i;
  });
  return { line, activeIndex };
}

export function frameCount(timeline: ClipTimeline): number {
  return Math.round(timeline.duration * timeline.fps);
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}
