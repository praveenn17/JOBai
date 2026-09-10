const express = require('express');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');
const { getDb } = require('../database/db');
const authMiddleware = require('../middleware/auth');
const upload = require('../middleware/upload');
const { parseResumeFile } = require('../services/resumeService');
const logger = require('../utils/logger');

const router = express.Router();

// POST /api/resume/upload
router.post('/upload', authMiddleware, upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const { path: filePath, originalname, mimetype, filename } = req.file;
    const ext = path.extname(originalname).toLowerCase();

    // Parse file to text
    let parsedText = '';
    try {
      parsedText = await parseResumeFile(filePath);
    } catch (parseErr) {
      logger.warn('Could not parse resume text', { error: parseErr.message });
      parsedText = ''; // Store file even if parsing fails
    }

    const db = getDb();
    const resumeId = uuidv4();

    // Deactivate previous active resumes
    db.prepare('UPDATE resumes SET is_active = 0 WHERE user_id = ?').run(req.user.id);

    db.prepare(`
      INSERT INTO resumes (id, user_id, filename, original_name, file_path, file_type, parsed_text, is_active)
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
    `).run(resumeId, req.user.id, filename, originalname, filePath, ext.replace('.', ''), parsedText);

    // Log
    db.prepare(`INSERT INTO logs (id, user_id, type, action, details, status) VALUES (?, ?, ?, ?, ?, ?)`)
      .run(uuidv4(), req.user.id, 'resume', 'upload', `Uploaded: ${originalname}`, 'success');

    // FIX 10: Notify user about successful upload
    db.prepare(`
      INSERT INTO notifications (id, user_id, type, title, message)
      VALUES (?, ?, 'info', 'Resume Uploaded', ?)
    `).run(
      require('uuid').v4(),
      req.user.id,
      `"${originalname}" uploaded and parsed successfully.`
    );

    logger.info('Resume uploaded', { resumeId, userId: req.user.id, file: originalname });

    res.status(201).json({
      message: 'Resume uploaded and parsed successfully.',
      resume: {
        id: resumeId,
        original_name: originalname,
        file_type: ext.replace('.', ''),
        parsed: parsedText.length > 0,
        preview: parsedText.substring(0, 300) + (parsedText.length > 300 ? '...' : '')
      }
    });
  } catch (err) {
    logger.error('Resume upload error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resume - list all resumes for user
router.get('/', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const resumes = db.prepare(`
      SELECT id, original_name, file_type, is_active, created_at,
        CASE WHEN parsed_text IS NOT NULL AND length(parsed_text) > 0 THEN 1 ELSE 0 END as is_parsed
      FROM resumes WHERE user_id = ? ORDER BY created_at DESC
    `).all(req.user.id);

    res.json({ resumes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resume/:id - get resume details
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const resume = db.prepare(`
      SELECT id, original_name, file_type, is_active, parsed_text, created_at
      FROM resumes WHERE id = ? AND user_id = ?
    `).get(req.params.id, req.user.id);

    if (!resume) return res.status(404).json({ error: 'Resume not found.' });
    res.json({ resume });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/resume/:id
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });

    // FIX 5: Capture active flag, delete file, delete record, then promote next if needed
    const wasActive = resume.is_active === 1;
    if (fs.existsSync(resume.file_path)) {
      fs.unlinkSync(resume.file_path);
    }
    db.prepare('DELETE FROM resumes WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (wasActive) {
      const next = db.prepare(
        'SELECT id FROM resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1'
      ).get(req.user.id);
      if (next) {
        db.prepare('UPDATE resumes SET is_active = 1 WHERE id = ? AND user_id = ?').run(next.id, req.user.id);
      }
    }
    res.json({ message: 'Resume deleted.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/resume/:id/activate
router.put('/:id/activate', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    // FIX 4: Wrap both updates in a transaction to prevent all-deactivated state
    const activate = db.transaction(() => {
      db.prepare('UPDATE resumes SET is_active = 0 WHERE user_id = ?')
        .run(req.user.id);
      const result = db.prepare(
        'UPDATE resumes SET is_active = 1 WHERE id = ? AND user_id = ?'
      ).run(req.params.id, req.user.id);
      if (result.changes === 0) throw new Error('Resume not found.');
    });
    try {
      activate();
    } catch (err) {
      return res.status(404).json({ error: err.message });
    }
    res.json({ message: 'Resume set as active.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resume/:id/download
router.get('/:id/download', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });
    if (!fs.existsSync(resume.file_path)) return res.status(404).json({ error: 'File not found on server.' });

    res.download(resume.file_path, resume.original_name);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/resume/:id/view - authenticated stream/view of resume file
router.get('/:id/view', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const resume = db.prepare('SELECT * FROM resumes WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!resume) return res.status(404).json({ error: 'Resume not found.' });
    if (!fs.existsSync(resume.file_path)) return res.status(404).json({ error: 'File not found on server.' });

    const mimeTypes = {
      pdf: 'application/pdf',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      doc: 'application/msword',
      txt: 'text/plain'
    };
    const ext = (resume.file_type || path.extname(resume.original_name).replace('.', '')).toLowerCase();
    if (mimeTypes[ext]) {
      res.setHeader('Content-Type', mimeTypes[ext]);
    }
    res.sendFile(path.resolve(resume.file_path));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
