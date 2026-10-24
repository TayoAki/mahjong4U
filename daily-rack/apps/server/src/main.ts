import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { createApp } from './app.ts';
import { loadContent, syncRevisions } from './content.ts';
import { openDb } from './db.ts';

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

const app = createApp({ db, content, config });

// Serve the built web app, falling back to index.html for client-side routes.
const webDist = join(root, 'apps/web/dist');
if (existsSync(webDist)) {
  const indexHtml = readFileSync(join(webDist, 'index.html'), 'utf8');
  app.use('/*', serveStatic({ root: webDist }));
  app.get('*', (c) => (c.req.path.startsWith('/v1/') ? c.notFound() : c.html(indexHtml)));
}

const port = Number(env.PORT ?? 8787);
serve({ fetch: app.fetch, port }, (info) => {
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
