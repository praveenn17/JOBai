import React, { useState } from 'react';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { useToast } from '../components/Toast';
import {
  Scissors, FileText, Loader, Download, RotateCcw,
  ChevronRight, CheckCircle, Sparkles
} from 'lucide-react';

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  page: {
    maxWidth: 900,
    margin: '0 auto',
    padding: '8px 0 40px',
    fontFamily: 'Inter, sans-serif',
  },
  header: {
    marginBottom: 32,
  },
  badge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'linear-gradient(135deg,rgba(37,99,235,0.18),rgba(124,58,237,0.18))',
    border: '1px solid rgba(124,58,237,0.35)',
    borderRadius: 20,
    padding: '4px 14px',
    fontSize: 12,
    color: '#a78bfa',
    fontWeight: 600,
    marginBottom: 14,
  },
  title: {
    fontSize: 28,
    fontWeight: 800,
    color: '#f1f5f9',
    margin: 0,
    lineHeight: 1.25,
  },
  subtitle: {
    color: '#64748b',
    fontSize: 14,
    marginTop: 8,
  },
  stepper: {
    display: 'flex',
    gap: 0,
    marginBottom: 32,
  },
  stepItem: (active, done) => ({
    display: 'flex',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    opacity: active || done ? 1 : 0.4,
  }),
  stepCircle: (active, done) => ({
    width: 32,
    height: 32,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: done
      ? 'linear-gradient(135deg,#22c55e,#16a34a)'
      : active
      ? 'linear-gradient(135deg,#2563eb,#7c3aed)'
      : '#1a2236',
    color: '#fff',
    fontSize: 13,
    fontWeight: 700,
    flexShrink: 0,
    border: active ? '2px solid rgba(124,58,237,0.6)' : '2px solid transparent',
  }),
  stepLabel: (active) => ({
    fontSize: 13,
    fontWeight: active ? 700 : 500,
    color: active ? '#a78bfa' : '#94a3b8',
    whiteSpace: 'nowrap',
  }),
  stepDivider: {
    flex: 1,
    height: 1,
    background: '#1e2d40',
    margin: '0 12px',
    alignSelf: 'center',
  },
  card: {
    background: '#0d1117',
    border: '1px solid #1a2236',
    borderRadius: 14,
    padding: 28,
  },
  label: {
    display: 'block',
    fontSize: 13,
    fontWeight: 600,
    color: '#94a3b8',
    marginBottom: 8,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
  },
  input: {
    width: '100%',
    background: '#090c10',
    border: '1px solid #1a2236',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 14,
    padding: '12px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s',
    fontFamily: 'Inter, sans-serif',
  },
  textarea: {
    width: '100%',
    minHeight: 200,
    resize: 'vertical',
    background: '#090c10',
    border: '1px solid #1a2236',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 13,
    padding: '12px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'monospace',
    lineHeight: 1.6,
  },
  btn: (variant = 'primary') => ({
    display: 'inline-flex',
    alignItems: 'center',
    gap: 8,
    padding: '12px 24px',
    borderRadius: 9,
    border: 'none',
    cursor: 'pointer',
    fontSize: 14,
    fontWeight: 700,
    fontFamily: 'Inter, sans-serif',
    transition: 'all 0.2s',
    ...(variant === 'primary'
      ? {
          background: 'linear-gradient(135deg,#2563eb,#7c3aed)',
          color: '#fff',
          boxShadow: '0 4px 16px rgba(124,58,237,0.3)',
        }
      : variant === 'ghost'
      ? {
          background: 'transparent',
          color: '#64748b',
          border: '1px solid #1a2236',
        }
      : {
          background: 'rgba(34,197,94,0.12)',
          color: '#22c55e',
          border: '1px solid rgba(34,197,94,0.3)',
        }),
  }),
  tailoredBox: {
    background: '#090c10',
    border: '1px solid #1e2d40',
    borderRadius: 10,
    padding: '16px 18px',
    maxHeight: 420,
    overflowY: 'auto',
    whiteSpace: 'pre-wrap',
    fontFamily: 'monospace',
    fontSize: 12.5,
    color: '#cbd5e1',
    lineHeight: 1.7,
  },
  downloadRow: {
    display: 'flex',
    gap: 12,
    flexWrap: 'wrap',
    marginTop: 20,
  },
  verdictBadge: (verdict) => {
    const map = {
      'Eligible':       { bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.3)',  color: '#22c55e' },
      'Likely Eligible':{ bg: 'rgba(34,197,94,0.08)',  border: 'rgba(34,197,94,0.2)',  color: '#4ade80' },
      'Borderline':     { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.3)', color: '#fbbf24' },
      'Not Eligible':   { bg: 'rgba(239,68,68,0.12)',  border: 'rgba(239,68,68,0.3)',  color: '#f87171' },
    };
    const style = map[verdict] || map['Borderline'];
    return {
      display: 'inline-block',
      padding: '4px 14px',
      borderRadius: 20,
      fontSize: 13,
      fontWeight: 700,
      background: style.bg,
      border: `1px solid ${style.border}`,
      color: style.color,
    };
  },
};

const STEPS = ['Paste Job Details', 'AI Tailoring', 'Download'];

export default function ResumeTailor() {
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null); // { tailored_text, pdf_url, docx_url }

  const handleTailor = async () => {
    if (!jobDescription.trim()) {
      toast.error('Please paste a job description.');
      return;
    }
    setLoading(true);
    setStep(1);
    try {
      const { data } = await api.post(ENDPOINTS.resumeTailor.tailor, {
        job_description: jobDescription,
        job_title: jobTitle,
      });
      setResult(data);
      setStep(2);
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to tailor resume. Please try again.';
      toast.error(msg);
      setStep(0);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setResult(null);
    setJobTitle('');
    setJobDescription('');
  };

  const handleDownload = (url, label) => {
    window.open(url, '_blank');
  };

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.badge}><Scissors size={12} /> AI-Powered · Google Gemini</div>
        <h1 style={S.title}>Resume Tailor</h1>
        <p style={S.subtitle}>
          Paste a job description and let Gemini rewrite your resume to match it perfectly — keywords, tone, and all.
        </p>
      </div>

      {/* Stepper */}
      <div style={S.stepper}>
        {STEPS.map((label, i) => (
          <React.Fragment key={label}>
            <div style={S.stepItem(step === i, step > i)}>
              <div style={S.stepCircle(step === i, step > i)}>
                {step > i ? <CheckCircle size={15} /> : i + 1}
              </div>
              <span style={S.stepLabel(step === i)}>{label}</span>
            </div>
            {i < STEPS.length - 1 && <div style={S.stepDivider} />}
          </React.Fragment>
        ))}
      </div>

      {/* Step 0 — Input */}
      {step === 0 && (
        <div style={S.card}>
          <div style={{ marginBottom: 20 }}>
            <label style={S.label}>Job Title (optional)</label>
            <input
              style={S.input}
              placeholder="e.g. Senior Frontend Engineer"
              value={jobTitle}
              onChange={e => setJobTitle(e.target.value)}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = '#1a2236')}
            />
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={S.label}>Job Description *</label>
            <textarea
              style={S.textarea}
              placeholder="Paste the full job description here…"
              value={jobDescription}
              onChange={e => setJobDescription(e.target.value)}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = '#1a2236')}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <button
              style={S.btn('primary')}
              onClick={handleTailor}
              disabled={loading}
            >
              <Sparkles size={16} />
              Tailor My Resume
              <ChevronRight size={16} />
            </button>
            <span style={{ fontSize: 12, color: '#475569' }}>
              Uses your currently active resume
            </span>
          </div>
        </div>
      )}

      {/* Step 1 — Loading */}
      {step === 1 && (
        <div style={{ ...S.card, textAlign: 'center', padding: 60 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg,rgba(37,99,235,0.2),rgba(124,58,237,0.2))',
            marginBottom: 20, animation: 'spin 1.2s linear infinite' }}>
            <Loader size={28} color="#7c3aed" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
            Tailoring your resume…
          </div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Gemini is reading the job description and rewriting your resume. This takes 10–20 seconds.
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Step 2 — Result */}
      {step === 2 && result && (
        <div style={S.card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9' }}>✅ Tailored Resume Ready</div>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 4 }}>Review the text below, then download in your preferred format.</div>
            </div>
            <button style={S.btn('ghost')} onClick={handleReset}>
              <RotateCcw size={14} />
              Start Over
            </button>
          </div>

          <label style={S.label}>Tailored Resume Preview</label>
          <div style={S.tailoredBox}>{result.tailored_text}</div>

          <div style={S.downloadRow}>
            {result.pdf_url && (
              <button style={S.btn('success')} onClick={() => handleDownload(result.pdf_url, 'resume.pdf')}>
                <Download size={15} />
                Download PDF
              </button>
            )}
            {result.docx_url && (
              <button style={S.btn('success')} onClick={() => handleDownload(result.docx_url, 'resume.docx')}>
                <FileText size={15} />
                Download DOCX
              </button>
            )}
            {!result.pdf_url && !result.docx_url && (
              <div style={{ fontSize: 13, color: '#f59e0b' }}>
                ⚠ File generation failed — copy the text above manually.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
