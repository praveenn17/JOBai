import React, { useEffect, useState } from 'react';
import { Shield, Clock, Mail, Zap, List, RefreshCw } from 'lucide-react';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Card, Btn, SectionTitle, Badge } from '../components/UI';
import Loader from '../components/Loader';

// Countdown hook — counts down to a target ISO timestamp
function useCountdown(targetIso) {
  const [remaining, setRemaining] = useState('');
  useEffect(() => {
    if (!targetIso) { setRemaining(''); return; }
    const tick = () => {
      const diff = new Date(targetIso) - Date.now();
      if (diff <= 0) { setRemaining('Now'); return; }
      const h = Math.floor(diff / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setRemaining(`${h > 0 ? h + 'h ' : ''}${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [targetIso]);
  return remaining;
}

export default function Limits() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try { const r = await api.get(ENDPOINTS.limits.status); setData(r.data); }
    catch {}
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const appCountdown   = useCountdown(data?.rate_limits?.application_quota?.next_reset_at);
  const emailCountdown = useCountdown(data?.rate_limits?.email_quota?.next_reset_at);

  const UsageBar = ({ label, used, limit, color, countdown }) => {
    const pct = Math.min(100, Math.round((used / limit) * 100));
    const isNearLimit = pct >= 80;
    return (
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
          <span style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{label}</span>
          <span style={{ fontSize: 13, fontFamily: 'Space Mono,monospace', color: isNearLimit ? '#f59e0b' : '#64748b' }}>
            {used} / {limit}
          </span>
        </div>
        <div style={{ height: 8, background: '#1e2d47', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{
            height: '100%', borderRadius: 99,
            width: `${pct}%`,
            background: pct >= 100 ? '#ef4444' : pct >= 80 ? '#f59e0b' : color,
            transition: 'width 0.5s ease'
          }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#334155' }}>{limit - used} remaining in this 12h window</span>
          {pct >= 100 && countdown
            ? <span style={{ fontSize: 11, color: '#f59e0b', fontFamily: 'Space Mono,monospace' }}>⏱ Next slot in {countdown}</span>
            : pct >= 100
            ? <span style={{ fontSize: 11, color: '#ef4444' }}>⚠ Limit reached — queued</span>
            : null
          }
        </div>
      </div>
    );
  };

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 60 }}><Loader /></div>;

  const rl = data?.rate_limits;
  const q  = data?.queues;

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 24 }}>
        <SectionTitle sub="Rolling 12-hour limits · 8 applications · 5 emails · Auto-queued overflow">
          Rate Limits & Queue
        </SectionTitle>
        <Btn variant="ghost" size="sm" onClick={load}><RefreshCw size={14} /></Btn>
      </div>

      {/* Usage bars */}
      <Card glow style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 18, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Shield size={14} color="#2563eb" /> 12-Hour Usage
        </h2>
        <UsageBar label="Job Applications" used={rl?.applications_sent || 0} limit={rl?.application_limit || 8} color="#2563eb" countdown={appCountdown} />
        <UsageBar label="Cold Emails" used={rl?.emails_sent || 0} limit={rl?.email_limit || 5} color="#7c3aed" countdown={emailCountdown} />
      </Card>

      {/* Queue status */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Zap size={16} color="#2563eb" />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', margin: 0 }}>Application Queue</h3>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f1f5f9', fontFamily: 'Space Mono,monospace', marginBottom: 6 }}>
            {q?.application_queue?.count || 0}
          </div>
          <p style={{ fontSize: 12, color: '#475569' }}>jobs waiting for next window</p>
          {(q?.application_queue?.items || []).slice(0, 3).map(item => (
            <div key={item.id} style={{ fontSize: 11, color: '#334155', marginTop: 6, padding: '4px 8px', background: '#111827', borderRadius: 4 }}>
              Queued: {new Date(item.queued_at).toLocaleTimeString()} · Process after: {item.process_after ? new Date(item.process_after).toLocaleTimeString() : 'Next window'}
            </div>
          ))}
        </Card>

        <Card>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <Mail size={16} color="#7c3aed" />
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', margin: 0 }}>Email Queue</h3>
          </div>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#f1f5f9', fontFamily: 'Space Mono,monospace', marginBottom: 6 }}>
            {q?.email_queue?.count || 0}
          </div>
          <p style={{ fontSize: 12, color: '#475569' }}>emails waiting with 30–90 min spacing</p>
          {(q?.email_queue?.items || []).slice(0, 3).map(item => (
            <div key={item.id} style={{ fontSize: 11, color: '#334155', marginTop: 6, padding: '4px 8px', background: '#111827', borderRadius: 4 }}>
              {item.company_name} · {item.role} · Send after: {item.process_after ? new Date(item.process_after).toLocaleTimeString() : '-'}
            </div>
          ))}
        </Card>
      </div>

      {/* Anti-spam tracking */}
      <Card style={{ marginBottom: 20 }}>
        <h2 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
          <List size={14} color="#22c55e" /> Anti-Spam Tracking
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <p style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Templates used (last 12h)</p>
            {(data?.tracking?.templates_used || []).length === 0
              ? <p style={{ fontSize: 12, color: '#334155' }}>None yet</p>
              : (data?.tracking?.templates_used || []).map(t => (
                <div key={t.template_index} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                  <span>Template #{t.template_index + 1}</span>
                  <Badge color="blue">{t.count}x</Badge>
                </div>
              ))
            }
          </div>
          <div>
            <p style={{ fontSize: 12, color: '#475569', marginBottom: 8 }}>Resume variants used</p>
            {(data?.tracking?.resume_versions_used || []).length === 0
              ? <p style={{ fontSize: 12, color: '#334155' }}>None yet</p>
              : (data?.tracking?.resume_versions_used || []).map(v => (
                <div key={v.resume_variant} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#64748b', marginBottom: 4 }}>
                  <span>Variant #{v.resume_variant + 1}</span>
                  <Badge color="purple">{v.count}x</Badge>
                </div>
              ))
            }
          </div>
        </div>
      </Card>

      {/* Recent sends */}
      {(data?.tracking?.recent_emails || []).length > 0 && (
        <Card>
          <h2 style={{ fontSize: 14, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 12 }}>
            Recent Email Log
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.tracking.recent_emails.map((e, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '6px 10px', background: '#111827', borderRadius: 6, flexWrap: 'wrap' }}>
                <Badge color="blue">T#{e.template_index + 1}</Badge>
                <Badge color="purple">R#{e.resume_variant + 1}</Badge>
                <span style={{ flex: 1, fontSize: 12, color: '#64748b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{e.subject}</span>
                <span style={{ fontSize: 11, color: '#334155', fontFamily: 'Space Mono,monospace' }}>{new Date(e.sent_at).toLocaleTimeString()}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div style={{ marginTop: 20, padding: '12px 16px', background: 'rgba(37,99,235,0.06)', border: '1px solid rgba(37,99,235,0.2)', borderRadius: 8 }}>
        <p style={{ fontSize: 13, color: '#93c5fd' }}>
          <strong>How it works:</strong> Limits reset on a rolling 12-hour basis. Overflow jobs and emails are automatically queued and processed every 30 minutes when slots open. Emails are spaced 30–90 minutes apart to simulate human behavior.
        </p>
      </div>
    </div>
  );
}
