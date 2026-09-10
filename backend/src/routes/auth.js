const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../database/db');
const authMiddleware = require('../middleware/auth');
const logger = require('../utils/logger');

const isProd = process.env.NODE_ENV === 'production';

const router = express.Router();

// POST /api/auth/register
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone, location } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }

    const db = getDb();
    const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered.' });
    }

    // FIX 11: Check and evict BEFORE inserting new user
    const MAX_USERS = parseInt(process.env.MAX_USERS) || 15;
    const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
    if (userCount >= MAX_USERS) {
      const oldest = db.prepare(
        'SELECT id FROM users ORDER BY created_at ASC LIMIT 1'
      ).get();
      if (oldest) {
        db.prepare('DELETE FROM users WHERE id = ?').run(oldest.id);
        logger.info('FIFO user eviction: removed oldest user', { evicted: oldest.id });
      }
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = uuidv4();

    db.prepare(`
      INSERT INTO users (id, name, email, password_hash, phone, location)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, name, email, passwordHash, phone || null, location || null);

    // Create default preferences
    db.prepare(`
      INSERT INTO user_preferences (id, user_id) VALUES (?, ?)
    `).run(uuidv4(), userId);

    const token = jwt.sign(
      { id: userId, email, name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    // Send verification email (non-blocking — don't fail registration if email fails)
    const verifyToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24h
    db.prepare('INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(verifyToken, userId, expiresAt);

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const { sendJobApplication } = require('../services/emailService');
      const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verifyToken}`;
      sendJobApplication({
        to: email,
        subject: 'JobAI — Verify your email',
        htmlBody: `<p>Hi ${name},</p><p>Please verify your email to unlock all features:</p><p><a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Verify Email</a></p><p>This link expires in 24 hours.</p>`,
      }).catch(() => {}); // Silent fail
    }

    logger.info('New user registered', { userId, email: isProd ? '[redacted]' : email });
    res.status(201).json({
      token, user: { id: userId, name, email, phone, location },
      email_verified: false,
      dev_verify_token: !isProd ? verifyToken : undefined,
    });
  } catch (err) {
    logger.error('Registration error', { error: err.message });
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, name: user.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info('User logged in', { userId: user.id });
    res.json({
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        location: user.location,
        email_verified: user.email_verified
      }
    });
  } catch (err) {
    logger.error('Login error', { error: err.message });
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT id, name, email, phone, location, email_verified, created_at FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
    res.json({ user, preferences: prefs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/profile
router.put('/profile', authMiddleware, async (req, res) => {
  try {
    const { name, phone, location } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required.' });
    const db = getDb();

    db.prepare(`
      UPDATE users SET name = ?, phone = ?, location = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name, phone || null, location || null, req.user.id);

    const updated = db.prepare(
      'SELECT id, name, email, phone, location, email_verified, created_at FROM users WHERE id = ?'
    ).get(req.user.id);

    res.json({ message: 'Profile updated successfully.', user: updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/preferences
router.get('/preferences', authMiddleware, (req, res) => {
  try {
    const db = getDb();
    const prefs = db.prepare('SELECT * FROM user_preferences WHERE user_id = ?').get(req.user.id);
    if (!prefs) {
      return res.json({
        preferences: {
          preferred_roles: '',
          preferred_locations: '',
          min_salary: 0,
          max_salary: null,
          job_types: '',
          skills: '',
          daily_discovery_enabled: 0,
          discovery_time: '16:00',
        }
      });
    }
    res.json({ preferences: prefs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/auth/preferences
router.put('/preferences', authMiddleware, (req, res) => {
  try {
    const { preferred_roles, preferred_locations, min_salary, max_salary, job_types, skills, daily_discovery_enabled, discovery_time } = req.body;
    const db = getDb();

    db.prepare(`
      UPDATE user_preferences SET
        preferred_roles         = COALESCE(?, preferred_roles),
        preferred_locations     = COALESCE(?, preferred_locations),
        min_salary              = COALESCE(?, min_salary),
        max_salary              = COALESCE(?, max_salary),
        job_types               = COALESCE(?, job_types),
        skills                  = COALESCE(?, skills),
        daily_discovery_enabled = COALESCE(?, daily_discovery_enabled),
        discovery_time          = COALESCE(?, discovery_time),
        updated_at              = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      preferred_roles     || null,
      preferred_locations || null,
      min_salary          != null ? min_salary : null,
      max_salary          != null ? max_salary : null,
      job_types           || null,
      skills              || null,
      daily_discovery_enabled != null ? (daily_discovery_enabled ? 1 : 0) : null,
      discovery_time      || null,
      req.user.id
    );

    res.json({ message: 'Preferences updated.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/auth/verify-email?token=xxx — click from email link
router.get('/verify-email', async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ error: 'Token required.' });

    const db = getDb();
    const record = db.prepare(
      'SELECT * FROM email_verification_tokens WHERE token = ? AND used = 0'
    ).get(token);

    if (!record) return res.status(400).json({ error: 'Invalid or already used token.' });
    if (new Date(record.expires_at) < new Date()) {
      return res.status(400).json({ error: 'Verification link expired. Request a new one.' });
    }

    db.prepare('UPDATE users SET email_verified = 1 WHERE id = ?').run(record.user_id);
    db.prepare('UPDATE email_verification_tokens SET used = 1 WHERE token = ?').run(token);

    logger.info('Email verified', { userId: record.user_id });
    res.json({ message: 'Email verified successfully! You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/resend-verification — resend verification email
router.post('/resend-verification', authMiddleware, async (req, res) => {
  try {
    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    if (!user) return res.status(404).json({ error: 'User not found.' });
    if (user.email_verified) return res.status(400).json({ error: 'Email already verified.' });

    const verifyToken = require('crypto').randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // Invalidate old tokens
    db.prepare("DELETE FROM email_verification_tokens WHERE user_id = ? AND used = 0").run(req.user.id);
    db.prepare('INSERT INTO email_verification_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(verifyToken, req.user.id, expiresAt);

    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const { sendJobApplication } = require('../services/emailService');
      const verifyUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/verify-email?token=${verifyToken}`;
      await sendJobApplication({
        to: user.email,
        subject: 'JobAI — Verify your email',
        htmlBody: `<p>Hi ${user.name},</p><p>Click to verify your email:</p><p><a href="${verifyUrl}" style="background:#2563eb;color:#fff;padding:10px 20px;border-radius:6px;text-decoration:none;">Verify Email</a></p>`,
      }).catch(() => {});
    }

    res.json({
      message: 'Verification email sent.',
      dev_token: !isProd ? verifyToken : undefined,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/forgot-password — generate reset token (send via email if configured)
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'Email is required.' });

    const db = getDb();
    const user = db.prepare('SELECT id, name FROM users WHERE email = ?').get(email);

    // Always return success to prevent email enumeration
    if (!user) return res.json({ message: 'If that email exists, a reset link has been sent.' });

    // Generate a time-limited reset token (expires in 1 hour)
    const token = require('crypto').randomBytes(32).toString('hex');

    // FIX 3: Store token in the dedicated password_reset_tokens table
    db.prepare(`
      INSERT INTO password_reset_tokens (token, user_id, expires_at)
      VALUES (?, ?, ?)
    `).run(token, user.id, new Date(Date.now() + 60 * 60 * 1000).toISOString());

    // Send email if configured
    if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
      const { sendJobApplication } = require('../services/emailService');
      const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:5173'}/reset-password?token=${token}`;
      await sendJobApplication({
        to: email,
        subject: 'JobAI — Password Reset',
        htmlBody: `<p>Hi ${user.name},</p><p>Click the link below to reset your password (valid 1 hour):</p><p><a href="${resetUrl}">${resetUrl}</a></p><p>If you didn't request this, ignore this email.</p>`,
      }).catch(err => logger.warn('Reset email failed', { error: err.message }));
    }

    logger.info('Password reset requested', { userId: user.id });
    res.json({ message: 'If that email exists, a reset link has been sent.', dev_token: process.env.NODE_ENV !== 'production' ? token : undefined });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/auth/reset-password — use token to set new password
router.post('/reset-password', async (req, res) => {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password) return res.status(400).json({ error: 'Token and new_password required.' });
    if (new_password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });

    const db = getDb();
    // FIX 3: Read from password_reset_tokens table
    const record = db.prepare(`
      SELECT * FROM password_reset_tokens
      WHERE token = ? AND used = 0
        AND expires_at > datetime('now')
    `).get(token);
    if (!record) return res.status(400).json({ error: 'Invalid or expired reset token.' });

    const newHash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, record.user_id);
    // FIX 3: Mark token used in password_reset_tokens
    db.prepare('UPDATE password_reset_tokens SET used = 1 WHERE token = ?').run(token);

    logger.info('Password reset completed', { userId: record.user_id });
    res.json({ message: 'Password reset successfully. You can now log in.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
router.put('/change-password', authMiddleware, async (req, res) => {
  try {
    const { current_password, new_password } = req.body;
    if (!current_password || !new_password) return res.status(400).json({ error: 'Both current and new password required.' });
    if (new_password.length < 8) return res.status(400).json({ error: 'New password must be at least 8 characters.' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(current_password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect.' });

    const newHash = await bcrypt.hash(new_password, 12);
    db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newHash, req.user.id);
    res.json({ message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/auth/account — permanently delete user data
router.delete('/account', authMiddleware, async (req, res) => {
  try {
    const { password } = req.body;
    if (!password) return res.status(400).json({ error: 'Password required to delete account.' });

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) return res.status(401).json({ error: 'Incorrect password.' });

    // FIX 6: Delete resume files from disk before removing DB records
    const fs = require('fs');
    const userResumes = db.prepare(
      'SELECT file_path FROM resumes WHERE user_id = ?'
    ).all(req.user.id);
    userResumes.forEach(r => {
      try {
        if (fs.existsSync(r.file_path)) fs.unlinkSync(r.file_path);
      } catch {}
    });

    // CASCADE deletes handle all related data
    db.prepare('DELETE FROM users WHERE id = ?').run(req.user.id);
    res.json({ message: 'Account deleted. All data has been removed.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
module.exports = router;
