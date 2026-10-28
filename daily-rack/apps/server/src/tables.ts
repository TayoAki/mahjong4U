import { randomBytes, randomUUID } from 'node:crypto';
import { shortLabel } from '@daily-rack/core';
import { GameError, cardById, faceOf, rng, type BotLevel, type Card, type GameResult, type Seat } from '@daily-rack/core/mahjong';
import { isBlockedEitherWay } from './blocks.ts';
import { transaction, type Db } from './db.ts';
import type { Notifier } from './push.ts';
import type { Hub } from './realtime.ts';
import { conversationFor, ensureProfile } from './social.ts';
import { BOT_RATING, ratingOf, recordAbandon, recordHand } from './stats.ts';
import { ENGINES, type AnyAction, type AnyEvent, type AnyState, type TableEngine, type TableVariant } from './variants.ts';

// Online tables: fixed seats filled by friends or computer players, four of them, or two
// for a two-player game (see variants.ts). Each hand is a fresh engine game; the dealer
// moves one seat to the right every hand.

export type TableMode = 'live' | 'turn';
export type TableStatus = 'lobby' | 'playing' | 'between' | 'closed';
/** Private tables are set up by a host; public ones are matched with strangers. */
export type TableKind = 'private' | 'public';

export interface SeatSpec {
  principalId: string | null;
  bot: BotLevel | null;
  /** An open seat held for a specific friend until they join. */
  reservedFor: string | null;
}

export interface TableSettings {
  secondCharleston: boolean;
  courtesyPass: boolean;
  skipCharleston: boolean;
}

interface TableRow {
  id: string;
  code: string;
  host_id: string;
  mode: TableMode;
  status: TableStatus;
  seats: string;
  settings: string;
  scores: string;
  hand_number: number;
  night_id: string | null;
  kind: TableKind;
  ranked: number;
  card_id: string;
  variant: TableVariant;
  created_at: string;
  updated_at: string;
}

interface GameRow {
  id: string;
  table_id: string;
  hand_number: number;
  dealer: number;
  state: string;
  version: number;
  status: 'playing' | 'ended';
  deadline: string | null;
  log: string;
}

export interface LogEntry {
  at: string;
  position: number | null;
  text: string;
  event: (Omit<AnyEvent, 'seat'> | { type: 'timeout' }) & { position?: number };
}

export class TableError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export interface TableServiceOptions {
  now: () => Date;
  /** Pause before each computer move at live tables, so humans can follow along. */
  botDelayMs: number;
  /** Seconds a human has at a live table before a computer player moves for them. */
  liveTimeouts: { pass: number; turn: number; claim: number };
  /** Push notifications for invites and "your move" at turn-based tables. */
  notifier?: Notifier;
}

export interface SeatInput {
  type: 'bot' | 'open' | 'friend';
  level?: BotLevel;
  friendId?: string;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const LOG_LIMIT = 80;
const GROUP_NAMES: Record<number, string> = { 3: 'pung', 4: 'kong', 5: 'quint', 6: 'sextet' };

export class TableService {
  private timers = new Map<string, ReturnType<typeof setTimeout>>();
  private random = rng(Date.now() & 0xffffffff);
  /** Set by the app: throws if a hand on this card can't be dealt for this host (Plus rules). */
  dealGate?: (hostId: string, cardId: string, vsComputer: boolean) => void;

  constructor(
    private db: Db,
    private hub: Hub,
    private options: TableServiceOptions,
  ) {}

  // -------------------------------------------------------------------------
  // Lobby

  create(
    hostId: string,
    input: { mode: TableMode; seats: SeatInput[]; settings?: Partial<TableSettings>; nightId?: string | null; cardId?: string; variant?: TableVariant },
  ): string {
    const active = this.db.prepare(`SELECT COUNT(*) AS n FROM tables WHERE host_id = ? AND status != 'closed' AND kind = 'private'`).get(hostId) as { n: number };
    if (Number(active.n) >= 20) throw new TableError(409, 'too_many_tables', 'Finish or close a table before starting another.');
    const variant = input.variant ?? 'four';
    if (input.seats.length !== ENGINES[variant].seats - 1) {
      throw new TableError(400, 'bad_seats', variant === 'two-player' ? 'Choose who sits across from you.' : 'Choose who sits in the other three seats.');
    }
    const seats: SeatSpec[] = [{ principalId: hostId, bot: null, reservedFor: null }];
    for (const s of input.seats) {
      if (s.type === 'bot') seats.push({ principalId: null, bot: s.level ?? 'normal', reservedFor: null });
      else if (s.type === 'friend' && s.friendId) seats.push({ principalId: null, bot: null, reservedFor: s.friendId });
      else seats.push({ principalId: null, bot: null, reservedFor: null });
    }
    // Premium cards need Plus (or a free hand left against the computer) before anything is saved.
    this.dealGate?.(hostId, cardById(input.cardId).id, seats.slice(1).every((s) => s.bot));
    const settings: TableSettings = {
      secondCharleston: input.settings?.secondCharleston ?? true,
      courtesyPass: input.settings?.courtesyPass ?? true,
      skipCharleston: input.settings?.skipCharleston ?? false,
    };
    const id = randomUUID();
    const now = this.options.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO tables (id, code, host_id, mode, status, seats, settings, scores, hand_number, night_id, card_id, variant, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'lobby', ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        this.uniqueCode(),
        hostId,
        input.mode,
        JSON.stringify(seats),
        JSON.stringify(settings),
        JSON.stringify(seats.map(() => 0)),
        input.nightId ?? null,
        cardById(input.cardId).id,
        variant,
        now,
        now,
      );
    conversationFor(this.db, 'table', id, this.options.now());
    // Reserved friends hear about the invite straight away.
    for (const s of seats) if (s.reservedFor) this.hub.send(s.reservedFor, { type: 'table', tableId: id, payload: { invited: true } });
    this.invite(id, seats.flatMap((s) => (s.reservedFor ? [s.reservedFor] : [])));
    if (seats.every((s) => s.principalId || s.bot)) this.start(id, hostId);
    return id;
  }

  /**
   * A matched live table for strangers: the people found (in a random order, so nobody is
   * always East), with computer players in any empty seats. The hand starts straight away.
   */
  createPublic(humans: string[], ranked: boolean, fill: BotLevel = 'normal'): string {
    const order = [...humans].sort(() => this.random() - 0.5);
    const seats: SeatSpec[] = [0, 1, 2, 3].map((i) => (order[i] ? { principalId: order[i]!, bot: null, reservedFor: null } : { principalId: null, bot: fill, reservedFor: null }));
    const settings: TableSettings = { secondCharleston: true, courtesyPass: true, skipCharleston: false };
    const id = randomUUID();
    const now = this.options.now().toISOString();
    this.db
      .prepare(
        `INSERT INTO tables (id, code, host_id, mode, status, seats, settings, scores, hand_number, night_id, kind, ranked, created_at, updated_at)
         VALUES (?, ?, ?, 'live', 'lobby', ?, ?, '[0,0,0,0]', 0, NULL, 'public', ?, ?, ?)`,
      )
      .run(id, this.uniqueCode(), order[0]!, JSON.stringify(seats), JSON.stringify(settings), ranked ? 1 : 0, now, now);
    conversationFor(this.db, 'table', id, this.options.now());
    this.dealHand(this.row(id), 1);
    return id;
  }

  /** The matched game a player is still in the middle of, if any. */
  activePublicFor(principalId: string): string | null {
    const rows = this.db.prepare(`SELECT id, seats FROM tables WHERE kind = 'public' AND status = 'playing' AND seats LIKE ?`).all(`%${principalId}%`) as { id: string; seats: string }[];
    return rows.find((r) => (JSON.parse(r.seats) as SeatSpec[]).some((s) => s.principalId === principalId))?.id ?? null;
  }

  /** Voice chat is for private tables, between the people seated there. */
  voiceAllowed(tableId: string, principalId: string): boolean {
    const row = this.db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId) as TableRow | undefined;
    return Boolean(row && row.kind === 'private' && row.status !== 'closed' && this.seatsOf(row).some((s) => s.principalId === principalId));
  }

  seatedPeople(tableId: string): string[] {
    const row = this.db.prepare('SELECT seats FROM tables WHERE id = ?').get(tableId) as { seats: string } | undefined;
    return row ? (JSON.parse(row.seats) as SeatSpec[]).flatMap((s) => (s.principalId ? [s.principalId] : [])) : [];
  }

  /** The card this table plays with. */
  private cardOf(row: TableRow): Card {
    return cardById(row.card_id);
  }

  /** The rules this table plays by. */
  private engineOf(row: TableRow): TableEngine {
    return ENGINES[row.variant] ?? ENGINES.four;
  }

  private uniqueCode(): string {
    for (;;) {
      const code = [...randomBytes(6)].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
      if (!this.db.prepare('SELECT 1 FROM tables WHERE code = ?').get(code)) return code;
    }
  }

  private row(tableId: string): TableRow {
    const row = this.db.prepare('SELECT * FROM tables WHERE id = ?').get(tableId) as TableRow | undefined;
    if (!row) throw new TableError(404, 'table_not_found', 'That table does not exist.');
    return row;
  }

  idForCode(code: string): string {
    const row = this.db.prepare('SELECT id FROM tables WHERE code = ?').get(code.trim().toUpperCase()) as { id: string } | undefined;
    if (!row) throw new TableError(404, 'table_not_found', 'No table has that code.');
    return row.id;
  }

  private seatsOf(row: TableRow): SeatSpec[] {
    return JSON.parse(row.seats) as SeatSpec[];
  }

  private saveSeats(tableId: string, seats: SeatSpec[]) {
    this.db.prepare('UPDATE tables SET seats = ?, updated_at = ? WHERE id = ?').run(JSON.stringify(seats), this.options.now().toISOString(), tableId);
  }

  join(tableId: string, principalId: string): number {
    const row = this.row(tableId);
    const seats = this.seatsOf(row);
    const existing = seats.findIndex((s) => s.principalId === principalId);
    if (existing !== -1) return existing;
    if (row.status === 'closed') throw new TableError(409, 'table_closed', 'This table has closed.');
    if (row.kind === 'public') throw new TableError(403, 'public_table', 'This is a matched game. Find your own match from the Play tab.');
    if (seats.some((s) => s.principalId && isBlockedEitherWay(this.db, principalId, s.principalId))) {
      throw new TableError(403, 'blocked', 'You can’t join this table.');
    }
    // A held seat first, then any open seat; once a game is running, a bot seat can be taken over.
    let position = seats.findIndex((s) => s.reservedFor === principalId && !s.principalId);
    if (position === -1) position = seats.findIndex((s) => !s.principalId && !s.bot && !s.reservedFor);
    if (position === -1 && row.status !== 'lobby') position = seats.findIndex((s) => !s.principalId && s.bot);
    if (position === -1) throw new TableError(409, 'table_full', 'Every seat at this table is taken.');
    seats[position] = { principalId, bot: null, reservedFor: null };
    this.saveSeats(tableId, seats);
    this.broadcast(tableId);
    return position;
  }

  leave(tableId: string, principalId: string): void {
    const row = this.row(tableId);
    const seats = this.seatsOf(row);
    const position = seats.findIndex((s) => s.principalId === principalId);
    if (position === -1) {
      // Turning down an invitation: the held seat opens up for anyone with the code.
      const held = seats.findIndex((s) => s.reservedFor === principalId);
      if (held === -1) return;
      seats[held] = { ...seats[held]!, reservedFor: null };
      this.saveSeats(tableId, seats);
      this.broadcast(tableId);
      return;
    }
    if (row.status === 'lobby') {
      if (row.host_id === principalId) return this.close(tableId, principalId);
      seats[position] = { principalId: null, bot: null, reservedFor: null };
    } else {
      // Leaving a ranked hand before it ends counts as finishing below everyone else.
      const game = this.currentGame(tableId);
      if (row.ranked && game?.status === 'playing') {
        const others = seats.filter((_, p) => p !== position).map((s) => ({ rating: s.principalId ? ratingOf(this.db, s.principalId).rating : BOT_RATING[s.bot ?? 'normal'] }));
        recordAbandon(this.db, game.id, row.card_id, principalId, others, this.options.now());
      }
      // Mid-game a computer player takes over the seat so nobody else's game breaks.
      seats[position] = { principalId: null, bot: 'normal', reservedFor: null };
    }
    this.saveSeats(tableId, seats);
    // A table with nobody left (a finished game against the computer) closes.
    if (!seats.some((s) => s.principalId)) {
      this.db.prepare(`UPDATE tables SET status = 'closed', updated_at = ? WHERE id = ?`).run(this.options.now().toISOString(), tableId);
      this.clearTimer(tableId);
      this.broadcast(tableId);
      return;
    }
    this.broadcast(tableId);
    this.pump(tableId);
  }

  setSeat(tableId: string, hostId: string, position: number, input: SeatInput): void {
    const row = this.row(tableId);
    if (row.host_id !== hostId) throw new TableError(403, 'not_host', 'Only the host can change seats.');
    if (row.status !== 'lobby') throw new TableError(409, 'already_started', 'Seats are set once the game starts.');
    const seats = this.seatsOf(row);
    if (!Number.isInteger(position) || position < 1 || position >= seats.length) throw new TableError(400, 'bad_seat', seats.length === 2 ? 'Choose seat 1.' : 'Choose seat 1, 2 or 3.');
    if (seats[position]!.principalId) throw new TableError(409, 'seat_taken', 'Someone is already sitting there.');
    const before = seats[position]!.reservedFor;
    seats[position] =
      input.type === 'bot'
        ? { principalId: null, bot: input.level ?? 'normal', reservedFor: null }
        : { principalId: null, bot: null, reservedFor: input.type === 'friend' ? (input.friendId ?? null) : null };
    this.saveSeats(tableId, seats);
    this.broadcast(tableId);
    const held = seats[position]!.reservedFor;
    if (held && held !== before) this.invite(tableId, [held]);
  }

  /** A push to friends the host saved a seat for. */
  private invite(tableId: string, friendIds: string[]) {
    if (friendIds.length === 0) return;
    const row = this.row(tableId);
    const host = ensureProfile(this.db, row.host_id, this.options.now()).name;
    this.options.notifier?.notify(friendIds, {
      category: 'invites',
      title: 'Table invite',
      body: `${host} saved you a seat at a ${row.mode === 'live' ? 'live' : 'turn-based'} ${row.variant === 'two-player' ? 'two-player game' : 'table'}.`,
      url: `/table/${tableId}`,
    });
  }

  close(tableId: string, principalId: string): void {
    const row = this.row(tableId);
    if (row.host_id !== principalId) throw new TableError(403, 'not_host', 'Only the host can close the table.');
    this.db.prepare(`UPDATE tables SET status = 'closed', updated_at = ? WHERE id = ?`).run(this.options.now().toISOString(), tableId);
    this.clearTimer(tableId);
    this.broadcast(tableId);
  }

  // -------------------------------------------------------------------------
  // Hands

  start(tableId: string, principalId: string): void {
    const row = this.row(tableId);
    if (row.status !== 'lobby') throw new TableError(409, 'already_started', 'This table has already started.');
    if (row.host_id !== principalId) throw new TableError(403, 'not_host', 'Only the host can start the game.');
    const seats = this.seatsOf(row);
    if (!seats.every((s) => s.principalId || s.bot)) {
      throw new TableError(409, 'seats_open', 'Fill every seat with a friend or a computer player first.');
    }
    this.dealHand(row, 1);
  }

  nextHand(tableId: string, principalId: string): void {
    const row = this.row(tableId);
    if (!this.seatsOf(row).some((s) => s.principalId === principalId)) throw new TableError(403, 'not_seated', 'Only players at the table can deal.');
    if (row.status !== 'between') throw new TableError(409, 'hand_in_progress', 'Finish this hand first.');
    if (row.kind === 'public') throw new TableError(409, 'one_hand', 'Matched games are one hand. Find another match from the Play tab.');
    this.dealHand(row, row.hand_number + 1);
  }

  private dealHand(row: TableRow, handNumber: number) {
    if (row.kind === 'private') this.dealGate?.(row.host_id, row.card_id, this.seatsOf(row).slice(1).every((s) => s.bot));
    const settings = JSON.parse(row.settings) as TableSettings;
    const engine = this.engineOf(row);
    const dealer = (handNumber - 1) % engine.seats;
    const state = engine.deal(this.cardOf(row), Math.floor(this.random() * 2 ** 31), settings);
    const opening = engine.unit === 'game' ? `Game ${handNumber}: ${this.nameAt(row, dealer)} is East and starts.` : `Hand ${handNumber}: ${this.nameAt(row, dealer)} is East.`;
    const now = this.options.now().toISOString();
    transaction(this.db, () => {
      this.db
        .prepare(
          `INSERT INTO games (id, table_id, hand_number, dealer, state, version, status, deadline, log, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, 1, 'playing', NULL, ?, ?, ?)`,
        )
        .run(randomUUID(), row.id, handNumber, dealer, JSON.stringify(state), JSON.stringify([this.entry(null, opening, { type: 'play-started' })]), now, now);
      this.db.prepare(`UPDATE tables SET status = 'playing', hand_number = ?, updated_at = ? WHERE id = ?`).run(handNumber, now, row.id);
    });
    this.broadcast(row.id);
    this.pump(row.id);
  }

  private currentGame(tableId: string): GameRow | null {
    return (this.db.prepare('SELECT * FROM games WHERE table_id = ? ORDER BY hand_number DESC LIMIT 1').get(tableId) as GameRow | undefined) ?? null;
  }

  /** A human move. Throws TableError or GameError when the move is not allowed. */
  act(tableId: string, principalId: string, action: AnyAction, expectedVersion?: number, expectedPhase?: string): void {
    const row = this.row(tableId);
    const engine = this.engineOf(row);
    const position = this.seatsOf(row).findIndex((s) => s.principalId === principalId);
    if (position === -1) throw new TableError(403, 'not_seated', 'You are not playing at this table.');
    const game = this.currentGame(tableId);
    if (!game || game.status !== 'playing') throw new TableError(409, 'no_hand', 'There is no hand in play.');
    if (expectedVersion !== undefined && expectedVersion !== game.version) {
      // In a step everyone takes at once, other players' moves don't make yours stale,
      // as long as it is still the same step (the same pass of the same Charleston).
      const samePhase = engine.simultaneous(action) && expectedPhase === engine.phaseKey(JSON.parse(game.state) as AnyState);
      if (!samePhase) throw new TableError(409, 'stale', 'The table moved on. Here is the latest.');
    }
    const seat = this.engineSeat(position, game.dealer, engine.seats);
    // They're back, so the next time the table waits on them deserves a nudge again.
    this.options.notifier?.forget(principalId, `turn:${tableId}`);
    this.apply(row, game, seat, action);
  }

  private apply(row: TableRow, game: GameRow, seat: Seat, action: AnyAction, notes: LogEntry[] = []) {
    const engine = this.engineOf(row);
    const state = JSON.parse(game.state) as AnyState;
    const { state: next, events } = engine.apply(this.cardOf(row), state, seat, action);
    const now = this.options.now().toISOString();
    const log = [...(JSON.parse(game.log) as LogEntry[]), ...notes, ...events.map((e) => this.describe(row, game.dealer, e, now))].slice(-LOG_LIMIT);
    const ended = next.phase.kind === 'ended';
    transaction(this.db, () => {
      const updated = this.db
        .prepare(`UPDATE games SET state = ?, version = version + 1, status = ?, deadline = NULL, log = ?, updated_at = ? WHERE id = ? AND version = ?`)
        .run(JSON.stringify(next), ended ? 'ended' : 'playing', JSON.stringify(log), now, game.id, game.version);
      if (Number(updated.changes) !== 1) throw new TableError(409, 'stale', 'The table moved on. Try again.');
      if (ended && next.result) {
        const scores = JSON.parse(row.scores) as number[];
        next.result.payments.forEach((p, s) => {
          const position = this.position(s as Seat, game.dealer, engine.seats);
          scores[position] = (scores[position] ?? 0) + p;
        });
        this.db.prepare(`UPDATE tables SET status = 'between', scores = ?, updated_at = ? WHERE id = ?`).run(JSON.stringify(scores), now, row.id);
        // Everyone's results (and ratings at ranked tables), from the seats as they are now.
        const seats = this.seatsOf(this.row(row.id));
        recordHand(
          this.db,
          game.id,
          row.card_id,
          Boolean(row.ranked),
          seats.map((s, p) => ({ principalId: s.principalId, bot: s.bot, seat: this.engineSeat(p, game.dealer, engine.seats) })),
          // A two-player result describes its game-ending Mahjong in the same fields.
          next.result as GameResult,
          this.options.now(),
        );
      } else {
        this.db.prepare('UPDATE tables SET updated_at = ? WHERE id = ?').run(now, row.id);
      }
    });
    this.broadcast(row.id);
    if (ended && row.mode === 'turn') this.announceEnd(row, game, next);
    this.pump(row.id);
  }

  /** At a turn-based table, players who aren't looking hear how the hand ended. */
  private announceEnd(row: TableRow, game: GameRow, state: AnyState) {
    const result = state.result;
    if (!result || !this.options.notifier) return;
    const people = this.seatsOf(row).flatMap((s) => (s.principalId ? [s.principalId] : []));
    if (people.length < 2) return;
    const { unit, seats } = this.engineOf(row);
    const body =
      result.kind === 'wall' || result.winner === null
        ? `${unit === 'game' ? 'Game' : 'Hand'} ${game.hand_number} at Table ${row.code} was a wall game.`
        : `${this.nameAt(row, this.position(result.winner, game.dealer, seats))} won ${unit} ${game.hand_number} at Table ${row.code}.`;
    this.options.notifier.notify(people, { category: 'turns', title: unit === 'game' ? 'Game over' : 'Hand over', body, url: `/table/${row.id}` });
  }

  // -------------------------------------------------------------------------
  // Computer players and live timeouts

  /** Moves any computer seat that is due, then waits on humans (with a deadline at live tables). */
  pump(tableId: string): void {
    this.clearTimer(tableId);
    const row = this.row(tableId);
    const game = this.currentGame(tableId);
    if (!game || game.status !== 'playing' || row.status === 'closed') return;
    const engine = this.engineOf(row);
    const state = JSON.parse(game.state) as AnyState;
    const seats = this.seatsOf(row);
    const pending = engine.pending(state);
    const botSeat = pending.find((s) => seats[this.position(s, game.dealer, engine.seats)]!.bot);
    if (botSeat !== undefined) {
      const level = seats[this.position(botSeat, game.dealer, engine.seats)]!.bot!;
      const step = () => this.moveFor(tableId, game.version, botSeat, level);
      // Computer players take a moment in every mode, so people can follow the play.
      if (this.options.botDelayMs === 0) step();
      else this.timers.set(tableId, setTimeout(step, this.options.botDelayMs));
      return;
    }
    if (row.mode === 'turn' && pending.length > 0) this.nudge(row, game.dealer, state, pending);
    if (row.mode !== 'live' || pending.length === 0) return;
    const kind = state.phase.kind;
    const seconds = kind === 'claim' ? this.options.liveTimeouts.claim : kind === 'turn' ? this.options.liveTimeouts.turn : this.options.liveTimeouts.pass;
    const deadline = new Date(this.options.now().getTime() + seconds * 1000);
    this.db.prepare('UPDATE games SET deadline = ? WHERE id = ? AND version = ?').run(deadline.toISOString(), game.id, game.version);
    // Players need the deadline to see the countdown.
    this.broadcast(tableId);
    this.timers.set(
      tableId,
      setTimeout(() => this.timeout(tableId, game.version), seconds * 1000),
    );
  }

  /** "Your move" pushes at a turn-based table, at most one per player until they play. */
  private nudge(row: TableRow, dealer: number, state: AnyState, pending: Seat[]) {
    const notifier = this.options.notifier;
    if (!notifier) return;
    const seats = this.seatsOf(row);
    const n = seats.length;
    const where = row.kind === 'public' ? 'your game' : `Table ${row.code}`;
    const phase = state.phase;
    for (const seat of pending) {
      const principalId = seats[this.position(seat, dealer, n)]!.principalId;
      if (!principalId) continue;
      const body =
        phase.kind === 'claim'
          ? `${this.nameAt(row, this.position(phase.from, dealer, n))} threw ${shortLabel(faceOf(phase.tile))}. Call it or pass at ${where}.`
          : phase.kind === 'turn'
            ? `It's your turn at ${where}.`
            : phase.kind === 'charleston' || phase.kind === 'courtesy-select'
              ? `Time to pass tiles at ${where}.`
              : `${where} is waiting for your answer.`;
      notifier.notify([principalId], { category: 'turns', title: 'Your move', body, url: `/table/${row.id}`, key: `turn:${row.id}`, throttleMs: 6 * 3_600_000 });
    }
  }

  /** Plays one move for a seat, unless the game has changed since it was scheduled. */
  private moveFor(tableId: string, version: number, seat: Seat, level: BotLevel, timedOut = false) {
    const row = this.row(tableId);
    const game = this.currentGame(tableId);
    if (!game || game.version !== version || game.status !== 'playing') return;
    const engine = this.engineOf(row);
    const state = JSON.parse(game.state) as AnyState;
    if (!engine.pending(state).includes(seat)) return;
    const position = this.position(seat, game.dealer, engine.seats);
    const notes = timedOut
      ? [this.entry(position, `${this.nameAt(row, position)} ran out of time, so the computer moved for them.`, { type: 'timeout', position })]
      : [];
    this.apply(row, game, seat, engine.bot(this.cardOf(row), state, seat, level, this.random), notes);
  }

  /** A live-table player ran out of time: a computer player makes this one move for them. */
  /** Time ran out: the computer makes a safe move for everyone still to act in this step. */
  timeout(tableId: string, version: number): void {
    let game = this.currentGame(tableId);
    if (!game || game.version !== version || game.status !== 'playing') return;
    const engine = this.engineOf(this.row(tableId));
    const phase = (JSON.parse(game.state) as AnyState).phase.kind;
    const simultaneous = phase !== 'turn' && phase !== 'claim';
    for (;;) {
      const state = JSON.parse(game.state) as AnyState;
      const seat = engine.pending(state)[0];
      if (seat === undefined) return;
      this.moveFor(tableId, game.version, seat, 'normal', true);
      const next = this.currentGame(tableId);
      // Turns and calls move one seat at a time; everyone in a simultaneous step is covered now.
      if (!simultaneous || !next || next.status !== 'playing' || next.version === game.version) return;
      if ((JSON.parse(next.state) as AnyState).phase.kind !== phase) return;
      game = next;
    }
  }

  /** Re-arms computer moves and deadlines after a restart. */
  resume(): void {
    const rows = this.db.prepare(`SELECT id FROM tables WHERE status = 'playing'`).all() as { id: string }[];
    for (const r of rows) this.pump(r.id);
  }

  private clearTimer(tableId: string) {
    const timer = this.timers.get(tableId);
    if (timer) clearTimeout(timer);
    this.timers.delete(tableId);
  }

  stopAll(): void {
    for (const timer of this.timers.values()) clearTimeout(timer);
    this.timers.clear();
  }

  // -------------------------------------------------------------------------
  // Views

  /** Engine seat (0 is East) of a table position, with `n` seats at the table. */
  private engineSeat(position: number, dealer: number, n: number): Seat {
    return ((position - dealer + n) % n) as Seat;
  }

  private position(seat: Seat, dealer: number, n: number): number {
    return (seat + dealer) % n;
  }

  private nameAt(row: TableRow, position: number): string {
    const seat = this.seatsOf(row)[position]!;
    if (seat.principalId) return ensureProfile(this.db, seat.principalId, this.options.now()).name;
    if (seat.bot) return botName(position);
    return 'Open seat';
  }

  private entry(position: number | null, text: string, event: LogEntry['event']): LogEntry {
    return { at: this.options.now().toISOString(), position, text, event };
  }

  /** Public description of an engine event. Draws never reveal the tile. */
  private describe(row: TableRow, dealer: number, event: AnyEvent, at: string): LogEntry {
    const n = this.engineOf(row).seats;
    const pos = 'seat' in event ? this.position(event.seat, dealer, n) : null;
    const who = pos === null ? '' : this.nameAt(row, pos);
    // At a two-player table every exposure, Mahjong and dead hand belongs to hand 1 or 2.
    const onHand = 'hand' in event ? ` on hand ${event.hand + 1}` : '';
    const { seat: _seat, ...rest } = event as AnyEvent & { seat?: Seat };
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
          return `${who} called ${shortLabel(faceOf(event.tile))} for a ${GROUP_NAMES[event.size] ?? `group of ${event.size}`}${onHand}.`;
        case 'exchange':
          return `${who} swapped ${shortLabel(faceOf(event.tile))} for a joker.`;
        case 'mahjong':
          if ('final' in event) {
            return event.final ? `${who} declared a second Mahjong${onHand} and wins the game!` : `${who} declared Mahjong${onHand}! ${event.value} points.`;
          }
          return `${who} declared Mahjong!`;
        case 'dead-hand':
          return 'hand' in event ? `${who}'s hand ${event.hand + 1} is dead: ${event.reason.text}.` : `${who}'s hand is dead: ${event.reason.text}.`;
        case 'wall-game':
          return this.engineOf(row).unit === 'game' ? 'Wall game: the wall ran out. Mahjongs already made keep their points.' : 'Wall game: nobody won this hand.';
      }
    })();
    return { at, position: pos, text, event: publicEvent };
  }

  viewFor(tableId: string, principalId: string) {
    const row = this.row(tableId);
    const seats = this.seatsOf(row);
    const myPosition = seats.findIndex((s) => s.principalId === principalId);
    const reserved = seats.some((s) => s.reservedFor === principalId);
    if (myPosition === -1 && !reserved && row.status === 'closed') throw new TableError(404, 'table_not_found', 'That table has closed.');
    const game = this.currentGame(tableId);
    const now = this.options.now();
    const dealer = game?.dealer ?? 0;
    const engine = this.engineOf(row);
    const n = engine.seats;
    const conversation = conversationFor(this.db, 'table', tableId, now);
    return {
      table: {
        id: row.id,
        code: row.code,
        mode: row.mode,
        status: row.status,
        hostId: row.host_id,
        handNumber: row.hand_number,
        dealer,
        settings: JSON.parse(row.settings) as TableSettings,
        scores: JSON.parse(row.scores) as number[],
        nightId: row.night_id,
        kind: row.kind,
        ranked: Boolean(row.ranked),
        cardId: row.card_id,
        variant: row.variant,
        seats: seats.map((s, position) => ({
          position,
          kind: s.principalId ? ('human' as const) : s.bot ? ('bot' as const) : ('open' as const),
          principalId: s.principalId,
          reservedFor: s.reservedFor,
          name: this.nameAt(row, position),
          color: s.principalId ? ensureProfile(this.db, s.principalId, now).color : '#667069',
          botLevel: s.bot,
          online: s.principalId ? this.hub.isOnline(s.principalId) : false,
          wind: engine.winds[(position - dealer + n) % n]!,
        })),
      },
      mySeat: myPosition === -1 ? null : myPosition,
      conversationId: conversation.id,
      game:
        game && myPosition !== -1
          ? {
              id: game.id,
              version: game.version,
              handNumber: game.hand_number,
              deadline: game.deadline,
              /** Engine seat -> table position for this hand. */
              positions: seats.map((_, s) => this.position(s as Seat, game.dealer, n)),
              view: engine.view(this.cardOf(row), JSON.parse(game.state) as AnyState, this.engineSeat(myPosition, game.dealer, n)),
              log: JSON.parse(game.log) as LogEntry[],
            }
          : null,
    };
  }

  broadcast(tableId: string): void {
    const row = this.row(tableId);
    const people = new Set(this.seatsOf(row).flatMap((s) => [s.principalId, s.reservedFor].filter((x): x is string => Boolean(x))));
    for (const principalId of people) {
      try {
        this.hub.send(principalId, { type: 'table', tableId, payload: this.viewFor(tableId, principalId) });
      } catch {
        // A closed table has nothing to send.
      }
    }
  }

  /** Tables a player is in or invited to, with whether it is their move. */
  listFor(principalId: string) {
    const rows = this.db
      // Finished matched games drop off the list; they were one hand.
      .prepare(`SELECT * FROM tables WHERE status != 'closed' AND NOT (kind = 'public' AND status = 'between') AND (seats LIKE ? OR host_id = ?) ORDER BY updated_at DESC LIMIT 50`)
      .all(`%${principalId}%`, principalId) as unknown as TableRow[];
    return rows
      .filter((row) => this.seatsOf(row).some((s) => s.principalId === principalId || s.reservedFor === principalId))
      .map((row) => {
        const seats = this.seatsOf(row);
        const position = seats.findIndex((s) => s.principalId === principalId);
        const game = this.currentGame(row.id);
        let yourMove = false;
        if (game && game.status === 'playing' && position !== -1) {
          const engine = this.engineOf(row);
          yourMove = engine.pending(JSON.parse(game.state) as AnyState).includes(this.engineSeat(position, game.dealer, engine.seats));
        }
        return {
          id: row.id,
          code: row.code,
          mode: row.mode,
          status: row.status,
          handNumber: row.hand_number,
          invited: position === -1,
          yourMove,
          humans: seats.filter((s) => s.principalId).length,
          kind: row.kind,
          ranked: Boolean(row.ranked),
          variant: row.variant,
          players: seats.map((_, p) => this.nameAt(row, p)),
          updatedAt: row.updated_at,
        };
      });
  }

  /** Before a player's data is deleted, computer players take their seats. */
  removePrincipal(principalId: string): void {
    const rows = this.db.prepare(`SELECT * FROM tables WHERE seats LIKE ?`).all(`%${principalId}%`) as unknown as TableRow[];
    for (const row of rows) {
      const seats = this.seatsOf(row).map((s) =>
        s.principalId === principalId ? { principalId: null, bot: 'normal' as const, reservedFor: null } : s.reservedFor === principalId ? { ...s, reservedFor: null } : s,
      );
      this.saveSeats(row.id, seats);
    }
  }
}

const BOT_NAMES = ['Mabel', 'Rosie', 'Dot', 'Hazel'];
export function botName(position: number): string {
  return `${BOT_NAMES[position % BOT_NAMES.length]} (computer)`;
}

export function isGameError(error: unknown): error is GameError {
  return error instanceof GameError;
}
