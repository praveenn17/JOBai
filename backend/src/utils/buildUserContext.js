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
  const cloudSkills = safeParse(profile?.cloud_skills).join(', ');
  const devTools = safeParse(profile?.dev_tools).join(', ');
  const softSkills = safeParse(profile?.soft_skills).join(', ');
  const languagesKnown = safeParse(profile?.languages_known).join(', ');

  const preferredRoles = safeParse(profile?.preferred_roles).join(', ');
  const preferredLocations = safeParse(profile?.preferred_locations).join(', ');
  const preferredEmpType = safeParse(profile?.preferred_employment_type).join(', ');
  const preferredIndustries = safeParse(profile?.preferred_industries).join(', ');
  const preferredDomains = safeParse(profile?.preferred_domains).join(', ');

  const email = profile?.email || user?.email || '';
  const phone = profile?.phone || user?.phone || '';

  return `
CANDIDATE RESUME (uploaded):
${resume?.parsed_text ? resume.parsed_text.substring(0, 5000) : 'No resume uploaded'}

PERSONAL & CONTACT DETAILS:
Name: ${profile?.first_name || ''} ${profile?.last_name || ''}
Email: ${email}
Phone: ${phone}
Current Location: ${profile?.city || ''}${profile?.state ? ', ' + profile.state : ''}${profile?.country ? ', ' + profile.country : ''}
Permanent Address: ${profile?.permanent_address || ''}
Notice Period: ${profile?.notice_period || 'Not specified'}
Availability To Join: ${profile?.availability_to_join || 'Immediate'}
Willing to Relocate: ${profile?.willing_to_relocate ? 'Yes' : 'No'}
Fresher Status: ${profile?.is_fresher ? 'Fresher' : 'Experienced'}
Placement Status: ${profile?.current_placement_status || 'Actively looking'}
LinkedIn: ${profile?.linkedin_url || ''}
GitHub: ${profile?.github_url || ''}
Portfolio: ${profile?.portfolio_url || ''}

ACADEMIC & EDUCATION DETAILS:
Class 10: ${profile?.class10_school || ''} | Board: ${profile?.class10_board || ''} | Year: ${profile?.class10_year || ''} | Score: ${profile?.class10_percentage || profile?.class10_cgpa || ''}
Class 12: ${profile?.class12_school || ''} | Board: ${profile?.class12_board || ''} | Stream: ${profile?.class12_stream || ''} | Year: ${profile?.class12_year || ''} | Score: ${profile?.class12_percentage || profile?.class12_cgpa || ''}
${profile?.has_diploma ? `Diploma: ${profile?.diploma_course || ''} (${profile?.diploma_specialization || ''}) at ${profile?.diploma_institute || ''} | Year: ${profile?.diploma_year || ''} | Score: ${profile?.diploma_percentage || ''}` : ''}
Undergraduate (UG): Degree: ${profile?.ug_degree || ''} in ${profile?.ug_branch || ''} | College/Univ: ${profile?.ug_college || profile?.ug_university || ''} | Graduation Year: ${profile?.ug_graduation_year || profile?.graduation_year || ''} | CGPA: ${profile?.ug_cgpa || ''} | %: ${profile?.ug_percentage || ''} | Backlogs: ${profile?.ug_backlogs || 0} (Active: ${profile?.ug_active_backlogs || 0})
${profile?.has_pg ? `Postgraduate (PG): Degree: ${profile?.pg_degree || ''} (${profile?.pg_specialization || ''}) | College: ${profile?.pg_college || ''} | Year: ${profile?.pg_year || ''} | CGPA: ${profile?.pg_cgpa || ''} | %: ${profile?.pg_percentage || ''}` : ''}

CONFIRMED TECHNICAL SKILLS: ${techSkills || 'None listed'}
PROGRAMMING LANGUAGES: ${progLangs || 'None listed'}
FRAMEWORKS & LIBRARIES: ${frameworks || 'None listed'}
DATABASES: ${databases || 'None listed'}
CLOUD PLATFORMS: ${cloudSkills || 'None listed'}
DEVELOPER TOOLS: ${devTools || 'None listed'}
LANGUAGES KNOWN: ${languagesKnown || 'None listed'}
SOFT SKILLS: ${softSkills || 'None listed'}

PROJECTS:
${projects.length === 0 ? 'None' : projects.map((p, i) => `${i + 1}. ${p.title || ''}
  Technologies Used: ${safeParse(p.technologies).join(', ')}
  Role: ${p.user_role || ''}
  Description: ${p.description || ''}
  Outcome: ${p.outcome || ''}`).join('\n')}

WORK EXPERIENCE:
${experience.length === 0 ? 'Fresher — No prior work experience listed' :
  experience.map((e, i) => `${i + 1}. ${e.job_title || ''} at ${e.company_name || ''}
  Employment Type: ${e.employment_type || ''}
  Duration: ${e.start_date || ''} to ${e.is_current ? 'Present' : (e.end_date || '')}
  Responsibilities: ${e.responsibilities || ''}
  Technologies: ${safeParse(e.technologies).join(', ')}`).join('\n')}

CERTIFICATIONS:
${certs.map(c => `${c.name || ''} by ${c.issuing_org || ''} (${c.issue_date || ''})`).join('\n') || 'None'}

ACHIEVEMENTS:
${achievements.map(a => `${a.type || ''}: ${a.title || ''} — ${a.description || ''}`).join('\n') || 'None'}

CAREER PREFERENCES:
Target Roles: ${preferredRoles || 'Any'}
Target Locations: ${preferredLocations || 'Any'}
Employment Type: ${preferredEmpType || 'Full-time'}
Work Mode: ${profile?.preferred_work_mode || 'Any'}
Willing to Relocate: ${profile?.willing_to_relocate ? 'Yes' : 'No'}
Expected Salary: ${profile?.expected_salary || 'Not specified'}

PROFESSIONAL SUMMARY: ${profile?.professional_summary || ''}
CAREER OBJECTIVE: ${profile?.career_objective || ''}
  `.trim();
}

module.exports = { buildUserContext };
