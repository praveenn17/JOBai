import React, { createContext, useContext, useState, useCallback } from 'react';

const ToastCtx = createContext(null);

let toastId = 0;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const add = useCallback((message, type = 'info', duration = 4000) => {
    const id = ++toastId;
    setToasts(t => [...t, { id, message, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), duration);
    return id;
  }, []);

  const remove = useCallback((id) => setToasts(t => t.filter(x => x.id !== id)), []);

  const toast = {
    success: (msg, d) => add(msg, 'success', d),
    error: (msg, d) => add(msg, 'error', d || 6000),
    info: (msg, d) => add(msg, 'info', d),
    warning: (msg, d) => add(msg, 'warning', d),
  };

  const colors = {
    success: { bg: '#052e16', border: '#166534', bar: '#22c55e', icon: '✓' },
    error:   { bg: '#2d0a0a', border: '#7f1d1d', bar: '#ef4444', icon: '✕' },
    info:    { bg: '#0c1a3a', border: '#1e3a8a', bar: '#3b82f6', icon: 'i' },
    warning: { bg: '#2d1f00', border: '#78350f', bar: '#f59e0b', icon: '!' },
  };

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {/* Toast container */}
      <div style={{ position: 'fixed', bottom: 24, right: 24, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 380 }}>
        {toasts.map(({ id, message, type }) => {
          const c = colors[type] || colors.info;
          return (
            <div key={id} style={{
              background: c.bg, border: `1px solid ${c.border}`, borderLeft: `3px solid ${c.bar}`,
              borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'flex-start', gap: 10,
              boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
              animation: 'slideIn 0.25s ease',
            }}>
              <style>{`@keyframes slideIn { from { transform: translateX(120%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }`}</style>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: c.bar, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{c.icon}</span>
              <span style={{ fontSize: 13, color: '#e2e8f0', flex: 1, lineHeight: 1.5, fontFamily: 'Syne,sans-serif' }}>{message}</span>
              <button onClick={() => remove(id)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: 16, lineHeight: 1, flexShrink: 0, padding: 0 }}>×</button>
            </div>
          );
        })}
      </div>
    </ToastCtx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastCtx);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
