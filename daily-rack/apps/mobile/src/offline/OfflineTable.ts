import { shortLabel } from '@daily-rack/core';
import {
  HOUSE_CARD,
  SEAT_WINDS,
  applyAction,
  botAction,
  faceOf,
  newGame,
  pendingSeats,
  playerView,
  rng,
  type Action,
  type BotLevel,
  type GameEvent,
  type GameState,
  type Seat,
} from '@daily-rack/core/mahjong';
import type { LogEntry, OfflineResult, TablePayload } from '../lib/api.ts';
import { newKey } from '../lib/storage.ts';

// A game against computer players that runs entirely on the device, for when there's no
// connection (or you'd just rather not use one). It plays by the same engine as the server
// and hands the game screen the same shape of data, so the table looks and works the same.

const card = HOUSE_CARD;
const BOT_NAMES = ['Mabel', 'Rosie', 'Dot', 'Hazel'];
const GROUP_NAMES: Record<number, string> = { 3: 'pung', 4: 'kong', 5: 'quint', 6: 'sextet' };
const LOG_LIMIT = 80;

export interface OfflineSettings {
  level: BotLevel;
  skipCharleston: boolean;
}

/** Everything needed to pick a game back up later. You always sit at position 0. */
export interface OfflineSave {
  id: string;
  gameId: string;
  handNumber: number;
  dealer: number;
  scores: number[];
  settings: OfflineSettings;
  state: GameState;
  version: number;
  log: LogEntry[];
  /** Whether this hand's result has been queued for your stats. */
  recorded: boolean;
}

const engineSeat = (position: number, dealer: number) => ((position - dealer + 4) % 4) as Seat;
const positionOf = (seat: Seat, dealer: number) => (seat + dealer) % 4;
const nameAt = (position: number, me: string) => (position === 0 ? me : `${BOT_NAMES[position]} (computer)`);
const entry = (position: number | null, text: string, event: LogEntry['event']): LogEntry => ({ at: new Date().toISOString(), position, text, event });

function deal(save: Omit<OfflineSave, 'state' | 'version' | 'log' | 'gameId' | 'recorded'>, me: string): OfflineSave {
  const random = rng((Date.now() ^ (save.handNumber * 7919)) >>> 0);
  const state = newGame(card, { seed: Math.floor(random() * 2 ** 31), secondCharleston: true, courtesyPass: true, skipCharleston: save.settings.skipCharleston });
  return {
    ...save,
    gameId: newKey(),
    state,
    version: 1,
    recorded: false,
    log: [entry(null, `Hand ${save.handNumber}: ${nameAt(save.dealer, me)} is East.`, { type: 'play-started' })],
  };
}

export function newOfflineGame(settings: OfflineSettings, me: string): OfflineSave {
  return deal({ id: newKey(), handNumber: 1, dealer: 0, scores: [0, 0, 0, 0], settings }, me);
}

export function nextOfflineHand(save: OfflineSave, me: string): OfflineSave {
  const handNumber = save.handNumber + 1;
  return deal({ id: save.id, handNumber, dealer: (handNumber - 1) % 4, scores: save.scores, settings: save.settings }, me);
}

function describe(save: OfflineSave, event: GameEvent, me: string): LogEntry {
  const pos = 'seat' in event ? positionOf(event.seat, save.dealer) : null;
  const who = pos === null ? '' : nameAt(pos, me);
  const { seat: _seat, ...rest } = event as GameEvent & { seat?: Seat };
  const publicEvent = { ...rest, ...(pos === null ? {} : { position: pos }) } as LogEntry['event'];
  const text = (() => {
    switch (event.type) {
      case 'charleston':
        return `Charleston: everyone passed ${event.direction}.`;
      case 'second-charleston':
        return event.happening ? 'Everyone agreed to a second Charleston.' : 'No second Charleston this hand.';
      case 'courtesy':
        return 'Courtesy pass done.';
      case 'play-started':
        return 'East discards first.';
      case 'draw':
        return `${who} drew.`;
      case 'discard':
        return `${who} discarded ${shortLabel(faceOf(event.tile))}.`;
      case 'call':
        return `${who} called ${shortLabel(faceOf(event.tile))} for a ${GROUP_NAMES[event.size] ?? `group of ${event.size}`}.`;
      case 'exchange':
        return `${who} swapped ${shortLabel(faceOf(event.tile))} for a joker.`;
      case 'mahjong':
        return `${who} declared Mahjong!`;
      case 'dead-hand':
        return `${who}'s hand is dead: ${event.reason.text}.`;
      case 'wall-game':
        return 'Wall game: nobody won this hand.';
    }
  })();
  return { at: new Date().toISOString(), position: pos, text, event: publicEvent };
}

function apply(save: OfflineSave, seat: Seat, action: Action, me: string): OfflineSave {
  const { state, events } = applyAction(card, save.state, seat, action);
  const next: OfflineSave = { ...save, state, version: save.version + 1, log: [...save.log, ...events.map((e) => describe(save, e, me))].slice(-LOG_LIMIT) };
  if (state.phase.kind === 'ended' && state.result) {
    next.scores = save.scores.map((score, position) => score + (state.result!.payments[engineSeat(position, save.dealer)] ?? 0));
  }
  return next;
}

/** Your move. Throws the engine's error if the move isn't allowed. */
export function actOffline(save: OfflineSave, action: Action, me: string): OfflineSave {
  return apply(save, engineSeat(0, save.dealer), action, me);
}

/** The next computer move that's due, or null when it's your turn (or the hand is over). */
export function botStep(save: OfflineSave, me: string): OfflineSave | null {
  if (save.state.phase.kind === 'ended') return null;
  const mine = engineSeat(0, save.dealer);
  const seat = pendingSeats(save.state).find((s) => s !== mine);
  if (seat === undefined) return null;
  const random = rng((save.version * 2654435761) >>> 0);
  return apply(save, seat, botAction(card, save.state, seat, save.settings.level, random), me);
}

/** Your result for this hand, for your stats once you're back online. */
export function offlineResult(save: OfflineSave): OfflineResult | null {
  const result = save.state.result;
  if (!result) return null;
  const mine = engineSeat(0, save.dealer);
  const won = result.winner === mine;
  return {
    id: save.gameId,
    won,
    selfDrawn: won && result.from === null,
    jokerless: won && result.jokerless,
    wallGame: result.kind === 'wall',
    fed: result.from === mine,
    handId: won ? result.handId : null,
    value: won ? result.value : 0,
    payment: result.payments[mine] ?? 0,
    playedAt: new Date().toISOString(),
  };
}

/** The same shape the server sends for a table, so the game screen can draw it. */
export function offlinePayload(save: OfflineSave, me: string): TablePayload {
  const ended = save.state.phase.kind === 'ended';
  return {
    table: {
      id: `offline-${save.id}`,
      code: '',
      mode: 'turn',
      status: ended ? 'between' : 'playing',
      hostId: 'me',
      handNumber: save.handNumber,
      dealer: save.dealer,
      settings: { secondCharleston: true, courtesyPass: true, skipCharleston: save.settings.skipCharleston },
      scores: save.scores,
      nightId: null,
      kind: 'private',
      ranked: false,
      cardId: card.id,
      seats: [0, 1, 2, 3].map((position) => ({
        position,
        kind: position === 0 ? ('human' as const) : ('bot' as const),
        principalId: position === 0 ? 'me' : null,
        reservedFor: null,
        name: nameAt(position, me),
        color: position === 0 ? '#99028F' : '#667069',
        botLevel: position === 0 ? null : save.settings.level,
        online: position === 0,
        wind: SEAT_WINDS[engineSeat(position, save.dealer)]!,
      })),
    },
    mySeat: 0,
    conversationId: '',
    game: {
      id: save.gameId,
      version: save.version,
      handNumber: save.handNumber,
      deadline: null,
      positions: [0, 1, 2, 3].map((s) => positionOf(s as Seat, save.dealer)),
      view: playerView(card, save.state, engineSeat(0, save.dealer)),
      log: save.log,
    },
  };
}
