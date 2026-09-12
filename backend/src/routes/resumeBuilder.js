/**
 * General Resume Builder Routes
 *
 * POST /api/resume-builder/check-questions
 * POST /api/resume-builder/build
 * GET  /api/resume-builder/download/:filename
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

// ─── POST /check-questions ──────────────────────────────────────────────────
router.post('/check-questions', async (req, res) => {
  try {
    const { target_role, target_domain } = req.body;
    const db = getDb();

    const resume = db.prepare(
      'SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1'
    ).get(req.user.id);

    const { userContext } = getUserFullContext(req.user.id, resume);

    const prompt = `You are about to build a professional resume for this candidate.

CANDIDATE PROFILE:
${userContext}

TARGET ROLE: ${target_role || 'General / Not specified'}
TARGET DOMAIN: ${target_domain || 'Not specified'}

Review the profile. Identify up to 3 pieces of information that are MISSING and would significantly improve the resume. Only ask about things genuinely not covered in the profile.

Return ONLY valid JSON:
{
  "questions": [
    {
      "id": "q1",
      "question": "text",
      "why": "brief reason this matters",
      "type": "text|select|multiselect|number",
      "options": ["opt1","opt2"] or null,
      "required": true/false
    }
  ]
}
Maximum 3 questions. Return empty array if nothing needed.`;

    const raw = await generateText(prompt);
    let parsed = { questions: [] };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (pe) {
      logger.warn('Failed to parse resumeBuilder check-questions response', { raw });
    }

    return res.json({ questions: parsed.questions || [] });
  } catch (err) {
    logger.error('resumeBuilder check-questions error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /build ─────────────────────────────────────────────────────────────
router.post('/build', async (req, res) => {
  try {
    const { target_role, target_domain, answers = {}, template_style = 'classic' } = req.body;
    const db = getDb();

    const resume = db.prepare(
      'SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1'
    ).get(req.user.id);

    const { profile, userContext } = getUserFullContext(req.user.id, resume);
    const resumeRules = getResumeRules(profile);
    const formatRules = getFormatPreservationRules(resume?.parsed_text);

    const prompt = `You are building a professional resume for a job candidate. This must be a REAL resume with REAL information only.

${userContext}

ADDITIONAL ANSWERS FROM USER:
${Object.entries(answers || {}).map(([q, a]) => `${q}: ${a}`).join('\n')}

TARGET ROLE: ${target_role || 'Software Engineer'}
TARGET DOMAIN: ${target_domain || 'Technology'}

${resumeRules}

${formatRules}

TEMPLATE: Classic single-column professional resume.

SECTION ORDER (follow exactly):
1. HEADER (Name, Email, Phone, Location, LinkedIn, GitHub)
2. PROFESSIONAL SUMMARY (3-4 lines, tailored to target role)
3. TECHNICAL SKILLS (enhanced for domain — this section may include relevant skills for the role even if not explicitly listed by user)
4. EDUCATION (follow CGPA/% inclusion rules above)
5. WORK EXPERIENCE / INTERNSHIPS (if any)
6. PROJECTS (most relevant to target role first)
7. CERTIFICATIONS (if any)
8. ACHIEVEMENTS (if any)
9. SOFT SKILLS

STRICT RULES:
- ONE PAGE ONLY — non-negotiable
- No fake data, no placeholder text
- Every fact must come from the profile above
- Skills section may be enhanced for the target role
- Format: plain text, ready for PDF conversion

Return ONLY the resume text. No JSON, no explanation.
Start directly with the candidate's name.`;

    logger.info('Resume Builder: generating resume via Gemini', { userId: req.user.id });
    const resumeText = await generateText(prompt);

    const [pdfPath, docxPath] = await Promise.all([
      generateTailoredResumePDF(resumeText, req.user.id).catch(err => {
        logger.error('Resume Builder: PDF generation failed', { error: err.message });
        return null;
      }),
      generateTailoredResumeDocx(resumeText, req.user.id).catch(err => {
        logger.error('Resume Builder: DOCX generation failed', { error: err.message });
        return null;
      }),
    ]);

    const pdfFilename = pdfPath ? path.basename(pdfPath) : null;
    const docxFilename = docxPath ? path.basename(docxPath) : null;

    return res.json({
      resume_text: resumeText,
      pdf_url: pdfFilename ? `/api/resume-builder/download/${encodeURIComponent(pdfFilename)}` : null,
      docx_url: docxFilename ? `/api/resume-builder/download/${encodeURIComponent(docxFilename)}` : null,
    });
  } catch (err) {
    logger.error('Resume Builder build error', { error: err.message });
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
    logger.error('Resume Builder download error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
