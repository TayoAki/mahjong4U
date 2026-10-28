import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { serve } from '@hono/node-server';
import { HOUSE_CARD, TILE_FACES, cardToSpec, type PlayerView } from '@daily-rack/core/mahjong';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { loadCards } from './cards.ts';
import { ratingChanges } from './stats.ts';
import { createApp, createServices, type Services } from './app.ts';
import { loadContent, syncRevisions } from './content.ts';
import { openDb, type Db } from './db.ts';
import { attachRealtime } from './realtime-server.ts';
import type { ExpoMessage, ExpoTicket } from './push.ts';

const content = loadContent(join(import.meta.dirname, '../../../content'), { devRotate: true });
const config = { brand: 'Daily Rack', publicBaseUrl: 'https://dailyrack.test', secureCookies: false, splitThreshold: 30, adminToken: 'test-moderator-token' };

let db: Db;
let services: Services;
let app: ReturnType<typeof createApp>;

function setup(options: Parameters<typeof createServices>[1] = {}) {
  db = openDb(':memory:');
  syncRevisions(db, content, new Date());
  services = createServices(db, { botDelayMs: 0, ...options });
  app = createApp({ db, content, config, services });
}

beforeEach(() => setup());
afterEach(() => {
  services.tables.stopAll();
  services.matchmaker.stop();
});

async function device(name?: string, { rules = true }: { rules?: boolean } = {}) {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
    const text = await res.text();
    let json: any = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = text;
    }
    return { status: res.status, body: json, raw: text };
  };
  const session = await call('POST', '/v1/guest-sessions');
  if (name) await call('PUT', '/v1/me/profile', { name });
  if (rules) await call('POST', '/v1/me/rules');
  const profile = (await call('GET', '/v1/me/profile')).body;
  return { call, id: session.body.principalId as string, token: session.body.token as string, profile };
}

type Device = Awaited<ReturnType<typeof device>>;

async function befriend(a: Device, b: Device) {
  await a.call('POST', '/v1/friends/requests', { code: b.profile.code });
  await b.call('POST', `/v1/friends/${a.id}/accept`);
}

/** A simple human strategy driven only by what the player's view shows. */
function simpleMove(view: PlayerView) {
  const prompt = view.prompt!;
  const free = view.hand.filter((t) => TILE_FACES[t] !== 'JOKER');
  switch (prompt.type) {
    case 'charleston-pass':
      return { type: 'charleston-pass', tiles: free.slice(0, 3) };
    case 'charleston-vote':
      return { type: 'charleston-vote', continue: false };
    case 'courtesy-count':
      return { type: 'courtesy-count', count: 0 };
    case 'courtesy-pass':
      return { type: 'courtesy-pass', tiles: free.slice(0, prompt.count) };
    case 'turn':
      return prompt.canMahjong ? { type: 'declare-mahjong' } : { type: 'discard', tile: view.drawn ?? free[0] ?? view.hand[0] };
    case 'claim':
      return { type: 'claim', response: prompt.canMahjong ? { type: 'mahjong' } : { type: 'pass' } };
  }
}

/** Plays every human move for the given devices until the hand ends. */
async function playOut(tableId: string, players: Device[], maxMoves = 600) {
  for (let i = 0; i < maxMoves; i++) {
    let acted = false;
    for (const p of players) {
      const { body } = await p.call('GET', `/v1/tables/${tableId}`);
      if (body.table.status !== 'playing') return body;
      const view = body.game.view as PlayerView;
      if (!view.prompt) continue;
      const res = await p.call('POST', `/v1/tables/${tableId}/actions`, { action: simpleMove(view), version: body.game.version });
      expect([200, 409]).toContain(res.status);
      acted = true;
    }
    if (!acted) await new Promise((r) => setTimeout(r, 5));
  }
  throw new Error('hand did not finish');
}

describe('profiles, friends and chat', () => {
  it('connects two players by friend code and lets only them chat', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    const cal = await device('Cal');
    expect(ann.profile.code).toMatch(/^[A-Z2-9]{8}$/);

    const request = await ann.call('POST', '/v1/friends/requests', { code: bea.profile.code.toLowerCase() });
    expect(request.body).toMatchObject({ result: 'requested', friend: { name: 'Bea' } });
    expect((await bea.call('GET', '/v1/friends')).body.incoming).toMatchObject([{ name: 'Ann' }]);
    expect((await bea.call('POST', `/v1/friends/${ann.id}/accept`)).body.accepted).toBe(true);
    expect((await ann.call('GET', '/v1/friends')).body.friends).toMatchObject([{ name: 'Bea' }]);

    expect((await ann.call('POST', '/v1/conversations/direct', { friendId: cal.id })).status).toBe(403);
    const { conversationId } = (await ann.call('POST', '/v1/conversations/direct', { friendId: bea.id })).body;
    expect((await ann.call('POST', `/v1/conversations/${conversationId}/messages`, { body: '  Table at 7?  ' })).status).toBe(201);
    const messages = await bea.call('GET', `/v1/conversations/${conversationId}/messages`);
    expect(messages.body.messages).toMatchObject([{ body: 'Table at 7?', senderId: ann.id }]);
    expect(messages.body.people[ann.id].name).toBe('Ann');
    expect((await bea.call('GET', '/v1/inbox')).body.conversations[0]).toMatchObject({ unread: 1, friend: { name: 'Ann' } });

    expect((await cal.call('GET', `/v1/conversations/${conversationId}/messages`)).status).toBe(404);
    expect((await ann.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'x'.repeat(501) })).status).toBe(400);
    expect((await ann.call('PUT', '/v1/me/profile', { name: '   ' })).status).toBe(400);

    await ann.call('DELETE', `/v1/friends/${bea.id}`);
    expect((await bea.call('GET', `/v1/conversations/${conversationId}/messages`)).status).toBe(404);
  });

  it('accepts automatically when both players send a request', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await ann.call('POST', '/v1/friends/requests', { code: bea.profile.code });
    const back = await bea.call('POST', '/v1/friends/requests', { code: ann.profile.code });
    expect(back.body.result).toBe('accepted');
    expect((await ann.call('POST', '/v1/friends/requests', { code: 'NOPE2345' })).status).toBe(404);
  });
});

describe('playing against the computer', () => {
  it('deals a full hand and plays it to the end, then rotates the dealer', async () => {
    const ann = await device('Ann');
    const created = await ann.call('POST', '/v1/tables', {
      mode: 'turn',
      seats: [{ type: 'bot', level: 'easy' }, { type: 'bot', level: 'normal' }, { type: 'bot', level: 'hard' }],
    });
    expect(created.status).toBe(201);
    expect(created.body.table.status).toBe('playing');
    expect(created.body.game.view.hand).toHaveLength(14);
    expect(created.body.game.view.prompt).toMatchObject({ type: 'charleston-pass', direction: 'right' });
    expect(created.body.table.seats.map((s: { kind: string }) => s.kind)).toEqual(['human', 'bot', 'bot', 'bot']);

    const tableId = created.body.table.id;
    const done = await playOut(tableId, [ann]);
    expect(done.table.status).toBe('between');
    expect(done.game.view.result).not.toBeNull();
    expect(done.table.scores.reduce((a: number, b: number) => a + b, 0)).toBe(0);
    expect(done.game.log.some((e: { text: string }) => /Mahjong|Wall game/.test(e.text))).toBe(true);

    const next = await ann.call('POST', `/v1/tables/${tableId}/next-hand`);
    expect(next.body.table.handNumber).toBe(2);
    expect(next.body.table.dealer).toBe(1);
    expect(next.body.table.seats[1].wind).toBe('East');
    expect(next.body.game.view.hand).toHaveLength(13);
  });

  it('rejects moves out of turn and from stale views', async () => {
    const ann = await device('Ann');
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'bot' }, { type: 'bot' }, { type: 'bot' }] });
    const tableId = created.body.table.id;
    const view = created.body.game.view as PlayerView;
    expect((await ann.call('POST', `/v1/tables/${tableId}/actions`, { action: { type: 'discard', tile: view.hand[0] } })).body.error.code).toBe('not_now');
    expect((await ann.call('POST', `/v1/tables/${tableId}/actions`, { action: simpleMove(view), version: 999 })).body.error.code).toBe('stale');
    const joker = view.hand.find((t) => TILE_FACES[t] === 'JOKER');
    if (joker !== undefined) {
      const bad = await ann.call('POST', `/v1/tables/${tableId}/actions`, { action: { type: 'charleston-pass', tiles: [joker, ...view.hand.filter((t) => t !== joker).slice(0, 2)] } });
      expect(bad.body.error.code).toBe('joker_pass');
    }
  });
});

describe('playing with friends', () => {
  it('holds a seat for a friend, keeps hands private, and plays a hand together', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    const cal = await device('Cal');
    await befriend(ann, bea);

    expect((await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'friend', friendId: cal.id }, { type: 'bot' }, { type: 'bot' }] })).status).toBe(403);
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'friend', friendId: bea.id }, { type: 'bot' }, { type: 'bot', level: 'hard' }] });
    const tableId = created.body.table.id;
    expect(created.body.table.status).toBe('lobby');
    expect((await ann.call('POST', `/v1/tables/${tableId}/start`)).body.error.code).toBe('seats_open');

    expect((await bea.call('GET', '/v1/tables')).body.tables).toMatchObject([{ id: tableId, invited: true }]);
    expect((await cal.call('POST', '/v1/tables/join', { code: created.body.table.code })).body.error.code).toBe('table_full');
    const joined = await bea.call('POST', `/v1/tables/${tableId}/join`);
    expect(joined.body.mySeat).toBe(1);
    expect((await bea.call('POST', `/v1/tables/${tableId}/start`)).body.error.code).toBe('not_host');
    const started = await ann.call('POST', `/v1/tables/${tableId}/start`);
    expect(started.body.table.status).toBe('playing');

    const annView = started.body.game.view as PlayerView;
    const beaView = (await bea.call('GET', `/v1/tables/${tableId}`)).body.game.view as PlayerView;
    expect(annView.hand.some((t) => beaView.hand.includes(t))).toBe(false);
    expect((await cal.call('GET', `/v1/tables/${tableId}`)).body.game).toBeNull();

    const tableChat = started.body.conversationId;
    await bea.call('POST', `/v1/conversations/${tableChat}/messages`, { body: 'Good luck!' });
    expect((await ann.call('GET', `/v1/conversations/${tableChat}/messages`)).body.messages[0].body).toBe('Good luck!');
    expect((await cal.call('GET', `/v1/conversations/${tableChat}/messages`)).status).toBe(404);

    const done = await playOut(tableId, [ann, bea]);
    expect(done.table.status).toBe('between');
    expect(done.game.view.result.hands).toHaveLength(4);
  });

  it('hands a leaving player\'s seat to a computer so the game goes on', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await befriend(ann, bea);
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'friend', friendId: bea.id }, { type: 'bot' }, { type: 'bot' }] });
    const tableId = created.body.table.id;
    await bea.call('POST', `/v1/tables/${tableId}/join`);
    await ann.call('POST', `/v1/tables/${tableId}/start`);
    await bea.call('POST', `/v1/tables/${tableId}/leave`);
    const view = (await ann.call('GET', `/v1/tables/${tableId}`)).body;
    expect(view.table.seats[1]).toMatchObject({ kind: 'bot', botLevel: 'normal' });
    const done = await playOut(tableId, [ann]);
    expect(done.table.status).toBe('between');
  });
});

describe('live tables', () => {
  it('lets a computer move for a player who runs out of time', async () => {
    services.tables.stopAll();
    setup({ botDelayMs: 0, liveTimeouts: { pass: 0.02, turn: 0.02, claim: 0.02 } });
    const ann = await device('Ann');
    const created = await ann.call('POST', '/v1/tables', { mode: 'live', seats: [{ type: 'bot' }, { type: 'bot' }, { type: 'bot' }] });
    expect(created.body.game.deadline).not.toBeNull();
    const tableId = created.body.table.id;
    const deadline = Date.now() + 20_000;
    let status = 'playing';
    while (status === 'playing' && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 50));
      status = (await ann.call('GET', `/v1/tables/${tableId}`)).body.table.status;
    }
    expect(status).toBe('between');
  });
});

describe('realtime', () => {
  let server: Server | null = null;
  afterEach(() => server?.close());

  it('pushes chat and table updates over a WebSocket opened with a one-time ticket', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await befriend(ann, bea);
    server = serve({ fetch: app.fetch, port: 0 }) as Server;
    attachRealtime(server, services.hub);
    await new Promise((r) => server!.once('listening', r));
    const port = (server.address() as AddressInfo).port;

    const { ticket } = (await ann.call('POST', '/v1/realtime/tickets')).body;
    const socket = new WebSocket(`ws://localhost:${port}/v1/realtime?ticket=${ticket}`);
    const received: any[] = [];
    socket.onmessage = (e) => received.push(JSON.parse(String(e.data)));
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = reject;
    });
    const until = async (pred: () => boolean) => {
      for (let i = 0; i < 100 && !pred(); i++) await new Promise((r) => setTimeout(r, 20));
      return pred();
    };
    expect(await until(() => received.some((m) => m.type === 'hello'))).toBe(true);

    // The same ticket cannot be used twice.
    const replay = new WebSocket(`ws://localhost:${port}/v1/realtime?ticket=${ticket}`);
    const replayFailed = await new Promise((r) => {
      replay.onerror = () => r(true);
      replay.onopen = () => r(false);
    });
    expect(replayFailed).toBe(true);

    const { conversationId } = (await bea.call('POST', '/v1/conversations/direct', { friendId: ann.id })).body;
    await bea.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'Ready?' });
    expect(await until(() => received.some((m) => m.type === 'message' && m.message.body === 'Ready?'))).toBe(true);

    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'bot' }, { type: 'bot' }, { type: 'bot' }] });
    expect(await until(() => received.some((m) => m.type === 'table' && m.tableId === created.body.table.id && m.payload.game))).toBe(true);
    const pushed = received.findLast((m) => m.type === 'table');
    expect(pushed.payload.game.view.hand).toHaveLength(14);
    socket.close();
  });
});

describe('game night', () => {
  it('runs a date poll from an invite link, confirms a time and seats the players', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    const cal = await device('Cal');
    const soon = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();
    const created = await ann.call('POST', '/v1/nights', { title: 'Thursday mahj', location: "Ann's place", timeZone: 'America/New_York', slots: [soon(3), soon(4)] });
    expect(created.status).toBe(201);
    expect(created.body.slots).toHaveLength(2);
    const night = created.body;
    const token = night.invitePath.split('/').pop();

    expect((await cal.call('GET', `/v1/nights/${night.id}`)).status).toBe(403);
    const preview = await cal.call('GET', `/v1/night-invites/${token}`);
    expect(preview.body).toMatchObject({ title: 'Thursday mahj', host: { name: 'Ann' } });

    await bea.call('POST', `/v1/night-invites/${token}/join`);
    await cal.call('POST', `/v1/night-invites/${token}/join`);
    const [first, second] = night.slots.map((s: { id: string }) => s.id);
    await ann.call('PUT', `/v1/nights/${night.id}/me`, { votes: [first] });
    await bea.call('PUT', `/v1/nights/${night.id}/me`, { rsvp: 'yes', votes: [second] });
    let detail = (await cal.call('PUT', `/v1/nights/${night.id}/me`, { rsvp: 'no' })).body;
    expect(detail.tied).toBe(true);
    expect(detail.variant).toBe('two');
    expect((await bea.call('POST', `/v1/nights/${night.id}/confirm`, { slotId: first })).status).toBe(403);
    expect((await bea.call('GET', `/v1/nights/${night.id}/calendar.ics`)).status).toBe(409);

    detail = (await ann.call('POST', `/v1/nights/${night.id}/confirm`, { slotId: second })).body;
    expect(detail).toMatchObject({ status: 'confirmed', confirmedSlot: second });
    expect([...detail.seats].sort()).toEqual([ann.id, bea.id].sort());
    expect((await bea.call('PUT', `/v1/nights/${night.id}/me`, { votes: [first] })).body.error.code).toBe('confirmed');

    const ics = await bea.call('GET', `/v1/nights/${night.id}/calendar.ics`);
    expect(ics.raw).toContain('BEGIN:VEVENT');
    expect(ics.raw).toContain('SUMMARY:Thursday mahj');
    expect(ics.raw).toContain("LOCATION:Ann's place");
    expect((await bea.call('GET', '/v1/nights')).body.nights[0]).toMatchObject({ title: 'Thursday mahj', status: 'confirmed', myRsvp: 'yes' });

    // Not everyone can make it in person: play online instead.
    const table = await ann.call('POST', `/v1/nights/${night.id}/table`, { mode: 'live' });
    expect(table.status).toBe(201);
    expect(table.body.table.seats.map((s: { kind: string; reservedFor: string | null }) => s.reservedFor ?? s.kind)).toEqual(['human', bea.id, 'bot', 'bot']);
    expect(table.body.table.nightId).toBe(night.id);
  });

  it('rejects bad time zones and too many options', async () => {
    const ann = await device('Ann');
    const soon = new Date(Date.now() + 86_400_000).toISOString();
    expect((await ann.call('POST', '/v1/nights', { title: 'X', timeZone: 'Mars/Olympus', slots: [soon] })).status).toBe(400);
    expect((await ann.call('POST', '/v1/nights', { title: 'X', timeZone: 'UTC', slots: [soon, soon, soon, soon] })).status).toBe(400);
  });
});

describe('deleting data', () => {
  it('replaces a deleted player with a computer and removes their friendships', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await befriend(ann, bea);
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'friend', friendId: bea.id }, { type: 'bot' }, { type: 'bot' }] });
    await bea.call('POST', `/v1/tables/${created.body.table.id}/join`);
    const res = await app.request('/v1/me', { method: 'DELETE', headers: { cookie: '', 'x-confirm-delete': 'delete-my-data', authorization: `Bearer ${bea.token}` } });
    expect(res.status).toBe(200);
    const view = (await ann.call('GET', `/v1/tables/${created.body.table.id}`)).body;
    expect(view.table.seats[1].kind).toBe('bot');
    expect((await ann.call('GET', '/v1/friends')).body.friends).toEqual([]);
  });
});

describe('safety', () => {
  const moderator = (method: string, path: string, body?: unknown, token = 'test-moderator-token') =>
    app.request(path, { method, headers: { 'content-type': 'application/json', 'x-admin-token': token }, body: body === undefined ? undefined : JSON.stringify(body) });
  const openReports = async (): Promise<any> => (await moderator('GET', '/v1/admin/reports')).json();

  /** Ann hosts a table with Bea and Cy seated; returns the table chat id. */
  async function tableOfThree() {
    const ann = await device('Ann');
    const bea = await device('Bea');
    const cy = await device('Cy');
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'open' }, { type: 'open' }, { type: 'bot' }] });
    await bea.call('POST', '/v1/tables/join', { code: created.body.table.code });
    await cy.call('POST', '/v1/tables/join', { code: created.body.table.code });
    return { ann, bea, cy, tableId: created.body.table.id as string, chat: created.body.conversationId as string };
  }
  const bodies = async (d: Device, chat: string) => ((await d.call('GET', `/v1/conversations/${chat}/messages`)).body.messages as { body: string }[]).map((m) => m.body);

  it('asks players to agree to the community rules before chatting or adding friends', async () => {
    const ann = await device('Ann');
    const cy = await device('Cy', { rules: false });
    expect((await cy.call('GET', '/v1/me/profile')).body).toMatchObject({ rulesAccepted: false, suspended: false });
    const refused = await cy.call('POST', '/v1/friends/requests', { code: ann.profile.code });
    expect(refused.status).toBe(403);
    expect(refused.body.error.code).toBe('rules_required');
    await cy.call('POST', '/v1/me/rules');
    expect((await cy.call('GET', '/v1/me/profile')).body.rulesAccepted).toBe(true);
    expect((await cy.call('POST', '/v1/friends/requests', { code: ann.profile.code })).status).toBe(200);
  });

  it('filters slurs and profanity from messages, names and game nights', async () => {
    const { ann, chat } = await tableOfThree();
    expect((await ann.call('PUT', '/v1/me/profile', { name: 'Sh1t Head' })).body.error.code).toBe('bad_name');
    const message = await ann.call('POST', `/v1/conversations/${chat}/messages`, { body: 'what a shitty pass' });
    expect(message.status).toBe(400);
    expect(message.body.error.code).toBe('objectionable');
    expect((await ann.call('POST', `/v1/conversations/${chat}/messages`, { body: 'Nice pass!' })).status).toBe(201);
    const night = await ann.call('POST', '/v1/nights', { title: 'Fuck night', timeZone: 'America/New_York', slots: [new Date(Date.now() + 86_400_000).toISOString()] });
    expect(night.body.error.code).toBe('objectionable');
  });

  it('blocking ends the friendship and keeps the two players apart everywhere', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await befriend(ann, bea);
    const table = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'friend', friendId: bea.id }, { type: 'bot' }, { type: 'bot' }] });
    await bea.call('POST', `/v1/tables/${table.body.table.id}/join`);
    const chat = table.body.conversationId;
    await bea.call('POST', `/v1/conversations/${chat}/messages`, { body: 'Before the block' });

    expect((await ann.call('POST', '/v1/blocks', { playerId: bea.id })).status).toBe(200);
    expect((await ann.call('GET', '/v1/friends')).body.friends).toEqual([]);
    expect((await bea.call('GET', '/v1/friends')).body.friends).toEqual([]);
    expect((await ann.call('GET', '/v1/blocks')).body.blocked).toMatchObject([{ id: bea.id, name: 'Bea' }]);
    expect((await bea.call('GET', '/v1/blocks')).body.blocked).toEqual([]);

    // Messages disappear both ways, and new ones are not pushed to the other player.
    const sendMany = vi.spyOn(services.hub, 'sendMany');
    await bea.call('POST', `/v1/conversations/${chat}/messages`, { body: 'After the block' });
    const pushedTo = sendMany.mock.calls.find(([, m]) => m.type === 'message')?.[0] ?? [];
    expect(pushedTo).toContain(bea.id);
    expect(pushedTo).not.toContain(ann.id);
    await ann.call('POST', `/v1/conversations/${chat}/messages`, { body: 'From Ann' });
    expect(await bodies(ann, chat)).toEqual(['From Ann']);
    expect(await bodies(bea, chat)).toEqual(['Before the block', 'After the block']);

    // A blocked player can't send a request, join the blocker's tables or open their invites.
    expect((await bea.call('POST', '/v1/friends/requests', { code: ann.profile.code })).status).toBe(404);
    const second = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'open' }, { type: 'bot' }, { type: 'bot' }] });
    const join = await bea.call('POST', '/v1/tables/join', { code: second.body.table.code });
    expect(join.status).toBe(403);
    expect(join.body.error.code).toBe('blocked');
    const night = await ann.call('POST', '/v1/nights', { title: 'Mahjong night', timeZone: 'America/New_York', slots: [new Date(Date.now() + 86_400_000).toISOString()] });
    const token = night.body.invitePath.split('/').pop();
    expect((await bea.call('GET', `/v1/night-invites/${token}`)).status).toBe(404);
    expect((await bea.call('POST', `/v1/night-invites/${token}/join`)).status).toBe(404);

    // Unblocking lets them connect again.
    await ann.call('DELETE', `/v1/blocks/${bea.id}`);
    expect((await bea.call('POST', '/v1/friends/requests', { code: ann.profile.code })).body.result).toBe('requested');
  });

  it('hides a reported message for the reporter, then for everyone, and lets a moderator suspend the sender', async () => {
    const { ann, bea, cy, chat } = await tableOfThree();
    const sent = await bea.call('POST', `/v1/conversations/${chat}/messages`, { body: 'You all play like idiots' });
    const messageId = sent.body.id;

    const first = await ann.call('POST', '/v1/reports', { messageId, reason: 'harassment', note: 'Rude to the table' });
    expect(first.status).toBe(201);
    expect(await bodies(ann, chat)).toEqual([]);
    expect(await bodies(cy, chat)).toEqual(['You all play like idiots']);
    await cy.call('POST', '/v1/reports', { messageId, reason: 'harassment' });
    expect(await bodies(cy, chat)).toEqual([]);
    expect(await bodies(bea, chat)).toEqual([]);

    // Players can't report themselves or messages they can't see.
    expect((await bea.call('POST', '/v1/reports', { messageId, reason: 'spam' })).status).toBe(400);
    const outsider = await device('Dee');
    expect((await outsider.call('POST', '/v1/reports', { messageId, reason: 'spam' })).status).toBe(404);

    const open = await openReports();
    expect(open.reports).toHaveLength(2);
    expect(open.reports[0]).toMatchObject({ reason: 'harassment', note: 'Rude to the table', reported: { kind: 'message', body: 'You all play like idiots', name: 'Bea' }, target: { id: bea.id, reportsAgainst: 2 } });

    const resolved = await moderator('POST', `/v1/admin/reports/${open.reports[0].id}`, { action: 'suspend' });
    expect(resolved.status).toBe(200);
    expect((await openReports()).reports).toEqual([]);
    expect((await bea.call('GET', '/v1/me/profile')).body.suspended).toBe(true);
    const muted = await bea.call('POST', `/v1/conversations/${chat}/messages`, { body: 'Sorry' });
    expect(muted.status).toBe(403);
    expect(muted.body.error.code).toBe('suspended');
    expect((await bea.call('POST', '/v1/friends/requests', { code: ann.profile.code })).body.error.code).toBe('suspended');

    await moderator('POST', `/v1/admin/players/${bea.id}/unsuspend`);
    expect((await bea.call('POST', `/v1/conversations/${chat}/messages`, { body: 'Sorry' })).status).toBe(201);
  });

  it('reports a player and blocks them in one step', async () => {
    const { ann, bea } = await tableOfThree();
    const report = await ann.call('POST', '/v1/reports', { playerId: bea.id, reason: 'cheating', block: true });
    expect(report.body).toMatchObject({ reported: true, blocked: true });
    expect((await ann.call('GET', '/v1/blocks')).body.blocked).toMatchObject([{ id: bea.id }]);
    const open = await openReports();
    expect(open.reports[0]).toMatchObject({ reason: 'cheating', reported: { kind: 'player', name: 'Bea' } });
  });

  it('keeps moderator tools behind the token', async () => {
    expect((await moderator('GET', '/v1/admin/reports', undefined, 'wrong')).status).toBe(401);
    const closed = createApp({ db, content, config: { ...config, adminToken: null }, services });
    expect((await closed.request('/v1/admin/reports', { headers: { 'x-admin-token': 'test-moderator-token' } })).status).toBe(404);
  });

  it('removes blocks and reports with deleted data', async () => {
    const { ann, bea, chat } = await tableOfThree();
    const sent = await bea.call('POST', `/v1/conversations/${chat}/messages`, { body: 'Hello' });
    await ann.call('POST', '/v1/reports', { messageId: sent.body.id, reason: 'spam', block: true });
    await app.request('/v1/me', { method: 'DELETE', headers: { 'x-confirm-delete': 'delete-my-data', authorization: `Bearer ${bea.token}` } });
    expect(db.prepare('SELECT COUNT(*) AS n FROM blocks').get()).toEqual({ n: 0 });
    expect(db.prepare('SELECT COUNT(*) AS n FROM reports').get()).toEqual({ n: 0 });
  });
});

describe('table fixes from the walkthrough', () => {
  /** Ann (East) and Bea (South) at a table with two computers, Charleston in progress. */
  async function twoPlayerTable(mode: 'live' | 'turn') {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await befriend(ann, bea);
    const created = await ann.call('POST', '/v1/tables', { mode, seats: [{ type: 'friend', friendId: bea.id }, { type: 'bot' }, { type: 'bot' }] });
    const tableId = created.body.table.id as string;
    await bea.call('POST', `/v1/tables/${tableId}/join`);
    await ann.call('POST', `/v1/tables/${tableId}/start`);
    return { ann, bea, tableId };
  }
  const free = (view: PlayerView) => view.hand.filter((t) => TILE_FACES[t] !== 'JOKER').slice(0, 3);

  it('accepts a pass made at the same moment as another player’s, but not one from an earlier step', async () => {
    const { ann, bea, tableId } = await twoPlayerTable('turn');
    const a = (await ann.call('GET', `/v1/tables/${tableId}`)).body;
    const b = (await bea.call('GET', `/v1/tables/${tableId}`)).body;
    const phase = 'charleston:1:right';
    expect((await ann.call('POST', `/v1/tables/${tableId}/actions`, { action: { type: 'charleston-pass', tiles: free(a.game.view) }, version: a.game.version, phase })).status).toBe(200);
    // Bea's view is one version behind now, but it is still the same pass.
    const late = await bea.call('POST', `/v1/tables/${tableId}/actions`, { action: { type: 'charleston-pass', tiles: free(b.game.view) }, version: b.game.version, phase });
    expect(late.status).toBe(200);
    // A pass aimed at a step that is over is still refused.
    const now = (await ann.call('GET', `/v1/tables/${tableId}`)).body;
    expect(now.game.view.phase).toMatchObject({ kind: 'charleston', direction: 'across' });
    const wrong = await ann.call('POST', `/v1/tables/${tableId}/actions`, { action: { type: 'charleston-pass', tiles: free(now.game.view) }, version: now.game.version - 1, phase });
    expect(wrong.body.error.code).toBe('stale');
  });

  it('accepts a call decision made while another player answers the same discard', async () => {
    const { ann, bea, tableId } = await twoPlayerTable('turn');
    // Set up the moment after a computer discards, with Ann and Bea both still deciding.
    const game = db.prepare('SELECT id, dealer, state FROM games WHERE table_id = ?').get(tableId) as { id: string; dealer: number; state: string };
    const seatOf = (position: number) => (position - game.dealer + 4) % 4;
    const state = JSON.parse(game.state);
    const from = seatOf(2);
    const tile = state.wall.pop();
    state.discards.push({ tile, seat: from });
    state.phase = { kind: 'claim', tile, from, responses: [0, 1, 2, 3].map((s) => (s === seatOf(0) || s === seatOf(1) ? null : { type: 'pass' })) };
    db.prepare('UPDATE games SET state = ? WHERE id = ?').run(JSON.stringify(state), game.id);

    const b = (await bea.call('GET', `/v1/tables/${tableId}`)).body;
    expect(b.game.view.phase).toMatchObject({ kind: 'claim', tile });
    const pass = { type: 'claim', response: { type: 'pass' } };
    expect((await ann.call('POST', `/v1/tables/${tableId}/actions`, { action: pass, version: b.game.version, phase: `claim:${tile}` })).status).toBe(200);
    // A decision about some other discard is still refused as stale...
    const other = await bea.call('POST', `/v1/tables/${tableId}/actions`, { action: pass, version: b.game.version, phase: `claim:${tile + 1}` });
    expect(other.body.error.code).toBe('stale');
    // ...but Bea's answer to this discard counts, though Ann answered first.
    expect((await bea.call('POST', `/v1/tables/${tableId}/actions`, { action: pass, version: b.game.version, phase: `claim:${tile}` })).status).toBe(200);
    // Play moved past this discard (the computers may already be on the next one).
    const after = (await ann.call('GET', `/v1/tables/${tableId}`)).body;
    expect(after.game.view.phase.kind === 'claim' ? after.game.view.phase.tile : null).not.toBe(tile);
  });

  it('pushes the live deadline to players and says when the computer moved for someone', async () => {
    services.tables.stopAll();
    setup({ botDelayMs: 0, liveTimeouts: { pass: 0.05, turn: 0.05, claim: 0.05 } });
    const { ann, bea, tableId } = await twoPlayerTable('live');
    const pushed = vi.spyOn(services.hub, 'send');
    // Nobody moves: after the deadline the computer passes for both of them.
    let view = (await ann.call('GET', `/v1/tables/${tableId}`)).body;
    for (let i = 0; i < 40 && view.game.view.phase.direction === 'right'; i++) {
      await new Promise((r) => setTimeout(r, 25));
      view = (await ann.call('GET', `/v1/tables/${tableId}`)).body;
    }
    expect(view.game.view.phase.direction).not.toBe('right');
    const timeouts = view.game.log.filter((e: { event: { type: string } }) => e.event.type === 'timeout');
    expect(timeouts.map((e: { text: string }) => e.text)).toEqual(expect.arrayContaining(['Ann ran out of time, so the computer moved for them.', 'Bea ran out of time, so the computer moved for them.']));
    const withDeadline = pushed.mock.calls.filter(([id, m]) => id === bea.id && m.type === 'table' && (m.payload as { game?: { deadline: string | null } }).game?.deadline);
    expect(withDeadline.length).toBeGreaterThan(0);
  });

  it('paces computer players in turn-based games too', async () => {
    services.tables.stopAll();
    setup({ botDelayMs: 40 });
    const ann = await device('Ann');
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'bot' }, { type: 'bot' }, { type: 'bot' }], settings: { skipCharleston: true } });
    const tableId = created.body.table.id;
    const view = created.body.game.view as PlayerView;
    const discard = await ann.call('POST', `/v1/tables/${tableId}/actions`, { action: { type: 'discard', tile: free(view)[0] }, version: created.body.game.version });
    // Straight after the discard the computers haven't all played yet.
    const right = discard.body.game.view.phase;
    expect(right.kind === 'claim' || (right.kind === 'turn' && right.seat !== 0)).toBe(true);
    await new Promise((r) => setTimeout(r, 600));
    expect((await ann.call('GET', `/v1/tables/${tableId}`)).body.game.version).toBeGreaterThan(discard.body.game.version);
  });

  it('closes a table when the last person leaves', async () => {
    const ann = await device('Ann');
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'bot' }, { type: 'bot' }, { type: 'bot' }] });
    expect((await ann.call('GET', '/v1/tables')).body.tables[0]).toMatchObject({ humans: 1, invited: false });
    await ann.call('POST', `/v1/tables/${created.body.table.id}/leave`);
    expect((await ann.call('GET', '/v1/tables')).body.tables).toEqual([]);
  });

  it('lets an invited friend turn the seat down, opening it for anyone', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await befriend(ann, bea);
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'friend', friendId: bea.id }, { type: 'bot' }, { type: 'bot' }] });
    const tableId = created.body.table.id;
    expect((await bea.call('GET', '/v1/tables')).body.tables[0]).toMatchObject({ id: tableId, invited: true });
    await bea.call('POST', `/v1/tables/${tableId}/leave`);
    expect((await bea.call('GET', '/v1/tables')).body.tables).toEqual([]);
    const seat = (await ann.call('GET', `/v1/tables/${tableId}`)).body.table.seats[1];
    expect(seat).toMatchObject({ kind: 'open', reservedFor: null });
  });

  it('says whose friend code an invite is, and takes Contact us messages', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    expect((await bea.call('GET', `/v1/friend-codes/${ann.profile.code}`)).body).toMatchObject({ name: 'Ann', isYou: false });
    expect((await bea.call('GET', '/v1/friend-codes/NOPE1234')).status).toBe(404);
    await ann.call('POST', '/v1/blocks', { playerId: bea.id });
    expect((await bea.call('GET', `/v1/friend-codes/${ann.profile.code}`)).status).toBe(404);

    expect((await bea.call('POST', '/v1/feedback', { message: 'Love the Charleston!' })).status).toBe(201);
    const inbox = await (await app.request('/v1/admin/feedback', { headers: { 'x-admin-token': 'test-moderator-token' } })).json() as { feedback: { message: string; from: { name: string } }[] };
    expect(inbox.feedback).toMatchObject([{ message: 'Love the Charleston!', from: { name: 'Bea' } }]);
  });
});

describe('push notifications', () => {
  let pushes: ExpoMessage[];
  let ticket: (m: ExpoMessage) => ExpoTicket;
  const token = (name: string) => `ExponentPushToken[${name}-device-0001]`;
  const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
  const to = (name: string) => pushes.filter((p) => p.to === token(name));
  beforeEach(() => {
    services.tables.stopAll();
    services.matchmaker.stop();
    pushes = [];
    ticket = () => ({ status: 'ok', id: 'ticket' });
    setup({ pushSender: async (messages) => (pushes.push(...messages), messages.map((m) => ticket(m))) });
  });

  it('saves a phone’s token and the kinds of notification a player wants', async () => {
    const ann = await device('Ann');
    expect((await ann.call('PUT', '/v1/me/push-token', { token: 'not-a-token', platform: 'ios' })).status).toBe(400);
    expect((await ann.call('PUT', '/v1/me/push-token', { token: token('ann'), platform: 'ios' })).status).toBe(200);
    expect((await ann.call('GET', '/v1/me/notifications')).body).toEqual({ settings: { turns: true, invites: true, messages: true, nights: true }, devices: 1 });
    expect((await ann.call('PUT', '/v1/me/notifications', { messages: false })).body.settings).toMatchObject({ messages: false, turns: true });
    expect((await ann.call('PUT', '/v1/me/notifications', { sounds: true })).status).toBe(400);
    await ann.call('DELETE', '/v1/me/push-token', { token: token('ann') });
    expect((await ann.call('GET', '/v1/me/notifications')).body.devices).toBe(0);
  });

  it('tells players about friend requests and messages, but not while the app is in front of them', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await bea.call('PUT', '/v1/me/push-token', { token: token('bea'), platform: 'android' });
    await ann.call('PUT', '/v1/me/push-token', { token: token('ann'), platform: 'ios' });
    await ann.call('POST', '/v1/friends/requests', { code: bea.profile.code });
    expect(to('bea')).toMatchObject([{ title: 'New friend request', body: 'Ann would like to be friends.', data: { url: '/friends', category: 'invites' }, channelId: 'invites' }]);
    await bea.call('POST', `/v1/friends/${ann.id}/accept`);
    expect(to('ann')).toMatchObject([{ title: 'You have a new friend' }]);

    const { conversationId } = (await ann.call('POST', '/v1/conversations/direct', { friendId: bea.id })).body;
    await ann.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'Mahjong tonight?' });
    await ann.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'Bring snacks' });
    // One push per conversation a minute, so a burst of messages doesn't buzz the phone over and over.
    expect(to('bea').filter((p) => p.data.category === 'messages')).toMatchObject([{ title: 'Ann', body: 'Mahjong tonight?', data: { url: `/chat/${conversationId}` } }]);

    // With the app open (a connected socket that hasn't gone to the background), nothing is pushed.
    const socket = { send: () => undefined, close: () => undefined };
    services.hub.connect(ann.id, socket);
    await bea.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'Yes!' });
    expect(to('ann').filter((p) => p.data.category === 'messages')).toEqual([]);
    services.hub.setActive(socket, false);
    await bea.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'See you at 7' });
    expect(to('ann').filter((p) => p.data.category === 'messages')).toMatchObject([{ body: 'See you at 7' }]);

    // Turning a kind off stops it.
    await ann.call('PUT', '/v1/me/notifications', { messages: false });
    services.notifier.forget(ann.id, `chat:${conversationId}`);
    await bea.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'Running late' });
    expect(to('ann').filter((p) => p.data.category === 'messages')).toHaveLength(1);
  });

  it('nudges each player once when a turn-based table waits on them, and invites friends to a held seat', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await befriend(ann, bea);
    await bea.call('PUT', '/v1/me/push-token', { token: token('bea'), platform: 'ios' });
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'friend', friendId: bea.id }, { type: 'bot' }, { type: 'bot' }] });
    const tableId = created.body.table.id;
    expect(to('bea')).toMatchObject([{ title: 'Table invite', body: 'Ann saved you a seat at a turn-based table.', data: { url: `/table/${tableId}` } }]);
    await bea.call('POST', `/v1/tables/${tableId}/join`);
    await ann.call('POST', `/v1/tables/${tableId}/start`);
    const moves = () => to('bea').filter((p) => p.title === 'Your move');
    expect(moves()).toMatchObject([{ body: `Time to pass tiles at Table ${created.body.table.code}.`, data: { url: `/table/${tableId}`, category: 'turns' } }]);
    // Ann passing doesn't nudge Bea again while the table still waits on her.
    const annView = (await ann.call('GET', `/v1/tables/${tableId}`)).body;
    const pass = (view: any) => view.game.view.hand.filter((t: number) => t < 144).slice(0, 3);
    const phase = (view: any) => `charleston:${view.game.view.phase.round}:${view.game.view.phase.direction}`;
    expect((await ann.call('POST', `/v1/tables/${tableId}/actions`, { version: annView.game.version, phase: phase(annView), action: { type: 'charleston-pass', tiles: pass(annView) } })).status).toBe(200);
    expect(moves()).toHaveLength(1);
    // Once Bea plays, the next time the table waits on her she hears about it again.
    const beaView = (await bea.call('GET', `/v1/tables/${tableId}`)).body;
    expect((await bea.call('POST', `/v1/tables/${tableId}/actions`, { version: beaView.game.version, phase: phase(beaView), action: { type: 'charleston-pass', tiles: pass(beaView) } })).status).toBe(200);
    expect(moves()).toHaveLength(2);
  });

  it('forgets a phone that no longer takes notifications, and tells guests when a Game Night is set', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    await bea.call('PUT', '/v1/me/push-token', { token: token('bea'), platform: 'ios' });
    const night = (await ann.call('POST', '/v1/nights', { title: 'Thursday mahjong', timeZone: 'America/New_York', slots: ['2030-01-03T00:00:00.000Z'] })).body;
    await bea.call('POST', `/v1/night-invites/${night.invitePath.split('/').pop()}/join`);
    await bea.call('PUT', `/v1/nights/${night.id}/me`, { rsvp: 'yes' });
    ticket = () => ({ status: 'error', message: 'gone', details: { error: 'DeviceNotRegistered' } });
    await ann.call('POST', `/v1/nights/${night.id}/confirm`, { slotId: night.slots[0].id });
    expect(to('bea')).toMatchObject([{ title: 'Thursday mahjong is on!', body: 'Wednesday, Jan 2, 7:00 PM. Add it to your calendar so you don’t miss it.'.replace('’', "'") }]);
    await tick();
    expect((await bea.call('GET', '/v1/me/notifications')).body.devices).toBe(0);
  });
});

describe('report a problem', () => {
  const admin = (path: string, init: RequestInit = {}) => app.request(path, { ...init, headers: { 'content-type': 'application/json', 'x-admin-token': 'test-moderator-token', ...(init.headers ?? {}) } });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0xff, 0xd9]);
  const details = { device: 'iPhone 15', os: 'iOS 26.1', appVersion: '0.1.0', largeTiles: true, recentErrors: ['GET /v1/daily: 500'] };

  it('takes a report with device details and a screenshot, for moderators to review and close', async () => {
    const ann = await device('Ann');
    const sent = await ann.call('POST', '/v1/bug-reports', { description: 'The discard button did nothing', screen: '/table/abc', details, screenshot: { type: 'image/jpeg', data: jpeg.toString('base64') } });
    expect(sent.status).toBe(201);
    const open = (await (await admin('/v1/admin/bug-reports')).json()) as { bugReports: any[] };
    expect(open.bugReports).toMatchObject([{ id: sent.body.id, status: 'open', description: 'The discard button did nothing', screen: '/table/abc', details, hasScreenshot: true, from: { name: 'Ann' } }]);

    const shot = await admin(`/v1/admin/bug-reports/${sent.body.id}/screenshot`);
    expect(shot.status).toBe(200);
    expect(shot.headers.get('content-type')).toBe('image/jpeg');
    expect(Buffer.from(await shot.arrayBuffer())).toEqual(jpeg);
    expect((await app.request(`/v1/admin/bug-reports/${sent.body.id}/screenshot`)).status).toBe(401);

    const plain = await ann.call('POST', '/v1/bug-reports', { description: 'Sounds stopped', screen: '/you' });
    expect(plain.status).toBe(201);
    expect((await admin(`/v1/admin/bug-reports/${plain.body.id}/screenshot`)).status).toBe(404);

    expect((await admin(`/v1/admin/bug-reports/${sent.body.id}`, { method: 'POST', body: JSON.stringify({ action: 'close' }) })).status).toBe(200);
    expect(((await (await admin('/v1/admin/bug-reports')).json()) as { bugReports: { id: string }[] }).bugReports.map((r) => r.id)).toEqual([plain.body.id]);
    const all = (await (await admin('/v1/admin/bug-reports?status=all')).json()) as { bugReports: { id: string; status: string }[] };
    expect(all.bugReports.find((r) => r.id === sent.body.id)?.status).toBe('closed');
    expect((await admin('/v1/admin/bug-reports/nope', { method: 'POST', body: JSON.stringify({ action: 'close' }) })).status).toBe(404);
  });

  it('turns away empty reports, fake or huge screenshots, and too many reports', async () => {
    const ann = await device('Ann');
    expect((await app.request('/v1/bug-reports', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ description: 'x', screen: '/' }) })).status).toBe(401);
    expect((await ann.call('POST', '/v1/bug-reports', { description: '   ', screen: '/' })).status).toBe(400);
    const fake = await ann.call('POST', '/v1/bug-reports', { description: 'Broken', screen: '/', screenshot: { type: 'image/png', data: jpeg.toString('base64') } });
    expect(fake).toMatchObject({ status: 400, body: { error: { code: 'bad_screenshot' } } });
    const huge = await ann.call('POST', '/v1/bug-reports', { description: 'Broken', screen: '/', screenshot: { type: 'image/jpeg', data: 'A'.repeat(2_200_000) } });
    expect(huge.status).toBe(413);
    const bea = await device('Bea');
    for (let i = 0; i < 6; i += 1) expect((await bea.call('POST', '/v1/bug-reports', { description: `Problem ${i}`, screen: '/' })).status).toBe(201);
    expect((await bea.call('POST', '/v1/bug-reports', { description: 'One more', screen: '/' })).status).toBe(429);
  });

  it('removes a player’s reports when they delete their data', async () => {
    const ann = await device('Ann');
    await ann.call('POST', '/v1/bug-reports', { description: 'Broken', screen: '/' });
    await app.request('/v1/me', { method: 'DELETE', headers: { 'x-confirm-delete': 'delete-my-data', authorization: `Bearer ${ann.token}` } });
    expect(((await (await admin('/v1/admin/bug-reports?status=all')).json()) as { bugReports: unknown[] }).bugReports).toEqual([]);
  });
});

describe('stats, ranked play and voice chat', () => {
  const until = async <T>(fn: () => Promise<T | null | undefined | false>, ms = 3000): Promise<T> => {
    const end = Date.now() + ms;
    for (;;) {
      const value = await fn();
      if (value) return value;
      if (Date.now() > end) throw new Error('timed out');
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const quickMatches = () => {
    services.tables.stopAll();
    services.matchmaker.stop();
    setup({ matchFillAfterMs: { casual: 30, ranked: 30 }, matchTickMs: 20 });
  };
  const publicTableOf = (d: Device) =>
    until(async () => ((await d.call('GET', '/v1/tables')).body.tables as { id: string; kind: string }[]).find((t) => t.kind === 'public')?.id);

  it('records every hand in each player’s stats', async () => {
    const ann = await device('Ann');
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'bot' }, { type: 'bot' }, { type: 'bot' }], settings: { skipCharleston: true } });
    await playOut(created.body.table.id, [ann]);
    const stats = (await ann.call('GET', '/v1/me/stats')).body;
    expect(stats).toMatchObject({ hands: 1, card: { total: HOUSE_CARD.hands.length }, ranked: { games: 0, rating: 1200 } });
    expect(stats.recent).toHaveLength(1);
    expect(stats.card.sections.reduce((n: number, s: { total: number }) => n + s.total, 0)).toBe(HOUSE_CARD.hands.length);
  });

  it('adds offline hands to stats once each, never to ranking', async () => {
    const ann = await device('Ann');
    const won = { id: '6f1d9c2e-1a7b-4c3d-9e8f-0a1b2c3d4e5f', won: true, selfDrawn: true, jokerless: false, wallGame: false, fed: false, handId: HOUSE_CARD.hands[0]!.id, value: 25, payment: 50, playedAt: new Date().toISOString() };
    const lost = { ...won, id: '7f1d9c2e-1a7b-4c3d-9e8f-0a1b2c3d4e5f', won: false, selfDrawn: false, handId: 'not-a-hand', payment: -25 };
    expect((await ann.call('POST', '/v1/me/offline-results', { results: [won, lost] })).body.added).toBe(2);
    expect((await ann.call('POST', '/v1/me/offline-results', { results: [won] })).body.added).toBe(0);
    const stats = (await ann.call('GET', '/v1/me/stats')).body;
    expect(stats).toMatchObject({ hands: 2, wins: 1, winRate: 50, selfDrawn: 1, offline: { hands: 2, wins: 1 }, ranked: { games: 0 } });
    expect(stats.card.completed).toEqual([{ handId: HOUSE_CARD.hands[0]!.id, times: 1 }]);
  });

  it('moves ratings pairwise: the winner gains, and equal players balance out', () => {
    const changes = ratingChanges(
      [1200, 1200, 1200, 1200].map((rating) => ({ rating, human: true })),
      [75, -25, -25, -25],
    );
    expect(changes[0]).toBeGreaterThan(0);
    expect(changes[1]).toBeLessThan(0);
    // Each change is rounded to a tenth of a point, so the total lands within a rounding step of zero.
    expect(Math.abs(changes.reduce((a, b) => a + b, 0))).toBeLessThanOrEqual(0.2);
    // Computer players' ratings never move.
    expect(ratingChanges([{ rating: 1200, human: true }, { rating: 1200, human: false }], [10, -10])[1]).toBe(0);
  });

  it('matches two people for a ranked game, fills with computers and records the result', async () => {
    quickMatches();
    const ann = await device('Ann');
    const bea = await device('Bea');
    expect((await ann.call('POST', '/v1/matchmaking', { mode: 'ranked' })).body.queue).toMatchObject({ mode: 'ranked' });
    await bea.call('POST', '/v1/matchmaking', { mode: 'ranked' });
    const tableId = await publicTableOf(ann);
    expect(await publicTableOf(bea)).toBe(tableId);
    expect((await ann.call('GET', '/v1/matchmaking')).body.queue).toBeNull();
    const view = (await ann.call('GET', `/v1/tables/${tableId}`)).body;
    expect(view.table).toMatchObject({ kind: 'public', ranked: true, mode: 'live', status: 'playing' });
    expect(view.table.seats.filter((s: { kind: string }) => s.kind === 'human')).toHaveLength(2);
    // Already in a match: no second queue.
    expect((await ann.call('POST', '/v1/matchmaking', { mode: 'casual' })).body.error.code).toBe('in_match');

    await playOut(tableId, [ann, bea]);
    for (const d of [ann, bea]) expect((await d.call('GET', '/v1/me/stats')).body.ranked.games).toBe(1);
    const weekly = (await ann.call('GET', '/v1/leaderboards?board=weekly')).body;
    expect(weekly.entries.map((e: { player: { name: string } }) => e.player.name).sort()).toEqual(['Ann', 'Bea']);
    expect(weekly.you).toMatchObject({ isYou: true, games: 1 });
    // The rating board waits for a few games.
    expect((await ann.call('GET', '/v1/leaderboards?board=rating')).body.you).toBeNull();
    // One hand per matched game, and it drops off the Play list.
    expect((await ann.call('POST', `/v1/tables/${tableId}/next-hand`)).body.error.code).toBe('one_hand');
    expect((await ann.call('GET', '/v1/tables')).body.tables).toEqual([]);
  });

  it('never seats blocked players together, and keeps matched tables to quick phrases', async () => {
    quickMatches();
    const ann = await device('Ann');
    const bea = await device('Bea');
    const cal = await device('Cal');
    await ann.call('POST', '/v1/blocks', { playerId: bea.id });
    await ann.call('POST', '/v1/matchmaking', { mode: 'casual' });
    await bea.call('POST', '/v1/matchmaking', { mode: 'casual' });
    const annTable = await publicTableOf(ann);
    const beaTable = await publicTableOf(bea);
    expect(annTable).not.toBe(beaTable);

    const { conversationId, table } = (await ann.call('GET', `/v1/tables/${annTable}`)).body;
    expect((await ann.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'hi, add me on insta' })).body.error.code).toBe('phrases_only');
    expect((await ann.call('POST', `/v1/conversations/${conversationId}/messages`, { body: 'Good luck!' })).status).toBe(201);
    expect((await cal.call('POST', '/v1/tables/join', { code: table.code })).body.error.code).toBe('public_table');
    // Strangers' tables need the community rules.
    const dee = await device('Dee', { rules: false });
    expect((await dee.call('POST', '/v1/matchmaking', { mode: 'casual' })).body.error.code).toBe('rules_required');
  });

  it('counts leaving a ranked hand early as a loss', async () => {
    quickMatches();
    const ann = await device('Ann');
    await ann.call('POST', '/v1/matchmaking', { mode: 'ranked' });
    const tableId = await publicTableOf(ann);
    await ann.call('POST', `/v1/tables/${tableId}/leave`);
    const stats = (await ann.call('GET', '/v1/me/stats')).body;
    expect(stats.ranked.games).toBe(1);
    expect(stats.ranked.rating).toBeLessThan(1200);
    expect(stats.hands).toBe(0);
  });

  it('relays voice chat setup only between people seated at the same private table', async () => {
    const ann = await device('Ann');
    const bea = await device('Bea');
    const cal = await device('Cal');
    await befriend(ann, bea);
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'friend', friendId: bea.id }, { type: 'bot' }, { type: 'bot' }] });
    const tableId = created.body.table.id as string;
    await bea.call('POST', `/v1/tables/${tableId}/join`);
    const inbox = new Map<string, { type: string; [k: string]: unknown }[]>();
    for (const d of [ann, bea, cal]) {
      inbox.set(d.id, []);
      services.hub.connect(d.id, { send: (data: string) => inbox.get(d.id)!.push(JSON.parse(data)), close: () => undefined });
    }
    const last = (d: Device, type: string) => inbox.get(d.id)!.filter((m) => m.type === type).at(-1);
    const send = (d: Device, message: Record<string, unknown>) => services.hub.onClientMessage!(d.id, message);

    send(ann, { type: 'voice-join', tableId });
    send(bea, { type: 'voice-join', tableId });
    expect(last(ann, 'voice-roster')).toMatchObject({ members: [ann.id, bea.id] });
    send(cal, { type: 'voice-join', tableId });
    expect(last(cal, 'voice-denied')).toBeTruthy();

    const offer = { sdp: { type: 'offer', sdp: 'v=0' } };
    send(ann, { type: 'voice-signal', tableId, to: bea.id, data: offer });
    expect(last(bea, 'voice-signal')).toMatchObject({ from: ann.id, data: offer });
    send(ann, { type: 'voice-signal', tableId, to: bea.id, data: { evil: true } });
    send(cal, { type: 'voice-signal', tableId, to: bea.id, data: offer });
    expect(inbox.get(bea.id)!.filter((m) => m.type === 'voice-signal')).toHaveLength(1);

    await bea.call('POST', '/v1/blocks', { playerId: ann.id });
    send(ann, { type: 'voice-signal', tableId, to: bea.id, data: offer });
    expect(inbox.get(bea.id)!.filter((m) => m.type === 'voice-signal')).toHaveLength(1);

    send(bea, { type: 'voice-leave', tableId });
    expect(last(ann, 'voice-roster')).toMatchObject({ members: [ann.id] });
    expect((await ann.call('GET', '/v1/voice/config')).body.iceServers).toEqual([]);
  });
});

describe('extra cards', () => {
  it('loads valid cards from a folder, skips broken ones, and lets a table play with one', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cards-'));
    const spec = { ...cardToSpec(HOUSE_CARD), id: 'club-card-test', name: 'Club card' };
    writeFileSync(join(dir, 'club.json'), JSON.stringify(spec));
    writeFileSync(join(dir, 'broken.json'), JSON.stringify({ ...spec, id: 'broken', hands: [{ id: 'x', section: 'evens', pattern: 'FF 22a', value: 25 }] }));
    writeFileSync(join(dir, '_skipped.json'), 'not even json');
    const { loaded, errors } = loadCards(dir);
    expect(loaded).toEqual(['club-card-test']);
    expect(errors.join()).toMatch(/broken\.json: .*expected 14/);

    const ann = await device('Ann');
    const cards = (await ann.call('GET', '/v1/cards')).body.cards as { id: string }[];
    expect(cards.map((c) => c.id)).toEqual([HOUSE_CARD.id, 'club-card-test']);
    const created = await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'bot' }, { type: 'bot' }, { type: 'bot' }], cardId: 'club-card-test', settings: { skipCharleston: true } });
    expect(created.body.table.cardId).toBe('club-card-test');
    expect((await ann.call('POST', '/v1/tables', { mode: 'turn', seats: [{ type: 'bot' }, { type: 'bot' }, { type: 'bot' }], cardId: 'nope' })).body.error.code).toBe('unknown_card');
    await playOut(created.body.table.id, [ann]);
  });
});
