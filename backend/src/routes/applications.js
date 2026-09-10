const express = require('express');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');
const { getDb } = require('../database/db');
const authMiddleware = require('../middleware/auth');
const { tailorResume, generateApplicationAnswer } = require('../services/aiService');
const { generateDocxFromText } = require('../services/resumeService');
const { generateResumePDF } = require('../services/pdfService');
const { autoApplyToJob, applyToJob } = require('../services/automationService');
const { checkRateLimit, recordAction, getQueueStatus, getUsageStats } = require('../services/rateLimitService');
const logger = require('../utils/logger');

const router = express.Router();

function getActiveResume(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').get(userId);
}

// POST /api/applications/start - start application process for a job
router.post('/start', authMiddleware, async (req, res) => {
  try {
    const { job_id, user_confirmed } = req.body;
    const db = getDb();

    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(job_id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    // ── Rate Limit Check: 8 applications per 12 hours ──────────────────────
    const rateCheck = checkRateLimit(req.user.id, 'application', { job_id, user_confirmed: !!user_confirmed });
    if (!rateCheck.allowed) {
      return res.status(429).json({
        error: rateCheck.message,
        rate_limit: { limit: 8, window_hours: 12, ...rateCheck.quota },
        queued_id: rateCheck.queued_id,
        queued: true,
      });
    }
    // ───────────────────────────────────────────────────────────────────────
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    // Safety: match score check using AI-learned threshold (default 50 per spec)
    const { getDb: _getDb } = require('../database/db');
    const _insights = _getDb().prepare('SELECT recommended_min_score FROM learning_insights WHERE user_id = ?').get(req.user.id);
    const threshold = (_insights?.recommended_min_score >= 40 && _insights?.recommended_min_score <= 90)
      ? _insights.recommended_min_score : 50;

    // Allow if ≥ threshold (AUTO_APPLY) OR if user explicitly confirmed (ASK_USER confirmed)
    const userConfirmed = req.body.user_confirmed === true;
    if (job.match_score < threshold && !userConfirmed) {
      return res.status(200).json({
        requires_confirmation: true,
        match_score: job.match_score,
        threshold,
        recommendation: 'ASK_USER',
        missing_requirements: JSON.parse(job.missing_requirements || '[]'),
        message: `This job has a lower match score (${job.match_score}%). Some requirements may not be fully met. Do you still want to apply?`,
        reason: job.match_reason || 'Low match score detected.',
        job: { id: job.id, title: job.title, company: job.company }
      });
    }

    // Duplicate check
    const existing = db.prepare(`
      SELECT id, status FROM applications WHERE job_id = ? AND user_id = ?
    `).get(job_id, req.user.id);

    if (existing && existing.status === 'applied') {
      return res.status(409).json({ error: 'Already applied to this job.', application_id: existing.id });
    }

    const resume = getActiveResume(req.user.id);
    if (!resume || !resume.parsed_text) {
      return res.status(400).json({ error: 'No active resume found. Upload your resume first.' });
    }

    // Step 1: Tailor resume (MANDATORY — no exceptions)
    logger.info('Starting resume tailoring', { job_id, userId: req.user.id });
    const tailoredText = await tailorResume(resume.parsed_text, job.description, job.title);

    // Step 2: Generate BOTH DOCX and PDF (Smart File Handling)
    const baseName = `app_${job.id.slice(0, 8)}`;
    const tailoredDocxPath = await generateDocxFromText(tailoredText, baseName);
    let tailoredPdfPath = null;
    try {
      tailoredPdfPath = await generateResumePDF(tailoredText, baseName);
    } catch (pdfErr) {
      logger.warn('PDF generation failed, will use DOCX only', { error: pdfErr.message });
    }

    // Smart File Handling: determine which format to use
    // PDF first, fallback to DOCX if PDF failed
    const primaryResumePath = tailoredPdfPath || tailoredDocxPath;
    const primaryResumeType = tailoredPdfPath ? 'pdf' : 'docx';

    // Create/update application record
    const appId = existing ? existing.id : uuidv4();
    const actionsLog = JSON.stringify([
      { time: new Date().toISOString(), action: 'resume_tailored', note: 'Resume tailored for job requirements' },
      { time: new Date().toISOString(), action: 'pdf_generated', note: tailoredPdfPath ? 'PDF resume ready' : 'PDF failed, DOCX used' },
    ]);

    // Atomic transaction — if any step fails, everything rolls back
    const doInsert = db.transaction(() => {
      if (existing) {
        db.prepare(`
          UPDATE applications SET tailored_resume_path = ?, status = 'ready', actions_log = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ?
        `).run(primaryResumePath, actionsLog, appId, req.user.id);
      } else {
        db.prepare(`
          INSERT INTO applications (id, user_id, job_id, resume_id, tailored_resume_path, status, match_score, actions_log)
          VALUES (?, ?, ?, ?, ?, 'ready', ?, ?)
        `).run(appId, req.user.id, job_id, resume.id, primaryResumePath, job.match_score, actionsLog);
      }
      db.prepare('UPDATE jobs SET status = ? WHERE id = ? AND user_id = ?').run('in_progress', job_id, req.user.id);
    });
    doInsert();

    // Record rate limit action (outside transaction — non-critical)
    recordAction(req.user.id, 'application');

    // FIX 10: Notify user that their tailored application is ready
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message)
      VALUES (?, ?, 'info', 'Application Ready', ?)
    `).run(
      require('uuid').v4(),
      req.user.id,
      `Your tailored resume for "${job.title}" is ready.`
    );

    res.json({
      application_id: appId,
      status: 'ready',
      tailored_resume: tailoredText,
      tailored_resume_docx: tailoredDocxPath,
      tailored_resume_pdf: tailoredPdfPath,
      primary_format: primaryResumeType,
      job: { id: job.id, title: job.title, company: job.company, apply_url: job.apply_url },
      match_score: job.match_score,
      message: `Resume tailored as ${primaryResumeType.toUpperCase()}. Review below, then apply manually or use Auto-Apply.`
    });

  } catch (err) {
    logger.error('Application start error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications/:id/auto-apply — Feature 1 Step 5: Browser automation
router.post('/:id/auto-apply', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const app = db.prepare(`
      SELECT a.*, j.apply_url, j.title as job_title, j.company, j.description as job_description, j.match_score
      FROM applications a JOIN jobs j ON a.job_id = j.id
      WHERE a.id = ? AND a.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!app) return res.status(404).json({ error: 'Application not found.' });
    if (app.status === 'applied') return res.status(409).json({ error: 'Already applied to this job.' });
    if (!app.apply_url) return res.status(400).json({ error: 'No apply URL for this job.' });
    if (!app.tailored_resume_path || !fs.existsSync(app.tailored_resume_path)) {
      return res.status(400).json({ error: 'Tailored resume not found. Run /start first.' });
    }

    // Safety: re-check match score
    if (app.match_score < 50) {
      return res.status(400).json({ error: `Match score ${app.match_score}% below 50%. Auto-apply blocked.` });
    }

    // Get user profile for form filling
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const userInfo = {
      name: user.name, email: user.email, phone: user.phone || '',
      location: user.location || '', firstName: user.name?.split(' ')[0] || '',
      lastName: user.name?.split(' ').slice(1).join(' ') || ''
    };

    // Fix: Pull AI-generated answers already saved for this application
    // Convert array [{question, answer}] → { question: answer } map for automationService
    let savedAnswers = {};
    if (app.answers_generated) {
      try {
        const arr = JSON.parse(app.answers_generated);
        arr.forEach(({ question, answer }) => {
          if (question && answer) savedAnswers[question.toLowerCase().slice(0, 40)] = answer;
        });
      } catch {}
    }

    // Also pre-generate answers for common questions using AI, stored in savedAnswers
    const resume = db.prepare('SELECT parsed_text FROM resumes WHERE id = ? AND user_id = ?').get(app.resume_id, req.user.id);
    if (resume?.parsed_text) {
      const { generateApplicationAnswer } = require('../services/aiService');
      const commonQs = [
        { key: 'why should we hire you', q: 'Why should we hire you?' },
        { key: 'tell me about yourself', q: 'Tell me about yourself.' },
        { key: 'what are your strengths', q: 'What are your strengths?' },
        { key: 'expected salary', q: 'What is your expected salary?' },
      ];
      for (const { key, q } of commonQs) {
        if (!savedAnswers[key]) {
          try {
            savedAnswers[key] = await generateApplicationAnswer(q, resume.parsed_text, app.job_description, 150, 'formal_confident');
          } catch {}
        }
      }
      // Store back to application
      const existing = JSON.parse(app.answers_generated || '[]');
      Object.entries(savedAnswers).forEach(([q, a]) => {
        if (!existing.find(e => e.question?.toLowerCase().includes(q.slice(0, 20)))) {
          existing.push({ question: q, answer: a, personality: 'formal_confident', generated_at: new Date().toISOString() });
        }
      });
      db.prepare('UPDATE applications SET answers_generated = ? WHERE id = ? AND user_id = ?')
        .run(JSON.stringify(existing), app.id, req.user.id);
    }

    const application = {
      ...app,
      userInfo,
      answers: savedAnswers
    };
    const job = {
      id: app.job_id,
      title: app.job_title,
      company: app.company,
      apply_url: app.apply_url,
      description: app.job_description,
      match_score: app.match_score
    };

    // Update status to automating
    db.prepare('UPDATE applications SET status = ? WHERE id = ? AND user_id = ?').run('automating', app.id, req.user.id);

    try {
      const result = await applyToJob(application, job, resume);

      // Update final status
      const finalStatus = result.status === 'applied' ? 'applied' : result.status === 'skipped' ? 'skipped' : 'failed';
      const applyTime = result.status === 'applied' ? new Date().toISOString() : null;

      db.prepare(`
        UPDATE applications SET
          status = ?, applied_at = ?, error_message = ?,
          actions_log = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `).run(
        finalStatus,
        applyTime,
        result.status !== 'applied' ? result.reason : null,
        JSON.stringify(result.actions || []),
        app.id,
        req.user.id
      );

      if (result.status === 'applied') {
        db.prepare('UPDATE jobs SET status = ? WHERE id = ? AND user_id = ?').run('applied', app.job_id, req.user.id);
      }

      db.prepare('INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?, ?, ?, ?, ?, ?)')
        .run(uuidv4(), req.user.id, 'automation', finalStatus,
          `${app.job_title} @ ${app.company} — ${result.reason}`,
          result.status === 'applied' ? 'success' : 'warning');

      logger.info('Automation complete', { appId: app.id, status: result.status });
      return res.json(result);
    } catch (err) {
      if (err.message.includes('Chromium is not installed') ||
          err.message.includes('playwright')) {
        db.prepare(`UPDATE applications SET status = 'failed', error_message = ? WHERE id = ? AND user_id = ?`)
          .run(err.message, app.id, req.user.id);
        return res.status(503).json({
          error: 'Browser automation is not available on this server.',
          details: 'Run npm run install:browsers in the backend directory.',
          manual_apply_url: job.apply_url,
        });
      }
      return res.status(500).json({ error: err.message });
    }

  } catch (err) {
    logger.error('Auto-apply route error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications/:id/mark-applied - manually confirm application was submitted
router.post('/:id/mark-applied', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const app = db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'Application not found.' });

    const log = JSON.parse(app.actions_log || '[]');
    log.push({ time: new Date().toISOString(), action: 'marked_applied', note: 'User confirmed application submitted' });

    db.prepare(`
      UPDATE applications SET status = 'applied', applied_at = CURRENT_TIMESTAMP, actions_log = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `).run(JSON.stringify(log), req.params.id, req.user.id);

    db.prepare('UPDATE jobs SET status = ? WHERE id = ? AND user_id = ?').run('applied', app.job_id, req.user.id);

    db.prepare('INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), req.user.id, 'application', 'applied', `Application ${req.params.id} marked as applied`, 'success');

    res.json({ message: 'Application marked as applied.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/applications/answer-question - AI answers an application question
router.post('/answer-question', authMiddleware, async (req, res) => {
  try {
    const { question, job_id, word_limit, personality } = req.body;
    if (!question) return res.status(400).json({ error: 'Question is required.' });

    const resume = getActiveResume(req.user.id);
    if (!resume || !resume.parsed_text) return res.status(400).json({ error: 'No active resume found.' });

    const db = getDb();

    // Part B: Context Mapping — fetch user preferences (salary, location, etc.)
    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
    const user  = db.prepare('SELECT name, phone, location FROM users WHERE id = ?').get(req.user.id);

    // Build full context string for the AI
    const userContext = [
      prefs?.preferred_roles    ? `Target roles: ${prefs.preferred_roles}` : '',
      prefs?.preferred_locations? `Preferred location: ${prefs.preferred_locations}` : '',
      user?.location            ? `Current location: ${user.location}` : '',
      prefs?.min_salary         ? `Minimum expected salary: ₹${prefs.min_salary}` : '',
      prefs?.job_types          ? `Job types seeking: ${prefs.job_types}` : '',
    ].filter(Boolean).join('\n');

    let jobDescription = '';
    if (job_id) {
      const job = db.prepare('SELECT description FROM jobs WHERE id = ? AND user_id = ?').get(job_id, req.user.id);
      if (job) jobDescription = job.description;
    }

    const answer = await generateApplicationAnswer(
      question, resume.parsed_text, jobDescription,
      word_limit || 150,
      personality || 'formal_confident',
      userContext   // Part B: pass preferences as extra context
    );

    // Step 9: Store answer in application if job_id provided
    if (job_id) {
      const app = db.prepare(
        "SELECT id, answers_generated FROM applications WHERE job_id = (SELECT id FROM jobs WHERE id = ? AND user_id = ?) AND user_id = ? ORDER BY created_at DESC LIMIT 1"
      ).get(job_id, req.user.id, req.user.id);

      if (app) {
        const existing = JSON.parse(app.answers_generated || '[]');
        existing.push({ question, answer, personality: personality || 'formal_confident', generated_at: new Date().toISOString() });
        db.prepare('UPDATE applications SET answers_generated = ? WHERE id = ? AND user_id = ?')
          .run(JSON.stringify(existing), app.id, req.user.id);
      }
    }

    res.json({
      question,
      answer,
      word_count: answer.split(/\s+/).length,
      personality: personality || 'formal_confident',
      question_type_detected: true
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications - list all applications with pagination
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const page  = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;
    const status = req.query.status;

    let query = `SELECT a.*, j.title as job_title, j.company, j.apply_url, j.match_score as job_match_score
                 FROM applications a JOIN jobs j ON a.job_id = j.id
                 WHERE a.user_id = ?`;
    const params = [req.user.id];
    if (status) { query += ' AND a.status = ?'; params.push(status); }

    const totalRow = db.prepare(query.replace('SELECT a.*, j.title as job_title, j.company, j.apply_url, j.match_score as job_match_score', 'SELECT COUNT(*) as count')).get(...params);
    const total = totalRow?.count || 0;

    query += ' ORDER BY a.created_at DESC LIMIT ? OFFSET ?';
    params.push(limit, offset);

    const apps = db.prepare(query).all(...params);
    res.json({
      applications: apps,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/export - CSV export of all applications
router.get('/export', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const apps = db.prepare(`
      SELECT a.id, j.title as role, j.company, j.apply_url, a.match_score,
             a.status, a.applied_at, a.created_at
      FROM applications a JOIN jobs j ON a.job_id = j.id
      WHERE a.user_id = ? ORDER BY a.created_at DESC
    `).all(req.user.id);

    const headers = ['ID', 'Role', 'Company', 'Apply URL', 'Match Score', 'Status', 'Applied At', 'Created At'];
    const rows = apps.map(a => [
      a.id, a.role, a.company, a.apply_url || '',
      a.match_score, a.status,
      a.applied_at ? new Date(a.applied_at).toISOString() : '',
      new Date(a.created_at).toISOString()
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

    const csv = [headers.join(','), ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="applications_${Date.now()}.csv"`);
    res.send(csv);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.get('/stats', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const userId = req.user.id;

    const total = db.prepare('SELECT COUNT(*) as count FROM applications WHERE user_id = ?').get(userId).count;
    const applied = db.prepare("SELECT COUNT(*) as count FROM applications WHERE user_id = ? AND status = 'applied'").get(userId).count;
    const ready = db.prepare("SELECT COUNT(*) as count FROM applications WHERE user_id = ? AND status = 'ready'").get(userId).count;
    const jobs_analyzed = db.prepare('SELECT COUNT(*) as count FROM jobs WHERE user_id = ?').get(userId).count;
    const resumes_count = db.prepare('SELECT COUNT(*) as count FROM resumes WHERE user_id = ?').get(userId).count;
    const email_apps = db.prepare("SELECT COUNT(*) as count FROM email_applications WHERE user_id = ? AND status = 'sent'").get(userId).count;
    const avg_score = db.prepare('SELECT AVG(match_score) as avg FROM jobs WHERE user_id = ? AND match_score > 0').get(userId).avg;

    res.json({ total, applied, ready, jobs_analyzed, resumes_count, email_apps, avg_match_score: Math.round(avg_score || 0) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/:id
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const app = db.prepare(`
      SELECT a.*, j.title as job_title, j.company, j.apply_url, j.description as job_description
      FROM applications a JOIN jobs j ON a.job_id = j.id
      WHERE a.id = ? AND a.user_id = ?
    `).get(req.params.id, req.user.id);

    if (!app) return res.status(404).json({ error: 'Application not found.' });
    res.json({ application: { ...app, actions_log: JSON.parse(app.actions_log || '[]') } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/logs/recent
router.get('/logs/recent', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const logs = db.prepare('SELECT * FROM logs WHERE user_id = ? ORDER BY created_at DESC LIMIT 50').all(req.user.id);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/:id/download-resume - authenticated download of tailored resume
router.get('/:id/download-resume', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const app = db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'Application not found.' });

    const format = req.query.format === 'docx' ? 'docx' : 'pdf';
    let filePath = format === 'docx' ? app.tailored_docx_path : app.tailored_resume_path;
    if (!filePath || !fs.existsSync(filePath)) {
      filePath = app.tailored_resume_path || app.tailored_docx_path;
    }
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Tailored resume file not found on server.' });
    }

    res.download(filePath, path.basename(filePath));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/applications/:id/view-resume - authenticated stream/view of tailored resume
router.get('/:id/view-resume', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const app = db.prepare('SELECT * FROM applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!app) return res.status(404).json({ error: 'Application not found.' });

    const format = req.query.format === 'docx' ? 'docx' : 'pdf';
    let filePath = format === 'docx' ? app.tailored_docx_path : app.tailored_resume_path;
    if (!filePath || !fs.existsSync(filePath)) {
      filePath = app.tailored_resume_path || app.tailored_docx_path;
    }
    if (!filePath || !fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Tailored resume file not found on server.' });
    }

    const mimeTypes = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    };
    const ext = path.extname(filePath).replace('.', '').toLowerCase();
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    res.sendFile(path.resolve(filePath));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
