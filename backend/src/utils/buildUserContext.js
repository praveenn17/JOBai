/**
 * Shared User Context Builder
 * Combines uploaded resume and user profile tables into a comprehensive candidate context
 */

function buildUserContext(resume, profile, projects = [], experience = [], certs = [], achievements = [], user = {}) {
  const safeParse = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      return JSON.parse(val);
    } catch {
      return [];
    }
  };

  const techSkills = safeParse(profile?.technical_skills).join(', ');
  const progLangs = safeParse(profile?.programming_languages).join(', ');
  const frameworks = safeParse(profile?.frameworks).join(', ');
  const databases = safeParse(profile?.databases).join(', ');
  const softSkills = safeParse(profile?.soft_skills).join(', ');

  const preferredRoles = safeParse(profile?.preferred_roles).join(', ');
  const preferredLocations = safeParse(profile?.preferred_locations).join(', ');
  const preferredEmpType = safeParse(profile?.preferred_employment_type).join(', ');

  const email = profile?.email || user?.email || '';
  const phone = profile?.phone || user?.phone || '';

  return `
CANDIDATE RESUME (uploaded):
${resume?.parsed_text || 'No resume uploaded'}

PERSONAL INFO:
Name: ${profile?.first_name || ''} ${profile?.last_name || ''}
Email: ${email}
Phone: ${phone}
Location: ${profile?.city || ''}, ${profile?.state || ''}
LinkedIn: ${profile?.linkedin_url || ''}
GitHub: ${profile?.github_url || ''}

EDUCATION:
Class 10: ${profile?.class10_school || ''} | ${profile?.class10_board || ''} | ${profile?.class10_year || ''} | ${profile?.class10_percentage || profile?.class10_cgpa || ''}
Class 12: ${profile?.class12_school || ''} | ${profile?.class12_board || ''} | ${profile?.class12_stream || ''} | ${profile?.class12_year || ''} | ${profile?.class12_percentage || profile?.class12_cgpa || ''}
UG: ${profile?.ug_degree || ''} in ${profile?.ug_branch || ''} | ${profile?.ug_college || ''} | ${profile?.ug_graduation_year || ''} | CGPA: ${profile?.ug_cgpa || ''} | %: ${profile?.ug_percentage || ''} | Active Backlogs: ${profile?.ug_active_backlogs || 0}
${profile?.has_pg ? `PG: ${profile?.pg_degree || ''} | ${profile?.pg_college || ''} | ${profile?.pg_year || ''} | CGPA: ${profile?.pg_cgpa || ''}` : ''}

TECHNICAL SKILLS: ${techSkills}
PROGRAMMING LANGUAGES: ${progLangs}
FRAMEWORKS: ${frameworks}
DATABASES: ${databases}
SOFT SKILLS: ${softSkills}

PROJECTS:
${projects.length === 0 ? 'None' : projects.map((p, i) => `${i + 1}. ${p.title || ''}
  Tech: ${safeParse(p.technologies).join(', ')}
  Role: ${p.user_role || ''}
  Description: ${p.description || ''}
  Outcome: ${p.outcome || ''}`).join('\n')}

WORK EXPERIENCE:
${experience.length === 0 ? 'Fresher — No work experience' :
  experience.map((e, i) => `${i + 1}. ${e.job_title || ''} at ${e.company_name || ''}
  Type: ${e.employment_type || ''}
  Duration: ${e.start_date || ''} to ${e.is_current ? 'Present' : (e.end_date || '')}
  Responsibilities: ${e.responsibilities || ''}
  Technologies: ${safeParse(e.technologies).join(', ')}`).join('\n')}

CERTIFICATIONS:
${certs.map(c => `${c.name || ''} by ${c.issuing_org || ''} (${c.issue_date || ''})`).join('\n') || 'None'}

ACHIEVEMENTS:
${achievements.map(a => `${a.type || ''}: ${a.title || ''} — ${a.description || ''}`).join('\n') || 'None'}

CAREER PREFERENCES:
Target Roles: ${preferredRoles}
Target Locations: ${preferredLocations}
Employment Type: ${preferredEmpType}
Work Mode: ${profile?.preferred_work_mode || ''}
Expected Salary: ${profile?.expected_salary || 'Not specified'}

PROFESSIONAL SUMMARY: ${profile?.professional_summary || ''}
CAREER OBJECTIVE: ${profile?.career_objective || ''}
  `.trim();
}

module.exports = { buildUserContext };
