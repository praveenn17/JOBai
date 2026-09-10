/**
 * Email Intelligence Service — Self-Improving Cold Email System
 * Steps 2–10: Pattern analysis → Template evolution → Adaptive generation
 */

const Anthropic = require('@anthropic-ai/sdk');
const { getDb } = require('../database/db');
const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const ANALYSIS_THRESHOLD = 10; // re-evaluate every 10 emails with outcomes
const TEMPLATE_COUNT = 5;

// ─── Step 1: Record full email data when sent ─────────────────────────────────
function recordEmailSent({
  userId, emailAppId, companyName, role, recipientEmail,
  subject, emailBody, coverLetter, templateId, resumeVariant,
  coverLetterVariant, personality, personalizationType
}) {
  const db = getDb();
  const id = uuidv4();
  db.prepare(`
    INSERT INTO email_performance
      (id, user_id, email_app_id, company_name, role, recipient_email,
       subject, email_body, cover_letter, template_id, resume_variant,
       cover_letter_variant, personality, personalization_type, email_length)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, userId, emailAppId || null, companyName, role, recipientEmail,
         subject, emailBody, coverLetter, templateId, resumeVariant,
         coverLetterVariant, personality, personalizationType || 'company_mention',
         (emailBody || '').split(/\s+/).length);

  // Init template score row if missing
  const existing = db.prepare('SELECT id FROM template_scores WHERE user_id = ? AND template_id = ?').get(userId, templateId);
  if (!existing) {
    db.prepare('INSERT INTO template_scores (id, user_id, template_id) VALUES (?, ?, ?)').run(uuidv4(), userId, templateId);
  }
  db.prepare('UPDATE template_scores SET sent_count = sent_count + 1 WHERE user_id = ? AND template_id = ?').run(userId, templateId);

  return id;
}

// ─── Step 1: Store outcome when user marks it ─────────────────────────────────
function setEmailOutcome(userId, emailPerfId, outcome) {
  const db = getDb();
  const outcomeMap = { interview: 'accepted', no_response: 'ignored' };
  const normalized = outcomeMap[outcome] || outcome;
  const valid = ['accepted', 'rejected', 'ignored'];
  if (!valid.includes(normalized)) throw new Error('outcome must be: accepted | rejected | ignored | interview | no_response');

  const res = db.prepare(`
    UPDATE email_performance SET outcome = ?, outcome_set_at = CURRENT_TIMESTAMP
    WHERE id = ? AND user_id = ?
  `).run(normalized, emailPerfId, userId);
  if (res.changes === 0) {
    throw new Error('Email performance record not found or access denied.');
  }

  // Update template score counts
  const ep = db.prepare('SELECT template_id FROM email_performance WHERE id = ? AND user_id = ?').get(emailPerfId, userId);
  if (ep) {
    const col = normalized === 'accepted' ? 'accepted_count' : normalized === 'rejected' ? 'rejected_count' : 'ignored_count';
    db.prepare(`UPDATE template_scores SET ${col} = ${col} + 1 WHERE user_id = ? AND template_id = ?`).run(userId, ep.template_id);
    recalcTemplateScore(userId, ep.template_id);
  }

  // Update subject line performance
  const emailData = db.prepare('SELECT subject FROM email_performance WHERE id = ? AND user_id = ?').get(emailPerfId, userId);
  if (emailData?.subject) {
    const subj = db.prepare('SELECT id, sent_count, response_count FROM subject_performance WHERE user_id = ? AND subject = ?').get(userId, emailData.subject);
    if (subj) {
      const newResp = normalized === 'accepted' ? subj.response_count + 1 : subj.response_count;
      const newScore = Math.round((newResp / subj.sent_count) * 100);
      db.prepare('UPDATE subject_performance SET response_count = ?, performance_score = ? WHERE id = ? AND user_id = ?').run(newResp, newScore, subj.id, userId);
    }
  }

  // Trigger re-analysis if threshold reached
  checkAndTriggerAnalysis(userId);
}

// ─── Step 10: Anti-overfit constants ─────────────────────────────────────────
const MAX_WEIGHT = 2.0;  // no template dominates beyond 2x
const MIN_WEIGHT = 0.3;  // every template stays in rotation

// ─── Recalculate template performance score ───────────────────────────────────
function recalcTemplateScore(userId, templateId) {
  const db = getDb();
  const ts = db.prepare('SELECT * FROM template_scores WHERE user_id = ? AND template_id = ?').get(userId, templateId);
  if (!ts || ts.sent_count === 0) return;

  const responded = ts.sent_count - ts.ignored_count;
  const responseRate = responded / ts.sent_count;
  const acceptRate   = ts.sent_count > 0 ? ts.accepted_count / ts.sent_count : 0;
  const score = Math.round((acceptRate * 0.6 + responseRate * 0.4) * 100);

  // Step 10: clamp weight — never overfit, never fully drop a template
  const rawWeight = score >= 60 ? 1.5 : score >= 40 ? 1.0 : 0.5;
  const weight = Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, rawWeight));

  db.prepare('UPDATE template_scores SET performance_score = ?, weight = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?')
    .run(score, weight, ts.id, userId);
}

// ─── Check if analysis threshold reached ─────────────────────────────────────
function checkAndTriggerAnalysis(userId) {
  const db = getDb();
  const withOutcome = db.prepare("SELECT COUNT(*) as c FROM email_performance WHERE user_id = ? AND outcome IS NOT NULL").get(userId).c;
  const strategy = db.prepare('SELECT emails_analyzed FROM email_strategy WHERE user_id = ?').get(userId);
  const lastAnalyzed = strategy?.emails_analyzed || 0;

  if (withOutcome - lastAnalyzed >= ANALYSIS_THRESHOLD) {
    // Run analysis asynchronously (don't block)
    runPatternAnalysis(userId).catch(err => logger.error('Auto-analysis error', { error: err.message }));
  }
}

// ─── Step 2-4: Full Pattern Analysis Engine ───────────────────────────────────
async function runPatternAnalysis(userId) {
  const db = getDb();

  const accepted = db.prepare("SELECT * FROM email_performance WHERE user_id = ? AND outcome = 'accepted' ORDER BY sent_at DESC LIMIT 20").all(userId);
  const rejected = db.prepare("SELECT * FROM email_performance WHERE user_id = ? AND outcome IN ('rejected','ignored') ORDER BY sent_at DESC LIMIT 30").all(userId);
  const all      = db.prepare("SELECT * FROM email_performance WHERE user_id = ? AND outcome IS NOT NULL ORDER BY sent_at DESC LIMIT 50").all(userId);

  if (all.length < 5) return null; // not enough data yet

  // Step 8: Compute metrics
  const totalWithOutcome = all.length;
  const acceptedCount  = accepted.length;
  const rejectedCount  = rejected.filter(e => e.outcome === 'rejected').length;
  const ignoredCount   = rejected.filter(e => e.outcome === 'ignored').length;
  const responseRate   = Math.round(((acceptedCount + rejectedCount) / totalWithOutcome) * 100);
  const acceptanceRate = Math.round((acceptedCount / totalWithOutcome) * 100);
  const ignoreRate     = Math.round((ignoredCount / totalWithOutcome) * 100);

  // Step 3: Template performance
  const templateScores = db.prepare('SELECT * FROM template_scores WHERE user_id = ? ORDER BY performance_score DESC').all(userId);

  // Step 5: Compute new template weights
  const totalWeight = templateScores.reduce((s, t) => s + (t.weight || 1), 0);
  const templateWeights = {};
  templateScores.forEach(t => { templateWeights[t.template_id] = t.weight / totalWeight; });

  // AI analysis prompt
  const acceptedSample = accepted.slice(0, 5).map(e =>
    `Subject: ${e.subject}\nPersonality: ${e.personality}\nPersonalization: ${e.personalization_type}\nLength: ${e.email_length}w\nBody excerpt: ${(e.email_body || '').substring(0, 200)}`
  ).join('\n---\n');

  const failedSample = rejected.slice(0, 5).map(e =>
    `Subject: ${e.subject}\nOutcome: ${e.outcome}\nPersonality: ${e.personality}\nLength: ${e.email_length}w\nBody excerpt: ${(e.email_body || '').substring(0, 200)}`
  ).join('\n---\n');

  const prompt = `You are an expert cold email analyst. Analyze these email outcomes and extract patterns.

ACCEPTED EMAILS (${accepted.length} total):
${acceptedSample || 'None yet'}

FAILED/IGNORED EMAILS (${rejected.length} total):
${failedSample || 'None yet'}

TEMPLATE SCORES:
${templateScores.map(t => `Template #${t.template_id}: sent=${t.sent_count} accepted=${t.accepted_count} score=${t.performance_score}`).join('\n')}

METRICS: Response rate: ${responseRate}% | Acceptance rate: ${acceptanceRate}% | Ignore rate: ${ignoreRate}%

Analyze patterns and return ONLY valid JSON:
{
  "best_tone": "formal" | "confident" | "formal_confident",
  "best_personalization": "company_mention" | "role_skills" | "achievement",
  "best_length_range": "<e.g. 100-150>",
  "best_opening_style": "<describe the opening style that worked best, max 20 words>",
  "best_closing_style": "<describe the closing that worked best, max 20 words>",
  "promote_patterns": ["<phrase or pattern that appeared in accepted emails>", ...],
  "avoid_patterns": ["<phrase or pattern from rejected/ignored emails>", ...],
  "subject_insight": "<what made high-performing subjects different, max 30 words>",
  "personalization_insight": "<what personalization worked best, max 30 words>",
  "top_improvements": ["<specific actionable improvement 1>", "<improvement 2>", "<improvement 3>"]
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514', max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });
    const clean = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    const insights = JSON.parse(clean);

    // Persist strategy
    const existing = db.prepare('SELECT id FROM email_strategy WHERE user_id = ?').get(userId);
    const payload = [
      insights.best_tone, insights.best_personalization, insights.best_length_range,
      insights.best_opening_style, insights.best_closing_style,
      JSON.stringify(insights.avoid_patterns || []),
      JSON.stringify(insights.promote_patterns || []),
      JSON.stringify(templateWeights),
      responseRate, acceptanceRate, ignoreRate, all.length
    ];

    if (existing) {
      db.prepare(`
        UPDATE email_strategy SET
          best_tone=?, best_personalization=?, best_length_range=?,
          best_opening_style=?, best_closing_style=?,
          avoid_patterns=?, promote_patterns=?, template_weights=?,
          response_rate=?, acceptance_rate=?, ignore_rate=?,
          emails_analyzed=?, last_analyzed=CURRENT_TIMESTAMP
        WHERE user_id=?
      `).run(...payload, userId);
    } else {
      db.prepare(`
        INSERT INTO email_strategy
          (id,user_id,best_tone,best_personalization,best_length_range,
           best_opening_style,best_closing_style,avoid_patterns,promote_patterns,
           template_weights,response_rate,acceptance_rate,ignore_rate,emails_analyzed)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(uuidv4(), userId, ...payload);
    }

    logger.info('Email pattern analysis complete', { userId, acceptanceRate, responseRate });
    return { insights, metrics: { responseRate, acceptanceRate, ignoreRate } };
  } catch (err) {
    logger.error('Pattern analysis failed', { error: err.message });
    throw err;
  }
}

// ─── Step 4: Get current strategy to guide generation ────────────────────────
function getStrategy(userId) {
  const db = getDb();
  const s = db.prepare('SELECT * FROM email_strategy WHERE user_id = ?').get(userId);
  if (!s) return null;
  return {
    ...s,
    avoid_patterns:   JSON.parse(s.avoid_patterns || '[]'),
    promote_patterns: JSON.parse(s.promote_patterns || '[]'),
    template_weights: JSON.parse(s.template_weights || '{}'),
  };
}

// ─── Step 5+10: Weighted template selection with anti-overfit guarantee ───────
function selectTemplateWeighted(userId) {
  const db = getDb();
  const scores = db.prepare('SELECT template_id, weight, sent_count FROM template_scores WHERE user_id = ? ORDER BY template_id').all(userId);

  // Bootstrap: ensure all 5 templates have entries with neutral weight
  const existingIds = new Set(scores.map(s => s.template_id));
  for (let i = 0; i < TEMPLATE_COUNT; i++) {
    if (!existingIds.has(i)) scores.push({ template_id: i, weight: 1.0, sent_count: 0 });
  }

  // Pure round-robin until all templates explored at least once
  if (scores.every(s => s.sent_count === 0)) {
    const lastLog = db.prepare('SELECT template_index FROM email_send_log WHERE user_id = ? ORDER BY sent_at DESC LIMIT 1').get(userId);
    return ((lastLog?.template_index ?? -1) + 1) % TEMPLATE_COUNT;
  }

  // Step 10: Force exploration — if any template < 3 sends, use it first
  const underExplored = scores.filter(s => s.sent_count < 3).sort((a, b) => a.sent_count - b.sent_count);
  if (underExplored.length > 0) return underExplored[0].template_id;

  // Weighted random with clamped weights (MIN..MAX enforced per template)
  const clamp = w => Math.min(MAX_WEIGHT, Math.max(MIN_WEIGHT, w || 1.0));
  const total = scores.reduce((s, t) => s + clamp(t.weight), 0);
  let rand = Math.random() * total;
  for (const t of scores) {
    rand -= clamp(t.weight);
    if (rand <= 0) return t.template_id;
  }
  return scores[scores.length - 1].template_id;
}

// ─── Step 6: Track subject line ───────────────────────────────────────────────
function trackSubjectSent(userId, subject) {
  const db = getDb();
  const existing = db.prepare('SELECT id FROM subject_performance WHERE user_id = ? AND subject = ?').get(userId, subject);
  if (existing) {
    db.prepare('UPDATE subject_performance SET sent_count = sent_count + 1 WHERE id = ? AND user_id = ?').run(existing.id, userId);
  } else {
    db.prepare('INSERT INTO subject_performance (id, user_id, subject) VALUES (?, ?, ?)').run(uuidv4(), userId, subject);
  }
}

// ─── Performance metrics ──────────────────────────────────────────────────────
function getPerformanceMetrics(userId) {
  const db = getDb();
  const all      = db.prepare("SELECT outcome FROM email_performance WHERE user_id = ? AND outcome IS NOT NULL").all(userId);
  const total    = all.length;
  const accepted = all.filter(e => e.outcome === 'accepted').length;
  const rejected = all.filter(e => e.outcome === 'rejected').length;
  const ignored  = all.filter(e => e.outcome === 'ignored').length;
  const pending  = db.prepare("SELECT COUNT(*) as c FROM email_performance WHERE user_id = ? AND outcome IS NULL").get(userId).c;

  const templateScores = db.prepare('SELECT * FROM template_scores WHERE user_id = ? ORDER BY performance_score DESC').all(userId);
  const subjectScores  = db.prepare('SELECT * FROM subject_performance WHERE user_id = ? ORDER BY performance_score DESC LIMIT 10').all(userId);
  const strategy       = getStrategy(userId);

  return {
    totals: { sent: total + pending, with_outcome: total, pending },
    rates: {
      response_rate:   total > 0 ? Math.round(((accepted + rejected) / total) * 100) : 0,
      acceptance_rate: total > 0 ? Math.round((accepted / total) * 100) : 0,
      rejection_rate:  total > 0 ? Math.round((rejected / total) * 100) : 0,
      ignore_rate:     total > 0 ? Math.round((ignored / total) * 100) : 0,
    },
    template_scores: templateScores,
    top_subjects:    subjectScores.slice(0, 5),
    strategy,
    next_analysis_at: total + pending > 0
      ? `After ${Math.max(0, ANALYSIS_THRESHOLD - (total % ANALYSIS_THRESHOLD))} more outcomes`
      : 'After 10 email outcomes',
  };
}

// ─── Emails pending outcome (for feedback UI) ─────────────────────────────────
function getPendingOutcomes(userId) {
  const db = getDb();
  // Emails older than 3 days without outcome
  const cutoff = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
  return db.prepare(`
    SELECT * FROM email_performance
    WHERE user_id = ? AND outcome IS NULL AND sent_at <= ?
    ORDER BY sent_at ASC
  `).all(userId, cutoff);
}

module.exports = {
  recordEmailSent, setEmailOutcome, runPatternAnalysis,
  getStrategy, selectTemplateWeighted, trackSubjectSent,
  getPerformanceMetrics, getPendingOutcomes,
};
