'use strict';

/**
 * OTP-specific rate limiters for auth routes.
 * Applied per-IP via express-rate-limit.
 *
 * /api/auth/signup-step1: 10 req / 15 min per IP
 * /api/auth/signin-step1: 10 req / 15 min per IP
 * /api/auth/resend-otp:    5 req / 15 min per IP
 */

const rateLimit = require('express-rate-limit');

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const signupStep1 = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  message: { error: 'Too many signup attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const signinStep1 = rateLimit({
  windowMs: WINDOW_MS,
  max: 10,
  message: { error: 'Too many sign-in attempts. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const resendOtp = rateLimit({
  windowMs: WINDOW_MS,
  max: 5,
  message: { error: 'Too many resend requests. Please wait 15 minutes and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = { signupStep1, signinStep1, resendOtp };
