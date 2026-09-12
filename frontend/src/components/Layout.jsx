import React, { useState, useEffect } from 'react';
import { LayoutDashboard, FileText, Crosshair, SendHorizonal, Mail, Compass, LogOut, Menu, X, Zap, Settings, Brain, WifiOff, Shield, BarChart2, Scissors, CheckCircle } from "lucide-react";
import { useLocation, useNavigate, NavLink, Outlet } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { useToast } from './Toast';
import api from '../services/api';
import { ENDPOINTS } from '../services/endpoints';
import NotificationBell from './NotificationBell';

const NAV = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', exact: true },
  { to: '/resume', icon: FileText, label: 'My Resume' },
  { to: '/match', icon: Crosshair, label: 'Job Matcher' },
  { to: '/applications', icon: SendHorizonal, label: 'Applications' },
  { to: '/email', icon: Mail, label: 'Email Apply' },
  { to: '/discover', icon: Compass, label: 'Discover Jobs' },
  { to: '/feedback', icon: Brain, label: 'Feedback & AI' },
  { to: '/email-analytics', icon: BarChart2, label: 'Email AI' },
  { to: '/limits', icon: Shield, label: 'Rate Limits' },
  { to: '/resume-tailor', icon: Scissors, label: 'Resume Tailor' },
  { to: '/eligibility', icon: CheckCircle, label: 'Eligibility' },
  { to: '/settings', icon: Settings, label: 'Settings' },
];

const S = {
  shell: { display: 'flex', minHeight: '100vh', background: '#090c10' },
  sidebar: (open) => ({
    width: open ? 240 : 72, transition: 'width 0.25s ease',
    background: '#0d1117', borderRight: '1px solid #1a2236',
    display: 'flex', flexDirection: 'column', flexShrink: 0,
    position: 'sticky', top: 0, height: '100vh', overflow: 'hidden'
  }),
  logo: { padding: '20px 16px', display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #1a2236' },
  logoIcon: { width: 36, height: 36, borderRadius: 8, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  logoText: { fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 18, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden' },
  nav: { flex: 1, padding: '16px 8px', display: 'flex', flexDirection: 'column', gap: 4 },
  navLink: (active, open) => ({
    display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px',
    borderRadius: 8, textDecoration: 'none', cursor: 'pointer',
    transition: 'all 0.15s',
    background: active ? 'rgba(37,99,235,0.15)' : 'transparent',
    color: active ? '#60a5fa' : '#6b7280',
    border: active ? '1px solid rgba(37,99,235,0.3)' : '1px solid transparent',
    whiteSpace: 'nowrap', overflow: 'hidden'
  }),
  navLabel: { fontFamily: 'Syne,sans-serif', fontSize: 14, fontWeight: 500 },
  main: { flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 },
  topbar: { height: 60, background: '#0d1117', borderBottom: '1px solid #1a2236', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 24px', position: 'sticky', top: 0, zIndex: 10 },
  content: { flex: 1, padding: 24, overflowY: 'auto' },
  userArea: { padding: '12px 8px', borderTop: '1px solid #1a2236' },
  userBtn: { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 8, cursor: 'pointer', border: 'none', background: 'transparent', color: '#6b7280', width: '100%', transition: 'all 0.15s' },
  avatar: { width: 32, height: 32, borderRadius: '50%', background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 13, fontWeight: 700, color: '#fff' },
  menuBtn: { background: 'none', border: 'none', cursor: 'pointer', color: '#6b7280', display: 'flex', padding: 4 }
};

export default function Layout() {
  const [open, setOpen] = useState(true);
  const [serverOk, setServerOk] = useState(true);
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const toast = useToast();

  // Auto-collapse sidebar on mobile screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 768) setOpen(false);
      else setOpen(true);
    };
    handleResize(); // run on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Check server health every 30s
  useEffect(() => {
    const check = () => {
      fetch('/api/health').then(r => r.ok ? setServerOk(true) : setServerOk(false)).catch(() => setServerOk(false));
    };
    check();
    const id = setInterval(check, 30000);
    return () => clearInterval(id);
  }, []);

  const handleLogout = () => {
    logout();
    toast.info('Logged out. See you soon!');
    navigate('/login');
  };

  return (
    <div style={S.shell}>
      {/* Sidebar */}
      <aside style={S.sidebar(open)}>
        <div style={S.logo}>
          <div style={S.logoIcon}><Zap size={18} color="#fff" /></div>
          {open && <span style={S.logoText}>JobAI</span>}
        </div>

        <nav style={S.nav}>
          {NAV.map(({ to, icon: Icon, label, exact }) => (
            <NavLink key={to} to={to} end={exact}
              style={({ isActive }) => S.navLink(isActive, open)}>
              <Icon size={18} style={{ flexShrink: 0 }} />
              {open && <span style={S.navLabel}>{label}</span>}
            </NavLink>
          ))}
        </nav>

        <div style={S.userArea}>
          <button style={S.userBtn} onClick={handleLogout}
            onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.1)'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
            <div style={S.avatar}>{user?.name?.[0]?.toUpperCase() || 'U'}</div>
            {open && (
              <div style={{ textAlign: 'left', overflow: 'hidden' }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
                <div style={{ fontSize: 11, color: '#475569' }}>Logout</div>
              </div>
            )}
            {open && <LogOut size={14} style={{ marginLeft: 'auto', flexShrink: 0 }} />}
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={S.main}>
        <div style={S.topbar}>
          <button style={S.menuBtn} onClick={() => setOpen(o => !o)}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, justifyContent: 'flex-end' }}>
            {user && user.email_verified === 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.3)', borderRadius: 6, padding: '4px 12px' }}>
                <span style={{ fontSize: 12, color: '#fbbf24' }}>⚠️ Email not verified</span>
                <button onClick={async () => {
                  try { await api.post(ENDPOINTS.auth.resendVerification); toast.success('Verification email sent!'); }
                  catch (e) { toast.error(e.response?.data?.error || 'Failed to resend.'); }
                }} style={{ background: 'none', border: 'none', color: '#f59e0b', fontSize: 12, cursor: 'pointer', textDecoration: 'underline', padding: 0 }}>
                  Resend
                </button>
              </div>
            )}
            <NotificationBell />
            {serverOk
              ? <><div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e' }} /><span style={{ fontSize: 12, color: '#475569', fontFamily: 'Space Mono,monospace' }}>AI Online</span></>
              : <><WifiOff size={14} color="#ef4444" /><span style={{ fontSize: 12, color: '#ef4444', fontFamily: 'Space Mono,monospace' }}>Server Offline — start backend</span></>
            }
          </div>
        </div>
        <div style={S.content}>
          <Outlet />
        </div>
      </main>
    </div>
  );
}
