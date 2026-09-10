const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const authMiddleware = require('../middleware/auth');
const { generateEmailApplication } = require('../services/aiService');
const { generateDocxFromText } = require('../services/resumeService');
const { generateResumePDF, generateCoverLetterPDF } = require('../services/pdfService');
const { sendJobApplication, verifyEmailConfig } = require('../services/emailService');
const {
  checkRateLimit, recordAction, getNextTemplateIndex, getResumeVariant,
  logEmailSent, scheduleNextEmailAfterDelay, getEmailDelay, getQueueStatus
} = require('../services/rateLimitService');
const {
  generateVariedEmail, generateResumeVariant, generateCoverLetterVariant
} = require('../services/emailVariationService');
const {
  recordEmailSent, setEmailOutcome, runPatternAnalysis,
  getStrategy, selectTemplateWeighted, trackSubjectSent,
  getPerformanceMetrics, getPendingOutcomes
} = require('../services/emailIntelligenceService');
const logger = require('../utils/logger');

const router = express.Router();

function getActiveResume(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').get(userId);
}

// GET previously used subjects (anti-spam)
function getRecentSubjects(userId, limit = 20) {
  const db = getDb();
  return db.prepare('SELECT subject FROM email_send_log WHERE user_id = ? ORDER BY sent_at DESC LIMIT ?')
    .all(userId, limit).map(r => r.subject);
}

// POST /api/email/generate — with variation + rate check
router.post('/generate', authMiddleware, async (req, res) => {
  try {
    const { company_name, role, recipient_email, company_info, personality } = req.body;

    if (!company_name || !role || !recipient_email) {
      return res.status(400).json({ error: 'company_name, role, and recipient_email are required.' });
    }

    const resume = getActiveResume(req.user.id);
    if (!resume || !resume.parsed_text) {
      return res.status(400).json({ error: 'No active resume found. Upload your resume first.' });
    }

    // ── Rate Limit Check: 5 emails per 12 hours ──────────────────────────
    const rateCheck = checkRateLimit(req.user.id, 'email', {
      company_name, role, recipient_email, company_info, personality
    });
    if (!rateCheck.allowed) {
      return res.status(429).json({
        queued: true,
        resetAt: rateCheck.quota?.next_reset_at,
        message: rateCheck.message,
        error: rateCheck.message,
        rate_limit: { limit: 5, window_hours: 12, ...rateCheck.quota },
        queued_id: rateCheck.queued_id,
      });
    }
    // ─────────────────────────────────────────────────────────────────────

    const db = getDb();
    const user = db.prepare('SELECT name FROM users WHERE id = ?').get(req.user.id);

    // Step 5: Weighted template selection (uses performance scores, not round-robin)
    const templateIndex  = selectTemplateWeighted(req.user.id);
    const resumeVariant  = getResumeVariant(req.user.id);
    const recentSubjects = getRecentSubjects(req.user.id);

    // Step 4: Load current strategy to guide generation
    const strategy = getStrategy(req.user.id);
    const effectivePersonality = strategy?.best_tone || personality || 'formal_confident';
    const personalizationType  = strategy?.best_personalization || 'company_mention';

    // Inject strategy insights into email generation
    const strategyHints = strategy ? {
      promote: strategy.promote_patterns.slice(0, 3),
      avoid:   strategy.avoid_patterns.slice(0, 5),
      bestOpening: strategy.best_opening_style,
      bestClosing: strategy.best_closing_style,
      bestLength:  strategy.best_length_range,
    } : null;

    // Generate varied email (anti-spam + strategy-guided)
    const generated = await generateVariedEmail({
      resumeText: resume.parsed_text,
      companyName: company_name, role, companyInfo: company_info,
      personality: effectivePersonality,
      templateIndex, subjectVariant: templateIndex,
      existingSubjectsUsed: recentSubjects,
      strategyHints,               // ← AI-learned improvements
      personalizationType,
    });

    // Generate resume variant (changes every 10 emails)
    let resumePdfPath = null, resumeDocxPath = null;
    try {
      const resumeVariantData = await generateResumeVariant(resume.parsed_text, user?.name || '', resumeVariant);
      resumePdfPath  = resumeVariantData.pdf_path;
      resumeDocxPath = resumeVariantData.docx_path;
    } catch (e) {
      logger.warn('Resume variant failed, using original', { error: e.message });
      resumePdfPath  = await generateResumePDF(resume.parsed_text, `fallback_${Date.now()}`).catch(() => null);
      resumeDocxPath = await generateDocxFromText(resume.parsed_text, `fallback_${Date.now()}`).catch(() => null);
    }

    // Generate cover letter variant
    let coverLetterPdfPath = null;
    try {
      const clVariant = await generateCoverLetterVariant(
        generated.cover_letter, user?.name || '', company_name, role, resumeVariant
      );
      coverLetterPdfPath = clVariant.pdf_path;
    } catch (e) {
      logger.warn('Cover letter variant failed', { error: e.message });
      coverLetterPdfPath = await generateCoverLetterPDF(generated.cover_letter, user?.name || '', company_name, role).catch(() => null);
    }

    const emailAppId = uuidv4();
    db.prepare(`
      INSERT INTO email_applications
        (id, user_id, company_name, role, recipient_email, subject, body, cover_letter, resume_path, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(emailAppId, req.user.id, company_name, role, recipient_email,
           generated.subject, generated.email_body, generated.cover_letter,
           resumePdfPath || resumeDocxPath);

    // Step 1: Record full email data for self-improvement tracking
    const emailPerfId = recordEmailSent({
      userId: req.user.id, emailAppId, companyName: company_name, role,
      recipientEmail: recipient_email, subject: generated.subject,
      emailBody: generated.email_body, coverLetter: generated.cover_letter,
      templateId: templateIndex, resumeVariant, coverLetterVariant: resumeVariant,
      personality: effectivePersonality, personalizationType,
    });
    trackSubjectSent(req.user.id, generated.subject);

    res.json({
      email_app_id: emailAppId,
      email_perf_id: emailPerfId,
      subject: generated.subject,
      email_body: generated.email_body,
      cover_letter: generated.cover_letter,
      suggested_roles: generated.suggested_roles || [],
      resume_pdf_path: resumePdfPath,
      resume_docx_path: resumeDocxPath,
      cover_letter_pdf_path: coverLetterPdfPath,
      template_used: templateIndex,
      resume_variant: resumeVariant,
      personalization_type: personalizationType,
      strategy_applied: !!strategy,
      attachments_ready: { resume_pdf: !!resumePdfPath, cover_letter_pdf: !!coverLetterPdfPath },
      rate_limit: rateCheck.quota,
      message: `Email generated (Template #${templateIndex + 1}, Variant #${resumeVariant + 1}${strategy ? ', Strategy Applied' : ''}). Review and send.`
    });

  } catch (err) {
    logger.error('Email generation error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email/:id/send — enforces spacing + records action
router.post('/:id/send', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const emailApp = db.prepare('SELECT * FROM email_applications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!emailApp) return res.status(404).json({ error: 'Email application not found.' });
    if (emailApp.status === 'sent') return res.status(409).json({ error: 'Already sent.' });

    // Check rate limit before send
    const rateCheck = checkRateLimit(req.user.id, 'email', { email_app_id: req.params.id });
    if (!rateCheck.allowed) {
      return res.json({
        queued: true,
        resetAt: rateCheck.quota?.next_reset_at,
        message: rateCheck.message,
      });
    }

    const result = await sendJobApplication({
      to: emailApp.recipient_email,
      subject: emailApp.subject,
      htmlBody: emailApp.body,
      resumePath: emailApp.resume_path,
      coverLetterPath: emailApp.cover_letter_pdf,
    });

    db.prepare('UPDATE email_applications SET status = ?, sent_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
      .run('sent', req.params.id, req.user.id);

    // Record rate limit + log for variation tracking
    recordAction(req.user.id, 'email');
    const templateIdx = req.body.template_index ?? 0;
    const resumeVar   = req.body.resume_variant ?? 0;
    logEmailSent(req.user.id, req.params.id, templateIdx, resumeVar, emailApp.subject);

    // Schedule next queued email with 30–90 min spacing
    const delay = scheduleNextEmailAfterDelay(req.user.id);
    const quota = rateCheck.quota;

    db.prepare('INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?,?,?,?,?,?)')
      .run(uuidv4(), req.user.id, 'email', 'sent',
        `Sent to ${emailApp.recipient_email} for ${emailApp.role} at ${emailApp.company_name} | Template #${templateIdx + 1}`,
        'success');

    // FIX 10: Notify user that the email was sent
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message)
      VALUES (?, ?, 'info', 'Email Sent', ?)
    `).run(
      require('uuid').v4(),
      req.user.id,
      `Cold email sent to ${emailApp.recipient_email} for "${emailApp.role}" at ${emailApp.company_name}.`
    );

    res.json({
      message: 'Email sent successfully!',
      message_id: result.messageId,
      rate_limit: { ...quota, used_now: quota.used + 1, remaining: Math.max(0, quota.remaining - 1) },
      next_email_delay_min: Math.round(delay / 60000),
    });

  } catch (err) {
    logger.error('Email send error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/email — list email applications with pagination
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const page   = Math.max(1, parseInt(req.query.page) || 1);
    const limit  = Math.min(50, parseInt(req.query.limit) || 20);
    const offset = (page - 1) * limit;

    const total = db.prepare('SELECT COUNT(*) as c FROM email_applications WHERE user_id = ?').get(req.user.id).c;
    const apps  = db.prepare('SELECT * FROM email_applications WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?')
                    .all(req.user.id, limit, offset);

    res.json({
      applications: apps,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/email/verify-config
router.get('/verify-config', authMiddleware, async (req, res) => {
  const result = await verifyEmailConfig();
  res.json(result);
});

// POST /api/email/outcome/:id — user marks email outcome (ACCEPTED/REJECTED/IGNORED)
router.post('/outcome/:id', authMiddleware, (req, res) => {
  try {
    const { outcome } = req.body;
    setEmailOutcome(req.user.id, req.params.id, outcome.toLowerCase());
    res.json({ message: 'Outcome saved. AI will use this to improve future emails.' });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// GET /api/email/pending-outcomes — emails awaiting user feedback (>3 days old)
router.get('/pending-outcomes', authMiddleware, (req, res) => {
  try {
    const pending = getPendingOutcomes(req.user.id);
    res.json({ pending, count: pending.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/email/analytics — full performance metrics + strategy
router.get('/analytics', authMiddleware, (req, res) => {
  try {
    const metrics = getPerformanceMetrics(req.user.id);
    res.json(metrics);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/email/analyze-now — manually trigger pattern analysis
router.post('/analyze-now', authMiddleware, async (req, res) => {
  try {
    const result = await runPatternAnalysis(req.user.id);
    if (!result) return res.status(400).json({ error: 'Need at least 5 emails with outcomes to analyze.' });
    res.json({ message: 'Analysis complete.', ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/email/:id
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { subject, body, cover_letter } = req.body;
    const db = getDb();
    db.prepare(`UPDATE email_applications SET subject = ?, body = ?, cover_letter = ? WHERE id = ? AND user_id = ? AND status = 'draft'`)
      .run(subject, body, cover_letter, req.params.id, req.user.id);
    res.json({ message: 'Email draft updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
