import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { Btn, Input, Alert } from '../components/UI';
import { Zap } from 'lucide-react';

export default function Login() {
  const [form, setForm] = useState({ email: '', password: '' });
  const { login, loading, error, clearError } = useAuthStore();

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    await login(form.email, form.password);
  };

  const S = {
    page: { minHeight: '100vh', background: '#090c10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box: { width: '100%', maxWidth: 420, background: '#0d1117', border: '1px solid #1a2236', borderRadius: 16, padding: 40 },
    logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, justifyContent: 'center' },
    logoIcon: { width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    h1: { fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#f1f5f9', textAlign: 'center', marginBottom: 6 },
    sub: { color: '#475569', fontSize: 13, textAlign: 'center', marginBottom: 28 },
    form: { display: 'flex', flexDirection: 'column', gap: 16 },
    link: { color: '#60a5fa', textDecoration: 'none', fontSize: 13 }
  };

  return (
    <div style={S.page}>
      <div style={S.box}>
        <div style={S.logo}>
          <div style={S.logoIcon}><Zap size={20} color="#fff" /></div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#fff' }}>JobAI</span>
        </div>
        <h1 style={S.h1}>Welcome back</h1>
        <p style={S.sub}>Sign in to your intelligent job platform</p>

        {error && <Alert type="error" onClose={clearError}>{error}</Alert>}

        <form style={S.form} onSubmit={handleSubmit}>
          <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} required />
          <Input label="Password" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} required />
          <Btn type="submit" loading={loading} size="lg" style={{ marginTop: 4, width: '100%' }}>Sign In</Btn>
          <div style={{ textAlign: 'right' }}>
            <Link to="/forgot-password" style={{ color: '#475569', textDecoration: 'none', fontSize: 12 }}>Forgot password?</Link>
          </div>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#475569' }}>
          No account? <Link to="/register" style={S.link}>Create one free</Link>
        </p>
      </div>
    </div>
  );
}
