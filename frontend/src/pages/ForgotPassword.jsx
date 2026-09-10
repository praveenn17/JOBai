import React, { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { ENDPOINTS, buildUrl } from '../services/endpoints';
import { Btn, Input, Alert } from '../components/UI';
import { Zap } from 'lucide-react';

const S = {
  page: { minHeight: '100vh', background: '#090c10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
  box: { width: '100%', maxWidth: 420, background: '#0d1117', border: '1px solid #1a2236', borderRadius: 16, padding: 40 },
  logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, justifyContent: 'center' },
  logoIcon: { width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
  h1: { fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#f1f5f9', textAlign: 'center', marginBottom: 6 },
  sub: { color: '#475569', fontSize: 13, textAlign: 'center', marginBottom: 24 },
  link: { color: '#60a5fa', textDecoration: 'none', fontSize: 13 }
};

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setError('');
    try {
      await api.post(ENDPOINTS.auth.forgotPassword, { email });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Request failed.');
    } finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.box}>
        <div style={S.logo}>
          <div style={S.logoIcon}><Zap size={20} color="#fff" /></div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#fff' }}>JobAI</span>
        </div>
        <h1 style={S.h1}>Forgot Password</h1>
        <p style={S.sub}>Enter your email and we'll send a reset link.</p>

        {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}
        {success ? (
          <Alert type="success">Reset link sent! Check your email. (In dev mode, check server logs for token.)</Alert>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="Email" type="email" placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} required />
            <Btn type="submit" loading={loading} size="lg" style={{ width: '100%' }}>Send Reset Link</Btn>
          </form>
        )}
        <p style={{ textAlign: 'center', marginTop: 20, fontSize: 13, color: '#475569' }}>
          <Link to="/login" style={S.link}>← Back to Login</Link>
        </p>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) { setError('Passwords do not match.'); return; }
    setLoading(true); setError('');
    try {
      await api.post(ENDPOINTS.auth.resetPassword, { token, new_password: password });
      setSuccess(true);
    } catch (err) {
      setError(err.message || 'Reset failed. Token may be expired.');
    } finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <div style={S.box}>
        <div style={S.logo}>
          <div style={S.logoIcon}><Zap size={20} color="#fff" /></div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#fff' }}>JobAI</span>
        </div>
        <h1 style={S.h1}>Reset Password</h1>
        <p style={S.sub}>Enter your new password below.</p>

        {error && <Alert type="error" style={{ marginBottom: 16 }}>{error}</Alert>}
        {success ? (
          <div>
            <Alert type="success" style={{ marginBottom: 16 }}>Password reset! You can now log in.</Alert>
            <Link to="/login"><Btn style={{ width: '100%' }}>Go to Login</Btn></Link>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Input label="New Password (min 8 chars)" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            <Input label="Confirm Password" type="password" placeholder="••••••••" value={confirm} onChange={e => setConfirm(e.target.value)} required />
            <Btn type="submit" loading={loading} size="lg" style={{ width: '100%' }}>Reset Password</Btn>
          </form>
        )}
      </div>
    </div>
  );
}
