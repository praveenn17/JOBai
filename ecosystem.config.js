/**
 * JobAI — PM2 Ecosystem (bare-metal / VPS deployment)
 *
 * Usage:
 *   pm2 start ecosystem.config.js --env production
 *   pm2 save && pm2 startup
 */
module.exports = {
  apps: [
    {
      name: 'jobai-backend',

      // Run migrations first, then start the server — a single Node process
      // handles both so PM2 only sees one app to monitor.
      script: 'sh',
      args: '-c "node src/database/setup.js && node src/server.js"',
      interpreter: '/bin/sh',
      interpreter_args: '',

      cwd: '/var/www/jobai/backend',

      // SQLite is a single-writer database — keep instances at 1.
      // If you ever switch to Postgres, raise this to 'max'.
      instances: 1,
      exec_mode: 'fork',

      watch: false,
      max_memory_restart: '512M',

      // PM2 will pass these into the process environment.
      // Set real secrets via:  pm2 set jobai-backend:JWT_SECRET <value>
      // or via the .env file loaded by dotenv in db.js / server.js.
      env: {
        NODE_ENV: 'development',
        PORT: 5000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 5000,
        // DB_PATH, JWT_SECRET, ANTHROPIC_API_KEY etc. come from .env
      },

      // Logs
      error_file: '/var/log/jobai/pm2-error.log',
      out_file:   '/var/log/jobai/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',

      // Restart policy
      restart_delay: 5000,
      max_restarts: 10,
      autorestart: true,

      // Send SIGTERM, wait 10 s for graceful shutdown, then SIGKILL
      kill_timeout: 10000,
      listen_timeout: 15000,

      // Export metrics to PM2 Plus / Keymetrics (optional)
      pmx: true,
    },
  ],
};
