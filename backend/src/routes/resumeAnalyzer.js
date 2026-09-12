/**
 * Resume Analyzer Routes
 *
 * POST /api/resume-analyzer/get-questions
 * POST /api/resume-analyzer/analyze
 * POST /api/resume-analyzer/apply-changes
 * GET  /api/resume-analyzer/download/:filename
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const authMiddleware = require('../middleware/auth');
const { getDb } = require('../database/db');
const logger = require('../utils/logger');
const { generateText } = require('../services/geminiService');
const { generateTailoredResumePDF } = require('../services/pdfService');
const { generateTailoredResumeDocx } = require('../services/resumeService');
const { buildUserContext } = require('../utils/buildUserContext');
const { getResumeRules } = require('../utils/resumeRules');
const { getFormatPreservationRules } = require('../utils/formatRules');

const UPLOADS_DIR = process.env.UPLOADS_PATH || path.join(__dirname, '../../uploads');
const TAILORED_DIR = path.join(UPLOADS_DIR, 'tailored');

if (!fs.existsSync(TAILORED_DIR)) {
  fs.mkdirSync(TAILORED_DIR, { recursive: true });
}

// All routes require authentication
router.use(authMiddleware);

// Helper: fetch resume by id or active
function getResume(userId, resumeId) {
  const db = getDb();
  if (resumeId) {
    return db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(resumeId, userId);
  }
  return db.prepare('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').get(userId);
}

// Helper: fetch full user context
function getUserFullContext(userId, resume) {
  const db = getDb();
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  const projects = db.prepare('SELECT * FROM user_projects WHERE user_id = ? ORDER BY display_order').all(userId);
  const experience = db.prepare('SELECT * FROM user_experience WHERE user_id = ? ORDER BY display_order').all(userId);
  const certs = db.prepare('SELECT * FROM user_certifications WHERE user_id = ? ORDER BY display_order').all(userId);
  const achievements = db.prepare('SELECT * FROM user_achievements WHERE user_id = ? ORDER BY display_order').all(userId);
  const user = db.prepare('SELECT email, phone FROM users WHERE id = ?').get(userId);

  return {
    profile, projects, experience, certs, achievements,
    userContext: buildUserContext(resume, profile, projects, experience, certs, achievements, user)
  };
}

// ─── POST /get-questions ────────────────────────────────────────────────────
router.post('/get-questions', async (req, res) => {
  try {
    const { resume_id } = req.body;
    const resume = getResume(req.user.id, resume_id);

    if (!resume || !resume.parsed_text) {
      return res.status(400).json({ error: 'No resume found. Please upload a resume first.' });
    }

    const prompt = `You are a professional resume analyst about to analyze a candidate's resume.

RESUME:
${resume.parsed_text.substring(0, 2000)}

Before analyzing, you need to understand the candidate's goals. Generate 3-5 targeted questions that will help you give the most relevant analysis.

These questions should cover:
- What domain/industry they are targeting
- What type of role level (fresher/1-3yr/senior)
- What type of company (startup/MNC/product/service)
- Any specific job they are applying to (optional)
- Anything specific they want improved

Return ONLY valid JSON:
{
  "questions": [
    {
      "id": "q1",
      "question": "text",
      "type": "text|select|multiselect",
      "options": ["opt1","opt2"] or null
    }
  ]
}`;

    const raw = await generateText(prompt);
    let parsed = { questions: [] };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (pe) {
      logger.warn('Failed to parse resumeAnalyzer questions response', { raw });
    }

    return res.json({
      questions: parsed.questions || [],
      resume_id: resume.id
    });
  } catch (err) {
    logger.error('resumeAnalyzer get-questions error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /analyze ──────────────────────────────────────────────────────────
router.post('/analyze', async (req, res) => {
  try {
    const { resume_id, answers = {} } = req.body;
    const resume = getResume(req.user.id, resume_id);

    if (!resume || !resume.parsed_text) {
      return res.status(400).json({ error: 'No resume found. Please upload a resume first.' });
    }

    const { userContext } = getUserFullContext(req.user.id, resume);

    const prompt = `You are an expert resume analyst and career coach.

CANDIDATE FULL PROFILE:
${userContext}

RESUME TO ANALYZE:
${resume.parsed_text}

CANDIDATE'S GOALS AND CONTEXT:
${Object.entries(answers).map(([q, a]) => `${q}: ${a}`).join('\n')}

Perform a deep, honest analysis. Be specific and actionable. Reference actual content from their resume.

Return ONLY valid JSON (no markdown):
{
  "overall_score": 82,
  "verdict": "Good",
  "summary": "2-3 sentence overall assessment",
  "additions": [
    {
      "priority": "high",
      "section": "Skills",
      "suggestion": "Specific thing to add",
      "reason": "Why this would help",
      "example": "Example of what to add"
    }
  ],
  "subtractions": [
    {
      "priority": "medium",
      "section": "Education",
      "suggestion": "Specific thing to remove",
      "reason": "Why this hurts the resume"
    }
  ],
  "modifications": [
    {
      "priority": "high",
      "section": "Projects",
      "current": "What it currently says (brief)",
      "suggestion": "What to change it to",
      "reason": "Why this change helps"
    }
  ],
  "ats_score": 78,
  "ats_issues": ["specific ATS issue 1"],
  "strengths": ["strength 1", "strength 2"],
  "quick_wins": ["easy fix 1", "easy fix 2"]
}

Rules for verdict: "Excellent" | "Good" | "Needs Work" | "Major Issues".
If resume is excellent with no issues: additions: [], subtractions: [], modifications: [], verdict: "Excellent".
Be honest. Do not pad with fake suggestions.`;

    const raw = await generateText(prompt);
    let parsed;
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found');
      parsed = JSON.parse(match[0]);
    } catch (pe) {
      logger.error('Failed to parse resumeAnalyzer analysis', { raw, error: pe.message });
      return res.status(500).json({ error: 'AI returned an unreadable response. Please try again.' });
    }

    return res.json(parsed);
  } catch (err) {
    logger.error('resumeAnalyzer analyze error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /apply-changes ────────────────────────────────────────────────────
router.post('/apply-changes', async (req, res) => {
  try {
    const { resume_id, analysis = {}, answers = {} } = req.body;
    const resume = getResume(req.user.id, resume_id);

    if (!resume || !resume.parsed_text) {
      return res.status(400).json({ error: 'No resume found.' });
    }

    const { profile, userContext } = getUserFullContext(req.user.id, resume);
    const resumeRules = getResumeRules(profile);
    const formatRules = getFormatPreservationRules(resume.parsed_text);

    const additions = analysis.additions || [];
    const subtractions = analysis.subtractions || [];
    const modifications = analysis.modifications || [];

    const prompt = `You are rewriting a candidate's resume to apply specific improvements identified by an analysis.

CANDIDATE FULL PROFILE:
${userContext}

ORIGINAL RESUME:
${resume.parsed_text}

CHANGES TO APPLY:

ADDITIONS (add these):
${additions.length === 0 ? 'None' : additions.map(a => `- [${a.section}] ${a.suggestion} (${a.reason})`).join('\n')}

SUBTRACTIONS (remove these):
${subtractions.length === 0 ? 'None' : subtractions.map(s => `- [${s.section}] ${s.suggestion} (${s.reason})`).join('\n')}

MODIFICATIONS (change these):
${modifications.length === 0 ? 'None' : modifications.map(m => `- [${m.section}] Change: "${m.current}" → ${m.suggestion}`).join('\n')}

${resumeRules}

${formatRules}

CRITICAL RULES:
- Apply ALL the changes listed above
- Keep the SAME format as the original resume
- ONE PAGE ONLY — strict
- No fake data, no placeholders
- Skills section may be enhanced
- All other sections: real data only

Return ONLY the improved resume text.
Start directly with the candidate's name.`;

    logger.info('Resume Analyzer: rewriting resume with improvements', { userId: req.user.id });
    const improvedResumeText = await generateText(prompt);

    const [pdfPath, docxPath] = await Promise.all([
      generateTailoredResumePDF(improvedResumeText, req.user.id).catch(err => {
        logger.error('Resume Analyzer: PDF generation failed', { error: err.message });
        return null;
      }),
      generateTailoredResumeDocx(improvedResumeText, req.user.id).catch(err => {
        logger.error('Resume Analyzer: DOCX generation failed', { error: err.message });
        return null;
      }),
    ]);

    const pdfFilename = pdfPath ? path.basename(pdfPath) : null;
    const docxFilename = docxPath ? path.basename(docxPath) : null;

    return res.json({
      improved_resume_text: improvedResumeText,
      pdf_url: pdfFilename ? `/api/resume-analyzer/download/${encodeURIComponent(pdfFilename)}` : null,
      docx_url: docxFilename ? `/api/resume-analyzer/download/${encodeURIComponent(docxFilename)}` : null,
      changes_applied: {
        additions_count: additions.length,
        subtractions_count: subtractions.length,
        modifications_count: modifications.length,
      }
    });
  } catch (err) {
    logger.error('resumeAnalyzer apply-changes error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /download/:filename ────────────────────────────────────────────────
router.get('/download/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const filePath = path.join(TAILORED_DIR, filename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found.' });
    }

    return res.download(filePath, filename);
  } catch (err) {
    logger.error('resumeAnalyzer download error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
