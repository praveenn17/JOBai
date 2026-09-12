import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useToast } from '../components/Toast';
import {
  FileOutput, FileText, Loader2, Download, RotateCcw,
  Sparkles, HelpCircle, CheckCircle2, ChevronDown, ChevronUp, ArrowRight, LayoutDashboard
} from 'lucide-react';

const DOMAIN_OPTIONS = [
  'Web Development',
  'Mobile Development',
  'Data Science',
  'AI / Machine Learning',
  'DevOps & Cloud',
  'Cybersecurity',
  'Product Management',
  'UI/UX Design',
  'Finance & FinTech',
  'Marketing & Growth',
  'Other'
];

const LOADING_MESSAGES = [
  'Reading your profile & background...',
  'Selecting your strongest projects...',
  'Applying intelligent content rules...',
  'Optimizing layout for one-page format...',
  'Formatting and generating your resume...'
];

export default function ResumeBuilder() {
  const [step, setStep] = useState(1); // 1: setup, 1.5: questions, 2: building, 3: result
  const [targetRole, setTargetRole] = useState('');
  const [targetDomain, setTargetDomain] = useState(DOMAIN_OPTIONS[0]);

  const [questions, setQuestions] = useState([]);
  const [answers, setAnswers] = useState({});

  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [result, setResult] = useState(null); // { resume_text, pdf_url, docx_url }
  const [showPreview, setShowPreview] = useState(false);

  const { addToast } = useToast();
  const navigate = useNavigate();

  // Rotate loading messages in step 2
  useEffect(() => {
    let interval;
    if (step === 2) {
      interval = setInterval(() => {
        setLoadingMsgIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 2000);
    }
    return () => clearInterval(interval);
  }, [step]);

  // Handle Step 1 -> Check Questions
  const handleCheckQuestions = async (e) => {
    e.preventDefault();
    if (!targetRole.trim()) {
      addToast('Please enter your target role.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await api.post(ENDPOINTS.resumeBuilder.checkQuestions, {
        target_role: targetRole,
        target_domain: targetDomain
      });

      const qs = res.data?.questions || [];
      if (qs.length > 0) {
        setQuestions(qs);
        // Initialize answers state
        const initialAnswers = {};
        qs.forEach((q) => {
          initialAnswers[q.id || q.question] = '';
        });
        setAnswers(initialAnswers);
        setStep(1.5);
      } else {
        // No questions needed, proceed straight to build
        triggerBuild({});
      }
    } catch (err) {
      addToast(err.response?.data?.error || 'Failed to initialize resume builder.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Trigger Resume Build
  const triggerBuild = async (collectedAnswers) => {
    setStep(2);
    setLoadingMsgIndex(0);

    try {
      const res = await api.post(ENDPOINTS.resumeBuilder.build, {
        target_role: targetRole,
        target_domain: targetDomain,
        answers: collectedAnswers,
        template_style: 'classic'
      });

      setResult(res.data);
      setStep(3);
      addToast('Resume generated successfully!', 'success');
    } catch (err) {
      setStep(questions.length > 0 ? 1.5 : 1);
      addToast(err.response?.data?.error || 'Failed to build resume. Please try again.', 'error');
    }
  };

  const handleQuestionsSubmit = (e) => {
    e.preventDefault();
    triggerBuild(answers);
  };

  const handleReset = () => {
    setStep(1);
    setTargetRole('');
    setTargetDomain(DOMAIN_OPTIONS[0]);
    setQuestions([]);
    setAnswers({});
    setResult(null);
    setShowPreview(false);
  };

  const downloadFile = (url) => {
    if (!url) return;
    const fullUrl = url.startsWith('http') ? url : `${window.location.origin}${url}`;
    const token = localStorage.getItem('token');
    
    // Using fetch to pass Bearer token for protected download route
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
        a.download = url.split('/').pop() || 'resume';
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(blobUrl);
      })
      .catch(() => {
        // Fallback standard window.open
        window.open(fullUrl, '_blank');
      });
  };

  return (
    <div style={{ maxWidth: 840, margin: '0 auto', padding: '12px 0 48px', fontFamily: 'Inter, sans-serif' }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: 'rgba(37,99,235,0.12)', border: '1px solid rgba(37,99,235,0.3)',
          borderRadius: 20, padding: '4px 14px', fontSize: 12, color: '#60a5fa', fontWeight: 600, marginBottom: 12
        }}>
          <Sparkles size={14} /> AI General Resume Builder
        </div>
        <h1 style={{ fontSize: 26, fontWeight: 800, color: '#f8fafc', margin: 0 }}>
          General Resume Builder
        </h1>
        <p style={{ color: '#94a3b8', fontSize: 14, marginTop: 6, margin: 0 }}>
          We'll build a tailored, one-page ATS-ready resume using your verified profile data and smart formatting rules.
        </p>
      </div>

      {/* Progress Tracker */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
        <div style={{
          flex: 1, height: 4, borderRadius: 2,
          background: step >= 1 ? 'linear-gradient(90deg, #2563eb, #7c3aed)' : '#1e293b'
        }} />
        <div style={{
          flex: 1, height: 4, borderRadius: 2,
          background: step >= 1.5 ? 'linear-gradient(90deg, #2563eb, #7c3aed)' : '#1e293b'
        }} />
        <div style={{
          flex: 1, height: 4, borderRadius: 2,
          background: step === 3 ? 'linear-gradient(90deg, #22c55e, #10b981)' : '#1e293b'
        }} />
      </div>

      {/* STATE 1: Setup */}
      {step === 1 && (
        <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14, padding: 28 }}>
          <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', marginTop: 0, marginBottom: 6 }}>
            Target Career Goals
          </h2>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
            Specify the role and industry domain so Gemini can optimize skills, highlights, and summaries accurately.
          </p>

          <form onSubmit={handleCheckQuestions}>
            <div style={{ marginBottom: 20 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                Target Role <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <input
                type="text"
                value={targetRole}
                onChange={(e) => setTargetRole(e.target.value)}
                placeholder="e.g. Full Stack Developer, Data Engineer, Product Analyst"
                required
                style={{
                  width: '100%', boxSizing: 'border-box', background: '#090c10', border: '1px solid #1e293b',
                  borderRadius: 8, padding: '12px 14px', color: '#f8fafc', fontSize: 14, outline: 'none'
                }}
              />
            </div>

            <div style={{ marginBottom: 28 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#cbd5e1', marginBottom: 8 }}>
                Target Domain <span style={{ color: '#ef4444' }}>*</span>
              </label>
              <select
                value={targetDomain}
                onChange={(e) => setTargetDomain(e.target.value)}
                style={{
                  width: '100%', boxSizing: 'border-box', background: '#090c10', border: '1px solid #1e293b',
                  borderRadius: 8, padding: '12px 14px', color: '#f8fafc', fontSize: 14, outline: 'none'
                }}
              >
                {DOMAIN_OPTIONS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="submit"
                disabled={isSubmitting || !targetRole.trim()}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                  background: 'linear-gradient(135deg, #2563eb, #7c3aed)',
                  color: '#fff', border: 'none', borderRadius: 8,
                  padding: '12px 24px', fontSize: 14, fontWeight: 600,
                  cursor: isSubmitting || !targetRole.trim() ? 'not-allowed' : 'pointer',
                  opacity: isSubmitting || !targetRole.trim() ? 0.6 : 1
                }}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 size={16} className="spin" /> Checking profile...
                  </>
                ) : (
                  <>
                    Check & Continue <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STATE 1B: Quick Questions */}
      {step === 1.5 && (
        <div style={{ background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14, padding: 28 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
            <HelpCircle size={20} color="#60a5fa" />
            <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f1f5f9', margin: 0 }}>
              A few quick questions
            </h2>
          </div>
          <p style={{ color: '#64748b', fontSize: 13, marginBottom: 24 }}>
            Gemini identified a few specific details missing from your profile that will elevate your resume.
          </p>

          <form onSubmit={handleQuestionsSubmit}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 28 }}>
              {questions.map((q, idx) => {
                const qKey = q.id || `q_${idx}`;
                return (
                  <div key={qKey} style={{ background: '#090c10', border: '1px solid #1a2236', borderRadius: 10, padding: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 4 }}>
                      <label style={{ fontSize: 14, fontWeight: 600, color: '#f1f5f9' }}>
                        {idx + 1}. {q.question} {q.required && <span style={{ color: '#ef4444' }}>*</span>}
                      </label>
                    </div>

                    {q.why && (
                      <p style={{ fontSize: 12, color: '#a78bfa', margin: '0 0 12px 0', fontStyle: 'italic' }}>
                        💡 Why this matters: {q.why}
                      </p>
                    )}

                    {/* Input types */}
                    {q.type === 'select' && q.options ? (
                      <select
                        value={answers[qKey] || ''}
                        onChange={(e) => setAnswers({ ...answers, [qKey]: e.target.value })}
                        required={q.required}
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
                    ) : q.type === 'number' ? (
                      <input
                        type="number"
                        value={answers[qKey] || ''}
                        onChange={(e) => setAnswers({ ...answers, [qKey]: e.target.value })}
                        required={q.required}
                        placeholder="Enter number..."
                        style={{
                          width: '100%', boxSizing: 'border-box', background: '#0d1117', border: '1px solid #1e293b',
                          borderRadius: 8, padding: '10px 12px', color: '#f8fafc', fontSize: 13, outline: 'none'
                        }}
                      />
                    ) : (
                      <input
                        type="text"
                        value={answers[qKey] || ''}
                        onChange={(e) => setAnswers({ ...answers, [qKey]: e.target.value })}
                        required={q.required}
                        placeholder="Your answer..."
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
                onClick={() => setStep(1)}
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
                <Sparkles size={16} /> Build My Resume →
              </button>
            </div>
          </form>
        </div>
      )}

      {/* STATE 2: Building */}
      {step === 2 && (
        <div style={{
          background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14,
          padding: '60px 24px', textAlign: 'center'
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: '50%', background: 'rgba(37,99,235,0.15)',
            border: '2px solid rgba(37,99,235,0.3)', display: 'inline-flex',
            alignItems: 'center', justifyContent: 'center', marginBottom: 20
          }}>
            <Loader2 size={32} color="#60a5fa" style={{ animation: 'spin 1.5s linear infinite' }} />
          </div>

          <h3 style={{ fontSize: 19, fontWeight: 700, color: '#f8fafc', margin: '0 0 10px 0' }}>
            {LOADING_MESSAGES[loadingMsgIndex]}
          </h3>
          <p style={{ color: '#64748b', fontSize: 13, margin: 0, maxWidth: 440, marginInline: 'auto' }}>
            Synthesizing education, experience, achievements, and enforcing ATS single-page guidelines.
          </p>

          <style>{`
            @keyframes spin {
              from { transform: rotate(0deg); }
              to { transform: rotate(360deg); }
            }
          `}</style>
        </div>
      )}

      {/* STATE 3: Result */}
      {step === 3 && result && (
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
                Resume Ready!
              </h2>
              <p style={{ color: '#64748b', fontSize: 13, margin: '2px 0 0 0' }}>
                Tailored for {targetRole} ({targetDomain}) • 1 Page Verified
              </p>
            </div>
          </div>

          {/* Download Buttons */}
          <div style={{ display: 'flex', gap: 14, marginTop: 24, marginBottom: 24, flexWrap: 'wrap' }}>
            {result.pdf_url && (
              <button
                onClick={() => downloadFile(result.pdf_url)}
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

            {result.docx_url && (
              <button
                onClick={() => downloadFile(result.docx_url)}
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
              <span>Preview Resume Text</span>
              {showPreview ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
            </button>

            {showPreview && (
              <div style={{ padding: 18, background: '#06090e', maxHeight: 420, overflowY: 'auto' }}>
                <pre style={{
                  margin: 0, fontFamily: 'monospace', fontSize: 12.5, lineHeight: 1.6,
                  color: '#e2e8f0', whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                }}>
                  {result.resume_text}
                </pre>
              </div>
            )}
          </div>

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
              <RotateCcw size={14} /> Build Another
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
