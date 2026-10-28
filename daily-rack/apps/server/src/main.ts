import { existsSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { DEFAULT_ICE_SERVERS, createApp, createServices } from './app.ts';
import { expoPushSender } from './push.ts';
import { loadContent, syncRevisions } from './content.ts';
import { loadCards } from './cards.ts';
import { openDb } from './db.ts';
import { attachRealtime } from './realtime-server.ts';

const root = resolve(import.meta.dirname, '../../..');
const env = process.env;

const config = {
  brand: env.BRAND_NAME ?? 'Daily Rack',
  publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/$/, '') || null,
  secureCookies: env.NODE_ENV === 'production',
  splitThreshold: Number(env.SPLIT_THRESHOLD ?? 30),
  supportEmail: env.SUPPORT_EMAIL || null,
  privacyUrl: env.PRIVACY_URL || null,
  termsUrl: env.TERMS_URL || null,
  adminToken: env.ADMIN_TOKEN || null,
  reportWebhookUrl: env.REPORT_WEBHOOK_URL || null,
  // Voice chat: a TURN relay (TURN_URLS, comma separated, with TURN_USERNAME and
  // TURN_CREDENTIAL) helps players behind strict networks connect.
  // Daily Rack Plus: RevenueCat sends REVENUECAT_WEBHOOK_AUTH with each webhook;
  // REVENUECAT_SECRET_KEY lets the server ask RevenueCat directly; PLUS_FOR_EVERYONE=1
  // unlocks Plus for all (a beta, or before the stores are set up).
  plus: {
    webhookAuth: env.REVENUECAT_WEBHOOK_AUTH || null,
    secretKey: env.REVENUECAT_SECRET_KEY || null,
    forEveryone: env.PLUS_FOR_EVERYONE === '1',
  },
  iceServers: [
    ...DEFAULT_ICE_SERVERS,
    ...(env.TURN_URLS ? [{ urls: env.TURN_URLS.split(',').map((u) => u.trim()), username: env.TURN_USERNAME, credential: env.TURN_CREDENTIAL }] : []),
  ],
};

const db = openDb(env.DATABASE_PATH ?? join(root, 'data/daily-rack.db'));
const contentDir = env.CONTENT_DIR ?? join(root, 'content');
const content = loadContent(contentDir, { devRotate: env.DEV_ROTATE === '1' });
const cards = loadCards(join(contentDir, 'cards'));
for (const problem of cards.errors) console.log(JSON.stringify({ level: 'warn', message: 'card_skipped', problem }));
syncRevisions(db, content, new Date());

const services = createServices(db, {
  botDelayMs: Number(env.BOT_DELAY_MS ?? 900),
  // How long the first person waiting for a public match waits before computer players fill in.
  matchFillAfterMs: { casual: Number(env.MATCH_FILL_CASUAL_MS ?? 20_000), ranked: Number(env.MATCH_FILL_RANKED_MS ?? 45_000) },
  // Push notifications go through Expo's push service (PUSH_DISABLED=1 turns them off;
  // EXPO_ACCESS_TOKEN is only needed if enhanced push security is on for the Expo project).
  pushSender: env.PUSH_DISABLED === '1' ? null : expoPushSender(env.EXPO_ACCESS_TOKEN || null),
});
const app = createApp({ db, content, config, services });

// Serve the Expo web build, falling back to index.html for client-side routes.
const webDist = env.WEB_DIST ?? join(root, 'apps/mobile/dist');
if (existsSync(webDist)) {
  const indexHtml = readFileSync(join(webDist, 'index.html'), 'utf8');
  app.use('/*', serveStatic({ root: webDist }));
  app.get('*', (c) => (c.req.path.startsWith('/v1/') ? c.notFound() : c.html(indexHtml)));
}

const port = Number(env.PORT ?? 8787);
const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'daily-rack server listening',
      port: info.port,
      revisions: content.revisions.size,
      cards: cards.loaded,
      devRotate: env.DEV_ROTATE === '1',
      webDist: existsSync(webDist),
    }),
  );
});
attachRealtime(server as Server, services.hub);
services.tables.resume();
