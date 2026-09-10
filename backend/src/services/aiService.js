'use strict';
const Anthropic = require('@anthropic-ai/sdk');
const logger    = require('../utils/logger');
const { getAtsContext, ATS_SYSTEM_KNOWLEDGE } = require('./atsKnowledge');
const { generateContent } = require('./geminiService');

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function matchJobToResume(resumeText, jobDescription, jobTitle = '') {
  const prompt = `You are a world-class ATS specialist and senior recruiter with 15 years of experience.

ATS SCORING CONTEXT:
${getAtsContext()}

Use this ATS knowledge when scoring the resume.

TASK: Analyze this resume against the job description.

RESUME:
${resumeText}

JOB TITLE: ${jobTitle}
JOB DESCRIPTION:
${jobDescription}

Return ONLY valid JSON (no markdown):
{
  "match_score": <integer 0-100, weighted: 35% keywords, 25% experience, 15% education, 15% achievements, 10% format>,
  "skills_match": {
    "matched": ["exact skill from JD found in resume"],
    "missing": ["skill in JD not found in resume"],
    "ats_keywords_found": ["keyword ATS would flag as match"],
    "ats_keywords_missing": ["high-value keyword from JD that is absent"]
  },
  "experience_match": {
    "required_years": <number or null>,
    "candidate_years": <number or null>,
    "meets_requirement": <boolean>
  },
  "role_fit": { "score": <0-100>, "notes": "<brief>" },
  "missing_requirements": ["specific missing req"],
  "strengths": ["concrete strength relevant to JD"],
  "ats_issues": ["formatting or content issue hurting ATS score"],
  "recommendation": "<AUTO_APPLY if match_score >= 50, else ASK_USER>",
  "reason": "<specific explanation referencing actual resume vs JD>",
  "quick_wins": ["one change that would boost match score"]
}

SCORING: 80-100=Excellent AUTO_APPLY, 50-79=Good AUTO_APPLY, 0-49=Low ASK_USER. Be strict and realistic.`;

  try {
    const rawText = await generateContent(prompt);
    const clean = rawText.trim().replace(/```json|```/g, '').trim();
    let parsed;
    try {
      parsed = JSON.parse(clean);
    } catch {
      parsed = {
        match_score: 0,
        skills_match: {},
        missing_requirements: [],
        should_apply: false,
        recommendation: 'ASK_USER',
        reason: 'AI returned an unreadable response. Please try again.',
        ats_issues: [],
        strengths: [],
        quick_wins: [],
        _parse_error: true,
      };
    }
    return parsed;
  } catch (err) {
    logger.error('Job matching failed', { error: err.message });
    throw new Error(`Job matching failed: ${err.message}`);
  }
}

async function tailorResume(resumeText, jobDescription, jobTitle = '') {
  const prompt = `You are a world-class resume writer and ATS optimization expert.

ATS SCORING CONTEXT:
${getAtsContext()}

Use this ATS knowledge when tailoring the resume.

TASK: Rewrite this resume to MAXIMIZE ATS score for the target job.

ORIGINAL RESUME:
${resumeText}

TARGET JOB TITLE: ${jobTitle}
JOB DESCRIPTION:
${jobDescription}

MANDATORY RULES:
1. Extract ALL keywords from the JD and inject them NATURALLY
2. Mirror exact phrases from the JD (ATS does literal matching)
3. Use BOTH acronyms AND full forms: "REST APIs (Representational State Transfer)"
4. Rewrite experience bullets to highlight achievements relevant to THIS job
5. Add quantified metrics wherever possible (even estimates: ~30% improvement)
6. Reorder skills section to put JD-matching skills FIRST
7. Update professional summary to match this specific role
8. Keep ALL FACTS TRUE — never fabricate experience or skills
9. Use standard ATS-safe headings: SKILLS, EXPERIENCE, EDUCATION, PROJECTS, CERTIFICATIONS
10. NO tables, NO columns — single-column format only
11. Use strong action verbs: Engineered, Architected, Led, Optimized, Reduced, Scaled

Return ONLY the complete tailored resume text with clear sections. No JSON, no explanations.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }]
    });
    return response.content[0].text.trim();
  } catch (err) {
    logger.error('Resume tailoring failed', { error: err.message });
    throw new Error(`Resume tailoring failed: ${err.message}`);
  }
}

async function generateApplicationAnswer(question, resumeText, jobDescription, wordLimit = 150, personality = 'formal_confident', userContext = '') {
  // PART A: Question Classification
  let questionType = 'general';
  try {
    const cr = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 20,
      messages: [{ role: 'user', content: `Classify this job application question into ONE category. Return ONLY the category word.\nCategories: salary | gap | relocation | why_hire | general\nQuestion: "${question}"` }]
    });
    questionType = cr.content[0].text.trim().toLowerCase().replace(/[^a-z_]/g, '');
  } catch { questionType = 'general'; }

  const strategies = {
    salary:    `Strategy: Give a realistic salary range for Indian fresher market (3L-6L full-time, 10k-25k/month internship). Never undervalue.`,
    gap:       `Strategy: Frame gap as deliberate self-improvement (coursework, projects, certifications, GATE prep). Never defensive.`,
    relocation:`Strategy: Show openness. Candidate is in Kota, Rajasthan. Show flexibility but be realistic.`,
    why_hire:  `Strategy: Include top 2 technical skills + one specific internship achievement + clear value proposition. 120-180 words. No clichés.`,
    general:   `Strategy: Answer from resume facts only. If not in resume, say so honestly. Never fabricate.`
  };

  const toneInstructions = {
    formal:           `Tone: Polite, structured, professional. No contractions.`,
    confident:        `Tone: Strong, assertive, achievement-focused. Active voice.`,
    formal_confident: `Tone: Professional AND assertive. Structured but impactful. DEFAULT tone.`
  };

  const generatePrompt = `You are helping a job applicant craft a perfect application answer.

QUESTION TYPE: ${questionType}
QUESTION: "${question}"

CANDIDATE RESUME:
${resumeText}

JOB DESCRIPTION:
${jobDescription || 'Not provided'}

USER CONTEXT (salary expectations, location, etc.):
${userContext || 'Not provided'}

${strategies[questionType] || strategies.general}

${toneInstructions[personality] || toneInstructions.formal_confident}

SAFETY RULES:
- No fake claims or fabricated experience
- No weak filler phrases ("I am passionate about...", "team player", "quick learner")
- No robotic language
- Use user context (salary, location) when relevant

Length: ${questionType === 'why_hire' ? '120-180' : `${Math.round(wordLimit * 0.7)}-${wordLimit}`} words.
Write ONLY the answer. No preamble.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 500,
      messages: [{ role: 'user', content: generatePrompt }]
    });

    const answer = response.content[0].text.trim();
    const banned = ['i am passionate', 'team player', 'hard worker', 'quick learner', 'results-driven'];
    const hasBanned = banned.some(b => answer.toLowerCase().includes(b));
    const wordCount = answer.split(/\s+/).length;

    if (wordCount < 30 || hasBanned) {
      const retryRes = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [
          { role: 'user', content: generatePrompt },
          { role: 'assistant', content: answer },
          { role: 'user', content: 'This answer contains generic phrases or is too short. Rewrite — be specific, concrete, avoid all clichés.' }
        ]
      });
      return retryRes.content[0].text.trim();
    }
    return answer;
  } catch (err) {
    logger.error('Answer generation failed', { error: err.message });
    throw new Error(`Answer generation failed: ${err.message}`);
  }
}

async function generateEmailApplication(resumeText, companyName, role, companyInfo = '', personality = 'formal_confident') {
  const toneMap = {
    formal:           'Polite, structured, professional. No contractions.',
    confident:        'Strong, assertive, achievement-focused. Active voice.',
    formal_confident: 'Professional AND assertive — structured but impactful.'
  };

  const prompt = `You are an expert job application writer.
Generate a complete email job application. Return ONLY valid JSON (no markdown).

CANDIDATE RESUME:
${resumeText}

COMPANY: ${companyName}
ROLE: ${role}
COMPANY INFO: ${companyInfo || 'Not provided'}
TONE: ${toneMap[personality] || toneMap.formal_confident}

Return JSON:
{
  "subject": "<compelling subject line>",
  "email_body": "<professional email body HTML with <p> tags>",
  "cover_letter": "<formal cover letter plain text, 3-4 paragraphs>",
  "suggested_roles": ["<role 1>", "<role 2>", "<role 3>"]
}

REQUIREMENTS: Personalized to company, highlights top 3 skills/achievements, no AI clichés, no fake claims.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }]
    });
    const clean = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    logger.error('Email generation failed', { error: err.message });
    throw new Error(`Email generation failed: ${err.message}`);
  }
}

async function discoverJobs(resumeText, preferences) {
  const userPrefs = preferences || {};
  // Note: Anthropic web search tool type 'web_search_20250305' requires @anthropic-ai/sdk >= 0.27.0 (currently ^0.24.0 in package.json).
  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      tools: [
        {
          type: 'web_search_20250305',
          name: 'web_search',
        }
      ],
      system: `You are a job discovery assistant.
      Search the web for REAL, CURRENT job listings that
      match the candidate's profile. Only return jobs that
      actually exist right now with real apply URLs.
      Return results as a JSON array only, no other text.`,
      messages: [
        {
          role: 'user',
          content: `Find real job listings for this candidate.
          
          CANDIDATE PROFILE:
          Preferred roles: ${userPrefs.preferred_roles || 'Software Engineer'}
          Preferred locations: ${userPrefs.preferred_locations || 'Remote'}
          Skills: ${userPrefs.skills || ''}
          Job types: ${userPrefs.job_types || 'Full-time'}
          
          RESUME SUMMARY (first 500 chars):
          ${resumeText.substring(0, 500)}
          
          Search for: "${userPrefs.preferred_roles || 'Software Engineer'} jobs ${userPrefs.preferred_locations || 'remote'} 2025"
          
          Return a JSON array of up to 10 jobs:
          [
            {
              "title": "exact job title",
              "company": "real company name",
              "location": "city or Remote",
              "description": "2-3 sentence summary",
              "apply_url": "real URL to apply",
              "match_estimate": 85,
              "reason": "why this matches the candidate",
              "source": "web_search"
            }
          ]
          Only return the JSON array, nothing else.`,
        }
      ],
    });

    const textBlock = response.content
      .filter(b => b.type === 'text')
      .pop();
    let jobs = [];
    try {
      const clean = textBlock ? textBlock.text.trim().replace(/```json|```/g, '').trim() : '[]';
      jobs = JSON.parse(clean);
    } catch {
      jobs = [];
    }
    // Attach recommended_roles for compatibility with existing route callers
    jobs.recommended_roles = jobs;
    return jobs;
  } catch (err) {
    logger.error('Job discovery failed', { error: err.message });
    throw new Error(`Job discovery failed: ${err.message}`);
  }
}

async function analyzeFeedbackAndLearn(feedbackHistory, resumeText) {
  if (!feedbackHistory || feedbackHistory.length < 2) return null;

  const summary = feedbackHistory.map(f => {
    let answersSnippet = '';
    if (f.answers_used) {
      try {
        const a = JSON.parse(f.answers_used);
        answersSnippet = a.slice(0, 2).map(x => `Q: ${(x.question || '').slice(0, 40)} | Tone: ${x.personality}`).join('; ');
      } catch {}
    }
    return `Job: ${f.job_title} @ ${f.company} | Score: ${f.match_score} | Outcome: ${f.outcome} | Resume: ${f.resume_version} | Answers: ${answersSnippet}`;
  }).join('\n');

  const prompt = `You are an AI career coach analyzing job application outcomes.

FEEDBACK HISTORY:
${summary}

CURRENT RESUME EXCERPT:
${resumeText.substring(0, 1500)}

Analyze patterns and return ONLY valid JSON:
{
  "success_rate": <0-100>,
  "top_performing_roles": ["role1", "role2"],
  "weak_areas": ["area1", "area2"],
  "resume_improvements": ["specific actionable improvement 1", "improvement 2"],
  "answer_strategy_improvements": ["what worked", "what to change"],
  "recommended_min_score": <40-90>,
  "success_probability_factors": ["factor1", "factor2"],
  "summary": "<2-sentence coaching insight>"
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 800,
      messages: [{ role: 'user', content: prompt }]
    });
    const clean = response.content[0].text.trim().replace(/```json|```/g, '').trim();
    return JSON.parse(clean);
  } catch (err) {
    logger.error('Learning analysis failed', { error: err.message });
    return null;
  }
}

module.exports = {
  matchJobToResume,
  tailorResume,
  generateApplicationAnswer,
  generateEmailApplication,
  discoverJobs,
  analyzeFeedbackAndLearn
};
