import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Compass, ExternalLink, Search, ThumbsUp, ThumbsDown, RefreshCw, Bell, CheckCircle, Clock } from 'lucide-react';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Card, Btn, Input, SectionTitle, Badge, ScoreRing, Empty, Alert } from '../components/UI';
import { AIThinking } from '../components/Progress';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import Loader from '../components/Loader';

export default function Discover() {
  const [prefs, setPrefs] = useState({ preferred_roles: '', preferred_locations: 'Remote', job_types: 'Internship, Full-time', skills: '', min_salary: 0, daily_discovery_enabled: false });
  const [discovering, setDiscovering] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [disclaimer, setDisclaimer] = useState('');
  const [pendingJobs, setPendingJobs] = useState([]);
  const [pendingCount, setPendingCount] = useState(0);
  const [loadingFeed, setLoadingFeed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [actioning, setActioning] = useState({});
  const [tab, setTab] = useState('feed');
  const toast = useToast();
  const confirm = useConfirm();
  const navigate = useNavigate();

  const loadFeed = useCallback(async () => {
    setLoadingFeed(true);
    try {
      const r = await api.get(ENDPOINTS.jobs.discoveredList, { params: { status: 'pending' } });
      setPendingJobs(r.data.jobs || []);
      setPendingCount(r.data.pending_count || 0);
    } catch {}
    finally { setLoadingFeed(false); }
  }, []);

  useEffect(() => {
    loadFeed();
    api.get(ENDPOINTS.auth.me).then(r => {
      if (r.data.preferences) {
        const p = r.data.preferences;
        setPrefs({ preferred_roles: p.preferred_roles||'', preferred_locations: p.preferred_locations||'Remote', job_types: p.job_types||'Internship, Full-time', skills: p.skills||'', min_salary: p.min_salary||0, daily_discovery_enabled: !!p.daily_discovery_enabled });
      }
    }).catch(() => {});
  }, []);

  const set = k => e => setPrefs(p => ({ ...p, [k]: e.target.type==='checkbox' ? e.target.checked : e.target.value }));

  const savePrefs = async () => {
    setSaving(true);
    try { await api.put(ENDPOINTS.auth.preferences, prefs); toast.success('Preferences saved.'); }
    catch { toast.error('Failed to save.'); }
    finally { setSaving(false); }
  };

  const discover = async () => {
    setDiscovering(true); setAiResult(null);
    try {
      const r = await api.post(ENDPOINTS.jobs.discover);
      setAiResult(r.data);
      if (r.data.disclaimer) setDisclaimer(r.data.disclaimer);
      toast.success(`${r.data.stored_count||0} new job recommendations added to your feed.`);
      await loadFeed();
      setTab('feed');
    } catch (err) {
      toast.error(err.message || 'Discovery failed. Upload your resume first.');
    } finally { setDiscovering(false); }
  };

  const action = async (id, act) => {
    if (act === 'apply') {
      const ok = await confirm('Add to Job Matcher? You can then analyze and tailor your resume before applying.', { title: 'Add to Job Matcher?', confirmLabel: 'Add Job' });
      if (!ok) return;
    }
    setActioning(a => ({ ...a, [id]: act }));
    try {
      const r = await api.post(buildUrl(ENDPOINTS.jobs.discoveredAct, { id }), { action: act });
      toast.success(r.data.message);
      setPendingJobs(js => js.filter(j => j.id !== id));
      setPendingCount(c => Math.max(0, c - 1));
      if (act === 'apply') setTimeout(() => navigate('/match'), 1200);
    } catch (err) {
      toast.error(err.message || 'Action failed.');
    } finally { setActioning(a => ({ ...a, [id]: null })); }
  };

  const TabBtn = ({ val, label, count }) => (
    <button onClick={() => setTab(val)} style={{
      padding: '8px 20px', borderRadius: 8, fontFamily: 'Syne,sans-serif', fontWeight: 600,
      fontSize: 14, cursor: 'pointer', border: 'none', position: 'relative', transition: 'all 0.15s',
      background: tab===val ? '#2563eb' : 'transparent', color: tab===val ? '#fff' : '#64748b'
    }}>
      {label}
      {count > 0 && <span style={{ position:'absolute', top:3, right:3, minWidth:18, height:18, borderRadius:99, background:'#ef4444', color:'#fff', fontSize:10, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px', fontFamily:'Space Mono,monospace' }}>{count>9?'9+':count}</span>}
    </button>
  );

  return (
    <div>
      <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:20 }}>
        <SectionTitle sub="AI-powered daily job discovery — stored in your feed for review.">Job Discovery</SectionTitle>
        <Btn variant="ghost" size="sm" onClick={loadFeed}><RefreshCw size={14} /></Btn>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'#111827', borderRadius:10, padding:4, width:'fit-content', marginBottom:24, border:'1px solid #1a2236' }}>
        <TabBtn val="feed" label="Job Feed" count={pendingCount} />
        <TabBtn val="discover" label="Run Discovery" />
        <TabBtn val="settings" label="Preferences" />
      </div>

      {/* FEED TAB */}
      {tab==='feed' && (
        loadingFeed ? <Loader text="Loading feed..." /> :
        pendingJobs.length===0 ? (
          <Empty icon={Bell} title="No pending jobs"
            sub="Run AI Discovery to populate your feed with personalised recommendations."
            action={<Btn onClick={() => setTab('discover')}><Compass size={15} /> Run Discovery</Btn>} />
        ) : (
          <div>
            {disclaimer && (
              <Alert type="warning" style={{ marginBottom: 16 }}>
                {disclaimer}
              </Alert>
            )}
            <p style={{ fontSize:13, color:'#475569', marginBottom:16 }}>{pendingJobs.length} job{pendingJobs.length!==1?'s':''} waiting — Apply or Reject each one.</p>
            <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
              {pendingJobs.map(job => (
                <Card key={job.id} style={{ border:'1px solid #1e2d47', opacity: actioning[job.id] ? 0.5 : 1, transition:'opacity 0.3s' }}>
                  <div style={{ display:'flex', alignItems:'flex-start', gap:16, flexWrap:'wrap' }}>
                    <ScoreRing score={job.match_estimate||80} size={60} />
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:15, color:'#f1f5f9', marginBottom:4 }}>{job.title}</div>
                      <div style={{ fontSize:13, color:'#475569', marginBottom:6 }}>{job.company||'Various Companies'}{job.location?` · ${job.location}`:''}</div>
                      {job.reason && <p style={{ fontSize:12, color:'#64748b', fontStyle:'italic', marginBottom:8, lineHeight:1.5 }}>{job.reason}</p>}
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <Badge color="blue">AI Discovery</Badge>
                        <Badge color="yellow"><Clock size={10} style={{ display:'inline', marginRight:3 }} />Pending</Badge>
                        <span style={{ fontSize:11, color:'#334155', fontFamily:'Space Mono,monospace', alignSelf:'center' }}>{new Date(job.discovered_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div style={{ display:'flex', gap:8, flexShrink:0, alignItems:'center' }}>
                      <Btn variant="success" size="sm" loading={actioning[job.id]==='apply'} onClick={() => action(job.id,'apply')}><ThumbsUp size={14} /> Apply</Btn>
                      <Btn variant="danger"  size="sm" loading={actioning[job.id]==='reject'} onClick={() => action(job.id,'reject')}><ThumbsDown size={14} /> Reject</Btn>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )
      )}

      {/* DISCOVER TAB */}
      {tab==='discover' && (
        <div>
          <Card style={{ marginBottom:24 }}>
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'center' }}>
              <div style={{ flex:1, minWidth:200 }}>
                <p style={{ fontSize:14, color:'#94a3b8', marginBottom:4, fontWeight:600 }}>AI Job Discovery</p>
                <p style={{ fontSize:13, color:'#475569' }}>AI reads your resume and finds matching roles. Results go into your feed.</p>
              </div>
              <Btn onClick={discover} loading={discovering} size="lg"><Compass size={16} /> {discovering?'Discovering…':'Discover Jobs Now'}</Btn>
            </div>
          </Card>
          {discovering && <div style={{ marginBottom:24 }}><AIThinking active messages={['Reading your resume…','Matching skills to market demand…','Identifying best-fit roles…','Generating search queries…','Storing in your feed…']} /></div>}
          {aiResult && !discovering && (
            <div>
              {disclaimer && (
                <Alert type="warning" style={{ marginBottom: 16 }}>
                  {disclaimer}
                </Alert>
              )}
              <Card style={{ marginBottom:16 }}>
                <h3 style={{ fontSize:14, fontWeight:700, color:'#94a3b8', marginBottom:12, textTransform:'uppercase', letterSpacing:1, display:'flex', alignItems:'center', gap:6 }}><Search size={13} /> Optimised Search Queries</h3>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {(aiResult.search_queries||[]).map((q,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:10 }}>
                      <div style={{ fontFamily:'Space Mono,monospace', fontSize:13, background:'#111827', border:'1px solid #1e2d47', borderRadius:6, padding:'7px 14px', flex:1, color:'#60a5fa' }}>"{q}"</div>
                      <a href={`https://www.linkedin.com/jobs/search/?keywords=${encodeURIComponent(q)}`} target="_blank" rel="noreferrer"><Btn variant="ghost" size="sm"><ExternalLink size={12} /> LinkedIn</Btn></a>
                      <a href={`https://internshala.com/internships/keywords-${encodeURIComponent(q)}`} target="_blank" rel="noreferrer"><Btn variant="ghost" size="sm"><ExternalLink size={12} /> Internshala</Btn></a>
                    </div>
                  ))}
                </div>
              </Card>
              {aiResult.tips && <Card style={{ borderColor:'rgba(245,158,11,0.3)', background:'rgba(245,158,11,0.04)' }}><p style={{ fontSize:13, color:'#fbbf24', fontStyle:'italic', lineHeight:1.7 }}>💡 <strong>AI Tip:</strong> {aiResult.tips}</p></Card>}
            </div>
          )}
        </div>
      )}

      {/* PREFERENCES TAB */}
      {tab==='settings' && (
        <Card>
          <h2 style={{ fontSize:15, fontWeight:700, color:'#94a3b8', marginBottom:18, textTransform:'uppercase', letterSpacing:1 }}>Job Preferences</h2>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
            <Input label="Preferred Roles" placeholder="Full Stack Developer, ML Engineer" value={prefs.preferred_roles} onChange={set('preferred_roles')} />
            <Input label="Locations" placeholder="Kota, Bangalore, Remote" value={prefs.preferred_locations} onChange={set('preferred_locations')} />
            <Input label="Job Types" placeholder="Internship, Full-time" value={prefs.job_types} onChange={set('job_types')} />
            <Input label="Key Skills" placeholder="React, Python, Node.js" value={prefs.skills} onChange={set('skills')} />
          </div>
          <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', marginBottom:16, fontSize:14, color:'#94a3b8' }}>
            <input type="checkbox" checked={prefs.daily_discovery_enabled} onChange={set('daily_discovery_enabled')} style={{ width:16, height:16, accentColor:'#2563eb' }} />
            Enable automatic daily discovery at 4:00 PM IST
          </label>
          <Btn loading={saving} onClick={savePrefs}><CheckCircle size={14} /> Save Preferences</Btn>
        </Card>
      )}
    </div>
  );
}
