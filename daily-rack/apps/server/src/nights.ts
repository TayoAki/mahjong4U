import { randomBytes, randomUUID } from 'node:crypto';
import { transaction, type Db } from './db.ts';
import type { Hub } from './realtime.ts';
import { conversationFor, ensureProfile } from './social.ts';

// Game Night: plan an in-person game. The host offers two or three times, friends vote
// from a link (no install needed), and the host confirms one. Ties stay visible.

export type Rsvp = 'pending' | 'yes' | 'maybe' | 'no';

interface NightRow {
  id: string;
  host_id: string;
  title: string;
  location: string | null;
  time_zone: string;
  invite_token: string;
  status: 'polling' | 'confirmed' | 'cancelled';
  confirmed_slot: string | null;
  seats: string | null;
  created_at: string;
  updated_at: string;
}

export class NightError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export function validTimeZone(zone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone });
    return true;
  } catch {
    return false;
  }
}

export function createNight(
  db: Db,
  hostId: string,
  input: { title: string; location: string | null; timeZone: string; slots: string[] },
  now: Date,
): string {
  if (!validTimeZone(input.timeZone)) throw new NightError(400, 'bad_zone', 'That time zone is not recognised.');
  const slots = [...new Set(input.slots)].map((s) => new Date(s));
  if (slots.length < 1 || slots.length > 3 || slots.some((d) => Number.isNaN(d.getTime()))) {
    throw new NightError(400, 'bad_slots', 'Offer one to three dates and times.');
  }
  if (slots.some((d) => d.getTime() < now.getTime() - 3600_000)) throw new NightError(400, 'past_slot', 'Pick times in the future.');
  const id = randomUUID();
  transaction(db, () => {
    db.prepare(
      `INSERT INTO nights (id, host_id, title, location, time_zone, invite_token, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'polling', ?, ?)`,
    ).run(id, hostId, input.title, input.location, input.timeZone, randomBytes(9).toString('base64url'), now.toISOString(), now.toISOString());
    for (const d of slots.sort((a, b) => a.getTime() - b.getTime())) {
      db.prepare('INSERT INTO night_slots (id, night_id, starts_at) VALUES (?, ?, ?)').run(randomUUID(), id, d.toISOString());
    }
    db.prepare(`INSERT INTO night_members (night_id, principal_id, rsvp, votes, joined_at) VALUES (?, ?, 'yes', '[]', ?)`).run(id, hostId, now.toISOString());
  });
  conversationFor(db, 'night', id, now);
  return id;
}

function nightRow(db: Db, id: string): NightRow {
  const row = db.prepare('SELECT * FROM nights WHERE id = ?').get(id) as NightRow | undefined;
  if (!row) throw new NightError(404, 'night_not_found', 'That game night does not exist.');
  return row;
}

function isMember(db: Db, nightId: string, principalId: string): boolean {
  return Boolean(db.prepare('SELECT 1 FROM night_members WHERE night_id = ? AND principal_id = ?').get(nightId, principalId));
}

export function memberIds(db: Db, nightId: string): string[] {
  return (db.prepare('SELECT principal_id FROM night_members WHERE night_id = ?').all(nightId) as { principal_id: string }[]).map((r) => r.principal_id);
}

export function nightDetail(db: Db, hub: Hub, nightId: string, principalId: string, now: Date) {
  const row = nightRow(db, nightId);
  if (!isMember(db, nightId, principalId)) throw new NightError(403, 'not_invited', 'Open the invite link to join this game night.');
  const slots = db.prepare('SELECT id, starts_at FROM night_slots WHERE night_id = ? ORDER BY starts_at').all(nightId) as { id: string; starts_at: string }[];
  const members = db.prepare('SELECT principal_id, rsvp, votes FROM night_members WHERE night_id = ? ORDER BY joined_at').all(nightId) as {
    principal_id: string;
    rsvp: Rsvp;
    votes: string;
  }[];
  const parsed = members.map((m) => ({ ...ensureProfile(db, m.principal_id, now), rsvp: m.rsvp, votes: JSON.parse(m.votes) as string[], online: hub.isOnline(m.principal_id) }));
  const tally = slots.map((s) => ({ id: s.id, startsAt: s.starts_at, votes: parsed.filter((m) => m.votes.includes(s.id)).length }));
  const top = Math.max(0, ...tally.map((t) => t.votes));
  const going = parsed.filter((m) => m.rsvp === 'yes').length;
  return {
    id: row.id,
    title: row.title,
    location: row.location,
    timeZone: row.time_zone,
    status: row.status,
    hostId: row.host_id,
    isHost: row.host_id === principalId,
    invitePath: `/n/${row.invite_token}`,
    confirmedSlot: row.confirmed_slot,
    slots: tally.map((t) => ({ ...t, leading: top > 0 && t.votes === top })),
    tied: top > 0 && tally.filter((t) => t.votes === top).length > 1,
    members: parsed,
    seats: row.seats ? (JSON.parse(row.seats) as string[]) : null,
    going,
    /** Plain-language suggestion when the table is short, never a rules authority. */
    variant: going === 3 ? 'three' : going === 2 ? 'two' : going >= 4 ? 'full' : 'short',
    conversationId: conversationFor(db, 'night', row.id, now).id,
  };
}

export function listNights(db: Db, principalId: string) {
  const rows = db
    .prepare(
      `SELECT n.* FROM nights n JOIN night_members m ON m.night_id = n.id WHERE m.principal_id = ? AND n.status != 'cancelled' ORDER BY n.created_at DESC LIMIT 50`,
    )
    .all(principalId) as unknown as NightRow[];
  return rows.map((r) => {
    const slots = db.prepare('SELECT id, starts_at FROM night_slots WHERE night_id = ? ORDER BY starts_at').all(r.id) as { id: string; starts_at: string }[];
    const going = db.prepare(`SELECT COUNT(*) AS n FROM night_members WHERE night_id = ? AND rsvp = 'yes'`).get(r.id) as { n: number };
    const me = db.prepare('SELECT rsvp FROM night_members WHERE night_id = ? AND principal_id = ?').get(r.id, principalId) as { rsvp: Rsvp };
    return {
      id: r.id,
      title: r.title,
      status: r.status,
      timeZone: r.time_zone,
      isHost: r.host_id === principalId,
      when: r.confirmed_slot ? slots.find((s) => s.id === r.confirmed_slot)?.starts_at ?? null : null,
      options: slots.map((s) => s.starts_at),
      going: Number(going.n),
      myRsvp: me.rsvp,
    };
  });
}

export function invitePreview(db: Db, token: string, now: Date) {
  const row = db.prepare('SELECT * FROM nights WHERE invite_token = ?').get(token) as NightRow | undefined;
  if (!row || row.status === 'cancelled') throw new NightError(404, 'invite_not_found', 'This invite is no longer active.');
  const slots = db.prepare('SELECT id, starts_at FROM night_slots WHERE night_id = ? ORDER BY starts_at').all(row.id) as { id: string; starts_at: string }[];
  return {
    nightId: row.id,
    title: row.title,
    location: row.location,
    timeZone: row.time_zone,
    status: row.status,
    host: ensureProfile(db, row.host_id, now),
    slots: slots.map((s) => ({ id: s.id, startsAt: s.starts_at })),
  };
}

export function joinNight(db: Db, hub: Hub, token: string, principalId: string, now: Date): string {
  const row = db.prepare('SELECT * FROM nights WHERE invite_token = ?').get(token) as NightRow | undefined;
  if (!row || row.status === 'cancelled') throw new NightError(404, 'invite_not_found', 'This invite is no longer active.');
  db.prepare(`INSERT OR IGNORE INTO night_members (night_id, principal_id, rsvp, votes, joined_at) VALUES (?, ?, 'pending', '[]', ?)`).run(row.id, principalId, now.toISOString());
  notify(db, hub, row.id);
  return row.id;
}

export function respond(db: Db, hub: Hub, nightId: string, principalId: string, input: { rsvp?: Rsvp; votes?: string[] }, now: Date): void {
  const row = nightRow(db, nightId);
  if (!isMember(db, nightId, principalId)) throw new NightError(403, 'not_invited', 'Open the invite link to join this game night.');
  if (row.status === 'cancelled') throw new NightError(409, 'cancelled', 'This game night was cancelled.');
  if (input.votes) {
    const valid = new Set((db.prepare('SELECT id FROM night_slots WHERE night_id = ?').all(nightId) as { id: string }[]).map((s) => s.id));
    if (input.votes.some((v) => !valid.has(v))) throw new NightError(400, 'bad_vote', 'Vote for one of the offered times.');
    if (row.status === 'confirmed') throw new NightError(409, 'confirmed', 'The time is already confirmed.');
    db.prepare('UPDATE night_members SET votes = ? WHERE night_id = ? AND principal_id = ?').run(JSON.stringify([...new Set(input.votes)]), nightId, principalId);
  }
  if (input.rsvp) db.prepare('UPDATE night_members SET rsvp = ? WHERE night_id = ? AND principal_id = ?').run(input.rsvp, nightId, principalId);
  db.prepare('UPDATE nights SET updated_at = ? WHERE id = ?').run(now.toISOString(), nightId);
  notify(db, hub, nightId);
}

/** The host picks the time explicitly (never automatic), and seats are drawn for who is going. */
export function confirmNight(db: Db, hub: Hub, nightId: string, principalId: string, slotId: string, now: Date, random: () => number = Math.random): void {
  const row = nightRow(db, nightId);
  if (row.host_id !== principalId) throw new NightError(403, 'not_host', 'Only the host can confirm the time.');
  if (row.status === 'cancelled') throw new NightError(409, 'cancelled', 'This game night was cancelled.');
  const slot = db.prepare('SELECT id FROM night_slots WHERE id = ? AND night_id = ?').get(slotId, nightId);
  if (!slot) throw new NightError(400, 'bad_slot', 'Pick one of the offered times.');
  const going = (db.prepare(`SELECT principal_id FROM night_members WHERE night_id = ? AND rsvp = 'yes' ORDER BY joined_at`).all(nightId) as { principal_id: string }[]).map(
    (r) => r.principal_id,
  );
  for (let i = going.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [going[i], going[j]] = [going[j]!, going[i]!];
  }
  db.prepare(`UPDATE nights SET status = 'confirmed', confirmed_slot = ?, seats = ?, updated_at = ? WHERE id = ?`).run(slotId, JSON.stringify(going), now.toISOString(), nightId);
  notify(db, hub, nightId);
}

export function cancelNight(db: Db, hub: Hub, nightId: string, principalId: string, now: Date): void {
  const row = nightRow(db, nightId);
  if (row.host_id !== principalId) throw new NightError(403, 'not_host', 'Only the host can cancel.');
  db.prepare(`UPDATE nights SET status = 'cancelled', updated_at = ? WHERE id = ?`).run(now.toISOString(), nightId);
  notify(db, hub, nightId);
}

/** iCalendar file for a confirmed night (a three-hour block). */
export function nightCalendar(db: Db, nightId: string, principalId: string, publicBaseUrl: string | null): string {
  const row = nightRow(db, nightId);
  if (!isMember(db, nightId, principalId)) throw new NightError(403, 'not_invited', 'Open the invite link to join this game night.');
  if (row.status !== 'confirmed' || !row.confirmed_slot) throw new NightError(409, 'not_confirmed', 'The host has not confirmed a time yet.');
  const slot = db.prepare('SELECT starts_at FROM night_slots WHERE id = ?').get(row.confirmed_slot) as { starts_at: string };
  const start = new Date(slot.starts_at);
  const end = new Date(start.getTime() + 3 * 3600_000);
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const escape = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Daily Rack//Game Night//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${row.id}@dailyrack`,
    `DTSTAMP:${stamp(new Date(row.updated_at))}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(row.title)}`,
    ...(row.location ? [`LOCATION:${escape(row.location)}`] : []),
    `DESCRIPTION:${escape(`Mahjong night planned in Daily Rack.${publicBaseUrl ? ` ${publicBaseUrl}/n/${row.invite_token}` : ''}`)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ];
  return lines.join('\r\n') + '\r\n';
}

function notify(db: Db, hub: Hub, nightId: string) {
  hub.sendMany(memberIds(db, nightId), { type: 'night', nightId });
}
