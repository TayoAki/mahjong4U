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
