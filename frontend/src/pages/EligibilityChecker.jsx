import React, { useState } from 'react';
import api from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import { useToast } from '../components/Toast';
import {
  CheckCircle, XCircle, AlertCircle, Loader,
  ChevronRight, RotateCcw, Sparkles, ClipboardList
} from 'lucide-react';

// ── Styles ─────────────────────────────────────────────────────────────────────
const S = {
  page: {
    maxWidth: 780,
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
  card: {
    background: '#0d1117',
    border: '1px solid #1a2236',
    borderRadius: 14,
    padding: 28,
    marginBottom: 20,
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
    minHeight: 180,
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
          background: 'rgba(37,99,235,0.12)',
          color: '#60a5fa',
          border: '1px solid rgba(37,99,235,0.3)',
        }),
  }),
  questionCard: {
    background: '#090c10',
    border: '1px solid #1e2d40',
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
  },
  qText: {
    fontSize: 16,
    fontWeight: 600,
    color: '#e2e8f0',
    marginBottom: 18,
    lineHeight: 1.5,
  },
  progress: {
    height: 4,
    background: '#1a2236',
    borderRadius: 2,
    marginBottom: 28,
    overflow: 'hidden',
  },
  progressFill: (pct) => ({
    height: '100%',
    width: `${pct}%`,
    background: 'linear-gradient(90deg,#2563eb,#7c3aed)',
    borderRadius: 2,
    transition: 'width 0.4s ease',
  }),
  answerInput: {
    width: '100%',
    background: '#0d1117',
    border: '1px solid #1a2236',
    borderRadius: 8,
    color: '#f1f5f9',
    fontSize: 14,
    padding: '12px 14px',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'Inter, sans-serif',
  },
  verdictCard: (verdict) => {
    const map = {
      'Eligible':        { bg: 'rgba(34,197,94,0.06)',  border: 'rgba(34,197,94,0.25)' },
      'Likely Eligible': { bg: 'rgba(34,197,94,0.04)',  border: 'rgba(34,197,94,0.18)' },
      'Borderline':      { bg: 'rgba(245,158,11,0.06)', border: 'rgba(245,158,11,0.25)' },
      'Not Eligible':    { bg: 'rgba(239,68,68,0.06)',  border: 'rgba(239,68,68,0.25)' },
    };
    const style = map[verdict] || map['Borderline'];
    return {
      background: style.bg,
      border: `1px solid ${style.border}`,
      borderRadius: 14,
      padding: 28,
      marginBottom: 20,
    };
  },
  verdictLabel: (verdict) => {
    const map = {
      'Eligible':        '#22c55e',
      'Likely Eligible': '#4ade80',
      'Borderline':      '#fbbf24',
      'Not Eligible':    '#f87171',
    };
    return { color: map[verdict] || '#fbbf24', fontSize: 22, fontWeight: 800 };
  },
  scoreRing: (score) => ({
    width: 72,
    height: 72,
    borderRadius: '50%',
    background: `conic-gradient(#7c3aed ${score * 3.6}deg, #1a2236 0deg)`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  }),
  scoreInner: {
    width: 54,
    height: 54,
    borderRadius: '50%',
    background: '#090c10',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 15,
    fontWeight: 800,
    color: '#f1f5f9',
  },
  breakdownItem: (met) => ({
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    padding: '10px 0',
    borderBottom: '1px solid #0f172a',
  }),
};

function VerdictIcon({ verdict, size = 24 }) {
  if (verdict === 'Eligible' || verdict === 'Likely Eligible') return <CheckCircle size={size} color="#22c55e" />;
  if (verdict === 'Not Eligible') return <XCircle size={size} color="#f87171" />;
  return <AlertCircle size={size} color="#fbbf24" />;
}

export default function EligibilityChecker() {
  const toast = useToast();

  // States: 'idle' | 'loading_start' | 'questioning' | 'loading_verdict' | 'done'
  const [uiState, setUiState] = useState('idle');

  const [jobTitle, setJobTitle] = useState('');
  const [jobDescription, setJobDescription] = useState('');

  const [sessionId, setSessionId] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [questionNumber, setQuestionNumber] = useState(1);
  const [totalQuestions, setTotalQuestions] = useState(5);
  const [currentAnswer, setCurrentAnswer] = useState('');

  const [verdict, setVerdict] = useState(null);

  const handleStart = async () => {
    if (!jobDescription.trim()) {
      toast.error('Please paste a job description.');
      return;
    }
    setUiState('loading_start');
    try {
      const { data } = await api.post(ENDPOINTS.eligibility.start, {
        job_description: jobDescription,
        job_title: jobTitle,
      });
      setSessionId(data.session_id);
      setCurrentQuestion(data.first_question);
      setQuestionNumber(data.question_number);
      setTotalQuestions(data.total_questions);
      setCurrentAnswer('');
      setUiState('questioning');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to start check. Please try again.';
      toast.error(msg);
      setUiState('idle');
    }
  };

  const handleAnswer = async () => {
    if (!currentAnswer.trim()) {
      toast.error('Please provide an answer.');
      return;
    }
    setUiState('loading_verdict');
    try {
      const { data } = await api.post(ENDPOINTS.eligibility.answer, {
        session_id: sessionId,
        answer: currentAnswer,
      });

      if (data.done) {
        setVerdict(data);
        setUiState('done');
      } else {
        setCurrentQuestion(data.next_question);
        setQuestionNumber(data.question_number);
        setTotalQuestions(data.total_questions);
        setCurrentAnswer('');
        setUiState('questioning');
      }
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to submit answer. Please try again.';
      toast.error(msg);
      setUiState('questioning');
    }
  };

  const handleReset = () => {
    setUiState('idle');
    setVerdict(null);
    setJobTitle('');
    setJobDescription('');
    setSessionId('');
    setCurrentAnswer('');
  };

  const progressPct = uiState === 'questioning' || uiState === 'loading_verdict'
    ? ((questionNumber - 1) / totalQuestions) * 100
    : uiState === 'done' ? 100 : 0;

  return (
    <div style={S.page}>
      {/* Header */}
      <div style={S.header}>
        <div style={S.badge}><Sparkles size={12} /> AI-Powered · Google Gemini</div>
        <h1 style={S.title}>Eligibility Checker</h1>
        <p style={S.subtitle}>
          Answer 5 targeted questions about a job and get an instant AI eligibility verdict before applying.
        </p>
      </div>

      {/* Idle — Input form */}
      {uiState === 'idle' && (
        <div style={S.card}>
          <div style={{ marginBottom: 20 }}>
            <label style={S.label}>Job Title (optional)</label>
            <input
              style={S.input}
              placeholder="e.g. Data Engineer"
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
          <button style={S.btn('primary')} onClick={handleStart}>
            <ClipboardList size={16} />
            Start Eligibility Check
            <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Loading start */}
      {uiState === 'loading_start' && (
        <div style={{ ...S.card, textAlign: 'center', padding: 60 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 64, height: 64, borderRadius: '50%',
            background: 'linear-gradient(135deg,rgba(37,99,235,0.2),rgba(124,58,237,0.2))',
            marginBottom: 20, animation: 'spin 1.2s linear infinite' }}>
            <Loader size={28} color="#7c3aed" />
          </div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
            Generating questions…
          </div>
          <div style={{ fontSize: 13, color: '#475569' }}>
            Gemini is reading the job description and preparing 5 targeted questions.
          </div>
          <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {/* Questioning */}
      {(uiState === 'questioning' || uiState === 'loading_verdict') && (
        <div style={S.card}>
          {/* Progress */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: '#64748b' }}>
              Question {questionNumber} of {totalQuestions}
            </span>
            <span style={{ fontSize: 12, color: '#7c3aed', fontWeight: 600 }}>
              {Math.round(progressPct)}% complete
            </span>
          </div>
          <div style={S.progress}><div style={S.progressFill(progressPct)} /></div>

          <div style={S.questionCard}>
            <div style={S.qText}>{currentQuestion}</div>
            <textarea
              style={{ ...S.answerInput, minHeight: 90, resize: 'vertical', fontFamily: 'Inter, sans-serif' }}
              placeholder="Type your answer here…"
              value={currentAnswer}
              onChange={e => setCurrentAnswer(e.target.value)}
              disabled={uiState === 'loading_verdict'}
              onFocus={e => (e.target.style.borderColor = '#2563eb')}
              onBlur={e => (e.target.style.borderColor = '#1a2236')}
            />
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <button
              style={S.btn('primary')}
              onClick={handleAnswer}
              disabled={uiState === 'loading_verdict'}
            >
              {uiState === 'loading_verdict'
                ? <><Loader size={15} style={{ animation: 'spin 1s linear infinite' }} /> Processing…</>
                : questionNumber === totalQuestions
                ? <><CheckCircle size={15} /> Submit & Get Verdict</>
                : <><ChevronRight size={15} /> Next Question</>
              }
            </button>
          </div>
        </div>
      )}

      {/* Done — Verdict */}
      {uiState === 'done' && verdict && (
        <>
          {/* Verdict card */}
          <div style={S.verdictCard(verdict.verdict)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={S.scoreRing(verdict.score)}>
                <div style={S.scoreInner}>{verdict.score}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: '#64748b', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase' }}>
                  Eligibility Verdict
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <VerdictIcon verdict={verdict.verdict} size={22} />
                  <span style={S.verdictLabel(verdict.verdict)}>{verdict.verdict}</span>
                </div>
              </div>
            </div>

            {verdict.recommendation && (
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '14px 16px', marginBottom: 20 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 6, textTransform: 'uppercase' }}>
                  Recommendation
                </div>
                <p style={{ margin: 0, fontSize: 13.5, color: '#cbd5e1', lineHeight: 1.6 }}>
                  {verdict.recommendation}
                </p>
              </div>
            )}

            {/* Breakdown */}
            {verdict.breakdown && verdict.breakdown.length > 0 && (
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#64748b', marginBottom: 12, textTransform: 'uppercase' }}>
                  Criterion Breakdown
                </div>
                {verdict.breakdown.map((item, i) => (
                  <div key={i} style={S.breakdownItem(item.met)}>
                    {item.met
                      ? <CheckCircle size={16} color="#22c55e" style={{ flexShrink: 0, marginTop: 1 }} />
                      : <XCircle size={16} color="#f87171" style={{ flexShrink: 0, marginTop: 1 }} />
                    }
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0', marginBottom: 2 }}>
                        {item.criterion}
                      </div>
                      {item.note && (
                        <div style={{ fontSize: 12, color: '#64748b' }}>{item.note}</div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <button style={S.btn('ghost')} onClick={handleReset}>
            <RotateCcw size={14} />
            Check Another Job
          </button>
        </>
      )}
    </div>
  );
}
