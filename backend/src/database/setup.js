#!/usr/bin/env node
/**
 * JobAI — Standalone DB setup / migration runner
 *
 * Usage:
 *   node src/database/setup.js            # initialise schema + run migrations
 *   node src/database/setup.js --check    # health check only (exit 0 = ok)
 *   node src/database/setup.js --backup   # hot backup then exit
 *   node src/database/setup.js --maintain # prune stale rows + WAL checkpoint
 */
'use strict';

require('dotenv').config();
const { setupDatabase, healthCheck, backupDatabase, runMaintenance, checkpointWal } = require('./db');

const arg = process.argv[2];

(async () => {
  if (arg === '--check') {
    const h = healthCheck();
    console.log(JSON.stringify(h, null, 2));
    process.exit(h.ok ? 0 : 1);
  }

  if (arg === '--backup') {
    setupDatabase();  // ensure DB exists
    const dest = await backupDatabase();
    console.log(`Backup: ${dest}`);
    process.exit(0);
  }

  if (arg === '--maintain') {
    setupDatabase();
    runMaintenance();
    checkpointWal();
    process.exit(0);
  }

  // Default: full initialise + migrate
  setupDatabase();
  const h = healthCheck();
  console.log('\n── Health check ─────────────────────────────────');
  console.log(`  Status  : ${h.ok ? '✅ OK' : '❌ DEGRADED'}`);
  console.log(`  Tables  : ${h.tableCount}`);
  console.log(`  Size    : ${h.sizeMB} MB`);
  console.log(`  WAL     : ${h.walMode ? 'enabled' : 'disabled'}`);
  console.log(`  Path    : ${h.dbPath}`);
  console.log('─────────────────────────────────────────────────\n');
  process.exit(h.ok ? 0 : 1);
})();
