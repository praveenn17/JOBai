/**
 * ProfileSetup.jsx — 20-step profile wizard for new users
 *
 * Each step calls the appropriate PUT /api/profile/* endpoint on "Save & Continue".
 * Progress is tracked by completion_percentage from the backend.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import useAuthStore from '../store/authStore';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseArr(raw) {
  if (Array.isArray(raw)) return raw;
  if (!raw) return [];
  try { return JSON.parse(raw); } catch (_) { return []; }
}

const TOAST_DURATION = 3500;
let toastTimer;

// ─── Sub-components ────────────────────────────────────────────────────────────

/** Tag input: type + Enter to add, click × to remove */
function TagInput({ label, value = [], onChange, placeholder, hint }) {
  const [input, setInput] = useState('');
  const addTag = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault();
      const t = input.trim().replace(/,+$/, '');
      if (t && !value.includes(t)) onChange([...value, t]);
      setInput('');
    }
  };
  return (
    <div style={{ marginBottom: '20px' }}>
      {label && <label style={lbl}>{label}</label>}
      {hint && <p style={{ margin: '0 0 6px', color: '#475569', fontSize: '12px' }}>{hint}</p>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', background: 'rgba(255,255,255,0.04)', border: '1.5px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '10px', minHeight: '48px', cursor: 'text' }}
        onClick={e => e.currentTarget.querySelector('input')?.focus()}
      >
        {value.map((t, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: 'rgba(99,102,241,0.2)', color: '#a5b4fc', padding: '3px 10px', borderRadius: '100px', fontSize: '13px', fontWeight: '500' }}>
            {t}
            <button type="button" onClick={() => onChange(value.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#818cf8', cursor: 'pointer', padding: '0 0 0 2px', lineHeight: 1, fontSize: '14px' }}>×</button>
          </span>
        ))}
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={addTag}
          placeholder={value.length === 0 ? (placeholder || 'Type and press Enter') : ''}
          style={{ flex: 1, minWidth: '120px', background: 'none', border: 'none', outline: 'none', color: '#f1f5f9', fontSize: '14px', padding: '0' }}
        />
      </div>
    </div>
  );
}

/** UUID generator (browser-safe) */
function uid() {
  return crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2);
}

// ─── Shared styles ────────────────────────────────────────────────────────────

const lbl = { display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px', fontWeight: '500' };

const inp = {
  width: '100%', padding: '12px 14px', borderRadius: '10px',
  background: 'rgba(255,255,255,0.05)', border: '1.5px solid rgba(255,255,255,0.1)',
  color: '#f1f5f9', fontSize: '14px', outline: 'none',
  fontFamily: 'inherit', transition: 'border-color 0.2s', boxSizing: 'border-box',
};

const sel = { ...inp };

const row2 = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' };
const row3 = { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' };

function Field({ label, children, style }) {
  return (
    <div style={{ marginBottom: '16px', ...style }}>
      {label && <label style={lbl}>{label}</label>}
      {children}
    </div>
  );
}

function Input({ label, ...props }) {
  return (
    <Field label={label}>
      <input style={inp} {...props} />
    </Field>
  );
}

function Select({ label, options, ...props }) {
  return (
    <Field label={label}>
      <select style={sel} {...props}>
        {options.map(o => <option key={o.value ?? o} value={o.value ?? o}>{o.label ?? o}</option>)}
      </select>
    </Field>
  );
}

function Textarea({ label, ...props }) {
  return (
    <Field label={label}>
      <textarea style={{ ...inp, height: '100px', resize: 'vertical' }} {...props} />
    </Field>
  );
}

// ─── Steps definitions ────────────────────────────────────────────────────────

const STEP_NAMES = [
  'Personal Info', 'Address', 'Parent / Guardian',
  'Class 10', 'Class 12', 'Diploma',
  'Undergraduate', 'Postgraduate', 'Technical Skills',
  'Soft Skills & Languages', 'Professional Links', 'Professional Summary',
  'Projects', 'Work Experience', 'Internships',
  'Certifications', 'Achievements', 'Job Preferences',
  'Additional Info', 'Review & Confirm',
];

// ─── Main component ────────────────────────────────────────────────────────────

export default function ProfileSetup() {
  const navigate = useNavigate();
  const { user, updateProfileComplete } = useAuthStore();

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState({ show: false, msg: '', type: 'success' });
  const [completionPct, setCompletionPct] = useState(0);

  // All profile data, keyed by section
  const [profile, setProfile] = useState(null);
  const [projects, setProjects] = useState([]);
  const [experience, setExperience] = useState([]);
  const [certifications, setCertifications] = useState([]);
  const [achievements, setAchievements] = useState([]);

  // Section form state
  const [personal, setPersonal] = useState({
    first_name: '', middle_name: '', last_name: '', date_of_birth: '', gender: '',
    alternate_phone: '', current_address: '', permanent_address: '',
    city: '', state: '', country: 'India', pincode: '',
    parent_name: '', parent_phone: '', parent_relation: '',
    emergency_contact_name: '', emergency_contact_phone: '',
    same_address: true,
  });
  const [academic, setAcademic] = useState({
    class10_school: '', class10_board: '', class10_year: '', class10_percentage: '', class10_cgpa: '', class10_entry: 'percentage',
    class12_school: '', class12_board: '', class12_stream: '', class12_year: '', class12_percentage: '', class12_cgpa: '', class12_entry: 'percentage',
    has_diploma: false, diploma_institute: '', diploma_course: '', diploma_specialization: '', diploma_year: '', diploma_percentage: '',
    ug_college: '', ug_university: '', ug_degree: '', ug_course: '', ug_branch: '',
    ug_enrollment_year: '', ug_graduation_year: '', ug_current_semester: '',
    ug_cgpa: '', ug_percentage: '', ug_entry: 'cgpa', ug_backlogs: 0, ug_active_backlogs: 0,
    has_pg: false, pg_college: '', pg_degree: '', pg_specialization: '', pg_year: '', pg_cgpa: '', pg_percentage: '',
  });
  const [skills, setSkills] = useState({
    technical_skills: [], programming_languages: [], frameworks: [], databases: [],
    cloud_skills: [], dev_tools: [], soft_skills: [], languages_known: [],
  });
  const [links, setLinks] = useState({
    github_url: '', linkedin_url: '', portfolio_url: '', gitlab_url: '', personal_website: '',
    leetcode_url: '', hackerrank_url: '', codechef_url: '', codeforces_url: '', kaggle_url: '',
    other_links: [],
  });
  const [summary, setSummary] = useState({ professional_summary: '', career_objective: '', areas_of_interest: '' });
  const [prefs, setPrefs] = useState({
    preferred_roles: [], preferred_industries: [], preferred_employment_type: [],
    preferred_work_mode: 'any', preferred_locations: [], willing_to_relocate: false,
    expected_salary: '', availability_to_join: '', current_placement_status: 'actively_looking',
    is_fresher: true, preferred_interview_mode: 'either', notice_period: '',
  });
  const [addlInfo, setAddlInfo] = useState({
    willing_to_travel: '', work_authorization: '', how_heard: '',
  });

  const showToast = useCallback((msg, type = 'success') => {
    clearTimeout(toastTimer);
    setToast({ show: true, msg, type });
    toastTimer = setTimeout(() => setToast(t => ({ ...t, show: false })), TOAST_DURATION);
  }, []);

  // ── Fetch profile on mount ───────────────────────────────────────────────

  useEffect(() => {
    setLoading(true);
    api.get(ENDPOINTS.profile.get)
      .then(res => {
        const { profile: p, projects: pr, experience: ex, certifications: ct, achievements: ac } = res.data;
        setProfile(p);
        setProjects(pr || []);
        setExperience(ex || []);
        setCertifications(ct || []);
        setAchievements(ac || []);
        setCompletionPct(p?.completion_percentage || 0);

        if (p) {
          setPersonal(prev => ({
            ...prev,
            first_name: p.first_name || '', middle_name: p.middle_name || '',
            last_name: p.last_name || '', date_of_birth: p.date_of_birth || '',
            gender: p.gender || '', alternate_phone: p.alternate_phone || '',
            current_address: p.current_address || '', permanent_address: p.permanent_address || '',
            city: p.city || '', state: p.state || '', country: p.country || 'India', pincode: p.pincode || '',
            parent_name: p.parent_name || '', parent_phone: p.parent_phone || '',
            parent_relation: p.parent_relation || '',
            emergency_contact_name: p.emergency_contact_name || '',
            emergency_contact_phone: p.emergency_contact_phone || '',
          }));
          setAcademic(prev => ({
            ...prev,
            class10_school: p.class10_school || '', class10_board: p.class10_board || '',
            class10_year: p.class10_year || '', class10_percentage: p.class10_percentage || '',
            class10_cgpa: p.class10_cgpa || '',
            class12_school: p.class12_school || '', class12_board: p.class12_board || '',
            class12_stream: p.class12_stream || '', class12_year: p.class12_year || '',
            class12_percentage: p.class12_percentage || '', class12_cgpa: p.class12_cgpa || '',
            has_diploma: !!p.has_diploma, diploma_institute: p.diploma_institute || '',
            diploma_course: p.diploma_course || '', diploma_specialization: p.diploma_specialization || '',
            diploma_year: p.diploma_year || '', diploma_percentage: p.diploma_percentage || '',
            ug_college: p.ug_college || '', ug_university: p.ug_university || '',
            ug_degree: p.ug_degree || '', ug_course: p.ug_course || '', ug_branch: p.ug_branch || '',
            ug_enrollment_year: p.ug_enrollment_year || '', ug_graduation_year: p.ug_graduation_year || '',
            ug_current_semester: p.ug_current_semester || '',
            ug_cgpa: p.ug_cgpa || '', ug_percentage: p.ug_percentage || '',
            ug_backlogs: p.ug_backlogs || 0, ug_active_backlogs: p.ug_active_backlogs || 0,
            has_pg: !!p.has_pg, pg_college: p.pg_college || '', pg_degree: p.pg_degree || '',
            pg_specialization: p.pg_specialization || '', pg_year: p.pg_year || '',
            pg_cgpa: p.pg_cgpa || '', pg_percentage: p.pg_percentage || '',
          }));
          setSkills({
            technical_skills: parseArr(p.technical_skills),
            programming_languages: parseArr(p.programming_languages),
            frameworks: parseArr(p.frameworks),
            databases: parseArr(p.databases),
            cloud_skills: parseArr(p.cloud_skills),
            dev_tools: parseArr(p.dev_tools),
            soft_skills: parseArr(p.soft_skills),
            languages_known: parseArr(p.languages_known),
          });
          setLinks({
            github_url: p.github_url || '', linkedin_url: p.linkedin_url || '',
            portfolio_url: p.portfolio_url || '', gitlab_url: p.gitlab_url || '',
            personal_website: p.personal_website || '', leetcode_url: p.leetcode_url || '',
            hackerrank_url: p.hackerrank_url || '', codechef_url: p.codechef_url || '',
            codeforces_url: p.codeforces_url || '', kaggle_url: p.kaggle_url || '',
            other_links: parseArr(p.other_links),
          });
          setSummary({ professional_summary: p.professional_summary || '', career_objective: p.career_objective || '', areas_of_interest: p.areas_of_interest || '' });
          setPrefs(prev => ({
            ...prev,
            preferred_roles: parseArr(p.preferred_roles),
            preferred_industries: parseArr(p.preferred_industries),
            preferred_employment_type: parseArr(p.preferred_employment_type),
            preferred_work_mode: p.preferred_work_mode || 'any',
            preferred_locations: parseArr(p.preferred_locations),
            willing_to_relocate: !!p.willing_to_relocate,
            expected_salary: p.expected_salary || '',
            availability_to_join: p.availability_to_join || '',
            current_placement_status: p.current_placement_status || 'actively_looking',
            is_fresher: p.is_fresher !== 0,
            preferred_interview_mode: p.preferred_interview_mode || 'either',
            notice_period: p.notice_period || '',
          }));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // ── Save handlers ─────────────────────────────────────────────────────────

  const saveSection = async (endpoint, payload) => {
    setSaving(true);
    try {
      const res = await api.put(endpoint, payload);
      const pct = res.data?.completion_percentage;
      if (pct !== undefined) { setCompletionPct(pct); updateProfileComplete(pct >= 80, pct); }
      showToast('Saved successfully!');
      return true;
    } catch (err) {
      showToast(err.message || 'Save failed', 'error');
      return false;
    } finally {
      setSaving(false);
    }
  };

  const advance = (ok) => { if (ok && step < 20) setStep(s => s + 1); };

  const handleSave = async () => {
    let ok = false;
    switch (step) {
      case 1: case 2: case 3:
        ok = await saveSection(ENDPOINTS.profile.personal, {
          first_name: personal.first_name, middle_name: personal.middle_name, last_name: personal.last_name,
          date_of_birth: personal.date_of_birth, gender: personal.gender, alternate_phone: personal.alternate_phone,
          current_address: personal.current_address,
          permanent_address: personal.same_address ? personal.current_address : personal.permanent_address,
          city: personal.city, state: personal.state, country: personal.country, pincode: personal.pincode,
          parent_name: personal.parent_name, parent_phone: personal.parent_phone, parent_relation: personal.parent_relation,
          emergency_contact_name: personal.emergency_contact_name, emergency_contact_phone: personal.emergency_contact_phone,
        });
        break;
      case 4: case 5: case 6: case 7: case 8:
        ok = await saveSection(ENDPOINTS.profile.academic, {
          class10_school: academic.class10_school, class10_board: academic.class10_board, class10_year: academic.class10_year,
          class10_percentage: academic.class10_entry === 'percentage' ? academic.class10_percentage : null,
          class10_cgpa: academic.class10_entry === 'cgpa' ? academic.class10_cgpa : null,
          class12_school: academic.class12_school, class12_board: academic.class12_board, class12_stream: academic.class12_stream, class12_year: academic.class12_year,
          class12_percentage: academic.class12_entry === 'percentage' ? academic.class12_percentage : null,
          class12_cgpa: academic.class12_entry === 'cgpa' ? academic.class12_cgpa : null,
          has_diploma: academic.has_diploma, diploma_institute: academic.diploma_institute, diploma_course: academic.diploma_course,
          diploma_specialization: academic.diploma_specialization, diploma_year: academic.diploma_year, diploma_percentage: academic.diploma_percentage,
          ug_college: academic.ug_college, ug_university: academic.ug_university, ug_degree: academic.ug_degree,
          ug_course: academic.ug_course, ug_branch: academic.ug_branch, ug_enrollment_year: academic.ug_enrollment_year,
          ug_graduation_year: academic.ug_graduation_year, ug_current_semester: academic.ug_current_semester,
          ug_cgpa: academic.ug_entry === 'cgpa' ? academic.ug_cgpa : null,
          ug_percentage: academic.ug_entry === 'percentage' ? academic.ug_percentage : null,
          ug_backlogs: academic.ug_backlogs, ug_active_backlogs: academic.ug_active_backlogs,
          has_pg: academic.has_pg, pg_college: academic.pg_college, pg_degree: academic.pg_degree,
          pg_specialization: academic.pg_specialization, pg_year: academic.pg_year, pg_cgpa: academic.pg_cgpa, pg_percentage: academic.pg_percentage,
        });
        break;
      case 9: case 10:
        ok = await saveSection(ENDPOINTS.profile.skills, {
          technical_skills: skills.technical_skills, programming_languages: skills.programming_languages,
          frameworks: skills.frameworks, databases: skills.databases, cloud_skills: skills.cloud_skills,
          dev_tools: skills.dev_tools, soft_skills: skills.soft_skills, languages_known: skills.languages_known,
        });
        break;
      case 11:
        ok = await saveSection(ENDPOINTS.profile.links, links);
        break;
      case 12:
        ok = await saveSection(ENDPOINTS.profile.summary, summary);
        break;
      case 13: case 14: case 15: case 16: case 17:
        // Projects, experience, etc are saved inline via CRUD calls
        ok = true;
        showToast('Progress saved!');
        break;
      case 18: case 19:
        ok = await saveSection(ENDPOINTS.profile.preferences, {
          preferred_roles: prefs.preferred_roles, preferred_industries: prefs.preferred_industries,
          preferred_employment_type: prefs.preferred_employment_type, preferred_work_mode: prefs.preferred_work_mode,
          preferred_locations: prefs.preferred_locations, willing_to_relocate: prefs.willing_to_relocate,
          expected_salary: prefs.expected_salary, availability_to_join: prefs.availability_to_join,
          current_placement_status: prefs.current_placement_status, is_fresher: prefs.is_fresher,
          preferred_interview_mode: prefs.preferred_interview_mode, notice_period: prefs.notice_period,
        });
        break;
      case 20:
        if (completionPct >= 80) {
          updateProfileComplete(true, completionPct);
          navigate('/');
        } else {
          showToast(`Profile ${completionPct}% complete — need 80% to proceed`, 'error');
        }
        return;
      default:
        ok = true;
    }
    advance(ok);
  };

  // ── Project helpers ────────────────────────────────────────────────────────

  const addProject = async (proj) => {
    setSaving(true);
    try {
      const res = await api.post(ENDPOINTS.profile.projects, proj);
      setProjects(p => [...p, res.data.project]);
      if (res.data.completion_percentage !== undefined) { setCompletionPct(res.data.completion_percentage); updateProfileComplete(res.data.completion_percentage >= 80, res.data.completion_percentage); }
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };
  const removeProject = async (id) => {
    setSaving(true);
    try {
      const res = await api.delete(buildUrl(ENDPOINTS.profile.projectById, { id }));
      setProjects(p => p.filter(x => x.id !== id));
      if (res.data.completion_percentage !== undefined) setCompletionPct(res.data.completion_percentage);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  // Experience helpers
  const addExp = async (exp) => {
    setSaving(true);
    try {
      const res = await api.post(ENDPOINTS.profile.experience, exp);
      setExperience(e => [...e, res.data.experience]);
      if (res.data.completion_percentage !== undefined) { setCompletionPct(res.data.completion_percentage); updateProfileComplete(res.data.completion_percentage >= 80, res.data.completion_percentage); }
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };
  const removeExp = async (id) => {
    setSaving(true);
    try {
      await api.delete(buildUrl(ENDPOINTS.profile.experienceById, { id }));
      setExperience(e => e.filter(x => x.id !== id));
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  // Cert helpers
  const addCert = async (cert) => {
    setSaving(true);
    try {
      const res = await api.post(ENDPOINTS.profile.certifications, cert);
      setCertifications(c => [...c, res.data.certification]);
      if (res.data.completion_percentage !== undefined) setCompletionPct(res.data.completion_percentage);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };
  const removeCert = async (id) => {
    setSaving(true);
    try {
      await api.delete(buildUrl(ENDPOINTS.profile.certificationById, { id }));
      setCertifications(c => c.filter(x => x.id !== id));
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  // Achievement helpers
  const addAch = async (ach) => {
    setSaving(true);
    try {
      const res = await api.post(ENDPOINTS.profile.achievements, ach);
      setAchievements(a => [...a, res.data.achievement]);
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };
  const removeAch = async (id) => {
    setSaving(true);
    try {
      await api.delete(buildUrl(ENDPOINTS.profile.achievementById, { id }));
      setAchievements(a => a.filter(x => x.id !== id));
    } catch (err) { showToast(err.message, 'error'); }
    finally { setSaving(false); }
  };

  // ── Layout ────────────────────────────────────────────────────────────────

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; }
    .ps-input { width:100%; padding:12px 14px; border-radius:10px; background:rgba(255,255,255,0.05); border:1.5px solid rgba(255,255,255,0.1); color:#f1f5f9; font-size:14px; outline:none; font-family:inherit; transition:border-color 0.2s; }
    .ps-input:focus { border-color:#6366f1; }
    .ps-input::placeholder { color:#475569; }
    .ps-btn { padding:13px 28px; border-radius:10px; border:none; cursor:pointer; font-size:15px; font-weight:600; font-family:inherit; transition:all 0.2s; }
    .ps-btn-primary { background:linear-gradient(135deg,#6366f1,#8b5cf6); color:#fff; }
    .ps-btn-primary:hover:not(:disabled) { transform:translateY(-1px); box-shadow:0 6px 20px rgba(99,102,241,0.4); }
    .ps-btn-primary:disabled { opacity:0.6; cursor:not-allowed; }
    .ps-btn-outline { background:transparent; color:#94a3b8; border:1.5px solid rgba(255,255,255,0.1); }
    .ps-btn-outline:hover { border-color:#6366f1; color:#a5b4fc; }
    .ps-card { background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:16px; margin-bottom:12px; }
    .ps-toggle { display:inline-flex; border-radius:8px; overflow:hidden; border:1px solid rgba(255,255,255,0.1); }
    .ps-toggle button { padding:8px 16px; border:none; cursor:pointer; font-size:13px; font-family:inherit; font-weight:500; transition:all 0.2s; }
    .ps-toggle button.active { background:#6366f1; color:#fff; }
    .ps-toggle button:not(.active) { background:transparent; color:#64748b; }
  `;

  const pField = (k) => ({ value: personal[k], onChange: e => setPersonal(p => ({ ...p, [k]: e.target.value })), className: 'ps-input' });
  const aField = (k) => ({ value: academic[k] ?? '', onChange: e => setAcademic(p => ({ ...p, [k]: e.target.value })), className: 'ps-input' });
  const lField = (k) => ({ value: links[k], onChange: e => setLinks(p => ({ ...p, [k]: e.target.value })), className: 'ps-input' });
  const sField = (k) => ({ value: summary[k], onChange: e => setSummary(p => ({ ...p, [k]: e.target.value })), className: 'ps-input' });
  const rField = (k) => ({ value: prefs[k] || '', onChange: e => setPrefs(p => ({ ...p, [k]: e.target.value })) });

  const Toggle = ({ val, onA, onB, labelA, labelB }) => (
    <div className="ps-toggle">
      <button type="button" className={val === 'a' || val === labelA.toLowerCase() ? 'active' : ''} onClick={onA}>{labelA}</button>
      <button type="button" className={val === 'b' || val === labelB.toLowerCase() ? 'active' : ''} onClick={onB}>{labelB}</button>
    </div>
  );

  // ── Step renders ──────────────────────────────────────────────────────────

  const renderStep = () => {
    switch (step) {
      // ── Step 1: Personal Info ─────────────────────────────────────────────
      case 1: return (
        <div>
          <div style={row3}>
            <Field label="First Name *"><input {...pField('first_name')} className="ps-input" placeholder="Priya" /></Field>
            <Field label="Middle Name"><input {...pField('middle_name')} className="ps-input" placeholder="K" /></Field>
            <Field label="Last Name *"><input {...pField('last_name')} className="ps-input" placeholder="Sharma" /></Field>
          </div>
          <div style={row2}>
            <Field label="Date of Birth *"><input type="date" {...pField('date_of_birth')} className="ps-input" /></Field>
            <Field label="Gender *">
              <select {...pField('gender')} className="ps-input">
                <option value="">Select gender</option>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
                <option value="Non-binary">Non-binary</option>
                <option value="Prefer not to say">Prefer not to say</option>
              </select>
            </Field>
          </div>
          <div style={row2}>
            <Field label="Email"><input type="email" value={user?.email || ''} readOnly className="ps-input" style={{ opacity: 0.6 }} /></Field>
            <Field label="Phone *"><input {...pField('alternate_phone')} className="ps-input" placeholder="+91 9876543210" /></Field>
          </div>
        </div>
      );

      // ── Step 2: Address ────────────────────────────────────────────────────
      case 2: return (
        <div>
          <Field label="Current Address (Street / Area) *"><textarea {...pField('current_address')} className="ps-input" style={{ height: '80px', resize: 'vertical' }} placeholder="Flat 4B, Sunrise Apartments, MG Road" /></Field>
          <div style={row3}>
            <Field label="City *"><input {...pField('city')} className="ps-input" placeholder="Bengaluru" /></Field>
            <Field label="State *"><input {...pField('state')} className="ps-input" placeholder="Karnataka" /></Field>
            <Field label="Country *"><input {...pField('country')} className="ps-input" placeholder="India" /></Field>
          </div>
          <Field label="PIN / ZIP *"><input {...pField('pincode')} className="ps-input" placeholder="560001" /></Field>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px', color: '#94a3b8', fontSize: '14px' }}>
            <input type="checkbox" checked={personal.same_address} onChange={e => setPersonal(p => ({ ...p, same_address: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: '#6366f1' }} />
            Permanent address same as current
          </label>
          {!personal.same_address && (
            <Field label="Permanent Address"><textarea {...pField('permanent_address')} className="ps-input" style={{ height: '80px', resize: 'vertical' }} /></Field>
          )}
        </div>
      );

      // ── Step 3: Parent / Guardian ──────────────────────────────────────────
      case 3: return (
        <div>
          <div style={row2}>
            <Field label="Parent / Guardian Name *"><input {...pField('parent_name')} className="ps-input" placeholder="Rajesh Sharma" /></Field>
            <Field label="Relationship">
              <select {...pField('parent_relation')} className="ps-input">
                <option value="">Select</option>
                <option value="Father">Father</option>
                <option value="Mother">Mother</option>
                <option value="Guardian">Guardian</option>
                <option value="Other">Other</option>
              </select>
            </Field>
          </div>
          <Field label="Parent Phone *"><input {...pField('parent_phone')} className="ps-input" placeholder="+91 9876543210" /></Field>
          <div style={row2}>
            <Field label="Emergency Contact Name"><input {...pField('emergency_contact_name')} className="ps-input" /></Field>
            <Field label="Emergency Contact Phone"><input {...pField('emergency_contact_phone')} className="ps-input" /></Field>
          </div>
        </div>
      );

      // ── Step 4: Class 10 ───────────────────────────────────────────────────
      case 4: return (
        <div>
          <div style={row2}>
            <Field label="School Name *"><input {...aField('class10_school')} className="ps-input" placeholder="Sri Vidya School" /></Field>
            <Field label="Board *">
              <select {...aField('class10_board')} className="ps-input">
                <option value="">Select board</option>
                {['CBSE','ICSE','State Board','NIOS','International','Other'].map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Passing Year *"><input {...aField('class10_year')} className="ps-input" placeholder="2020" /></Field>
          <Field label="Result Type">
            <div className="ps-toggle">
              <button type="button" className={academic.class10_entry === 'percentage' ? 'active' : ''} onClick={() => setAcademic(a => ({ ...a, class10_entry: 'percentage' }))}>Percentage</button>
              <button type="button" className={academic.class10_entry === 'cgpa' ? 'active' : ''} onClick={() => setAcademic(a => ({ ...a, class10_entry: 'cgpa' }))}>CGPA</button>
            </div>
          </Field>
          {academic.class10_entry === 'percentage'
            ? <Field label="Percentage *"><input {...aField('class10_percentage')} className="ps-input" placeholder="92.5" /></Field>
            : <Field label="CGPA *"><input {...aField('class10_cgpa')} className="ps-input" placeholder="9.2" /></Field>}
        </div>
      );

      // ── Step 5: Class 12 ───────────────────────────────────────────────────
      case 5: return (
        <div>
          <div style={row2}>
            <Field label="School Name *"><input {...aField('class12_school')} className="ps-input" /></Field>
            <Field label="Board *">
              <select {...aField('class12_board')} className="ps-input">
                <option value="">Select board</option>
                {['CBSE','ICSE','State Board','NIOS','International','Other'].map(b => <option key={b}>{b}</option>)}
              </select>
            </Field>
          </div>
          <div style={row2}>
            <Field label="Stream *">
              <select {...aField('class12_stream')} className="ps-input">
                <option value="">Select</option>
                {['Science','Commerce','Arts','Vocational','Other'].map(s => <option key={s}>{s}</option>)}
              </select>
            </Field>
            <Field label="Passing Year *"><input {...aField('class12_year')} className="ps-input" placeholder="2022" /></Field>
          </div>
          <Field label="Result Type">
            <div className="ps-toggle">
              <button type="button" className={academic.class12_entry === 'percentage' ? 'active' : ''} onClick={() => setAcademic(a => ({ ...a, class12_entry: 'percentage' }))}>Percentage</button>
              <button type="button" className={academic.class12_entry === 'cgpa' ? 'active' : ''} onClick={() => setAcademic(a => ({ ...a, class12_entry: 'cgpa' }))}>CGPA</button>
            </div>
          </Field>
          {academic.class12_entry === 'percentage'
            ? <Field label="Percentage *"><input {...aField('class12_percentage')} className="ps-input" placeholder="88.0" /></Field>
            : <Field label="CGPA *"><input {...aField('class12_cgpa')} className="ps-input" placeholder="8.8" /></Field>}
        </div>
      );

      // ── Step 6: Diploma ────────────────────────────────────────────────────
      case 6: return (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '20px', color: '#94a3b8', fontSize: '14px' }}>
            <input type="checkbox" checked={academic.has_diploma} onChange={e => setAcademic(a => ({ ...a, has_diploma: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: '#6366f1' }} />
            I have / am pursuing a Diploma
          </label>
          {academic.has_diploma && (
            <>
              <div style={row2}>
                <Field label="Institute Name *"><input {...aField('diploma_institute')} className="ps-input" /></Field>
                <Field label="Course *"><input {...aField('diploma_course')} className="ps-input" /></Field>
              </div>
              <div style={row2}>
                <Field label="Specialization"><input {...aField('diploma_specialization')} className="ps-input" /></Field>
                <Field label="Passing Year *"><input {...aField('diploma_year')} className="ps-input" /></Field>
              </div>
              <Field label="Percentage / CGPA *"><input {...aField('diploma_percentage')} className="ps-input" /></Field>
            </>
          )}
          {!academic.has_diploma && (
            <div style={{ textAlign: 'center', padding: '40px', color: '#475569' }}>
              <span style={{ fontSize: '40px' }}>🎓</span>
              <p style={{ margin: '12px 0 0' }}>No diploma? No problem — click Save & Continue.</p>
            </div>
          )}
        </div>
      );

      // ── Step 7: Undergraduate ──────────────────────────────────────────────
      case 7: return (
        <div>
          <div style={row2}>
            <Field label="College Name *"><input {...aField('ug_college')} className="ps-input" /></Field>
            <Field label="University Name *"><input {...aField('ug_university')} className="ps-input" /></Field>
          </div>
          <div style={row2}>
            <Field label="Degree *">
              <input {...aField('ug_degree')} className="ps-input" placeholder="B.Tech / B.E. / BCA / B.Sc…" list="ug-degrees" />
              <datalist id="ug-degrees">{['B.Tech','B.E.','BCA','BBA','B.Sc','B.Com','BA','B.Des','Other'].map(d => <option key={d} value={d} />)}</datalist>
            </Field>
            <Field label="Branch / Course *">
              <input {...aField('ug_branch')} className="ps-input" placeholder="CSE / IT / ECE…" list="ug-branches" />
              <datalist id="ug-branches">{['Computer Science (CSE)','Information Technology (IT)','Electronics (ECE)','Mechanical (ME)','Civil (CE)','Chemical','Other'].map(d => <option key={d} value={d} />)}</datalist>
            </Field>
          </div>
          <div style={row3}>
            <Field label="Enrollment Year *"><input {...aField('ug_enrollment_year')} className="ps-input" placeholder="2021" /></Field>
            <Field label="Graduation Year *"><input {...aField('ug_graduation_year')} className="ps-input" placeholder="2025" /></Field>
            <Field label="Current Semester"><input {...aField('ug_current_semester')} className="ps-input" placeholder="6th" /></Field>
          </div>
          <Field label="Result Type">
            <div className="ps-toggle">
              <button type="button" className={academic.ug_entry === 'cgpa' ? 'active' : ''} onClick={() => setAcademic(a => ({ ...a, ug_entry: 'cgpa' }))}>CGPA</button>
              <button type="button" className={academic.ug_entry === 'percentage' ? 'active' : ''} onClick={() => setAcademic(a => ({ ...a, ug_entry: 'percentage' }))}>Percentage</button>
            </div>
          </Field>
          {academic.ug_entry === 'cgpa'
            ? <Field label="CGPA *"><input {...aField('ug_cgpa')} className="ps-input" placeholder="8.5 / 10" /></Field>
            : <Field label="Percentage *"><input {...aField('ug_percentage')} className="ps-input" placeholder="78.5" /></Field>}
          <div style={row2}>
            <Field label="Total Backlogs"><input type="number" min="0" {...aField('ug_backlogs')} className="ps-input" /></Field>
            <Field label="Active Backlogs"><input type="number" min="0" {...aField('ug_active_backlogs')} className="ps-input" /></Field>
          </div>
        </div>
      );

      // ── Step 8: Postgraduate ───────────────────────────────────────────────
      case 8: return (
        <div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '20px', color: '#94a3b8', fontSize: '14px' }}>
            <input type="checkbox" checked={academic.has_pg} onChange={e => setAcademic(a => ({ ...a, has_pg: e.target.checked }))} style={{ width: '16px', height: '16px', accentColor: '#6366f1' }} />
            I have / am pursuing a Postgraduate degree
          </label>
          {academic.has_pg && (
            <>
              <div style={row2}>
                <Field label="College *"><input {...aField('pg_college')} className="ps-input" /></Field>
                <Field label="Degree *"><input {...aField('pg_degree')} className="ps-input" placeholder="M.Tech / MBA / MCA…" /></Field>
              </div>
              <div style={row2}>
                <Field label="Specialization *"><input {...aField('pg_specialization')} className="ps-input" /></Field>
                <Field label="Year"><input {...aField('pg_year')} className="ps-input" placeholder="2026" /></Field>
              </div>
              <div style={row2}>
                <Field label="CGPA"><input {...aField('pg_cgpa')} className="ps-input" /></Field>
                <Field label="Percentage"><input {...aField('pg_percentage')} className="ps-input" /></Field>
              </div>
            </>
          )}
        </div>
      );

      // ── Step 9: Technical Skills ───────────────────────────────────────────
      case 9: return (
        <div>
          <TagInput label="Technical Skills * (min 3)" value={skills.technical_skills} onChange={v => setSkills(s => ({ ...s, technical_skills: v }))} placeholder="React, Node.js, Python…" hint="Type a skill and press Enter" />
          <TagInput label="Programming Languages * (min 1)" value={skills.programming_languages} onChange={v => setSkills(s => ({ ...s, programming_languages: v }))} placeholder="JavaScript, Python, Java…" />
          <TagInput label="Frameworks & Libraries" value={skills.frameworks} onChange={v => setSkills(s => ({ ...s, frameworks: v }))} placeholder="Express, Django, Spring…" />
          <TagInput label="Databases" value={skills.databases} onChange={v => setSkills(s => ({ ...s, databases: v }))} placeholder="MySQL, MongoDB, PostgreSQL…" />
          <TagInput label="Cloud Technologies" value={skills.cloud_skills} onChange={v => setSkills(s => ({ ...s, cloud_skills: v }))} placeholder="AWS, GCP, Azure, Firebase…" />
          <TagInput label="Dev Tools & IDEs" value={skills.dev_tools} onChange={v => setSkills(s => ({ ...s, dev_tools: v }))} placeholder="Git, Docker, VS Code, Postman…" />
        </div>
      );

      // ── Step 10: Soft Skills & Languages ──────────────────────────────────
      case 10: return (
        <div>
          <TagInput label="Soft Skills" value={skills.soft_skills} onChange={v => setSkills(s => ({ ...s, soft_skills: v }))} placeholder="Leadership, Communication…" />
          <div style={{ marginBottom: '8px' }}><label style={lbl}>Languages Known</label></div>
          {(Array.isArray(skills.languages_known) && skills.languages_known.length > 0 && typeof skills.languages_known[0] === 'object'
            ? skills.languages_known
            : skills.languages_known.map(l => typeof l === 'string' ? { lang: l, prof: 'Fluent' } : l)
          ).map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '10px' }}>
              <input value={l.lang || ''} onChange={e => { const arr = [...skills.languages_known]; arr[i] = { ...l, lang: e.target.value }; setSkills(s => ({ ...s, languages_known: arr })); }} className="ps-input" placeholder="e.g. Tamil" style={{ flex: 1 }} />
              <select value={l.prof || 'Fluent'} onChange={e => { const arr = [...skills.languages_known]; arr[i] = { ...l, prof: e.target.value }; setSkills(s => ({ ...s, languages_known: arr })); }} className="ps-input" style={{ width: '160px' }}>
                {['Beginner','Intermediate','Fluent','Native'].map(p => <option key={p}>{p}</option>)}
              </select>
              <button type="button" onClick={() => setSkills(s => ({ ...s, languages_known: s.languages_known.filter((_, j) => j !== i) }))} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ef4444', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer', fontSize: '16px' }}>×</button>
            </div>
          ))}
          <button type="button" className="ps-btn ps-btn-outline" onClick={() => setSkills(s => ({ ...s, languages_known: [...(Array.isArray(s.languages_known) ? s.languages_known : []), { lang: '', prof: 'Fluent' }] }))}>+ Add Language</button>
        </div>
      );

      // ── Step 11: Professional Links ────────────────────────────────────────
      case 11: return (
        <div>
          <div style={row2}>
            <Field label="GitHub URL *"><input {...lField('github_url')} className="ps-input" placeholder="https://github.com/username" type="url" /></Field>
            <Field label="LinkedIn URL"><input {...lField('linkedin_url')} className="ps-input" placeholder="https://linkedin.com/in/username" type="url" /></Field>
          </div>
          <div style={row2}>
            <Field label="Portfolio Website"><input {...lField('portfolio_url')} className="ps-input" type="url" /></Field>
            <Field label="Personal Website"><input {...lField('personal_website')} className="ps-input" type="url" /></Field>
          </div>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '12px' }}>Coding Profiles</p>
          <div style={row3}>
            <Field label="LeetCode"><input {...lField('leetcode_url')} className="ps-input" type="url" /></Field>
            <Field label="HackerRank"><input {...lField('hackerrank_url')} className="ps-input" type="url" /></Field>
            <Field label="CodeChef"><input {...lField('codechef_url')} className="ps-input" type="url" /></Field>
          </div>
          <div style={row3}>
            <Field label="Codeforces"><input {...lField('codeforces_url')} className="ps-input" type="url" /></Field>
            <Field label="Kaggle"><input {...lField('kaggle_url')} className="ps-input" type="url" /></Field>
            <Field label="GitLab"><input {...lField('gitlab_url')} className="ps-input" type="url" /></Field>
          </div>
        </div>
      );

      // ── Step 12: Professional Summary ──────────────────────────────────────
      case 12: return (
        <div>
          <Field label="Professional Summary">
            <textarea {...sField('professional_summary')} className="ps-input" style={{ height: '100px', resize: 'vertical' }} placeholder="Write a brief summary of your skills, experience, and what makes you unique…" />
          </Field>
          <Field label="Career Objective">
            <textarea {...sField('career_objective')} className="ps-input" style={{ height: '80px', resize: 'vertical' }} placeholder="What are you looking for in your next role?" />
          </Field>
          <Field label="Areas of Interest">
            <input {...sField('areas_of_interest')} className="ps-input" placeholder="e.g. Full-stack development, Machine learning, Cloud architecture…" />
          </Field>
        </div>
      );

      // ── Step 13: Projects ──────────────────────────────────────────────────
      case 13: return <ProjectsStep projects={projects} onAdd={addProject} onRemove={removeProject} saving={saving} />;

      // ── Step 14: Work Experience ───────────────────────────────────────────
      case 14: return <ExperienceStep experience={experience} onAdd={addExp} onRemove={removeExp} saving={saving} fresher={prefs.is_fresher} onFresherChange={v => setPrefs(p => ({ ...p, is_fresher: v }))} />;

      // ── Step 15: Internships ───────────────────────────────────────────────
      case 15: return (
        <div>
          <p style={{ color: '#94a3b8', fontSize: '14px', marginBottom: '20px' }}>Add internships here — they appear as Experience entries.</p>
          <ExperienceStep experience={experience.filter(e => e.employment_type === 'Internship')} onAdd={exp => addExp({ ...exp, employment_type: 'Internship' })} onRemove={removeExp} saving={saving} fresher={false} onFresherChange={() => {}} />
        </div>
      );

      // ── Step 16: Certifications ────────────────────────────────────────────
      case 16: return <CertificationsStep certs={certifications} onAdd={addCert} onRemove={removeCert} saving={saving} />;

      // ── Step 17: Achievements ──────────────────────────────────────────────
      case 17: return <AchievementsStep achievements={achievements} onAdd={addAch} onRemove={removeAch} saving={saving} />;

      // ── Step 18: Job Preferences ───────────────────────────────────────────
      case 18: return (
        <div>
          <TagInput label="Preferred Job Roles * (min 1)" value={prefs.preferred_roles} onChange={v => setPrefs(p => ({ ...p, preferred_roles: v }))} placeholder="Software Engineer, Data Analyst…" />
          <TagInput label="Preferred Industries" value={prefs.preferred_industries} onChange={v => setPrefs(p => ({ ...p, preferred_industries: v }))} placeholder="IT, Finance, EdTech…" />
          <Field label="Employment Type *">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {['Full-time','Part-time','Internship','Contract','Freelance'].map(t => (
                <label key={t} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="checkbox" checked={prefs.preferred_employment_type.includes(t)} onChange={e => setPrefs(p => ({ ...p, preferred_employment_type: e.target.checked ? [...p.preferred_employment_type, t] : p.preferred_employment_type.filter(x => x !== t) }))} style={{ accentColor: '#6366f1' }} />
                  {t}
                </label>
              ))}
            </div>
          </Field>
          <Field label="Work Mode *">
            <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
              {['Remote','Hybrid','On-site','Any'].map(m => (
                <label key={m} style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#94a3b8', fontSize: '14px', cursor: 'pointer' }}>
                  <input type="radio" name="work-mode" value={m.toLowerCase()} checked={prefs.preferred_work_mode === m.toLowerCase() || prefs.preferred_work_mode === m} onChange={() => setPrefs(p => ({ ...p, preferred_work_mode: m.toLowerCase() }))} style={{ accentColor: '#6366f1' }} />
                  {m}
                </label>
              ))}
            </div>
          </Field>
          <TagInput label="Preferred Locations" value={prefs.preferred_locations} onChange={v => setPrefs(p => ({ ...p, preferred_locations: v }))} placeholder="Bengaluru, Mumbai, Remote…" />
          <div style={row2}>
            <Field label="Expected CTC / Salary (optional)"><input {...rField('expected_salary')} className="ps-input" placeholder="e.g. ₹5 LPA or Negotiable" /></Field>
            <Field label="Availability to Join">
              <select {...rField('availability_to_join')} className="ps-input">
                <option value="">Select</option>
                {['Immediately','15 days','30 days','60 days','90 days','After graduation'].map(o => <option key={o}>{o}</option>)}
              </select>
            </Field>
          </div>
          <div style={row2}>
            <Field label="Placement Status">
              <select value={prefs.current_placement_status} onChange={e => setPrefs(p => ({ ...p, current_placement_status: e.target.value }))} className="ps-input">
                {[{v:'not_placed',l:'Not Placed'},{v:'placed',l:'Placed'},{v:'actively_looking',l:'Actively Looking'},{v:'not_looking',l:'Not Looking'},{v:'open_to_opp',l:'Open to Opportunities'}].map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
            </Field>
            <Field label="Preferred Interview Mode">
              <select value={prefs.preferred_interview_mode} onChange={e => setPrefs(p => ({ ...p, preferred_interview_mode: e.target.value }))} className="ps-input">
                <option value="online">Online</option>
                <option value="in_person">In-Person</option>
                <option value="either">Either</option>
              </select>
            </Field>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', color: '#94a3b8', fontSize: '14px' }}>
            <input type="checkbox" checked={prefs.willing_to_relocate} onChange={e => setPrefs(p => ({ ...p, willing_to_relocate: e.target.checked }))} style={{ accentColor: '#6366f1' }} />
            Willing to relocate
          </label>
        </div>
      );

      // ── Step 19: Additional Info ───────────────────────────────────────────
      case 19: return (
        <div>
          <div style={row2}>
            <Field label="Notice Period (if employed)"><input {...rField('notice_period')} className="ps-input" placeholder="30 days" /></Field>
            <Field label="Willing to Travel">
              <select value={addlInfo.willing_to_travel} onChange={e => setAddlInfo(a => ({ ...a, willing_to_travel: e.target.value }))} className="ps-input">
                <option value="">Select</option>
                <option>Yes</option><option>No</option><option>Sometimes</option>
              </select>
            </Field>
          </div>
          <Field label="Work Authorization">
            <select value={addlInfo.work_authorization} onChange={e => setAddlInfo(a => ({ ...a, work_authorization: e.target.value }))} className="ps-input">
              <option value="">Select</option>
              <option>Indian Citizen</option><option>Need Visa</option><option>Other</option>
            </select>
          </Field>
          <Field label="How did you hear about JobAI?">
            <select value={addlInfo.how_heard} onChange={e => setAddlInfo(a => ({ ...a, how_heard: e.target.value }))} className="ps-input">
              <option value="">Select (optional)</option>
              {['Social media','Friend / colleague','College placement cell','Job portal','Google search','Other'].map(o => <option key={o}>{o}</option>)}
            </select>
          </Field>
        </div>
      );

      // ── Step 20: Review & Confirm ──────────────────────────────────────────
      case 20: return (
        <div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '32px' }}>
            <div style={{ position: 'relative', width: '120px', height: '120px', marginBottom: '16px' }}>
              <svg width="120" height="120" style={{ transform: 'rotate(-90deg)' }}>
                <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="12" />
                <circle cx="60" cy="60" r="52" fill="none" stroke={completionPct >= 80 ? '#4ade80' : completionPct >= 50 ? '#6366f1' : '#f97316'}
                  strokeWidth="12" strokeLinecap="round"
                  strokeDasharray={`${(completionPct / 100) * 327} 327`} style={{ transition: 'stroke-dasharray 0.8s' }} />
              </svg>
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <span style={{ fontSize: '28px', fontWeight: '800', color: '#f1f5f9' }}>{completionPct}%</span>
                <span style={{ fontSize: '11px', color: '#64748b' }}>complete</span>
              </div>
            </div>
            <p style={{ color: completionPct >= 80 ? '#4ade80' : '#f97316', fontWeight: '600', margin: 0 }}>
              {completionPct >= 80 ? '✅ Profile ready! You can proceed to the dashboard.' : `⚠️ Need ${80 - completionPct}% more to unlock dashboard.`}
            </p>
          </div>

          {[
            { key: 'personal_info', label: 'Personal Info', done: !!(profile?.first_name && profile?.last_name) },
            { key: 'academic', label: 'Academic', done: !!(profile?.class10_school && profile?.ug_college) },
            { key: 'skills', label: 'Skills', done: parseArr(profile?.technical_skills).length >= 3 },
            { key: 'links', label: 'Professional Links', done: !!(profile?.github_url || profile?.linkedin_url) },
            { key: 'projects', label: 'Projects', done: projects.length >= 1 },
            { key: 'experience', label: 'Experience', done: experience.length >= 1 || !!profile?.is_fresher },
            { key: 'certifications', label: 'Certifications', done: certifications.length >= 1 },
            { key: 'preferences', label: 'Job Preferences', done: parseArr(profile?.preferred_roles).length >= 1 },
          ].map(({ key, label, done }) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', background: done ? 'rgba(74,222,128,0.05)' : 'rgba(249,115,22,0.05)', border: `1px solid ${done ? 'rgba(74,222,128,0.15)' : 'rgba(249,115,22,0.15)'}`, borderRadius: '10px', marginBottom: '8px' }}>
              <span style={{ color: done ? '#4ade80' : '#f97316', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                {done ? '✅' : '⚠️'} {label}
              </span>
              {!done && (
                <button type="button" onClick={() => { const stepMap = { personal_info: 1, academic: 4, skills: 9, links: 11, projects: 13, experience: 14, certifications: 16, preferences: 18 }; setStep(stepMap[key] || 1); }} style={{ background: 'rgba(249,115,22,0.15)', border: 'none', color: '#f97316', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer', fontSize: '12px', fontFamily: 'inherit' }}>
                  Complete Now →
                </button>
              )}
            </div>
          ))}
        </div>
      );

      default: return null;
    }
  };

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center', color: '#94a3b8' }}>
          <div style={{ width: '48px', height: '48px', border: '4px solid rgba(99,102,241,0.2)', borderTopColor: '#6366f1', borderRadius: '50%', margin: '0 auto 16px', animation: 'spin 0.8s linear infinite' }} />
          <p>Loading your profile…</p>
        </div>
        <style>{'@keyframes spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  const progressFill = ((step - 1) / 19) * 100;

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)', fontFamily: "'Inter', sans-serif", color: '#f1f5f9' }}>
      <style>{css + '@keyframes spin { to { transform: rotate(360deg); } }'}</style>

      {/* Toast */}
      {toast.show && (
        <div style={{ position: 'fixed', top: '20px', right: '20px', zIndex: 9999, background: toast.type === 'error' ? '#7f1d1d' : '#14532d', border: `1px solid ${toast.type === 'error' ? '#ef4444' : '#4ade80'}`, color: toast.type === 'error' ? '#fca5a5' : '#bbf7d0', padding: '12px 20px', borderRadius: '10px', fontSize: '14px', fontWeight: '500', boxShadow: '0 8px 25px rgba(0,0,0,0.4)', maxWidth: '360px' }}>
          {toast.msg}
        </div>
      )}

      {/* Header */}
      <div style={{ position: 'sticky', top: 0, zIndex: 100, background: 'rgba(15,23,42,0.95)', backdropFilter: 'blur(12px)', borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div>
              <span style={{ color: '#a5b4fc', fontSize: '13px', fontWeight: '600' }}>Step {step} of 20</span>
              <span style={{ color: '#475569', fontSize: '13px', margin: '0 8px' }}>—</span>
              <span style={{ color: '#f1f5f9', fontSize: '13px', fontWeight: '500' }}>{STEP_NAMES[step - 1]}</span>
            </div>
            <span style={{ color: completionPct >= 80 ? '#4ade80' : '#6366f1', fontSize: '13px', fontWeight: '700' }}>{completionPct}% Complete</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '100px', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${progressFill}%`, background: 'linear-gradient(90deg, #6366f1, #8b5cf6)', borderRadius: '100px', transition: 'width 0.4s' }} />
          </div>
        </div>
      </div>

      {/* Card */}
      <div style={{ maxWidth: '720px', margin: '40px auto', padding: '0 24px 120px' }}>
        <div style={{ background: 'rgba(15,23,42,0.7)', backdropFilter: 'blur(16px)', border: '1px solid rgba(99,102,241,0.15)', borderRadius: '20px', padding: '40px' }}>
          <h2 style={{ margin: '0 0 6px', fontSize: '22px', fontWeight: '700', color: '#f1f5f9' }}>{STEP_NAMES[step - 1]}</h2>
          <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: '14px' }}>
            {step < 20 ? 'Fill in the details below and click Save & Continue.' : 'Review your profile completeness before going to the dashboard.'}
          </p>
          {renderStep()}
        </div>
      </div>

      {/* Bottom nav */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(15,23,42,0.97)', backdropFilter: 'blur(16px)', borderTop: '1px solid rgba(255,255,255,0.06)', padding: '16px 24px' }}>
        <div style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
          <button type="button" className="ps-btn ps-btn-outline" style={{ visibility: step === 1 ? 'hidden' : 'visible' }} onClick={() => setStep(s => s - 1)}>
            ← Back
          </button>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button type="button" className="ps-btn ps-btn-outline" disabled={saving} onClick={async () => { await handleSave(); setStep(s => s); }}>
              {saving ? '⏳' : '💾'} Save Progress
            </button>
            <button type="button" id="profile-save-continue-btn" className="ps-btn ps-btn-primary" disabled={saving} onClick={handleSave}>
              {saving ? '⏳ Saving…' : step === 20 ? (completionPct >= 80 ? '✓ Go to Dashboard' : `Need ${80 - completionPct}% more`) : 'Save & Continue →'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-step components (Projects, Experience, Certs, Achievements) ────────────

function ProjectsStep({ projects, onAdd, onRemove, saving }) {
  const [form, setForm] = useState({ title: '', description: '', technologies: [], user_role: '', duration: '', github_url: '', live_demo_url: '', key_features: '', outcome: '', is_team_project: false, team_size: 1 });
  const [open, setOpen] = useState(false);
  const f = k => ({ value: form[k] || '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), className: 'ps-input' });

  return (
    <div>
      {projects.length === 0 && !open && (
        <div style={{ textAlign: 'center', padding: '40px', border: '1.5px dashed rgba(255,255,255,0.1)', borderRadius: '12px', marginBottom: '20px' }}>
          <span style={{ fontSize: '40px' }}>💡</span>
          <p style={{ color: '#64748b', marginTop: '12px' }}>No projects added yet. Add at least one project to boost your profile.</p>
        </div>
      )}
      {projects.map(p => (
        <div key={p.id} className="ps-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <p style={{ margin: '0 0 4px', fontWeight: '600', color: '#f1f5f9' }}>{p.title}</p>
            <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>{p.description?.slice(0, 80)}{p.description?.length > 80 ? '…' : ''}</p>
          </div>
          <button type="button" onClick={() => onRemove(p.id)} disabled={saving} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ef4444', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', whiteSpace: 'nowrap' }}>× Remove</button>
        </div>
      ))}
      {open ? (
        <div className="ps-card">
          <Field label="Project Title *"><input {...f('title')} placeholder="E-Commerce Web App" /></Field>
          <Field label="Description *"><textarea {...f('description')} className="ps-input" style={{ height: '80px', resize: 'vertical' }} /></Field>
          <TagInput label="Technologies *" value={form.technologies} onChange={v => setForm(p => ({ ...p, technologies: v }))} placeholder="React, Node.js…" />
          <div style={row2}>
            <Field label="Your Role"><input {...f('user_role')} placeholder="Frontend Developer" /></Field>
            <Field label="Duration"><input {...f('duration')} placeholder="2 months" /></Field>
          </div>
          <div style={row2}>
            <Field label="GitHub URL"><input {...f('github_url')} type="url" /></Field>
            <Field label="Live Demo URL"><input {...f('live_demo_url')} type="url" /></Field>
          </div>
          <Field label="Key Features"><textarea {...f('key_features')} className="ps-input" style={{ height: '60px', resize: 'vertical' }} /></Field>
          <Field label="Outcome"><input {...f('outcome')} placeholder="Reduced load time by 40%" /></Field>
          <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
            <button type="button" className="ps-btn ps-btn-primary" disabled={saving || !form.title} onClick={async () => { await onAdd(form); setForm({ title: '', description: '', technologies: [], user_role: '', duration: '', github_url: '', live_demo_url: '', key_features: '', outcome: '', is_team_project: false, team_size: 1 }); setOpen(false); }}>
              {saving ? '⏳' : '+ Add Project'}
            </button>
            <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </div>
      ) : (
        <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(true)} style={{ width: '100%', marginTop: '8px' }}>+ Add Project</button>
      )}
    </div>
  );
}

function ExperienceStep({ experience, onAdd, onRemove, saving, fresher, onFresherChange }) {
  const [form, setForm] = useState({ company_name: '', job_title: '', employment_type: '', start_date: '', end_date: '', is_current: false, location: '', responsibilities: '', technologies: [] });
  const [open, setOpen] = useState(false);
  const f = k => ({ value: form[k] || '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), className: 'ps-input' });

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px', color: '#94a3b8', fontSize: '14px' }}>
        <input type="checkbox" checked={fresher} onChange={e => onFresherChange(e.target.checked)} style={{ accentColor: '#6366f1' }} />
        I am a Fresher (no work experience)
      </label>
      {!fresher && (
        <>
          {experience.map(e => (
            <div key={e.id} className="ps-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: '0 0 4px', fontWeight: '600', color: '#f1f5f9' }}>{e.job_title} @ {e.company_name}</p>
                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>{e.employment_type} · {e.start_date} – {e.is_current ? 'Present' : e.end_date}</p>
              </div>
              <button type="button" onClick={() => onRemove(e.id)} disabled={saving} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ef4444', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>× Remove</button>
            </div>
          ))}
          {open ? (
            <div className="ps-card">
              <div style={row2}>
                <Field label="Company Name *"><input {...f('company_name')} /></Field>
                <Field label="Job Title *"><input {...f('job_title')} /></Field>
              </div>
              <div style={row2}>
                <Field label="Employment Type">
                  <select {...f('employment_type')} className="ps-input">
                    <option value="">Select</option>
                    {['Internship','Full-time','Part-time','Freelance','Contract'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Location"><input {...f('location')} /></Field>
              </div>
              <div style={row2}>
                <Field label="Start Date"><input type="month" {...f('start_date')} /></Field>
                <Field label="End Date"><input type="month" {...f('end_date')} disabled={form.is_current} /></Field>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', color: '#94a3b8', fontSize: '14px', marginBottom: '12px' }}>
                <input type="checkbox" checked={form.is_current} onChange={e => setForm(p => ({ ...p, is_current: e.target.checked }))} style={{ accentColor: '#6366f1' }} />
                Currently working here
              </label>
              <Field label="Responsibilities"><textarea {...f('responsibilities')} className="ps-input" style={{ height: '80px', resize: 'vertical' }} /></Field>
              <TagInput label="Technologies Used" value={form.technologies} onChange={v => setForm(p => ({ ...p, technologies: v }))} />
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="ps-btn ps-btn-primary" disabled={saving || !form.company_name || !form.job_title} onClick={async () => { await onAdd(form); setForm({ company_name: '', job_title: '', employment_type: '', start_date: '', end_date: '', is_current: false, location: '', responsibilities: '', technologies: [] }); setOpen(false); }}>
                  {saving ? '⏳' : '+ Add'}
                </button>
                <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(true)} style={{ width: '100%', marginTop: '8px' }}>+ Add Experience</button>
          )}
        </>
      )}
    </div>
  );
}

function CertificationsStep({ certs, onAdd, onRemove, saving }) {
  const [form, setForm] = useState({ name: '', issuing_org: '', issue_date: '', expiry_date: '', credential_id: '', credential_url: '' });
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState(false);
  const f = k => ({ value: form[k] || '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), className: 'ps-input' });

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px', color: '#94a3b8', fontSize: '14px' }}>
        <input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} style={{ accentColor: '#6366f1' }} />
        No Certifications (skip this section)
      </label>
      {!skip && (
        <>
          {certs.map(c => (
            <div key={c.id} className="ps-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: '0 0 4px', fontWeight: '600', color: '#f1f5f9' }}>{c.name}</p>
                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>{c.issuing_org} · {c.issue_date}</p>
              </div>
              <button type="button" onClick={() => onRemove(c.id)} disabled={saving} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ef4444', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>× Remove</button>
            </div>
          ))}
          {open ? (
            <div className="ps-card">
              <div style={row2}>
                <Field label="Certificate Name *"><input {...f('name')} placeholder="AWS Solutions Architect" /></Field>
                <Field label="Issuing Organization *"><input {...f('issuing_org')} placeholder="Amazon Web Services" /></Field>
              </div>
              <div style={row2}>
                <Field label="Issue Date"><input type="month" {...f('issue_date')} /></Field>
                <Field label="Expiry Date"><input type="month" {...f('expiry_date')} /></Field>
              </div>
              <div style={row2}>
                <Field label="Credential ID"><input {...f('credential_id')} /></Field>
                <Field label="Credential URL"><input {...f('credential_url')} type="url" /></Field>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="ps-btn ps-btn-primary" disabled={saving || !form.name || !form.issuing_org} onClick={async () => { await onAdd(form); setForm({ name: '', issuing_org: '', issue_date: '', expiry_date: '', credential_id: '', credential_url: '' }); setOpen(false); }}>
                  {saving ? '⏳' : '+ Add'}
                </button>
                <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(true)} style={{ width: '100%', marginTop: '8px' }}>+ Add Certification</button>
          )}
        </>
      )}
    </div>
  );
}

function AchievementsStep({ achievements, onAdd, onRemove, saving }) {
  const [form, setForm] = useState({ type: '', title: '', description: '', date: '', organization: '', url: '' });
  const [open, setOpen] = useState(false);
  const [skip, setSkip] = useState(false);
  const f = k => ({ value: form[k] || '', onChange: e => setForm(p => ({ ...p, [k]: e.target.value })), className: 'ps-input' });

  return (
    <div>
      <label style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', marginBottom: '16px', color: '#94a3b8', fontSize: '14px' }}>
        <input type="checkbox" checked={skip} onChange={e => setSkip(e.target.checked)} style={{ accentColor: '#6366f1' }} />
        No Achievements to add
      </label>
      {!skip && (
        <>
          {achievements.map(a => (
            <div key={a.id} className="ps-card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <p style={{ margin: '0 0 4px', fontWeight: '600', color: '#f1f5f9' }}>{a.title}</p>
                <p style={{ margin: 0, color: '#64748b', fontSize: '13px' }}>{a.type} · {a.organization} · {a.date}</p>
              </div>
              <button type="button" onClick={() => onRemove(a.id)} disabled={saving} style={{ background: 'rgba(239,68,68,0.15)', border: 'none', color: '#ef4444', padding: '6px 10px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px' }}>× Remove</button>
            </div>
          ))}
          {open ? (
            <div className="ps-card">
              <div style={row2}>
                <Field label="Type">
                  <select {...f('type')} className="ps-input">
                    <option value="">Select type</option>
                    {['Academic','Technical','Hackathon','Award','Scholarship','Publication','Competition','Leadership','Volunteering','Other'].map(t => <option key={t}>{t}</option>)}
                  </select>
                </Field>
                <Field label="Title *"><input {...f('title')} placeholder="1st Place — Smart India Hackathon" /></Field>
              </div>
              <Field label="Description"><textarea {...f('description')} className="ps-input" style={{ height: '70px', resize: 'vertical' }} /></Field>
              <div style={row2}>
                <Field label="Date"><input type="month" {...f('date')} /></Field>
                <Field label="Organization"><input {...f('organization')} /></Field>
              </div>
              <Field label="URL"><input {...f('url')} type="url" /></Field>
              <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                <button type="button" className="ps-btn ps-btn-primary" disabled={saving || !form.title} onClick={async () => { await onAdd(form); setForm({ type: '', title: '', description: '', date: '', organization: '', url: '' }); setOpen(false); }}>
                  {saving ? '⏳' : '+ Add'}
                </button>
                <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(false)}>Cancel</button>
              </div>
            </div>
          ) : (
            <button type="button" className="ps-btn ps-btn-outline" onClick={() => setOpen(true)} style={{ width: '100%', marginTop: '8px' }}>+ Add Achievement</button>
          )}
        </>
      )}
    </div>
  );
}
