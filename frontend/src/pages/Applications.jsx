import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SendHorizonal, ExternalLink, RefreshCw, ThumbsUp, ThumbsDown, Clock, Zap, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import api, { downloadFile } from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Card, SectionTitle, Badge, Btn, Empty, ScoreRing } from '../components/UI';
import { useToast } from '../components/Toast';
import Loader from '../components/Loader';

const STATUS_COLOR = {
  applied: 'green', ready: 'blue', pending: 'yellow',
  failed: 'red', automating: 'purple', interview: 'green',
  rejected: 'red', no_response: 'yellow'
};

const OUTCOMES = [
  { value: 'interview',   label: '✅ Interview', color: '#166534' },
  { value: 'rejected',    label: '❌ Rejected',  color: '#7f1d1d' },
  { value: 'no_response', label: '⏳ No Reply',  color: '#78350f' },
];

export default function Applications() {
  const [apps, setApps]           = useState([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [loading, setLoading]     = useState(true);
  const [filter, setFilter]       = useState('all');
  const [page, setPage]           = useState(1);
  const [autoapplying, setAA]     = useState({});
  const [feedbacks, setFeedbacks] = useState({});
  const [submitting, setSub]      = useState({});
  const navigate = useNavigate();
  const toast = useToast();

  const load = (p = page, f = filter) => {
    setLoading(true);
    const params = { page: p, limit: 20 };
    if (f !== 'all') params.status = f;
    api.get(ENDPOINTS.applications.list, { params })
      .then(r => {
        setApps(r.data.applications || []);
        setPagination(r.data.pagination || { total: 0, page: 1, pages: 1 });
      })
      .catch(() => toast.error('Failed to load applications.'))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(page, filter); }, [page, filter]);

  const handleFilter = (f) => { setFilter(f); setPage(1); };

  const exportCSV = async () => { try { await downloadFile(ENDPOINTS.applications.export, 'applications.csv'); } catch { toast.error('Export failed.'); } };

  const autoApply = async (appId) => {
    setAA(s => ({ ...s, [appId]: true }));
    try {
      await api.post(buildUrl(ENDPOINTS.applications.autoApply, { id: appId }));
      toast.success('Automation started! Refresh in ~30s.');
    } catch (err) {
      if (err.response?.status === 503) {
        const manualUrl = err.response.data?.manual_apply_url || apps.find(a => a.id === appId)?.apply_url;
        toast.error(
          <span>
            Auto-apply is not available on this server.<br />
            {manualUrl ? (
              <>Apply manually: <a href={manualUrl} target="_blank" rel="noreferrer" style={{ color: '#60a5fa', textDecoration: 'underline' }}>{manualUrl}</a></>
            ) : 'Apply manually.'}
          </span>
        );
      } else {
        toast.error(err.message || 'Auto-apply failed.');
      }
    } finally { setAA(s => ({ ...s, [appId]: false })); }
  };

  const submitFeedback = async (appId) => {
    const outcome = feedbacks[appId];
    if (!outcome) { toast.error('Select an outcome first.'); return; }
    setSub(s => ({ ...s, [appId]: true }));
    try {
      await api.post(ENDPOINTS.feedback.submit, { application_id: appId, outcome });
      toast.success('Feedback saved!');
      setApps(prev => prev.map(a => a.id === appId ? { ...a, status: outcome } : a));
    } catch (err) {
      toast.error(err.message || 'Failed.');
    } finally { setSub(s => ({ ...s, [appId]: false })); }
  };

  const daysSince = (date) => date ? Math.floor((Date.now() - new Date(date)) / 86400000) : null;

  const FilterBtn = ({ val, label }) => (
    <button onClick={() => handleFilter(val)} style={{
      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      cursor: 'pointer', border: 'none', fontFamily: 'Syne,sans-serif',
      background: filter === val ? '#2563eb' : '#161d2e',
      color: filter === val ? '#fff' : '#6b7280', transition: 'all 0.15s'
    }}>{label}</button>
  );

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <SectionTitle sub={`${pagination.total} total applications · Page ${pagination.page} of ${pagination.pages}`}>
          Applications
        </SectionTitle>
        <div style={{ display: 'flex', gap: 8 }}>
          <Btn variant="ghost" size="sm" onClick={exportCSV}><Download size={14} /> Export CSV</Btn>
          <Btn variant="ghost" size="sm" onClick={() => load()}><RefreshCw size={14} /></Btn>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 20, flexWrap: 'wrap' }}>
        <FilterBtn val="all"        label="All" />
        <FilterBtn val="ready"      label="Ready" />
        <FilterBtn val="applied"    label="Applied" />
        <FilterBtn val="automating" label="Automating" />
        <FilterBtn val="interview"  label="Interview" />
        <FilterBtn val="rejected"   label="Rejected" />
        <FilterBtn val="failed"     label="Failed" />
      </div>

      {loading ? <Loader text="Loading applications..." /> : apps.length === 0 ? (
        <Empty icon={SendHorizonal} title="No applications" sub="Use Job Matcher to analyze and apply to jobs." />
      ) : (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {apps.map(app => {
              const days = daysSince(app.applied_at);
              const needsFeedback = app.status === 'applied' && days !== null && days >= 7;
              return (
                <Card key={app.id} style={{
                  border: needsFeedback ? '1px solid rgba(245,158,11,0.4)' :
                    app.status === 'interview' ? '1px solid rgba(34,197,94,0.3)' : '1px solid #1a2236'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <ScoreRing score={app.match_score || app.job_match_score || 0} size={60} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 15, color: '#f1f5f9', marginBottom: 3 }}>{app.job_title}</div>
                      <div style={{ fontSize: 13, color: '#475569', marginBottom: 6 }}>{app.company}</div>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                        <Badge color={STATUS_COLOR[app.status] || 'gray'}>{app.status?.replace(/_/g,' ').toUpperCase()}</Badge>
                        {app.applied_at && (
                          <span style={{ fontSize: 11, color: '#334155', fontFamily: 'Space Mono,monospace' }}>
                            Applied {new Date(app.applied_at).toLocaleDateString()} ({days}d ago)
                          </span>
                        )}
                        {needsFeedback && <Badge color="yellow"><Clock size={10} style={{ display:'inline', marginRight:3 }} />Feedback Due</Badge>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      {app.status === 'ready' && app.apply_url && (
                        <Btn variant="primary" size="sm" loading={autoapplying[app.id]} onClick={() => autoApply(app.id)}>
                          <Zap size={13} /> Auto-Apply
                        </Btn>
                      )}
                      {app.apply_url && (
                        <a href={app.apply_url} target="_blank" rel="noreferrer">
                          <Btn variant="ghost" size="sm"><ExternalLink size={13} /></Btn>
                        </a>
                      )}
                    </div>
                  </div>
                  {app.error_message && (
                    <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 6, fontSize: 12, color: '#f87171' }}>{app.error_message}</div>
                  )}
                  {(needsFeedback || app.status === 'applied') && (
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #1a2236' }}>
                      <p style={{ fontSize: 12, color: '#f59e0b', fontWeight: 600, marginBottom: 8 }}>
                        {needsFeedback ? '⚠️ 7+ days — what was the outcome?' : 'Submit outcome:'}
                      </p>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {OUTCOMES.map(o => (
                          <button key={o.value} onClick={() => setFeedbacks(f => ({ ...f, [app.id]: o.value }))}
                            style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'Syne,sans-serif', transition: 'all 0.15s', background: feedbacks[app.id] === o.value ? o.color : '#1e2d47', color: feedbacks[app.id] === o.value ? '#fff' : '#64748b' }}>{o.label}</button>
                        ))}
                        <Btn size="sm" loading={submitting[app.id]} onClick={() => submitFeedback(app.id)}>Save</Btn>
                        <Btn variant="ghost" size="sm" onClick={() => navigate('/feedback')}>Full Feedback →</Btn>
                      </div>
                    </div>
                  )}
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {pagination.pages > 1 && (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 24 }}>
              <Btn variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                <ChevronLeft size={14} /> Prev
              </Btn>
              <span style={{ fontSize: 13, color: '#64748b', fontFamily: 'Space Mono,monospace' }}>
                {page} / {pagination.pages}
              </span>
              <Btn variant="ghost" size="sm" disabled={page >= pagination.pages} onClick={() => setPage(p => p + 1)}>
                Next <ChevronRight size={14} />
              </Btn>
            </div>
          )}
        </>
      )}
    </div>
  );
}
