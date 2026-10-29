import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Marked, type Token, type Tokens } from 'marked';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';

// The Table, Daily Rack's blog. Posts are Markdown files in content/blog with YAML
// frontmatter (see docs/BLOG.md). They load once at startup, like extra cards: a post
// with any problem is left out and the problems are reported so they can be fixed.

export const BLOG_SECTIONS = {
  'two-and-three': {
    label: 'Two & Three',
    description: 'American mahjong when there are only two or three of you: two-player games, an empty seat, and keeping a small table fun.',
  },
  learn: {
    label: 'Learn the Game',
    description: 'From the tiles to your first real game: the rules, the Charleston, jokers and reading the card, explained kindly.',
  },
  'get-a-game-going': {
    label: 'Get a Game Going',
    description: 'Find your players, host a game night and keep your group together, around a real table or online.',
  },
  'card-year': {
    label: 'The Card Year',
    description: 'New card season and the year around it: what changes, which hands to practise, and settling in to a new card.',
  },
} as const;

export type SectionId = keyof typeof BLOG_SECTIONS;
export const SECTION_IDS = Object.keys(BLOG_SECTIONS) as [SectionId, ...SectionId[]];

export interface Cta {
  text: string;
  href: string;
  blurb?: string;
}

/** Where each section hands readers to the app when a post doesn't set its own cta. */
export const DEFAULT_CTAS: Record<SectionId, Cta> = {
  'two-and-three': {
    text: 'Set up a table for two',
    href: '/table/new',
    blurb: 'Just the two of you? Play two hands each, against the computer or each other. Only three? A computer takes the empty seat.',
  },
  learn: {
    text: 'Start the first lesson',
    href: '/learn',
    blurb: 'Ten short lessons with Pip, the sparrow, then a practice round where Pip coaches every pass, discard and call.',
  },
  'get-a-game-going': {
    text: 'Plan a Game Night',
    href: '/night/new',
    blurb: 'Pick a date, let everyone vote on a time and RSVP, and keep an online table as the fallback.',
  },
  'card-year': {
    text: 'Play the computer',
    href: '/practice',
    blurb: 'Try new hands in an untimed practice round against the computer, with Pip ready to help.',
  },
};

export interface TocEntry {
  id: string;
  text: string;
}

export interface Post {
  file: string;
  slug: string;
  title: string;
  seoTitle: string | null;
  description: string;
  section: SectionId;
  primaryKeyword: string | null;
  secondaryKeywords: string[];
  contentType: string | null;
  author: string | null;
  /** YYYY-MM-DD */
  published: string;
  /** YYYY-MM-DD; the published date when the post was never updated. */
  updated: string;
  status: 'draft' | 'published';
  image: { src: string; alt: string } | null;
  cta: Cta | null;
  /** The rendered body, without the title. */
  html: string;
  toc: TocEntry[];
  readingMinutes: number;
}

export interface Blog {
  /** Folder the posts came from; images are served from its images/ folder. */
  dir: string | null;
  /** Every valid post, drafts included, newest first. */
  posts: Post[];
  errors: string[];
}

export const emptyBlog = (): Blog => ({ dir: null, posts: [], errors: [] });

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
/** Paths under /blog that a post can't take. */
const RESERVED_SLUGS = new Set(['section', 'assets', 'images']);
const WORDS_PER_MINUTE = 225;

const isRealDate = (s: string) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);
const DateString = z.preprocess(
  // YAML 1.1 documents can turn dates into Date objects; keep them as YYYY-MM-DD.
  (v) => (v instanceof Date ? v.toISOString().slice(0, 10) : v),
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'use YYYY-MM-DD').refine(isRealDate, 'is not a real date'),
);
const Href = z
  .string()
  .trim()
  .refine((h) => /^\/(?!\/)/.test(h) || /^https?:\/\/[^\s]+$/.test(h), 'must be a path starting with / or an http(s) URL');
const Text = (max: number) => z.string().trim().min(1).max(max);

const Frontmatter = z
  .object({
    title: Text(200),
    seo_title: Text(200).optional(),
    meta_description: Text(400),
    slug: z.string().regex(SLUG, 'use lowercase letters, numbers and hyphens').optional(),
    section: z.enum(SECTION_IDS),
    primary_keyword: Text(200).optional(),
    secondary_keywords: z.preprocess((v) => (typeof v === 'string' ? v.split(',') : v), z.array(z.string().trim().min(1).max(200)).default([])),
    content_type: Text(100).optional(),
    author: Text(100).optional(),
    date_created: DateString,
    last_updated: DateString.optional(),
    status: z.enum(['draft', 'published']),
    image: Href.optional(),
    image_alt: Text(300).optional(),
    cta: z.object({ text: Text(80), href: Href, blurb: Text(400).optional() }).optional(),
  })
  .superRefine((fm, ctx) => {
    if (fm.image && !fm.image_alt) ctx.addIssue({ code: 'custom', path: ['image_alt'], message: 'describe the image for people who can’t see it' });
    if (fm.last_updated && fm.last_updated < fm.date_created) ctx.addIssue({ code: 'custom', path: ['last_updated'], message: 'is before date_created' });
  });

export function loadBlog(dir: string): Blog {
  const posts: Post[] = [];
  const errors: string[] = [];
  if (!existsSync(dir)) return { dir: null, posts, errors };
  const files = readdirSync(dir)
    .filter((f) => f.endsWith('.md') && !f.startsWith('_') && !f.startsWith('.') && f.toLowerCase() !== 'readme.md')
    .sort();
  const bySlug = new Map<string, string>();
  for (const file of files) {
    try {
      const post = parsePost(file, readFileSync(join(dir, file), 'utf8'));
      const taken = bySlug.get(post.slug);
      if (taken) throw new Error(`slug "${post.slug}" is already used by ${taken}`);
      bySlug.set(post.slug, file);
      posts.push(post);
    } catch (error) {
      errors.push(`${file}: ${(error as Error).message}`);
    }
  }
  posts.sort((a, b) => b.published.localeCompare(a.published) || b.updated.localeCompare(a.updated) || a.title.localeCompare(b.title));
  return { dir, posts, errors };
}

export function parsePost(file: string, source: string): Post {
  const match = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)([\s\S]*)$/.exec(source);
  if (!match) throw new Error('no frontmatter: start the file with a --- line, the fields, then another --- line');
  const data: unknown = parseYaml(match[1]!);
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('frontmatter is not a set of fields');
  // An empty field means "not set", so `seo_title:` on its own falls back like a missing one.
  const fields = Object.fromEntries(Object.entries(data).filter(([, v]) => v !== null && v !== ''));
  const parsed = Frontmatter.safeParse(fields);
  if (!parsed.success) {
    const missing = (path: PropertyKey[]) => path.length === 1 && fields[path[0] as string] === undefined;
    throw new Error(parsed.error.issues.map((i) => (missing(i.path) ? `${String(i.path[0])} is missing` : `${i.path.join('.') || 'frontmatter'}: ${i.message}`)).join('; '));
  }
  const fm = parsed.data;
  const slug = fm.slug ?? file.replace(/\.md$/, '');
  if (!SLUG.test(slug)) throw new Error(`the file name makes the slug "${slug}"; rename the file or set slug (lowercase letters, numbers and hyphens)`);
  if (RESERVED_SLUGS.has(slug)) throw new Error(`"${slug}" can't be a slug; choose another`);
  const body = renderMarkdown(match[2]!);
  return {
    file,
    slug,
    title: fm.title,
    seoTitle: fm.seo_title ?? null,
    description: fm.meta_description,
    section: fm.section,
    primaryKeyword: fm.primary_keyword ?? null,
    secondaryKeywords: fm.secondary_keywords,
    contentType: fm.content_type ?? null,
    author: fm.author ?? null,
    published: fm.date_created,
    updated: fm.last_updated ?? fm.date_created,
    status: fm.status,
    image: fm.image ? { src: fm.image, alt: fm.image_alt! } : null,
    cta: fm.cta ?? null,
    ...body,
  };
}

/** Ids the page templates use, so a heading never takes one. */
const TEMPLATE_IDS = ['main', 'toc-title', 'cta-title'];

/**
 * Markdown to HTML. A leading H1 is dropped (the page prints the title as its only H1) and
 * any other H1 becomes an H2. Every heading gets an id, the H2s make the table of
 * contents, and tables sit in a wrapper that scrolls sideways on phones.
 */
function renderMarkdown(markdown: string): { html: string; toc: TocEntry[]; readingMinutes: number } {
  const toc: TocEntry[] = [];
  const used = new Set(TEMPLATE_IDS);
  const marked = new Marked({
    gfm: true,
    renderer: {
      heading({ tokens, depth }: Tokens.Heading) {
        const inner = this.parser.parseInline(tokens);
        const text = plainText(inner);
        const id = uniqueId(slugify(text), used);
        const level = Math.max(depth, 2);
        if (level === 2) toc.push({ id, text });
        return `<h${level} id="${id}">${inner}</h${level}>\n`;
      },
    },
  });
  const tokens: Token[] = marked.lexer(markdown);
  const first = tokens.findIndex((t) => t.type !== 'space');
  if (first >= 0 && tokens[first]!.type === 'heading' && (tokens[first] as Tokens.Heading).depth === 1) tokens.splice(first, 1);
  const html = marked
    .parser(tokens)
    .replace(/<table(\s[^>]*)?>/g, (tag) => `<div class="table-scroll" role="region" aria-label="Table" tabindex="0">${tag}`)
    .replace(/<\/table>/g, '</table></div>')
    .replace(/<img /g, '<img loading="lazy" decoding="async" ');
  const words = plainText(html).split(/\s+/).filter(Boolean).length;
  return { html, toc, readingMinutes: Math.max(1, Math.ceil(words / WORDS_PER_MINUTE)) };
}

function plainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (_, e: string) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'", nbsp: ' ' })[e]!)
    .replace(/\s+/g, ' ')
    .trim();
}

function slugify(text: string): string {
  return (
    text
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60)
      .replace(/-+$/, '') || 'section'
  );
}

function uniqueId(base: string, used: Set<string>): string {
  let id = base;
  for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
  used.add(id);
  return id;
}

export const publishedPosts = (blog: Blog) => blog.posts.filter((p) => p.status === 'published');
