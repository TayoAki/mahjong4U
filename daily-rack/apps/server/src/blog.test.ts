import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app.ts';
import { loadBlog, parsePost, type Blog } from './blog.ts';
import { pageTitle } from './blog-pages.ts';
import { loadContent } from './content.ts';
import { openDb } from './db.ts';

const content = loadContent(join(import.meta.dirname, '../../../content'), { devRotate: false });
const BASE = 'https://dailyrack.test';
const post = (fields: string, body = '') => `---\n${fields.trim()}\n---\n${body}`;

const FILES: Record<string, string> = {
  'first-charleston.md': post(
    `
title: Your first Charleston
meta_description: How the Charleston works, pass by pass, and which tiles to keep.
section: learn
primary_keyword: mahjong charleston
secondary_keywords:
  - charleston passes
  - courtesy pass
content_type: guide
author: Hazel Park
date_created: 2026-09-01
last_updated: 2026-10-02
status: published
cta:
  text: Start the Charleston lesson
  href: /lessons/charleston
  blurb: Practise the passes with Pip.
schema_article: |
  { "@type": "Article", "headline": "Not this one" }
`,
    `# Your first Charleston

Everyone passes three tiles at once.

## The first pass

Pass three tiles to the right.

### Right, across, left

Then across, then left.

## Keeping jokers

> Jokers never get passed. Pip will remind you.

| Pass | Direction |
| --- | --- |
| First | Right |
| Second | Across |
`,
  ),
  'jokers.md': post(`
title: "Jokers <script>alert('x')</script> & you"
meta_description: "When to swap a joker </script><b>and when not to</b>"
section: two-and-three
date_created: 2026-08-15
status: published
image: /blog/images/jokers.png
image_alt: "Two jokers & a <tile>"
`),
  'game-night.md': post(
    `
title: Hosting your first game night
slug: hosting-game-night
meta_description: Snacks, seats and a spare set.
section: get-a-game-going
date_created: 2026-10-20
status: draft
`,
    'Draft words.\n',
  ),
  'bad-yaml.md': post('title: [never closed\nsection: learn'),
  'bad-fields.md': post('title: Missing pieces\nsection: chess\ndate_created: 2026-13-40\nstatus: published\nmeta_description: x'),
  'no-frontmatter.md': '# Just Markdown\n\nNo fields at all.\n',
};

let blog: Blog;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  const dir = mkdtempSync(join(tmpdir(), 'daily-rack-blog-'));
  for (const [file, text] of Object.entries(FILES)) writeFileSync(join(dir, file), text);
  mkdirSync(join(dir, 'images'));
  writeFileSync(join(dir, 'images', 'jokers.png'), Buffer.from('89504e470d0a1a0a', 'hex'));
  blog = loadBlog(dir);
  app = makeApp(BASE);
});

function makeApp(publicBaseUrl: string | null) {
  return createApp({ db: openDb(':memory:'), content, config: { brand: 'Daily Rack', publicBaseUrl, secureCookies: false, splitThreshold: 30 }, blog });
}

async function get(path: string, init?: RequestInit, on = app) {
  const res = await on.request(path, init);
  return { status: res.status, headers: res.headers, text: await res.text() };
}

const jsonLd = (html: string) => JSON.parse(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)![1]!);

describe('loading posts', () => {
  it('keeps good posts and reports bad files without failing', () => {
    expect(blog.posts.map((p) => p.slug).sort()).toEqual(['first-charleston', 'hosting-game-night', 'jokers']);
    expect(blog.errors).toHaveLength(3);
    expect(blog.errors.find((e) => e.startsWith('bad-yaml.md:'))).toBeTruthy();
    expect(blog.errors.find((e) => e.startsWith('bad-fields.md:'))).toMatch(/section.*date_created|date_created.*section/s);
    expect(blog.errors.find((e) => e.startsWith('no-frontmatter.md:'))).toMatch(/no frontmatter/);
  });

  it('serves the blog while skipping the bad files', async () => {
    expect((await get('/blog')).status).toBe(200);
    expect((await get('/blog/bad-yaml')).status).toBe(404);
    expect((await get('/blog/bad-fields')).status).toBe(404);
  });

  it('needs alt text for an image', () => {
    const fields = 'title: T\nmeta_description: D\nsection: learn\ndate_created: 2026-01-01\nstatus: draft\nimage: /blog/images/a.png';
    expect(() => parsePost('a.md', post(fields))).toThrow(/image_alt/);
    expect(parsePost('a.md', post(`${fields}\nimage_alt: A tile`)).image).toEqual({ src: '/blog/images/a.png', alt: 'A tile' });
  });

  it('builds a contents list with ids on every H2 and H3, and drops the leading H1', () => {
    const charleston = blog.posts.find((p) => p.slug === 'first-charleston')!;
    expect(charleston.toc).toEqual([
      { id: 'the-first-pass', text: 'The first pass' },
      { id: 'keeping-jokers', text: 'Keeping jokers' },
    ]);
    expect(charleston.html).toContain('<h3 id="right-across-left">');
    expect(charleston.html).not.toContain('<h1');
    expect(charleston.html).toMatch(/<div class="table-scroll"[^>]*><table>[\s\S]*<\/table><\/div>/);
    expect(charleston.readingMinutes).toBe(1);
  });
});

describe('the index', () => {
  it('lists published posts newest first, and no drafts', async () => {
    const { status, text, headers } = await get('/blog');
    expect(status).toBe(200);
    expect(headers.get('cache-control')).toMatch(/public, max-age=\d+/);
    expect(text).toContain('<h1 class="hero-title" id="hero-title">The Table</h1>');
    expect(text.indexOf('Your first Charleston')).toBeGreaterThan(0);
    expect(text.indexOf('Your first Charleston')).toBeLessThan(text.indexOf('Jokers &lt;script&gt;'));
    expect(text).toContain('href="/blog/first-charleston"');
    expect(text).toContain('href="/blog/section/learn">Learn the Game</a>');
    expect(text).toContain('1 min read');
    expect(text).not.toContain('Hosting your first game night');
    expect(text).toContain(`<link rel="canonical" href="${BASE}/blog">`);
  });

  it('has a page per section with only that section’s posts', async () => {
    const learn = await get('/blog/section/learn');
    expect(learn.status).toBe(200);
    expect(learn.text).toContain('<h1>Learn the Game</h1>');
    expect(learn.text).toContain('Your first Charleston');
    expect(learn.text).not.toContain('Jokers &lt;script&gt;');
    // Only a draft lives here, so the section shows as empty and stays out of search.
    const games = await get('/blog/section/get-a-game-going');
    expect(games.text).not.toContain('Hosting your first game night');
    expect(games.text).toContain('<meta name="robots" content="noindex, nofollow">');
  });
});

describe('a post page', () => {
  it('has the title, one H1, a canonical URL, the description and valid JSON-LD', async () => {
    const { status, text } = await get('/blog/first-charleston');
    expect(status).toBe(200);
    expect(text).toContain('<html lang="en">');
    expect(text).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(text).toContain('<a class="skip-link" href="#main">');
    expect(text).toContain('<title>Your first Charleston — The Table | Daily Rack</title>');
    expect(text.match(/<h1[\s>]/g)).toHaveLength(1);
    expect(text).toContain('<h1 class="post-title">Your first Charleston</h1>');
    expect(text).toContain(`<link rel="canonical" href="${BASE}/blog/first-charleston">`);
    expect(text).toContain('<meta name="description" content="How the Charleston works, pass by pass, and which tiles to keep.">');
    expect(text).toContain('<meta property="og:type" content="article">');
    expect(text).toContain('<meta property="og:title" content="Your first Charleston">');
    expect(text).toContain('<meta property="og:site_name" content="Daily Rack">');
    expect(text).toContain(`<meta property="og:url" content="${BASE}/blog/first-charleston">`);
    expect(text).toContain('<meta property="article:published_time" content="2026-09-01">');
    expect(text).toContain('<meta property="article:modified_time" content="2026-10-02">');
    expect(text).toContain('<meta name="twitter:card" content="summary">');
    expect(text).not.toContain('noindex');
    expect(text).not.toContain('Not this one');

    const ld = jsonLd(text);
    const [article, crumbs] = ld['@graph'];
    expect(article).toMatchObject({
      '@type': 'Article',
      headline: 'Your first Charleston',
      datePublished: '2026-09-01',
      dateModified: '2026-10-02',
      author: { '@type': 'Organization', name: 'Daily Rack' },
      publisher: { '@type': 'Organization', name: 'Daily Rack' },
      mainEntityOfPage: { '@id': `${BASE}/blog/first-charleston` },
      keywords: ['mahjong charleston', 'charleston passes', 'courtesy pass'],
    });
    expect(crumbs['@type']).toBe('BreadcrumbList');
    expect(crumbs.itemListElement.map((i: { name: string }) => i.name)).toEqual(['Home', 'The Table', 'Learn the Game', 'Your first Charleston']);
    expect(text).not.toMatch(/FAQPage|HowTo/);
  });

  it('shows the byline, breadcrumbs, contents, body and the post’s call to action', async () => {
    const { text } = await get('/blog/first-charleston');
    expect(text).toMatch(/<nav class="breadcrumbs" aria-label="Breadcrumb">[\s\S]*href="\/">Home<[\s\S]*href="\/blog">The Table<[\s\S]*href="\/blog\/section\/learn">Learn the Game</);
    expect(text).toContain('<a class="button button-primary button-compact" href="/">Play Daily Rack</a>');
    expect(text).toContain('By <span class="byline-author">Hazel Park</span>');
    expect(text).toContain('Published <time datetime="2026-09-01">September 1, 2026</time>');
    expect(text).toContain('Updated <time datetime="2026-10-02">October 2, 2026</time>');
    expect(text).toContain('<li><a href="#the-first-pass">The first pass</a></li>');
    expect(text).toContain('<blockquote>');
    expect(text).toMatch(/<aside class="cta"[\s\S]*Practise the passes with Pip\.[\s\S]*href="\/lessons\/charleston">Start the Charleston lesson<\/a>/);
    expect(text).not.toMatch(/<script(?! type="application\/ld\+json")/);
  });

  it('falls back to the section’s call to action and the shorter title', async () => {
    const { text } = await get('/blog/jokers');
    expect(text).toContain('href="/table/new">Set up a table for two</a>');
    const titled = (title: string) => pageTitle({ ...blog.posts[0]!, seoTitle: null, title });
    expect(titled('Passing jokers in your first Charleston')).toBe('Passing jokers in your first Charleston | Daily Rack');
    expect(titled('Everything you need to know about passing jokers in the Charleston')).toBe(
      'Everything you need to know about passing jokers in the Charleston',
    );
    expect(pageTitle({ ...blog.posts[0]!, seoTitle: 'Custom title' })).toBe('Custom title');
  });

  it('shows the image and puts it in the social cards and JSON-LD', async () => {
    const { text } = await get('/blog/jokers');
    expect(text).toContain('<img src="/blog/images/jokers.png" alt="Two jokers &amp; a &lt;tile&gt;"');
    expect(text).toContain(`<meta property="og:image" content="${BASE}/blog/images/jokers.png">`);
    expect(text).toContain('<meta name="twitter:card" content="summary_large_image">');
    expect(jsonLd(text)['@graph'][0].image).toEqual([`${BASE}/blog/images/jokers.png`]);
    const image = await get('/blog/images/jokers.png');
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/png');
    expect(image.headers.get('cache-control')).toMatch(/^public, max-age=\d+$/);
    expect((await get('/blog/images/missing.png')).status).toBe(404);
  });

  it('escapes frontmatter, so a title containing <script> stays inert', async () => {
    for (const path of ['/blog/jokers', '/blog', '/blog/section/two-and-three']) {
      const { text } = await get(path);
      expect(text).not.toContain("<script>alert('x')</script>");
      expect(text).not.toContain('<b>and when not to</b>');
      expect(text).toContain('Jokers &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; you');
    }
    const { text } = await get('/blog/jokers');
    expect(text.match(/<script/g)).toHaveLength(1);
    expect(jsonLd(text)['@graph'][0].headline).toBe("Jokers <script>alert('x')</script> & you");
    const rss = await get('/blog/rss.xml');
    expect(rss.text).toContain('<title>Jokers &lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt; &amp; you</title>');
  });
});

describe('drafts', () => {
  it('open at their address with noindex and a banner', async () => {
    const { status, text, headers } = await get('/blog/hosting-game-night');
    expect(status).toBe(200);
    expect(text).toContain('<meta name="robots" content="noindex, nofollow">');
    expect(text).toContain('<strong>Draft:</strong> not published');
    expect(headers.get('x-robots-tag')).toBe('noindex, nofollow');
    expect(headers.get('cache-control')).toBe('private, no-store');
  });

  it('are left out of the index, the feed and the sitemap', async () => {
    for (const path of ['/blog', '/blog/rss.xml', '/sitemap.xml']) {
      const { text } = await get(path);
      expect(text).not.toContain('hosting-game-night');
      expect(text).not.toContain('Hosting your first game night');
    }
  });
});

describe('everything else', () => {
  it('answers unknown slugs and sections with a friendly 404', async () => {
    for (const path of ['/blog/no-such-post', '/blog/section/chess', '/blog/a/b/c']) {
      const { status, text } = await get(path);
      expect(status).toBe(404);
      expect(text).toContain('That page isn’t on the table');
      expect(text).toContain('href="/blog">Back to The Table</a>');
      expect(text).toContain('<meta name="robots" content="noindex, nofollow">');
    }
    const slash = await get('/blog/jokers/');
    expect(slash.status).toBe(301);
    expect(slash.headers.get('location')).toBe('/blog/jokers');
  });

  it('lists the site, the blog, sections with posts and every published post with lastmod in the sitemap', async () => {
    const { status, text, headers } = await get('/sitemap.xml');
    expect(status).toBe(200);
    expect(headers.get('content-type')).toContain('application/xml');
    expect(text).toContain(`<url><loc>${BASE}/</loc></url>`);
    expect(text).toContain(`<url><loc>${BASE}/blog</loc><lastmod>2026-10-02</lastmod></url>`);
    expect(text).toContain(`<url><loc>${BASE}/blog/first-charleston</loc><lastmod>2026-10-02</lastmod></url>`);
    expect(text).toContain(`<url><loc>${BASE}/blog/jokers</loc><lastmod>2026-08-15</lastmod></url>`);
    expect(text).toContain(`<loc>${BASE}/blog/section/learn</loc>`);
    expect(text).not.toContain('/blog/section/get-a-game-going');
    expect(text).not.toContain('/blog/section/card-year');
  });

  it('keeps robots out of the API and points them at the sitemap', async () => {
    const { text, headers } = await get('/robots.txt');
    expect(headers.get('content-type')).toContain('text/plain');
    expect(text).toContain('Disallow: /v1/');
    expect(text).toContain(`Sitemap: ${BASE}/sitemap.xml`);
  });

  it('has an RSS item for each published post', async () => {
    const { text, headers } = await get('/blog/rss.xml');
    expect(headers.get('content-type')).toContain('application/rss+xml');
    expect(text).toContain('<rss version="2.0"');
    expect(text.match(/<item>/g)).toHaveLength(2);
    expect(text).toContain(`<link>${BASE}/blog/first-charleston</link>`);
    expect(text).toContain('<pubDate>Tue, 01 Sep 2026 12:00:00 GMT</pubDate>');
  });

  it('serves the stylesheet with long-lived caching at the versioned address pages use', async () => {
    const page = await get('/blog');
    const href = /<link rel="stylesheet" href="(\/blog\/assets\/blog\.css\?v=[0-9a-f]+)">/.exec(page.text)![1]!;
    const css = await get(href);
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(css.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(css.text).toContain('--color-canvas');
  });

  it('uses the request’s own address when PUBLIC_BASE_URL is not set', async () => {
    const local = makeApp(null);
    const { text } = await get('/blog/jokers', { headers: { host: 'localhost:8795' } }, local);
    expect(text).toContain('<link rel="canonical" href="http://localhost:8795/blog/jokers">');
    const proxied = await get('/robots.txt', { headers: { host: 'example.app', 'x-forwarded-proto': 'https' } }, local);
    expect(proxied.text).toContain('Sitemap: https://example.app/sitemap.xml');
  });
});
