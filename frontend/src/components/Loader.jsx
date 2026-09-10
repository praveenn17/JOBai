import React from 'react';

export default function Loader({ fullScreen, size = 32, text = '' }) {
  const spinner = (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <svg width={size} height={size} viewBox="0 0 50 50" style={{ animation: 'spin 0.8s linear infinite' }}>
        <circle cx="25" cy="25" r="20" fill="none" stroke="#3b82f6" strokeWidth="4" strokeDasharray="80 20" strokeLinecap="round" />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </svg>
      {text && <p style={{ color: '#64748b', fontSize: 14, fontFamily: 'Space Mono, monospace' }}>{text}</p>}
    </div>
  );

  if (fullScreen) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: '#090c10', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {spinner}
      </div>
    );
  }

  return spinner;
}
