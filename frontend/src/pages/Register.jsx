import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import useAuthStore from '../store/authStore';
import { Btn, Input, Alert } from '../components/UI';
import { Zap } from 'lucide-react';

export default function Register() {
  const [form, setForm] = useState({ name: '', email: '', password: '', phone: '', location: '' });
  const { register, loading, error, clearError } = useAuthStore();

  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    clearError();
    if (form.password.length < 8) return;
    await register(form);
  };

  const S = {
    page: { minHeight: '100vh', background: '#090c10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 },
    box: { width: '100%', maxWidth: 460, background: '#0d1117', border: '1px solid #1a2236', borderRadius: 16, padding: 40 },
    logo: { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 28, justifyContent: 'center' },
    logoIcon: { width: 42, height: 42, borderRadius: 10, background: 'linear-gradient(135deg,#2563eb,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center' },
    h1: { fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#f1f5f9', textAlign: 'center', marginBottom: 6 },
    sub: { color: '#475569', fontSize: 13, textAlign: 'center', marginBottom: 24 },
    form: { display: 'flex', flexDirection: 'column', gap: 14 },
    row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }
  };

  return (
    <div style={S.page}>
      <div style={S.box}>
        <div style={S.logo}>
          <div style={S.logoIcon}><Zap size={20} color="#fff" /></div>
          <span style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#fff' }}>JobAI</span>
        </div>
        <h1 style={S.h1}>Create your account</h1>
        <p style={S.sub}>Start applying smarter with AI</p>

        {error && <Alert type="error" onClose={clearError} style={{ marginBottom: 16 }}>{error}</Alert>}

        <form style={S.form} onSubmit={handleSubmit}>
          <Input label="Full Name" placeholder="Praveen Kumar" value={form.name} onChange={set('name')} required />
          <Input label="Email" type="email" placeholder="you@example.com" value={form.email} onChange={set('email')} required />
          <Input label="Password (min 8 chars)" type="password" placeholder="••••••••" value={form.password} onChange={set('password')} required />
          <div style={S.row}>
            <Input label="Phone (optional)" placeholder="+91 9876543210" value={form.phone} onChange={set('phone')} />
            <Input label="Location (optional)" placeholder="Kota, Rajasthan" value={form.location} onChange={set('location')} />
          </div>
          <Btn type="submit" loading={loading} size="lg" style={{ marginTop: 4, width: '100%' }}>Create Account</Btn>
        </form>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: '#475569' }}>
          Already have an account? <Link to="/login" style={{ color: '#60a5fa', textDecoration: 'none' }}>Sign in</Link>
        </p>
      </div>
    </div>
  );
}
