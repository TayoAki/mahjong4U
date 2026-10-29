import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { Hono, type Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { z } from 'zod';
import {
  ALIGNMENT_COPY,
  FEATURES,
  alignmentOf,
  contentDay,
  selectionErrors,
  toPublicPuzzle,
  type PuzzleRevision,
} from '@daily-rack/core';
import { transaction, type Db } from './db.ts';
import { nextPublicationAt, type Content } from './content.ts';
import { deletePrincipal, insertAttempt, progressFor, readSplit, type AttemptRow, type Principal } from './store.ts';
import { Hub } from './realtime.ts';
import { TableService, type TableServiceOptions } from './tables.ts';
import { registerPlayRoutes } from './play-routes.ts';
import { Matchmaker, type MatchmakerOptions } from './matchmaking.ts';
import { VoiceRooms } from './voice.ts';
import { Notifier, type PushSender } from './push.ts';
import { PlusService, type PlusConfig } from './plus.ts';
import { registerPlusRoutes } from './plus-routes.ts';
import { emptyBlog, type Blog } from './blog.ts';
import { registerBlogRoutes } from './blog-routes.ts';

export interface AppConfig {
  brand: string;
  /** Absolute origin for share links, e.g. https://dailyrack.app. Null keeps links relative. */
  publicBaseUrl: string | null;
  secureCookies: boolean;
  splitThreshold: number;
  /** Shown in the app as the place to reach a person about safety or support. */
  supportEmail?: string | null;
  /** Linked from the Plus screen, as the App Store and Google Play require for subscriptions. */
  privacyUrl?: string | null;
  termsUrl?: string | null;
  /** Unlocks the moderator endpoints under /v1/admin (sent as the x-admin-token header). */
  adminToken?: string | null;
  /** Slack- or Discord-style webhook that hears about every new report. */
  reportWebhookUrl?: string | null;
  /** STUN/TURN servers handed to voice chat clients. */
  iceServers?: IceServer[];
  /** Daily Rack Plus: RevenueCat webhook auth, secret key, or Plus for everyone. */
  plus?: PlusConfig;
  now?: () => Date;
}

export interface IceServer {
  urls: string | string[];
  username?: string;
  credential?: string;
}

/** Public STUN servers find most players' addresses; a TURN relay covers the rest. */
export const DEFAULT_ICE_SERVERS: IceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

const SESSION_COOKIE = 'dr_session';
const CLIENT_EVENTS = new Set([
  'app_first_open',
  'rack_opened',
  'result_viewed',
  'discards_finished',
  'clip_preview_ready',
  'clip_render_started',
  'clip_render_succeeded',
  'clip_render_failed',
  'clip_save_started',
  'clip_save_succeeded',
  'share_handoff_opened',
  'shared_link_opened',
  'table_created',
  'table_joined',
  'friend_added',
  'night_created',
  'night_invite_shared',
  'report_filed',
  'player_blocked',
  'match_search',
  'match_found',
  'voice_joined',
  'offline_game_started',
  'practice_started',
  'practice_finished',
  'lesson_completed',
]);

const AttemptBody = z.object({
  revisionId: z.string().min(1).max(120),
  sectionId: z.string().min(1).max(60),
  tileInstanceIds: z.array(z.string().min(1).max(20)).max(13),
  idempotencyKey: z.string().min(8).max(128),
  shareToken: z.string().min(4).max(40).optional(),
});

const ShareBody = z.object({ attemptId: z.string().uuid(), publishPass: z.boolean() });

const EventsBody = z.object({
  events: z
    .array(
      z.object({
        id: z.string().uuid(),
        name: z.string().max(40),
        occurredAt: z.string().datetime(),
        props: z.record(z.string().max(40), z.union([z.string().max(200), z.number(), z.boolean(), z.null()])).optional(),
      }),
    )
    .max(50),
});

export type Env = { Variables: { requestId: string; principal: Principal | null } };
export type Fail = (
  c: Context<Env>,
  status: 400 | 401 | 402 | 403 | 404 | 409 | 410 | 413 | 422 | 429 | 500,
  code: string,
  message: string,
  extra?: object,
) => Response;

export interface Services {
  hub: Hub;
  tables: TableService;
  matchmaker: Matchmaker;
  voice: VoiceRooms;
  notifier: Notifier;
}

export function createServices(
  db: Db,
  options: Partial<Omit<TableServiceOptions, 'notifier'> & { matchFillAfterMs: MatchmakerOptions['fillAfterMs']; matchTickMs: number; pushSender: PushSender | null }> = {},
): Services {
  const hub = new Hub();
  const now = options.now ?? (() => new Date());
  // No sender means no pushes (tests, or a server without push set up).
  const notifier = new Notifier(db, hub, options.pushSender ?? null, now);
  const tables = new TableService(db, hub, {
    now,
    botDelayMs: options.botDelayMs ?? 900,
    liveTimeouts: options.liveTimeouts ?? { pass: 90, turn: 60, claim: 12 },
    notifier,
  });
  const matchmaker = new Matchmaker(db, hub, tables, { fillAfterMs: options.matchFillAfterMs ?? { casual: 20_000, ranked: 45_000 }, tickMs: options.matchTickMs ?? 1_000, notifier });
  const voice = new VoiceRooms(db, hub, tables);
  hub.onClientMessage = (principalId, message) => voice.handle(principalId, message);
  return { hub, tables, matchmaker, voice, notifier };
}

export function createApp({ db, content, config, services, blog }: { db: Db; content: Content; config: AppConfig; services?: Services; blog?: Blog }) {
  const now = config.now ?? (() => new Date());
  const { hub, tables, matchmaker, voice, notifier } = services ?? createServices(db, { now, botDelayMs: 0 });
  const app = new Hono<Env>();
  const limiter = new RateLimiter();

  const fail: Fail = (c, status, code, message, extra = {}) =>
    c.json({ error: { code, message, retryable: status === 429 || status === 500, requestId: c.get('requestId'), ...extra } }, status);

  app.use('*', async (c, next) => {
    c.set('requestId', randomUUID());
    const token = getCookie(c, SESSION_COOKIE) ?? c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
    c.set('principal', token ? principalForToken(db, token) : null);
    await next();
    c.header('x-request-id', c.get('requestId'));
  });

  app.onError((error, c) => {
    console.error(JSON.stringify({ level: 'error', requestId: c.get('requestId'), path: c.req.path, message: error.message }));
    return fail(c, 500, 'temporary_failure', 'Something went wrong on our side. Your answer is safe to retry.');
  });

  const api = new Hono<Env>();

  api.get('/config', (c) =>
    c.json({
      brand: config.brand,
      publicBaseUrl: config.publicBaseUrl,
      splitThreshold: config.splitThreshold,
      timeZone: content.schedule.timeZone,
      supportEmail: config.supportEmail ?? null,
      privacyUrl: config.privacyUrl ?? null,
      termsUrl: config.termsUrl ?? null,
      features: FEATURES,
    }),
  );

  api.post('/guest-sessions', (c) => {
    const existing = c.get('principal');
    if (existing) return c.json({ principalId: existing.id, kind: existing.kind, created: false });
    if (!limiter.allow(`guest:${clientAddress(c)}`, 30, 3_600_000)) {
      return fail(c, 429, 'rate_limited', 'Too many new sessions from this network. Try again later.');
    }
    const token = randomBytes(32).toString('base64url');
    const id = randomUUID();
    db.prepare('INSERT INTO principals (id, kind, token_hash, created_at) VALUES (?, ?, ?, ?)').run(
      id,
      'guest',
      sha256(token),
      now().toISOString(),
    );
    setCookie(c, SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: config.secureCookies,
      path: '/',
      maxAge: 400 * 24 * 3600,
    });
    return c.json({ principalId: id, kind: 'guest', created: true, token }, 201);
  });

  api.get('/daily', (c) => {
    const at = now();
    const day = contentDay(at, content.schedule.timeZone);
    const puzzle = content.dailyFor(day);
    const principal = c.get('principal');
    const attempt = puzzle && principal ? attemptFor(db, principal.id, puzzle.puzzleId) : null;
    return c.json({
      contentDay: day,
      serverTime: at.toISOString(),
      nextPublicationAt: nextPublicationAt(at, content.schedule.timeZone).toISOString(),
      puzzle: puzzle && isPublished(db, puzzle.revisionId) ? toPublicPuzzle(puzzle) : null,
      attemptId: attempt?.id ?? null,
      progress: principal ? progressFor(db, content, principal.id, day) : null,
    });
  });

  api.get('/puzzles/:revisionId', (c) => {
    const puzzle = content.revisions.get(c.req.param('revisionId'));
    if (!puzzle) return fail(c, 404, 'puzzle_not_found', 'That rack does not exist.');
    if (!isPublished(db, puzzle.revisionId)) return fail(c, 410, 'puzzle_withdrawn', 'That rack was withdrawn for a correction.');
    return c.json({ puzzle: toPublicPuzzle(puzzle) });
  });

  api.post('/attempts', async (c) => {
    const principal = c.get('principal');
    if (!principal) return fail(c, 401, 'missing_identity', 'Start a session before submitting.');
    const parsed = AttemptBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid_input', 'That submission was not readable.');
    const body = parsed.data;
    if (!limiter.allow(`attempt:${principal.id}`, 20, 60_000)) {
      return fail(c, 429, 'rate_limited', 'Too many submissions. Wait a moment and try again.');
    }

    const requestHash = sha256(
      JSON.stringify([body.revisionId, body.sectionId, body.tileInstanceIds, body.shareToken ?? null]),
    );
    const prior = db
      .prepare('SELECT request_hash, response FROM idempotency WHERE principal_id = ? AND operation = ? AND key = ?')
      .get(principal.id, 'attempt', body.idempotencyKey) as { request_hash: string; response: string } | undefined;
    if (prior) {
      if (prior.request_hash !== requestHash) {
        return fail(c, 409, 'idempotency_conflict', 'This request key was already used for a different answer.');
      }
      return c.json(JSON.parse(prior.response), 200);
    }

    const puzzle = content.revisions.get(body.revisionId);
    if (!puzzle) return fail(c, 404, 'puzzle_not_found', 'That rack does not exist.');
    if (!isPublished(db, puzzle.revisionId)) return fail(c, 410, 'puzzle_withdrawn', 'That rack was withdrawn for a correction.');
    if (!puzzle.sections.some((s) => s.id === body.sectionId)) {
      return fail(c, 422, 'invalid_section', 'Pick one of the sections offered for this rack.');
    }
    const errors = selectionErrors(puzzle, body.tileInstanceIds);
    if (errors.length > 0) return fail(c, 422, 'invalid_selection', errors[0]!, { details: errors });

    const existing = attemptFor(db, principal.id, puzzle.puzzleId);
    if (existing) {
      return fail(c, 409, 'already_submitted', 'You already answered this rack.', { attemptId: existing.id });
    }

    let viaLinkId: string | null = null;
    if (body.shareToken) {
      const link = db
        .prepare('SELECT id, revision_id, revoked_at FROM share_links WHERE token = ?')
        .get(body.shareToken) as { id: string; revision_id: string; revoked_at: string | null } | undefined;
      if (link && !link.revoked_at && link.revision_id === puzzle.revisionId) viaLinkId = link.id;
    }

    const at = now();
    const day = contentDay(at, content.schedule.timeZone);
    const isTodaysDaily = content.dailyFor(day)?.revisionId === puzzle.revisionId;
    const response = transaction(db, () => {
      const attemptId = insertAttempt(db, {
        principal,
        puzzle,
        sectionId: body.sectionId,
        tileInstanceIds: body.tileInstanceIds,
        playedDay: day,
        publicationDay: isTodaysDaily ? day : content.publicationDayOf(puzzle.revisionId),
        viaLinkId,
        now: at,
      });
      const result = { attemptId, revisionId: puzzle.revisionId };
      db.prepare(
        'INSERT INTO idempotency (principal_id, operation, key, request_hash, response, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).run(principal.id, 'attempt', body.idempotencyKey, requestHash, JSON.stringify(result), at.toISOString());
      recordEvent(db, viaLinkId ? 'shared_rack_completed' : 'attempt_submitted', principal.id, at, {
        attemptId,
        revisionId: puzzle.revisionId,
        sectionId: body.sectionId,
        linkId: viaLinkId,
      });
      return result;
    });
    return c.json(response, 201);
  });

  api.get('/attempts/:id/result', (c) => {
    const principal = c.get('principal');
    if (!principal) return fail(c, 401, 'missing_identity', 'Start a session to see your result.');
    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(c.req.param('id')) as AttemptRow | undefined;
    if (!attempt || attempt.principal_id !== principal.id) {
      return fail(c, 404, 'attempt_not_found', 'That result is not available on this device.');
    }
    const puzzle = content.revisions.get(attempt.revision_id);
    if (!puzzle) return fail(c, 404, 'puzzle_not_found', 'That rack is no longer available.');
    const tileIds = JSON.parse(attempt.tile_ids) as string[];
    const alignment = alignmentOf(puzzle, tileIds);
    const day = contentDay(now(), content.schedule.timeZone);
    return c.json({
      attempt: {
        id: attempt.id,
        revisionId: attempt.revision_id,
        sectionId: attempt.section_id,
        tileInstanceIds: tileIds,
        createdAt: attempt.created_at,
        isDaily: attempt.publication_day === attempt.played_day,
      },
      puzzle: toPublicPuzzle(puzzle),
      section: sectionOf(puzzle, attempt.section_id),
      suggestion: puzzle.answer.suggestion,
      suggestedSection: sectionOf(puzzle, puzzle.answer.suggestion.sectionId),
      alternates: puzzle.answer.alternates,
      alignment,
      alignmentCopy: ALIGNMENT_COPY[alignment],
      split: publicSplit(db, puzzle, config.splitThreshold),
      poster: posterFor(db, attempt.via_link_id),
      progress: progressFor(db, content, principal.id, day),
      review: puzzle.review,
    });
  });

  api.get('/puzzles/:revisionId/split', (c) => {
    const principal = c.get('principal');
    const puzzle = content.revisions.get(c.req.param('revisionId'));
    if (!puzzle) return fail(c, 404, 'puzzle_not_found', 'That rack does not exist.');
    if (!principal || !attemptFor(db, principal.id, puzzle.puzzleId)) {
      return fail(c, 403, 'answer_first', 'Answer this rack to see how everyone passed.');
    }
    return c.json(publicSplit(db, puzzle, config.splitThreshold));
  });

  api.get('/me/progress', (c) => {
    const principal = c.get('principal');
    if (!principal) return fail(c, 401, 'missing_identity', 'Start a session to see progress.');
    return c.json(progressFor(db, content, principal.id, contentDay(now(), content.schedule.timeZone)));
  });

  api.delete('/me', (c) => {
    const principal = c.get('principal');
    if (!principal) return fail(c, 401, 'missing_identity', 'There is no session to delete.');
    if (c.req.header('x-confirm-delete') !== 'delete-my-data') {
      return fail(c, 400, 'confirmation_required', 'Confirm that you want to delete your data.');
    }
    tables.removePrincipal(principal.id);
    deletePrincipal(db, content, principal.id, now());
    deleteCookie(c, SESSION_COOKIE, { path: '/' });
    return c.json({ deleted: true });
  });

  api.post('/share-links', async (c) => {
    const principal = c.get('principal');
    if (!principal) return fail(c, 401, 'missing_identity', 'Start a session to share.');
    const parsed = ShareBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid_input', 'That share request was not readable.');
    const attempt = db.prepare('SELECT * FROM attempts WHERE id = ?').get(parsed.data.attemptId) as AttemptRow | undefined;
    if (!attempt || attempt.principal_id !== principal.id) return fail(c, 404, 'attempt_not_found', 'That result is not yours to share.');
    const publish = parsed.data.publishPass ? 1 : 0;
    const existing = db
      .prepare('SELECT id, token FROM share_links WHERE attempt_id = ? AND publish_pass = ? AND revoked_at IS NULL')
      .get(attempt.id, publish) as { id: string; token: string } | undefined;
    const link =
      existing ??
      (() => {
        const created = { id: randomUUID(), token: shareToken() };
        db.prepare(
          'INSERT INTO share_links (id, token, owner_id, attempt_id, revision_id, publish_pass, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
        ).run(created.id, created.token, principal.id, attempt.id, attempt.revision_id, publish, now().toISOString());
        return created;
      })();
    const path = `/r/${link.token}`;
    return c.json({ id: link.id, token: link.token, path, url: config.publicBaseUrl ? `${config.publicBaseUrl}${path}` : null }, existing ? 200 : 201);
  });

  api.get('/share-links/:token', (c) => {
    const link = db
      .prepare('SELECT id, revision_id, publish_pass, revoked_at FROM share_links WHERE token = ?')
      .get(c.req.param('token')) as { id: string; revision_id: string; publish_pass: number; revoked_at: string | null } | undefined;
    if (!link) return fail(c, 404, 'link_not_found', 'That link does not lead to a rack.');
    if (link.revoked_at) return fail(c, 410, 'link_revoked', 'The person who shared this rack turned the link off.');
    const puzzle = content.revisions.get(link.revision_id);
    if (!puzzle || !isPublished(db, puzzle.revisionId)) return fail(c, 410, 'puzzle_withdrawn', 'That rack was withdrawn for a correction.');
    const principal = c.get('principal');
    const attempt = principal ? attemptFor(db, principal.id, puzzle.puzzleId) : null;
    const day = contentDay(now(), content.schedule.timeZone);
    return c.json({
      linkId: link.id,
      puzzle: toPublicPuzzle(puzzle),
      posterPassPublished: link.publish_pass === 1,
      isTodaysRack: content.dailyFor(day)?.revisionId === puzzle.revisionId,
      attemptId: attempt?.id ?? null,
    });
  });

  api.delete('/share-links/:id', (c) => {
    const principal = c.get('principal');
    if (!principal) return fail(c, 401, 'missing_identity', 'Start a session first.');
    const link = db.prepare('SELECT owner_id FROM share_links WHERE id = ?').get(c.req.param('id')) as { owner_id: string } | undefined;
    if (!link || link.owner_id !== principal.id) return fail(c, 404, 'link_not_found', 'That link is not yours.');
    db.prepare('UPDATE share_links SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now().toISOString(), c.req.param('id'));
    return c.json({ revoked: true });
  });

  api.post('/events', async (c) => {
    if (!limiter.allow(`events:${clientAddress(c)}`, 120, 60_000)) return fail(c, 429, 'rate_limited', 'Too many events.');
    const parsed = EventsBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return fail(c, 400, 'invalid_input', 'Events were not readable.');
    const principal = c.get('principal');
    let accepted = 0;
    for (const event of parsed.data.events) {
      if (!CLIENT_EVENTS.has(event.name)) continue;
      const result = db
        .prepare('INSERT OR IGNORE INTO events (id, name, principal_id, props, occurred_at, received_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(event.id, event.name, principal?.id ?? null, JSON.stringify(event.props ?? {}), event.occurredAt, now().toISOString());
      accepted += Number(result.changes);
    }
    return c.json({ accepted });
  });

  const plus = new PlusService(db, config.plus ?? {}, now);
  tables.dealGate = (hostId, cardId, vsComputer) => plus.assertCanDeal(hostId, cardId, vsComputer);
  registerPlayRoutes(api, { db, config, hub, tables, matchmaker, voice, notifier, plus, fail, limiter, now, clientAddress });
  registerPlusRoutes(api, { db, plus, config: config.plus ?? {}, fail, limiter });
  app.route('/v1', api);
  registerBlogRoutes(app, { blog: blog ?? emptyBlog(), config });
  return app;
}

function principalForToken(db: Db, token: string): Principal | null {
  const row = db.prepare('SELECT id, kind FROM principals WHERE token_hash = ?').get(sha256(token)) as Principal | undefined;
  return row ?? null;
}

function attemptFor(db: Db, principalId: string, puzzleId: string): AttemptRow | null {
  return (db.prepare('SELECT * FROM attempts WHERE principal_id = ? AND puzzle_id = ?').get(principalId, puzzleId) as AttemptRow | undefined) ?? null;
}

function isPublished(db: Db, revisionId: string): boolean {
  const row = db.prepare('SELECT status FROM puzzle_revisions WHERE revision_id = ?').get(revisionId) as { status: string } | undefined;
  return row?.status === 'published';
}

function sectionOf(puzzle: PuzzleRevision, sectionId: string) {
  return puzzle.sections.find((s) => s.id === sectionId) ?? { id: sectionId, label: sectionId };
}

/** Rates are withheld below the sample threshold; the count is always honest. */
function publicSplit(db: Db, puzzle: PuzzleRevision, threshold: number) {
  const split = readSplit(db, puzzle, threshold);
  return {
    revisionId: puzzle.revisionId,
    scope: 'all' as const,
    eligibleAttemptCount: split.eligibleAttemptCount,
    syntheticAttemptCount: split.syntheticAttemptCount,
    minimumSampleMet: split.minimumSampleMet,
    threshold: split.threshold,
    computedAt: split.computedAt,
    aggregateVersion: split.version,
    rows: split.minimumSampleMet ? split.rows : [],
    groups: split.minimumSampleMet ? split.groups : [],
  };
}

function posterFor(db: Db, linkId: string | null) {
  if (!linkId) return null;
  const row = db
    .prepare(
      `SELECT l.publish_pass, a.section_id, a.tile_ids FROM share_links l JOIN attempts a ON a.id = l.attempt_id WHERE l.id = ?`,
    )
    .get(linkId) as { publish_pass: number; section_id: string; tile_ids: string } | undefined;
  if (!row || row.publish_pass !== 1) return null;
  return { sectionId: row.section_id, tileInstanceIds: JSON.parse(row.tile_ids) as string[] };
}

function recordEvent(db: Db, name: string, principalId: string, at: Date, props: Record<string, string | null>) {
  db.prepare('INSERT INTO events (id, name, principal_id, props, occurred_at, received_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    randomUUID(),
    name,
    principalId,
    JSON.stringify(props),
    at.toISOString(),
    at.toISOString(),
  );
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const TOKEN_ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** 10 characters from a 57-symbol alphabet: about 58 bits, unguessable and easy to type from an end card. */
function shareToken(): string {
  const bytes = randomBytes(10);
  return [...bytes].map((b) => TOKEN_ALPHABET[b % TOKEN_ALPHABET.length]).join('');
}

function clientAddress(c: Context): string {
  const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
  const incoming = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)?.incoming;
  return forwarded || incoming?.socket?.remoteAddress || 'unknown';
}

export class RateLimiter {
  private buckets = new Map<string, { count: number; resetAt: number }>();

  allow(key: string, limit: number, windowMs: number): boolean {
    const nowMs = Date.now();
    const bucket = this.buckets.get(key);
    if (!bucket || bucket.resetAt <= nowMs) {
      this.buckets.set(key, { count: 1, resetAt: nowMs + windowMs });
      if (this.buckets.size > 10_000) this.prune(nowMs);
      return true;
    }
    bucket.count += 1;
    return bucket.count <= limit;
  }

  private prune(nowMs: number) {
    for (const [key, bucket] of this.buckets) if (bucket.resetAt <= nowMs) this.buckets.delete(key);
  }
}
