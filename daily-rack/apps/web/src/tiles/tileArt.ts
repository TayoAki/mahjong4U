import { parseFace, type TileFace } from '@daily-rack/core';

// Deterministic tile artwork as SVG markup. The same markup is used inline in the
// app and rasterized for the clip renderer, so both always show the same faces.

export const TILE_W = 100;
export const TILE_H = 130;

const INK = '#173F36';
const GREEN = '#164D3F';
const RED = '#B62226';
const BLUE = '#1B4F9C';
const IVORY = '#FFF8E9';
const MAGENTA = '#99028F';

export const TILE_GLYPH_FONT = 'Tile Glyphs';

const NUMERALS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
const WIND_GLYPHS = { EAST: '東', SOUTH: '南', WEST: '西', NORTH: '北' } as const;

type Point = [number, number];

// Pip positions inside a 100x130 tile face (content area roughly x 14-86, y 16-114).
const DOT_LAYOUTS: Record<number, Point[]> = {
  1: [[50, 65]],
  2: [[50, 38], [50, 92]],
  3: [[28, 34], [50, 65], [72, 96]],
  4: [[31, 40], [69, 40], [31, 90], [69, 90]],
  5: [[30, 36], [70, 36], [50, 65], [30, 94], [70, 94]],
  6: [[33, 33], [67, 33], [33, 65], [67, 65], [33, 97], [67, 97]],
  7: [[26, 28], [50, 40], [74, 52], [33, 78], [67, 78], [33, 102], [67, 102]],
  8: [[33, 27], [67, 27], [33, 52], [67, 52], [33, 78], [67, 78], [33, 103], [67, 103]],
  9: [[26, 32], [50, 32], [74, 32], [26, 65], [50, 65], [74, 65], [26, 98], [50, 98], [74, 98]],
};

const DOT_RADIUS: Record<number, number> = { 1: 26, 2: 18, 3: 14, 4: 15, 5: 13, 6: 12.5, 7: 10.5, 8: 10.5, 9: 10.5 };

const BAM_LAYOUTS: Record<number, Point[]> = {
  2: [[50, 40], [50, 90]],
  3: [[50, 40], [31, 90], [69, 90]],
  4: [[31, 40], [69, 40], [31, 90], [69, 90]],
  5: [[27, 40], [73, 40], [50, 65], [27, 90], [73, 90]],
  6: [[26, 40], [50, 40], [74, 40], [26, 90], [50, 90], [74, 90]],
  7: [[50, 30], [26, 65], [50, 65], [74, 65], [26, 100], [50, 100], [74, 100]],
  8: [[22, 40], [41, 40], [59, 40], [78, 40], [22, 90], [41, 90], [59, 90], [78, 90]],
  9: [[26, 32], [50, 32], [74, 32], [26, 65], [50, 65], [74, 65], [26, 98], [50, 98], [74, 98]],
};

export interface TileSvgOptions {
  /** Base64 woff2 to embed so the SVG renders its glyphs when rasterized as an image. */
  embeddedGlyphFont?: string;
  /** Hide the small corner index (used for the large export render). */
  hideIndex?: boolean;
  /** Intrinsic pixel scale; rasterizing at 3x keeps tiles sharp in a 1080p frame. */
  scale?: number;
}

export function tileSvg(faceCode: string, options: TileSvgOptions = {}): string {
  const face = parseFace(faceCode);
  const scale = options.scale ?? 1;
  const style = options.embeddedGlyphFont
    ? `<style>@font-face{font-family:'${TILE_GLYPH_FONT}';src:url(data:font/woff2;base64,${options.embeddedGlyphFont}) format('woff2');font-weight:900;}</style>`
    : '';
  const body = face ? faceArt(face) : `<text x="50" y="78" text-anchor="middle" font-size="40" fill="${INK}">?</text>`;
  const index = face && !options.hideIndex ? cornerIndex(face) : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${TILE_W} ${TILE_H}" width="${TILE_W * scale}" height="${TILE_H * scale}">` +
    style +
    `<rect x="1" y="1" width="98" height="128" rx="11" fill="${IVORY}"/>` +
    `<rect x="1.5" y="1.5" width="97" height="127" rx="10.5" fill="none" stroke="#E7DCC4" stroke-width="1"/>` +
    body +
    index +
    `</svg>`
  );
}

function faceArt(face: TileFace): string {
  switch (face.kind) {
    case 'suited':
      if (face.suit === 'DOT') return dots(face.rank);
      if (face.suit === 'BAMBOO') return bamboo(face.rank);
      return character(face.rank);
    case 'wind':
      return glyph(WIND_GLYPHS[face.wind], INK, 64, 84);
    case 'dragon':
      if (face.color === 'RED') return glyph('中', RED, 70, 88);
      if (face.color === 'GREEN') return glyph('發', GREEN, 62, 86);
      return soap();
    case 'flower':
      return flower();
    case 'joker':
      return joker();
  }
}

function dots(rank: number): string {
  const r = DOT_RADIUS[rank] ?? 10;
  return (DOT_LAYOUTS[rank] ?? [])
    .map(([x, y], i) => {
      const accent = rank === 1 || (rank === 5 && i === 2) ? RED : rank === 3 && i === 1 ? RED : GREEN;
      return (
        `<circle cx="${x}" cy="${y}" r="${r}" fill="none" stroke="${GREEN}" stroke-width="${Math.max(2.4, r * 0.2)}"/>` +
        `<circle cx="${x}" cy="${y}" r="${r * 0.5}" fill="none" stroke="${accent}" stroke-width="${Math.max(1.6, r * 0.13)}"/>` +
        `<circle cx="${x}" cy="${y}" r="${r * 0.18}" fill="${accent}"/>`
      );
    })
    .join('');
}

function bambooStick(x: number, y: number, h: number, w: number, color: string): string {
  const top = y - h / 2;
  return (
    `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${h}" rx="${w / 2}" fill="${color}"/>` +
    `<rect x="${x - w / 2 - 1.5}" y="${y - 1.6}" width="${w + 3}" height="3.2" rx="1.6" fill="${color}"/>` +
    `<line x1="${x}" y1="${top + 4}" x2="${x}" y2="${top + h - 4}" stroke="${IVORY}" stroke-width="1.4" stroke-opacity="0.75"/>`
  );
}

function bamboo(rank: number): string {
  if (rank === 1) {
    return bambooStick(50, 65, 84, 18, GREEN) + `<circle cx="50" cy="20" r="7" fill="${RED}"/>`;
  }
  const tall = rank <= 6 ? 40 : 28;
  const w = rank >= 8 ? 9 : 10.5;
  return (BAM_LAYOUTS[rank] ?? [])
    .map(([x, y], i) => {
      const accent = (rank === 5 && i === 2) || (rank === 7 && i === 0) || (rank === 9 && i % 3 === 1);
      return bambooStick(x, y, tall, w, accent ? RED : GREEN);
    })
    .join('');
}

function character(rank: number): string {
  return (
    `<text x="50" y="58" text-anchor="middle" font-family="'${TILE_GLYPH_FONT}', 'Noto Serif SC', serif" font-weight="900" font-size="44" fill="${INK}">${NUMERALS[rank]}</text>` +
    `<text x="50" y="110" text-anchor="middle" font-family="'${TILE_GLYPH_FONT}', 'Noto Serif SC', serif" font-weight="900" font-size="46" fill="${RED}">萬</text>`
  );
}

function glyph(text: string, color: string, size: number, baseline: number): string {
  return `<text x="50" y="${baseline}" text-anchor="middle" font-family="'${TILE_GLYPH_FONT}', 'Noto Serif SC', serif" font-weight="900" font-size="${size}" fill="${color}">${text}</text>`;
}

function soap(): string {
  return (
    `<rect x="20" y="22" width="60" height="86" rx="6" fill="none" stroke="${BLUE}" stroke-width="5"/>` +
    `<rect x="29" y="31" width="42" height="68" rx="3" fill="none" stroke="${BLUE}" stroke-width="2.2"/>`
  );
}

function flower(): string {
  const petals = [0, 72, 144, 216, 288]
    .map((deg) => `<ellipse cx="50" cy="35" rx="9" ry="15" fill="#D9475A" transform="rotate(${deg} 50 50)"/>`)
    .join('');
  return (
    `<path d="M50 62 C48 80 46 92 40 110" stroke="${GREEN}" stroke-width="4" fill="none" stroke-linecap="round"/>` +
    `<path d="M47 86 C36 80 28 82 22 90 C32 94 41 93 47 86 Z" fill="${GREEN}"/>` +
    `<path d="M45 98 C56 90 66 92 72 98 C62 104 52 104 45 98 Z" fill="${GREEN}"/>` +
    `<g transform="translate(0 -4)">${petals}<circle cx="50" cy="50" r="7.5" fill="#F2C14E"/></g>`
  );
}

function joker(): string {
  return (
    `<path d="M50 24 L56 40 L73 40 L59 50 L64 66 L50 56 L36 66 L41 50 L27 40 L44 40 Z" fill="${MAGENTA}"/>` +
    `<text x="50" y="100" text-anchor="middle" font-family="Anton, Impact, sans-serif" font-size="25" letter-spacing="1" fill="${MAGENTA}">JOKER</text>`
  );
}

function cornerIndex(face: TileFace): string {
  let label = '';
  if (face.kind === 'suited') label = String(face.rank);
  else if (face.kind === 'wind') label = face.wind.charAt(0);
  else if (face.kind === 'flower') label = 'F';
  else if (face.kind === 'dragon' && face.color === 'WHITE') label = '0';
  if (!label) return '';
  return `<text x="10" y="20" font-family="system-ui, -apple-system, sans-serif" font-weight="700" font-size="14" fill="#8A8F86">${label}</text>`;
}
