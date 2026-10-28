import { randomUUID } from 'node:crypto';
import type { Context, Hono } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { z } from 'zod';
import type { Db } from './db.ts';
import type { AppConfig, Env, Fail, RateLimiter } from './app.ts';
import type { Hub } from './realtime.ts';
import { BugReportBody, BugReportError, MAX_BUG_REPORT_BODY, bugScreenshot, deviceLine, fileBugReport, listBugReports, setBugReportStatus } from './bug-reports.ts';
import {
  REPORT_REASONS,
  acceptRules,
  adminTokenMatches,
  blockPlayer,
  fileReport,
  listBlocked,
  listReports,
  notifyModerators,
  resolveReport,
  unblockPlayer,
  unsuspend,
} from './moderation.ts';
import { conversationMembers, ensureProfile, getConversation } from './social.ts';

interface Deps {
  db: Db;
  hub: Hub;
  config: AppConfig;
  fail: Fail;
  limiter: RateLimiter;
  now: () => Date;
  handle: (c: Context<Env>, error: unknown) => Response | Promise<Response>;
  body: <T>(c: Context<Env>, schema: z.ZodType<T>) => Promise<T | null>;
}

const ReportBody = z
  .object({
    playerId: z.string().uuid().optional(),
    messageId: z.string().uuid().optional(),
    reason: z.enum(REPORT_REASONS),
    note: z.string().max(500).nullable().optional(),
    block: z.boolean().optional(),
  })
  .refine((r) => Boolean(r.playerId) !== Boolean(r.messageId), 'Report a player or a message.');

/** Community rules, blocking and reporting for players; review tools for moderators. */
export function registerSafetyRoutes(api: Hono<Env>, deps: Deps): void {
  const { db, hub, config, fail, limiter, now, handle, body } = deps;
  const me = (c: Context<Env>) => c.get('principal');

  for (const path of ['/me/rules', '/blocks', '/blocks/*', '/reports', '/feedback', '/bug-reports']) {
    api.use(path, async (c, next) => (me(c) ? next() : fail(c, 401, 'missing_identity', 'Start a session first.')));
  }

  api.post('/me/rules', (c) => {
    acceptRules(db, me(c)!.id, now());
    return c.json({ rulesAccepted: true });
  });

  // ---------------------------------------------------------------- blocking

  api.get('/blocks', (c) => c.json({ blocked: listBlocked(db, me(c)!.id, now()) }));

  api.post('/blocks', async (c) => {
    const input = await body(c, z.object({ playerId: z.string().uuid() }));
    if (!input) return fail(c, 400, 'invalid_input', 'Choose a player to block.');
    try {
      blockPlayer(db, me(c)!.id, input.playerId, now());
    } catch (error) {
      return handle(c, error);
    }
    hub.sendMany([me(c)!.id, input.playerId], { type: 'friends' });
    return c.json({ blocked: true });
  });

  api.delete('/blocks/:id', (c) => {
    unblockPlayer(db, me(c)!.id, c.req.param('id'));
    return c.json({ unblocked: true });
  });

  // ---------------------------------------------------------------- reports

  api.post('/reports', async (c) => {
    if (!limiter.allow(`report:${me(c)!.id}`, 20, 3_600_000)) return fail(c, 429, 'rate_limited', 'Too many reports in a short time. Try again later.');
    const input = await body(c, ReportBody);
    if (!input) return fail(c, 400, 'invalid_input', 'Choose a reason for the report.');
    if (input.messageId) {
      // Only messages the reporter can actually see can be reported.
      const row = db.prepare('SELECT conversation_id FROM messages WHERE id = ?').get(input.messageId) as { conversation_id: string } | undefined;
      const conversation = row ? getConversation(db, row.conversation_id) : null;
      if (!conversation || !conversationMembers(db, conversation).includes(me(c)!.id)) {
        return fail(c, 404, 'message_not_found', 'That message is no longer available.');
      }
    }
    try {
      const report = fileReport(db, me(c)!.id, input, now());
      if (input.block) {
        blockPlayer(db, me(c)!.id, report.targetId, now());
        hub.sendMany([me(c)!.id, report.targetId], { type: 'friends' });
      }
      const target = ensureProfile(db, report.targetId, now());
      console.log(JSON.stringify({ level: 'warn', message: 'report_filed', reportId: report.id, reason: input.reason, kind: input.messageId ? 'message' : 'player' }));
      notifyModerators(config.reportWebhookUrl, `New Daily Rack report (${input.reason}) about ${target.name}${input.messageId ? ' for a chat message' : ''}. Report ${report.id}.`);
      return c.json({ reported: true, id: report.id, blocked: Boolean(input.block) }, 201);
    } catch (error) {
      return handle(c, error);
    }
  });

  // ---------------------------------------------------------------- contact us

  api.post('/feedback', async (c) => {
    if (!limiter.allow(`feedback:${me(c)!.id}`, 10, 3_600_000)) return fail(c, 429, 'rate_limited', 'You have sent a lot of messages. Try again later.');
    const input = await body(c, z.object({ message: z.string().trim().min(1).max(2000) }));
    if (!input) return fail(c, 400, 'invalid_input', 'Write a message first (up to 2,000 characters).');
    const id = randomUUID();
    db.prepare('INSERT INTO feedback (id, principal_id, message, created_at) VALUES (?, ?, ?, ?)').run(id, me(c)!.id, input.message, now().toISOString());
    const name = ensureProfile(db, me(c)!.id, now()).name;
    console.log(JSON.stringify({ level: 'info', message: 'feedback_received', feedbackId: id }));
    notifyModerators(config.reportWebhookUrl, `New Daily Rack message from ${name}: ${input.message.slice(0, 300)}`);
    return c.json({ sent: true }, 201);
  });

  // ---------------------------------------------------------------- report a problem

  api.post(
    '/bug-reports',
    bodyLimit({ maxSize: MAX_BUG_REPORT_BODY, onError: (c) => fail(c as Context<Env>, 413, 'too_large', 'That report is too large. Try again without the screenshot.') }),
    async (c) => {
      if (!limiter.allow(`bug-report:${me(c)!.id}`, 6, 3_600_000)) return fail(c, 429, 'rate_limited', 'You have sent a lot of reports. Try again later.');
      const input = await body(c, BugReportBody);
      if (!input) return fail(c, 400, 'invalid_input', 'Tell us what went wrong (up to 4,000 characters).');
      let id: string;
      try {
        ({ id } = fileBugReport(db, me(c)!.id, input, now()));
      } catch (error) {
        if (error instanceof BugReportError) return fail(c, 400, 'bad_screenshot', error.message);
        return handle(c, error);
      }
      const name = ensureProfile(db, me(c)!.id, now()).name;
      const device = deviceLine(input.details);
      console.log(JSON.stringify({ level: 'info', message: 'bug_report_received', bugReportId: id, screen: input.screen, screenshot: Boolean(input.screenshot) }));
      notifyModerators(
        config.reportWebhookUrl,
        `New Daily Rack problem report from ${name} on ${input.screen}${device ? ` (${device})` : ''}${input.screenshot ? ', with a screenshot' : ''}: ${input.description.slice(0, 300)}. Report ${id}.`,
      );
      return c.json({ sent: true, id }, 201);
    },
  );

  // ---------------------------------------------------------------- moderators

  const admin = async (c: Context<Env>, next: () => Promise<void>) => {
    if (!config.adminToken) return fail(c, 404, 'not_found', 'Not found.');
    if (!adminTokenMatches(config.adminToken, c.req.header('x-admin-token'))) return fail(c, 401, 'bad_admin_token', 'Moderator token required.');
    await next();
  };
  api.use('/admin/*', admin);

  api.get('/admin/reports', (c) => c.json({ reports: listReports(db, c.req.query('status') === 'all' ? 'all' : 'open', now()) }));

  api.post('/admin/reports/:id', async (c) => {
    const input = await body(c, z.object({ action: z.enum(['dismiss', 'remove-content', 'suspend']) }));
    if (!input) return fail(c, 400, 'invalid_input', 'Choose dismiss, remove-content or suspend.');
    try {
      const { targetId } = resolveReport(db, c.req.param('id'), input.action, now());
      if (input.action === 'suspend') hub.sendMany([targetId], { type: 'friends' });
      console.log(JSON.stringify({ level: 'info', message: 'report_resolved', reportId: c.req.param('id'), action: input.action }));
      return c.json({ resolved: true, action: input.action });
    } catch (error) {
      return handle(c, error);
    }
  });

  api.post('/admin/players/:id/unsuspend', (c) => c.json({ unsuspended: unsuspend(db, c.req.param('id')) }));

  api.get('/admin/bug-reports', (c) => c.json({ bugReports: listBugReports(db, c.req.query('status') === 'all' ? 'all' : 'open', now()) }));

  api.get('/admin/bug-reports/:id/screenshot', (c) => {
    const shot = bugScreenshot(db, c.req.param('id'));
    if (!shot) return fail(c, 404, 'not_found', 'That report has no screenshot.');
    return c.body(Buffer.from(shot.bytes), 200, { 'content-type': shot.type, 'cache-control': 'private, no-store' });
  });

  api.post('/admin/bug-reports/:id', async (c) => {
    const input = await body(c, z.object({ action: z.enum(['close', 'reopen']) }));
    if (!input) return fail(c, 400, 'invalid_input', 'Choose close or reopen.');
    if (!setBugReportStatus(db, c.req.param('id'), input.action === 'close' ? 'closed' : 'open')) return fail(c, 404, 'not_found', 'No such report.');
    return c.json({ status: input.action === 'close' ? 'closed' : 'open' });
  });

  api.get('/admin/feedback', (c) => {
    const rows = db.prepare('SELECT * FROM feedback ORDER BY created_at DESC LIMIT 200').all() as { id: string; principal_id: string; message: string; created_at: string }[];
    return c.json({ feedback: rows.map((r) => ({ id: r.id, message: r.message, createdAt: r.created_at, from: ensureProfile(db, r.principal_id, now()) })) });
  });
}
