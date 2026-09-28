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
const { getDb }        = require('../database/db');
const { generateText } = require('../services/geminiService');
const { buildUserContext } = require('../utils/buildUserContext');

// Helper: fetch full user context
function getUserFullContext(userId) {
  const db = getDb();
  let resume = db.prepare('SELECT * FROM resumes WHERE user_id = ? AND is_active = 1 ORDER BY created_at DESC LIMIT 1').get(userId);
  if (!resume) {
    resume = db.prepare('SELECT * FROM resumes WHERE user_id = ? ORDER BY created_at DESC LIMIT 1').get(userId);
  }
  const profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  const projects = db.prepare('SELECT * FROM user_projects WHERE user_id = ? ORDER BY display_order').all(userId);
  const experience = db.prepare('SELECT * FROM user_experience WHERE user_id = ? ORDER BY display_order').all(userId);
  const certs = db.prepare('SELECT * FROM user_certifications WHERE user_id = ? ORDER BY display_order').all(userId);
  const achievements = db.prepare('SELECT * FROM user_achievements WHERE user_id = ? ORDER BY display_order').all(userId);
  const user = db.prepare('SELECT email, phone FROM users WHERE id = ?').get(userId);

  return {
    resume, profile, projects, experience, certs, achievements,
    userContext: buildUserContext(resume, profile, projects, experience, certs, achievements, user)
  };
}

// Helper: evaluate verdict directly using Gemini
async function generateEligibilityVerdict({ userContext, jobTitle, jobDescription, qaText = '' }) {
  const verdictPrompt = `You are an expert recruiter assessing candidate eligibility for a job.

CANDIDATE FULL PROFILE & UPLOADED RESUME:
${userContext}

JOB TITLE: ${jobTitle}

JOB DESCRIPTION:
${jobDescription}

${qaText ? `CANDIDATE Q&A / ADDITIONAL CLARIFICATIONS:\n${qaText}\n` : ''}
Based on the candidate's resume, profile, and any Q&A above, assess the candidate's eligibility. Return a JSON object with exactly these fields:
{
  "verdict": "Eligible" | "Likely Eligible" | "Borderline" | "Not Eligible",
  "score": <integer 0-100>,
  "breakdown": [
    { "criterion": "<requirement name>", "met": true|false, "note": "<one line justification referencing candidate resume or profile facts>" }
  ],
  "recommendation": "<2-3 sentence actionable advice for the candidate>"
}

Return ONLY the JSON object. No markdown fences, no explanation.`;

  logger.info('Eligibility Checker: generating verdict via Gemini');
  const verdictRaw = await generateText(verdictPrompt);
  const match = verdictRaw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('No JSON object found in verdict response');
  return JSON.parse(match[0]);
}

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

// ─── POST /check-questions ───────────────────────────────────────────────────
router.post('/check-questions', async (req, res) => {
  try {
    const { job_description, job_title = 'the role' } = req.body;
    const { userContext } = getUserFullContext(req.user.id);
    const taskDescription = `Check candidate eligibility for: ${job_title}. Description: ${job_description ? job_description.substring(0, 1000) : 'General assessment'}`;

    const prompt = `You have this candidate's full profile and uploaded resume:
${userContext}

Task: ${taskDescription}

Review the profile and resume carefully.
CRITICAL RULE: DO NOT ask about any detail, skill, qualification, education degree, graduation year, CGPA, work experience, project, certification, or location that is ALREADY present or inferable from the profile or resume text above.

Is there any vital, non-negotiable job requirement that is COMPLETELY MISSING from their profile/resume and needed for this check?
If YES: return ONE specific question.
If NO (profile/resume has sufficient details): return null.

Return ONLY valid JSON:
{
  "needs_clarification": true/false,
  "question": "the question text or null",
  "question_type": "text|number|select|multiselect",
  "options": ["option1","option2"] or null
}`;

    const raw = await generateText(prompt);
    let parsed = { needs_clarification: false, question: null, question_type: null, options: null };
    try {
      const match = raw.match(/\{[\s\S]*\}/);
      if (match) parsed = JSON.parse(match[0]);
    } catch (pe) {
      logger.warn('Failed to parse eligibility check-questions response', { raw });
    }

    return res.json(parsed);
  } catch (err) {
    logger.error('eligibility check-questions error', { error: err.message });
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /start ───────────────────────────────────────────────────────────────
router.post('/start', async (req, res) => {
  try {
    pruneExpiredSessions();

    const { job_description, job_title = 'the role', user_answers } = req.body;
    if (!job_description || !job_description.trim()) {
      return res.status(400).json({ error: 'job_description is required.' });
    }

    const { userContext: baseUserContext } = getUserFullContext(req.user.id);
    let userContext = baseUserContext;
    if (user_answers && Object.keys(user_answers).length > 0) {
      userContext += `\n\nADDITIONAL INFORMATION FROM USER:\n${Object.entries(user_answers).map(([q, a]) => `Q: ${q}\nA: ${a}`).join('\n')}`;
    }

    const prompt = `You are a strict, highly selective eligibility assessment AI for job applications.

CANDIDATE FULL PROFILE & RESUME:
${userContext}

JOB TITLE: ${job_title}

JOB DESCRIPTION:
${job_description}

INSTRUCTIONS:
1. Thoroughly analyze the candidate's uploaded resume text, personal details, education (UG/PG degree, CGPA, graduation year, backlogs), technical skills, programming languages, frameworks, databases, cloud skills, developer tools, projects, work experience, certifications, achievements, notice period, location, and relocation preferences listed above.
2. STRICT RULE: DO NOT ASK ANY QUESTION regarding information that is ALREADY covered, mentioned, or inferable in their uploaded resume or profile setup.
   - DO NOT ask about any skills, tools, or languages already listed (e.g., if JavaScript, React, Python, or SQL is in their resume or skills, DO NOT ask if they know it).
   - DO NOT ask about their degree, college, graduation year, CGPA, or marks (these are already in their education profile).
   - DO NOT ask about prior companies, experience, or projects that appear in their resume/profile.
   - DO NOT ask about location, relocation, or notice period if already specified.
   - NEVER ask generic interview questions (e.g. "Why do you want this job?", "Describe your strengths").
3. ONLY ask a question if there is a STRICT, CRITICAL, NON-NEGOTIABLE job requirement from the Job Description that is COMPLETELY MISSING and cannot be determined from their resume or profile (e.g., specific mandatory government security clearance, required professional license like CPA/Bar admission, unstated work authorization/visa status for a foreign location, or willingness to work specific night shifts/travel requirements).
4. If there are NO critical unaddressed requirements, or if the candidate's resume and profile already provide enough information to assess their eligibility, return an EMPTY JSON array: [].
5. If there are genuinely missing critical requirements, return ONLY those specific questions (at most 1 to 3 questions).

Return ONLY a valid JSON array of question strings (e.g. ["Question 1?"] or []). No explanation, no markdown fences.`;

    logger.info('Eligibility Checker: checking for required questions via Gemini', { userId: req.user.id });
    const raw = await generateText(prompt);

    // Extract JSON array from response
    let questions = [];
    try {
      const match = raw.match(/\[[\s\S]*\]/);
      if (match) {
        const parsed = JSON.parse(match[0]);
        if (Array.isArray(parsed)) {
          questions = parsed.filter(q => typeof q === 'string' && q.trim().length > 0).slice(0, 5);
        }
      }
    } catch (parseErr) {
      logger.warn('Eligibility: failed to parse question array, defaulting to no extra questions', { raw, error: parseErr.message });
      questions = [];
    }

    // If no questions are needed (everything is already covered in resume & profile),
    // generate and return the verdict immediately!
    if (questions.length === 0) {
      logger.info('Eligibility Checker: all requirements covered by resume & profile, generating verdict directly', { userId: req.user.id });
      const verdict = await generateEligibilityVerdict({
        userContext,
        jobTitle: job_title,
        jobDescription: job_description,
        qaText: 'All key criteria verified directly from uploaded resume and profile setup. No additional questions required.',
      });

      return res.json({
        done:           true,
        verdict:        verdict.verdict        || 'Eligible',
        score:          verdict.score          ?? 0,
        breakdown:      verdict.breakdown      || [],
        recommendation: verdict.recommendation || '',
      });
    }

    // Store session for questions that are genuinely needed
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
      done:            false,
      session_id:      sessionId,
      first_question:  questions[0],
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
        done:            false,
        next_question:   session.questions[nextIndex],
        question_number: nextIndex + 1,
        total_questions: session.questions.length,
      });
    }

    // All questions answered — ask Gemini for a verdict
    const { userContext } = getUserFullContext(req.user.id);
    const qaText = session.questions
      .map((q, i) => `Q${i + 1}: ${q}\nA${i + 1}: ${session.answers[i]}`)
      .join('\n\n');

    logger.info('Eligibility Checker: generating verdict via Gemini', { userId: req.user.id, session_id });
    const verdict = await generateEligibilityVerdict({
      userContext,
      jobTitle: session.jobTitle,
      jobDescription: session.jobDescription,
      qaText,
    });

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
