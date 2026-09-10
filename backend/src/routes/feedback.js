const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const authMiddleware = require('../middleware/auth');
const { analyzeFeedbackAndLearn } = require('../services/aiService');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/feedback — submit outcome for an application
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { application_id, outcome, feedback_notes } = req.body;

    if (!application_id || !outcome) {
      return res.status(400).json({ error: 'application_id and outcome are required.' });
    }
    const validOutcomes = ['interview', 'rejected', 'no_response'];
    if (!validOutcomes.includes(outcome)) {
      return res.status(400).json({ error: `outcome must be: ${validOutcomes.join(', ')}` });
    }

    const db = getDb();
    const app = db.prepare(`
      SELECT a.*, j.title as job_title, j.company, j.match_score,
             r.original_name as resume_name, r.id as resume_id
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      LEFT JOIN resumes r ON a.resume_id = r.id
      WHERE a.id = ? AND a.user_id = ?
    `).get(application_id, req.user.id);

    if (!app) return res.status(404).json({ error: 'Application not found.' });

    const existing = db.prepare('SELECT id FROM application_feedback WHERE application_id = ? AND user_id = ?')
      .get(application_id, req.user.id);

    // Build meaningful resume_version string
    const resumeVersion = app.resume_name
      ? `${app.resume_name} (tailored for ${app.job_title})`
      : app.tailored_resume_path || 'Unknown';

    if (existing) {
      db.prepare(`UPDATE application_feedback SET outcome = ?, feedback_notes = ?, submitted_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?`)
        .run(outcome, feedback_notes || null, existing.id, req.user.id);
    } else {
      db.prepare(`
        INSERT INTO application_feedback
          (id, user_id, application_id, job_title, company, match_score, outcome, feedback_notes, resume_version, answers_used)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        uuidv4(), req.user.id, application_id,
        app.job_title, app.company, app.match_score,
        outcome, feedback_notes || null,
        resumeVersion,
        app.answers_generated || null   // Step 9: actual generated answers stored here
      );
    }

    // Update application status to reflect outcome
    const statusMap = { interview: 'interview', rejected: 'rejected', no_response: 'no_response' };
    db.prepare('UPDATE applications SET status = ? WHERE id = ? AND user_id = ?').run(statusMap[outcome], application_id, req.user.id);

    db.prepare('INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?,?,?,?,?,?)')
      .run(uuidv4(), req.user.id, 'feedback', 'submitted',
        `${app.job_title} @ ${app.company} → ${outcome}`, 'success');

    logger.info('Feedback submitted', { userId: req.user.id, outcome, appId: application_id });
    res.json({ message: 'Feedback saved. Thank you!' });
  } catch (err) {
    logger.error('Feedback error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/feedback — list all feedback
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const feedback = db.prepare(
      'SELECT * FROM application_feedback WHERE user_id = ? ORDER BY submitted_at DESC'
    ).all(req.user.id);

    const stats = {
      total: feedback.length,
      interview: feedback.filter(f => f.outcome === 'interview').length,
      rejected: feedback.filter(f => f.outcome === 'rejected').length,
      no_response: feedback.filter(f => f.outcome === 'no_response').length,
    };
    stats.success_rate = stats.total > 0
      ? Math.round((stats.interview / stats.total) * 100) : 0;

    res.json({ feedback, stats });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/feedback/pending — applications older than 7 days without feedback
router.get('/pending', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const pending = db.prepare(`
      SELECT a.id, a.applied_at, a.status, j.title as job_title, j.company, j.match_score, j.apply_url
      FROM applications a
      JOIN jobs j ON a.job_id = j.id
      LEFT JOIN application_feedback af ON af.application_id = a.id
      WHERE a.user_id = ?
        AND a.status = 'applied'
        AND af.id IS NULL
        AND a.applied_at <= datetime('now', '-7 days')
      ORDER BY a.applied_at ASC
    `).all(req.user.id);

    res.json({ pending, count: pending.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/feedback/analyze — run learning system on feedback history
router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    const db = getDb();

    const feedbackHistory = db.prepare(
      'SELECT * FROM application_feedback WHERE user_id = ? ORDER BY submitted_at DESC LIMIT 30'
    ).all(req.user.id);

    if (feedbackHistory.length < 2) {
      return res.status(400).json({
        error: 'Need at least 2 feedback entries to generate learning insights. Submit feedback on more applications first.'
      });
    }

    const resume = db.prepare(
      'SELECT parsed_text FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
    ).get(req.user.id);

    const insights = await analyzeFeedbackAndLearn(feedbackHistory, resume?.parsed_text || '');
    if (!insights) return res.status(500).json({ error: 'Learning analysis failed.' });

    // Store/update insights
    const existing = db.prepare('SELECT id FROM learning_insights WHERE user_id = ?').get(req.user.id);
    if (existing) {
      db.prepare(`
        UPDATE learning_insights SET
          success_rate=?, top_performing_roles=?, weak_areas=?,
          resume_improvements=?, answer_strategy_improvements=?,
          recommended_min_score=?, success_probability_factors=?,
          summary=?, last_analyzed=CURRENT_TIMESTAMP
        WHERE user_id=?
      `).run(
        insights.success_rate,
        JSON.stringify(insights.top_performing_roles),
        JSON.stringify(insights.weak_areas),
        JSON.stringify(insights.resume_improvements),
        JSON.stringify(insights.answer_strategy_improvements),
        insights.recommended_min_score,
        JSON.stringify(insights.success_probability_factors),
        insights.summary,
        req.user.id
      );
    } else {
      db.prepare(`
        INSERT INTO learning_insights
          (id,user_id,success_rate,top_performing_roles,weak_areas,resume_improvements,
           answer_strategy_improvements,recommended_min_score,success_probability_factors,summary)
        VALUES (?,?,?,?,?,?,?,?,?,?)
      `).run(
        uuidv4(), req.user.id, insights.success_rate,
        JSON.stringify(insights.top_performing_roles),
        JSON.stringify(insights.weak_areas),
        JSON.stringify(insights.resume_improvements),
        JSON.stringify(insights.answer_strategy_improvements),
        insights.recommended_min_score,
        JSON.stringify(insights.success_probability_factors),
        insights.summary
      );
    }

    logger.info('Learning analysis complete', { userId: req.user.id });
    res.json({ insights });
  } catch (err) {
    logger.error('Analyze error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/feedback/insights — get stored learning insights
router.get('/insights', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const raw = db.prepare('SELECT * FROM learning_insights WHERE user_id = ?').get(req.user.id);
    if (!raw) return res.json({ insights: null });

    const insights = {
      ...raw,
      top_performing_roles: JSON.parse(raw.top_performing_roles || '[]'),
      weak_areas: JSON.parse(raw.weak_areas || '[]'),
      resume_improvements: JSON.parse(raw.resume_improvements || '[]'),
      answer_strategy_improvements: JSON.parse(raw.answer_strategy_improvements || '[]'),
      success_probability_factors: JSON.parse(raw.success_probability_factors || '[]'),
    };
    res.json({ insights });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
