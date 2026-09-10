import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, Crosshair, SendHorizonal, Mail, TrendingUp, Clock, Brain } from 'lucide-react';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import useAuthStore from '../store/authStore';
import { Card, StatCard, SectionTitle, Badge, Btn } from '../components/UI';
import Loader from '../components/Loader';

export default function Dashboard() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get(ENDPOINTS.applications.stats),
      api.get(ENDPOINTS.applications.logs),
      api.get(ENDPOINTS.feedback.pending),
    ]).then(([s, l, fp]) => {
      setStats({ ...s.data, feedback_pending: fp.data.count || 0 });
      setLogs(l.data.logs?.slice(0, 8) || []);
    }).catch(err => {
      console.error('Dashboard load error:', err.message);
    }).finally(() => setLoading(false));
  }, []);

  const logColor = (status) => ({ success: 'green', error: 'red', info: 'blue', warning: 'yellow' }[status] || 'gray');

  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 80 }}><Loader text="Loading dashboard..." /></div>;

  const quickActions = [
    { label: 'Upload Resume',      icon: FileText,      path: '/resume',      color: '#2563eb' },
    { label: 'Match Jobs',         icon: Crosshair,     path: '/match',       color: '#7c3aed' },
    { label: 'Track Applications', icon: SendHorizonal, path: '/applications', color: '#0891b2' },
    { label: 'Email Apply',        icon: Mail,          path: '/email',       color: '#059669' },
    { label: 'Feedback & AI',      icon: Brain,         path: '/feedback',    color: '#f59e0b' },
  ];

  return (
    <div>
      <SectionTitle sub={`Welcome back, ${user?.name?.split(' ')[0]}. Here's your job hunt overview.`}>
        Dashboard
      </SectionTitle>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard label="Jobs Analyzed"   value={stats?.jobs_analyzed || 0}      icon={Crosshair}     color="#2563eb" />
        <StatCard label="Applications"    value={stats?.total || 0}               icon={SendHorizonal}  color="#7c3aed" />
        <StatCard label="Applied"         value={stats?.applied || 0}             icon={TrendingUp}    color="#22c55e" />
        <StatCard label="Avg Match Score" value={`${stats?.avg_match_score || 0}%`} icon={TrendingUp}  color="#f59e0b" />
        <StatCard label="Email Sent"      value={stats?.email_apps || 0}          icon={Mail}          color="#0891b2" />
        <StatCard label="Resumes"         value={stats?.resumes_count || 0}       icon={FileText}      color="#ec4899" />
        <StatCard
          label="Feedback Due"
          value={stats?.feedback_pending || 0}
          icon={Brain}
          color={stats?.feedback_pending > 0 ? '#f59e0b' : '#334155'}
          sub={stats?.feedback_pending > 0 ? 'Click to submit' : 'All up to date'}
        />
      </div>

      {/* Quick Actions */}
      <Card style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Quick Actions</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 12 }}>
          {quickActions.map(({ label, icon: Icon, path, color }) => (
            <button key={path} onClick={() => navigate(path)} style={{
              background: `${color}12`, border: `1px solid ${color}30`, borderRadius: 10, padding: '16px 12px',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, cursor: 'pointer',
              color: '#cbd5e1', fontFamily: 'Syne,sans-serif', fontWeight: 600, fontSize: 13, transition: 'all 0.15s'
            }}
              onMouseEnter={e => { e.currentTarget.style.background = `${color}22`; e.currentTarget.style.borderColor = `${color}60`; }}
              onMouseLeave={e => { e.currentTarget.style.background = `${color}12`; e.currentTarget.style.borderColor = `${color}30`; }}
            >
              <Icon size={24} color={color} />
              {label}
            </button>
          ))}
        </div>
      </Card>

      {/* Activity Log */}
      <Card>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
          <Clock size={15} /> Recent Activity
        </h2>
        {logs.length === 0 ? (
          <p style={{ color: '#334155', fontSize: 13, padding: '20px 0' }}>No activity yet. Start by uploading your resume.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {logs.map(log => (
              <div key={log.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', background: '#111827', borderRadius: 8, border: '1px solid #1a2236' }}>
                <Badge color={logColor(log.status)}>{log.type}</Badge>
                <span style={{ flex: 1, fontSize: 13, color: '#94a3b8' }}>{log.details}</span>
                <span style={{ fontSize: 11, color: '#334155', fontFamily: 'Space Mono,monospace', flexShrink: 0 }}>
                  {new Date(log.created_at).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
