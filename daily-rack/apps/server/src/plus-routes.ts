import type { Context, Hono } from 'hono';
import { z } from 'zod';
import type { Db } from './db.ts';
import type { Env, Fail, RateLimiter } from './app.ts';
import type { PlusConfig, PlusService, RevenueCatEvent } from './plus.ts';

interface Deps {
  db: Db;
  plus: PlusService;
  config: PlusConfig;
  fail: Fail;
  limiter: RateLimiter;
}

/** Daily Rack Plus: a player's status, syncing after a purchase, RevenueCat's webhook, and comps. */
export function registerPlusRoutes(api: Hono<Env>, { plus, config, fail, limiter }: Deps): void {
  const me = (c: Context<Env>) => c.get('principal');
  api.use('/me/plus', async (c, next) => (me(c) ? next() : fail(c, 401, 'missing_identity', 'Start a session first.')));
  api.use('/me/plus/*', async (c, next) => (me(c) ? next() : fail(c, 401, 'missing_identity', 'Start a session first.')));

  api.get('/me/plus', (c) => c.json(plus.status(me(c)!.id)));

  // Right after a purchase the app asks the server to check with RevenueCat, so Plus works
  // at once instead of waiting for the webhook.
  api.post('/me/plus/sync', async (c) => {
    if (!limiter.allow(`plus-sync:${me(c)!.id}`, 30, 3_600_000)) return fail(c, 429, 'rate_limited', 'Try again in a little while.');
    try {
      const synced = await plus.sync(me(c)!.id);
      return c.json({ synced, ...plus.status(me(c)!.id) });
    } catch (error) {
      console.log(JSON.stringify({ level: 'warn', message: 'plus_sync_failed', error: (error as Error).message }));
      return fail(c, 500, 'temporary_failure', 'We couldn’t reach the store just now. Your purchase is safe; try again in a minute.');
    }
  });

  api.post('/webhooks/revenuecat', async (c) => {
    if (!config.webhookAuth) return fail(c, 404, 'not_found', 'Not found.');
    if (c.req.header('authorization') !== config.webhookAuth) return fail(c, 401, 'bad_webhook_auth', 'Unauthorized.');
    const body = (await c.req.json().catch(() => null)) as { event?: RevenueCatEvent } | null;
    if (!body?.event) return fail(c, 400, 'invalid_input', 'No event.');
    try {
      const fresh = await plus.handleEvent(body.event);
      console.log(JSON.stringify({ level: 'info', message: 'revenuecat_event', type: body.event.type, eventId: body.event.id, duplicate: !fresh }));
      return c.json({ ok: true });
    } catch (error) {
      // Anything but 200 makes RevenueCat retry later.
      console.log(JSON.stringify({ level: 'warn', message: 'revenuecat_event_failed', type: body.event.type, error: (error as Error).message }));
      return fail(c, 500, 'temporary_failure', 'Try again later.');
    }
  });

  // Testers, support and comps: days = null for no end, 0 to take it away.
  api.post('/admin/players/:id/plus', async (c) => {
    const input = z.object({ days: z.number().int().min(0).max(3650).nullable() }).safeParse(await c.req.json().catch(() => null));
    if (!input.success) return fail(c, 400, 'invalid_input', 'Give days (a number, or null for no end).');
    return c.json(plus.grant(c.req.param('id'), input.data.days));
  });
}
