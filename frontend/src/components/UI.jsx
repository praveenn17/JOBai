import React from 'react';

// ── Card ─────────────────────────────────────────────────────────────────────
export function Card({ children, style, glow }) {
  return (
    <div style={{
      background: '#0d1117', border: '1px solid #1a2236', borderRadius: 12,
      padding: 20, boxShadow: glow ? '0 0 20px rgba(37,99,235,0.08)' : 'none',
      ...style
    }}>
      {children}
    </div>
  );
}

// ── Button ────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = 'primary', disabled, loading, style, size = 'md', type = 'button' }) {
  const base = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 8, fontFamily: 'Syne,sans-serif', fontWeight: 600, cursor: disabled || loading ? 'not-allowed' : 'pointer',
    border: 'none', transition: 'all 0.15s', outline: 'none',
    fontSize: size === 'sm' ? 13 : size === 'lg' ? 16 : 14,
    padding: size === 'sm' ? '6px 12px' : size === 'lg' ? '12px 24px' : '9px 18px',
    opacity: disabled || loading ? 0.55 : 1,
    ...style
  };

  const variants = {
    primary: { background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', boxShadow: '0 2px 12px rgba(37,99,235,0.3)' },
    secondary: { background: '#161d2e', color: '#94a3b8', border: '1px solid #1e2d47' },
    danger: { background: 'rgba(239,68,68,0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.3)' },
    success: { background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.3)' },
    ghost: { background: 'transparent', color: '#60a5fa', border: '1px solid #1e2d47' },
  };

  return (
    <button type={type} style={{ ...base, ...variants[variant] }} onClick={onClick} disabled={disabled || loading}>
      {loading ? (
        <svg width={14} height={14} viewBox="0 0 50 50" style={{ animation: 'spin 0.8s linear infinite', flexShrink: 0 }}>
          <circle cx="25" cy="25" r="20" fill="none" stroke="currentColor" strokeWidth="5" strokeDasharray="80 20" />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </svg>
      ) : null}
      {children}
    </button>
  );
}

// ── Input ─────────────────────────────────────────────────────────────────────
export function Input({ label, error, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{label}</label>}
      <input style={{
        background: '#111827', border: `1px solid ${error ? '#ef4444' : '#1e2d47'}`, borderRadius: 8,
        padding: '10px 14px', color: '#e2e8f0', fontSize: 14, fontFamily: 'Syne,sans-serif', outline: 'none',
        transition: 'border-color 0.15s', ...style
      }}
        onFocus={e => e.target.style.borderColor = '#2563eb'}
        onBlur={e => e.target.style.borderColor = error ? '#ef4444' : '#1e2d47'}
        {...props}
      />
      {error && <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
    </div>
  );
}

// ── Textarea ──────────────────────────────────────────────────────────────────
export function Textarea({ label, error, style, ...props }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {label && <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>{label}</label>}
      <textarea style={{
        background: '#111827', border: `1px solid ${error ? '#ef4444' : '#1e2d47'}`, borderRadius: 8,
        padding: '10px 14px', color: '#e2e8f0', fontSize: 13, fontFamily: 'Space Mono,monospace', outline: 'none',
        resize: 'vertical', minHeight: 120, transition: 'border-color 0.15s', ...style
      }}
        onFocus={e => e.target.style.borderColor = '#2563eb'}
        onBlur={e => e.target.style.borderColor = error ? '#ef4444' : '#1e2d47'}
        {...props}
      />
      {error && <span style={{ fontSize: 12, color: '#ef4444' }}>{error}</span>}
    </div>
  );
}

// ── Badge ─────────────────────────────────────────────────────────────────────
export function Badge({ children, color = 'blue' }) {
  const colors = {
    blue: { bg: 'rgba(37,99,235,0.15)', color: '#60a5fa', border: 'rgba(37,99,235,0.3)' },
    green: { bg: 'rgba(34,197,94,0.12)', color: '#4ade80', border: 'rgba(34,197,94,0.3)' },
    red: { bg: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'rgba(239,68,68,0.3)' },
    yellow: { bg: 'rgba(234,179,8,0.12)', color: '#facc15', border: 'rgba(234,179,8,0.3)' },
    purple: { bg: 'rgba(139,92,246,0.12)', color: '#a78bfa', border: 'rgba(139,92,246,0.3)' },
    gray: { bg: 'rgba(100,116,139,0.12)', color: '#94a3b8', border: 'rgba(100,116,139,0.3)' },
  };
  const c = colors[color] || colors.blue;
  return (
    <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 99, fontSize: 11, fontWeight: 600, fontFamily: 'Space Mono,monospace', background: c.bg, color: c.color, border: `1px solid ${c.border}` }}>
      {children}
    </span>
  );
}

// ── ScoreRing ─────────────────────────────────────────────────────────────────
export function ScoreRing({ score, size = 72 }) {
  const r = (size - 10) / 2;
  const circ = 2 * Math.PI * r;
  const dash = circ * (score / 100);
  const color = score >= 80 ? '#22c55e' : score >= 60 ? '#facc15' : '#ef4444';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ flexShrink: 0 }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#1e2d47" strokeWidth={5} />
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={5}
        strokeDasharray={`${dash} ${circ - dash}`} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ transition: 'stroke-dasharray 0.6s ease' }} />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central"
        style={{ fill: color, fontSize: size * 0.22, fontWeight: 700, fontFamily: 'Space Mono,monospace' }}>
        {score}%
      </text>
    </svg>
  );
}

// ── Alert ─────────────────────────────────────────────────────────────────────
export function Alert({ type = 'info', children, onClose }) {
  const styles = {
    info: { bg: 'rgba(37,99,235,0.1)', border: 'rgba(37,99,235,0.3)', color: '#93c5fd' },
    success: { bg: 'rgba(34,197,94,0.1)', border: 'rgba(34,197,94,0.3)', color: '#86efac' },
    error: { bg: 'rgba(239,68,68,0.1)', border: 'rgba(239,68,68,0.3)', color: '#fca5a5' },
    warning: { bg: 'rgba(234,179,8,0.1)', border: 'rgba(234,179,8,0.3)', color: '#fde047' },
  };
  const s = styles[type];
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 8, padding: '12px 16px', color: s.color, fontSize: 14, display: 'flex', alignItems: 'flex-start', gap: 8 }}>
      <span style={{ flex: 1 }}>{children}</span>
      {onClose && <button onClick={onClose} style={{ background: 'none', border: 'none', color: s.color, cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>×</button>}
    </div>
  );
}

// ── Section Header ────────────────────────────────────────────────────────────
export function SectionTitle({ children, sub }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <h1 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 24, color: '#f1f5f9', margin: 0 }}>{children}</h1>
      {sub && <p style={{ color: '#475569', fontSize: 14, marginTop: 4 }}>{sub}</p>}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────────────────
export function StatCard({ label, value, icon: Icon, color = '#2563eb', sub }) {
  return (
    <Card style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div style={{ width: 48, height: 48, borderRadius: 12, background: `${color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={22} color={color} />
      </div>
      <div>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#f1f5f9', fontFamily: 'Space Mono,monospace' }}>{value}</div>
        <div style={{ fontSize: 13, color: '#475569' }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#334155', marginTop: 2 }}>{sub}</div>}
      </div>
    </Card>
  );
}

// ── Empty State ───────────────────────────────────────────────────────────────
export function Empty({ icon: Icon, title, sub, action }) {
  return (
    <div style={{ textAlign: 'center', padding: '60px 20px', color: '#334155' }}>
      {Icon && <Icon size={48} style={{ marginBottom: 16, opacity: 0.4 }} />}
      <p style={{ fontWeight: 700, fontSize: 16, color: '#475569', marginBottom: 8 }}>{title}</p>
      {sub && <p style={{ fontSize: 13, color: '#334155', maxWidth: 340, margin: '0 auto 16px' }}>{sub}</p>}
      {action}
    </div>
  );
}
