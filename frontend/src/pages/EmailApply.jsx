import React, { useEffect, useState } from 'react';
import { Mail, Send, CheckCircle, Edit3, TrendingUp } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Card, Btn, Input, SectionTitle, Badge, Empty } from '../components/UI';
import { useToast } from '../components/Toast';
import { AIThinking } from '../components/Progress';
import Loader from '../components/Loader';

const OUTCOMES = [
  { value: 'accepted', label: '✅ Accepted', color: '#166534' },
  { value: 'rejected', label: '❌ Rejected',  color: '#7f1d1d' },
  { value: 'ignored',  label: '⏳ Ignored',   color: '#78350f' },
];

export default function EmailApply() {
  const [form, setForm] = useState({ company_name: '', role: '', recipient_email: '', company_info: '', personality: 'formal_confident' });
  const [generating, setGenerating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [emailApps, setEmailApps] = useState([]);
  const [emailPagination, setEmailPagination] = useState({ total: 0, page: 1, pages: 1 });
  const [emailPage, setEmailPage] = useState(1);
  const [pendingOutcomes, setPendingOutcomes] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [sending, setSending] = useState({});
  const [editing, setEditing] = useState(false);
  const [outcomes, setOutcomes] = useState({});
  const [submittingOutcome, setSubmittingOutcome] = useState({});
  const toast = useToast();
  const navigate = useNavigate();

  const set = k => e => setForm(f => ({ ...f, [k]: e.target.value }));

  const loadList = (p = emailPage) => {
    api.get(ENDPOINTS.email.list, { params: { page: p, limit: 10 } })
      .then(r => {
        setEmailApps(r.data.applications || []);
        setEmailPagination(r.data.pagination || { total: 0, page: 1, pages: 1 });
      })
      .finally(() => setLoadingList(false));
    api.get(ENDPOINTS.email.pendingOutcomes).then(r => setPendingOutcomes(r.data.pending || [])).catch(() => {});
  };
  useEffect(() => { loadList(emailPage); }, [emailPage]);

  const generate = async (e) => {
    e.preventDefault();
    setGenerating(true); setGenerated(null);
    try {
      const r = await api.post(ENDPOINTS.email.generate, form);
      setGenerated(r.data);
      toast.success(`Email generated (Template #${(r.data.template_used ?? 0) + 1}, Resume Variant #${(r.data.resume_variant ?? 0) + 1}). Review and send below.`);
    } catch (err) {
      if (err.response?.status === 429) {
        const d = err.response.data;
        const resetAt = d.rate_limit?.next_reset_at
          ? new Date(d.rate_limit.next_reset_at).toLocaleTimeString()
          : 'next window';
        toast.warning(
          d.queued_id
            ? `Email limit reached (5 emails/12h). Queued — will send automatically at ${resetAt}.`
            : `Email limit reached (5 emails/12h). Next slot opens at ${resetAt}.`
        );
      } else {
        toast.error(err.message || 'Generation failed. Make sure you have an active resume.');
      }
    } finally { setGenerating(false); }
  };

  const send = async (id) => {
    setSending(s => ({ ...s, [id]: true }));
    try {
      const r = await api.post(buildUrl(ENDPOINTS.email.send, { id }));
      if (r.data.queued) {
        const resetTime = new Date(r.data.resetAt).toLocaleTimeString(
          [], { hour: '2-digit', minute: '2-digit' }
        );
        toast.info(`Email queued. Rate limit resets at ${resetTime}.`);
      } else {
        toast.success('Email application sent successfully! 🎉');
      }
      loadList();
      setGenerated(null);
    } catch (err) {
      toast.error(err.message || 'Send failed. Check EMAIL_USER and EMAIL_PASS in backend .env');
    } finally { setSending(s => ({ ...s, [id]: false })); }
  };

  const saveEdit = async () => {
    if (!generated?.email_app_id) return;
    try {
      await api.put(buildUrl(ENDPOINTS.email.update, { id: generated.email_app_id }), {
        subject: generated.subject, body: generated.email_body, cover_letter: generated.cover_letter
      });
      toast.success('Draft saved.');
      setEditing(false);
    } catch (err) {
      toast.error(err.message || 'Failed to save draft.');
    }
  };

  const submitOutcome = async (emailPerfId) => {
    const outcome = outcomes[emailPerfId];
    if (!outcome) { toast.error('Select an outcome first.'); return; }
    setSubmittingOutcome(s => ({ ...s, [emailPerfId]: true }));
    try {
      await api.post(buildUrl(ENDPOINTS.email.setOutcome, { id: emailPerfId }), { outcome });
      toast.success('Outcome saved! AI will learn from this.');
      setPendingOutcomes(ps => ps.filter(p => p.id !== emailPerfId));
    } catch (err) {
      toast.error(err.message || 'Failed.');
    } finally { setSubmittingOutcome(s => ({ ...s, [emailPerfId]: false })); }
  };

  return (
    <div>
      <SectionTitle sub="AI researches the company, writes a personalized email, cover letter, and attaches your resume.">
        Email Application System
      </SectionTitle>

      {/* Generator Form */}
      <Card glow style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8', marginBottom: 16, textTransform: 'uppercase', letterSpacing: 1 }}>Generate Email Application</h2>
        <form onSubmit={generate} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Input label="Company Name *" placeholder="Google" value={form.company_name} onChange={set('company_name')} required />
          <Input label="Role Applying For *" placeholder="Software Engineer Intern" value={form.role} onChange={set('role')} required />
          <Input label="Recipient Email *" type="email" placeholder="hr@google.com" value={form.recipient_email} onChange={set('recipient_email')} required />
          <Input label="Company Info (optional)" placeholder="Any context about the company or role" value={form.company_info} onChange={set('company_info')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Tone / Personality</label>
            <select value={form.personality} onChange={set('personality')}
              style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, fontFamily: 'Syne,sans-serif', outline: 'none', cursor: 'pointer' }}>
              <option value="formal_confident">Formal + Confident (Default)</option>
              <option value="formal">Formal</option>
              <option value="confident">Confident</option>
            </select>
          </div>
          <div style={{ gridColumn: '1/-1' }}>
            <Btn type="submit" loading={generating} size="lg">
              <Mail size={16} /> {generating ? 'AI is writing your application...' : 'Generate Application'}
            </Btn>
          </div>
        </form>
      </Card>

      {/* Generated Preview */}
      {generating && (
        <div style={{ marginBottom: 24 }}>
          <AIThinking active messages={[
            'Researching company profile…',
            'Crafting personalized subject line…',
            'Writing formal email body…',
            'Generating cover letter…',
            'Highlighting your key achievements…',
            'Finalising attachments…',
          ]} />
        </div>
      )}

      {generated && (
        <Card style={{ marginBottom: 28 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ color: '#f1f5f9', fontWeight: 700, fontSize: 16 }}>Generated Application</h3>
            <div style={{ display: 'flex', gap: 8 }}>
              <Btn variant="ghost" size="sm" onClick={() => setEditing(e => !e)}><Edit3 size={13} /> {editing ? 'Cancel' : 'Edit'}</Btn>
              {editing && <Btn variant="success" size="sm" onClick={saveEdit}>Save Draft</Btn>}
              <Btn variant="primary" size="sm" loading={sending[generated.email_app_id]} onClick={() => send(generated.email_app_id)}>
                <Send size={13} /> Send Email
              </Btn>
            </div>
          </div>

          {/* Suggested roles — selectable to regenerate with different role */}
          {generated.suggested_roles?.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              <p style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>
                AI also suggests these roles — click to regenerate:
              </p>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {generated.suggested_roles.map(r => (
                  <button key={r} onClick={() => {
                    setForm(f => ({ ...f, role: r }));
                    setGenerated(null);
                  }} style={{
                    padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', border: '1px solid rgba(37,99,235,0.4)',
                    background: 'rgba(37,99,235,0.08)', color: '#60a5fa',
                    fontFamily: 'Syne,sans-serif', transition: 'all 0.15s'
                  }}>
                    {r} ↻
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Subject */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Subject</p>
            {editing
              ? <input value={generated.subject} onChange={e => setGenerated(g => ({ ...g, subject: e.target.value }))}
                  style={{ width: '100%', background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '8px 12px', color: '#e2e8f0', fontSize: 14, fontFamily: 'Syne,sans-serif', outline: 'none' }} />
              : <p style={{ fontSize: 14, color: '#cbd5e1', fontWeight: 600 }}>{generated.subject}</p>
            }
          </div>

          {/* Email Body */}
          <div style={{ marginBottom: 14 }}>
            <p style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Email Body</p>
            {editing
              ? <textarea value={generated.email_body} onChange={e => setGenerated(g => ({ ...g, email_body: e.target.value }))}
                  style={{ width: '100%', minHeight: 200, background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, fontFamily: 'Space Mono,monospace', outline: 'none', resize: 'vertical' }} />
              : <div style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '14px 16px' }}>
                  {/* Strip dangerous tags — render as safe HTML */}
                  <div dangerouslySetInnerHTML={{
                    __html: (generated.email_body || '')
                      .replace(/<script[\s\S]*?<\/script>/gi, '')
                      .replace(/on\w+="[^"]*"/gi, '')
                      .replace(/javascript:/gi, '')
                  }} />
                </div>
            }
          </div>

          {/* Cover Letter */}
          <div>
            <p style={{ fontSize: 11, color: '#475569', fontWeight: 700, textTransform: 'uppercase', marginBottom: 8 }}>Cover Letter (will be attached as PDF)</p>
            {editing
              ? <textarea value={generated.cover_letter} onChange={e => setGenerated(g => ({ ...g, cover_letter: e.target.value }))}
                  style={{ width: '100%', minHeight: 180, background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '10px 12px', color: '#e2e8f0', fontSize: 13, fontFamily: 'Space Mono,monospace', outline: 'none', resize: 'vertical' }} />
              : <pre style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '14px 16px', fontSize: 12, color: '#94a3b8', whiteSpace: 'pre-wrap', fontFamily: 'Space Mono,monospace' }}>{generated.cover_letter}</pre>
            }
          </div>
        </Card>
      )}

      {/* Pending outcome notifications */}
      {pendingOutcomes.length > 0 && (
        <Card style={{ marginBottom: 24, border: '1px solid rgba(245,158,11,0.3)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, color: '#fbbf24', margin: 0 }}>
              ⚠️ {pendingOutcomes.length} email{pendingOutcomes.length > 1 ? 's' : ''} awaiting outcome — mark to improve AI
            </h3>
            <Btn variant="ghost" size="sm" onClick={() => navigate('/email-analytics')}><TrendingUp size={13} /> Full Analytics</Btn>
          </div>
          {pendingOutcomes.slice(0, 3).map(ep => (
            <div key={ep.id} style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '10px 14px', marginBottom: 8 }}>
              <div style={{ fontSize: 13, color: '#f1f5f9', fontWeight: 600, marginBottom: 6 }}>{ep.role} at {ep.company_name}</div>
              <div style={{ fontSize: 11, color: '#334155', marginBottom: 8, fontStyle: 'italic' }}>"{ep.subject}"</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                {OUTCOMES.map(o => (
                  <button key={o.value} onClick={() => setOutcomes(prev => ({ ...prev, [ep.id]: o.value }))}
                    style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none', fontFamily: 'Syne,sans-serif', transition: 'all 0.15s', background: outcomes[ep.id] === o.value ? o.color : '#1e2d47', color: outcomes[ep.id] === o.value ? '#fff' : '#64748b' }}>
                    {o.label}
                  </button>
                ))}
                <Btn size="sm" loading={submittingOutcome[ep.id]} onClick={() => submitOutcome(ep.id)}>Save</Btn>
              </div>
            </div>
          ))}
        </Card>
      )}

      {/* Email History */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <h2 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, color: '#f1f5f9', margin: 0 }}>
          Email History <span style={{ fontSize: 13, color: '#475569', fontWeight: 400 }}>({emailPagination.total})</span>
        </h2>
      </div>
      {loadingList ? <Loader /> : emailApps.length === 0 ? (
        <Empty icon={Mail} title="No email applications yet" sub="Generate and send your first email application above." />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {emailApps.map(app => (
            <Card key={app.id} style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: app.status === 'sent' ? 'rgba(34,197,94,0.15)' : 'rgba(37,99,235,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {app.status === 'sent' ? <CheckCircle size={18} color="#22c55e" /> : <Mail size={18} color="#60a5fa" />}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, color: '#e2e8f0', fontSize: 14 }}>{app.role} at {app.company_name}</div>
                <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>To: {app.recipient_email}</div>
              </div>
              <Badge color={app.status === 'sent' ? 'green' : 'blue'}>{app.status?.toUpperCase()}</Badge>
              {app.status !== 'sent' && (
                <Btn variant="primary" size="sm" loading={sending[app.id]} onClick={() => send(app.id)}>
                  <Send size={13} /> Send
                </Btn>
              )}
              {app.sent_at && (
                <span style={{ fontSize: 11, color: '#334155', fontFamily: 'Space Mono,monospace' }}>
                  {new Date(app.sent_at).toLocaleDateString()}
                </span>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Email History Pagination */}
      {emailPagination.pages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginTop: 16 }}>
          <Btn variant="ghost" size="sm" disabled={emailPage <= 1} onClick={() => setEmailPage(p => p - 1)}>← Prev</Btn>
          <span style={{ fontSize: 13, color: '#64748b', fontFamily: 'Space Mono,monospace' }}>{emailPage} / {emailPagination.pages}</span>
          <Btn variant="ghost" size="sm" disabled={emailPage >= emailPagination.pages} onClick={() => setEmailPage(p => p + 1)}>Next →</Btn>
        </div>
      )}
    </div>
  );
}
