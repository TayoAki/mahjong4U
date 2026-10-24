import { existsSync, readFileSync } from 'node:fs';
import type { Server } from 'node:http';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp, createServices } from './app.ts';
import { loadContent, syncRevisions } from './content.ts';
import { openDb } from './db.ts';
import { attachRealtime } from './realtime-server.ts';

const root = resolve(import.meta.dirname, '../../..');
const env = process.env;

const config = {
  brand: env.BRAND_NAME ?? 'Daily Rack',
  publicBaseUrl: env.PUBLIC_BASE_URL?.replace(/\/$/, '') || null,
  secureCookies: env.NODE_ENV === 'production',
  splitThreshold: Number(env.SPLIT_THRESHOLD ?? 30),
};

const db = openDb(env.DATABASE_PATH ?? join(root, 'data/daily-rack.db'));
const content = loadContent(env.CONTENT_DIR ?? join(root, 'content'), { devRotate: env.DEV_ROTATE === '1' });
syncRevisions(db, content, new Date());

const services = createServices(db, { botDelayMs: Number(env.BOT_DELAY_MS ?? 900) });
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
      devRotate: env.DEV_ROTATE === '1',
      webDist: existsSync(webDist),
    }),
  );
});
attachRealtime(server as Server, services.hub);
services.tables.resume();
