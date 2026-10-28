import {
  SEAT_WINDS,
  SIMULTANEOUS_ACTIONS,
  TWO_PLAYER_WINDS,
  applyAction,
  applyTwoPlayerAction,
  botAction,
  newGame,
  newTwoPlayerGame,
  pendingSeats,
  phaseKey,
  playerView,
  twoPlayerBotAction,
  twoPlayerPendingSeats,
  twoPlayerPhaseKey,
  twoPlayerView,
  type Action,
  type BotLevel,
  type Card,
  type GameEvent,
  type GameState,
  type PlayerView,
  type Seat,
  type TwoPlayerAction,
  type TwoPlayerEvent,
  type TwoPlayerState,
  type TwoPlayerView,
  type TwoSeat,
} from '@daily-rack/core/mahjong';

// The kinds of game a table can play: four seats (the classic game, with three seats for
// friends or computer players) or two-player, where each player builds two hands at once.
// Tables reach the engine through one of these, so the lobby, timers, computer players,
// pushes and results work the same way for both.

export type TableVariant = 'four' | 'two-player';
export const TABLE_VARIANTS: readonly TableVariant[] = ['four', 'two-player'];

export type AnyState = GameState | TwoPlayerState;
export type AnyAction = Action | TwoPlayerAction;
export type AnyEvent = GameEvent | TwoPlayerEvent;

export interface TableSettingsInput {
  secondCharleston: boolean;
  courtesyPass: boolean;
  skipCharleston: boolean;
}

export interface TableEngine {
  /** Seats at the table, the host's included. */
  seats: number;
  /** Wind of each engine seat, East first. */
  winds: readonly string[];
  /** What a game is called at this table: "hand" at four seats, "game" at two. */
  unit: 'hand' | 'game';
  deal(card: Card, seed: number, settings: TableSettingsInput): AnyState;
  apply(card: Card, state: AnyState, seat: Seat, action: AnyAction): { state: AnyState; events: AnyEvent[] };
  pending(state: AnyState): Seat[];
  phaseKey(state: AnyState): string;
  /** Moves everyone makes at once, which other players' moves don't make stale. */
  simultaneous(action: AnyAction): boolean;
  view(card: Card, state: AnyState, seat: Seat): PlayerView | TwoPlayerView;
  bot(card: Card, state: AnyState, seat: Seat, level: BotLevel, random: () => number): AnyAction;
}

const four: TableEngine = {
  seats: 4,
  winds: SEAT_WINDS,
  unit: 'hand',
  deal: (card, seed, settings) => newGame(card, { seed, ...settings }),
  apply: (card, state, seat, action) => applyAction(card, state as GameState, seat, action as Action),
  pending: (state) => pendingSeats(state as GameState),
  phaseKey: (state) => phaseKey((state as GameState).phase),
  simultaneous: (action) => SIMULTANEOUS_ACTIONS.has(action.type as Action['type']),
  view: (card, state, seat) => playerView(card, state as GameState, seat),
  bot: (card, state, seat, level, random) => botAction(card, state as GameState, seat, level, random),
};

const twoPlayer: TableEngine = {
  seats: 2,
  winds: TWO_PLAYER_WINDS,
  unit: 'game',
  // No Charleston: the house rules ignore the Charleston settings.
  deal: (card, seed) => newTwoPlayerGame(card, { seed }),
  apply: (card, state, seat, action) => applyTwoPlayerAction(card, state as TwoPlayerState, seat as TwoSeat, action as TwoPlayerAction),
  pending: (state) => twoPlayerPendingSeats(state as TwoPlayerState),
  phaseKey: (state) => twoPlayerPhaseKey((state as TwoPlayerState).phase),
  simultaneous: () => false,
  view: (card, state, seat) => twoPlayerView(card, state as TwoPlayerState, seat as TwoSeat),
  // Computer players work from the same view a person gets.
  bot: (card, state, seat, level, random) => twoPlayerBotAction(card, twoPlayerView(card, state as TwoPlayerState, seat as TwoSeat), level, random),
};

export const ENGINES: Record<TableVariant, TableEngine> = { four, 'two-player': twoPlayer };
