/**
 * Intelligent Resume Content Rules
 * Injected into every resume generation and tailoring prompt.
 */

function getResumeRules(profile) {
  const cgpa = parseFloat(profile?.ug_cgpa) || 0;
  const percentage = parseFloat(profile?.ug_percentage) || 0;
  const backlogs = parseInt(profile?.ug_active_backlogs) || 0;
  const class10 = parseFloat(profile?.class10_percentage || profile?.class10_cgpa) || 0;
  const class12 = parseFloat(profile?.class12_percentage || profile?.class12_cgpa) || 0;

  const rules = [];

  // CGPA/Percentage inclusion rules
  if (cgpa >= 7.5 || percentage >= 70) {
    rules.push('INCLUDE UG CGPA/percentage — it is strong enough to mention.');
  } else if (cgpa > 0 || percentage > 0) {
    rules.push('OMIT UG CGPA/percentage — it is below 7.5 CGPA / 70% and will hurt the application. Do not mention it.');
  }

  if (class10 >= 75) {
    rules.push('INCLUDE Class 10 percentage — it is strong.');
  } else {
    rules.push('OMIT Class 10 percentage — do not mention it.');
  }

  if (class12 >= 75) {
    rules.push('INCLUDE Class 12 percentage — it is strong.');
  } else {
    rules.push('OMIT Class 12 percentage — do not mention it.');
  }

  if (backlogs > 0) {
    rules.push('DO NOT mention backlogs anywhere in the resume.');
  }

  // Skills honesty rules
  rules.push(`
SKILLS SECTION RULES (critical):
- Technical skills and soft skills sections:
  You MAY enhance, expand, and add relevant skills
  based on the job description and user's domain.
  Add skills that are standard for this role/domain
  even if not explicitly listed by the user.
  This is the ONLY section where enhancement is allowed.
- All other sections (experience, projects, education):
  Use ONLY real information from the user's profile.
  NEVER fabricate company names, dates, roles,
  project names, or any factual information.
  NEVER add fake achievements or metrics.
`);

  return rules.join('\n');
}

module.exports = { getResumeRules };
