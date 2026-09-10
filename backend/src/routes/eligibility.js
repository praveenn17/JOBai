/**
 * Eligibility Checker Routes
 *
 * POST /api/eligibility/start
 *   Body: { job_description: string, job_title?: string }
 *   Auth: required
 *   Returns: { session_id, first_question }
 *
 * POST /api/eligibility/answer
 *   Body: { session_id: string, answer: string }
 *   Auth: required
 *   Returns:
 *     If more questions: { next_question, question_number, total_questions }
 *     If done:           { done: true, verdict, score, breakdown, recommendation }
 */

const express = require('express');
const router  = express.Router();

const authMiddleware   = require('../middleware/auth');
const logger           = require('../utils/logger');
const { generateText } = require('../services/geminiService');

// Simple in-memory session store (keyed by session_id).
// Sessions expire after 30 minutes.
const SESSION_TTL_MS = 30 * 60 * 1000;
const sessions = new Map();

function pruneExpiredSessions() {
  const now = Date.now();
  for (const [id, session] of sessions.entries()) {
    if (now - session.createdAt > SESSION_TTL_MS) {
      sessions.delete(id);
    }
  }
}

// All routes require authentication
router.use(authMiddleware);

// ─── POST /start ───────────────────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  try {
    pruneExpiredSessions();

    const { job_description, job_title = 'the role' } = req.body;
    if (!job_description || !job_description.trim()) {
      return res.status(400).json({ error: 'job_description is required.' });
    }

    const prompt = `You are a strict eligibility assessment AI for job applications.

Given the following job description, generate exactly 5 yes/no or short-answer questions that determine whether a candidate is realistically eligible for this role. Focus on hard requirements (visa/work authorization, years of experience, must-have certifications, specific technical skills, location/relocation).

JOB TITLE: ${job_title}

JOB DESCRIPTION:
${job_description}

Return ONLY a JSON array of exactly 5 question strings. No explanation, no markdown, no code blocks.
Example format: ["Question 1?","Question 2?","Question 3?","Question 4?","Question 5?"]`;

    logger.info('Eligibility Checker: generating questions via Gemini', { userId: req.user.id });
    const raw = await generateText(prompt);

    // Extract JSON array from response
    let questions;
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array found');
      questions = JSON.parse(match[0]);
      if (!Array.isArray(questions) || questions.length === 0) throw new Error('Empty question array');
    } catch (parseErr) {
      logger.error('Eligibility: failed to parse questions', { raw, error: parseErr.message });
      return res.status(500).json({ error: 'AI returned an unexpected response. Please try again.' });
    }

    // Store session
    const sessionId = `elig_${req.user.id}_${Date.now()}`;
    sessions.set(sessionId, {
      userId: req.user.id,
      jobDescription: job_description,
      jobTitle: job_title,
      questions,
      answers: [],
      createdAt: Date.now(),
    });

    return res.json({
      session_id:     sessionId,
      first_question: questions[0],
      question_number: 1,
      total_questions: questions.length,
    });
  } catch (err) {
    logger.error('Eligibility Checker: start failed', { error: err.message });
    if (err.message && err.message.includes('GEMINI_API_KEY')) {
      return res.status(503).json({ error: 'Gemini AI is not configured. Set GEMINI_API_KEY in .env.' });
    }
    return res.status(500).json({ error: err.message || 'Failed to start eligibility check.' });
  }
});

// ─── POST /answer ──────────────────────────────────────────────────────────────
router.post('/answer', async (req, res) => {
  try {
    const { session_id, answer } = req.body;

    if (!session_id || answer === undefined || answer === null) {
      return res.status(400).json({ error: 'session_id and answer are required.' });
    }

    const session = sessions.get(session_id);
    if (!session) {
      return res.status(404).json({ error: 'Session not found or expired. Please start a new check.' });
    }

    // Ownership check
    if (session.userId !== req.user.id) {
      return res.status(403).json({ error: 'Access denied.' });
    }

    session.answers.push(String(answer).trim());

    const nextIndex = session.answers.length;

    // More questions remain
    if (nextIndex < session.questions.length) {
      return res.json({
        next_question:   session.questions[nextIndex],
        question_number: nextIndex + 1,
        total_questions: session.questions.length,
      });
    }

    // All questions answered — ask Gemini for a verdict
    const qaText = session.questions
      .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${session.answers[i]}`)
      .join('\n\n');

    const verdictPrompt = `You are an expert recruiter assessing candidate eligibility for a job.

JOB TITLE: ${session.jobTitle}

JOB DESCRIPTION:
${session.jobDescription}

CANDIDATE Q&A:
${qaText}

Based on the Q&A above, assess the candidate's eligibility. Return a JSON object with exactly these fields:
{
  "verdict": "Eligible" | "Likely Eligible" | "Borderline" | "Not Eligible",
  "score": <integer 0-100>,
  "breakdown": [
    { "criterion": "<requirement name>", "met": true|false, "note": "<one line>" }
  ],
  "recommendation": "<2-3 sentence actionable advice for the candidate>"
}

Return ONLY the JSON object. No markdown, no explanation.`;

    logger.info('Eligibility Checker: generating verdict via Gemini', { userId: req.user.id, session_id });
    const verdictRaw = await generateText(verdictPrompt);

    let verdict;
    try {
      const match = verdictRaw.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('No JSON object found');
      verdict = JSON.parse(match[0]);
    } catch (parseErr) {
      logger.error('Eligibility: failed to parse verdict', { verdictRaw, error: parseErr.message });
      return res.status(500).json({ error: 'AI returned an unexpected verdict. Please try again.' });
    }

    // Clean up session
    sessions.delete(session_id);

    return res.json({
      done:           true,
      verdict:        verdict.verdict        || 'Unknown',
      score:          verdict.score          ?? 0,
      breakdown:      verdict.breakdown      || [],
      recommendation: verdict.recommendation || '',
    });
  } catch (err) {
    logger.error('Eligibility Checker: answer failed', { error: err.message });
    if (err.message && err.message.includes('GEMINI_API_KEY')) {
      return res.status(503).json({ error: 'Gemini AI is not configured. Set GEMINI_API_KEY in .env.' });
    }
    return res.status(500).json({ error: err.message || 'Failed to process answer.' });
  }
});

module.exports = router;
