import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Alert, Btn } from '../components/UI';
import { Zap, CheckCircle, XCircle } from 'lucide-react';

const S = {
  page: { minHeight: '100vh', background: '#090c10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  box:  { width: '100%', maxWidth: 420, background: '#0d1117', border: '1px solid #1a2236', borderRadius: 16, padding: 40, textAlign: 'center' },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, justifyContent: 'center' },
};

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const [status, setStatus] = useState('loading'); // loading | success | error
  const [message, setMessage] = useState('');
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) { setStatus('error'); setMessage('No verification token found in URL.'); return; }
    api.get(ENDPOINTS.auth.verifyEmail, { params: { token } })
      .then(r => { setStatus('success'); setMessage(r.data.message); })
      .catch(err => { setStatus('error'); setMessage(err.message || 'Verification failed.'); });
  }, [token]);

  const resend = async () => {
    setResending(true);
    try {
      await api.post(ENDPOINTS.auth.resendVerification);
      setResent(true);
    } catch (err) {
      setMessage(err.message || 'Failed to resend.');
    } finally { setResending(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.box}>
        <div style={S.logo}>
          <div style={{ width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={20} color="#fff" />
          </div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#fff' }}>JobAI</span>
        </div>

        {status === 'loading' && (
          <p style={{ color: '#94a3b8', fontSize: 14 }}>Verifying your email…</p>
        )}

        {status === 'success' && (
          <>
            <CheckCircle size={48} color="#22c55e" style={{ marginBottom: 16 }} />
            <h1 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#f1f5f9', marginBottom: 12 }}>Email Verified!</h1>
            <p style={{ color: '#475569', fontSize: 14, marginBottom: 24 }}>{message}</p>
            <Link to="/login"><Btn style={{ width: '100%' }}>Continue to Login</Btn></Link>
          </>
        )}

        {status === 'error' && (
          <>
            <XCircle size={48} color="#ef4444" style={{ marginBottom: 16 }} />
            <h1 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#f1f5f9', marginBottom: 12 }}>Verification Failed</h1>
            <Alert type="error" style={{ marginBottom: 20, textAlign: 'left' }}>{message}</Alert>
            {!resent ? (
              <Btn variant="ghost" loading={resending} onClick={resend} style={{ width: '100%', marginBottom: 12 }}>
                Resend Verification Email
              </Btn>
            ) : (
              <Alert type="success" style={{ marginBottom: 12 }}>Verification email sent! Check your inbox.</Alert>
            )}
            <Link to="/login" style={{ color: '#60a5fa', fontSize: 13, textDecoration: 'none' }}>← Back to Login</Link>
          </>
        )}
      </div>
    </div>
  );
}
