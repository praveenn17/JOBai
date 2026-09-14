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
    const { target_role = 'Software Engineer', target_domain = 'Technology', answers = {}, template_style = 'classic' } = req.body;

    const { profile, userContext } = getUserFullContext(req.user.id);
    const resumeRules = getResumeRules(profile);

    const prompt = `You are building a one-page professional
resume for a job candidate using ONLY real information
from their profile. Follow the template and rules exactly.

CANDIDATE FULL PROFILE:
${userContext}

ADDITIONAL ANSWERS FROM USER:
${Object.entries(answers || {}).map(([q, a]) => `${q}: ${a}`).join('\n')}

TARGET ROLE: ${target_role || 'Software Engineer'}
TARGET DOMAIN: ${target_domain || 'Technology'}

${resumeRules}

FIXED TEMPLATE — FOLLOW THIS EXACTLY FOR ALL USERS:

LAYOUT RULES:
- Single column only. No tables. No text boxes.
- Bullet character: ▸ (use this exact character)
- Section headings: ALL CAPS
- Skill separators: • (bullet dot)
- Contact line separator: |
- ONE PAGE STRICT — non-negotiable

SECTION ORDER (include only sections with real data,
skip empty sections entirely — no blank headings):

[CANDIDATE FULL NAME]
[email] | [phone] | [LinkedIn URL] | [GitHub URL] | [Portfolio URL]
(only include contact items that exist in profile)

CAREER OBJECTIVE
3-4 lines tailored to ${target_role}. Mention graduation
year/batch if student. Highlight top 2-3 skills. Show
what value candidate brings. Never use clichés like
"passionate" or "hardworking".

EDUCATION
[Degree] – [Branch]  [Batch/Graduation Year] ([Semester] if current)
[University Name], [City]
(Apply CGPA/% rules — only show if strong per rules above)

INTERNSHIP EXPERIENCE
(skip entirely if no internships or work experience)
[Role] | [Company], [Location]  [Start] – [End]
▸ [achievement with metric if possible]
▸ [technical implementation detail]

KEY PROJECTS
(skip if no projects, include top 2-3 relevant to role)
[Project Name] | [Live Demo if exists] | [GitHub if exists] | [Tech1, Tech2, Tech3]
▸ [what was built + impact]
▸ [technical details]

TECHNICAL SKILLS
(group by category, only categories with content)
Languages: [skill1] • [skill2] • [skill3]
[Category]: [skill1] • [skill2]
(May enhance with relevant skills for ${target_role})

SOFT SKILLS
▸ [Skill1] • [Skill2] • [Skill3] • [Skill4] • [Skill5]

ACHIEVEMENTS & ACTIVITIES
(skip if none)
▸ [achievement or activity]
▸ [achievement or activity]

CERTIFICATIONS
(skip if none)
▸ [Cert Name] — [Issuing Org] ([ID if available])

LANGUAGES
(skip if not in profile)
▸ [Language] ([Proficiency]) • [Language] ([Proficiency])

ABSOLUTE RULES:
1. ONE PAGE — if content overflows, shorten bullets to
   1 line each, abbreviate descriptions, cut least
   relevant content. Never go to page 2.
2. NO fake data — every fact from profile only.
   Exception: TECHNICAL SKILLS and SOFT SKILLS may be
   enhanced for the target role.
3. NO placeholder text like [Add here] or [Your Name].
   Start directly with the actual candidate name.
4. NO section heading if that section has no content.
5. Use ▸ for ALL bullet points.
6. Use • to separate skills and languages.
7. Use | to separate contact details.
8. Career Objective must specifically mention
   "${target_role}" role.

Return ONLY the resume text.
Start with the candidate's full name on the first line.
No JSON. No explanation. No preamble.`;

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
