import type { Alignment, AlternatePass, PublicPuzzle, ReviewState, Section, Suggestion } from '@daily-rack/core';
import type { Action, BotLevel, CardSpec, PlayerView } from '@daily-rack/core/mahjong';
import { API_BASE } from './config.ts';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryable: boolean,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Native builds authenticate with a bearer token; the web build uses an HttpOnly cookie. */
let bearer: string | null = (globalThis as { __DR_TOKEN__?: string }).__DR_TOKEN__ ?? null;
export function setBearer(token: string | null) {
  bearer = token;
}
export function getBearer(): string | null {
  return bearer;
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      credentials: 'include',
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(bearer ? { authorization: `Bearer ${bearer}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'network', 'You seem to be offline. Check your connection and try again.', true);
  }
  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const { code, message, retryable, ...extra } = data?.error ?? {};
    throw new ApiError(res.status, code ?? 'unknown', message ?? 'Something went wrong.', Boolean(retryable), extra);
  }
  return data as T;
}

// ------------------------------------------------------------------ types

export interface Progress {
  streak: number;
  bestStreak: number;
  racksSolved: number;
  strongPasses: number;
  milestone: boolean;
  today: string;
  playedToday: boolean;
  week: { day: string; done: boolean }[];
  sections: { label: string; count: number }[];
}

export interface Daily {
  contentDay: string;
  serverTime: string;
  nextPublicationAt: string;
  puzzle: PublicPuzzle | null;
  attemptId: string | null;
  progress: Progress | null;
}

export interface SplitResponse {
  revisionId: string;
  eligibleAttemptCount: number;
  syntheticAttemptCount: number;
  minimumSampleMet: boolean;
  threshold: number;
  computedAt: string;
  rows: { tileInstanceId: string; count: number; rate: number }[];
}

export interface ResultResponse {
  attempt: { id: string; revisionId: string; sectionId: string; tileInstanceIds: string[]; createdAt: string; isDaily: boolean };
  puzzle: PublicPuzzle;
  section: Section;
  suggestion: Suggestion;
  suggestedSection: Section;
  alternates: AlternatePass[];
  alignment: Alignment;
  alignmentCopy: string;
  split: SplitResponse;
  poster: { sectionId: string; tileInstanceIds: string[] } | null;
  progress: Progress;
  review: ReviewState;
}

export interface SharedRack {
  linkId: string;
  puzzle: PublicPuzzle;
  posterPassPublished: boolean;
  isTodaysRack: boolean;
  attemptId: string | null;
}

export interface AppConfig {
  brand: string;
  publicBaseUrl: string | null;
  splitThreshold: number;
  timeZone: string;
  supportEmail: string | null;
}

export interface Profile {
  id: string;
  name: string;
  code: string;
  color: string;
}

/** Your own profile, with where you stand on the community rules. */
export interface MyProfile extends Profile {
  rulesAccepted: boolean;
  suspended: boolean;
}

export type ReportReason = 'harassment' | 'hate' | 'sexual' | 'spam' | 'cheating' | 'other';

export interface FriendsOverview {
  me: Profile;
  friends: (Profile & { online: boolean })[];
  incoming: Profile[];
  outgoing: Profile[];
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string | null;
  body: string;
  createdAt: string;
}

export interface InboxEntry {
  conversationId: string;
  friend: Profile;
  last: { body: string; senderId: string | null; createdAt: string } | null;
  unread: number;
}

export interface TableSeat {
  position: number;
  kind: 'human' | 'bot' | 'open';
  principalId: string | null;
  reservedFor: string | null;
  name: string;
  color: string;
  botLevel: BotLevel | null;
  online: boolean;
  wind: string;
}

export interface LogEntry {
  at: string;
  position: number | null;
  text: string;
  event: { type: string; tile?: number; size?: number; position?: number; from?: number | null };
}

export interface TablePayload {
  table: {
    id: string;
    code: string;
    mode: 'live' | 'turn';
    status: 'lobby' | 'playing' | 'between' | 'closed';
    hostId: string;
    handNumber: number;
    dealer: number;
    settings: { secondCharleston: boolean; courtesyPass: boolean; skipCharleston: boolean };
    scores: number[];
    nightId: string | null;
    /** Private tables are set up by a host; public ones are matched with strangers. */
    kind: 'private' | 'public';
    ranked: boolean;
    /** The card this table plays with. */
    cardId: string;
    seats: TableSeat[];
  };
  mySeat: number | null;
  conversationId: string;
  game: {
    id: string;
    version: number;
    handNumber: number;
    deadline: string | null;
    positions: number[];
    view: PlayerView;
    log: LogEntry[];
  } | null;
}

export interface TableSummary {
  id: string;
  code: string;
  mode: 'live' | 'turn';
  status: 'lobby' | 'playing' | 'between' | 'closed';
  handNumber: number;
  invited: boolean;
  yourMove: boolean;
  /** People seated (not computer players or open seats). */
  humans: number;
  kind: 'private' | 'public';
  ranked: boolean;
  players: string[];
  updatedAt: string;
}

export type SeatChoice = { type: 'bot'; level: BotLevel } | { type: 'open' } | { type: 'friend'; friendId: string };

export type Rsvp = 'pending' | 'yes' | 'maybe' | 'no';

export interface NightDetail {
  id: string;
  title: string;
  location: string | null;
  timeZone: string;
  status: 'polling' | 'confirmed' | 'cancelled';
  hostId: string;
  isHost: boolean;
  invitePath: string;
  confirmedSlot: string | null;
  slots: { id: string; startsAt: string; votes: number; leading: boolean }[];
  tied: boolean;
  members: (Profile & { rsvp: Rsvp; votes: string[]; online: boolean })[];
  seats: string[] | null;
  going: number;
  variant: 'full' | 'three' | 'two' | 'short';
  conversationId: string;
}

export interface NightSummary {
  id: string;
  title: string;
  status: 'polling' | 'confirmed' | 'cancelled';
  timeZone: string;
  isHost: boolean;
  when: string | null;
  options: string[];
  going: number;
  myRsvp: Rsvp;
}

export interface InvitePreview {
  nightId: string;
  title: string;
  location: string | null;
  timeZone: string;
  status: string;
  host: Profile;
  slots: { id: string; startsAt: string }[];
}

// ------------------------------------------------------------------ endpoints

export type QueueMode = 'casual' | 'ranked';

export interface QueueStatus {
  mode: QueueMode;
  since: string;
  waiting: number;
  /** When computer players fill the empty seats if nobody else turns up. */
  fillAt: string;
}

export interface Stats {
  hands: number;
  wins: number;
  winRate: number;
  selfDrawn: number;
  jokerless: number;
  wallGames: number;
  fed: number;
  points: number;
  streak: { current: number; best: number };
  biggest: { value: number; handId: string; pattern: string | null } | null;
  card: { id: string; total: number; completed: { handId: string; times: number }[]; sections: { id: string; label: string; total: number; completed: number }[] };
  ranked: { rating: number; games: number; wins: number; rank: number | null };
  offline: { hands: number; wins: number };
  recent: { playedAt: string; won: boolean; value: number; payment: number; handId: string | null; pattern: string | null; ranked: boolean; offline: boolean; wallGame: boolean }[];
}

export interface LeaderboardEntry {
  rank: number;
  player: Profile;
  score: number;
  games: number;
  wins: number;
  isYou: boolean;
}

export interface Leaderboard {
  board: 'rating' | 'weekly';
  since: string | null;
  entries: LeaderboardEntry[];
  you: LeaderboardEntry | null;
}

export interface OfflineResult {
  id: string;
  won: boolean;
  selfDrawn: boolean;
  jokerless: boolean;
  wallGame: boolean;
  fed: boolean;
  handId: string | null;
  value: number;
  payment: number;
  playedAt: string;
}

export const api = {
  guestSession: () => request<{ principalId: string; token?: string; created: boolean }>('POST', '/v1/guest-sessions'),
  config: () => request<AppConfig>('GET', '/v1/config'),

  daily: () => request<Daily>('GET', '/v1/daily'),
  submit: (body: { revisionId: string; sectionId: string; tileInstanceIds: string[]; idempotencyKey: string; shareToken?: string }) =>
    request<{ attemptId: string; revisionId: string }>('POST', '/v1/attempts', body),
  result: (attemptId: string) => request<ResultResponse>('GET', `/v1/attempts/${encodeURIComponent(attemptId)}/result`),
  progress: () => request<Progress>('GET', '/v1/me/progress'),
  createShareLink: (attemptId: string, publishPass: boolean) =>
    request<{ id: string; token: string; path: string; url: string | null }>('POST', '/v1/share-links', { attemptId, publishPass }),
  sharedRack: (token: string) => request<SharedRack>('GET', `/v1/share-links/${encodeURIComponent(token)}`),
  deleteMe: () => request<{ deleted: boolean }>('DELETE', '/v1/me', undefined, { 'x-confirm-delete': 'delete-my-data' }),

  profile: () => request<MyProfile>('GET', '/v1/me/profile'),
  acceptRules: () => request<{ rulesAccepted: boolean }>('POST', '/v1/me/rules'),
  blocks: () => request<{ blocked: Profile[] }>('GET', '/v1/blocks'),
  block: (playerId: string) => request<{ blocked: boolean }>('POST', '/v1/blocks', { playerId }),
  unblock: (playerId: string) => request<{ unblocked: boolean }>('DELETE', `/v1/blocks/${playerId}`),
  report: (body: { playerId?: string; messageId?: string; reason: ReportReason; note?: string | null; block?: boolean }) =>
    request<{ reported: boolean; id: string; blocked: boolean }>('POST', '/v1/reports', body),
  feedback: (message: string) => request<{ sent: boolean }>('POST', '/v1/feedback', { message }),
  rename: (name: string) => request<Profile>('PUT', '/v1/me/profile', { name }),
  realtimeTicket: () => request<{ ticket: string }>('POST', '/v1/realtime/tickets'),

  friends: () => request<FriendsOverview>('GET', '/v1/friends'),
  friendCode: (code: string) => request<{ name: string; color: string; isYou: boolean }>('GET', `/v1/friend-codes/${encodeURIComponent(code)}`),
  addFriend: (code: string) => request<{ result: string; friend: Profile }>('POST', '/v1/friends/requests', { code }),
  acceptFriend: (id: string) => request<{ accepted: boolean }>('POST', `/v1/friends/${id}/accept`),
  removeFriend: (id: string) => request<{ removed: boolean }>('DELETE', `/v1/friends/${id}`),

  inbox: () => request<{ conversations: InboxEntry[] }>('GET', '/v1/inbox'),
  directConversation: (friendId: string) => request<{ conversationId: string }>('POST', '/v1/conversations/direct', { friendId }),
  messages: (conversationId: string) =>
    request<{ messages: Message[]; people: Record<string, Profile> }>('GET', `/v1/conversations/${conversationId}/messages`),
  sendMessage: (conversationId: string, body: string) => request<Message>('POST', `/v1/conversations/${conversationId}/messages`, { body }),
  markRead: (conversationId: string) => request<{ read: boolean }>('POST', `/v1/conversations/${conversationId}/read`),

  tables: () => request<{ tables: TableSummary[] }>('GET', '/v1/tables'),
  createTable: (body: { mode: 'live' | 'turn'; seats: SeatChoice[]; settings?: Partial<TablePayload['table']['settings']>; cardId?: string }) =>
    request<TablePayload>('POST', '/v1/tables', body),
  table: (id: string) => request<TablePayload>('GET', `/v1/tables/${id}`),
  joinByCode: (code: string) => request<TablePayload>('POST', '/v1/tables/join', { code }),
  joinTable: (id: string) => request<TablePayload>('POST', `/v1/tables/${id}/join`),
  leaveTable: (id: string) => request<{ left: boolean }>('POST', `/v1/tables/${id}/leave`),
  startTable: (id: string) => request<TablePayload>('POST', `/v1/tables/${id}/start`),
  nextHand: (id: string) => request<TablePayload>('POST', `/v1/tables/${id}/next-hand`),
  closeTable: (id: string) => request<TablePayload>('POST', `/v1/tables/${id}/close`),
  setSeat: (id: string, position: number, seat: SeatChoice) => request<TablePayload>('PUT', `/v1/tables/${id}/seats/${position}`, seat),
  /** `phase` names the step acted on, so a pass made alongside other players isn't refused as stale. */
  act: (id: string, action: Action, version?: number, phase?: string) => request<TablePayload>('POST', `/v1/tables/${id}/actions`, { action, version, phase }),

  matchmaking: () => request<{ queue: QueueStatus | null; phrases: string[] }>('GET', '/v1/matchmaking'),
  findMatch: (mode: QueueMode) => request<{ queue: QueueStatus }>('POST', '/v1/matchmaking', { mode }),
  cancelMatch: () => request<{ queue: null }>('DELETE', '/v1/matchmaking'),
  leaderboard: (board: 'rating' | 'weekly') => request<Leaderboard>('GET', `/v1/leaderboards?board=${board}`),
  stats: () => request<Stats>('GET', '/v1/me/stats'),
  offlineResults: (results: OfflineResult[]) => request<{ added: number }>('POST', '/v1/me/offline-results', { results }),
  cards: () => request<{ cards: CardSpec[] }>('GET', '/v1/cards'),
  voiceConfig: () => request<{ iceServers: { urls: string | string[]; username?: string; credential?: string }[] }>('GET', '/v1/voice/config'),

  nights: () => request<{ nights: NightSummary[] }>('GET', '/v1/nights'),
  createNight: (body: { title: string; location: string | null; timeZone: string; slots: string[] }) => request<NightDetail>('POST', '/v1/nights', body),
  night: (id: string) => request<NightDetail>('GET', `/v1/nights/${id}`),
  respondNight: (id: string, body: { rsvp?: Rsvp; votes?: string[] }) => request<NightDetail>('PUT', `/v1/nights/${id}/me`, body),
  confirmNight: (id: string, slotId: string) => request<NightDetail>('POST', `/v1/nights/${id}/confirm`, { slotId }),
  cancelNight: (id: string) => request<{ cancelled: boolean }>('POST', `/v1/nights/${id}/cancel`),
  nightTable: (id: string, mode: 'live' | 'turn') => request<TablePayload>('POST', `/v1/nights/${id}/table`, { mode }),
  invite: (token: string) => request<InvitePreview>('GET', `/v1/night-invites/${encodeURIComponent(token)}`),
  joinNight: (token: string) => request<NightDetail>('POST', `/v1/night-invites/${encodeURIComponent(token)}/join`),
  calendarUrl: (id: string) => `${API_BASE}/v1/nights/${id}/calendar.ics`,
};

let configPromise: Promise<AppConfig> | null = null;
export function getConfig(): Promise<AppConfig> {
  configPromise ??= api.config().catch(() => ({ brand: 'Daily Rack', publicBaseUrl: null, splitThreshold: 30, timeZone: 'America/New_York', supportEmail: null }));
  return configPromise;
}
