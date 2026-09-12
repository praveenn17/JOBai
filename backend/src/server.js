require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const cron = require('node-cron');
const path = require('path');
const fs = require('fs');
const compression = require('compression');

const { setupDatabase, healthCheck, backupDatabase, checkpointWal, runMaintenance, closeDatabase, getDb } = require('./database/db');
const logger = require('./utils/logger');
const { v4: uuidv4 } = require('uuid');

// Services for queue processor
const {
  checkRateLimit, recordAction, getReadyQueue, updateQueueStatus,
  getNextTemplateIndex, getResumeVariant, logEmailSent, scheduleNextEmailAfterDelay
} = require('./services/rateLimitService');
const { generateVariedEmail, generateResumeVariant, generateCoverLetterVariant } = require('./services/emailVariationService');
const { sendJobApplication } = require('./services/emailService');
const { tailorResume } = require('./services/aiService');
const { generateResumePDF, generateCoverLetterPDF } = require('./services/pdfService');
const { generateDocxFromText } = require('./services/resumeService');

// Routes
const authRoutes = require('./routes/auth');
const resumeRoutes = require('./routes/resume');
const jobsRoutes = require('./routes/jobs');
const applicationsRoutes = require('./routes/applications');
const emailRoutes = require('./routes/email');
const feedbackRoutes      = require('./routes/feedback');
const limitsRoutes        = require('./routes/limits');
const notificationsRoutes = require('./routes/notifications');
const resumeTailorRoutes  = require('./routes/resumeTailor');
const eligibilityRoutes   = require('./routes/eligibility');
const profileRoutes       = require('./routes/profile');
const authMiddleware      = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 5000;

// Ensure required directories exist
['uploads', 'uploads/tailored', 'logs'].forEach(dir => {
  const fullPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// ─── Middleware ───────────────────────────────────────────────────────────────

const isProd = process.env.NODE_ENV === 'production';

app.use(compression());
app.use(helmet({
  crossOriginEmbedderPolicy: false,
  contentSecurityPolicy: isProd ? {
    directives: {
      defaultSrc:     ["'self'"],
      scriptSrc:      ["'self'"],
      styleSrc:       ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc:        ["'self'", 'https://fonts.gstatic.com'],
      imgSrc:         ["'self'", 'data:', 'blob:'],
      connectSrc:     ["'self'"],
      frameSrc:       ["'none'"],
      objectSrc:      ["'none'"],
      baseUri:        ["'self'"],
      formAction:     ["'self'"],
      upgradeInsecureRequests: [],
    },
  } : false,   // Disable CSP in dev — Vite HMR uses websockets + inline scripts
}));

// CORS — supports comma-separated list of origins in FRONTEND_URL
// e.g. FRONTEND_URL=https://app.example.com,http://localhost:5173
const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
  .split(',')
  .map(o => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (Postman, curl, same-origin server calls)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: origin ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],  // needed for file download headers
}));

app.use(morgan('combined', {
  stream: { write: msg => logger.info(msg.trim()) }
}));

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' }
});
app.use('/api/', limiter);

// Auth rate limiter — reads from env (default: 100/min)
const authLimiter = rateLimit({
  windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 60 * 1000,
  max:      parseInt(process.env.AUTH_RATE_LIMIT_MAX)        || 100,
  message: { error: 'Too many login attempts. Please wait before retrying.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI endpoints are more expensive — tighter limit
const aiLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 50,
  message: { error: 'AI request limit reached. Please wait before making more AI requests.' }
});
app.use('/api/jobs/analyze', aiLimiter);
app.use('/api/applications/start', aiLimiter);
app.use('/api/email/generate', aiLimiter);

// ─── Routes ───────────────────────────────────────────────────────────────────

app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/resume', resumeRoutes);
app.use('/api/jobs', jobsRoutes);
app.use('/api/applications', applicationsRoutes);
app.use('/api/email', emailRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/limits', limitsRoutes);
app.use('/api/notifications', notificationsRoutes);
app.use('/api/resume-tailor', resumeTailorRoutes);
app.use('/api/eligibility', eligibilityRoutes);
app.use('/api/profile', profileRoutes);

// Health check
app.get('/api/health', (req, res) => {
  const db = healthCheck();
  const status = db.ok ? 'healthy' : 'degraded';
  res.status(db.ok ? 200 : 503).json({
    status,
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'development',
    ai: !!process.env.GEMINI_API_KEY ? 'configured' : 'not_configured',
    database: db,
  });
});

// Secure authenticated file access for uploads — direct static URL access is completely disabled
app.use('/uploads', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const uploadsRoot = path.resolve(__dirname, '../uploads');
    const requestedPath = path.normalize(req.path).replace(/^(\.\.[\/\\])+/, '');
    const fullPath = path.resolve(uploadsRoot, '.' + requestedPath);

    // Prevent path traversal outside uploads directory
    if (!fullPath.startsWith(uploadsRoot)) {
      return res.status(403).json({ error: 'Access denied: Invalid file path.' });
    }

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ error: 'File not found.' });
    }

    // Verify ownership: requested file must belong to req.user.id
    const filename = path.basename(fullPath);
    const owned = db.prepare(`
      SELECT 1 FROM resumes WHERE user_id = ? AND (file_path = ? OR filename = ? OR file_path LIKE ?)
      UNION
      SELECT 1 FROM applications WHERE user_id = ? AND (tailored_resume_path = ? OR tailored_docx_path = ? OR tailored_resume_path LIKE ? OR tailored_docx_path LIKE ?)
      UNION
      SELECT 1 FROM email_applications WHERE user_id = ? AND (resume_path = ? OR resume_path LIKE ?)
    `).get(
      req.user.id, fullPath, filename, `%${filename}%`,
      req.user.id, fullPath, fullPath, `%${filename}%`, `%${filename}%`,
      req.user.id, fullPath, `%${filename}%`
    );

    if (!owned) {
      logger.warn('Unauthorized file access attempt', { userId: req.user.id, file: filename });
      return res.status(403).json({ error: 'Access denied: You do not have permission to access this file.' });
    }

    if (req.query.download === '1') {
      return res.download(fullPath, filename);
    }
    return res.sendFile(fullPath);
  } catch (err) {
    logger.error('Secure file access error', { error: err.message });
    return res.status(500).json({ error: 'Failed to access file.' });
  }
});

// ─── Scheduled Tasks ─────────────────────────────────────────────────────────

// ─── Queue Processor: runs every 30 min ──────────────────────────────────────
cron.schedule('*/30 * * * *', async () => {
  logger.info('Running queue processor...');
  try {
    const db = getDb();
    const users = db.prepare(
      'SELECT DISTINCT user_id FROM application_queue WHERE status = ? UNION SELECT DISTINCT user_id FROM email_queue WHERE status = ?'
    ).all('queued', 'queued');

    for (const { user_id } of users) {

      // ── Process queued job applications ────────────────────────────────
      const appCheck = checkRateLimit(user_id, 'application');
      if (appCheck.allowed) {
        const readyApps = getReadyQueue(user_id, 'application', appCheck.quota.remaining);
        for (const item of readyApps) {
          updateQueueStatus('application', item.id, 'processing', null, user_id);
          try {
            const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(item.job_id, user_id);
            const resume = db.prepare('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1').get(user_id);
            if (!job || !resume?.parsed_text) throw new Error('Job or resume not found');

            // Tailor resume directly (no HTTP)
            const tailoredText = await tailorResume(resume.parsed_text, job.description, job.title);
            const pdfPath  = await generateResumePDF(tailoredText, `queue_${job.id.slice(0,8)}`).catch(() => null);
            const docxPath = await generateDocxFromText(tailoredText, `queue_${job.id.slice(0,8)}`).catch(() => null);

            const appId = uuidv4();
            db.prepare(`
              INSERT INTO applications (id, user_id, job_id, resume_id, tailored_resume_path, status, match_score, actions_log)
              VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)
            `).run(appId, user_id, item.job_id, resume.id, pdfPath || docxPath,
                   job.match_score, JSON.stringify([{ time: new Date().toISOString(), action: 'queued_resume_tailored', note: 'Processed from queue' }]));

            db.prepare('UPDATE jobs SET status = ? WHERE id = ? AND user_id = ?').run('in_progress', item.job_id, user_id);
            recordAction(user_id, 'application');
            updateQueueStatus('application', item.id, 'done', null, user_id);
            // Notify user
            db.prepare('INSERT INTO notifications (id, user_id, type, title, message) VALUES (?,?,?,?,?)').run(
              uuidv4(), user_id, 'queue_application',
              'Application Queued → Processed',
              `Your application for "${job.title}" was automatically processed from the queue.`
            );
            logger.info('Queue: application processed', { user_id, job_id: item.job_id });
          } catch (e) {
            updateQueueStatus('application', item.id, 'failed', e.message, user_id);
            logger.error('Queue: application failed', { user_id, error: e.message });
          }
        }
      }

      // ── Process queued emails (1 at a time with spacing) ───────────────
      const emailCheck = checkRateLimit(user_id, 'email');
      if (emailCheck.allowed) {
        const readyEmails = getReadyQueue(user_id, 'email', 1);
        for (const item of readyEmails) {
          updateQueueStatus('email', item.id, 'processing', null, user_id);
          try {
            const resume = db.prepare('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1').get(user_id);
            if (!resume?.parsed_text) throw new Error('No active resume');

            const user = db.prepare('SELECT name FROM users WHERE id = ?').get(user_id);
            const templateIndex = getNextTemplateIndex(user_id);
            const resumeVariant = getResumeVariant(user_id);

            const generated = await generateVariedEmail({
              resumeText: resume.parsed_text,
              companyName: item.company_name, role: item.role,
              companyInfo: item.company_info, personality: item.personality || 'formal_confident',
              templateIndex, subjectVariant: templateIndex,
            });

            const resumeData = await generateResumeVariant(resume.parsed_text, user?.name || '', resumeVariant).catch(() => null);
            const clData = await generateCoverLetterVariant(generated.cover_letter, user?.name || '', item.company_name, item.role, resumeVariant).catch(() => null);

            await sendJobApplication({
              to: item.recipient_email, subject: generated.subject,
              htmlBody: generated.email_body,
              resumePath: resumeData?.pdf_path || null,
              coverLetterPath: clData?.pdf_path || null,
            });

            recordAction(user_id, 'email');
            logEmailSent(user_id, item.email_app_id, templateIndex, resumeVariant, generated.subject);
            updateQueueStatus('email', item.id, 'sent', null, user_id);
            scheduleNextEmailAfterDelay(user_id);
            // Notify user
            db.prepare('INSERT INTO notifications (id, user_id, type, title, message) VALUES (?,?,?,?,?)').run(
              uuidv4(), user_id, 'queue_email',
              'Queued Email Sent',
              `Your email to ${item.recipient_email} for "${item.role}" at ${item.company_name} was automatically sent from the queue.`
            );
            logger.info('Queue: email sent', { user_id, to: item.recipient_email });
          } catch (e) {
            updateQueueStatus('email', item.id, 'failed', e.message, user_id);
            logger.error('Queue: email failed', { user_id, error: e.message });
          }
        }
      }
    }
  } catch (err) {
    logger.error('Queue processor fatal error', { error: err.message, stack: err.stack });
  }
});

// Daily email outcome reminder cron at 10 AM
cron.schedule('0 10 * * *', async () => {
  logger.info('Running email outcome reminder cron...');
  try {
    const db = getDb();
    const { v4: uuidv4 } = require('uuid');
    
    // Find emails sent 48-96h ago with no outcome set
    const pending = db.prepare(`
      SELECT ep.id, ep.user_id, ep.company_name, ep.role,
             ep.recipient_email, ep.sent_at
      FROM email_performance ep
      WHERE ep.outcome IS NULL
        AND ep.sent_at < datetime('now', '-2 days')
        AND ep.sent_at > datetime('now', '-4 days')
        AND ep.user_id NOT IN (
          SELECT DISTINCT user_id FROM notifications
          WHERE type = 'outcome_reminder'
            AND message LIKE '%' || ep.company_name || '%'
            AND created_at > datetime('now', '-1 day')
        )
    `).all();

    for (const email of pending) {
      db.prepare(`
        INSERT INTO notifications
          (id, user_id, type, title, message)
        VALUES (?, ?, 'outcome_reminder', ?, ?)
      `).run(
        uuidv4(),
        email.user_id,
        'Did you hear back?',
        `You emailed ${email.company_name} about "${email.role}" 2 days ago. Did they respond? Record the outcome to improve your email strategy.`
      );
    }

    if (pending.length > 0) {
      logger.info(`Sent ${pending.length} outcome reminder notifications`);
    }
  } catch (err) {
    logger.error('Outcome reminder cron error', { error: err.message });
  }
}, { timezone: 'Asia/Kolkata' });

// Weekly cleanup of old tailored resume files (>7 days)
cron.schedule('0 3 * * 0', () => {
  const tailoredDir = path.join(__dirname, '../uploads/tailored');
  const screenshotDir = path.join(__dirname, '../uploads/screenshots');
  [tailoredDir, screenshotDir].forEach(dir => {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    let cleaned = 0;
    files.forEach(file => {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (Date.now() - stat.mtimeMs > 7 * 24 * 60 * 60 * 1000) {
          fs.unlinkSync(fullPath);
          cleaned++;
        }
      } catch {}
    });
    if (cleaned > 0) logger.info(`Cleaned ${cleaned} old files from ${dir}`);
  });
});

// Daily: clean expired password reset tokens and email verification tokens
cron.schedule('0 2 * * *', () => {
  try {
    const { getDb } = require('./database/db');
    const db = getDb();
    const now = new Date().toISOString();
    const expiredTokens = db.prepare(
      "DELETE FROM email_verification_tokens WHERE expires_at < ? OR used = 1"
    ).run(now).changes;
    const expiredResets = db.prepare(
      "DELETE FROM logs WHERE type = 'auth' AND action = 'password_reset' AND (details < ? OR status != 'pending')"
    ).run(now).changes;
    const oldNotifications = db.prepare(
      "DELETE FROM notifications WHERE created_at < datetime('now', '-30 days')"
    ).run().changes;
    logger.info(`Daily cleanup: ${expiredTokens} tokens, ${expiredResets} resets, ${oldNotifications} old notifications removed`);
  } catch (err) {
    logger.error('Daily cleanup error', { error: err.message });
  }
});
cron.schedule('0 16 * * *', async () => {
  logger.info('Running daily job discovery task...');
  try {
    const { getDb } = require('./database/db');
    const db = getDb();
    const { discoverJobs } = require('./services/aiService');

    // Get all users with discovery enabled
    const users = db.prepare(`
      SELECT u.id, u.name, u.email, up.*
      FROM users u
      JOIN user_preferences up ON up.user_id = u.id
      WHERE up.daily_discovery_enabled = 1
    `).all();

    for (const user of users) {
      const resume = db.prepare('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1').get(user.id);
      if (!resume || !resume.parsed_text) continue;

      try {
        await discoverJobs(resume.parsed_text, user);
        db.prepare('INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?, ?, ?, ?, ?, ?)')
          .run(require('uuid').v4(), user.id, 'discovery', 'daily_run', 'Daily job discovery completed', 'success');
        logger.info(`Daily discovery done for user ${user.id}`);
      } catch (e) {
        logger.error('Daily discovery error for user', { userId: user.id, error: e.message });
      }
    }
  } catch (err) {
    logger.error('Cron job error', { error: err.message });
  }
}, { timezone: 'Asia/Kolkata' });

// ─── Error Handler ────────────────────────────────────────────────────────────

app.use((err, req, res, next) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });

  if (err.name === 'MulterError') {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
    return res.status(400).json({ error: err.message });
  }

  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message });
});

app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ─── Start ────────────────────────────────────────────────────────────────────

setupDatabase();

// Startup validation — fail fast with clear messages
const missing = [];
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.includes('change_this')) missing.push('JWT_SECRET');
if (!process.env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
if (missing.length > 0) {
  logger.warn(`⚠️  Missing/default env vars: ${missing.join(', ')} — AI features will not work.`);
}

// ── Production maintenance crons ──────────────────────────────────────────────

// Daily 3 AM: hot backup (non-blocking; pruned after 7 days automatically)
cron.schedule('0 3 * * *', async () => {
  try {
    const dest = await backupDatabase();
    logger.info(`[CRON] DB backup: ${dest}`);
  } catch (err) {
    logger.error(`[CRON] DB backup failed: ${err.message}`);
  }
});

// Weekly Sunday 4 AM: prune stale tokens, old logs, read notifications
cron.schedule('0 4 * * 0', () => {
  logger.info('[CRON] Running weekly DB maintenance...');
  runMaintenance();
  checkpointWal();
});

// ── HTTP server with graceful shutdown ────────────────────────────────────────

const server = app.listen(PORT, () => {
  logger.info(`🚀 JobAI Backend running on port ${PORT}`);
  logger.info(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🤖 AI: ${process.env.GEMINI_API_KEY ? 'Configured ✅' : 'Not configured ❌'}`);
});

/**
 * Graceful shutdown — waits for in-flight requests to finish, then closes
 * the DB connection cleanly.  Docker / PM2 both send SIGTERM first.
 */
function gracefulShutdown(signal) {
  logger.info(`[${signal}] Shutting down gracefully…`);

  server.close((err) => {
    if (err) logger.error('Error closing HTTP server:', err.message);
    else logger.info('HTTP server closed');

    // closeDatabase() is also registered as a process.once handler in db.js
    // so this call is an explicit belt-and-suspenders invocation.
    closeDatabase();

    logger.info('Shutdown complete. Exiting.');
    process.exit(err ? 1 : 0);
  });

  // Force-exit after 15 s if in-flight requests are taking too long
  setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit');
    process.exit(1);
  }, 15_000).unref();
}

process.once('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.once('SIGINT',  () => gracefulShutdown('SIGINT'));

module.exports = app;
