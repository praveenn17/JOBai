'use strict';

/**
 * JobAI OTP Service
 *
 * Handles generation, email delivery, and verification of 6-digit
 * time-limited OTP codes for two-factor authentication.
 *
 * Security:
 *  - OTPs are bcrypt-hashed before storage
 *  - 10-minute expiry
 *  - Max 5 wrong attempts per token (then locked)
 *  - 60-second resend cooldown
 *  - Max 5 resends per hour
 *  - Single-use enforcement
 */

const crypto     = require('crypto');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const { getDb }  = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const logger     = require('../utils/logger');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a random 6-digit string e.g. "047291" */
function generateOtp() {
  return crypto.randomInt(100000, 999999).toString();
}

/** Lazy-created nodemailer transporter (Gmail SMTP via env vars) */
let _transporter = null;
function getTransporter() {
  if (_transporter) return _transporter;
  _transporter = nodemailer.createTransport({
    host:   process.env.EMAIL_HOST || 'smtp.gmail.com',
    port:   parseInt(process.env.EMAIL_PORT) || 587,
    secure: parseInt(process.env.EMAIL_PORT) === 465,
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
  return _transporter;
}

// ─── Core API ─────────────────────────────────────────────────────────────────

/**
 * Generate and email a new OTP to `email` for `purpose`.
 *
 * Throws if:
 *  - Another OTP was sent in the last 60 seconds
 *  - More than 5 resends have been made in the last hour
 *
 * @param {string} email
 * @param {string} purpose  'signup_verify' | 'signin_verify'
 * @param {object} [details]  Extra JSON to store (e.g. pending signup data)
 * @returns {{ success: true, expires_in: 600 }}
 */
async function sendOtp(email, purpose, details = null) {
  const db = getDb();

  // ── 60-second cooldown ──────────────────────────────────────────────────
  const recent = db.prepare(`
    SELECT last_resend_at, resend_count, created_at
    FROM otp_tokens
    WHERE email = ? AND purpose = ? AND used = 0
    ORDER BY created_at DESC
    LIMIT 1
  `).get(email, purpose);

  if (recent) {
    const lastSentAt = new Date(recent.last_resend_at || recent.created_at);
    const secondsSinceLast = (Date.now() - lastSentAt.getTime()) / 1000;
    if (secondsSinceLast < 60) {
      throw new Error(
        `Please wait ${Math.ceil(60 - secondsSinceLast)} seconds before requesting a new OTP.`
      );
    }
  }

  // ── Max 5 resends per hour ───────────────────────────────────────────────
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count: resendsThisHour } = db.prepare(`
    SELECT COUNT(*) AS count FROM otp_tokens
    WHERE email = ? AND purpose = ? AND created_at > ?
  `).get(email, purpose, hourAgo);

  if (resendsThisHour >= 5) {
    throw new Error('Too many OTP requests. Try again in 1 hour.');
  }

  // ── Generate & hash ──────────────────────────────────────────────────────
  const otp     = generateOtp();
  const hash    = await bcrypt.hash(otp, 10);
  const id      = uuidv4();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const now     = new Date().toISOString();

  // Mark all previous unused OTPs for this email+purpose as used
  db.prepare(`
    UPDATE otp_tokens SET used = 1
    WHERE email = ? AND purpose = ? AND used = 0
  `).run(email, purpose);

  // Insert new OTP record (store details JSON if provided)
  db.prepare(`
    INSERT INTO otp_tokens
      (id, email, otp, purpose, expires_at, last_resend_at, details)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, email, hash, purpose, expires, now, details ? JSON.stringify(details) : null);

  // ── Send email ───────────────────────────────────────────────────────────
  if (process.env.EMAIL_USER && process.env.EMAIL_PASS) {
    try {
      const transporter = getTransporter();
      await transporter.sendMail({
        from:    process.env.EMAIL_FROM || `JobAI <${process.env.EMAIL_USER}>`,
        to:      email,
        subject: 'Your JobAI verification code',
        html: `
          <!DOCTYPE html>
          <html>
          <body style="margin:0;padding:0;background:#0f172a;font-family:'Segoe UI',Arial,sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#0f172a;padding:40px 0;">
              <tr><td align="center">
                <table width="520" cellpadding="0" cellspacing="0" style="background:#1e293b;border-radius:16px;overflow:hidden;border:1px solid #334155;">
                  <tr>
                    <td style="background:linear-gradient(135deg,#6366f1,#8b5cf6);padding:32px;text-align:center;">
                      <h1 style="margin:0;color:#fff;font-size:28px;font-weight:700;letter-spacing:-0.5px;">🔐 JobAI</h1>
                      <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Email Verification</p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:40px 48px;">
                      <p style="margin:0 0 8px;color:#94a3b8;font-size:14px;text-transform:uppercase;letter-spacing:1px;font-weight:600;">Your verification code</p>
                      <div style="background:#0f172a;border:2px solid #6366f1;border-radius:12px;padding:24px;text-align:center;margin:16px 0 24px;">
                        <span style="font-size:48px;font-weight:800;letter-spacing:16px;color:#a78bfa;font-family:monospace;">${otp}</span>
                      </div>
                      <p style="margin:0 0 16px;color:#cbd5e1;font-size:15px;line-height:1.6;">
                        Enter this code in the JobAI app to verify your email address.
                        This code is valid for <strong style="color:#a78bfa;">10 minutes</strong>.
                      </p>
                      <div style="background:#1a1f2e;border:1px solid #ef4444;border-radius:8px;padding:12px 16px;">
                        <p style="margin:0;color:#fca5a5;font-size:13px;">
                          🚨 <strong>Never share this code.</strong> JobAI staff will never ask for it.
                        </p>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 48px 32px;text-align:center;">
                      <p style="margin:0;color:#475569;font-size:12px;">
                        If you didn't request this, you can safely ignore this email.
                      </p>
                    </td>
                  </tr>
                </table>
              </td></tr>
            </table>
          </body>
          </html>
        `,
      });
      logger.info('OTP email sent', { email: email.replace(/@.*/, '@***'), purpose });
    } catch (emailErr) {
      logger.warn('OTP email delivery failed', { error: emailErr.message });
      // In development, log OTP to console so dev can test without SMTP
      if (process.env.NODE_ENV !== 'production') {
        logger.info(`[DEV] OTP for ${email} (${purpose}): ${otp}`);
      }
      // Don't throw — the OTP is still stored in DB; caller decides if email is required
    }
  } else {
    // SMTP not configured — log plaintext OTP for development
    logger.warn('SMTP not configured — OTP not emailed');
    if (process.env.NODE_ENV !== 'production') {
      logger.info(`[DEV] OTP for ${email} (${purpose}): ${otp}`);
      console.log(`\n\n🔑 [DEV OTP] ${email} | ${purpose} | CODE: ${otp}\n\n`);
    }
  }

  return { success: true, expires_in: 600 };
}

/**
 * Verify an OTP submitted by the user.
 *
 * Throws on any failure. Returns { success: true, details? } on success.
 *
 * @param {string} email
 * @param {string} otp   The plaintext 6-digit code from the user
 * @param {string} purpose
 * @returns {{ success: true, details: object|null }}
 */
async function verifyOtp(email, otp, purpose) {
  const db = getDb();

  // Find the latest unused, unexpired OTP for this email + purpose
  const record = db.prepare(`
    SELECT * FROM otp_tokens
    WHERE email = ? AND purpose = ? AND used = 0
      AND expires_at > datetime('now')
    ORDER BY created_at DESC
    LIMIT 1
  `).get(email, purpose);

  if (!record) {
    throw new Error('Invalid or expired OTP. Please request a new one.');
  }

  if (record.attempts >= record.max_attempts) {
    throw new Error('Too many failed attempts. Please request a new OTP.');
  }

  // Increment attempt counter first (before compare — protects against timing attacks)
  db.prepare('UPDATE otp_tokens SET attempts = attempts + 1 WHERE id = ?').run(record.id);

  const match = await bcrypt.compare(String(otp), record.otp);

  if (!match) {
    const remaining = record.max_attempts - record.attempts - 1;
    throw new Error(
      remaining > 0
        ? `Incorrect OTP. ${remaining} attempt${remaining === 1 ? '' : 's'} remaining.`
        : 'Too many failed attempts. Please request a new OTP.'
    );
  }

  // Mark as used
  db.prepare('UPDATE otp_tokens SET used = 1 WHERE id = ?').run(record.id);

  let details = null;
  if (record.details) {
    try { details = JSON.parse(record.details); } catch (_) {}
  }

  return { success: true, details };
}

module.exports = { sendOtp, verifyOtp, generateOtp };
