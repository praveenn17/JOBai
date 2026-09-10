/**
 * Rate Limiting & Queue Management Service
 * - Max 8 job applications per 12 hours (rolling window)
 * - Max 5 cold emails per 12 hours (rolling window)
 * - FIFO queue for overflow
 * - Tracks usage transparently
 */

const { getDb } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const LIMITS = {
  application: { max: 8,  windowHours: 12 },
  email:       { max: 5,  windowHours: 12 },
};

const WINDOW_MS = 12 * 60 * 60 * 1000; // 12 hours in ms

/**
 * Count actions performed by user in the last 12 hours
 */
function countInWindow(userId, actionType) {
  const db = getDb();
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM rate_limits
    WHERE user_id = ? AND action_type = ? AND performed_at > ?
  `).get(userId, actionType, cutoff);
  return row.count;
}

/**
 * Record that an action was performed
 */
function recordAction(userId, actionType) {
  const db = getDb();
  db.prepare(`INSERT INTO rate_limits (id, user_id, action_type) VALUES (?, ?, ?)`)
    .run(uuidv4(), userId, actionType);
}

/**
 * Get remaining quota and next-reset info
 */
function getQuota(userId, actionType) {
  const limit = LIMITS[actionType];
  const used  = countInWindow(userId, actionType);
  const remaining = Math.max(0, limit.max - used);

  // Find the oldest action in window to compute when next slot opens
  const db = getDb();
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();
  const oldest = db.prepare(`
    SELECT performed_at FROM rate_limits
    WHERE user_id = ? AND action_type = ? AND performed_at > ?
    ORDER BY performed_at ASC LIMIT 1
  `).get(userId, actionType, cutoff);

  const nextResetAt = oldest
    ? new Date(new Date(oldest.performed_at).getTime() + WINDOW_MS).toISOString()
    : null;

  return { used, remaining, limit: limit.max, window_hours: limit.windowHours, next_reset_at: nextResetAt, can_proceed: remaining > 0 };
}

/**
 * Check if user can perform an action — if not, queue it and return false
 * Returns { allowed: bool, quota, queued_id? }
 */
function checkRateLimit(userId, actionType, queuePayload = null) {
  const quota = getQuota(userId, actionType);

  if (quota.can_proceed) {
    return { allowed: true, quota };
  }

  // Limit reached — queue if payload provided
  let queuedId = null;
  if (queuePayload) {
    queuedId = enqueue(userId, actionType, queuePayload, quota.next_reset_at);
    logger.info(`Rate limit reached — queued ${actionType}`, { userId, queuedId, next_reset_at: quota.next_reset_at });
  }

  return {
    allowed: false,
    quota,
    queued_id: queuedId,
    message: `${actionType === 'application' ? 'Job application' : 'Email'} limit reached (${quota.limit} per 12 hours). ${queuedId ? 'Added to queue — will process automatically.' : ''} Next slot opens at ${quota.next_reset_at ? new Date(quota.next_reset_at).toLocaleString() : 'unknown'}.`
  };
}

/**
 * Add to appropriate queue (FIFO)
 */
function enqueue(userId, actionType, payload, processAfter = null) {
  const db = getDb();
  const id = uuidv4();
  const after = processAfter || new Date(Date.now() + WINDOW_MS).toISOString();

  if (actionType === 'application') {
    db.prepare(`
      INSERT INTO application_queue (id, user_id, job_id, user_confirmed, process_after)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, userId, payload.job_id, payload.user_confirmed ? 1 : 0, after);
  } else if (actionType === 'email') {
    db.prepare(`
      INSERT INTO email_queue
        (id, user_id, email_app_id, company_name, role, recipient_email, company_info, personality, process_after)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, payload.email_app_id || null,
      payload.company_name, payload.role, payload.recipient_email,
      payload.company_info || null, payload.personality || 'formal_confident', after);
  }

  return id;
}

/**
 * Get pending queue items ready to process now (FIFO order)
 */
function getReadyQueue(userId, actionType, limit = 5) {
  const db = getDb();
  const now = new Date().toISOString();
  const table = actionType === 'application' ? 'application_queue' : 'email_queue';

  return db.prepare(`
    SELECT * FROM ${table}
    WHERE user_id = ? AND status = 'queued' AND process_after <= ?
    ORDER BY queued_at ASC LIMIT ?
  `).all(userId, now, limit);
}

/**
 * Mark queue item status
 */
function updateQueueStatus(actionType, id, status, errorMessage = null, userId = null) {
  const db = getDb();
  const table = actionType === 'application' ? 'application_queue' : 'email_queue';
  const userClause = userId ? ' AND user_id = ?' : '';
  const params = [status];
  if (errorMessage) params.push(errorMessage);
  params.push(id);
  if (userId) params.push(userId);

  if (errorMessage) {
    db.prepare(`UPDATE ${table} SET status = ?, error_message = ? WHERE id = ?${userClause}`).run(...params);
  } else {
    db.prepare(`UPDATE ${table} SET status = ? WHERE id = ?${userClause}`).run(...params);
  }
}

/**
 * Get queue counts for dashboard
 */
function getQueueStatus(userId) {
  const db = getDb();
  const appQueued   = db.prepare("SELECT COUNT(*) as c FROM application_queue WHERE user_id = ? AND status = 'queued'").get(userId).c;
  const emailQueued = db.prepare("SELECT COUNT(*) as c FROM email_queue WHERE user_id = ? AND status = 'queued'").get(userId).c;
  return {
    application_queue: appQueued,
    email_queue: emailQueued,
    application_quota: getQuota(userId, 'application'),
    email_quota: getQuota(userId, 'email'),
  };
}

/**
 * Get usage stats for tracking dashboard
 */
function getUsageStats(userId) {
  const db = getDb();
  const cutoff = new Date(Date.now() - WINDOW_MS).toISOString();

  const appCount   = db.prepare("SELECT COUNT(*) as c FROM rate_limits WHERE user_id = ? AND action_type = 'application' AND performed_at > ?").get(userId, cutoff).c;
  const emailCount = db.prepare("SELECT COUNT(*) as c FROM rate_limits WHERE user_id = ? AND action_type = 'email' AND performed_at > ?").get(userId, cutoff).c;

  // Templates used in last 12h
  const templatesUsed = db.prepare("SELECT template_index, COUNT(*) as count FROM email_send_log WHERE user_id = ? AND sent_at > ? GROUP BY template_index").all(userId, cutoff);
  const resumeVersions = db.prepare("SELECT resume_variant, COUNT(*) as count FROM email_send_log WHERE user_id = ? AND sent_at > ? GROUP BY resume_variant").all(userId, cutoff);

  return {
    last_12h: {
      applications_sent: appCount,
      emails_sent: emailCount,
      application_limit: LIMITS.application.max,
      email_limit: LIMITS.email.max,
      application_remaining: Math.max(0, LIMITS.application.max - appCount),
      email_remaining: Math.max(0, LIMITS.email.max - emailCount),
    },
    templates_used: templatesUsed,
    resume_versions_used: resumeVersions,
  };
}

/**
 * Determine which email template index to use next (non-repeating rotation)
 */
function getNextTemplateIndex(userId) {
  const db = getDb();
  const logs = db.prepare(
    'SELECT template_index FROM email_send_log WHERE user_id = ? ORDER BY sent_at DESC LIMIT 20'
  ).all(userId);
  if (!logs || logs.length === 0) {
    return Math.floor(Math.random() * 8); // 8 templates available
  }
  const lastIdx = logs[0].template_index !== undefined ? logs[0].template_index : -1;
  // 5 templates (0–4), skip the one just used
  const next = (lastIdx + 1) % 5;
  return next;
}

/**
 * Determine resume variant — change every 10 emails
 */
function getResumeVariant(userId) {
  const db = getDb();
  const total = db.prepare("SELECT COUNT(*) as c FROM email_send_log WHERE user_id = ?").get(userId).c;
  return Math.floor(total / 10) % 3; // 3 variants: 0, 1, 2
}

/**
 * Log a sent email for tracking
 */
function logEmailSent(userId, emailAppId, templateIndex, resumeVariant, subject) {
  const db = getDb();
  db.prepare(`
    INSERT INTO email_send_log (id, user_id, email_app_id, template_index, resume_variant, subject)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(uuidv4(), userId, emailAppId || null, templateIndex, resumeVariant, subject);
}

/**
 * Calculate human-like random delay between emails (30–90 min in ms)
 */
function getEmailDelay() {
  const minMs = 30 * 60 * 1000;  // 30 min
  const maxMs = 90 * 60 * 1000;  // 90 min
  return Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
}

/**
 * Schedule next email in queue with spacing
 */
function scheduleNextEmailAfterDelay(userId) {
  const db = getDb();
  const delay = getEmailDelay();
  const nextTime = new Date(Date.now() + delay).toISOString();

  // Update the oldest queued email's process_after time if not yet scheduled properly
  const next = db.prepare(`
    SELECT id FROM email_queue WHERE user_id = ? AND status = 'queued'
    ORDER BY queued_at ASC LIMIT 1
  `).get(userId);

  if (next) {
    db.prepare("UPDATE email_queue SET process_after = ? WHERE id = ?").run(nextTime, next.id);
    logger.info(`Next email scheduled`, { userId, at: nextTime, delay_min: Math.round(delay / 60000) });
  }
  return delay;
}

module.exports = {
  checkRateLimit, recordAction, getQuota, getQueueStatus, getUsageStats,
  getNextTemplateIndex, getResumeVariant, logEmailSent, getEmailDelay,
  scheduleNextEmailAfterDelay, enqueue, getReadyQueue, updateQueueStatus,
  LIMITS,
};
