import { join } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { loadBlog } from './blog.ts';
import { loadContent, syncRevisions } from './content.ts';
import { openDb, type Db } from './db.ts';
import { recordPageView, summary } from './insights.ts';

const content = loadContent(join(import.meta.dirname, '../../../content'), { devRotate: false });
const blog = loadBlog(join(import.meta.dirname, '../../../content/blog'));
const config = { brand: 'Daily Rack', publicBaseUrl: 'https://dailyrack.test', secureCookies: false, splitThreshold: 30, adminToken: 'test-moderator-token' };
const now = new Date('2026-11-03T12:00:00Z');
const daysAgo = (n: number) => new Date(now.getTime() - n * 86_400_000).toISOString();

let db: Db;
beforeEach(() => {
  db = openDb(':memory:');
  syncRevisions(db, content, now);
});

const player = (id: string, created: string, kind = 'guest') => db.prepare('INSERT INTO principals (id, kind, token_hash, created_at) VALUES (?, ?, ?, ?)').run(id, kind, `hash-${id}`, created);
const event = (id: string, name: string, principal: string, at = daysAgo(1)) =>
  db.prepare('INSERT INTO events (id, name, principal_id, props, occurred_at, received_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, name, principal, '{}', at, at);
const table = (id: string, seats: (string | null)[], extra: { variant?: string; kind?: string; ranked?: number; hand?: number } = {}) =>
  db
    .prepare(
      `INSERT INTO tables (id, code, host_id, mode, status, seats, settings, scores, hand_number, created_at, updated_at, kind, ranked, variant)
       VALUES (?, ?, ?, 'turn', 'playing', ?, '{}', '[]', ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      id,
      `code-${id}`,
      seats[0]!,
      JSON.stringify(seats.map((p) => ({ principalId: p, bot: p ? null : 'easy', reservedFor: null }))),
      extra.hand ?? 1,
      daysAgo(1),
      daysAgo(1),
      extra.kind ?? 'private',
      extra.ranked ?? 0,
      extra.variant ?? 'four',
    );

describe('the owner summary', () => {
  it('follows new players from their first lesson to a real table', () => {
    player('ann', daysAgo(2));
    player('bea', daysAgo(1));
    player('cal', daysAgo(40));
    player('qa', daysAgo(1), 'test');
    event('e1', 'lesson_completed', 'ann');
    event('e2', 'practice_started', 'ann');
    event('e3', 'practice_finished', 'ann');
    event('e4', 'lesson_completed', 'bea');
    event('e5', 'lesson_completed', 'qa');
    event('e6', 'plus_opened', 'cal');
    table('t1', ['ann', 'bea', null, null]);
    table('t2', ['bea', null], { variant: 'two-player' });
    table('t3', ['cal', null, null, null]);
    db.prepare("INSERT INTO hand_results (id, principal_id, game_id, source, card_id, won, played_at) VALUES ('h1', 'ann', 'g1', 'offline', 'daily-rack-house-2026', 1, ?)").run(daysAgo(1));
    db.prepare("INSERT INTO nights (id, host_id, title, time_zone, invite_token, status, created_at, updated_at) VALUES ('n1', 'bea', 'Thursday', 'America/New_York', 'tok', 'confirmed', ?, ?)").run(daysAgo(1), daysAgo(1));

    const s = summary(db, now, 7);
    expect(s.players).toEqual({ total: 3, new: 2, active: 3 });
    expect(Object.fromEntries(s.path.map((p) => [p.step, p.players]))).toEqual({
      Started: 2,
      'Finished a lesson': 2,
      'Started a practice round': 1,
      'Finished a practice round': 1,
      'Played a hand': 1,
      'Played with other people': 2,
      'Joined a Game Night': 1,
    });
    expect(s.games.tablesOpened).toEqual({ vsComputer: 1, withPeople: 1, twoPlayer: 1, quickMatch: 0, ranked: 0 });
    expect(s.games.handsBy).toEqual({ fourPlayer: 0, twoPlayer: 0, offline: 1 });
    expect(s.games.practiceRounds).toBe(1);
    expect(s.social).toMatchObject({ nightsPlanned: 1, nightsConfirmed: 1 });
    expect(s.plus.screenOpened).toBe(1);
    // Test accounts are left out everywhere.
    expect(s.events.find((e) => e.name === 'lesson_completed')).toEqual({ name: 'lesson_completed', count: 2, players: 2 });
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay.at(-1)!.day).toBe('2026-11-03');
  });

  it('counts blog readers by page and where they came from, and only within the period', () => {
    recordPageView(db, now, '/blog/siamese-mahjong', 'google.com');
    recordPageView(db, now, '/blog/siamese-mahjong', 'google.com');
    recordPageView(db, now, '/blog', '(direct)');
    recordPageView(db, new Date(daysAgo(20)), '/blog', '(direct)');
    const s = summary(db, now, 7);
    expect(s.blog.views).toBe(3);
    expect(s.blog.pages).toEqual([
      { path: '/blog/siamese-mahjong', views: 2 },
      { path: '/blog', views: 1 },
    ]);
    expect(s.blog.from[0]).toEqual({ referrer: 'google.com', views: 2 });
    expect(summary(db, now, 30).blog.views).toBe(4);
  });
});

describe('the summary route and what feeds it', () => {
  const app = () => createApp({ db, content, config: { ...config, now: () => now }, blog });

  it('is for moderators only, and clamps the period', async () => {
    expect((await app().request('/v1/admin/summary')).status).toBe(401);
    const res = await app().request('/v1/admin/summary?days=9999', { headers: { 'x-admin-token': 'test-moderator-token' } });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { period: { days: number }; byDay: unknown[] };
    expect(body.period.days).toBe(365);
    expect(body.byDay).toHaveLength(31);
  });

  it('counts readers of published posts, not crawlers or drafts, and keeps only the referring site', async () => {
    const browser = { 'user-agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) Safari/605.1.15' };
    const a = app();
    expect((await a.request('/blog/siamese-mahjong', { headers: { ...browser, referer: 'https://www.google.com/search?q=siamese+mahjong' } })).status).toBe(200);
    await a.request('/blog', { headers: browser });
    await a.request('/blog/siamese-mahjong', { headers: { ...browser, referer: 'https://dailyrack.test/blog' } });
    await a.request('/blog/siamese-mahjong', { headers: { 'user-agent': 'Googlebot/2.1 (+http://www.google.com/bot.html)' } });
    await a.request('/blog/siamese-mahjong', { headers: { ...browser, 'sec-purpose': 'prefetch' } });
    await a.request('/blog/no-such-post', { headers: browser });
    const rows = db.prepare('SELECT path, referrer, views FROM page_views ORDER BY path, referrer').all();
    expect(rows).toEqual([
      { path: '/blog', referrer: '(direct)', views: 1 },
      { path: '/blog/siamese-mahjong', referrer: '(this site)', views: 1 },
      { path: '/blog/siamese-mahjong', referrer: 'google.com', views: 1 },
    ]);
  });

  it('accepts the Plus and Learn events the app sends', async () => {
    const a = app();
    const guest = await a.request('/v1/guest-sessions', { method: 'POST' });
    const cookie = guest.headers.get('set-cookie')!.split(';')[0]!;
    const events = ['plus_opened', 'plus_purchased', 'learn_practice', 'lesson_completed', 'app_first_open'].map((name, i) => ({
      id: `00000000-0000-4000-8000-00000000000${i}`,
      name,
      occurredAt: now.toISOString(),
      props: {},
    }));
    const res = await a.request('/v1/events', { method: 'POST', headers: { 'content-type': 'application/json', cookie }, body: JSON.stringify({ events }) });
    expect(await res.json()).toEqual({ accepted: 5 });
  });
});
