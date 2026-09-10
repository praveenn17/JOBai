/**
 * Resume Tailor Routes
 *
 * POST /api/resume-tailor/tailor
 *   Body: { job_description: string, job_title?: string }
 *   Auth: required (uses the user's active resume)
 *   Returns: { tailored_text, pdf_url, docx_url }
 *
 * GET /api/resume-tailor/download/:filename
 *   Auth: required, ownership verified
 *   Returns: file stream (attachment)
 */

const express = require('express');
const path    = require('path');
const fs      = require('fs');
const router  = express.Router();

const authMiddleware = require('../middleware/auth');
const { getDb }      = require('../database/db');
const logger         = require('../utils/logger');
const { generateText } = require('../services/geminiService');
const { generateTailoredResumePDF }  = require('../services/pdfService');
const { generateTailoredResumeDocx } = require('../services/resumeService');

const UPLOADS_DIR  = process.env.UPLOADS_PATH || path.join(__dirname, '../../uploads');
const TAILORED_DIR = path.join(UPLOADS_DIR, 'tailored');

// All routes require authentication
router.use(authMiddleware);

// ─── POST /tailor ──────────────────────────────────────────────────────────────
router.post('/tailor', async (req, res) => {
  try {
    const { job_description, job_title = '' } = req.body;
    if (!job_description || !job_description.trim()) {
      return res.status(400).json({ error: 'job_description is required.' });
    }

    const db = getDb();

    // Fetch the user's active resume
    const resume = db.prepare(
      'SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 LIMIT 1'
    ).get(req.user.id);

    if (!resume || !resume.parsed_text) {
      return res.status(400).json({
        error: 'No active resume found. Please upload and activate a resume first.'
      });
    }

    const prompt = `You are an expert resume writer and ATS optimization specialist.

Your task is to tailor the following resume to best match the provided job description.

RESUME:
${resume.parsed_text}

JOB TITLE: ${job_title}

JOB DESCRIPTION:
${job_description}

INSTRUCTIONS:
1. Rewrite the resume to highlight experience and skills that are most relevant to this specific job.
2. Incorporate important keywords from the job description naturally throughout the resume.
3. Keep all factual information accurate — do NOT fabricate experience or skills.
4. Maintain a clean, professional format using plain text.
5. Use section headers in ALL CAPS (e.g. EXPERIENCE, EDUCATION, SKILLS).
6. Keep the resume concise — aim for 1 page worth of content.
7. Start with the candidate's name on the first line, then contact info, then sections.
8. Use bullet points starting with • for experience items.

Return ONLY the rewritten resume text. No commentary, no markdown formatting, no code blocks.`;

    logger.info('Resume Tailor: generating tailored resume via Gemini', { userId: req.user.id });
    const tailoredText = await generateText(prompt);

    // Generate PDF and DOCX in parallel
    const [pdfPath, docxPath] = await Promise.all([
      generateTailoredResumePDF(tailoredText, req.user.id).catch(err => {
        logger.error('Resume Tailor: PDF generation failed', { error: err.message });
        return null;
      }),
      generateTailoredResumeDocx(tailoredText, req.user.id).catch(err => {
        logger.error('Resume Tailor: DOCX generation failed', { error: err.message });
        return null;
      }),
    ]);

    const pdfFilename  = pdfPath  ? path.basename(pdfPath)  : null;
    const docxFilename = docxPath ? path.basename(docxPath) : null;

    return res.json({
      tailored_text: tailoredText,
      pdf_url:  pdfFilename  ? `/api/resume-tailor/download/${encodeURIComponent(pdfFilename)}`  : null,
      docx_url: docxFilename ? `/api/resume-tailor/download/${encodeURIComponent(docxFilename)}` : null,
    });
  } catch (err) {
    logger.error('Resume Tailor: tailor failed', { error: err.message, stack: err.stack });
    if (err.message && err.message.includes('GEMINI_API_KEY')) {
      return res.status(503).json({ error: 'Gemini AI is not configured. Set GEMINI_API_KEY in .env.' });
    }
    return res.status(500).json({ error: err.message || 'Failed to tailor resume.' });
  }
});

// ─── GET /download/:filename ───────────────────────────────────────────────────
router.get('/download/:filename', (req, res) => {
  try {
    const filename = decodeURIComponent(req.params.filename);

    // Prevent path traversal
    if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
      return res.status(400).json({ error: 'Invalid filename.' });
    }

    const filePath = path.join(TAILORED_DIR, filename);

    // Verify the file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found.' });
    }

    // Ownership check: filename must contain the user's (sanitised) id
    const safeUserId = String(req.user.id).replace(/[^a-z0-9]/gi, '_');
    if (!filename.includes(safeUserId)) {
      logger.warn('Resume Tailor: unauthorized file access', { userId: req.user.id, filename });
      return res.status(403).json({ error: 'Access denied.' });
    }

    res.download(filePath, filename);
  } catch (err) {
    logger.error('Resume Tailor: download failed', { error: err.message });
    return res.status(500).json({ error: 'Failed to download file.' });
  }
});

module.exports = router;
