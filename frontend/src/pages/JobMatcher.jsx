import React, { useState } from 'react';
import { Plus, Trash2, Crosshair, Zap, ExternalLink, ChevronDown, ChevronUp, MessageSquare, AlertTriangle } from 'lucide-react';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Card, Btn, Input, Textarea, SectionTitle, Badge, ScoreRing, Empty, Alert } from '../components/UI';
import { AIThinking } from '../components/Progress';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import Loader from '../components/Loader';

const emptyJob = { title: '', company: '', description: '', apply_url: '' };

export default function JobMatcher() {
  const [jobs, setJobs] = useState([{ ...emptyJob }]);
  const [results, setResults] = useState([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [expanded, setExpanded] = useState({});
  const [tailoring, setTailoring] = useState({});
  const [tailored, setTailored] = useState({});
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answering, setAnswering] = useState(false);
  const [activeJobId, setActiveJobId] = useState(null);
  const [personality, setPersonality] = useState('formal_confident');
  const [applying, setApplying] = useState({});
  const [applyResults, setApplyResults] = useState({});
  const toast = useToast();
  const confirm = useConfirm();

  const addJob = () => { if (jobs.length < 10) setJobs(j => [...j, { ...emptyJob }]); };
  const removeJob = (i) => setJobs(j => j.filter((_, idx) => idx !== i));
  const updateJob = (i, k, v) => setJobs(j => j.map((job, idx) => idx === i ? { ...job, [k]: v } : job));
  const toggle = (id) => setExpanded(e => ({ ...e, [id]: !e[id] }));

  const analyze = async () => {
    const valid = jobs.filter(j => j.description.trim().length >= 50);
    if (!valid.length) { toast.error('Add at least one job description (min 50 characters).'); return; }
    setAnalyzing(true); setResults([]);
    try {
      const r = await api.post(ENDPOINTS.jobs.analyze, { jobs: valid });
      setResults(r.data.results || []);
      const autoCount = (r.data.results || []).filter(x => x.status === 'auto_apply').length;
      const askCount  = (r.data.results || []).filter(x => x.status === 'ask_user').length;
      toast.success(`Analysis complete — ${autoCount} AUTO APPLY, ${askCount} need your confirmation.`);
    } catch (err) {
      toast.error(err.message || 'Analysis failed. Make sure you have an active resume uploaded.');
    } finally { setAnalyzing(false); }
  };

  const tailor = async (jobId) => {
    setTailoring(t => ({ ...t, [jobId]: true }));
    try {
      const r = await api.post(buildUrl(ENDPOINTS.jobs.tailor, { id: jobId }));
      setTailored(t => ({ ...t, [jobId]: r.data.tailored_resume }));
      toast.success('Resume tailored successfully.');
    } catch (err) {
      toast.error(err.message || 'Tailoring failed.');
    } finally { setTailoring(t => ({ ...t, [jobId]: false })); }
  };

  const startApply = async (jobId, forceConfirmed = false) => {
    setApplying(a => ({ ...a, [jobId]: true }));
    try {
      const r = await api.post(ENDPOINTS.applications.start, { job_id: jobId, user_confirmed: forceConfirmed });

      if (r.data.requires_confirmation) {
        setApplying(a => ({ ...a, [jobId]: false }));
        const missing = (r.data.missing_requirements || []).slice(0, 5).join(', ') || 'None listed';
        const ok = await confirm(
          `${r.data.message}\n\nMissing: ${missing}\n\nReason: ${r.data.reason}\n\nOnce confirmed, AI will tailor your resume and proceed automatically.`,
          { title: `Low Match (${r.data.match_score}%) — Confirm?`, confirmLabel: 'Yes, Apply Anyway', danger: false }
        );
        if (!ok) { toast.info('Application skipped.'); return; }
        await startApply(jobId, true);
        return;
      }

      setApplyResults(a => ({ ...a, [jobId]: r.data }));
      setTailored(t => ({ ...t, [jobId]: r.data.tailored_resume }));
      toast.success('Resume tailored. Review below, then apply manually or use Auto-Apply.');
    } catch (err) {
      // Handle 429 rate limit — show queue info
      if (err.response?.status === 429) {
        const d = err.response.data;
        const resetAt = d.rate_limit?.next_reset_at
          ? new Date(d.rate_limit.next_reset_at).toLocaleTimeString()
          : 'next window';
        toast.warning(
          d.queued_id
            ? `Rate limit reached (8 apps/12h). Job queued — will process automatically at ${resetAt}.`
            : `Rate limit reached (8 apps/12h). Next slot opens at ${resetAt}.`
        );
      } else {
        toast.error(err.message || 'Could not start application.');
      }
    } finally { setApplying(a => ({ ...a, [jobId]: false })); }
  };

  const markApplied = async (appId, jobId) => {
    try {
      await api.post(buildUrl(ENDPOINTS.applications.markApplied, { id: appId }));
      setApplyResults(a => ({ ...a, [jobId]: { ...a[jobId], status: 'applied' } }));
      toast.success('Application marked as applied! Good luck! 🎉');
    } catch (err) {
      toast.error(err.message || 'Failed to mark as applied.');
    }
  };

  const answerQuestion = async (jobId) => {
    if (!question.trim()) { toast.warning('Enter a question first.'); return; }
    setAnswering(true); setAnswer('');
    try {
      const r = await api.post(ENDPOINTS.applications.answerQ, { question, job_id: jobId, personality });
      setAnswer(r.data.answer);
    } catch (err) {
      toast.error(err.message || 'Answer generation failed.');
    } finally { setAnswering(false); }
  };

  // Status → badge color mapping for AUTO_APPLY / ASK_USER
  const statusColor = (s) => ({
    auto_apply: 'green', ask_user: 'yellow',
    skipped: 'yellow', error: 'red',
    // legacy
    ready_to_apply: 'green', below_threshold: 'red'
  }[s] || 'gray');

  return (
    <div>
      <SectionTitle sub="Paste up to 10 job descriptions. AI analyzes each against your resume and applies only where match ≥ 80%.">
        AI Job Matcher
      </SectionTitle>

      {/* Job Input Cards */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginBottom: 20 }}>
        {jobs.map((job, i) => (
          <Card key={i}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#475569', fontFamily: 'Space Mono,monospace' }}>JOB #{i + 1}</span>
              {jobs.length > 1 && <Btn variant="danger" size="sm" onClick={() => removeJob(i)}><Trash2 size={13} /></Btn>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 12 }}>
              <Input label="Job Title *" placeholder="Frontend Developer" value={job.title} onChange={e => updateJob(i, 'title', e.target.value)} />
              <Input label="Company" placeholder="Google" value={job.company} onChange={e => updateJob(i, 'company', e.target.value)} />
            </div>
            <Input label="Apply URL" placeholder="https://jobs.example.com/apply/123" value={job.apply_url} onChange={e => updateJob(i, 'apply_url', e.target.value)} style={{ marginBottom: 12 }} />
            <Textarea label="Job Description * (min 50 chars)" placeholder="Paste the full job description here..." value={job.description} onChange={e => updateJob(i, 'description', e.target.value)} style={{ minHeight: 140 }} />
          </Card>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 12, marginBottom: 28 }}>
        {jobs.length < 10 && <Btn variant="ghost" onClick={addJob}><Plus size={16} /> Add Another Job</Btn>}
        <Btn onClick={analyze} loading={analyzing} size="lg">
          <Crosshair size={16} /> {analyzing ? 'Analyzing…' : `Analyze ${jobs.length} Job${jobs.length > 1 ? 's' : ''}`}
        </Btn>
      </div>

      {/* AI Thinking animation */}
      {analyzing && (
        <div style={{ marginBottom: 28 }}>
          <AIThinking active={analyzing} messages={[
            'Reading job descriptions…',
            'Comparing skills with your resume…',
            'Scoring experience match…',
            'Checking for missing requirements…',
            'Calculating final match scores…',
            'Generating recommendations…',
          ]} />
        </div>
      )}

      {results.length > 0 && (
        <div>
          <h2 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 18, color: '#f1f5f9', marginBottom: 16 }}>
            Analysis Results — {results.filter(r => r.status === 'auto_apply').length} AUTO APPLY · {results.filter(r => r.status === 'ask_user').length} ASK USER · {results.filter(r => r.status === 'skipped').length} Skipped
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {results.map((res, i) => (
              <Card key={i} style={{
                border: res.status === 'auto_apply'
                  ? '1px solid rgba(34,197,94,0.35)'
                  : res.status === 'ask_user'
                  ? '1px solid rgba(245,158,11,0.35)'
                  : '1px solid #1a2236'
              }}>
                {/* Header Row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                  {res.match_score !== undefined && <ScoreRing score={res.match_score} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, color: '#f1f5f9', marginBottom: 4 }}>{res.title}</div>
                    {res.company && <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>{res.company}</div>}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <Badge color={statusColor(res.status)}>
                        {res.status === 'auto_apply' ? '✅ AUTO APPLY'
                          : res.status === 'ask_user' ? '⚠️ ASK USER'
                          : res.status?.replace(/_/g, ' ').toUpperCase()}
                      </Badge>
                      {res.recommendation === 'AUTO_APPLY' && <Badge color="green">≥50% Match</Badge>}
                      {res.recommendation === 'ASK_USER' && <Badge color="yellow">&lt;50% — Confirmation Required</Badge>}
                    </div>
                  </div>

                {/* ASK_USER warning panel */}
                {res.status === 'ask_user' && (
                  <div style={{ margin: '10px 0 0', padding: '10px 14px', background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                      <AlertTriangle size={14} color="#f59e0b" />
                      <span style={{ fontSize: 13, color: '#fbbf24', fontWeight: 600 }}>Low Match ({res.match_score}%) — Your confirmation required before applying</span>
                    </div>
                    {res.missing_requirements?.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {res.missing_requirements.map(r => (
                          <Badge key={r} color="yellow">Missing: {r}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                  </div>
                  {res.apply_url && <a href={res.apply_url} target="_blank" rel="noreferrer"><Btn variant="ghost" size="sm"><ExternalLink size={13} /> Open Job</Btn></a>}
                  {res.job_id && <button onClick={() => toggle(res.job_id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}>{expanded[res.job_id] ? <ChevronUp /> : <ChevronDown />}</button>}
                </div>

                {/* Reason */}
                <p style={{ fontSize: 13, color: '#64748b', marginTop: 12, fontStyle: 'italic' }}>{res.reason}</p>

                {/* Expanded Details */}
                {res.job_id && expanded[res.job_id] && (
                  <div style={{ marginTop: 16, borderTop: '1px solid #1a2236', paddingTop: 16 }}>
                    {/* Skills */}
                    {res.skills_match && (
                      <div style={{ marginBottom: 14 }}>
                        <p style={{ fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Skills Matched</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {(res.skills_match.matched || []).map(s => <Badge key={s} color="green">{s}</Badge>)}
                          {(res.skills_match.missing || []).map(s => <Badge key={s} color="red">Missing: {s}</Badge>)}
                        </div>
                      </div>
                    )}
                    {res.strengths?.length > 0 && (
                      <div style={{ marginBottom: 14 }}>
                        <p style={{ fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Your Strengths</p>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {res.strengths.map(s => <Badge key={s} color="blue">{s}</Badge>)}
                        </div>
                      </div>
                    )}

                    {/* Actions for both AUTO_APPLY and ASK_USER (ask_user shows confirm dialog) */}
                    {(res.status === 'auto_apply' || res.status === 'ask_user') && (
                      <div>
                        {/* Tailor + Apply */}
                        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                          <Btn onClick={() => startApply(res.job_id)} loading={applying[res.job_id]} variant="primary" size="sm">
                            <Zap size={14} /> {applying[res.job_id] ? 'Tailoring Resume...' : 'Tailor & Prepare Application'}
                          </Btn>
                          {applyResults[res.job_id] && applyResults[res.job_id].status !== 'applied' && (
                            <Btn onClick={() => markApplied(applyResults[res.job_id].application_id, res.job_id)} variant="success" size="sm">
                              ✓ Mark as Applied
                            </Btn>
                          )}
                          {applyResults[res.job_id]?.status === 'applied' && <Badge color="green">✓ Applied</Badge>}
                        </div>

                        {/* Tailored Resume Preview */}
                        {tailored[res.job_id] && (
                          <div style={{ marginBottom: 14 }}>
                            <p style={{ fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>Tailored Resume Preview</p>
                            <div style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: 14, maxHeight: 240, overflowY: 'auto' }}>
                              <pre style={{ fontFamily: 'Space Mono,monospace', fontSize: 11, color: '#94a3b8', whiteSpace: 'pre-wrap', margin: 0 }}>
                                {tailored[res.job_id]}
                              </pre>
                            </div>
                          </div>
                        )}

                        {/* AI Q&A */}
                        <div style={{ borderTop: '1px solid #1a2236', paddingTop: 14 }}>
                          <p style={{ fontSize: 12, color: '#475569', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <MessageSquare size={12} /> AI Question Helper
                          </p>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                            <input
                              value={activeJobId === res.job_id ? question : ''}
                              onChange={e => { setQuestion(e.target.value); setActiveJobId(res.job_id); }}
                              placeholder="e.g. Why should we hire you?"
                              style={{ flex: 1, minWidth: 200, background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 13, fontFamily: 'Syne,sans-serif', outline: 'none' }}
                            />
                            <select value={personality} onChange={e => setPersonality(e.target.value)}
                              style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '8px 12px', color: '#94a3b8', fontSize: 12, fontFamily: 'Syne,sans-serif', outline: 'none', cursor: 'pointer' }}>
                              <option value="formal_confident">Formal + Confident (Default)</option>
                              <option value="formal">Formal</option>
                              <option value="confident">Confident</option>
                            </select>
                            <Btn size="sm" loading={answering && activeJobId === res.job_id} onClick={() => { setActiveJobId(res.job_id); answerQuestion(res.job_id); }}>Answer</Btn>
                          </div>
                          {answer && activeJobId === res.job_id && (
                            <div style={{ background: 'rgba(37,99,235,0.07)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 8, padding: 12 }}>
                              <p style={{ fontSize: 13, color: '#93c5fd', lineHeight: 1.7 }}>{answer}</p>
                              <p style={{ fontSize: 11, color: '#334155', marginTop: 6, fontFamily: 'Space Mono,monospace' }}>Tone: {personality.replace('_',' ')}</p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {res.job_id && (
                  <button onClick={() => toggle(res.job_id)} style={{ marginTop: 10, background: 'none', border: 'none', color: '#334155', cursor: 'pointer', fontSize: 12 }}>
                    {expanded[res.job_id] ? 'Show less ▲' : 'Show details ▼'}
                  </button>
                )}
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
