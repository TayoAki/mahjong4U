// Design tokens from docs/handoff/02-design/design-tokens.json.

export const colors = {
  canvas: '#FAF7F0',
  ink: '#173F36',
  primary: '#99028F',
  primaryPressed: '#7D0275',
  surface: '#FFFFFF',
  sage: '#EEF1E7',
  pink: '#FCE8F3',
  muted: '#5E675F',
  border: '#DEDCD4',
  felt: '#1D4B3E',
  feltDark: '#163B31',
  feltText: '#F4EFE3',
  wood: '#D9B98A',
  woodDark: '#B88F5A',
  danger: '#A3221D',
  warnBg: '#FFF4DC',
  warnInk: '#6B4B00',
  captionBlue: '#1B4F9C',
  gold: '#F2C14E',
  online: '#2E8B57',
  chip: '#ECEBE4',
} as const;

/** Family names registered by @expo-google-fonts through expo-font. */
export const fonts = {
  serif: 'DMSerifDisplay_400Regular',
  caption: 'Anton_400Regular',
} as const;

export const radius = { card: 20, button: 16, chip: 14, tile: 8 } as const;
export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 24 } as const;

/** Suit colours used when printing card patterns, like the colours on a printed card. */
export const SUIT_COLORS = { a: '#164D3F', b: '#B62226', c: '#1B4F9C' } as const;
