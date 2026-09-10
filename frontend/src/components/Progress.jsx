import React, { useState, useEffect } from 'react';

/**
 * AIThinking — animated progress bar with rotating status messages
 * Shows while waiting for AI responses
 */
export function AIThinking({ messages = [], active = true }) {
  const defaultMsgs = [
    'Reading job description…',
    'Comparing with your resume…',
    'Scoring skill matches…',
    'Checking experience requirements…',
    'Calculating match percentage…',
    'Generating analysis…',
  ];

  const allMsgs = messages.length ? messages : defaultMsgs;
  const [msgIdx, setMsgIdx] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!active) return;
    const msgTimer = setInterval(() => {
      setMsgIdx(i => (i + 1) % allMsgs.length);
    }, 1800);
    const progTimer = setInterval(() => {
      setProgress(p => Math.min(p + Math.random() * 8, 92));
    }, 400);
    return () => { clearInterval(msgTimer); clearInterval(progTimer); };
  }, [active, allMsgs.length]);

  useEffect(() => {
    if (!active) { setProgress(0); setMsgIdx(0); }
  }, [active]);

  if (!active) return null;

  return (
    <div style={{
      background: '#0d1117', border: '1px solid rgba(37,99,235,0.3)', borderRadius: 12,
      padding: '24px 28px', textAlign: 'center'
    }}>
      {/* Animated rings */}
      <div style={{ position: 'relative', width: 64, height: 64, margin: '0 auto 20px' }}>
        {[0, 1, 2].map(i => (
          <div key={i} style={{
            position: 'absolute', inset: i * 8, borderRadius: '50%',
            border: `2px solid rgba(37,99,235,${0.6 - i * 0.15})`,
            animation: `pulse${i} ${1.2 + i * 0.4}s ease-in-out infinite alternate`,
          }} />
        ))}
        <div style={{ position: 'absolute', inset: 24, borderRadius: '50%', background: '#2563eb', boxShadow: '0 0 16px #2563eb' }} />
        <style>{`
          @keyframes pulse0 { to { transform: scale(1.1); opacity: 0.4; } }
          @keyframes pulse1 { to { transform: scale(1.08); opacity: 0.3; } }
          @keyframes pulse2 { to { transform: scale(1.06); opacity: 0.2; } }
        `}</style>
      </div>

      {/* Status text */}
      <p style={{ fontFamily: 'Space Mono,monospace', fontSize: 13, color: '#60a5fa', marginBottom: 16, minHeight: 20 }}>
        {allMsgs[msgIdx]}
      </p>

      {/* Progress bar */}
      <div style={{ background: '#111827', borderRadius: 99, height: 6, overflow: 'hidden' }}>
        <div style={{
          height: '100%', borderRadius: 99, background: 'linear-gradient(90deg, #1d4ed8, #3b82f6)',
          width: `${progress}%`, transition: 'width 0.4s ease',
          boxShadow: '0 0 8px rgba(59,130,246,0.6)'
        }} />
      </div>
      <p style={{ fontSize: 11, color: '#334155', marginTop: 8, fontFamily: 'Space Mono,monospace' }}>
        {Math.round(progress)}% complete
      </p>
    </div>
  );
}

/**
 * StepProgress — show multi-step workflow progress
 */
export function StepProgress({ steps, current }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 0, marginBottom: 24 }}>
      {steps.map((step, i) => {
        const done = i < current;
        const active = i === current;
        const color = done ? '#22c55e' : active ? '#3b82f6' : '#1e2d47';
        return (
          <React.Fragment key={i}>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, flex: 1 }}>
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: done ? 'rgba(34,197,94,0.15)' : active ? 'rgba(59,130,246,0.15)' : '#111827',
                border: `2px solid ${color}`, display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 12, fontWeight: 700, color,
                boxShadow: active ? `0 0 12px rgba(59,130,246,0.3)` : 'none',
                transition: 'all 0.3s'
              }}>
                {done ? '✓' : i + 1}
              </div>
              <span style={{ fontSize: 11, color: active ? '#93c5fd' : done ? '#4ade80' : '#334155', textAlign: 'center', maxWidth: 80 }}>
                {step}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div style={{ height: 2, flex: 0.5, background: done ? '#22c55e' : '#1e2d47', marginBottom: 24, transition: 'background 0.3s' }} />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
