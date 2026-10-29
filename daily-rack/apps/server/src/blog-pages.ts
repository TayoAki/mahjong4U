import { BLOG_SECTIONS, DEFAULT_CTAS, SECTION_IDS, type Post, type SectionId } from './blog.ts';

// HTML for The Table: plain server-rendered pages with no client JavaScript. Every look
// lives in blog.css; the markup here only names things (see docs/BLOG.md). Every value
// from frontmatter goes through esc() or jsonLd(); post bodies are our own Markdown.

const BLOG_NAME = 'The Table';
const BRAND = 'Daily Rack';
const TAGLINE = 'The friendly place to get better at American mahjong, and to get a game going.';
const INDEX_TITLE = 'The Table: American Mahjong Tips & Game Nights | Daily Rack';
const INDEX_DESCRIPTION = `${TAGLINE} Lessons, strategy, the card year and game night ideas from Daily Rack.`;
const TITLE_LIMIT = 60;

export interface PageContext {
  /** Origin for canonical and social URLs, without a trailing slash. */
  base: string;
  /** The stylesheet's URL, versioned so it can be cached for a year. */
  css: string;
}

interface Head {
  title: string;
  /** For social cards, which show the site name on their own; defaults to the title. */
  socialTitle?: string;
  description: string;
  /** Path, e.g. /blog/my-post; null for pages with no canonical (the 404). */
  path: string | null;
  type: 'website' | 'article';
  noindex?: boolean;
  image?: { src: string; alt: string } | null;
  article?: { published: string; modified: string; section: string; tags: string[] };
  jsonLd?: object;
}

interface Crumb {
  name: string;
  path: string;
}

function esc(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]!);
}

/** JSON for a <script> block: nothing in it can close the tag. */
function jsonLd(data: object): string {
  return JSON.stringify(data).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
}

const absolute = (ctx: PageContext, pathOrUrl: string) => (/^https?:\/\//.test(pathOrUrl) ? pathOrUrl : `${ctx.base}${pathOrUrl}`);
const postPath = (post: Post) => `/blog/${post.slug}`;
const sectionPath = (section: SectionId) => `/blog/section/${section}`;

/** `title — The Table | Daily Rack`, dropping the longer parts when it won't fit a results page. */
export function pageTitle(post: Post): string {
  if (post.seoTitle) return post.seoTitle;
  const options = [`${post.title} — ${BLOG_NAME} | ${BRAND}`, `${post.title} | ${BRAND}`];
  return options.find((t) => t.length <= TITLE_LIMIT) ?? post.title;
}

const longDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'long', timeZone: 'UTC' });
const shortDate = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' });
const time = (day: string, format = longDate) => `<time datetime="${day}">${format.format(new Date(`${day}T00:00:00Z`))}</time>`;
const minutes = (post: Post) => `${post.readingMinutes} min read`;

// ------------------------------------------------------------------ shell

function layout(ctx: PageContext, head: Head, body: string, crumbs: Crumb[] = []): string {
  const canonical = head.path ? absolute(ctx, head.path) : null;
  const image = head.image ? { url: absolute(ctx, head.image.src), alt: head.image.alt } : null;
  const meta = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${esc(head.title)}</title>`,
    `<meta name="description" content="${esc(head.description)}">`,
    head.noindex ? `<meta name="robots" content="noindex, nofollow">` : '',
    canonical ? `<link rel="canonical" href="${esc(canonical)}">` : '',
    `<meta name="color-scheme" content="light dark">`,
    `<meta name="theme-color" content="#1D4B3E">`,
    `<meta property="og:type" content="${head.type}">`,
    `<meta property="og:site_name" content="${BRAND}">`,
    `<meta property="og:title" content="${esc(head.socialTitle ?? head.title)}">`,
    `<meta property="og:description" content="${esc(head.description)}">`,
    canonical ? `<meta property="og:url" content="${esc(canonical)}">` : '',
    `<meta property="og:locale" content="en_US">`,
    image ? `<meta property="og:image" content="${esc(image.url)}">\n<meta property="og:image:alt" content="${esc(image.alt)}">` : '',
    head.article
      ? [
          `<meta property="article:published_time" content="${head.article.published}">`,
          `<meta property="article:modified_time" content="${head.article.modified}">`,
          `<meta property="article:section" content="${esc(head.article.section)}">`,
          ...head.article.tags.map((tag) => `<meta property="article:tag" content="${esc(tag)}">`),
        ].join('\n')
      : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(head.socialTitle ?? head.title)}">`,
    `<meta name="twitter:description" content="${esc(head.description)}">`,
    image ? `<meta name="twitter:image" content="${esc(image.url)}">\n<meta name="twitter:image:alt" content="${esc(image.alt)}">` : '',
    `<link rel="alternate" type="application/rss+xml" title="${BLOG_NAME} from ${BRAND}" href="/blog/rss.xml">`,
    `<link rel="icon" href="/favicon.ico">`,
    `<link rel="preconnect" href="https://fonts.googleapis.com">`,
    `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
    `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&amp;display=swap">`,
    `<link rel="stylesheet" href="${esc(ctx.css)}">`,
    head.jsonLd ? `<script type="application/ld+json">${jsonLd(head.jsonLd)}</script>` : '',
  ].filter(Boolean);

  return `<!doctype html>
<html lang="en">
<head>
${meta.join('\n')}
</head>
<body>
<a class="skip-link" href="#main">Skip to content</a>
<header class="site-header">
  <div class="site-header-inner">
    <a class="brand" href="/blog"><span class="brand-name">${BLOG_NAME}</span><span class="brand-by">by ${BRAND}</span></a>
    <a class="button button-primary button-compact" href="/">Play ${BRAND}</a>
  </div>
</header>
${crumbs.length ? breadcrumbs(crumbs) : ''}
${body}
${footer()}
</body>
</html>
`;
}

function breadcrumbs(crumbs: Crumb[]): string {
  const items = crumbs.map((crumb, i) =>
    i === crumbs.length - 1 && crumb.path === '' ? `<li><span aria-current="page">${esc(crumb.name)}</span></li>` : `<li><a href="${esc(crumb.path)}">${esc(crumb.name)}</a></li>`,
  );
  return `<nav class="breadcrumbs" aria-label="Breadcrumb">
  <ol>
    ${items.join('\n    ')}
  </ol>
</nav>`;
}

function footer(): string {
  return `<footer class="site-footer">
  <div class="site-footer-inner">
    <p class="footer-brand"><span class="brand-name">${BLOG_NAME}</span> by ${BRAND}</p>
    <p class="footer-tagline">${TAGLINE}</p>
    <nav class="footer-nav" aria-label="Sections">
      <ul>
        ${SECTION_IDS.map((id) => `<li><a href="${sectionPath(id)}">${esc(BLOG_SECTIONS[id].label)}</a></li>`).join('\n        ')}
      </ul>
    </nav>
    <ul class="footer-links">
      <li><a href="/blog">All posts</a></li>
      <li><a href="/blog/rss.xml">RSS feed</a></li>
      <li><a href="/">Play ${BRAND}</a></li>
    </ul>
  </div>
</footer>`;
}

function postCard(post: Post, level: 2 | 3, showSection: boolean): string {
  const lines = [
    showSection ? `<p class="eyebrow"><a href="${sectionPath(post.section)}">${esc(BLOG_SECTIONS[post.section].label)}</a></p>` : '',
    `<h${level} class="post-card-title"><a href="${postPath(post)}">${esc(post.title)}</a></h${level}>`,
    `<p class="post-card-description">${esc(post.description)}</p>`,
    `<p class="post-meta">${time(post.published, shortDate)} <span aria-hidden="true">·</span> ${minutes(post)}</p>`,
  ].filter(Boolean);
  return `<li class="post-card">
      <article>
        ${lines.join('\n        ')}
      </article>
    </li>`;
}

function postList(posts: Post[], empty: string, { level, showSection }: { level: 2 | 3; showSection: boolean }): string {
  if (posts.length === 0) return `<p class="empty-state">${empty}</p>`;
  return `<ol class="post-list">
    ${posts.map((post) => postCard(post, level, showSection)).join('\n    ')}
  </ol>`;
}

function ctaBox(cta: { text: string; href: string; blurb?: string }, title = `Try it in ${BRAND}`): string {
  return `<aside class="cta" aria-labelledby="cta-title">
  <h2 class="cta-title" id="cta-title">${esc(title)}</h2>
  ${cta.blurb ? `<p class="cta-blurb">${esc(cta.blurb)}</p>` : ''}
  <a class="button button-primary" href="${esc(cta.href)}">${esc(cta.text)}</a>
</aside>`;
}

const organization = (ctx: PageContext) => ({ '@type': 'Organization', name: BRAND, url: `${ctx.base}/` });

function breadcrumbList(ctx: PageContext, crumbs: Crumb[]) {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: crumbs.map((crumb, i) => ({ '@type': 'ListItem', position: i + 1, name: crumb.name, item: absolute(ctx, crumb.path) })),
  };
}

// ------------------------------------------------------------------ pages

export function indexPage(ctx: PageContext, posts: Post[]): string {
  const body = `<main id="main">
<section class="hero" aria-labelledby="hero-title">
  <div class="hero-inner">
    <p class="hero-eyebrow">The ${BRAND} blog</p>
    <h1 class="hero-title" id="hero-title">${BLOG_NAME}</h1>
    <p class="hero-lede">${TAGLINE}</p>
    <nav class="section-nav" aria-label="Sections">
      <ul>
        ${SECTION_IDS.map((id) => `<li><a class="chip" href="${sectionPath(id)}">${esc(BLOG_SECTIONS[id].label)}</a></li>`).join('\n        ')}
      </ul>
    </nav>
  </div>
</section>
<div class="page">
  <h2 class="list-title">Latest posts</h2>
  ${postList(posts, 'The first posts are on their way. Pull up a chair in the meantime: Pip’s lessons and a practice game are in the app.', { level: 3, showSection: true })}
  ${ctaBox(DEFAULT_CTAS.learn, 'New to American mahjong?')}
</div>
</main>`;
  return layout(ctx, {
    title: INDEX_TITLE,
    socialTitle: `${BLOG_NAME} from ${BRAND}`,
    description: INDEX_DESCRIPTION,
    path: '/blog',
    type: 'website',
    jsonLd: {
      '@context': 'https://schema.org',
      '@type': 'Blog',
      name: BLOG_NAME,
      description: TAGLINE,
      url: `${ctx.base}/blog`,
      inLanguage: 'en',
      publisher: organization(ctx),
    },
  }, body);
}

export function sectionPage(ctx: PageContext, section: SectionId, posts: Post[]): string {
  const { label, description } = BLOG_SECTIONS[section];
  const crumbs: Crumb[] = [{ name: 'Home', path: '/' }, { name: BLOG_NAME, path: '/blog' }, { name: label, path: sectionPath(section) }];
  const body = `<main id="main">
<div class="page">
  <header class="page-intro">
    <p class="eyebrow">${BLOG_NAME}</p>
    <h1>${esc(label)}</h1>
    <p class="page-lede">${esc(description)}</p>
  </header>
  ${postList(posts, 'Nothing in this section yet. <a href="/blog">See all posts</a>.', { level: 2, showSection: false })}
  ${ctaBox(DEFAULT_CTAS[section])}
</div>
</main>`;
  return layout(
    ctx,
    {
      title: `${label} — ${BLOG_NAME} | ${BRAND}`,
      socialTitle: `${label} — ${BLOG_NAME}`,
      description,
      path: sectionPath(section),
      type: 'website',
      // An empty section is thin; it joins the index once it has a post.
      noindex: posts.length === 0,
      jsonLd: { '@context': 'https://schema.org', ...breadcrumbList(ctx, crumbs) },
    },
    body,
    [...crumbs.slice(0, -1), { name: label, path: '' }],
  );
}

export function postPage(ctx: PageContext, post: Post): string {
  const section = BLOG_SECTIONS[post.section];
  const crumbs: Crumb[] = [{ name: 'Home', path: '/' }, { name: BLOG_NAME, path: '/blog' }, { name: section.label, path: sectionPath(post.section) }];
  const draft = post.status === 'draft';
  const keywords = [post.primaryKeyword, ...post.secondaryKeywords].filter((k): k is string => !!k);
  const updated = post.updated !== post.published ? ` <span aria-hidden="true">·</span> <span class="byline-updated">Updated ${time(post.updated)}</span>` : '';
  const toc =
    post.toc.length >= 2
      ? `<nav class="toc" aria-labelledby="toc-title">
    <h2 class="toc-title" id="toc-title">In this post</h2>
    <ol>
      ${post.toc.map((entry) => `<li><a href="#${entry.id}">${esc(entry.text)}</a></li>`).join('\n      ')}
    </ol>
  </nav>`
      : '';

  const body = `<main id="main">
${draft ? `<p class="draft-banner" role="status"><strong>Draft:</strong> not published</p>\n` : ''}<article class="post"${post.contentType ? ` data-content-type="${esc(post.contentType)}"` : ''}>
  <header class="post-header">
    <p class="eyebrow"><a href="${sectionPath(post.section)}">${esc(section.label)}</a></p>
    <h1 class="post-title">${esc(post.title)}</h1>
    <p class="byline">${post.author ? `By <span class="byline-author">${esc(post.author)}</span> <span aria-hidden="true">·</span> ` : ''}<span class="byline-published">Published ${time(post.published)}</span>${updated} <span aria-hidden="true">·</span> <span class="byline-reading">${minutes(post)}</span></p>
  </header>
  ${post.image ? `<figure class="post-image"><img src="${esc(post.image.src)}" alt="${esc(post.image.alt)}" fetchpriority="high"></figure>` : ''}
  <div class="post-body">
  ${toc}
  <div class="prose">
${post.html}
  </div>
  </div>
  ${ctaBox(post.cta ?? DEFAULT_CTAS[post.section])}
</article>
</main>`;

  const canonical = `${ctx.base}${postPath(post)}`;
  return layout(
    ctx,
    {
      title: pageTitle(post),
      socialTitle: post.title,
      description: post.description,
      path: postPath(post),
      type: 'article',
      noindex: draft,
      image: post.image,
      article: { published: post.published, modified: post.updated, section: section.label, tags: keywords },
      jsonLd: {
        '@context': 'https://schema.org',
        '@graph': [
          {
            '@type': 'Article',
            headline: post.title,
            description: post.description,
            datePublished: post.published,
            dateModified: post.updated,
            author: organization(ctx),
            publisher: organization(ctx),
            mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
            ...(post.image ? { image: [absolute(ctx, post.image.src)] } : {}),
            articleSection: section.label,
            ...(keywords.length ? { keywords } : {}),
            inLanguage: 'en',
          },
          breadcrumbList(ctx, [...crumbs, { name: post.title, path: postPath(post) }]),
        ],
      },
    },
    body,
    crumbs,
  );
}

export function notFoundPage(ctx: PageContext): string {
  const body = `<main id="main">
<div class="page not-found">
  <p class="eyebrow">Page not found</p>
  <h1>That page isn’t on the table</h1>
  <p class="page-lede">We couldn’t find what you were looking for. It may have moved, or the link may have a typo.</p>
  <p class="button-row"><a class="button button-primary" href="/blog">Back to ${BLOG_NAME}</a> <a class="button button-secondary" href="/">Play ${BRAND}</a></p>
</div>
</main>`;
  return layout(ctx, { title: `Page not found | ${BRAND}`, description: TAGLINE, path: null, type: 'website', noindex: true }, body);
}

// ------------------------------------------------------------------ feeds

const xml = esc;
const rfc822 = (day: string) => new Date(`${day}T12:00:00Z`).toUTCString();

export function rssFeed(ctx: PageContext, posts: Post[]): string {
  const items = posts.map(
    (post) => `    <item>
      <title>${xml(post.title)}</title>
      <link>${xml(absolute(ctx, postPath(post)))}</link>
      <guid isPermaLink="true">${xml(absolute(ctx, postPath(post)))}</guid>
      <pubDate>${rfc822(post.published)}</pubDate>
      <category>${xml(BLOG_SECTIONS[post.section].label)}</category>
      <description>${xml(post.description)}</description>
    </item>`,
  );
  const newest = posts.reduce<string | null>((max, p) => (!max || p.updated > max ? p.updated : max), null);
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${BLOG_NAME} from ${BRAND}</title>
    <link>${xml(ctx.base)}/blog</link>
    <description>${xml(TAGLINE)}</description>
    <language>en-us</language>
${newest ? `    <lastBuildDate>${rfc822(newest)}</lastBuildDate>\n` : ''}    <atom:link href="${xml(ctx.base)}/blog/rss.xml" rel="self" type="application/rss+xml"/>
${items.join('\n')}
  </channel>
</rss>
`;
}

export function sitemap(ctx: PageContext, posts: Post[]): string {
  const latest = (list: Post[]) => list.reduce<string | null>((max, p) => (!max || p.updated > max ? p.updated : max), null);
  const entries: { path: string; lastmod: string | null }[] = [
    { path: '/', lastmod: null },
    { path: '/blog', lastmod: latest(posts) },
    ...SECTION_IDS.flatMap((id) => {
      const inSection = posts.filter((p) => p.section === id);
      return inSection.length ? [{ path: sectionPath(id), lastmod: latest(inSection) }] : [];
    }),
    ...posts.map((post) => ({ path: postPath(post), lastmod: post.updated })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${entries.map((e) => `  <url><loc>${xml(absolute(ctx, e.path))}</loc>${e.lastmod ? `<lastmod>${e.lastmod}</lastmod>` : ''}</url>`).join('\n')}
</urlset>
`;
}

export function robotsTxt(ctx: PageContext): string {
  return `User-agent: *
Allow: /
Disallow: /v1/

Sitemap: ${ctx.base}/sitemap.xml
`;
}
