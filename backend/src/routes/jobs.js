const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const authMiddleware = require('../middleware/auth');
const { matchJobToResume, tailorResume, discoverJobs } = require('../services/aiService');
const { generateDocxFromText } = require('../services/resumeService');
const { validateJobsArray } = require('../utils/validate');
const logger = require('../utils/logger');

const router = express.Router();

// Helper: get active resume for user
function getActiveResume(userId) {
  const db = getDb();
  return db.prepare('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').get(userId);
}

// Helper: get AI-recommended match threshold from learning system (default 50 per spec)
function getMatchThreshold(userId) {
  const db = getDb();
  const insights = db.prepare('SELECT recommended_min_score FROM learning_insights WHERE user_id = ?').get(userId);
  const score = insights?.recommended_min_score;
  // Clamp between 40 and 90 for safety — default 50 per spec
  if (score && score >= 40 && score <= 90) return score;
  return 50;
}

// POST /api/jobs/analyze - analyze up to 10 jobs against resume
router.post('/analyze', authMiddleware, async (req, res) => {
  try {
    const { jobs } = req.body; // [{ title, description, apply_url, company }]

    if (!jobs || !Array.isArray(jobs) || jobs.length === 0) {
      return res.status(400).json({ error: 'Provide an array of jobs to analyze.' });
    }
    if (jobs.length > 10) {
      return res.status(400).json({ error: 'Maximum 10 jobs per request.' });
    }

    // Validate input
    const { valid, errors } = validateJobsArray(jobs);
    if (!valid) {
      return res.status(400).json({ error: errors.join('; ') });
    }

    const resume = getActiveResume(req.user.id);
    if (!resume || !resume.parsed_text) {
      return res.status(400).json({ error: 'No active parsed resume found. Please upload your resume first.' });
    }

    // Fix 2: Use learning-system recommended threshold (evolves with feedback)
    const threshold = getMatchThreshold(req.user.id);
    const db = getDb();
    const results = [];

    for (const job of jobs) {
      const { title, description, apply_url, company } = job;

      if (!description) {
        results.push({ title, apply_url, error: 'No job description provided', status: 'skipped' });
        continue;
      }

      // Check if already applied
      const alreadyApplied = db.prepare(`
        SELECT a.id FROM applications a
        JOIN jobs j ON a.job_id = j.id
        WHERE j.apply_url = ? AND a.user_id = ? AND a.status = 'applied'
      `).get(apply_url, req.user.id);

      if (alreadyApplied) {
        results.push({ title, apply_url, status: 'skipped', reason: 'Already applied to this job.' });
        continue;
      }

      // Check rejected list
      const rejected = db.prepare('SELECT id FROM rejected_jobs WHERE user_id = ? AND apply_url = ?').get(req.user.id, apply_url);
      if (rejected) {
        results.push({ title, apply_url, status: 'skipped', reason: 'Job previously rejected by user.' });
        continue;
      }

      try {
        // Run AI match
        const matchResult = await matchJobToResume(resume.parsed_text, description, title);

        // Save/update job in DB — store recommendation field
        const existingJob = db.prepare('SELECT id FROM jobs WHERE apply_url = ? AND user_id = ?').get(apply_url, req.user.id);
        let jobId;
        const recommendation = matchResult.recommendation || (matchResult.match_score >= threshold ? 'AUTO_APPLY' : 'ASK_USER');

        if (existingJob) {
          jobId = existingJob.id;
          db.prepare(`
            UPDATE jobs SET title = ?, company = ?, description = ?, match_score = ?,
              skills_matched = ?, missing_requirements = ?, should_apply = ?, match_reason = ?, status = 'analyzed'
            WHERE id = ? AND user_id = ?
          `).run(
            title, company, description, matchResult.match_score,
            JSON.stringify(matchResult.skills_match),
            JSON.stringify(matchResult.missing_requirements),
            recommendation === 'AUTO_APPLY' ? 1 : 0,
            matchResult.reason, jobId, req.user.id
          );
        } else {
          jobId = uuidv4();
          db.prepare(`
            INSERT INTO jobs (id, user_id, title, company, description, apply_url, match_score,
              skills_matched, missing_requirements, should_apply, match_reason, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'analyzed')
          `).run(
            jobId, req.user.id, title, company || 'Unknown', description,
            apply_url, matchResult.match_score,
            JSON.stringify(matchResult.skills_match),
            JSON.stringify(matchResult.missing_requirements),
            recommendation === 'AUTO_APPLY' ? 1 : 0,
            matchResult.reason
          );
        }

        results.push({
          job_id: jobId,
          title,
          company,
          apply_url,
          match_score: matchResult.match_score,
          recommendation,                          // AUTO_APPLY | ASK_USER
          should_apply: recommendation === 'AUTO_APPLY',
          reason: matchResult.reason,
          skills_match: matchResult.skills_match,
          missing_requirements: matchResult.missing_requirements,
          experience_match: matchResult.experience_match,
          strengths: matchResult.strengths,
          threshold_used: threshold,
          // status drives UI: auto_apply (≥50), ask_user (<50), skipped, error
          status: recommendation === 'AUTO_APPLY' ? 'auto_apply' : 'ask_user'
        });

      } catch (matchErr) {
        logger.error('Match error for job', { title, error: matchErr.message });
        results.push({ title, apply_url, status: 'error', reason: matchErr.message });
      }
    }

    // Log
    const successCount = results.filter(r => r.status === 'ready_to_apply').length;
    db.prepare('INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), req.user.id, 'matching', 'analyze_jobs', `Analyzed ${jobs.length} jobs. ${successCount} ready to apply.`, 'success');

    // FIX 10: Notify user about analysis results
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message)
      VALUES (?, ?, 'info', ?, ?)
    `).run(
      require('uuid').v4(),
      req.user.id,
      'Jobs Analyzed',
      `${results.filter(r => r.status !== 'error').length} job(s) analyzed. ` +
      `${results.filter(r => r.should_apply).length} recommended.`
    );

    res.json({ results, summary: { total: jobs.length, ready: successCount, skipped: results.filter(r => r.status === 'skipped').length } });

  } catch (err) {
    logger.error('Job analysis error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/:id/tailor - tailor resume for a specific job
router.post('/:id/tailor', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    const resume = getActiveResume(req.user.id);
    if (!resume || !resume.parsed_text) {
      return res.status(400).json({ error: 'No active resume with parsed text found.' });
    }

    const userConfirmed = req.body?.user_confirmed === true;
    if (job.match_score < 50 && !userConfirmed) {
      return res.status(400).json({
        error: `Match score (${job.match_score}%) is below 50%. Pass user_confirmed: true to proceed.`,
        requires_confirmation: true, match_score: job.match_score
      });
    }

    const tailoredText = await tailorResume(resume.parsed_text, job.description, job.title);
    const docxPath = await generateDocxFromText(tailoredText, `tailored_${job.title.replace(/[^a-z0-9]/gi, '_')}`);

    db.prepare('INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), req.user.id, 'resume', 'tailor', `Tailored for: ${job.title}`, 'success');

    res.json({
      message: 'Resume tailored successfully.',
      tailored_text: tailoredText,
      docx_path: docxPath,
      job_title: job.title
    });
  } catch (err) {
    logger.error('Tailoring error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs - list all jobs
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { status, min_score } = req.query;

    let query = 'SELECT * FROM jobs WHERE user_id = ?';
    const params = [req.user.id];

    if (status) { query += ' AND status = ?'; params.push(status); }
    if (min_score) { query += ' AND match_score >= ?'; params.push(parseInt(min_score)); }

    query += ' ORDER BY match_score DESC, discovered_at DESC';

    const jobs = db.prepare(query).all(...params);
    res.json({ jobs: jobs.map(j => ({ ...j, skills_matched: JSON.parse(j.skills_matched || '{}'), missing_requirements: JSON.parse(j.missing_requirements || '[]') })) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/jobs/:id/reject
router.post('/:id/reject', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const job = db.prepare('SELECT * FROM jobs WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    db.prepare(`
      INSERT OR IGNORE INTO rejected_jobs (id, user_id, apply_url, job_title)
      VALUES (?, ?, ?, ?)
    `).run(uuidv4(), req.user.id, job.apply_url, job.title);

    db.prepare('UPDATE jobs SET status = ? WHERE id = ? AND user_id = ?').run('rejected', job.id, req.user.id);
    res.json({ message: 'Job rejected. It will not appear in future suggestions.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/discover - AI job discovery based on preferences
router.post('/discover', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const resume = getActiveResume(req.user.id);
    if (!resume || !resume.parsed_text) {
      return res.status(400).json({ error: 'Upload your resume first.' });
    }

    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
    const result = await discoverJobs(resume.parsed_text, prefs || {});

    // Store recommended roles as discovered job cards
    const stored = [];
    for (const role of (result.recommended_roles || [])) {
      const djId = uuidv4();
      try {
        db.prepare(`
          INSERT OR IGNORE INTO discovered_jobs
            (id, user_id, title, company, description, match_estimate, reason, source, status)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'ai_discovery', 'pending')
        `).run(djId, req.user.id, role.title, 'Various Companies',
               `Keywords: ${(role.keywords_to_use || []).join(', ')}`,
               role.match_estimate || 80, role.reason);
        stored.push({ id: djId, ...role });
      } catch {}
    }

    db.prepare('INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?, ?, ?, ?, ?, ?)')
      .run(uuidv4(), req.user.id, 'discovery', 'discover_jobs',
           `AI discovery: ${stored.length} roles stored`, 'success');

    const discovered = stored;
    res.json({
      ...result,
      stored_count: stored.length,
      discovered,
      message: `${discovered.length} job leads generated.`,
      disclaimer: 'These are AI-generated suggestions based on your profile, not live job board listings. Verify each opportunity before applying.',
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/jobs/discovered - get pending discovered job cards (Feature 2 feed)
router.get('/discovered', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const { status = 'pending' } = req.query;
    const jobs = db.prepare(
      'SELECT * FROM discovered_jobs WHERE user_id = ? AND status = ? ORDER BY discovered_at DESC'
    ).all(req.user.id, status);
    const pendingCount = db.prepare(
      "SELECT COUNT(*) as count FROM discovered_jobs WHERE user_id = ? AND status = 'pending'"
    ).get(req.user.id).count;
    res.json({ jobs, pending_count: pendingCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/jobs/discovered/:id/action - apply or reject a discovered job
router.post('/discovered/:id/action', authMiddleware, async (req, res) => {
  try {
    const { action, description, apply_url } = req.body; // action: 'apply' | 'reject'
    const db = getDb();

    const dj = db.prepare('SELECT * FROM discovered_jobs WHERE id = ? AND user_id = ?')
      .get(req.params.id, req.user.id);
    if (!dj) return res.status(404).json({ error: 'Discovered job not found.' });

    if (action === 'reject') {
      db.prepare("UPDATE discovered_jobs SET status = 'rejected', actioned_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .run(dj.id, req.user.id);
      if (apply_url || dj.apply_url) {
        db.prepare('INSERT OR IGNORE INTO rejected_jobs (id, user_id, apply_url, job_title) VALUES (?,?,?,?)')
          .run(uuidv4(), req.user.id, apply_url || dj.apply_url, dj.title);
      }
      return res.json({ message: 'Job rejected. Will not appear again.' });
    }

    if (action === 'apply') {
      // Save as a job to analyze
      const jobId = uuidv4();
      const jobDesc = description || dj.description || dj.title;
      const jobUrl = apply_url || dj.apply_url || '';

      db.prepare(`
        INSERT OR IGNORE INTO jobs (id, user_id, title, company, description, apply_url, source, status)
        VALUES (?, ?, ?, ?, ?, ?, 'discovery', 'pending')
      `).run(jobId, req.user.id, dj.title, dj.company || 'Various', jobDesc, jobUrl);

      db.prepare("UPDATE discovered_jobs SET status = 'applied', actioned_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .run(dj.id, req.user.id);

      return res.json({ message: 'Job added to matcher. Go to Job Matcher to analyze and apply.', job_id: jobId });
    }

    res.status(400).json({ error: "action must be 'apply' or 'reject'" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
