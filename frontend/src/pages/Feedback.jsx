import React, { useEffect, useState } from 'react';
import { ThumbsUp, ThumbsDown, Clock, Brain, TrendingUp, AlertCircle, RefreshCw, CheckCircle } from 'lucide-react';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Card, Btn, SectionTitle, Badge, StatCard, Empty } from '../components/UI';
import { useToast } from '../components/Toast';
import Loader from '../components/Loader';
import { AIThinking } from '../components/Progress';

const OUTCOMES = [
  { value: 'interview', label: '✅ Got Interview', color: 'green' },
  { value: 'rejected',  label: '❌ Rejected',      color: 'red'   },
  { value: 'no_response', label: '⏳ No Response', color: 'yellow' },
];

export default function Feedback() {
  const [pending, setPending]     = useState([]);
  const [submitted, setSubmitted] = useState([]);
  const [stats, setStats]         = useState(null);
  const [insights, setInsights]   = useState(null);
  const [loading, setLoading]     = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState({});
  const [selected, setSelected]   = useState({}); // { appId: outcome }
  const [notes, setNotes]         = useState({});
  const toast = useToast();

  const load = async () => {
    setLoading(true);
    try {
      const [p, f, i] = await Promise.all([
        api.get(ENDPOINTS.feedback.pending),
        api.get(ENDPOINTS.feedback.list),
        api.get(ENDPOINTS.feedback.insights),
      ]);
      setPending(p.data.pending || []);
      setSubmitted(f.data.feedback || []);
      setStats(f.data.stats);
      setInsights(i.data.insights);
    } catch (err) {
      console.error('Feedback load error:', err.message);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const submitFeedback = async (appId) => {
    const outcome = selected[appId];
    if (!outcome) { toast.error('Select an outcome first.'); return; }
    setSubmitting(s => ({ ...s, [appId]: true }));
    try {
      await api.post(ENDPOINTS.feedback.submit, { application_id: appId, outcome, feedback_notes: notes[appId] || '' });
      toast.success('Feedback saved!');
      setPending(ps => ps.filter(p => p.id !== appId));
      await load();
    } catch (err) {
      toast.error(err.message || 'Failed to save feedback.');
    } finally { setSubmitting(s => ({ ...s, [appId]: false })); }
  };

  const runAnalysis = async () => {
    setAnalyzing(true);
    try {
      const r = await api.post(ENDPOINTS.feedback.analyze);
      setInsights(r.data.insights);
      toast.success('Learning analysis complete! Insights updated.');
    } catch (err) {
      toast.error(err.message || 'Analysis failed.');
    } finally { setAnalyzing(false); }
  };

  const outcomeColor = (o) => ({ interview:'green', rejected:'red', no_response:'yellow' }[o] || 'gray');

  if (loading) return <div style={{ display:'flex', justifyContent:'center', paddingTop:80 }}><Loader text="Loading feedback..." /></div>;

  return (
    <div>
      <SectionTitle sub="Submit outcomes after ~7 days. AI learns from your results to improve future applications.">
        Feedback & Learning
      </SectionTitle>

      {/* Stats Row */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14, marginBottom:24 }}>
          <StatCard label="Total Feedback" value={stats.total} icon={CheckCircle} color="#2563eb" />
          <StatCard label="Interviews" value={stats.interview} icon={ThumbsUp} color="#22c55e" />
          <StatCard label="Rejected" value={stats.rejected} icon={ThumbsDown} color="#ef4444" />
          <StatCard label="No Response" value={stats.no_response} icon={Clock} color="#f59e0b" />
          <StatCard label="Success Rate" value={`${stats.success_rate}%`} icon={TrendingUp} color="#7c3aed" />
        </div>
      )}

      {/* Pending Feedback — applications >7 days without outcome */}
      {pending.length > 0 && (
        <Card style={{ marginBottom:24, border:'1px solid rgba(245,158,11,0.3)' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16 }}>
            <AlertCircle size={16} color="#f59e0b" />
            <h2 style={{ fontSize:15, fontWeight:700, color:'#fbbf24', margin:0 }}>
              {pending.length} Application{pending.length>1?'s':''} awaiting feedback
            </h2>
          </div>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {pending.map(app => (
              <div key={app.id} style={{ background:'#111827', border:'1px solid #1e2d47', borderRadius:10, padding:16 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8, marginBottom:12 }}>
                  <div>
                    <div style={{ fontWeight:700, color:'#f1f5f9', fontSize:14 }}>{app.job_title}</div>
                    <div style={{ fontSize:12, color:'#475569' }}>{app.company} · Applied {new Date(app.applied_at).toLocaleDateString()}</div>
                  </div>
                  <Badge color="blue">Match: {app.match_score}%</Badge>
                </div>

                {/* Outcome selector */}
                <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:10 }}>
                  {OUTCOMES.map(o => (
                    <button key={o.value} onClick={() => setSelected(s => ({ ...s, [app.id]: o.value }))} style={{
                      padding:'6px 14px', borderRadius:8, fontSize:13, fontWeight:600, cursor:'pointer', border:'none',
                      fontFamily:'Syne,sans-serif', transition:'all 0.15s',
                      background: selected[app.id]===o.value ? (o.color==='green'?'#166534':o.color==='red'?'#7f1d1d':'#78350f') : '#1e2d47',
                      color: selected[app.id]===o.value ? '#fff' : '#64748b',
                    }}>{o.label}</button>
                  ))}
                </div>

                <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                  <input
                    placeholder="Notes (optional)..."
                    value={notes[app.id] || ''}
                    onChange={e => setNotes(n => ({ ...n, [app.id]: e.target.value }))}
                    style={{ flex:1, background:'#0d1117', border:'1px solid #1e2d47', borderRadius:6, padding:'7px 12px', color:'#e2e8f0', fontSize:13, fontFamily:'Syne,sans-serif', outline:'none' }}
                  />
                  <Btn size="sm" loading={submitting[app.id]} onClick={() => submitFeedback(app.id)}>
                    Save Feedback
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Learning Insights */}
      <Card style={{ marginBottom:24 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h2 style={{ fontSize:15, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:8, margin:0 }}>
            <Brain size={15} color="#7c3aed" /> AI Learning Insights
          </h2>
          <Btn variant="ghost" size="sm" loading={analyzing} onClick={runAnalysis}>
            <RefreshCw size={14} /> Run Analysis
          </Btn>
        </div>

        {analyzing && <div style={{ marginBottom:16 }}><AIThinking active messages={['Analyzing application outcomes…','Identifying success patterns…','Comparing resume versions…','Generating improvement recommendations…']} /></div>}

        {!insights && !analyzing && (
          <p style={{ color:'#334155', fontSize:13 }}>
            No insights yet. Submit feedback on at least 2 applications, then click "Run Analysis".
          </p>
        )}

        {insights && !analyzing && (
          <div>
            <div style={{ background:'rgba(124,58,237,0.07)', border:'1px solid rgba(124,58,237,0.25)', borderRadius:8, padding:'12px 16px', marginBottom:16 }}>
              <p style={{ fontSize:14, color:'#c4b5fd', lineHeight:1.7, margin:0 }}>{insights.summary}</p>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              {[
                { label:'Top Performing Roles', items: insights.top_performing_roles, color:'#22c55e' },
                { label:'Areas to Improve',     items: insights.weak_areas,            color:'#ef4444' },
                { label:'Resume Improvements',  items: insights.resume_improvements,   color:'#60a5fa' },
                { label:'Answer Strategy',      items: insights.answer_strategy_improvements, color:'#f59e0b' },
              ].map(({ label, items, color }) => (
                <div key={label} style={{ background:'#111827', border:'1px solid #1a2236', borderRadius:8, padding:14 }}>
                  <p style={{ fontSize:11, fontWeight:700, color, textTransform:'uppercase', letterSpacing:1, marginBottom:10 }}>{label}</p>
                  {(items||[]).map((item, i) => (
                    <div key={i} style={{ fontSize:13, color:'#94a3b8', marginBottom:6, paddingLeft:10, borderLeft:`2px solid ${color}40` }}>{item}</div>
                  ))}
                </div>
              ))}
            </div>
            <div style={{ marginTop:14, display:'flex', gap:16, flexWrap:'wrap' }}>
              <div style={{ background:'#111827', border:'1px solid #1a2236', borderRadius:8, padding:'10px 16px' }}>
                <p style={{ fontSize:11, color:'#475569', marginBottom:4 }}>AI Recommended Min Score</p>
                <p style={{ fontSize:22, fontWeight:800, color:'#f1f5f9', fontFamily:'Space Mono,monospace' }}>{insights.recommended_min_score}%</p>
              </div>
              <div style={{ background:'#111827', border:'1px solid #1a2236', borderRadius:8, padding:'10px 16px' }}>
                <p style={{ fontSize:11, color:'#475569', marginBottom:4 }}>Success Rate</p>
                <p style={{ fontSize:22, fontWeight:800, color:'#22c55e', fontFamily:'Space Mono,monospace' }}>{insights.success_rate}%</p>
              </div>
            </div>
          </div>
        )}
      </Card>

      {/* Submitted feedback history */}
      {submitted.length > 0 && (
        <Card>
          <h2 style={{ fontSize:15, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:1, marginBottom:16 }}>Feedback History</h2>
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {submitted.map(f => (
              <div key={f.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', background:'#111827', borderRadius:8, border:'1px solid #1a2236', flexWrap:'wrap' }}>
                <Badge color={outcomeColor(f.outcome)}>{f.outcome.replace('_',' ').toUpperCase()}</Badge>
                <div style={{ flex:1, minWidth:0 }}>
                  <span style={{ fontSize:13, color:'#94a3b8', fontWeight:600 }}>{f.job_title}</span>
                  <span style={{ fontSize:12, color:'#475569' }}> @ {f.company}</span>
                </div>
                <span style={{ fontSize:11, color:'#334155', fontFamily:'Space Mono,monospace' }}>Score: {f.match_score}%</span>
                <span style={{ fontSize:11, color:'#334155', fontFamily:'Space Mono,monospace' }}>{new Date(f.submitted_at).toLocaleDateString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {pending.length === 0 && submitted.length === 0 && (
        <Empty icon={Brain} title="No feedback yet"
          sub="Once you've applied to jobs and ~7 days have passed, they'll appear here for you to rate." />
      )}
    </div>
  );
}
