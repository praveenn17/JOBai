'use strict';

/**
 * JobAI — User Profile Routes
 *
 * All routes require a valid JWT (authMiddleware).
 *
 * Completion scoring (100 points max):
 *   personal_info   15  first_name + last_name + dob + gender + city + state
 *   academic        20  class10 data + ug data
 *   skills          15  ≥3 technical_skills
 *   links           10  github_url OR linkedin_url
 *   projects        15  ≥1 project
 *   experience      10  ≥1 experience OR is_fresher = 1
 *   certifications   5  ≥1 cert (tracked via DB count, no explicit "skipped" flag needed)
 *   preferences     10  preferred_roles has ≥1 entry
 *
 * is_complete = 1 when completion_percentage >= 80
 */

const express       = require('express');
const { v4: uuidv4 } = require('uuid');
const { getDb }     = require('../database/db');
const authMiddleware = require('../middleware/auth');
const logger        = require('../utils/logger');

const router = express.Router();
router.use(authMiddleware);

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Parse a JSON array column. Returns [] on any error. */
function parseArr(raw) {
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (_) { return []; }
}

/** Stringify an array, falling back to '[]' */
function toJson(val) {
  if (val === null || val === undefined) return '[]';
  if (typeof val === 'string') {
    try { JSON.parse(val); return val; } catch (_) {}
    return '[]';
  }
  return JSON.stringify(val);
}

/**
 * Recalculate completion percentage from the current profile + related table counts.
 * Updates completion_percentage and is_complete in DB.
 * Returns the new integer percentage.
 */
function recalcCompletion(userId) {
  const db = getDb();
  const p = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  if (!p) return 0;

  let score = 0;
  const sections = [];

  // personal_info (15)
  const hasPersonal = p.first_name && p.last_name && p.date_of_birth && p.gender && p.city && p.state;
  if (hasPersonal) { score += 15; sections.push('personal_info'); }

  // academic (20)
  const hasClass10 = p.class10_school && p.class10_board && p.class10_year;
  const hasUg = p.ug_college && p.ug_degree;
  if (hasClass10 && hasUg) { score += 20; sections.push('academic'); }
  else if (hasClass10 || hasUg) { score += 10; } // partial credit

  // skills (15)
  const techSkills = parseArr(p.technical_skills);
  if (techSkills.length >= 3) { score += 15; sections.push('skills'); }
  else if (techSkills.length > 0) { score += 5; }

  // links (10)
  if (p.github_url || p.linkedin_url) { score += 10; sections.push('links'); }

  // projects (15)
  const projectCount = db.prepare('SELECT COUNT(*) as c FROM user_projects WHERE user_id = ?').get(userId).c;
  if (projectCount >= 1) { score += 15; sections.push('projects'); }

  // experience (10)
  const expCount = db.prepare('SELECT COUNT(*) as c FROM user_experience WHERE user_id = ?').get(userId).c;
  if (expCount >= 1 || p.is_fresher === 1) { score += 10; sections.push('experience'); }

  // certifications (5)
  const certCount = db.prepare('SELECT COUNT(*) as c FROM user_certifications WHERE user_id = ?').get(userId).c;
  if (certCount >= 1) { score += 5; sections.push('certifications'); }

  // preferences (10)
  const roles = parseArr(p.preferred_roles);
  if (roles.length >= 1) { score += 10; sections.push('preferences'); }

  const pct = Math.min(score, 100);
  const isComplete = pct >= 80 ? 1 : 0;

  db.prepare(`
    UPDATE user_profiles
    SET completion_percentage = ?, completed_sections = ?, is_complete = ?, updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(pct, JSON.stringify(sections), isComplete, userId);

  return pct;
}

/** Build a full profile object with all related tables */
function buildFullProfile(userId) {
  const db = getDb();
  const profile  = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(userId);
  const projects = db.prepare('SELECT * FROM user_projects WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(userId);
  const experience = db.prepare('SELECT * FROM user_experience WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(userId);
  const certifications = db.prepare('SELECT * FROM user_certifications WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(userId);
  const achievements = db.prepare('SELECT * FROM user_achievements WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(userId);

  return { profile, projects, experience, certifications, achievements };
}

// ─── GET /api/profile ─────────────────────────────────────────────────────────

router.get('/', (req, res) => {
  try {
    const db = getDb();
    // Ensure profile row exists
    let profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
    if (!profile) {
      db.prepare('INSERT OR IGNORE INTO user_profiles (id, user_id) VALUES (?, ?)').run(uuidv4(), req.user.id);
      profile = db.prepare('SELECT * FROM user_profiles WHERE user_id = ?').get(req.user.id);
    }
    res.json(buildFullProfile(req.user.id));
  } catch (err) {
    logger.error('GET /profile error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/profile/personal ────────────────────────────────────────────────

router.put('/personal', (req, res) => {
  try {
    const db = getDb();
    const {
      first_name, middle_name, last_name, date_of_birth, gender, alternate_phone,
      current_address, permanent_address, city, state, country, pincode,
      parent_name, parent_phone, parent_relation,
      emergency_contact_name, emergency_contact_phone,
    } = req.body;

    db.prepare(`
      UPDATE user_profiles SET
        first_name = COALESCE(?, first_name),
        middle_name = COALESCE(?, middle_name),
        last_name = COALESCE(?, last_name),
        date_of_birth = COALESCE(?, date_of_birth),
        gender = COALESCE(?, gender),
        alternate_phone = COALESCE(?, alternate_phone),
        current_address = COALESCE(?, current_address),
        permanent_address = COALESCE(?, permanent_address),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        country = COALESCE(?, country),
        pincode = COALESCE(?, pincode),
        parent_name = COALESCE(?, parent_name),
        parent_phone = COALESCE(?, parent_phone),
        parent_relation = COALESCE(?, parent_relation),
        emergency_contact_name = COALESCE(?, emergency_contact_name),
        emergency_contact_phone = COALESCE(?, emergency_contact_phone),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      first_name || null, middle_name || null, last_name || null,
      date_of_birth || null, gender || null, alternate_phone || null,
      current_address || null, permanent_address || null,
      city || null, state || null, country || null, pincode || null,
      parent_name || null, parent_phone || null, parent_relation || null,
      emergency_contact_name || null, emergency_contact_phone || null,
      req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Personal info updated.', completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/personal error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/profile/academic ────────────────────────────────────────────────

router.put('/academic', (req, res) => {
  try {
    const db = getDb();
    const {
      class10_school, class10_board, class10_year, class10_percentage, class10_cgpa,
      class12_school, class12_board, class12_stream, class12_year, class12_percentage, class12_cgpa,
      has_diploma, diploma_institute, diploma_course, diploma_specialization, diploma_year, diploma_percentage,
      ug_college, ug_university, ug_degree, ug_course, ug_branch,
      ug_enrollment_year, ug_graduation_year, ug_current_semester, ug_cgpa, ug_percentage,
      ug_backlogs, ug_active_backlogs,
      has_pg, pg_college, pg_degree, pg_specialization, pg_year, pg_cgpa, pg_percentage,
    } = req.body;

    db.prepare(`
      UPDATE user_profiles SET
        class10_school = COALESCE(?, class10_school),
        class10_board = COALESCE(?, class10_board),
        class10_year = COALESCE(?, class10_year),
        class10_percentage = COALESCE(?, class10_percentage),
        class10_cgpa = COALESCE(?, class10_cgpa),
        class12_school = COALESCE(?, class12_school),
        class12_board = COALESCE(?, class12_board),
        class12_stream = COALESCE(?, class12_stream),
        class12_year = COALESCE(?, class12_year),
        class12_percentage = COALESCE(?, class12_percentage),
        class12_cgpa = COALESCE(?, class12_cgpa),
        has_diploma = COALESCE(?, has_diploma),
        diploma_institute = COALESCE(?, diploma_institute),
        diploma_course = COALESCE(?, diploma_course),
        diploma_specialization = COALESCE(?, diploma_specialization),
        diploma_year = COALESCE(?, diploma_year),
        diploma_percentage = COALESCE(?, diploma_percentage),
        ug_college = COALESCE(?, ug_college),
        ug_university = COALESCE(?, ug_university),
        ug_degree = COALESCE(?, ug_degree),
        ug_course = COALESCE(?, ug_course),
        ug_branch = COALESCE(?, ug_branch),
        ug_enrollment_year = COALESCE(?, ug_enrollment_year),
        ug_graduation_year = COALESCE(?, ug_graduation_year),
        ug_current_semester = COALESCE(?, ug_current_semester),
        ug_cgpa = COALESCE(?, ug_cgpa),
        ug_percentage = COALESCE(?, ug_percentage),
        ug_backlogs = COALESCE(?, ug_backlogs),
        ug_active_backlogs = COALESCE(?, ug_active_backlogs),
        has_pg = COALESCE(?, has_pg),
        pg_college = COALESCE(?, pg_college),
        pg_degree = COALESCE(?, pg_degree),
        pg_specialization = COALESCE(?, pg_specialization),
        pg_year = COALESCE(?, pg_year),
        pg_cgpa = COALESCE(?, pg_cgpa),
        pg_percentage = COALESCE(?, pg_percentage),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      class10_school || null, class10_board || null, class10_year || null,
      class10_percentage || null, class10_cgpa || null,
      class12_school || null, class12_board || null, class12_stream || null,
      class12_year || null, class12_percentage || null, class12_cgpa || null,
      has_diploma != null ? (has_diploma ? 1 : 0) : null,
      diploma_institute || null, diploma_course || null, diploma_specialization || null,
      diploma_year || null, diploma_percentage || null,
      ug_college || null, ug_university || null, ug_degree || null,
      ug_course || null, ug_branch || null, ug_enrollment_year || null,
      ug_graduation_year || null, ug_current_semester || null,
      ug_cgpa || null, ug_percentage || null,
      ug_backlogs != null ? ug_backlogs : null,
      ug_active_backlogs != null ? ug_active_backlogs : null,
      has_pg != null ? (has_pg ? 1 : 0) : null,
      pg_college || null, pg_degree || null, pg_specialization || null,
      pg_year || null, pg_cgpa || null, pg_percentage || null,
      req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Academic info updated.', completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/academic error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/profile/skills ──────────────────────────────────────────────────

router.put('/skills', (req, res) => {
  try {
    const db = getDb();
    const {
      technical_skills, programming_languages, frameworks, databases,
      cloud_skills, dev_tools, soft_skills, languages_known,
    } = req.body;

    db.prepare(`
      UPDATE user_profiles SET
        technical_skills = COALESCE(?, technical_skills),
        programming_languages = COALESCE(?, programming_languages),
        frameworks = COALESCE(?, frameworks),
        databases = COALESCE(?, databases),
        cloud_skills = COALESCE(?, cloud_skills),
        dev_tools = COALESCE(?, dev_tools),
        soft_skills = COALESCE(?, soft_skills),
        languages_known = COALESCE(?, languages_known),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      technical_skills != null ? toJson(technical_skills) : null,
      programming_languages != null ? toJson(programming_languages) : null,
      frameworks != null ? toJson(frameworks) : null,
      databases != null ? toJson(databases) : null,
      cloud_skills != null ? toJson(cloud_skills) : null,
      dev_tools != null ? toJson(dev_tools) : null,
      soft_skills != null ? toJson(soft_skills) : null,
      languages_known != null ? toJson(languages_known) : null,
      req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Skills updated.', completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/skills error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/profile/links ───────────────────────────────────────────────────

router.put('/links', (req, res) => {
  try {
    const db = getDb();
    const {
      portfolio_url, github_url, linkedin_url, gitlab_url, personal_website,
      leetcode_url, hackerrank_url, codechef_url, codeforces_url, kaggle_url, other_links,
    } = req.body;

    db.prepare(`
      UPDATE user_profiles SET
        portfolio_url = COALESCE(?, portfolio_url),
        github_url = COALESCE(?, github_url),
        linkedin_url = COALESCE(?, linkedin_url),
        gitlab_url = COALESCE(?, gitlab_url),
        personal_website = COALESCE(?, personal_website),
        leetcode_url = COALESCE(?, leetcode_url),
        hackerrank_url = COALESCE(?, hackerrank_url),
        codechef_url = COALESCE(?, codechef_url),
        codeforces_url = COALESCE(?, codeforces_url),
        kaggle_url = COALESCE(?, kaggle_url),
        other_links = COALESCE(?, other_links),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      portfolio_url || null, github_url || null, linkedin_url || null, gitlab_url || null,
      personal_website || null, leetcode_url || null, hackerrank_url || null,
      codechef_url || null, codeforces_url || null, kaggle_url || null,
      other_links != null ? toJson(other_links) : null,
      req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Links updated.', completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/links error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/profile/preferences ────────────────────────────────────────────

router.put('/preferences', (req, res) => {
  try {
    const db = getDb();
    const {
      preferred_roles, preferred_industries, preferred_domains, preferred_employment_type,
      preferred_work_mode, preferred_locations, willing_to_relocate, expected_salary,
      notice_period, availability_to_join, career_interests,
      current_placement_status, placement_eligibility, graduation_year,
      current_academic_status, is_fresher, available_for_interviews, preferred_interview_mode,
    } = req.body;

    db.prepare(`
      UPDATE user_profiles SET
        preferred_roles = COALESCE(?, preferred_roles),
        preferred_industries = COALESCE(?, preferred_industries),
        preferred_domains = COALESCE(?, preferred_domains),
        preferred_employment_type = COALESCE(?, preferred_employment_type),
        preferred_work_mode = COALESCE(?, preferred_work_mode),
        preferred_locations = COALESCE(?, preferred_locations),
        willing_to_relocate = COALESCE(?, willing_to_relocate),
        expected_salary = COALESCE(?, expected_salary),
        notice_period = COALESCE(?, notice_period),
        availability_to_join = COALESCE(?, availability_to_join),
        career_interests = COALESCE(?, career_interests),
        current_placement_status = COALESCE(?, current_placement_status),
        placement_eligibility = COALESCE(?, placement_eligibility),
        graduation_year = COALESCE(?, graduation_year),
        current_academic_status = COALESCE(?, current_academic_status),
        is_fresher = COALESCE(?, is_fresher),
        available_for_interviews = COALESCE(?, available_for_interviews),
        preferred_interview_mode = COALESCE(?, preferred_interview_mode),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      preferred_roles != null ? toJson(preferred_roles) : null,
      preferred_industries != null ? toJson(preferred_industries) : null,
      preferred_domains != null ? toJson(preferred_domains) : null,
      preferred_employment_type != null ? toJson(preferred_employment_type) : null,
      preferred_work_mode || null,
      preferred_locations != null ? toJson(preferred_locations) : null,
      willing_to_relocate != null ? (willing_to_relocate ? 1 : 0) : null,
      expected_salary || null, notice_period || null, availability_to_join || null,
      career_interests || null, current_placement_status || null,
      placement_eligibility != null ? (placement_eligibility ? 1 : 0) : null,
      graduation_year || null, current_academic_status || null,
      is_fresher != null ? (is_fresher ? 1 : 0) : null,
      available_for_interviews != null ? (available_for_interviews ? 1 : 0) : null,
      preferred_interview_mode || null,
      req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Preferences updated.', completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/preferences error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── PUT /api/profile/summary ─────────────────────────────────────────────────

router.put('/summary', (req, res) => {
  try {
    const db = getDb();
    const { professional_summary, career_objective, areas_of_interest } = req.body;

    db.prepare(`
      UPDATE user_profiles SET
        professional_summary = COALESCE(?, professional_summary),
        career_objective = COALESCE(?, career_objective),
        areas_of_interest = COALESCE(?, areas_of_interest),
        updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ?
    `).run(
      professional_summary || null, career_objective || null, areas_of_interest || null,
      req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Summary updated.', completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/summary error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─── PROJECTS CRUD ────────────────────────────────────────────────────────────

router.get('/projects', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM user_projects WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(req.user.id);
    res.json({ projects: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/projects', (req, res) => {
  try {
    const db = getDb();
    const {
      title, description, problem_statement, technologies, programming_languages, frameworks,
      user_role, duration, team_size, is_team_project,
      project_url, github_url, live_demo_url, key_features, major_contributions, outcome,
    } = req.body;

    if (!title) return res.status(400).json({ error: 'Project title is required.' });

    const id = uuidv4();
    const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM user_projects WHERE user_id = ?').get(req.user.id);
    const nextOrder = (maxOrder?.m ?? -1) + 1;

    db.prepare(`
      INSERT INTO user_projects
        (id, user_id, title, description, problem_statement, technologies, programming_languages,
         frameworks, user_role, duration, team_size, is_team_project,
         project_url, github_url, live_demo_url, key_features, major_contributions, outcome, display_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, req.user.id, title, description || null, problem_statement || null,
      toJson(technologies), toJson(programming_languages), toJson(frameworks),
      user_role || null, duration || null,
      team_size != null ? team_size : 1,
      is_team_project ? 1 : 0,
      project_url || null, github_url || null, live_demo_url || null,
      key_features || null, major_contributions || null, outcome || null, nextOrder
    );

    const pct = recalcCompletion(req.user.id);
    const project = db.prepare('SELECT * FROM user_projects WHERE id = ?').get(id);
    res.status(201).json({ project, completion_percentage: pct });
  } catch (err) {
    logger.error('POST /profile/projects error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/projects/:id', (req, res) => {
  try {
    const db = getDb();
    const proj = db.prepare('SELECT * FROM user_projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!proj) return res.status(404).json({ error: 'Project not found.' });

    const {
      title, description, problem_statement, technologies, programming_languages, frameworks,
      user_role, duration, team_size, is_team_project,
      project_url, github_url, live_demo_url, key_features, major_contributions, outcome,
    } = req.body;

    db.prepare(`
      UPDATE user_projects SET
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        problem_statement = COALESCE(?, problem_statement),
        technologies = COALESCE(?, technologies),
        programming_languages = COALESCE(?, programming_languages),
        frameworks = COALESCE(?, frameworks),
        user_role = COALESCE(?, user_role),
        duration = COALESCE(?, duration),
        team_size = COALESCE(?, team_size),
        is_team_project = COALESCE(?, is_team_project),
        project_url = COALESCE(?, project_url),
        github_url = COALESCE(?, github_url),
        live_demo_url = COALESCE(?, live_demo_url),
        key_features = COALESCE(?, key_features),
        major_contributions = COALESCE(?, major_contributions),
        outcome = COALESCE(?, outcome)
      WHERE id = ? AND user_id = ?
    `).run(
      title || null, description || null, problem_statement || null,
      technologies != null ? toJson(technologies) : null,
      programming_languages != null ? toJson(programming_languages) : null,
      frameworks != null ? toJson(frameworks) : null,
      user_role || null, duration || null,
      team_size != null ? team_size : null,
      is_team_project != null ? (is_team_project ? 1 : 0) : null,
      project_url || null, github_url || null, live_demo_url || null,
      key_features || null, major_contributions || null, outcome || null,
      req.params.id, req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    const updated = db.prepare('SELECT * FROM user_projects WHERE id = ?').get(req.params.id);
    res.json({ project: updated, completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/projects/:id error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:id', (req, res) => {
  try {
    const db = getDb();
    const info = db.prepare('DELETE FROM user_projects WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (!info.changes) return res.status(404).json({ error: 'Project not found.' });
    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Project deleted.', completion_percentage: pct });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── EXPERIENCE CRUD ──────────────────────────────────────────────────────────

router.get('/experience', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM user_experience WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(req.user.id);
    res.json({ experience: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/experience', (req, res) => {
  try {
    const db = getDb();
    const {
      company_name, job_title, employment_type, start_date, end_date, is_current,
      location, is_remote, responsibilities, achievements, technologies, key_contributions,
    } = req.body;

    if (!company_name || !job_title) {
      return res.status(400).json({ error: 'Company name and job title are required.' });
    }

    const id = uuidv4();
    const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM user_experience WHERE user_id = ?').get(req.user.id);
    const nextOrder = (maxOrder?.m ?? -1) + 1;

    db.prepare(`
      INSERT INTO user_experience
        (id, user_id, company_name, job_title, employment_type, start_date, end_date, is_current,
         location, is_remote, responsibilities, achievements, technologies, key_contributions, display_order)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
    `).run(
      id, req.user.id, company_name, job_title, employment_type || null,
      start_date || null, end_date || null, is_current ? 1 : 0,
      location || null, is_remote ? 1 : 0,
      responsibilities || null, achievements || null,
      toJson(technologies), key_contributions || null, nextOrder
    );

    const pct = recalcCompletion(req.user.id);
    const exp = db.prepare('SELECT * FROM user_experience WHERE id = ?').get(id);
    res.status(201).json({ experience: exp, completion_percentage: pct });
  } catch (err) {
    logger.error('POST /profile/experience error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/experience/:id', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM user_experience WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Experience not found.' });

    const {
      company_name, job_title, employment_type, start_date, end_date, is_current,
      location, is_remote, responsibilities, achievements, technologies, key_contributions,
    } = req.body;

    db.prepare(`
      UPDATE user_experience SET
        company_name = COALESCE(?, company_name),
        job_title = COALESCE(?, job_title),
        employment_type = COALESCE(?, employment_type),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        is_current = COALESCE(?, is_current),
        location = COALESCE(?, location),
        is_remote = COALESCE(?, is_remote),
        responsibilities = COALESCE(?, responsibilities),
        achievements = COALESCE(?, achievements),
        technologies = COALESCE(?, technologies),
        key_contributions = COALESCE(?, key_contributions)
      WHERE id = ? AND user_id = ?
    `).run(
      company_name || null, job_title || null, employment_type || null,
      start_date || null, end_date || null,
      is_current != null ? (is_current ? 1 : 0) : null,
      location || null, is_remote != null ? (is_remote ? 1 : 0) : null,
      responsibilities || null, achievements || null,
      technologies != null ? toJson(technologies) : null,
      key_contributions || null,
      req.params.id, req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    const updated = db.prepare('SELECT * FROM user_experience WHERE id = ?').get(req.params.id);
    res.json({ experience: updated, completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/experience/:id error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/experience/:id', (req, res) => {
  try {
    const db = getDb();
    const info = db.prepare('DELETE FROM user_experience WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (!info.changes) return res.status(404).json({ error: 'Experience not found.' });
    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Experience deleted.', completion_percentage: pct });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── CERTIFICATIONS CRUD ──────────────────────────────────────────────────────

router.get('/certifications', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM user_certifications WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(req.user.id);
    res.json({ certifications: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/certifications', (req, res) => {
  try {
    const db = getDb();
    const { name, issuing_org, issue_date, expiry_date, credential_id, credential_url } = req.body;
    if (!name || !issuing_org) {
      return res.status(400).json({ error: 'Certification name and issuing organization are required.' });
    }

    const id = uuidv4();
    const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM user_certifications WHERE user_id = ?').get(req.user.id);
    const nextOrder = (maxOrder?.m ?? -1) + 1;

    db.prepare(`
      INSERT INTO user_certifications
        (id, user_id, name, issuing_org, issue_date, expiry_date, credential_id, credential_url, display_order)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, req.user.id, name, issuing_org, issue_date || null, expiry_date || null, credential_id || null, credential_url || null, nextOrder);

    const pct = recalcCompletion(req.user.id);
    const cert = db.prepare('SELECT * FROM user_certifications WHERE id = ?').get(id);
    res.status(201).json({ certification: cert, completion_percentage: pct });
  } catch (err) {
    logger.error('POST /profile/certifications error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/certifications/:id', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM user_certifications WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Certification not found.' });

    const { name, issuing_org, issue_date, expiry_date, credential_id, credential_url } = req.body;

    db.prepare(`
      UPDATE user_certifications SET
        name = COALESCE(?, name),
        issuing_org = COALESCE(?, issuing_org),
        issue_date = COALESCE(?, issue_date),
        expiry_date = COALESCE(?, expiry_date),
        credential_id = COALESCE(?, credential_id),
        credential_url = COALESCE(?, credential_url)
      WHERE id = ? AND user_id = ?
    `).run(
      name || null, issuing_org || null, issue_date || null, expiry_date || null,
      credential_id || null, credential_url || null,
      req.params.id, req.user.id
    );

    const pct = recalcCompletion(req.user.id);
    const updated = db.prepare('SELECT * FROM user_certifications WHERE id = ?').get(req.params.id);
    res.json({ certification: updated, completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/certifications/:id error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/certifications/:id', (req, res) => {
  try {
    const db = getDb();
    const info = db.prepare('DELETE FROM user_certifications WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (!info.changes) return res.status(404).json({ error: 'Certification not found.' });
    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Certification deleted.', completion_percentage: pct });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ─── ACHIEVEMENTS CRUD ────────────────────────────────────────────────────────

router.get('/achievements', (req, res) => {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT * FROM user_achievements WHERE user_id = ? ORDER BY display_order ASC, created_at DESC').all(req.user.id);
    res.json({ achievements: rows });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/achievements', (req, res) => {
  try {
    const db = getDb();
    const { type, title, description, date, organization, url } = req.body;
    if (!title) return res.status(400).json({ error: 'Achievement title is required.' });

    const id = uuidv4();
    const maxOrder = db.prepare('SELECT MAX(display_order) as m FROM user_achievements WHERE user_id = ?').get(req.user.id);
    const nextOrder = (maxOrder?.m ?? -1) + 1;

    db.prepare(`
      INSERT INTO user_achievements (id, user_id, type, title, description, date, organization, url, display_order)
      VALUES (?,?,?,?,?,?,?,?,?)
    `).run(id, req.user.id, type || null, title, description || null, date || null, organization || null, url || null, nextOrder);

    const pct = recalcCompletion(req.user.id);
    const ach = db.prepare('SELECT * FROM user_achievements WHERE id = ?').get(id);
    res.status(201).json({ achievement: ach, completion_percentage: pct });
  } catch (err) {
    logger.error('POST /profile/achievements error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.put('/achievements/:id', (req, res) => {
  try {
    const db = getDb();
    const row = db.prepare('SELECT * FROM user_achievements WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Achievement not found.' });

    const { type, title, description, date, organization, url } = req.body;

    db.prepare(`
      UPDATE user_achievements SET
        type = COALESCE(?, type),
        title = COALESCE(?, title),
        description = COALESCE(?, description),
        date = COALESCE(?, date),
        organization = COALESCE(?, organization),
        url = COALESCE(?, url)
      WHERE id = ? AND user_id = ?
    `).run(type || null, title || null, description || null, date || null, organization || null, url || null, req.params.id, req.user.id);

    const pct = recalcCompletion(req.user.id);
    const updated = db.prepare('SELECT * FROM user_achievements WHERE id = ?').get(req.params.id);
    res.json({ achievement: updated, completion_percentage: pct });
  } catch (err) {
    logger.error('PUT /profile/achievements/:id error', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

router.delete('/achievements/:id', (req, res) => {
  try {
    const db = getDb();
    const info = db.prepare('DELETE FROM user_achievements WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (!info.changes) return res.status(404).json({ error: 'Achievement not found.' });
    const pct = recalcCompletion(req.user.id);
    res.json({ message: 'Achievement deleted.', completion_percentage: pct });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
