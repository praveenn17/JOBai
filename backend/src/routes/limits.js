const express = require('express');
const authMiddleware = require('../middleware/auth');
const { getQueueStatus, getUsageStats } = require('../services/rateLimitService');
const { getDb } = require('../database/db');

const router = express.Router();

// GET /api/limits — full rate limit status + queue counts + tracking
router.get('/', authMiddleware, (req, res) => {
  try {
    const { getQueueStatus, getUsageStats } = require('../services/rateLimitService');
    const stats  = getUsageStats(req.user.id);
    const queues = getQueueStatus(req.user.id);

    const db = getDb();
    // Recent email send log
    const recentEmails = db.prepare(`
      SELECT template_index, resume_variant, subject, sent_at
      FROM email_send_log WHERE user_id = ? ORDER BY sent_at DESC LIMIT 20
    `).all(req.user.id);

    // Queue details
    const appQueue   = db.prepare("SELECT * FROM application_queue WHERE user_id = ? AND status = 'queued' ORDER BY queued_at ASC LIMIT 10").all(req.user.id);
    const emailQueue = db.prepare("SELECT id, company_name, role, recipient_email, process_after, status FROM email_queue WHERE user_id = ? ORDER BY queued_at ASC LIMIT 10").all(req.user.id);

    res.json({
      rate_limits: {
        ...stats.last_12h,
        application_quota: queues.application_quota,
        email_quota: queues.email_quota,
      },
      queues: {
        application_queue: { count: queues.application_queue, items: appQueue },
        email_queue:        { count: queues.email_queue,        items: emailQueue },
      },
      tracking: {
        templates_used:      stats.templates_used,
        resume_versions_used: stats.resume_versions_used,
        recent_emails:       recentEmails,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
