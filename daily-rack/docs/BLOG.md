# The Table (the blog)

"The friendly place to get better at American mahjong, and to get a game going." Plain server-rendered HTML at `/blog`, with no client JavaScript, so search engines read every page as it is. Every post ends by handing the reader to the app: a lesson, a game against the computer, a two-player table or Game Night.

| File | What it holds |
| --- | --- |
| `content/blog/*.md` | Posts: YAML frontmatter, then Markdown |
| `content/blog/images/` | Pictures for posts, served at `/blog/images/<file>` (create the folder when you need it) |
| `apps/server/src/blog.css` | The only stylesheet, built on the tokens below |
| `apps/server/src/blog-pages.ts` | The page templates, the RSS feed, the sitemap and robots.txt |
| `apps/server/src/blog.ts` | Loading and checking posts, and Markdown to HTML |
| `apps/server/src/blog-routes.ts` | Routes and cache headers |

## Routes

| Path | Page |
| --- | --- |
| `/blog` | The index: a felt hero, then published posts, newest first |
| `/blog/section/:section` | One section's posts |
| `/blog/:slug` | A post (drafts too, marked noindex with a banner) |
| `/blog/rss.xml` | RSS 2.0 of published posts |
| `/blog/assets/blog.css?v=…` | The stylesheet, cached for a year; the `v` changes with its content |
| `/sitemap.xml`, `/robots.txt` | For search engines |

Anything else under `/blog` gets the friendly 404. Canonical and social URLs use `PUBLIC_BASE_URL`, or the request's own address when it isn't set, so set it in production.

## Writing a post

```yaml
---
title: How the Charleston works, pass by pass
seo_title: How the Charleston Works in American Mahjong | Daily Rack   # optional
meta_description: The tile swap at the start of every hand, pass by pass, and what to keep.
slug: how-the-charleston-works          # optional; defaults to the file name
section: learn                          # two-and-three | learn | get-a-game-going | card-year
primary_keyword: mahjong charleston
secondary_keywords: [charleston passes, courtesy pass]
content_type: guide
author: Hazel Park
date_created: 2026-10-12
last_updated: 2026-10-26                # optional; defaults to date_created
status: draft                           # draft | published
image: /blog/images/charleston.png      # optional; a /path or an https:// URL
image_alt: Four racks mid-Charleston    # required with image
cta:                                    # optional; each section has a default
  text: Start the Charleston lesson
  href: /learn
  blurb: Pip walks you through every pass.
---
```

- Required: `title`, `meta_description`, `section`, `date_created`, `status`. Unknown fields (such as `schema_article`) are ignored; the structured data is generated.
- A post with any problem is skipped and logged as `blog_post_skipped` with the reason. `npm run content:check` lists the same problems before you deploy.
- Posts load when the server starts, so a new or changed post appears after the next deploy or restart.
- The page prints `title` as the only H1. A `# Heading` at the top of the Markdown is dropped and any other `#` becomes an H2. Start sections with `##`; the H2s make the "In this post" list (shown when there are two or more), and every heading gets an anchor id.
- Without `seo_title`, the page title is `title — The Table | Daily Rack`, shortened to `title | Daily Rack` or just `title` to stay within 60 characters. Keep `meta_description` near 150 characters.
- Section defaults for the call to action: Two & Three: a table for two (`/table/new`); Learn the Game: the first lesson (`/learn`); Get a Game Going: Game Night (`/night/new`); The Card Year: a practice round against the computer (`/practice`).
- Drafts open at their own URL so they can be reviewed, with `noindex, nofollow`, `Cache-Control: private, no-store` and a "Draft: not published" banner. They never appear on the index, section pages, RSS or the sitemap.

Each page head carries the title, meta description, canonical URL, Open Graph and Twitter tags (with `article:published_time` and `article:modified_time` on posts), and JSON-LD: an `Article` (author and publisher are the Organization "Daily Rack") with a `BreadcrumbList` on posts, a `Blog` on the index, and a `BreadcrumbList` on section pages.

## For the designer

Restyle in `blog.css` alone. Start with the tokens on `:root`; they match the app's `apps/mobile/src/theme.ts`. A dark set sits under `prefers-color-scheme: dark`. Keep the page free of JavaScript.

| Tokens | Used for |
| --- | --- |
| `--color-canvas`, `--color-surface` | Page background (cream), cards and tables |
| `--color-ink`, `--color-heading`, `--color-muted` | Body text, headings, dates and bylines |
| `--color-accent` | Links, eyebrows, list markers (magenta) |
| `--color-primary`, `--color-primary-pressed`, `--color-on-primary` | Buttons |
| `--color-sage`, `--color-pink` | Contents box, footer, table headers; asides and the call to action |
| `--color-felt`, `--color-felt-glow`, `--color-on-felt`, `--color-on-felt-muted`, `--color-felt-chip*` | The index hero and its section chips |
| `--color-warn-*` | The draft banner |
| `--color-focus`, `--color-focus-on-felt` | Keyboard focus rings |
| `--font-display`, `--font-body`, `--font-mono` | DM Serif Display (Google Fonts, linked in each page head), system sans, code |
| `--font-size-*`, `--line-height-*` | Body 18px (19px from 48rem), small, eyebrow, hero, h1 to h3, card titles |
| `--measure` | The reading column: `60ch`, about 70 letters a line |
| `--space-1` … `--space-8`, `--gutter`, `--width-wide` | 4px to 64px; side padding; header and footer width |
| `--radius-card`, `--radius-button`, `--radius-button-compact`, `--radius-chip`, `--radius-small` | As in the app: 20, 16, 12, 14, 8 |
| `--tap-min`, `--button-height`, `--focus-width` | 44px tap targets, 54px buttons, 3px focus rings |

Every page shares the same frame:

```
a.skip-link
header.site-header > .site-header-inner > a.brand (.brand-name, .brand-by) + a.button.button-primary.button-compact
nav.breadcrumbs > ol > li (last item on section pages is span[aria-current=page])
main#main
footer.site-footer > .site-footer-inner > p.footer-brand, p.footer-tagline, nav.footer-nav, ul.footer-links
```

What goes inside `main`:

| Page | Structure |
| --- | --- |
| Index | `section.hero > .hero-inner` (`.hero-eyebrow`, `h1.hero-title`, `.hero-lede`, `nav.section-nav a.chip`), then `.page` with `h2.list-title`, `ol.post-list` and `aside.cta` |
| Post card | `li.post-card > article`: `p.eyebrow a` (section), `h2`/`h3.post-card-title a` (the whole card is clickable), `p.post-card-description`, `p.post-meta` |
| Section | `.page > header.page-intro` (`.eyebrow`, `h1`, `.page-lede`), `ol.post-list` (or `p.empty-state`), `aside.cta` |
| Post | `p.draft-banner` (drafts only), `article.post[data-content-type]` > `header.post-header` (`.eyebrow`, `h1.post-title`, `p.byline` with `.byline-author`, `.byline-published`, `.byline-updated`, `.byline-reading`), `figure.post-image`, `.post-body` (`nav.toc`, `.prose`), `aside.cta` (`h2.cta-title`, `p.cta-blurb`, `a.button.button-primary`) |
| 404 | `.page.not-found`: `.eyebrow`, `h1`, `.page-lede`, `p.button-row` |

Inside `.prose`, Markdown gives plain elements: `h2`/`h3` with ids, `p`, lists, `blockquote` (styled as a friendly aside), `img`, `code`/`pre`, `hr`, and tables inside `div.table-scroll`, which scrolls sideways on phones. From 78rem the contents move beside the article and stay in view.

Keep text at WCAG AA contrast (every pair in the current tokens is 5:1 or better), focus rings visible, and tap targets at least `--tap-min`. To preview, put a sample post in a copy of `content/` and run the server with `CONTENT_DIR` pointing at it.
