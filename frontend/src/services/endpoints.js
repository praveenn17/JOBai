/**
 * JobAI — API Endpoint Map
 *
 * Single source of truth. Every backend route listed here.
 * Use these constants instead of hardcoding strings in components.
 *
 * Import:
 *   import { ENDPOINTS, buildUrl } from '../services/endpoints';
 *
 * Examples:
 *   api.get(ENDPOINTS.resume.list)
 *   api.post(ENDPOINTS.jobs.analyze, payload)
 *   api.get(buildUrl(ENDPOINTS.resume.download, { id: resumeId }))
 */

export const ENDPOINTS = {

  // ── Auth ─────────────────────────────────────────────────────────────────
  auth: {
    register:           '/auth/register',           // POST  { name, email, password, phone?, location? }
    login:              '/auth/login',              // POST  { email, password }
    me:                 '/auth/me',                 // GET   → { user, preferences }
    profile:            '/auth/profile',            // PUT   { name, phone?, location? } → { user }
    preferences:        '/auth/preferences',        // GET → { preferences }  |  PUT { preferred_roles, ... }
    changePassword:     '/auth/change-password',    // PUT   { current_password, new_password }
    deleteAccount:      '/auth/account',            // DELETE { password }
    forgotPassword:     '/auth/forgot-password',    // POST  { email }
    resetPassword:      '/auth/reset-password',     // POST  { token, new_password }
    verifyEmail:        '/auth/verify-email',       // GET   ?token=xxx  (email link click)
    resendVerification: '/auth/resend-verification',// POST  (requires auth)
    // ── Two-factor auth ────────────────────────────────────────────────────
    signupStep1:        '/auth/signup-step1',       // POST  { name, email, password, phone? }
    signupStep2:        '/auth/signup-step2',       // POST  { email, otp }
    signinStep1:        '/auth/signin-step1',       // POST  { email, password }
    signinStep2:        '/auth/signin-step2',       // POST  { email, otp }
    resendOtp:          '/auth/resend-otp',         // POST  { email, purpose }
  },


  // ── Resume ───────────────────────────────────────────────────────────────
  resume: {
    upload:   '/resume/upload',           // POST  multipart field: 'resume'  → { resume }
    list:     '/resume',                  // GET   → { resumes: [] }
    get:      '/resume/:id',             // GET   → { resume }
    download: '/resume/:id/download',    // GET   → file download
    activate: '/resume/:id/activate',    // PUT   → { message }
    delete:   '/resume/:id',             // DELETE → { message }
  },

  // ── Jobs ─────────────────────────────────────────────────────────────────
  jobs: {
    analyze:        '/jobs/analyze',              // POST  { jobs: [{ title, description, apply_url, company }] }
    list:           '/jobs',                      // GET   ?status=pending|approved|rejected&limit=50&offset=0
    tailor:         '/jobs/:id/tailor',           // POST  → { tailored_resume_text, pdf_url, docx_url }
    reject:         '/jobs/:id/reject',           // POST  → { message }
    discover:       '/jobs/discover',             // POST  (manual trigger AI discovery now)
    discoveredList: '/jobs/discovered',           // GET   ?status=pending → { jobs, pending_count }
    discoveredAct:  '/jobs/discovered/:id/action',// POST  { action: 'apply'|'reject' }
  },

  // ── Applications ─────────────────────────────────────────────────────────
  applications: {
    start:        '/applications/start',          // POST  { job_id, user_confirmed?: bool }
    list:         '/applications',                // GET   ?status=&page=1&limit=20 → { applications, total, pages }
    stats:        '/applications/stats',          // GET   → { total, by_status, ... }
    export:       '/applications/export',         // GET   → CSV blob
    logs:         '/applications/logs/recent',    // GET   → { logs }
    get:          '/applications/:id',            // GET   → { application }
    autoApply:    '/applications/:id/auto-apply', // POST  → triggers Playwright automation
    markApplied:  '/applications/:id/mark-applied',// POST → { message }
    answerQ:      '/applications/answer-question', // POST  { question, job_id, application_id? }
  },

  // ── Email Apply ───────────────────────────────────────────────────────────
  email: {
    generate:       '/email/generate',            // POST  { company_name, role, recipient_email, company_info?, personality? }
    send:           '/email/:id/send',            // POST  → sends via SMTP
    list:           '/email',                     // GET   ?status= → { emails }
    get:            '/email/:id',                 // GET   → { email }
    update:         '/email/:id',                 // PUT   { status?, subject?, body? }
    setOutcome:     '/email/outcome/:id',         // POST  { outcome: 'accepted'|'rejected'|'no_response' }
    pendingOutcomes:'/email/pending-outcomes',    // GET   → { pending: [] }
    analytics:      '/email/analytics',           // GET   → { strategy, template_scores, ... }
    analyzeNow:     '/email/analyze-now',         // POST  → force AI strategy re-analysis
    verifyConfig:   '/email/verify-config',       // GET   → { ok, message }
  },

  // ── Feedback ──────────────────────────────────────────────────────────────
  feedback: {
    submit:   '/feedback',                        // POST  { application_id, outcome, feedback_notes?, role?, match_score? }
    list:     '/feedback',                        // GET   → { feedback: [] }
    pending:  '/feedback/pending',                // GET   → { pending: [] }
    analyze:  '/feedback/analyze',               // POST  → triggers AI learning re-analysis
    insights: '/feedback/insights',              // GET   → { insights }
  },

  // ── Rate Limits & Queue ───────────────────────────────────────────────────
  limits: {
    status: '/limits',                            // GET   → { rate_limits, queues, tracking }
  },

  // ── Notifications ─────────────────────────────────────────────────────────
  notifications: {
    list:     '/notifications',                   // GET   ?limit=20 → { notifications, unread }
    markRead: '/notifications/:id/read',          // PUT   → { message }
    markAll:  '/notifications/read-all',          // PUT   → { message }
    clear:    '/notifications',                   // DELETE → { message }
  },

  // ── Health ────────────────────────────────────────────────────────────────────
  health: '/health',                              // GET (no /api prefix — call axios directly with full URL)


  // ── Resume Tailor ─────────────────────────────────────────────────────────────
  resumeTailor: {
    tailor:   '/resume-tailor/tailor',            // POST  { job_description, job_title? } → { tailored_text, pdf_url, docx_url }
    download: '/resume-tailor/download/:filename',// GET   → file attachment
  },

  // ── Eligibility Checker ───────────────────────────────────────────────────────
  eligibility: {
    start:  '/eligibility/start',                 // POST  { job_description, job_title? } → { session_id, first_question, ... }
    answer: '/eligibility/answer',                // POST  { session_id, answer } → next question OR verdict
  },

  // ── Profile & Onboarding ──────────────────────────────────────────────────────
  profile: {
    get:                '/profile',               // GET   → { profile, projects, experience, certifications, achievements }
    personal:           '/profile/personal',      // PUT   → { message, completion_percentage }
    academic:           '/profile/academic',      // PUT
    skills:             '/profile/skills',        // PUT
    links:              '/profile/links',         // PUT
    preferences:        '/profile/preferences',   // PUT
    summary:            '/profile/summary',       // PUT
    projects:           '/profile/projects',      // GET | POST
    projectById:        '/profile/projects/:id',  // PUT | DELETE
    experience:         '/profile/experience',    // GET | POST
    experienceById:     '/profile/experience/:id',// PUT | DELETE
    certifications:     '/profile/certifications',       // GET | POST
    certificationById:  '/profile/certifications/:id',   // PUT | DELETE
    achievements:       '/profile/achievements',         // GET | POST
    achievementById:    '/profile/achievements/:id',     // PUT | DELETE
  },
};


/**
 * Replace :param tokens in a URL template.
 *
 * @param {string} template - e.g. ENDPOINTS.resume.download  ('/resume/:id/download')
 * @param {object} params   - e.g. { id: '123' }
 * @returns {string}        - '/resume/123/download'
 *
 * @example
 *   api.get(buildUrl(ENDPOINTS.resume.activate, { id: resume.id }))
 *   api.post(buildUrl(ENDPOINTS.email.send, { id: emailId }))
 */
export function buildUrl(template, params = {}) {
  return Object.entries(params).reduce(
    (url, [key, value]) => url.replace(`:${key}`, encodeURIComponent(String(value))),
    template
  );
}
