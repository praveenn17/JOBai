import React, { createContext, useContext, useState, useCallback } from 'react';
import { Btn } from './UI';

const ConfirmCtx = createContext(null);

export function ConfirmProvider({ children }) {
  const [state, setState] = useState(null); // { message, resolve }

  const confirm = useCallback((message, opts = {}) => {
    return new Promise((resolve) => {
      setState({ message, resolve, opts });
    });
  }, []);

  const handle = (val) => {
    state?.resolve(val);
    setState(null);
  };

  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      {state && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 9998,
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
        }}>
          <div style={{
            background: '#0d1117', border: '1px solid #1a2236', borderRadius: 14,
            padding: 28, maxWidth: 380, width: '100%',
            boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
            animation: 'popIn 0.2s ease'
          }}>
            <style>{`@keyframes popIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
            <h3 style={{ color: '#f1f5f9', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 16, marginBottom: 10 }}>
              {state.opts?.title || 'Confirm Action'}
            </h3>
            <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              {state.message}
            </p>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Btn variant="secondary" size="sm" onClick={() => handle(false)}>Cancel</Btn>
              <Btn variant={state.opts?.danger ? 'danger' : 'primary'} size="sm" onClick={() => handle(true)}>
                {state.opts?.confirmLabel || 'Confirm'}
              </Btn>
            </div>
          </div>
        </div>
      )}
    </ConfirmCtx.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmCtx);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
