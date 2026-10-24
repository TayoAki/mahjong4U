import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { loadContent, nextPublicationAt, syncRevisions } from './content.ts';
import { openDb, type Db } from './db.ts';

const content = loadContent(join(import.meta.dirname, '../../../content'), { devRotate: false });
const DEMO = 'demo-charleston-001-r1';
const JOKER_RACK = 'practice-369-006-r1';

let db: Db;
let clock = new Date('2026-10-24T16:00:00Z');
let app: ReturnType<typeof createApp>;

beforeEach(() => {
  db = openDb(':memory:');
  syncRevisions(db, content, clock);
  clock = new Date('2026-10-24T16:00:00Z');
  app = createApp({
    db,
    content,
    config: { brand: 'Daily Rack', publicBaseUrl: null, secureCookies: false, splitThreshold: 2, now: () => clock },
  });
});

/** A device with its own cookie jar. */
async function device() {
  let cookie = '';
  const call = async (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) => {
    const res = await app.request(path, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null, raw: text };
  };
  const session = await call('POST', '/v1/guest-sessions');
  return { call, principalId: session.body.principalId as string };
}

function submit(d: Awaited<ReturnType<typeof device>>, tiles: string[], extra: Record<string, unknown> = {}) {
  return d.call('POST', '/v1/attempts', {
    revisionId: DEMO,
    sectionId: 'evens',
    tileInstanceIds: tiles,
    idempotencyKey: randomUUID(),
    ...extra,
  });
}

describe('guest sessions and the daily rack', () => {
  it('reuses an existing session instead of creating another', async () => {
    const a = await device();
    const again = await a.call('POST', '/v1/guest-sessions');
    expect(again.body).toMatchObject({ principalId: a.principalId, created: false });
  });

  it('serves the scheduled rack without its answer or split', async () => {
    const a = await device();
    const daily = await a.call('GET', '/v1/daily');
    expect(daily.status).toBe(200);
    expect(daily.body.contentDay).toBe('2026-10-24');
    expect(daily.body.puzzle.revisionId).toBe(DEMO);
    expect(daily.body.puzzle.tiles).toHaveLength(13);
    for (const leak of ['One strong pass', 'reasons', '"answer"', 'alternates']) expect(daily.raw).not.toContain(leak);
  });

  it('reports no rack on an unscheduled day', async () => {
    clock = new Date('2027-03-01T16:00:00Z');
    const a = await device();
    const daily = await a.call('GET', '/v1/daily');
    expect(daily.body.puzzle).toBeNull();
    expect(daily.body.nextPublicationAt).toBe('2027-03-02T05:00:00.000Z');
  });

  it('computes the next publication across daylight saving time', () => {
    expect(nextPublicationAt(new Date('2026-10-31T16:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-11-01T04:00:00.000Z',
    );
    expect(nextPublicationAt(new Date('2026-11-01T16:00:00Z'), 'America/New_York').toISOString()).toBe(
      '2026-11-02T05:00:00.000Z',
    );
  });
});

describe('submitting a pass', () => {
  it('rejects invalid selections and keeps the rack unanswered', async () => {
    const a = await device();
    expect((await submit(a, ['t09', 't10'])).body.error.code).toBe('invalid_selection');
    expect((await submit(a, ['t09', 't09', 't10'])).body.error.code).toBe('invalid_selection');
    expect((await submit(a, ['t09', 't10', 'zz'])).body.error.code).toBe('invalid_selection');
    expect((await submit(a, ['t09', 't10', 't11'], { sectionId: 'quints' })).body.error.code).toBe('invalid_section');
    const joker = await submit(a, ['t01', 't02', 't13'], { revisionId: JOKER_RACK, sectionId: '369' });
    expect(joker.status).toBe(422);
    expect(joker.body.error.message).toBe('Joker cannot be passed');
    expect((await submit(a, ['t09', 't10', 't11'])).status).toBe(201);
  });

  it('counts one answer per player no matter how often the request is retried', async () => {
    const a = await device();
    const body = { revisionId: DEMO, sectionId: 'evens', tileInstanceIds: ['t09', 't10', 't11'], idempotencyKey: 'key-123456' };
    const first = await a.call('POST', '/v1/attempts', body);
    const replay = await a.call('POST', '/v1/attempts', body);
    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    expect(replay.body.attemptId).toBe(first.body.attemptId);

    const conflict = await a.call('POST', '/v1/attempts', { ...body, tileInstanceIds: ['t01', 't02', 't03'] });
    expect(conflict.body.error.code).toBe('idempotency_conflict');

    const newKey = await submit(a, ['t01', 't02', 't03']);
    expect(newKey.status).toBe(409);
    expect(newKey.body.error).toMatchObject({ code: 'already_submitted', attemptId: first.body.attemptId });

    const split = await a.call('GET', `/v1/puzzles/${DEMO}/split`);
    expect(split.body.eligibleAttemptCount).toBe(1);
  });

  it('accepts concurrent submissions from one player only once', async () => {
    const a = await device();
    const results = await Promise.all([
      submit(a, ['t09', 't10', 't11']),
      submit(a, ['t09', 't10', 't12']),
      submit(a, ['t01', 't02', 't03']),
    ]);
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect((await a.call('GET', `/v1/puzzles/${DEMO}/split`)).body.eligibleAttemptCount).toBe(1);
  });
});

describe('results and the split', () => {
  it('shows the owner their pass beside one strong pass, and nobody else', async () => {
    const a = await device();
    const b = await device();
    const { body } = await submit(a, ['t09', 't10', 't13']);
    const result = await a.call('GET', `/v1/attempts/${body.attemptId}/result`);
    expect(result.body.alignment).toBe('close');
    expect(result.body.suggestion.tileInstanceIds).toEqual(['t09', 't10', 't11']);
    expect(result.body.progress).toMatchObject({ streak: 1, racksSolved: 1, playedToday: true });

    expect((await b.call('GET', `/v1/attempts/${body.attemptId}/result`)).status).toBe(404);
    expect((await b.call('GET', `/v1/puzzles/${DEMO}/split`)).status).toBe(403);
    expect((await b.call('POST', '/v1/share-links', { attemptId: body.attemptId, publishPass: true })).status).toBe(404);
  });

  it('withholds rates below the threshold, then reconciles counts to 300%', async () => {
    const a = await device();
    await submit(a, ['t09', 't10', 't11']);
    const small = await a.call('GET', `/v1/puzzles/${DEMO}/split`);
    expect(small.body).toMatchObject({ eligibleAttemptCount: 1, minimumSampleMet: false, rows: [] });

    const b = await device();
    await submit(b, ['t09', 't12', 't13']);
    const full = await a.call('GET', `/v1/puzzles/${DEMO}/split`);
    expect(full.body.minimumSampleMet).toBe(true);
    const counts = Object.fromEntries(full.body.rows.map((r: { tileInstanceId: string; count: number }) => [r.tileInstanceId, r.count]));
    expect(counts).toMatchObject({ t09: 2, t10: 1, t11: 1, t12: 1, t13: 1, t01: 0 });
    const totalRate = full.body.rows.reduce((s: number, r: { rate: number }) => s + r.rate, 0);
    expect(totalRate).toBeCloseTo(3);
  });

  it('takes a deleted player back out of the split', async () => {
    const a = await device();
    const b = await device();
    await submit(a, ['t09', 't10', 't11']);
    await submit(b, ['t01', 't02', 't03']);
    expect((await b.call('DELETE', '/v1/me')).body.error.code).toBe('confirmation_required');
    expect((await b.call('DELETE', '/v1/me', undefined, { 'x-confirm-delete': 'delete-my-data' })).body.deleted).toBe(true);
    const split = await a.call('GET', `/v1/puzzles/${DEMO}/split`);
    expect(split.body.eligibleAttemptCount).toBe(1);
  });
});

describe('streaks', () => {
  it('counts consecutive daily racks and only same-day play', async () => {
    const a = await device();
    await submit(a, ['t09', 't10', 't11']);
    clock = new Date('2026-10-25T16:00:00Z');
    const day2 = await a.call('POST', '/v1/attempts', {
      revisionId: 'practice-run-002-r1',
      sectionId: 'consecutive',
      tileInstanceIds: ['t09', 't10', 't11'],
      idempotencyKey: randomUUID(),
    });
    expect(day2.status).toBe(201);
    // Playing an old rack from a link adds a solved rack but no streak day.
    await a.call('POST', '/v1/attempts', {
      revisionId: 'practice-pairs-007-r1',
      sectionId: 'singles-pairs',
      tileInstanceIds: ['t09', 't10', 't11'],
      idempotencyKey: randomUUID(),
    });
    const progress = await a.call('GET', '/v1/me/progress');
    expect(progress.body).toMatchObject({ streak: 2, bestStreak: 2, racksSolved: 3 });
    clock = new Date('2026-10-27T16:00:00Z');
    expect((await a.call('GET', '/v1/me/progress')).body.streak).toBe(0);
  });
});

describe('share links', () => {
  it('opens the exact rack, hides the poster pass until the visitor answers', async () => {
    const poster = await device();
    const { body } = await submit(poster, ['t09', 't10', 't11']);
    const link = await poster.call('POST', '/v1/share-links', { attemptId: body.attemptId, publishPass: true });
    expect(link.status).toBe(201);
    expect(link.body.path).toMatch(/^\/r\/[A-Za-z0-9]{10}$/);
    const again = await poster.call('POST', '/v1/share-links', { attemptId: body.attemptId, publishPass: true });
    expect(again.body.token).toBe(link.body.token);

    clock = new Date('2026-10-26T16:00:00Z');
    const visitor = await device();
    const opened = await visitor.call('GET', `/v1/share-links/${link.body.token}`);
    expect(opened.body.puzzle.revisionId).toBe(DEMO);
    expect(opened.body.isTodaysRack).toBe(false);
    expect(opened.raw).not.toContain('t09","t10","t11');

    const answer = await submit(visitor, ['t01', 't02', 't03'], { shareToken: link.body.token, sectionId: 'consecutive' });
    const result = await visitor.call('GET', `/v1/attempts/${answer.body.attemptId}/result`);
    expect(result.body.poster).toEqual({ sectionId: 'evens', tileInstanceIds: ['t09', 't10', 't11'] });
    expect(result.body.attempt.isDaily).toBe(false);

    expect((await visitor.call('DELETE', `/v1/share-links/${link.body.id}`)).status).toBe(404);
    expect((await poster.call('DELETE', `/v1/share-links/${link.body.id}`)).body.revoked).toBe(true);
    expect((await visitor.call('GET', `/v1/share-links/${link.body.token}`)).status).toBe(410);
  });

  it('keeps the poster private when they did not publish their pass', async () => {
    const poster = await device();
    const { body } = await submit(poster, ['t09', 't10', 't11']);
    const link = await poster.call('POST', '/v1/share-links', { attemptId: body.attemptId, publishPass: false });
    const visitor = await device();
    const answer = await submit(visitor, ['t01', 't02', 't03'], { shareToken: link.body.token });
    const result = await visitor.call('GET', `/v1/attempts/${answer.body.attemptId}/result`);
    expect(result.body.poster).toBeNull();
  });
});

describe('events', () => {
  it('deduplicates retried events and ignores unknown names', async () => {
    const a = await device();
    const id = randomUUID();
    const batch = { events: [{ id, name: 'rack_opened', occurredAt: clock.toISOString(), props: { source: 'today' } }, { id: randomUUID(), name: 'posted_to_tiktok', occurredAt: clock.toISOString() }] };
    expect((await a.call('POST', '/v1/events', batch)).body.accepted).toBe(1);
    expect((await a.call('POST', '/v1/events', batch)).body.accepted).toBe(0);
  });
});
