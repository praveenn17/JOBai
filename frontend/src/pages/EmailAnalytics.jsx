import React, { useEffect, useState } from 'react';
import { TrendingUp, Mail, CheckCircle, XCircle, Clock, Brain, RefreshCw, ChevronRight, Zap } from 'lucide-react';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Card, Btn, SectionTitle, Badge, StatCard, Alert } from '../components/UI';
import { useToast } from '../components/Toast';
import { AIThinking } from '../components/Progress';
import Loader from '../components/Loader';

const OUTCOME_BUTTONS = [
  { value: 'interview',   label: '✓ Got Interview',  color: '#14532d', border: '#22c55e', text: '#86efac' },
  { value: 'rejected',    label: '✗ Rejected',       color: '#7f1d1d', border: '#ef4444', text: '#fca5a5' },
  { value: 'no_response', label: '— No Response',    color: '#78350f', border: '#f59e0b', text: '#fde047' },
];

export default function EmailAnalytics() {
  const [metrics, setMetrics]   = useState(null);
  const [pending, setPending]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSub]    = useState({});
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([
        api.get(ENDPOINTS.email.analytics),
        api.get(ENDPOINTS.email.pendingOutcomes),
      ]);
      setMetrics(m.data);
      setPending(p.data.pending || []);
    } catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submitOutcome = async (emailPerfId, outcome) => {
    if (!outcome) { toast.error('Select an outcome first.'); return; }
    setSub(s => ({ ...s, [emailPerfId]: true }));
    // Immediately remove that card from the pending list without a page reload (update local state)
    setPending(ps => ps.filter(p => p.id !== emailPerfId));
    try {
      await api.post(buildUrl(ENDPOINTS.email.setOutcome, { id: emailPerfId }), { outcome });
      toast.success('Outcome saved! AI will learn from this.');
      api.get(ENDPOINTS.email.analytics).then(m => setMetrics(m.data)).catch(() => {});
    } catch (err) {
      toast.error(err.message || 'Failed to save.');
      await load();
    } finally { setSub(s => ({ ...s, [emailPerfId]: false })); }
  };

  const analyzeNow = async () => {
    setAnalyzing(true);
    try {
      const r = await api.post(ENDPOINTS.email.analyzeNow);
      toast.success('Analysis complete! Strategy updated.');
      await load();
    } catch (err) {
      toast.error(err.message || 'Need at least 5 emails with outcomes.');
    } finally { setAnalyzing(false); }
  };

  const rateColor = (pct) => pct >= 30 ? '#22c55e' : pct >= 15 ? '#f59e0b' : '#ef4444';

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><Loader /></div>;

  const s = metrics?.strategy;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <SectionTitle sub="Mark email outcomes. AI learns and improves every 10 emails automatically.">
          Email Intelligence
        </SectionTitle>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={load}><RefreshCw size={14} /></Btn>
          <Btn variant="ghost" size="sm" loading={analyzing} onClick={analyzeNow}><Brain size={14} /> Analyze Now</Btn>
        </div>
      </div>

      {pending.length > 0 && (
        <Alert type="warning" style={{ marginBottom: 20 }}>
          You have {pending.length} email(s) waiting for outcome — recording them improves your AI strategy.
        </Alert>
      )}

      {/* Metrics row */}
      {metrics?.rates && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(150px,1fr))', gap: 14, marginBottom: 24 }}>
          <StatCard label="Emails Sent"     value={metrics.totals?.sent || 0}            icon={Mail}         color="#2563eb" />
          <StatCard label="Acceptance Rate" value={`${metrics.rates.acceptance_rate}%`}  icon={CheckCircle}  color="#22c55e" />
          <StatCard label="Response Rate"   value={`${metrics.rates.response_rate}%`}    icon={TrendingUp}   color="#7c3aed" />
          <StatCard label="Ignore Rate"     value={`${metrics.rates.ignore_rate}%`}      icon={Clock}        color="#f59e0b" />
          <StatCard label="Pending Feedback" value={metrics.totals?.pending || 0}        icon={RefreshCw}    color="#64748b" />
        </div>
      )}

      {/* Pending outcomes */}
      {pending.length > 0 && (
        <Card style={{ marginBottom: 24, border: '1px solid rgba(245,158,11,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <Clock size={15} color="#f59e0b" />
            <h2 style={{ fontSize: 15, fontWeight: 700, color: '#fbbf24', margin: 0 }}>
              {pending.length} email{pending.length > 1 ? 's' : ''} awaiting outcome
            </h2>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {pending.map(ep => (
              <div key={ep.id} style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 10, padding: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                  <div style={{ minWidth: 240, flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#f1f5f9', fontSize: 14 }}>{ep.role} at {ep.company_name}</div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>
                      To: {ep.recipient_email} · Sent: {new Date(ep.sent_at).toLocaleDateString()} · Template #{(ep.template_id || 0) + 1}
                    </div>
                    {ep.subject && (
                      <div style={{ fontSize: 12, color: '#475569', marginTop: 2, fontStyle: 'italic' }}>
                        "{ep.subject}"
                      </div>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                    {OUTCOME_BUTTONS.map(btn => (
                      <button
                        key={btn.value}
                        type="button"
                        disabled={submitting[ep.id]}
                        onClick={() => submitOutcome(ep.id, btn.value)}
                        style={{
                          minHeight: 40,
                          padding: '8px 16px',
                          borderRadius: 8,
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: submitting[ep.id] ? 'not-allowed' : 'pointer',
                          border: `1px solid ${btn.border}`,
                          fontFamily: 'Syne,sans-serif',
                          background: btn.color,
                          color: btn.text,
                          transition: 'all 0.15s ease',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          opacity: submitting[ep.id] ? 0.6 : 1,
                        }}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {analyzing && <div style={{ marginBottom: 24 }}><AIThinking active messages={['Analyzing accepted emails…','Finding weak patterns…','Comparing subject lines…','Updating template weights…','Generating strategy…']} /></div>}

      {/* Current AI Strategy */}
      <Card style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8, margin: 0 }}>
            <Brain size={14} color="#7c3aed" /> AI-Learned Strategy
          </h2>
          {s?.last_analyzed && <span style={{ fontSize: 11, color: '#334155', fontFamily: 'Space Mono,monospace' }}>Updated {new Date(s.last_analyzed).toLocaleDateString()}</span>}
        </div>

        {!s ? (
          <p style={{ fontSize: 13, color: '#334155' }}>
            No strategy yet. Mark outcomes on at least 5 emails, then click "Analyze Now".
            {metrics?.next_analysis_at && <span style={{ color: '#475569' }}> {metrics.next_analysis_at}.</span>}
          </p>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ background: '#111827', borderRadius: 8, padding: 14, border: '1px solid #1a2236' }}>
              <p style={{ fontSize: 11, color: '#22c55e', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>What Works ✓</p>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>Tone: <strong style={{ color: '#f1f5f9' }}>{s.best_tone?.replace(/_/g, ' ')}</strong></div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 6 }}>Personalization: <strong style={{ color: '#f1f5f9' }}>{s.best_personalization?.replace(/_/g, ' ')}</strong></div>
              <div style={{ fontSize: 13, color: '#94a3b8', marginBottom: 8 }}>Length: <strong style={{ color: '#f1f5f9' }}>{s.best_length_range} words</strong></div>
              {(s.promote_patterns || []).map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: '#4ade80', padding: '3px 8px', background: 'rgba(34,197,94,0.08)', borderRadius: 4, marginBottom: 4 }}>+ {p}</div>
              ))}
            </div>
            <div style={{ background: '#111827', borderRadius: 8, padding: 14, border: '1px solid #1a2236' }}>
              <p style={{ fontSize: 11, color: '#ef4444', fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>What to Avoid ✗</p>
              {(s.avoid_patterns || []).map((p, i) => (
                <div key={i} style={{ fontSize: 12, color: '#f87171', padding: '3px 8px', background: 'rgba(239,68,68,0.08)', borderRadius: 4, marginBottom: 4 }}>- {p}</div>
              ))}
              {s.best_opening_style && <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 8 }}>Best opening: {s.best_opening_style}</div>}
            </div>
          </div>
        )}
      </Card>

      {/* Template scores */}
      {(metrics?.template_scores || []).length > 0 && (
        <Card style={{ marginBottom: 20 }}>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 14 }}>Template Performance</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {metrics.template_scores.map(t => {
              const pct = Math.round(t.performance_score || 0);
              return (
                <div key={t.template_id} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <span style={{ fontSize: 13, color: '#94a3b8', width: 100, flexShrink: 0 }}>Template #{t.template_id + 1}</span>
                  <div style={{ flex: 1, height: 8, background: '#1e2d47', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${pct}%`, background: pct >= 50 ? '#22c55e' : pct >= 30 ? '#f59e0b' : '#ef4444', borderRadius: 99, transition: 'width 0.5s' }} />
                  </div>
                  <span style={{ fontSize: 12, fontFamily: 'Space Mono,monospace', color: '#64748b', width: 80, textAlign: 'right' }}>
                    {t.sent_count} sent · {t.accepted_count}✓
                  </span>
                  <Badge color={pct >= 50 ? 'green' : pct >= 30 ? 'yellow' : 'red'}>{pct}%</Badge>
                  <Badge color={t.weight >= 1.3 ? 'green' : t.weight >= 0.8 ? 'blue' : 'red'}>w={t.weight?.toFixed(1)}</Badge>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 11, color: '#334155', marginTop: 10 }}>Weight determines how often each template is selected. High performers are used more frequently.</p>
        </Card>
      )}

      {/* Top subject lines */}
      {(metrics?.top_subjects || []).length > 0 && (
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>Best Subject Lines</h2>
          {metrics.top_subjects.map((s, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #111827' }}>
              <span style={{ fontSize: 12, color: '#64748b', fontFamily: 'Space Mono,monospace', width: 20 }}>#{i + 1}</span>
              <span style={{ flex: 1, fontSize: 13, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.subject}</span>
              <span style={{ fontSize: 11, color: '#334155' }}>{s.response_count}/{s.sent_count} replies</span>
              <Badge color={s.performance_score >= 50 ? 'green' : 'gray'}>{s.performance_score}%</Badge>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
