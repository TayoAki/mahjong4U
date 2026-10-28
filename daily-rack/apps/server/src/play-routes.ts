import type { Context, Hono } from 'hono';
import { z } from 'zod';
import { GameError, allCards, cardToSpec, hasCard } from '@daily-rack/core/mahjong';
import type { Db } from './db.ts';
import type { AppConfig, Env, Fail, RateLimiter } from './app.ts';
import type { Hub } from './realtime.ts';
import { TableError, type SeatInput, type TableService } from './tables.ts';
import { isBlockedEitherWay } from './blocks.ts';
import { ModerationError, isObjectionable, requireSocial, safetyStatus } from './moderation.ts';
import { registerSafetyRoutes } from './safety-routes.ts';
import { QUICK_PHRASES, type Matchmaker } from './matchmaking.ts';
import { importOffline, leaderboard, statsFor } from './stats.ts';
import type { VoiceRooms } from './voice.ts';
import { EXPO_TOKEN, PUSH_CATEGORIES, type Notifier } from './push.ts';
import {
  MESSAGE_MAX,
  acceptFriend,
  areFriends,
  cleanName,
  conversationFor,
  conversationMembers,
  directInbox,
  directKey,
  ensureProfile,
  friendIds,
  friendsOverview,
  getConversation,
  listMessages,
  markRead,
  postMessage,
  removeFriend,
  renameProfile,
  requestFriend,
} from './social.ts';
import {
  NightError,
  cancelNight,
  confirmNight,
  createNight,
  invitePreview,
  joinNight,
  listNights,
  memberIds,
  nightCalendar,
  nightDetail,
  respond,
} from './nights.ts';

interface Deps {
  db: Db;
  config: AppConfig;
  hub: Hub;
  tables: TableService;
  matchmaker: Matchmaker;
  voice: VoiceRooms;
  notifier: Notifier;
  fail: Fail;
  limiter: RateLimiter;
  now: () => Date;
  clientAddress: (c: Context) => string;
}

const BotLevel = z.enum(['easy', 'normal', 'hard']);
const SeatBody = z.object({ type: z.enum(['bot', 'open', 'friend']), level: BotLevel.optional(), friendId: z.string().uuid().optional() });
const TableBody = z.object({
  mode: z.enum(['live', 'turn']),
  seats: z.array(SeatBody).length(3),
  settings: z.object({ secondCharleston: z.boolean(), courtesyPass: z.boolean(), skipCharleston: z.boolean() }).partial().optional(),
  cardId: z.string().max(80).optional(),
});
const Tiles = z.array(z.number().int().min(0).max(151)).max(3);
const ActionBody = z.object({
  version: z.number().int().optional(),
  phase: z.string().max(40).optional(),
  action: z.discriminatedUnion('type', [
    z.object({ type: z.literal('charleston-pass'), tiles: Tiles }),
    z.object({ type: z.literal('charleston-vote'), continue: z.boolean() }),
    z.object({ type: z.literal('courtesy-count'), count: z.number().int().min(0).max(3) }),
    z.object({ type: z.literal('courtesy-pass'), tiles: Tiles }),
    z.object({ type: z.literal('discard'), tile: z.number().int().min(0).max(151) }),
    z.object({
      type: z.literal('exchange-joker'),
      tile: z.number().int().min(0).max(151),
      target: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
      exposure: z.number().int().min(0).max(5),
    }),
    z.object({ type: z.literal('declare-mahjong') }),
    z.object({
      type: z.literal('claim'),
      response: z.discriminatedUnion('type', [
        z.object({ type: z.literal('pass') }),
        z.object({ type: z.literal('expose'), size: z.number().int().min(3).max(6) }),
        z.object({ type: z.literal('mahjong') }),
      ]),
    }),
  ]),
});
const NightBody = z.object({
  title: z.string().trim().min(1).max(60),
  location: z.string().trim().max(120).nullable().optional(),
  timeZone: z.string().min(1).max(64),
  slots: z.array(z.string().datetime()).min(1).max(3),
});
const OfflineResults = z.object({
  results: z
    .array(
      z.object({
        id: z.string().uuid(),
        won: z.boolean(),
        selfDrawn: z.boolean(),
        jokerless: z.boolean(),
        wallGame: z.boolean(),
        fed: z.boolean(),
        handId: z.string().max(40).nullable(),
        value: z.number().int(),
        payment: z.number().int(),
        playedAt: z.string().datetime(),
      }),
    )
    .max(50),
});
const RespondBody = z.object({ rsvp: z.enum(['yes', 'maybe', 'no']).optional(), votes: z.array(z.string().uuid()).max(3).optional() });

/** "Thursday, Oct 30, 7:00 PM" in the night's own time zone. */
function nightWhen(night: { slots: { id: string; startsAt: string }[]; confirmedSlot: string | null; timeZone: string }): string {
  const slot = night.slots.find((s) => s.id === night.confirmedSlot);
  if (!slot) return 'The time is set';
  return new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: night.timeZone }).format(new Date(slot.startsAt));
}

export function registerPlayRoutes(api: Hono<Env>, deps: Deps): void {
  const { db, config, hub, tables, matchmaker, voice, notifier, fail, limiter, now } = deps;

  const me = (c: Context<Env>) => c.get('principal');
  const body = async <T>(c: Context<Env>, schema: z.ZodType<T>) => {
    const parsed = schema.safeParse(await c.req.json().catch(() => null));
    return parsed.success ? parsed.data : null;
  };
  const handle = (c: Context<Env>, error: unknown) => {
    if (error instanceof TableError || error instanceof NightError || error instanceof ModerationError) return fail(c, error.status, error.code, error.message);
    if (error instanceof GameError) return fail(c, 422, error.code, error.message);
    throw error;
  };

  // Friends hear when someone comes online or goes offline; offline players leave voice calls.
  hub.onPresence = (principalId, online) => {
    hub.sendMany(friendIds(db, principalId), { type: 'presence', principalId, online });
    if (!online) voice.disconnected(principalId);
  };

  api.use('/me/profile', async (c, next) => (me(c) ? next() : fail(c, 401, 'missing_identity', 'Start a session first.')));
  for (const path of ['/friends', '/friends/*', '/friend-codes/*', '/inbox', '/conversations/*', '/tables', '/tables/*', '/nights', '/nights/*', '/realtime/*', '/matchmaking', '/leaderboards', '/me/stats', '/me/offline-results', '/voice/*', '/me/push-token', '/me/notifications']) {
    api.use(path, async (c, next) => (me(c) ? next() : fail(c, 401, 'missing_identity', 'Start a session first.')));
  }

  // ---------------------------------------------------------------- profile

  api.get('/me/profile', (c) => c.json({ ...ensureProfile(db, me(c)!.id, now()), ...safetyStatus(db, me(c)!.id, now()) }));

  api.put('/me/profile', async (c) => {
    const input = await body(c, z.object({ name: z.string() }));
    const name = input ? cleanName(input.name) : null;
    if (!name) return fail(c, 400, 'bad_name', 'Use 1 to 24 characters for your name.');
    if (isObjectionable(name)) return fail(c, 400, 'bad_name', 'Please choose a different name.');
    const profile = renameProfile(db, me(c)!.id, name, now());
    hub.sendMany(friendIds(db, profile.id), { type: 'friends' });
    return c.json(profile);
  });

  api.post('/realtime/tickets', (c) => c.json({ ticket: hub.issueTicket(me(c)!.id) }));

  // ---------------------------------------------------------------- friends

  api.get('/friends', (c) => c.json(friendsOverview(db, hub, me(c)!.id, now())));

  api.post('/friends/requests', async (c) => {
    if (!limiter.allow(`friend:${me(c)!.id}`, 30, 3_600_000)) return fail(c, 429, 'rate_limited', 'Too many friend requests. Try again later.');
    const input = await body(c, z.object({ code: z.string().min(4).max(16) }));
    if (!input) return fail(c, 400, 'invalid_input', 'Enter a friend code.');
    try {
      requireSocial(db, me(c)!.id, now());
    } catch (error) {
      return handle(c, error);
    }
    const result = requestFriend(db, me(c)!.id, input.code, now());
    if (!result) return fail(c, 404, 'code_not_found', 'No player has that friend code.');
    hub.sendMany([me(c)!.id, result.friend.id], { type: 'friends' });
    const myName = ensureProfile(db, me(c)!.id, now()).name;
    if (result.result === 'requested') notifier.notify([result.friend.id], { category: 'invites', title: 'New friend request', body: `${myName} would like to be friends.`, url: '/friends' });
    if (result.result === 'accepted') notifier.notify([result.friend.id], { category: 'invites', title: 'You have a new friend', body: `${myName} is now your friend. Pull up a chair together!`, url: '/friends' });
    return c.json(result);
  });

  // Who an invite link's friend code belongs to, so the invite can say who is asking.
  api.get('/friend-codes/:code', (c) => {
    if (!limiter.allow(`friend-code:${me(c)!.id}`, 60, 3_600_000)) return fail(c, 429, 'rate_limited', 'Too many lookups. Try again later.');
    const row = db.prepare('SELECT principal_id FROM profiles WHERE friend_code = ?').get(c.req.param('code').trim().toUpperCase()) as { principal_id: string } | undefined;
    if (!row || isBlockedEitherWay(db, me(c)!.id, row.principal_id)) return fail(c, 404, 'code_not_found', 'No player has that friend code.');
    const { name, color } = ensureProfile(db, row.principal_id, now());
    return c.json({ name, color, isYou: row.principal_id === me(c)!.id });
  });

  api.post('/friends/:id/accept', (c) => {
    try {
      requireSocial(db, me(c)!.id, now());
    } catch (error) {
      return handle(c, error);
    }
    if (!acceptFriend(db, me(c)!.id, c.req.param('id'), now())) return fail(c, 404, 'request_not_found', 'That friend request is no longer waiting.');
    hub.sendMany([me(c)!.id, c.req.param('id')], { type: 'friends' });
    notifier.notify([c.req.param('id')], {
      category: 'invites',
      title: 'You have a new friend',
      body: `${ensureProfile(db, me(c)!.id, now()).name} accepted your friend request. Pull up a chair together!`,
      url: '/friends',
    });
    return c.json({ accepted: true });
  });

  api.delete('/friends/:id', (c) => {
    removeFriend(db, me(c)!.id, c.req.param('id'));
    hub.sendMany([me(c)!.id, c.req.param('id')], { type: 'friends' });
    return c.json({ removed: true });
  });

  // ---------------------------------------------------------------- chat

  api.get('/inbox', (c) => c.json({ conversations: directInbox(db, me(c)!.id, now()) }));

  api.post('/conversations/direct', async (c) => {
    const input = await body(c, z.object({ friendId: z.string().uuid() }));
    if (!input || !areFriends(db, me(c)!.id, input.friendId)) return fail(c, 403, 'not_friends', 'You can only message friends.');
    return c.json({ conversationId: conversationFor(db, 'direct', directKey(me(c)!.id, input.friendId), now()).id });
  });

  const memberConversation = (c: Context<Env>) => {
    const conversation = getConversation(db, c.req.param('id') ?? '');
    if (!conversation || !conversationMembers(db, conversation).includes(me(c)!.id)) return null;
    return conversation;
  };

  api.get('/conversations/:id/messages', (c) => {
    const conversation = memberConversation(c);
    if (!conversation) return fail(c, 404, 'conversation_not_found', 'That conversation is not available.');
    const messages = listMessages(db, conversation.id, me(c)!.id, c.req.query('before') ?? null);
    const senders = [...new Set(messages.flatMap((m) => (m.senderId ? [m.senderId] : [])))];
    return c.json({ messages, people: Object.fromEntries(senders.map((id) => [id, ensureProfile(db, id, now())])) });
  });

  api.post('/conversations/:id/messages', async (c) => {
    const conversation = memberConversation(c);
    if (!conversation) return fail(c, 404, 'conversation_not_found', 'That conversation is not available.');
    if (!limiter.allow(`chat:${me(c)!.id}`, 30, 60_000)) return fail(c, 429, 'rate_limited', 'Slow down a little.');
    const input = await body(c, z.object({ body: z.string() }));
    const text = input?.body.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() ?? '';
    if (text.length === 0 || text.length > MESSAGE_MAX) return fail(c, 400, 'bad_message', `Messages can be 1 to ${MESSAGE_MAX} characters.`);
    try {
      requireSocial(db, me(c)!.id, now());
    } catch (error) {
      return handle(c, error);
    }
    if (isObjectionable(text)) return fail(c, 400, 'objectionable', 'That message includes words we don’t allow. Please rephrase it.');
    // Strangers at a matched table talk in set phrases only.
    if (conversation.kind === 'table') {
      const table = db.prepare('SELECT kind FROM tables WHERE id = ?').get(conversation.ref) as { kind: string } | undefined;
      if (table?.kind === 'public' && !QUICK_PHRASES.includes(text)) return fail(c, 400, 'phrases_only', 'At matched games you can send the quick phrases only.');
    }
    const message = postMessage(db, hub, conversation, me(c)!.id, text, now());
    // Friends' direct messages come through as pushes; table and night chats stay in the app.
    if (conversation.kind === 'direct') {
      const others = conversationMembers(db, conversation).filter((id) => id !== me(c)!.id && !isBlockedEitherWay(db, me(c)!.id, id));
      notifier.notify(others, {
        category: 'messages',
        title: ensureProfile(db, me(c)!.id, now()).name,
        body: text,
        url: `/chat/${conversation.id}`,
        key: `chat:${conversation.id}`,
        throttleMs: 60_000,
      });
    }
    return c.json(message, 201);
  });

  api.post('/conversations/:id/read', (c) => {
    const conversation = memberConversation(c);
    if (!conversation) return fail(c, 404, 'conversation_not_found', 'That conversation is not available.');
    markRead(db, conversation.id, me(c)!.id, now());
    return c.json({ read: true });
  });

  // ---------------------------------------------------------------- push notifications

  api.put('/me/push-token', async (c) => {
    const input = await body(c, z.object({ token: z.string().max(200).regex(EXPO_TOKEN), platform: z.enum(['ios', 'android']) }));
    if (!input) return fail(c, 400, 'invalid_input', 'That push token was not readable.');
    notifier.saveToken(me(c)!.id, input.token, input.platform);
    return c.json({ saved: true, settings: notifier.settings(me(c)!.id) });
  });

  api.delete('/me/push-token', async (c) => {
    const input = await body(c, z.object({ token: z.string().max(200) }));
    if (input) notifier.removeToken(me(c)!.id, input.token);
    return c.json({ removed: true });
  });

  api.get('/me/notifications', (c) => c.json({ settings: notifier.settings(me(c)!.id), devices: notifier.devices(me(c)!.id) }));

  api.put('/me/notifications', async (c) => {
    const input = await body(c, z.object(Object.fromEntries(PUSH_CATEGORIES.map((k) => [k, z.boolean().optional()]))).strict());
    if (!input) return fail(c, 400, 'invalid_input', 'Choose which notifications you want.');
    return c.json({ settings: notifier.updateSettings(me(c)!.id, input), devices: notifier.devices(me(c)!.id) });
  });

  // ---------------------------------------------------------------- matchmaking, ranking, stats

  api.get('/matchmaking', (c) => c.json({ queue: matchmaker.status(me(c)!.id), phrases: QUICK_PHRASES }));

  api.post('/matchmaking', async (c) => {
    const input = await body(c, z.object({ mode: z.enum(['casual', 'ranked']) }));
    if (!input) return fail(c, 400, 'invalid_input', 'Choose a casual or ranked game.');
    try {
      // Matched games put you at a table with strangers, so the community rules apply.
      requireSocial(db, me(c)!.id, now());
    } catch (error) {
      return handle(c, error);
    }
    const active = tables.activePublicFor(me(c)!.id);
    if (active) return fail(c, 409, 'in_match', 'Finish your current matched game first.', { tableId: active });
    return c.json({ queue: matchmaker.join(me(c)!.id, input.mode) });
  });

  api.delete('/matchmaking', (c) => {
    matchmaker.leave(me(c)!.id);
    return c.json({ queue: null });
  });

  api.get('/leaderboards', (c) => c.json(leaderboard(db, c.req.query('board') === 'weekly' ? 'weekly' : 'rating', me(c)!.id, now())));

  api.get('/me/stats', (c) => c.json(statsFor(db, me(c)!.id)));

  api.post('/me/offline-results', async (c) => {
    if (!limiter.allow(`offline:${me(c)!.id}`, 30, 3_600_000)) return fail(c, 429, 'rate_limited', 'Too many uploads. Try again later.');
    const input = await body(c, OfflineResults);
    if (!input) return fail(c, 400, 'invalid_input', 'Those results were not readable.');
    return c.json({ added: importOffline(db, me(c)!.id, input.results, now()) });
  });

  api.get('/voice/config', (c) => c.json({ iceServers: config.iceServers ?? [] }));

  // The cards tables can play with: the house card first, then any loaded from content/cards.
  api.get('/cards', (c) => c.json({ cards: allCards().map(cardToSpec) }));

  // ---------------------------------------------------------------- tables

  api.get('/tables', (c) => c.json({ tables: tables.listFor(me(c)!.id) }));

  api.post('/tables', async (c) => {
    const input = await body(c, TableBody);
    if (!input) return fail(c, 400, 'invalid_input', 'That table setup was not readable.');
    for (const seat of input.seats) {
      if (seat.type === 'friend' && (!seat.friendId || !areFriends(db, me(c)!.id, seat.friendId))) {
        return fail(c, 403, 'not_friends', 'You can only hold seats for friends.');
      }
    }
    if (input.cardId && !hasCard(input.cardId)) return fail(c, 400, 'unknown_card', 'That card isn’t available.');
    try {
      const id = tables.create(me(c)!.id, { mode: input.mode, seats: input.seats as SeatInput[], settings: input.settings, cardId: input.cardId });
      return c.json(tables.viewFor(id, me(c)!.id), 201);
    } catch (error) {
      return handle(c, error);
    }
  });

  api.post('/tables/join', async (c) => {
    const input = await body(c, z.object({ code: z.string().min(4).max(10) }));
    if (!input) return fail(c, 400, 'invalid_input', 'Enter a table code.');
    try {
      const id = tables.idForCode(input.code);
      tables.join(id, me(c)!.id);
      return c.json(tables.viewFor(id, me(c)!.id));
    } catch (error) {
      return handle(c, error);
    }
  });

  api.get('/tables/:id', (c) => {
    try {
      return c.json(tables.viewFor(c.req.param('id'), me(c)!.id));
    } catch (error) {
      return handle(c, error);
    }
  });

  const tableAction = (fn: (id: string, principalId: string, c: Context<Env>) => void | Promise<void>) => async (c: Context<Env>) => {
    try {
      await fn(c.req.param('id') ?? '', me(c)!.id, c);
      return c.json(tables.viewFor(c.req.param('id') ?? '', me(c)!.id));
    } catch (error) {
      return handle(c, error);
    }
  };

  api.post('/tables/:id/join', tableAction((id, pid) => void tables.join(id, pid)));
  api.post('/tables/:id/leave', async (c) => {
    try {
      tables.leave(c.req.param('id'), me(c)!.id);
      return c.json({ left: true });
    } catch (error) {
      return handle(c, error);
    }
  });
  api.post('/tables/:id/start', tableAction((id, pid) => tables.start(id, pid)));
  api.post('/tables/:id/next-hand', tableAction((id, pid) => tables.nextHand(id, pid)));
  api.post('/tables/:id/close', tableAction((id, pid) => tables.close(id, pid)));
  api.put(
    '/tables/:id/seats/:position',
    tableAction(async (id, pid, c) => {
      const input = await body(c, SeatBody);
      if (!input) throw new TableError(400, 'invalid_input', 'That seat change was not readable.');
      if (input.type === 'friend' && (!input.friendId || !areFriends(db, pid, input.friendId))) {
        throw new TableError(403, 'not_friends', 'You can only hold seats for friends.');
      }
      tables.setSeat(id, pid, Number(c.req.param('position')), input as SeatInput);
    }),
  );
  api.post(
    '/tables/:id/actions',
    tableAction(async (id, pid, c) => {
      if (!limiter.allow(`move:${pid}`, 240, 60_000)) throw new TableError(409, 'rate_limited', 'Too many moves at once.');
      const input = await body(c, ActionBody);
      if (!input) throw new TableError(400, 'invalid_input', 'That move was not readable.');
      tables.act(id, pid, input.action, input.version, input.phase);
    }),
  );

  // ---------------------------------------------------------------- game night

  api.get('/nights', (c) => c.json({ nights: listNights(db, me(c)!.id) }));

  api.post('/nights', async (c) => {
    const input = await body(c, NightBody);
    if (!input) return fail(c, 400, 'invalid_input', 'Give the night a name and one to three times.');
    if (isObjectionable(`${input.title} ${input.location ?? ''}`)) return fail(c, 400, 'objectionable', 'The name or place includes words we don’t allow.');
    try {
      requireSocial(db, me(c)!.id, now());
      const id = createNight(db, me(c)!.id, { ...input, location: input.location ?? null }, now());
      return c.json(nightDetail(db, hub, id, me(c)!.id, now()), 201);
    } catch (error) {
      return handle(c, error);
    }
  });

  api.get('/nights/:id', (c) => {
    try {
      return c.json(nightDetail(db, hub, c.req.param('id'), me(c)!.id, now()));
    } catch (error) {
      return handle(c, error);
    }
  });

  api.put('/nights/:id/me', async (c) => {
    const input = await body(c, RespondBody);
    if (!input) return fail(c, 400, 'invalid_input', 'That response was not readable.');
    try {
      respond(db, hub, c.req.param('id'), me(c)!.id, input, now());
      const detail = nightDetail(db, hub, c.req.param('id'), me(c)!.id, now());
      if (input.rsvp === 'yes' && !detail.isHost) {
        notifier.notify([detail.hostId], { category: 'nights', title: detail.title, body: `${ensureProfile(db, me(c)!.id, now()).name} is coming!`, url: `/night/${detail.id}`, key: `rsvp:${detail.id}:${me(c)!.id}`, throttleMs: 3_600_000 });
      }
      return c.json(detail);
    } catch (error) {
      return handle(c, error);
    }
  });

  api.post('/nights/:id/confirm', async (c) => {
    const input = await body(c, z.object({ slotId: z.string().uuid() }));
    if (!input) return fail(c, 400, 'invalid_input', 'Pick a time to confirm.');
    try {
      confirmNight(db, hub, c.req.param('id'), me(c)!.id, input.slotId, now());
      const detail = nightDetail(db, hub, c.req.param('id'), me(c)!.id, now());
      notifier.notify(
        detail.members.filter((m) => m.id !== detail.hostId && m.rsvp !== 'no').map((m) => m.id),
        { category: 'nights', title: `${detail.title} is on!`, body: `${nightWhen(detail)}${detail.location ? ` at ${detail.location}` : ''}. Add it to your calendar so you don't miss it.`, url: `/night/${detail.id}` },
      );
      return c.json(detail);
    } catch (error) {
      return handle(c, error);
    }
  });

  api.post('/nights/:id/cancel', (c) => {
    try {
      const before = nightDetail(db, hub, c.req.param('id'), me(c)!.id, now());
      cancelNight(db, hub, c.req.param('id'), me(c)!.id, now());
      notifier.notify(
        before.members.filter((m) => m.id !== before.hostId).map((m) => m.id),
        { category: 'nights', title: `${before.title} is cancelled`, body: 'The host called it off. Maybe a game online instead?', url: `/night/${before.id}` },
      );
      return c.json({ cancelled: true });
    } catch (error) {
      return handle(c, error);
    }
  });

  api.get('/nights/:id/calendar.ics', (c) => {
    try {
      const ics = nightCalendar(db, c.req.param('id'), me(c)!.id, deps.config.publicBaseUrl);
      return c.body(ics, 200, { 'content-type': 'text/calendar; charset=utf-8', 'content-disposition': 'attachment; filename="game-night.ics"' });
    } catch (error) {
      return handle(c, error);
    }
  });

  /** "Play online instead": a table with a held seat for everyone going, computers in the rest. */
  api.post('/nights/:id/table', async (c) => {
    const input = await body(c, z.object({ mode: z.enum(['live', 'turn']) }));
    try {
      const detail = nightDetail(db, hub, c.req.param('id'), me(c)!.id, now());
      if (!detail.isHost) throw new NightError(403, 'not_host', 'Only the host can open an online table.');
      const others = detail.members.filter((m) => m.rsvp === 'yes' && m.id !== me(c)!.id).slice(0, 3);
      const seats: SeatInput[] = [0, 1, 2].map((i) => (others[i] ? { type: 'friend', friendId: others[i]!.id } : { type: 'bot', level: 'normal' }));
      const id = tables.create(me(c)!.id, { mode: input?.mode ?? 'live', seats, nightId: detail.id });
      hub.sendMany(memberIds(db, detail.id), { type: 'night', nightId: detail.id });
      return c.json(tables.viewFor(id, me(c)!.id), 201);
    } catch (error) {
      return handle(c, error);
    }
  });

  api.get('/night-invites/:token', (c) => {
    try {
      return c.json(invitePreview(db, c.req.param('token'), now(), me(c)?.id ?? null));
    } catch (error) {
      return handle(c, error);
    }
  });

  api.post('/night-invites/:token/join', (c) => {
    if (!me(c)) return fail(c, 401, 'missing_identity', 'Start a session first.');
    try {
      requireSocial(db, me(c)!.id, now());
      const nightId = joinNight(db, hub, c.req.param('token'), me(c)!.id, now());
      return c.json(nightDetail(db, hub, nightId, me(c)!.id, now()));
    } catch (error) {
      return handle(c, error);
    }
  });

  registerSafetyRoutes(api, { db, hub, fail, limiter, now, config: deps.config, handle, body });
}
