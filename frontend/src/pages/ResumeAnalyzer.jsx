import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useToast } from '../components/Toast';
import {
  ScanSearch, FileText, Loader2, Download, RotateCcw,
  Sparkles, CheckCircle2, ChevronDown, ChevronUp, ArrowRight,
  AlertTriangle, PlusCircle, MinusCircle, Edit3, Award, Zap, UploadCloud, LayoutDashboard
} from 'lucide-react';

const LOADING_ANALYSIS_MESSAGES = [
  'Reading your resume...',
  'Checking ATS compatibility...',
  'Analyzing content quality...',
  'Comparing against your goals...',
  'Generating suggestions...'
];

const LOADING_APPLY_MESSAGES = [
  'Applying your improvements...',
  'Rewriting content...',
  'Preserving your format...',
  'Fitting to one page...'
];

export default function ResumeAnalyzer() {
  const [state, setState] = useState(1); // 1: Select resume, 1.5: Questions, 2: Analyzing, 3: Results, 4: Applying, 5: Improved
  const [resumes, setResumes] = useState([]);
  const [selectedResumeId, setSelectedResumeId] = useState('');

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  const [analysis, setAnalysis] = useState(null);
  const [improvedResult, setImprovedResult] = useState(null);

  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Collapsible cards state
  const [expandedSection, setExpandedSection] = useState({ additions: true, subtractions: true, modifications: true });
  const [showPreview, setShowPreview] = useState(false);

  const { addToast } = useToast();
  const navigate = useNavigate();

  // Load existing resumes on mount
  useEffect(() => {
    api.get(ENDPOINTS.resume.list)
      .then((res) => {
        const list = res.data?.resumes || [];
        setResumes(list);
        const active = list.find((r) => r.is_active);
        if (active) setSelectedResumeId(active.id);
        else if (list.length > 0) setSelectedResumeId(list[0].id);
      })
      .catch(() => {});
  }, []);

  // Cycle loading messages for state 2 & 4
  useEffect(() => {
    let interval;
    if (state === 2) {
      setLoadingMsgIdx(0);
      interval = setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % LOADING_ANALYSIS_MESSAGES.length);
      }, 2000);
    } else if (state === 4) {
      setLoadingMsgIdx(0);
      interval = setInterval(() => {
        setLoadingMsgIdx((prev) => (prev + 1) % LOADING_APPLY_MESSAGES.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [state]);

  // STATE 1 -> Fetch Questions
  const handleStartAnalysis = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.post(ENDPOINTS.resumeAnalyzer.getQuestions, {
        resume_id: selectedResumeId || undefined
      });

      const qs = res.data?.questions || [];
      if (qs.length > 0) {
        setQuestions(qs);
        const initialAnswers = {};
        qs.forEach((q) => { initialAnswers[q.id || q.question] = ''; });
        setAnswers(initialAnswers);
        setState(1.5);
      } else {
        // No questions, analyze directly
        triggerAnalysis({});
      }
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to start analysis. Please ensure a resume is uploaded.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // STATE 1.5 -> Trigger Deep Analysis
  const triggerAnalysis = async (collectedAnswers) => {
    setState(2);
    try {
      const res = await api.post(ENDPOINTS.resumeAnalyzer.analyze, {
        resume_id: selectedResumeId || undefined,
        answers: collectedAnswers
      });

      setAnalysis(res.data);
      setState(3);
      addToast('Resume analysis completed!', 'success');
    } catch (err) {
      setState(questions.length > 0 ? 1.5 : 1);
      addToast(err.response?.data?.error || 'Failed to analyze resume.', 'error');
    }
  };

  const handleQuestionsSubmit = (e) => {
    e.preventDefault();
    triggerAnalysis(answers);
  };

  // STATE 3 -> Apply All Changes
  const handleApplyChanges = async () => {
    setState(4);
    try {
      const res = await api.post(ENDPOINTS.resumeAnalyzer.applyChanges, {
        resume_id: selectedResumeId || undefined,
        analysis: {
          additions: analysis.additions || [],
          subtractions: analysis.subtractions || [],
          modifications: analysis.modifications || []
        },
        answers
      });

      setImprovedResult(res.data);
      setState(5);
      addToast('Resume improvements applied successfully!', 'success');
    } catch (err) {
      setState(3);
      addToast(err.response?.data?.error || 'Failed to apply changes.', 'error');
    }
  };

  const handleReset = () => {
    setState(1);
    setQuestions([]);
    setAnswers({});
    setAnalysis(null);
    setImprovedResult(null);
    setShowPreview(false);
  };

  const downloadFile = (url) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    const token = localStorage.getItem('token');
    
    fetch(fullUrl, {
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
      .then((res) => {
        if (!res.ok) throw new Error('Download failed');
        return res.blob();
      })
      .then((blob) => {
        const blobUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        a.download = url.split('/').pop() || 'improved_resume';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        window.open(fullUrl, '_blank');
      });
  };

  const additionsCount = analysis?.additions?.length || 0;
  const subtractionsCount = analysis?.subtractions?.length || 0;
  const modificationsCount = analysis?.modifications?.length || 0;
  const totalSuggestions = additionsCount + subtractionsCount + modificationsCount;

  return (
    <div style={{ maxWidth: 880, margin: '0 auto', padding: '12px 0 48px', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(124,58,237,0.12)', border: '1px solid rgba(124,58,237,0.3)',
          borderRadius: 20, padding: '4px 14px', fontSize: 12, color: '#a78bfa', fontWeight: 600, marginBottom: 12
        }}>
          <ScanSearch size={14} /> AI Resume Diagnostic & Optimizer
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
          Resume Analyzer
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 6, margin: 0 }}>
          Get an honest, recruiter-grade ATS evaluation with actionable additions, subtractions, and 1-click optimization.
        </p>
      </div>

      {/* STATE 1: Resume Selection & Start */}
      {state === 1 && (
        <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14, padding: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginTop: 0, marginBottom: 6 }}>
            Select Resume to Analyze
          </h2>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
            Choose from your uploaded resumes or upload a new one in the Resume Manager.
          </p>

          {resumes.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '36px 16px', background: '#090c10', borderRadius: 10, border: '1px dashed #1e293b', marginBottom: 20 }}>
              <UploadCloud size={36} color="#64748b" style={{ marginBottom: 10 }} />
              <p style={{ color: '#cbd5e1', fontSize: 14, fontWeight: 600, margin: '0 0 6px 0' }}>
                No resumes found
              </p>
              <p style={{ color: '#64748b', fontSize: 13, margin: '0 0 16px 0' }}>
                Please upload a resume first before running analysis.
              </p>
              <button
                onClick={() => navigate('/resume')}
                style={{
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Go to Resume Manager
              </button>
            </div>
          ) : (
            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                Choose Resume
              </label>
              <select
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', background: '#090c10', border: '1px solid #1e293b',
                  borderRadius: 8, padding: '12px 14px', color: '#f8fafc', fontSize: 14, outline: 'none'
                }}
              >
                {resumes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.filename} {r.is_active ? '★ (Active)' : ''} — {new Date(r.created_at).toLocaleDateString()}
                  </option>
                ))}
              </select>
            </div>
          )}

          {resumes.length > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={handleStartAnalysis}
                disabled={isSubmitting || !selectedResumeId}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '12px 24px', fontSize: 14, fontWeight: 600,
                  cursor: isSubmitting || !selectedResumeId ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting || !selectedResumeId ? 0.6 : 1
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="spin" /> Checking resume...
                  </>
                ) : (
                  <>
                    Analyze <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      )}

      {/* STATE 1B: Answer Targeted Questions */}
      {state === 1.5 && (
        <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <Sparkles size={20} color="#a78bfa" />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              Tell us about your goals
            </h2>
          </div>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
            Answering these brief questions allows Gemini to benchmark your resume specifically for your intended target.
          </p>

          <form onSubmit={handleQuestionsSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>
              {questions.map((q, idx) => {
                const qKey = q.id || `q_${idx}`;
                return (
                  <div key={qKey} style={{ background: '#090c10', border: '1px solid #1a2236', borderRadius: 10, padding: 18 }}>
                    <label style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#f1f5f9', marginBottom: 10 }}>
                      {idx + 1}. {q.question}
                    </label>

                    {q.type === 'select' && q.options ? (
                      <select
                        value={answers[qKey] || ''}
                        onChange={(e) => setAnswers({ ...answers, [qKey]: e.target.value })}
                        style={{
                          width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #1e293b',
                          borderRadius: 8, padding: '10px 12px', color: '#f8fafc', fontSize: 13, outline: 'none'
                        }}
                      >
                        <option value="">Select an option...</option>
                        {q.options.map((opt) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type="text"
                        value={answers[qKey] || ''}
                        onChange={(e) => setAnswers({ ...answers, [qKey]: e.target.value })}
                        placeholder="Your response..."
                        style={{
                          width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #1e293b',
                          borderRadius: 8, padding: '10px 12px', color: '#f8fafc', fontSize: 13, outline: 'none'
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setState(1)}
                style={{
                  background: 'none', border: '1px solid #334155', color: '#94a3b8',
                  borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Back
              </button>

              <button
                type="submit"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '12px 24px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                Start Analysis →
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STATE 2: Analyzing (Loading) */}
      {state === 2 && (
        <div style={{
          background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14,
          padding: '60px 24px', textAlign: 'center'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(124,58,237,0.15)',
            border: '2px solid rgba(124,58,237,0.3)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', marginBottom: 20
          }}>
            <Loader2 size={32} color="#a78bfa" style={{ animation: 'spin 1.5s linear infinite' }} />
          </div>

          <h3 style={{ fontSize: 19, fontWeight: 700, color: '#f8fafc', margin: '0 0 10px 0' }}>
            {LOADING_ANALYSIS_MESSAGES[loadingMsgIdx]}
          </h3>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Analyzing keywords, ATS readability, grammar, bullet impact, and formatting balance.
          </p>
        </div>
      )}

      {/* STATE 3: Analysis Results */}
      {state === 3 && analysis && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Score Header Card */}
          <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14, padding: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 20 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
                {/* Score Circle */}
                <div style={{
                  width: 80, height: 80, borderRadius: '50%',
                  background: analysis.overall_score >= 80 ? 'rgba(34,197,94,0.15)' : analysis.overall_score >= 60 ? 'rgba(234,179,8,0.15)' : 'rgba(239,68,68,0.15)',
                  border: `3px solid ${analysis.overall_score >= 80 ? '#22c55e' : analysis.overall_score >= 60 ? '#eab308' : '#ef4444'}`,
                  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center'
                }}>
                  <span style={{ fontSize: 24, fontWeight: 800, color: '#f8fafc', lineHeight: 1 }}>
                    {analysis.overall_score}
                  </span>
                  <span style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>/100</span>
                </div>

                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                      Resume Score
                    </h2>
                    <span style={{
                      padding: '3px 10px', borderRadius: 12, fontSize: 12, fontWeight: 700,
                      background: analysis.verdict === 'Excellent' ? 'rgba(34,197,94,0.2)' : analysis.verdict === 'Good' ? 'rgba(59,130,246,0.2)' : 'rgba(234,179,8,0.2)',
                      color: analysis.verdict === 'Excellent' ? '#4ade80' : analysis.verdict === 'Good' ? '#60a5fa' : '#facc15'
                    }}>
                      {analysis.verdict}
                    </span>
                  </div>
                  <p style={{ color: '#94a3b8', fontSize: 13, margin: '6px 0 0 0' }}>
                    ATS Score: <strong style={{ color: '#f8fafc' }}>{analysis.ats_score || 75}/100</strong>
                  </p>
                </div>
              </div>

              {totalSuggestions > 0 && (
                <button
                  onClick={handleApplyChanges}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                    color: '#fff', border: 'none', borderRadius: 8,
                    padding: '12px 20px', fontSize: 14, fontWeight: 700, cursor: 'pointer'
                  }}
                >
                  <Zap size={16} /> Apply All Changes & Rebuild Resume
                </button>
              )}
            </div>

            {analysis.summary && (
              <p style={{ marginTop: 20, marginBottom: 0, padding: 14, background: '#090c10', borderRadius: 8, border: '1px solid #1e293b', color: '#cbd5e1', fontSize: 13.5, lineHeight: 1.5 }}>
                {analysis.summary}
              </p>
            )}
          </div>

          {/* Strengths, Quick Wins & ATS Issues Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
            {/* Strengths */}
            {analysis.strengths?.length > 0 && (
              <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Award size={18} color="#22c55e" />
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    What's Working Well
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analysis.strengths.map((str, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#86efac' }}>
                      <CheckCircle2 size={15} style={{ flexShrink: 0, marginTop: 2 }} />
                      <span>{str}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Wins */}
            {analysis.quick_wins?.length > 0 && (
              <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <Zap size={18} color="#eab308" />
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    Quick Wins
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analysis.quick_wins.map((qw, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#fde047' }}>
                      <span style={{ flexShrink: 0 }}>⚡</span>
                      <span>{qw}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ATS Issues */}
            {analysis.ats_issues?.length > 0 && (
              <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 12, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                  <AlertTriangle size={18} color="#ef4444" />
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                    ATS Compatibility Issues
                  </h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analysis.ats_issues.map((issue, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#fca5a5' }}>
                      <span style={{ flexShrink: 0 }}>⚠️</span>
                      <span>{issue}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Suggestions Accordions */}
          {totalSuggestions === 0 ? (
            <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14, padding: 32, textAlign: 'center' }}>
              <CheckCircle2 size={40} color="#22c55e" style={{ marginBottom: 12 }} />
              <h3 style={{ fontSize: 17, fontWeight: 700, color: '#f8fafc', margin: '0 0 6px 0' }}>
                Your resume looks great!
              </h3>
              <p style={{ color: '#94a3b8', fontSize: 13, margin: 0 }}>
                No major changes or subtractions needed. You are ready to apply!
              </p>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* ADDITIONS */}
              {additionsCount > 0 && (
                <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedSection({ ...expandedSection, additions: !expandedSection.additions })}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#090c10', border: 'none', padding: '16px 20px', cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PlusCircle size={18} color="#22c55e" />
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                        ADDITIONS
                      </span>
                      <span style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                        {additionsCount}
                      </span>
                    </div>
                    {expandedSection.additions ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </button>

                  {expandedSection.additions && (
                    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {analysis.additions.map((item, idx) => (
                        <div key={idx} style={{ background: '#090c10', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                              background: item.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
                              color: item.priority === 'high' ? '#f87171' : '#60a5fa'
                            }}>
                              {item.priority}
                            </span>
                            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                              {item.section}
                            </span>
                          </div>
                          <div style={{ fontSize: 13.5, color: '#f1f5f9', fontWeight: 600, marginBottom: 4 }}>
                            {item.suggestion}
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: item.example ? 6 : 0 }}>
                            {item.reason}
                          </div>
                          {item.example && (
                            <div style={{ fontSize: 12, color: '#60a5fa', background: '#06090e', padding: '6px 10px', borderRadius: 6, fontStyle: 'italic' }}>
                              e.g.: "{item.example}"
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SUBTRACTIONS */}
              {subtractionsCount > 0 && (
                <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedSection({ ...expandedSection, subtractions: !expandedSection.subtractions })}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#090c10', border: 'none', padding: '16px 20px', cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <MinusCircle size={18} color="#ef4444" />
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                        SUBTRACTIONS
                      </span>
                      <span style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                        {subtractionsCount}
                      </span>
                    </div>
                    {expandedSection.subtractions ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </button>

                  {expandedSection.subtractions && (
                    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {analysis.subtractions.map((item, idx) => (
                        <div key={idx} style={{ background: '#090c10', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                              background: item.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
                              color: item.priority === 'high' ? '#f87171' : '#60a5fa'
                            }}>
                              {item.priority}
                            </span>
                            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                              {item.section}
                            </span>
                          </div>
                          <div style={{ fontSize: 13.5, color: '#fca5a5', fontWeight: 600, marginBottom: 4 }}>
                            Remove: {item.suggestion}
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            {item.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* MODIFICATIONS */}
              {modificationsCount > 0 && (
                <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 12, overflow: 'hidden' }}>
                  <button
                    onClick={() => setExpandedSection({ ...expandedSection, modifications: !expandedSection.modifications })}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: '#090c10', border: 'none', padding: '16px 20px', cursor: 'pointer'
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Edit3 size={18} color="#eab308" />
                      <span style={{ fontSize: 15, fontWeight: 700, color: '#f8fafc' }}>
                        MODIFICATIONS
                      </span>
                      <span style={{ background: 'rgba(234,179,8,0.15)', color: '#facc15', fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 10 }}>
                        {modificationsCount}
                      </span>
                    </div>
                    {expandedSection.modifications ? <ChevronUp size={18} color="#94a3b8" /> : <ChevronDown size={18} color="#94a3b8" />}
                  </button>

                  {expandedSection.modifications && (
                    <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                      {analysis.modifications.map((item, idx) => (
                        <div key={idx} style={{ background: '#090c10', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                            <span style={{
                              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', padding: '2px 6px', borderRadius: 4,
                              background: item.priority === 'high' ? 'rgba(239,68,68,0.2)' : 'rgba(59,130,246,0.2)',
                              color: item.priority === 'high' ? '#f87171' : '#60a5fa'
                            }}>
                              {item.priority}
                            </span>
                            <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>
                              {item.section}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8', textDecoration: 'line-through', marginBottom: 4 }}>
                            Current: "{item.current}"
                          </div>
                          <div style={{ fontSize: 13.5, color: '#fde047', fontWeight: 600, marginBottom: 4 }}>
                            Change to: {item.suggestion}
                          </div>
                          <div style={{ fontSize: 12, color: '#94a3b8' }}>
                            {item.reason}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Bottom Actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #1a2236' }}>
            <button
              onClick={handleReset}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', color: '#94a3b8', fontSize: 13,
                fontWeight: 600, cursor: 'pointer', padding: 4
              }}
            >
              <RotateCcw size={14} /> Analyze Another Resume
            </button>

            {totalSuggestions > 0 && (
              <button
                onClick={handleApplyChanges}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '10px 20px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer'
                }}
              >
                <Zap size={15} /> Apply All Changes & Rebuild Resume
              </button>
            )}
          </div>
        </div>
      )}

      {/* STATE 4: Applying Changes (Loading) */}
      {state === 4 && (
        <div style={{
          background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14,
          padding: '60px 24px', textAlign: 'center'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(34,197,94,0.15)',
            border: '2px solid rgba(34,197,94,0.3)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', marginBottom: 20
          }}>
            <Loader2 size={32} color="#22c55e" style={{ animation: 'spin 1.5s linear infinite' }} />
          </div>

          <h3 style={{ fontSize: 19, fontWeight: 700, color: '#f8fafc', margin: '0 0 10px 0' }}>
            {LOADING_APPLY_MESSAGES[loadingMsgIdx]}
          </h3>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0 }}>
            Rebuilding resume with verified additions, removed weak sections, and 1-page formatting constraints.
          </p>
        </div>
      )}

      {/* STATE 5: Improved Resume Ready */}
      {state === 5 && improvedResult && (
        <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14, padding: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div style={{
              width: 42, height: 42, borderRadius: '50%', background: 'rgba(34,197,94,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <CheckCircle2 size={24} color="#22c55e" />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
                Improved Resume Ready!
              </h2>
              <p style={{ color: '#94a3b8', fontSize: 13, margin: '3px 0 0 0' }}>
                Changes Applied: +{improvedResult.changes_applied?.additions_count || 0} additions · -{improvedResult.changes_applied?.subtractions_count || 0} removals · ~{improvedResult.changes_applied?.modifications_count || 0} edits
              </p>
            </div>
          </div>

          {/* Download Buttons */}
          <div style={{ display: 'flex', gap: 14, marginTop: 24, marginBottom: 24, flexWrap: 'wrap' }}>
            {improvedResult.pdf_url && (
              <button
                onClick={() => downloadFile(improvedResult.pdf_url)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '12px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                <Download size={16} /> Download PDF
              </button>
            )}

            {improvedResult.docx_url && (
              <button
                onClick={() => downloadFile(improvedResult.docx_url)}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: '#1e293b', color: '#f1f5f9', border: '1px solid #334155',
                  borderRadius: 8, padding: '12px 22px', fontSize: 14, fontWeight: 600, cursor: 'pointer'
                }}
              >
                <FileText size={16} /> Download DOCX
              </button>
            )}
          </div>

          {/* Collapsible Preview */}
          <div style={{ border: '1px solid #1a2236', borderRadius: 10, overflow: 'hidden', marginBottom: 28 }}>
            <button
              onClick={() => setShowPreview(!showPreview)}
              style={{
                width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                background: '#090c10', border: 'none', padding: '14px 18px', color: '#cbd5e1',
                fontSize: 14, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <span>Preview Improved Resume Text</span>
              {showPreview ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showPreview && (
              <div style={{ padding: 18, background: '#06090e', maxHeight: 420, overflowY: 'auto' }}>
                <pre style={{
                  margin: 0, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.6,
                  color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                }}>
                  {improvedResult.improved_resume_text}
                </pre>
              </div>
            )}
          </div>

          {/* Bottom Navigation */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 14, borderTop: '1px solid #1a2236' }}>
            <button
              onClick={handleReset}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'none', border: 'none', color: '#94a3b8', fontSize: 13,
                fontWeight: 600, cursor: 'pointer', padding: 4
              }}
            >
              <RotateCcw size={14} /> Analyze Again
            </button>

            <button
              onClick={() => navigate('/')}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: '#1e293b', border: '1px solid #334155', color: '#f1f5f9',
                borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer'
              }}
            >
              <LayoutDashboard size={14} /> Go to Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
