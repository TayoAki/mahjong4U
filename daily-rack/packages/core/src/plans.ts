import { FEATURES } from './features.ts';

// What's free and what comes with Daily Rack Plus, in one place for the server (which
// enforces it) and the app (which explains it). Learning, the daily rack and playing with
// friends stay free: new players should never hit a paywall before they can play.

export const PLUS = {
  name: 'Daily Rack Plus',
  /** RevenueCat entitlement that unlocks Plus. */
  entitlement: 'plus',
  /** Cards that need Plus, except for a few free hands a day against the computer. */
  premiumCards: ['card-2026'] as readonly string[],
  /** Free hands a day on a premium card, at a table with only computer players. */
  freeCardHandsPerDay: 3,
  /** Store product ids (the App Store ids; Google Play uses product:base-plan). */
  products: { monthly: 'dailyrack_plus_monthly', annual: 'dailyrack_plus_annual' },
} as const;

export type PlusFeature = 'premium-card' | 'host-premium-card' | 'ranked';

export function isPremiumCard(cardId: string | null | undefined): boolean {
  return Boolean(cardId && PLUS.premiumCards.includes(cardId));
}

/** What a player gets free, and what Plus adds, as the paywall shows it. */
export const FREE_FEATURES: readonly string[] = [
  ...(FEATURES.dailyRack ? [`Today’s rack every day, with your streak${FEATURES.clips ? ' and clips' : ''}`] : []),
  'Every lesson with Pip',
  'Unlimited games on the house card',
  'Games with friends, chat, Game Night and voice chat',
  'Quick matches',
  `${PLUS.freeCardHandsPerDay} hands a day on the 2026 card`,
];

export const PLUS_FEATURES = [
  'Play the 2026 card as much as you like',
  'Host friends on the 2026 card (they play free)',
  'Ranked games, your rating and the leaderboard',
  'Support a small, independent mahjong app',
] as const;

/** Why a feature needs Plus, in plain words for an error or a paywall headline. */
export const PLUS_REASONS: Record<PlusFeature, string> = {
  'premium-card': `You’ve played your ${PLUS.freeCardHandsPerDay} free hands on the 2026 card today. Plus makes it unlimited, or come back tomorrow for more.`,
  'host-premium-card': 'Hosting friends on the 2026 card comes with Plus. Your friends join free.',
  ranked: 'Ranked games, ratings and the leaderboard come with Plus. Quick matches are free.',
};
