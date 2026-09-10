/**
 * JobAI — Production Database Module
 *
 * SQLite via better-sqlite3.  All pragmas, migrations, WAL checkpoint,
 * graceful shutdown, automated backup, and a DB-level health check are
 * handled here so nothing else in the codebase has to think about them.
 */

'use strict';

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');
require('dotenv').config();

// ─── Path resolution ──────────────────────────────────────────────────────────

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../jobai.db');

// Ensure the parent directory exists BEFORE SQLite tries to create the file.
// Critical in Docker where /app/data is a named volume that may not yet exist.
const dbDir = path.dirname(DB_PATH);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// ─── Singleton connection ─────────────────────────────────────────────────────

/** @type {import('better-sqlite3').Database | null} */
let db = null;

/**
 * Return (or lazily create) the single shared DB connection.
 * All production-grade PRAGMAs are applied on first open.
 */
function getDb() {
  if (db) return db;

  db = new Database(DB_PATH);

  // ── Performance & durability pragmas ─────────────────────────────────────

  // WAL: readers never block writers; writers never block readers.
  db.pragma('journal_mode = WAL');

  // NORMAL is safe in WAL mode — syncs at each WAL checkpoint, not each commit.
  db.pragma('synchronous = NORMAL');

  // Enforce FK constraints — SQLite disables this by default.
  db.pragma('foreign_keys = ON');

  // Wait up to 5 s before throwing SQLITE_BUSY.
  // Prevents "database is locked" crashes under concurrent API requests.
  db.pragma('busy_timeout = 5000');

  // 64 MB page cache (negative value = kibibytes).
  db.pragma('cache_size = -65536');

  // Keep temp tables and indices in RAM instead of a disk file.
  db.pragma('temp_store = MEMORY');

  // Memory-mapped I/O — 256 MB. Speeds up large sequential reads.
  db.pragma('mmap_size = 268435456');

  // Auto-checkpoint every 1 000 pages (~4 MB). Prevents WAL from growing
  // unbounded in production under sustained write load.
  db.pragma('wal_autocheckpoint = 1000');

  console.log(`[DB] Opened: ${DB_PATH}`);
  return db;
}

// ─── Schema ───────────────────────────────────────────────────────────────────

function setupDatabase() {
  const database = getDb();

  database.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id             TEXT PRIMARY KEY,
      name           TEXT NOT NULL,
      email          TEXT UNIQUE NOT NULL,
      password_hash  TEXT NOT NULL,
      phone          TEXT,
      location       TEXT,
      email_verified INTEGER DEFAULT 0,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS resumes (
      id            TEXT PRIMARY KEY,
      user_id       TEXT NOT NULL,
      filename      TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_path     TEXT NOT NULL,
      file_type     TEXT NOT NULL,
      parsed_text   TEXT,
      is_active     INTEGER DEFAULT 1,
      created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS jobs (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL,
      title                TEXT NOT NULL,
      company              TEXT,
      location             TEXT,
      description          TEXT,
      apply_url            TEXT,
      source               TEXT DEFAULT 'manual',
      match_score          INTEGER DEFAULT 0,
      skills_matched       TEXT,
      missing_requirements TEXT,
      should_apply         INTEGER DEFAULT 0,
      match_reason         TEXT,
      status               TEXT DEFAULT 'pending',
      discovered_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, apply_url),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS applications (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL,
      job_id               TEXT NOT NULL,
      resume_id            TEXT,
      tailored_resume_path TEXT,
      status               TEXT DEFAULT 'pending',
      match_score          INTEGER,
      applied_at           DATETIME,
      error_message        TEXT,
      actions_log          TEXT,
      answers_generated    TEXT,
      created_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at           DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)   REFERENCES users(id)    ON DELETE CASCADE,
      FOREIGN KEY (job_id)    REFERENCES jobs(id)     ON DELETE CASCADE,
      FOREIGN KEY (resume_id) REFERENCES resumes(id)
    );

    CREATE TABLE IF NOT EXISTS email_applications (
      id               TEXT PRIMARY KEY,
      user_id          TEXT NOT NULL,
      company_name     TEXT NOT NULL,
      role             TEXT NOT NULL,
      recipient_email  TEXT NOT NULL,
      subject          TEXT,
      body             TEXT,
      cover_letter     TEXT,
      resume_path      TEXT,
      status           TEXT DEFAULT 'draft',
      sent_at          DATETIME,
      created_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS user_preferences (
      id                      TEXT PRIMARY KEY,
      user_id                 TEXT UNIQUE NOT NULL,
      preferred_roles         TEXT,
      preferred_locations     TEXT,
      min_salary              INTEGER DEFAULT 0,
      max_salary              INTEGER,
      job_types               TEXT,
      skills                  TEXT,
      daily_discovery_enabled INTEGER DEFAULT 0,
      discovery_time          TEXT DEFAULT '16:00',
      created_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS logs (
      id         TEXT PRIMARY KEY,
      user_id    TEXT,
      type       TEXT NOT NULL,
      action     TEXT NOT NULL,
      details    TEXT,
      status     TEXT DEFAULT 'info',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS discovered_jobs (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      title          TEXT NOT NULL,
      company        TEXT,
      location       TEXT,
      description    TEXT,
      apply_url      TEXT,
      match_estimate INTEGER DEFAULT 0,
      reason         TEXT,
      source         TEXT DEFAULT 'ai_discovery',
      status         TEXT DEFAULT 'pending',
      discovered_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      actioned_at    DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS application_feedback (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      application_id TEXT NOT NULL,
      job_title      TEXT,
      company        TEXT,
      role           TEXT,
      match_score    INTEGER,
      outcome        TEXT NOT NULL CHECK(outcome IN ('interview','rejected','no_response')),
      feedback_notes TEXT,
      resume_version TEXT,
      answers_used   TEXT,
      submitted_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id)        REFERENCES users(id)        ON DELETE CASCADE,
      FOREIGN KEY (application_id) REFERENCES applications(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS learning_insights (
      id                           TEXT PRIMARY KEY,
      user_id                      TEXT UNIQUE NOT NULL,
      success_rate                 INTEGER DEFAULT 0,
      top_performing_roles         TEXT,
      weak_areas                   TEXT,
      resume_improvements          TEXT,
      answer_strategy_improvements TEXT,
      recommended_min_score        INTEGER DEFAULT 80,
      success_probability_factors  TEXT,
      summary                      TEXT,
      last_analyzed                DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rate_limits (
      id           TEXT PRIMARY KEY,
      user_id      TEXT NOT NULL,
      action_type  TEXT NOT NULL,
      performed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS application_queue (
      id             TEXT PRIMARY KEY,
      user_id        TEXT NOT NULL,
      job_id         TEXT NOT NULL,
      user_confirmed INTEGER DEFAULT 0,
      queued_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
      status         TEXT DEFAULT 'queued',
      process_after  DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (job_id)  REFERENCES jobs(id)  ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_queue (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      email_app_id    TEXT,
      company_name    TEXT NOT NULL,
      role            TEXT NOT NULL,
      recipient_email TEXT NOT NULL,
      company_info    TEXT,
      personality     TEXT DEFAULT 'formal_confident',
      queued_at       DATETIME DEFAULT CURRENT_TIMESTAMP,
      status          TEXT DEFAULT 'queued',
      process_after   DATETIME,
      error_message   TEXT,
      template_index  INTEGER DEFAULT 0,
      resume_variant  INTEGER DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_performance (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT NOT NULL,
      email_app_id         TEXT,
      company_name         TEXT,
      role                 TEXT,
      recipient_email      TEXT,
      subject              TEXT,
      email_body           TEXT,
      cover_letter         TEXT,
      template_id          INTEGER DEFAULT 0,
      resume_variant       INTEGER DEFAULT 0,
      cover_letter_variant INTEGER DEFAULT 0,
      personality          TEXT DEFAULT 'formal_confident',
      personalization_type TEXT,
      email_length         INTEGER DEFAULT 0,
      outcome              TEXT,
      outcome_set_at       DATETIME,
      sent_at              DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS template_scores (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      template_id       INTEGER NOT NULL,
      sent_count        INTEGER DEFAULT 0,
      accepted_count    INTEGER DEFAULT 0,
      rejected_count    INTEGER DEFAULT 0,
      ignored_count     INTEGER DEFAULT 0,
      performance_score REAL DEFAULT 50.0,
      weight            REAL DEFAULT 1.0,
      last_updated      DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, template_id),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subject_performance (
      id                TEXT PRIMARY KEY,
      user_id           TEXT NOT NULL,
      subject           TEXT NOT NULL,
      pattern           TEXT,
      sent_count        INTEGER DEFAULT 1,
      response_count    INTEGER DEFAULT 0,
      performance_score REAL DEFAULT 50.0,
      last_updated      DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_strategy (
      id                   TEXT PRIMARY KEY,
      user_id              TEXT UNIQUE NOT NULL,
      best_tone            TEXT DEFAULT 'formal_confident',
      best_personalization TEXT DEFAULT 'company_mention',
      best_length_range    TEXT DEFAULT '150-200',
      best_opening_style   TEXT,
      best_closing_style   TEXT,
      avoid_patterns       TEXT,
      promote_patterns     TEXT,
      template_weights     TEXT,
      response_rate        REAL DEFAULT 0,
      acceptance_rate      REAL DEFAULT 0,
      ignore_rate          REAL DEFAULT 0,
      emails_analyzed      INTEGER DEFAULT 0,
      last_analyzed        DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_send_log (
      id              TEXT PRIMARY KEY,
      user_id         TEXT NOT NULL,
      email_app_id    TEXT,
      template_index  INTEGER DEFAULT 0,
      resume_variant  INTEGER DEFAULT 0,
      subject         TEXT,
      sent_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id         TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      type       TEXT NOT NULL,
      title      TEXT NOT NULL,
      message    TEXT NOT NULL,
      read       INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS email_verification_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used       INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS rejected_jobs (
      id          TEXT PRIMARY KEY,
      user_id     TEXT NOT NULL,
      apply_url   TEXT NOT NULL,
      job_title   TEXT,
      rejected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, apply_url),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      token      TEXT PRIMARY KEY,
      user_id    TEXT NOT NULL,
      expires_at DATETIME NOT NULL,
      used       INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  // ── Indexes ──────────────────────────────────────────────────────────────
  database.exec(`
    CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
    CREATE INDEX IF NOT EXISTS idx_resumes_user         ON resumes(user_id, is_active);
    CREATE INDEX IF NOT EXISTS idx_jobs_user            ON jobs(user_id, status, match_score);
    CREATE INDEX IF NOT EXISTS idx_jobs_url             ON jobs(user_id, apply_url);
    CREATE INDEX IF NOT EXISTS idx_applications_user    ON applications(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_applications_job     ON applications(job_id, user_id);
    CREATE INDEX IF NOT EXISTS idx_applications_updated ON applications(updated_at);
    CREATE INDEX IF NOT EXISTS idx_email_apps_user      ON email_applications(user_id, status);
    CREATE INDEX IF NOT EXISTS idx_email_perf_user      ON email_performance(user_id, outcome, sent_at);
    CREATE INDEX IF NOT EXISTS idx_feedback_user        ON application_feedback(user_id, submitted_at);
    CREATE INDEX IF NOT EXISTS idx_rate_limits_user     ON rate_limits(user_id, action_type, performed_at);
    CREATE INDEX IF NOT EXISTS idx_rate_limits_time     ON rate_limits(performed_at);
    CREATE INDEX IF NOT EXISTS idx_logs_user            ON logs(user_id, created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_created         ON logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_app_queue_user       ON application_queue(user_id, status, process_after);
    CREATE INDEX IF NOT EXISTS idx_email_queue_user     ON email_queue(user_id, status, process_after);
    CREATE INDEX IF NOT EXISTS idx_disc_jobs_user       ON discovered_jobs(user_id, status, discovered_at);
    CREATE INDEX IF NOT EXISTS idx_template_scores      ON template_scores(user_id, template_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user   ON notifications(user_id, read, created_at);
    CREATE INDEX IF NOT EXISTS idx_ev_tokens_user       ON email_verification_tokens(user_id, used);
    CREATE INDEX IF NOT EXISTS idx_pr_tokens_user       ON password_reset_tokens(user_id, used);
    CREATE INDEX IF NOT EXISTS idx_rejected_jobs_user   ON rejected_jobs(user_id, apply_url);
  `);

  console.log('✅ Database schema initialised');

  runMigrations(database);

  return database;
}

// ─── Migration runner ─────────────────────────────────────────────────────────

const MIGRATIONS = [
  {
    id: '001_users_email_verified',
    up(d) {
      const cols = d.prepare('PRAGMA table_info(users)').all();
      if (!cols.find(c => c.name === 'email_verified')) {
        d.prepare('ALTER TABLE users ADD COLUMN email_verified INTEGER DEFAULT 0').run();
      }
    },
  },
  {
    id: '002_applications_answers_generated',
    up(d) {
      const cols = d.prepare('PRAGMA table_info(applications)').all();
      if (!cols.find(c => c.name === 'answers_generated')) {
        d.prepare('ALTER TABLE applications ADD COLUMN answers_generated TEXT').run();
      }
    },
  },
  {
    id: '003_password_reset_tokens',
    up(d) {
      d.exec(`
        CREATE TABLE IF NOT EXISTS password_reset_tokens (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          expires_at DATETIME NOT NULL,
          used INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_pr_tokens_user ON password_reset_tokens(user_id, used);
      `);
    },
  },
  {
    id: '004_rate_limits_time_index',
    up(d) {
      d.exec(`CREATE INDEX IF NOT EXISTS idx_rate_limits_time ON rate_limits(performed_at);`);
    },
  },
];

function runMigrations(database) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);

  const applied = new Set(
    database.prepare('SELECT id FROM schema_migrations').all().map(r => r.id)
  );

  const insert = database.prepare('INSERT OR IGNORE INTO schema_migrations (id) VALUES (?)');

  for (const m of MIGRATIONS) {
    if (applied.has(m.id)) continue;
    try {
      m.up(database);
      insert.run(m.id);
      console.log(`  ✅ Migration: ${m.id}`);
    } catch (err) {
      console.error(`  ⚠️  Migration ${m.id} failed: ${err.message}`);
    }
  }
}

// ─── Health check ─────────────────────────────────────────────────────────────

/**
 * Lightweight DB health check — tests read, write lock, and integrity.
 * Returns { ok, tableCount, sizeMB, walMode, message }.
 */
function healthCheck() {
  try {
    const database = getDb();

    const tables = database
      .prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")
      .all()
      .map(r => r.name);

    const { page_count } = database.prepare('PRAGMA page_count').get();
    const { page_size }  = database.prepare('PRAGMA page_size').get();
    const { journal_mode } = database.prepare('PRAGMA journal_mode').get();
    const row = database.prepare('PRAGMA quick_check(1)').get();
    const integrityOk = row && Object.values(row)[0] === 'ok';

    // Verify we can acquire a write lock (rolled back immediately)
    database.prepare('BEGIN IMMEDIATE').run();
    database.prepare('ROLLBACK').run();

    return {
      ok: integrityOk,
      tableCount: tables.length,
      sizeMB: ((page_count * page_size) / 1024 / 1024).toFixed(2),
      walMode: journal_mode === 'wal',
      dbPath: DB_PATH,
      message: integrityOk ? 'Database is healthy' : 'Integrity check failed',
    };
  } catch (err) {
    return { ok: false, message: `DB health check failed: ${err.message}` };
  }
}

// ─── Backup ───────────────────────────────────────────────────────────────────

/**
 * Hot backup using SQLite's online backup API.
 * Non-blocking — reads continue during backup.
 *
 * @param {string} [backupDir]
 * @returns {Promise<string>} Absolute path of the backup file.
 */
async function backupDatabase(backupDir) {
  const database = getDb();
  const dir = backupDir || path.join(path.dirname(DB_PATH), 'backups');

  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ts   = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(dir, `jobai-${ts}.db`);

  await database.backup(dest);

  // Prune backups older than 7 days
  const WEEK = 7 * 24 * 60 * 60 * 1000;
  fs.readdirSync(dir)
    .filter(f => f.startsWith('jobai-') && f.endsWith('.db'))
    .forEach(f => {
      const full = path.join(dir, f);
      if (Date.now() - fs.statSync(full).mtimeMs > WEEK) {
        fs.unlinkSync(full);
        console.log(`[DB] Pruned old backup: ${f}`);
      }
    });

  console.log(`[DB] Backup written: ${dest}`);
  return dest;
}

// ─── WAL checkpoint ───────────────────────────────────────────────────────────

function checkpointWal() {
  try {
    const result = getDb().pragma('wal_checkpoint(TRUNCATE)');
    console.log('[DB] WAL checkpoint result:', result);
    return result;
  } catch (err) {
    console.error('[DB] WAL checkpoint failed:', err.message);
  }
}

// ─── Maintenance ─────────────────────────────────────────────────────────────

/**
 * Prune stale rows that accumulate in production.
 * Safe to call from a weekly cron.
 */
function runMaintenance() {
  const database = getDb();
  const tx = database.transaction(() => {
    database.prepare(`DELETE FROM email_verification_tokens
      WHERE used = 1 OR expires_at < datetime('now', '-7 days')`).run();

    database.prepare(`DELETE FROM password_reset_tokens
      WHERE used = 1 OR expires_at < datetime('now', '-1 day')`).run();

    database.prepare(`DELETE FROM rate_limits
      WHERE performed_at < datetime('now', '-1 day')`).run();

    database.prepare(`DELETE FROM logs
      WHERE created_at < datetime('now', '-90 days')`).run();

    database.prepare(`DELETE FROM notifications
      WHERE read = 1 AND created_at < datetime('now', '-30 days')`).run();
  });

  try {
    tx();
    console.log('[DB] Maintenance complete');
  } catch (err) {
    console.error('[DB] Maintenance failed:', err.message);
  }
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

function closeDatabase() {
  if (db && db.open) {
    try {
      db.pragma('wal_checkpoint(TRUNCATE)');
      db.close();
      db = null;
      console.log('[DB] Connection closed gracefully');
    } catch (err) {
      console.error('[DB] Error closing connection:', err.message);
    }
  }
}

// Register signal handlers here — fire even when db.js is imported by scripts
// other than server.js (e.g. migration runners, backup jobs).
process.once('exit',    closeDatabase);
// SIGTERM / SIGINT are also registered in server.js for the HTTP server shutdown
// sequence; these are harmless duplicates that ensure coverage in all contexts.
process.once('SIGTERM', closeDatabase);
process.once('SIGINT',  closeDatabase);

// ─── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  getDb,
  setupDatabase,
  backupDatabase,
  healthCheck,
  checkpointWal,
  runMaintenance,
  closeDatabase,
};
