const { generateContent } = require('./geminiService');
const { generateResumePDF, generateCoverLetterPDF } = require('./pdfService');
const { generateDocxFromText } = require('./resumeService');
const logger = require('../utils/logger');

// ─── 5 Email Templates (structure + tone variation) ───────────────────────────
const EMAIL_TEMPLATES = [
  {
    index: 0,
    style: 'Professional narrative',
    opening: 'connection_to_company',
    closing: 'forward_looking',
    description: 'Leads with why this specific company, ends with a specific ask'
  },
  {
    index: 1,
    style: 'Achievement-first',
    opening: 'lead_with_result',
    closing: 'mutual_benefit',
    description: 'Opens with a quantified achievement, pivots to role fit'
  },
  {
    index: 2,
    style: 'Problem-solution',
    opening: 'company_challenge',
    closing: 'offer_value',
    description: 'Identifies a company challenge, positions candidate as solution'
  },
  {
    index: 3,
    style: 'Concise direct',
    opening: 'direct_ask',
    closing: 'brief_cta',
    description: 'Short, punchy, respects their time — under 150 words'
  },
  {
    index: 4,
    style: 'Curiosity-driven',
    opening: 'interesting_observation',
    closing: 'open_ended_question',
    description: 'Opens with a genuine observation about the company, ends with a question'
  },
];

// ─── Anti-spam: banned / overused phrases ─────────────────────────────────────
const BANNED_PHRASES = [
  'urgent', 'application for', 'i am applying', 'job opportunity',
  'i would like to express', 'please find attached', 'to whom it may concern',
  'dear hiring manager', 'i am a hard worker', 'passionate about',
  'team player', 'results-driven', 'detail-oriented'
];

// ─── Anti-spam: subject line templates ────────────────────────────────────────
const SUBJECT_TEMPLATES = [
  (role, company) => `${role} — ${company} fit?`,
  (role, company) => `Re: ${role} role at ${company}`,
  (role, company) => `Quick note — ${role} at ${company}`,
  (role, company) => `${company} × ${role} — Worth a conversation?`,
  (role, company) => `${role} background — ${company} alignment`,
  (role, company) => `Exploring ${role} opportunities — ${company}`,
];

async function generateVariedEmail({
  resumeText, companyName, role, companyInfo, personality,
  templateIndex, subjectVariant, existingSubjectsUsed = [],
  strategyHints = null, personalizationType = 'company_mention'
}) {
  const template = EMAIL_TEMPLATES[templateIndex % EMAIL_TEMPLATES.length];

  const strategySection = strategyHints ? `
LEARNED STRATEGY (apply these insights from past performance):
- Opening style that works: ${strategyHints.bestOpening || 'not specified'}
- Closing style that works: ${strategyHints.bestClosing || 'not specified'}
- Target length: ${strategyHints.bestLength || '150-200'} words
- Phrases that got responses: ${strategyHints.promote.join(', ') || 'none yet'}
- Phrases to AVOID (poor performers): ${strategyHints.avoid.join(', ') || 'none yet'}
` : '';

  const personalizationGuide = {
    company_mention: 'Reference something specific about the company (product, mission, recent news)',
    role_skills: 'Lead with a skill directly relevant to this specific role',
    achievement: 'Open with a concrete achievement or result from candidate experience',
  }[personalizationType] || 'Reference something specific about the company';

  let subject = '';
  for (let i = 0; i < SUBJECT_TEMPLATES.length; i++) {
    const candidate = SUBJECT_TEMPLATES[(subjectVariant + i) % SUBJECT_TEMPLATES.length](role, companyName);
    if (!existingSubjectsUsed.includes(candidate)) {
      subject = candidate;
      break;
    }
  }
  if (!subject) subject = SUBJECT_TEMPLATES[subjectVariant % SUBJECT_TEMPLATES.length](role, companyName);

  const personalities = [
    'formal_confident', 'friendly_professional',
    'concise_direct', 'enthusiastic_genuine', 'analytical_detailed'
  ];
  const defaultPersonality = personalities[Math.floor(Math.random() * personalities.length)];

  const toneMap = {
    formal: 'Polite, structured, professional. No contractions.',
    confident: 'Strong, assertive, achievement-focused. Active voice.',
    formal_confident: 'Professional AND assertive — structured but impactful.',
    friendly_professional: 'Warm, personable, yet professional and respectful.',
    concise_direct: 'Short, punchy, direct to the point without filler.',
    enthusiastic_genuine: 'Authentic excitement about the company and role.',
    analytical_detailed: 'Data-driven, logical, highlighting metrics and impact.',
  };
  const tone = toneMap[personality] || toneMap[defaultPersonality] || toneMap.formal_confident;

  const prompt = `You are writing a cold email job application. Write a UNIQUE email that will NOT be caught by spam filters.

TEMPLATE STYLE: ${template.style}
OPENING STRATEGY: ${template.opening}
CLOSING STRATEGY: ${template.closing}
TONE: ${tone}
PERSONALIZATION APPROACH: ${personalizationGuide}

${strategySection}

CANDIDATE RESUME:
${resumeText.substring(0, 2000)}

TARGET: ${role} at ${companyName}
COMPANY CONTEXT: ${companyInfo || 'Research the company and reference something specific'}

STRICT ANTI-SPAM RULES:
- Do NOT use these phrases: ${BANNED_PHRASES.join(', ')}
- Do NOT use identical sentence structures from previous emails
- MUST include: candidate's name, a specific skill, the exact role name, company name
- Subject line already chosen: "${subject}" — do NOT put subject in body
- Keep email under 200 words
- Natural, human writing — not AI-sounding
- No bullet points in email body (prose only)

Return ONLY valid JSON (no markdown):
{
  "subject": "${subject}",
  "email_body": "<email body as HTML with <p> tags only, under 200 words>",
  "cover_letter": "<3-paragraph cover letter, plain text, varied from previous versions>"
}`;

  try {
    const rawText = await generateContent(prompt);
    const clean = rawText.trim().replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    const bodyLower = result.email_body.toLowerCase();
    if (BANNED_PHRASES.some(p => bodyLower.includes(p))) {
      logger.warn('Banned phrase detected in generated email', { companyName, role });
    }

    return { ...result, template_index: templateIndex };
  } catch (err) {
    logger.error('Email variation generation failed', { error: err.message });
    throw new Error(`Email variation failed: ${err.message}`);
  }
}

async function generateResumeVariant(resumeText, candidateName, variant) {
  const variantStyles = {
    0: 'Standard format: Experience → Skills → Education → Certifications',
    1: 'Compact format: Skills summary → Experience (condensed bullets) → Education',
    2: 'Skills-first format: Technical Skills highlighted first → Experience → Education',
  };

  const style = variantStyles[variant % 3] || variantStyles[0];

  const prompt = `Rewrite this resume in a DIFFERENT FORMAT to avoid pattern detection by email systems.

FORMAT TO USE: ${style}

ORIGINAL RESUME:
${resumeText}

RULES:
- Keep all facts and data IDENTICAL — do not add or remove experience/skills
- Change the structure, section order, and bullet phrasing
- Vary sentence beginnings (not all starting with action verbs)
- Keep ATS keywords but rephrase surrounding text
- Maintain professional quality

Return ONLY the rewritten resume text. No explanations.`;

  try {
    const rawText = await generateContent(prompt);
    const variantText = rawText.trim();

    const baseName = `resume_v${variant}_${Date.now()}`;
    const pdfPath = await generateResumePDF(variantText, baseName).catch(() => null);
    const docxPath = await generateDocxFromText(variantText, baseName).catch(() => null);

    return { text: variantText, pdf_path: pdfPath, docx_path: docxPath, variant };
  } catch (err) {
    logger.error('Resume variant generation failed', { error: err.message, variant });
    throw err;
  }
}

async function generateCoverLetterVariant(coverLetterText, candidateName, companyName, role, variant) {
  const toneVariants = [
    'Enthusiastic but professional — shows genuine excitement about the company specifically',
    'Measured and analytical — focuses on data points and specific contributions',
    'Storytelling approach — opens with a micro-story that connects to the role',
  ];
  const tone = toneVariants[variant % 3];

  const prompt = `Rewrite this cover letter with a DIFFERENT tone and phrasing structure to avoid pattern detection.

NEW TONE: ${tone}
COMPANY: ${companyName}
ROLE: ${role}

ORIGINAL COVER LETTER:
${coverLetterText}

RULES:
- Keep all factual claims identical (same achievements, same skills)
- Change: opening paragraph, sentence patterns, transitions, closing
- No banned phrases: "I am passionate about", "team player", "please find attached", "to whom it may concern"
- 3 paragraphs, plain text
- Natural and human-sounding

Return ONLY the rewritten cover letter text.`;

  try {
    const rawText = await generateContent(prompt);
    const variantText = rawText.trim();
    const pdfPath = await generateCoverLetterPDF(variantText, candidateName, companyName, role).catch(() => null);
    return { text: variantText, pdf_path: pdfPath };
  } catch (err) {
    logger.error('Cover letter variant generation failed', { error: err.message });
    throw err;
  }
}

function getInitialStrategy(userId = null) {
  const personalities = [
    'formal_confident', 'friendly_professional',
    'concise_direct', 'enthusiastic_genuine', 'analytical_detailed'
  ];
  const defaultPersonality = personalities[Math.floor(Math.random() * personalities.length)];
  return {
    best_tone: defaultPersonality,
    best_personalization: 'company_mention',
    best_length_range: '150-200',
    best_opening_style: null,
    best_closing_style: null,
    avoid_patterns: [],
    promote_patterns: [],
    template_weights: {}
  };
}

module.exports = {
  generateVariedEmail,
  generateResumeVariant,
  generateCoverLetterVariant,
  EMAIL_TEMPLATES,
  BANNED_PHRASES,
  personalities: [
    'formal_confident', 'friendly_professional',
    'concise_direct', 'enthusiastic_genuine', 'analytical_detailed'
  ],
  getInitialStrategy,
};