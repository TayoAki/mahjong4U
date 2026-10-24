import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const MIGRATIONS: string[] = [
  `
  CREATE TABLE principals (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('guest', 'account', 'test')),
    token_hash TEXT UNIQUE,
    created_at TEXT NOT NULL
  );

  CREATE TABLE puzzle_revisions (
    revision_id TEXT PRIMARY KEY,
    puzzle_id TEXT NOT NULL,
    revision INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    body TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'withdrawn')),
    created_at TEXT NOT NULL,
    UNIQUE (puzzle_id, revision)
  );

  -- One counted first answer per principal and puzzle, across revisions.
  CREATE TABLE attempts (
    id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    puzzle_id TEXT NOT NULL,
    revision_id TEXT NOT NULL REFERENCES puzzle_revisions(revision_id),
    section_id TEXT NOT NULL,
    tile_ids TEXT NOT NULL,
    played_day TEXT NOT NULL,
    publication_day TEXT,
    counts_for_split INTEGER NOT NULL,
    synthetic INTEGER NOT NULL DEFAULT 0,
    via_link_id TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (principal_id, puzzle_id)
  );
  CREATE INDEX attempts_by_principal ON attempts (principal_id, played_day);

  CREATE TABLE idempotency (
    principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    operation TEXT NOT NULL,
    key TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (principal_id, operation, key)
  );

  CREATE TABLE split_totals (
    revision_id TEXT PRIMARY KEY,
    eligible INTEGER NOT NULL DEFAULT 0,
    synthetic INTEGER NOT NULL DEFAULT 0,
    version INTEGER NOT NULL DEFAULT 0,
    computed_at TEXT NOT NULL
  );
  CREATE TABLE split_tile_counts (
    revision_id TEXT NOT NULL,
    tile_id TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (revision_id, tile_id)
  );
  CREATE TABLE split_face_counts (
    revision_id TEXT NOT NULL,
    face_key TEXT NOT NULL,
    count INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (revision_id, face_key)
  );

  CREATE TABLE share_links (
    id TEXT PRIMARY KEY,
    token TEXT UNIQUE NOT NULL,
    owner_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    attempt_id TEXT NOT NULL REFERENCES attempts(id) ON DELETE CASCADE,
    revision_id TEXT NOT NULL,
    publish_pass INTEGER NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
  );

  CREATE TABLE events (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    principal_id TEXT,
    props TEXT NOT NULL,
    occurred_at TEXT NOT NULL,
    received_at TEXT NOT NULL
  );
  `,
  `
  -- Social: a display name and a shareable friend code per player.
  CREATE TABLE profiles (
    principal_id TEXT PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    friend_code TEXT UNIQUE NOT NULL,
    color TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- requester -> addressee; accepted rows are friendships in both directions.
  CREATE TABLE friendships (
    requester TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    addressee TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    status TEXT NOT NULL CHECK (status IN ('pending', 'accepted')),
    created_at TEXT NOT NULL,
    responded_at TEXT,
    PRIMARY KEY (requester, addressee)
  );

  CREATE TABLE conversations (
    id TEXT PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('direct', 'table', 'night')),
    ref TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (kind, ref)
  );
  CREATE TABLE messages (
    id TEXT PRIMARY KEY,
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id TEXT REFERENCES principals(id) ON DELETE SET NULL,
    body TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX messages_by_conversation ON messages (conversation_id, created_at);
  CREATE TABLE conversation_reads (
    conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    last_read_at TEXT NOT NULL,
    PRIMARY KEY (conversation_id, principal_id)
  );

  -- Online tables. Seats are fixed positions 0-3; the dealer rotates each hand.
  CREATE TABLE tables (
    id TEXT PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    host_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    mode TEXT NOT NULL CHECK (mode IN ('live', 'turn')),
    status TEXT NOT NULL CHECK (status IN ('lobby', 'playing', 'between', 'closed')),
    seats TEXT NOT NULL,
    settings TEXT NOT NULL,
    scores TEXT NOT NULL,
    hand_number INTEGER NOT NULL DEFAULT 0,
    night_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE games (
    id TEXT PRIMARY KEY,
    table_id TEXT NOT NULL REFERENCES tables(id) ON DELETE CASCADE,
    hand_number INTEGER NOT NULL,
    dealer INTEGER NOT NULL,
    state TEXT NOT NULL,
    version INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('playing', 'ended')),
    deadline TEXT,
    log TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE (table_id, hand_number)
  );

  -- Game Night: plan an in-person game.
  CREATE TABLE nights (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    location TEXT,
    time_zone TEXT NOT NULL,
    invite_token TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('polling', 'confirmed', 'cancelled')),
    confirmed_slot TEXT,
    seats TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE night_slots (
    id TEXT PRIMARY KEY,
    night_id TEXT NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
    starts_at TEXT NOT NULL
  );
  CREATE TABLE night_members (
    night_id TEXT NOT NULL REFERENCES nights(id) ON DELETE CASCADE,
    principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    rsvp TEXT NOT NULL CHECK (rsvp IN ('pending', 'yes', 'maybe', 'no')),
    votes TEXT NOT NULL DEFAULT '[]',
    joined_at TEXT NOT NULL,
    PRIMARY KEY (night_id, principal_id)
  );
  `,
];

export type Db = DatabaseSync;

export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;');
  migrate(db);
  return db;
}

function migrate(db: Db): void {
  db.exec('CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL)');
  const row = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  let version = row?.version ?? 0;
  if (!row) db.prepare('INSERT INTO schema_version (version) VALUES (0)').run();
  while (version < MIGRATIONS.length) {
    transaction(db, () => {
      db.exec(MIGRATIONS[version]!);
      db.prepare('UPDATE schema_version SET version = ?').run(version + 1);
    });
    version += 1;
  }
}

/** Runs fn inside BEGIN IMMEDIATE ... COMMIT, rolling back on any error. */
export function transaction<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
