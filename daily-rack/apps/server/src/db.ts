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
  `
  -- Safety: community rules, blocking, reports and moderation.
  ALTER TABLE profiles ADD COLUMN rules_accepted_at TEXT;
  ALTER TABLE profiles ADD COLUMN suspended_at TEXT;
  ALTER TABLE messages ADD COLUMN hidden_at TEXT;

  CREATE TABLE blocks (
    blocker_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    blocked_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    created_at TEXT NOT NULL,
    PRIMARY KEY (blocker_id, blocked_id)
  );
  CREATE INDEX blocks_by_blocked ON blocks (blocked_id);

  -- snapshot keeps what was reported (message text, name) even if it later changes.
  CREATE TABLE reports (
    id TEXT PRIMARY KEY,
    reporter_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    target_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    message_id TEXT REFERENCES messages(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    note TEXT,
    snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'dismissed', 'actioned')),
    action TEXT,
    created_at TEXT NOT NULL,
    resolved_at TEXT
  );
  CREATE INDEX reports_by_status ON reports (status, created_at);
  CREATE INDEX reports_by_message ON reports (message_id);
  `,
  `
  -- Messages players send to the team from the app's Contact us form.
  CREATE TABLE feedback (
    id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    message TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
  CREATE INDEX feedback_by_time ON feedback (created_at);
  `,
  `
  -- Public matchmade tables (strangers) and ranked play.
  ALTER TABLE tables ADD COLUMN kind TEXT NOT NULL DEFAULT 'private' CHECK (kind IN ('private', 'public'));
  ALTER TABLE tables ADD COLUMN ranked INTEGER NOT NULL DEFAULT 0;

  -- One row per player per finished hand, for stats and progress. Offline hands played
  -- on the device are synced in with their own ids (game_id) and never count as ranked.
  CREATE TABLE hand_results (
    id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    game_id TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source IN ('table', 'offline')),
    card_id TEXT NOT NULL,
    ranked INTEGER NOT NULL DEFAULT 0,
    won INTEGER NOT NULL,
    self_drawn INTEGER NOT NULL DEFAULT 0,
    jokerless INTEGER NOT NULL DEFAULT 0,
    wall_game INTEGER NOT NULL DEFAULT 0,
    fed INTEGER NOT NULL DEFAULT 0,
    abandoned INTEGER NOT NULL DEFAULT 0,
    hand_id TEXT,
    value INTEGER NOT NULL DEFAULT 0,
    payment INTEGER NOT NULL DEFAULT 0,
    rating_after REAL,
    played_at TEXT NOT NULL,
    UNIQUE (principal_id, game_id)
  );
  CREATE INDEX hand_results_by_player ON hand_results (principal_id, played_at);
  CREATE INDEX hand_results_ranked ON hand_results (ranked, played_at);

  CREATE TABLE ratings (
    principal_id TEXT PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
    rating REAL NOT NULL,
    games INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX ratings_by_rating ON ratings (rating DESC);
  `,
  `
  -- Which card a table plays with (the house card unless the host picks another).
  ALTER TABLE tables ADD COLUMN card_id TEXT NOT NULL DEFAULT 'daily-rack-house-2026';
  `,
  `
  -- "Report a problem" from the app: what went wrong, where, the device and app details the
  -- app attaches (JSON), and an optional screenshot kept right here.
  CREATE TABLE bug_reports (
    id TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
    description TEXT NOT NULL,
    screen TEXT NOT NULL,
    details TEXT NOT NULL,
    screenshot BLOB,
    screenshot_type TEXT,
    created_at TEXT NOT NULL
  );
  CREATE INDEX bug_reports_by_status ON bug_reports (status, created_at);
  `,
  `
  -- Push notifications: each phone's Expo push token, and which kinds each player wants.
  CREATE TABLE push_tokens (
    token TEXT PRIMARY KEY,
    principal_id TEXT NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX push_tokens_by_player ON push_tokens (principal_id);

  CREATE TABLE notification_settings (
    principal_id TEXT PRIMARY KEY REFERENCES principals(id) ON DELETE CASCADE,
    turns INTEGER NOT NULL DEFAULT 1,
    invites INTEGER NOT NULL DEFAULT 1,
    messages INTEGER NOT NULL DEFAULT 1,
    nights INTEGER NOT NULL DEFAULT 1,
    updated_at TEXT NOT NULL
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
