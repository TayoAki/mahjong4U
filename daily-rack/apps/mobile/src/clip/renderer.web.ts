import { captionAt, segmentAt, formatRate, type ClipTimeline } from '@daily-rack/core';
import { TILE_H, TILE_W, tileSvg } from '../tiles/tileArt.ts';

// Draws one frame of the clip at time t. Pure function of (timeline, t, assets, style):
// the live preview and the MP4 encoder call it with the same inputs and get the same frame.

export type CaptionStyle = 'blue' | 'magenta';

export interface RenderAssets {
  tiles: Map<string, CanvasImageSource>;
  felt: CanvasPattern | null;
}

const W = 1080;
const H = 1920;
const MAGENTA = '#99028F';
const CAPTION_BG: Record<CaptionStyle, string> = { blue: 'rgba(27, 79, 156, 0.95)', magenta: 'rgba(181, 23, 158, 0.95)' };
const FELT = '#1D4B3E';
// Family names registered by @expo-google-fonts through expo-font.
const SERIF_FAMILY = 'DMSerifDisplay_400Regular';
const CAPTION_FAMILY = 'Anton_400Regular';
const SERIF = `"${SERIF_FAMILY}", Georgia, serif`;
const CAPTION_FONT = `"${CAPTION_FAMILY}", Impact, "Arial Narrow", sans-serif`;

// Rack geometry: 13 tiles in one row on a wooden rack.
const RACK_TILE_W = 72;
const RACK_TILE_H = (RACK_TILE_W * TILE_H) / TILE_W;
const RACK_GAP = 3;
const RACK_Y = 980;
const PASS_TILE_W = 140;
const PASS_TILE_H = (PASS_TILE_W * TILE_H) / TILE_W;
const PASS_Y = 1190;
const PASS_GAP = 36;
const CAPTION_CENTER_Y = 1525;

/** Rasterizes each distinct tile face once and makes sure the canvas fonts are loaded. */
export async function loadAssets(faceCodes: string[]): Promise<RenderAssets> {
  await Promise.all([document.fonts.load(`400 120px "${SERIF_FAMILY}"`), document.fonts.load(`400 80px "${CAPTION_FAMILY}"`)]);
  const tiles = new Map<string, CanvasImageSource>();
  await Promise.all(
    [...new Set(faceCodes)].map(async (face) => {
      const svg = tileSvg(face, { scale: 3 });
      const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
      try {
        const img = new Image();
        img.src = url;
        await img.decode();
        tiles.set(face, await createImageBitmap(img));
      } finally {
        URL.revokeObjectURL(url);
      }
    }),
  );
  return { tiles, felt: feltPattern() };
}

/** Deterministic felt texture from a seeded generator, so every render is identical. */
function feltPattern(): CanvasPattern | null {
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  let seed = 0x5eed;
  const random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let x = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    x = (x + Math.imul(x ^ (x >>> 7), 61 | x)) ^ x;
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < 2200; i++) {
    ctx.fillStyle = random() > 0.5 ? 'rgba(255,255,255,0.035)' : 'rgba(0,0,0,0.05)';
    ctx.fillRect(random() * size, random() * size, 1 + random() * 2, 1 + random() * 2);
  }
  return ctx.createPattern(canvas, 'repeat');
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3);
const lerp = (a: number, b: number, k: number) => a + (b - a) * k;

export function drawFrame(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  timeline: ClipTimeline,
  t: number,
  assets: RenderAssets,
  style: CaptionStyle,
): void {
  const { input } = timeline;
  const segment = segmentAt(timeline, t);
  ctx.save();
  ctx.clearRect(0, 0, W, H);

  // Felt background with a soft light from the top.
  ctx.fillStyle = FELT;
  ctx.fillRect(0, 0, W, H);
  if (assets.felt) {
    ctx.fillStyle = assets.felt;
    ctx.fillRect(0, 0, W, H);
  }
  const light = ctx.createRadialGradient(W * 0.35, H * 0.2, 50, W * 0.5, H * 0.45, H * 0.8);
  light.addColorStop(0, 'rgba(255,255,255,0.10)');
  light.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, W, H);

  const endFade = segment.type === 'end' ? easeOut((t - segment.start) / 0.6) : 0;

  // Rack with the tiles that are still in it.
  ctx.globalAlpha = 1 - endFade;
  const rackWidth = input.tiles.length * RACK_TILE_W + (input.tiles.length - 1) * RACK_GAP;
  const rackX = (W - rackWidth) / 2;
  drawWoodRack(ctx, rackX - 22, RACK_Y - 18, rackWidth + 44, RACK_TILE_H + 52);

  const passStart = (i: number) => 7 + i * 4;
  const passX = (i: number) => W / 2 + (i - 1) * (PASS_TILE_W + PASS_GAP) - PASS_TILE_W / 2;

  input.tiles.forEach((tile, index) => {
    const passIndex = input.passIds.indexOf(tile.instanceId);
    const x0 = rackX + index * (RACK_TILE_W + RACK_GAP);
    if (passIndex === -1) {
      drawTile(ctx, assets, tile.faceCode, x0, RACK_Y, RACK_TILE_W, RACK_TILE_H, false);
      return;
    }
    // Passed tiles lift out of the rack one by one and settle in the pass row.
    const k = easeOut((t - passStart(passIndex)) / 0.7);
    const x = lerp(x0, passX(passIndex), k);
    const y = lerp(RACK_Y, PASS_Y, k) - Math.sin(Math.PI * k) * 60;
    const w = lerp(RACK_TILE_W, PASS_TILE_W, k);
    const h = lerp(RACK_TILE_H, PASS_TILE_H, k);
    const focused = segment.type === 'tile' && segment.passIndex === passIndex;
    drawTile(ctx, assets, tile.faceCode, x, y, w, h, focused);
  });

  // The split: a filled pill with the rate under each passed tile, clear of the captions.
  if (segment.type === 'split' && input.split) {
    const k = easeOut((t - segment.start) / 0.5);
    input.passIds.forEach((id, i) => {
      const rate = input.split?.find((r) => r.tileInstanceId === id)?.rate ?? 0;
      const x = passX(i);
      const pillY = PASS_Y + PASS_TILE_H + 18;
      const pillH = 58;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
      roundRect(ctx, x, pillY, PASS_TILE_W, pillH, pillH / 2);
      ctx.fill();
      ctx.fillStyle = MAGENTA;
      roundRect(ctx, x, pillY, Math.max(pillH, PASS_TILE_W * rate * k), pillH, pillH / 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.font = `400 44px ${CAPTION_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(formatRate(rate * k), x + PASS_TILE_W / 2, pillY + pillH / 2 + 2);
    });
  }
  ctx.globalAlpha = 1;

  // Title banner: big for the hook and the closing question, small in between.
  if (segment.type !== 'end') {
    const big = segment.type === 'hook' || segment.type === 'question';
    const sinceStart = t - segment.start;
    const grow = big ? easeOut(sinceStart / 0.35) : 1;
    const shrink = segment.type === 'rack' ? easeOut(sinceStart / 0.5) : big ? 0 : 1;
    const scale = big ? lerp(0.85, 1, grow) : lerp(1, 0.62, shrink);
    const centerY = big ? 640 : lerp(640, 330, shrink);
    drawBanner(ctx, input.question, centerY, scale);
    if (!big && segment.type !== 'rack') drawChip(ctx, `Going for ${input.sectionLabel}`, 500);
  }

  // Word-by-word captions in the lower third.
  const caption = captionAt(timeline, t);
  if (caption && segment.type !== 'end') drawCaption(ctx, caption.line.words.map((w) => w.text), caption.activeIndex, style);

  if (segment.type === 'end') drawEndCard(ctx, timeline, endFade);
  ctx.restore();
}

function drawTile(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  assets: RenderAssets,
  face: string,
  x: number,
  y: number,
  w: number,
  h: number,
  focused: boolean,
) {
  const r = w * 0.11;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.35)';
  ctx.shadowBlur = w * 0.18;
  ctx.shadowOffsetY = w * 0.08;
  ctx.fillStyle = '#2D6B56';
  roundRect(ctx, x, y + h * 0.05, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#D9CCAE';
  roundRect(ctx, x, y + h * 0.025, w, h, r);
  ctx.fill();
  const image = assets.tiles.get(face);
  if (image) ctx.drawImage(image, x, y, w, h);
  if (focused) {
    ctx.save();
    ctx.strokeStyle = '#F2C14E';
    ctx.lineWidth = Math.max(4, w * 0.05);
    roundRect(ctx, x - 6, y - 6, w + 12, h + 12, r + 6);
    ctx.stroke();
    ctx.restore();
  }
}

function drawWoodRack(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 30;
  ctx.shadowOffsetY = 16;
  const wood = ctx.createLinearGradient(0, y, 0, y + h);
  wood.addColorStop(0, '#C99A63');
  wood.addColorStop(1, '#8F6233');
  ctx.fillStyle = wood;
  roundRect(ctx, x, y, w, h, 16);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, x + 8, y + 6, w - 16, 8, 4);
  ctx.fill();
}

function drawBanner(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, centerY: number, scale: number) {
  const fontSize = 128;
  ctx.save();
  ctx.translate(W / 2, centerY);
  ctx.scale(scale, scale);
  ctx.font = `400 ${fontSize}px ${SERIF}`;
  const lines = wrap(ctx, text, 800);
  const lineHeight = fontSize * 1.02;
  const width = Math.max(...lines.map((l) => ctx.measureText(l).width)) + 110;
  const height = lines.length * lineHeight + 70;
  ctx.shadowColor = 'rgba(0,0,0,0.25)';
  ctx.shadowBlur = 24;
  ctx.shadowOffsetY = 10;
  ctx.fillStyle = '#FFFFFF';
  roundRect(ctx, -width / 2, -height / 2, width, height, 44);
  ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = MAGENTA;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((line, i) => ctx.fillText(line, 0, -((lines.length - 1) * lineHeight) / 2 + i * lineHeight + 6));
  ctx.restore();
}

function drawChip(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, centerY: number) {
  ctx.save();
  ctx.font = '700 40px system-ui, -apple-system, "Segoe UI", sans-serif';
  const label = text.toUpperCase();
  const w = ctx.measureText(label).width + 64;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  roundRect(ctx, (W - w) / 2, centerY - 36, w, 72, 36);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, W / 2, centerY + 2);
  ctx.restore();
}

function drawCaption(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  words: string[],
  activeIndex: number,
  style: CaptionStyle,
) {
  let fontSize = 84;
  const gap = 0.32;
  ctx.save();
  const measure = () => {
    ctx.font = `400 ${fontSize}px ${CAPTION_FONT}`;
    const widths = words.map((w) => ctx.measureText(w).width);
    return { widths, total: widths.reduce((a, b) => a + b, 0) + gap * fontSize * (words.length - 1) };
  };
  let m = measure();
  while (m.total > 900 && fontSize > 44) {
    fontSize -= 4;
    m = measure();
  }
  const padX = 34;
  const boxW = m.total + padX * 2;
  const boxH = fontSize * 1.45;
  ctx.fillStyle = CAPTION_BG[style];
  roundRect(ctx, (W - boxW) / 2, CAPTION_CENTER_Y - boxH / 2, boxW, boxH, 14);
  ctx.fill();
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  let x = (W - m.total) / 2;
  words.forEach((word, i) => {
    ctx.fillStyle = i === activeIndex ? '#FFE066' : i < activeIndex ? '#FFFFFF' : 'rgba(255,255,255,0.88)';
    ctx.fillText(word, x, CAPTION_CENTER_Y + fontSize * 0.04);
    x += (m.widths[i] ?? 0) + gap * fontSize;
  });
  ctx.restore();
}

function drawEndCard(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, timeline: ClipTimeline, k: number) {
  const { input } = timeline;
  ctx.save();
  ctx.globalAlpha = k;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `400 150px ${SERIF}`;
  ctx.fillText(input.brand, W / 2, 780);

  ctx.font = '600 58px system-ui, -apple-system, "Segoe UI", sans-serif';
  const label = "Play today's rack";
  const pillW = ctx.measureText(label).width + 120;
  ctx.fillStyle = MAGENTA;
  roundRect(ctx, (W - pillW) / 2, 900, pillW, 120, 60);
  ctx.fill();
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(label, W / 2, 962);

  if (input.endCardUrl) {
    ctx.font = '500 52px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.92)';
    ctx.fillText(input.endCardUrl, W / 2, 1110);
  }
  if (input.creatorHandle) {
    ctx.font = '500 46px system-ui, -apple-system, "Segoe UI", sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.fillText(`Rack by @${input.creatorHandle}`, W / 2, 1200);
  }
  ctx.restore();
}

function wrap(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function roundRect(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
