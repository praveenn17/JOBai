#!/usr/bin/env node
/**
 * JobAI — Migration helper
 *
 * Prints the current migration status (which have been applied, which are pending).
 * Useful during deployments to verify the DB is in the expected state.
 *
 * Usage:
 *   node src/database/migrate.js          # show status
 *   node src/database/migrate.js --run    # apply pending migrations (same as setup)
 */
'use strict';

require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const { setupDatabase, healthCheck } = require('./db');

const arg = process.argv[2];

(async () => {
  if (arg === '--run') {
    setupDatabase();
    console.log('All migrations applied.');
    process.exit(0);
  }

  // Status check — open DB read-only so we never accidentally create it
  const dbPath = process.env.DB_PATH || path.join(__dirname, '../../jobai.db');

  const db = new Database(dbPath, { readonly: true });

  let migrations = [];
  try {
    migrations = db.prepare('SELECT id, applied_at FROM schema_migrations ORDER BY applied_at').all();
  } catch {
    console.log('schema_migrations table does not exist yet — run setup.js first.');
    process.exit(1);
  }

  console.log('\n── Applied migrations ───────────────────────────');
  if (migrations.length === 0) {
    console.log('  (none)');
  } else {
    migrations.forEach(m => console.log(`  ✅ ${m.id}  (${m.applied_at})`));
  }

  const h = healthCheck();
  console.log(`\n── DB state ─────────────────────────────────────`);
  console.log(`  Tables : ${h.tableCount}  |  Size: ${h.sizeMB} MB  |  WAL: ${h.walMode}`);
  console.log('─────────────────────────────────────────────────\n');

  db.close();
  process.exit(0);
})();
