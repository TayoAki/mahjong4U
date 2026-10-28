import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import type { Db } from './db.ts';
import { ensureProfile, type Profile } from './social.ts';

// "Report a problem" in the app: what went wrong, the screen it happened on, the device and
// app details the app fills in, and an optional screenshot. Moderators read them alongside
// player reports.

/** Largest screenshot we keep, after decoding. The app shrinks screenshots well below this. */
export const MAX_SCREENSHOT_BYTES = 1_500_000;
/** Request size for a report: the base64 screenshot plus room for the text. */
export const MAX_BUG_REPORT_BODY = Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 64_000;

const detail = z.union([z.string().max(500), z.number(), z.boolean(), z.null(), z.array(z.string().max(500)).max(20)]);

export const BugReportBody = z.object({
  description: z.string().trim().min(1).max(4000),
  screen: z.string().trim().min(1).max(200),
  details: z
    .record(z.string().max(40), detail)
    .refine((d) => Object.keys(d).length <= 40, 'Too many details.')
    .default({}),
  screenshot: z
    .object({ type: z.enum(['image/jpeg', 'image/png']), data: z.string().max(Math.ceil((MAX_SCREENSHOT_BYTES * 4) / 3) + 4) })
    .nullable()
    .optional(),
});
export type BugReportInput = z.infer<typeof BugReportBody>;

export class BugReportError extends Error {}

const SIGNATURES: Record<'image/jpeg' | 'image/png', number[]> = {
  'image/jpeg': [0xff, 0xd8, 0xff],
  'image/png': [0x89, 0x50, 0x4e, 0x47],
};

/** Decodes the screenshot and checks it really is the image type it claims to be. */
function decodeScreenshot(shot: NonNullable<BugReportInput['screenshot']>): Buffer {
  const bytes = Buffer.from(shot.data.replace(/^data:image\/\w+;base64,/, ''), 'base64');
  if (bytes.length === 0 || bytes.length > MAX_SCREENSHOT_BYTES) throw new BugReportError('That screenshot is too large. Try again without it.');
  if (!SIGNATURES[shot.type].every((b, i) => bytes[i] === b)) throw new BugReportError('That screenshot could not be read. Try again without it.');
  return bytes;
}

export function fileBugReport(db: Db, principalId: string, input: BugReportInput, now: Date): { id: string } {
  const screenshot = input.screenshot ? decodeScreenshot(input.screenshot) : null;
  const id = randomUUID();
  db.prepare(
    'INSERT INTO bug_reports (id, principal_id, description, screen, details, screenshot, screenshot_type, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(id, principalId, input.description, input.screen, JSON.stringify(input.details), screenshot, screenshot ? input.screenshot!.type : null, now.toISOString());
  return { id };
}

export interface BugReport {
  id: string;
  status: 'open' | 'closed';
  description: string;
  screen: string;
  details: Record<string, unknown>;
  hasScreenshot: boolean;
  createdAt: string;
  from: Profile;
}

interface Row {
  id: string;
  principal_id: string;
  status: 'open' | 'closed';
  description: string;
  screen: string;
  details: string;
  has_screenshot: number;
  created_at: string;
}

export function listBugReports(db: Db, status: 'open' | 'all', now: Date): BugReport[] {
  const rows = db
    .prepare(
      `SELECT id, principal_id, status, description, screen, details, screenshot IS NOT NULL AS has_screenshot, created_at
       FROM bug_reports ${status === 'open' ? "WHERE status = 'open'" : ''} ORDER BY created_at DESC LIMIT 200`,
    )
    .all() as unknown as Row[];
  return rows.map((r) => ({
    id: r.id,
    status: r.status,
    description: r.description,
    screen: r.screen,
    details: JSON.parse(r.details) as Record<string, unknown>,
    hasScreenshot: Boolean(r.has_screenshot),
    createdAt: r.created_at,
    from: ensureProfile(db, r.principal_id, now),
  }));
}

export function bugScreenshot(db: Db, id: string): { type: string; bytes: Uint8Array } | null {
  const row = db.prepare('SELECT screenshot, screenshot_type FROM bug_reports WHERE id = ?').get(id) as { screenshot: Uint8Array | null; screenshot_type: string | null } | undefined;
  return row?.screenshot && row.screenshot_type ? { type: row.screenshot_type, bytes: row.screenshot } : null;
}

/** Closes (or reopens) a report. False if there's no such report. */
export function setBugReportStatus(db: Db, id: string, status: 'open' | 'closed'): boolean {
  return Number(db.prepare('UPDATE bug_reports SET status = ? WHERE id = ?').run(status, id).changes) > 0;
}

/** A one-line summary of the device, for the moderator notification. */
export function deviceLine(details: BugReportInput['details']): string {
  return [details.device, details.os, details.appVersion ? `app ${details.appVersion}` : null].filter((v) => typeof v === 'string' && v).join(', ');
}
