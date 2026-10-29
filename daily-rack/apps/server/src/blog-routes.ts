import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Context, Hono } from 'hono';
import { serveStatic } from '@hono/node-server/serve-static';
import type { AppConfig, Env } from './app.ts';
import { BLOG_SECTIONS, publishedPosts, type Blog, type SectionId } from './blog.ts';
import { indexPage, notFoundPage, postPage, robotsTxt, rssFeed, sectionPage, sitemap, type PageContext } from './blog-pages.ts';

// The Table at /blog, plus the site-wide robots.txt and sitemap.xml. These are registered
// before the web app's index.html fallback, so search engines get real HTML here.

const CSS = readFileSync(join(import.meta.dirname, 'blog.css'), 'utf8');
/** The stylesheet URL changes with its content, so browsers can keep it for a year. */
const CSS_PATH = `/blog/assets/blog.css?v=${createHash('sha256').update(CSS).digest('hex').slice(0, 10)}`;

const CACHE = {
  page: 'public, max-age=300, stale-while-revalidate=3600',
  // Drafts are for the owner's eyes: never kept by a shared cache.
  draft: 'private, no-store',
  missing: 'public, max-age=60',
  feed: 'public, max-age=900',
  robots: 'public, max-age=3600',
  stylesheet: 'public, max-age=31536000, immutable',
  image: 'public, max-age=86400',
};

export function registerBlogRoutes(app: Hono<Env>, { blog, config }: { blog: Blog; config: AppConfig }): void {
  const published = publishedPosts(blog);
  const bySlug = new Map(blog.posts.map((post) => [post.slug, post]));
  const ctx = (c: Context): PageContext => ({ base: baseUrl(c, config.publicBaseUrl), css: CSS_PATH });
  const page = (c: Context, html: string, cache: string, status: 200 | 404 = 200) => {
    c.header('Cache-Control', cache);
    return c.html(html, status);
  };
  const notFound = (c: Context) => page(c, notFoundPage(ctx(c)), CACHE.missing, 404);

  app.get('/robots.txt', (c) => c.body(robotsTxt(ctx(c)), 200, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': CACHE.robots }));
  app.get('/sitemap.xml', (c) => c.body(sitemap(ctx(c), published), 200, { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': CACHE.feed }));

  app.get('/blog', (c) => page(c, indexPage(ctx(c), published), CACHE.page));
  app.get('/blog/rss.xml', (c) => c.body(rssFeed(ctx(c), published), 200, { 'Content-Type': 'application/rss+xml; charset=utf-8', 'Cache-Control': CACHE.feed }));
  app.get('/blog/assets/blog.css', (c) => c.body(CSS, 200, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': CACHE.stylesheet }));

  // Pictures for posts go in content/blog/images and are linked as /blog/images/<file>.
  const images = blog.dir ? join(blog.dir, 'images') : null;
  if (images && existsSync(images)) {
    const serveImage = serveStatic({ root: images, rewriteRequestPath: (path) => path.slice('/blog/images'.length) });
    app.use('/blog/images/*', async (c, next) => {
      // A missing file falls through to the 404 below.
      const res = await serveImage(c, next);
      if (res instanceof Response) res.headers.set('Cache-Control', CACHE.image);
      return res;
    });
  }

  app.get('/blog/section/:section', (c) => {
    const section = c.req.param('section');
    if (!Object.hasOwn(BLOG_SECTIONS, section)) return notFound(c);
    return page(c, sectionPage(ctx(c), section as SectionId, published.filter((p) => p.section === section)), CACHE.page);
  });

  // Drafts open at their own address so the owner can review them, marked noindex and
  // listed nowhere: not on the index, a section, the feed or the sitemap.
  app.get('/blog/:slug', (c) => {
    const post = bySlug.get(c.req.param('slug'));
    if (!post) return notFound(c);
    if (post.status === 'draft') c.header('X-Robots-Tag', 'noindex, nofollow');
    return page(c, postPage(ctx(c), post), post.status === 'draft' ? CACHE.draft : CACHE.page);
  });

  app.get('/blog/*', (c) => {
    const path = c.req.path;
    if (path.length > 1 && path.endsWith('/')) return c.redirect(path.replace(/\/+$/, '') || '/blog', 301);
    return notFound(c);
  });
}

/** PUBLIC_BASE_URL when it's set; otherwise the address the request came in on. */
function baseUrl(c: Context, configured: string | null): string {
  if (configured) return configured;
  const url = new URL(c.req.url);
  const proto = c.req.header('x-forwarded-proto')?.split(',')[0]?.trim();
  const host = (c.req.header('x-forwarded-host') ?? c.req.header('host'))?.split(',')[0]?.trim();
  const scheme = proto === 'https' || proto === 'http' ? proto : url.protocol.slice(0, -1);
  return `${scheme}://${host && /^[a-z0-9.-]+(:\d+)?$/i.test(host) ? host : url.host}`;
}
