import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { serve } from '@hono/node-server';
import { TILE_FACES, type PlayerView } from '@daily-rack/core/mahjong';
import { createApp, createServices, type Services } from './app.ts';
import { loadContent, syncRevisions } from './content.ts';
import { openDb, type Db } from './db.ts';
import { attachRealtime } from './realtime-server.ts';

const content = loadContent(join(import.meta.dirname, '../../../content'), { devRotate: true });
const config = { brand: 'Daily Rack', publicBaseUrl: 'https://dailyrack.test', secureCookies: false, splitThreshold: 30 };

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
afterEach(() => services.tables.stopAll());

async function device(name?: string) {
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
