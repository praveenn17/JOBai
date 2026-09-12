/**
 * Auth.jsx — Unified Sign In / Sign Up page with two-factor authentication
 *
 * State machine driven by authStore.authStep:
 *   'mode'        → Choose Sign In or Sign Up
 *   'credentials' → Enter credentials (different form per authMode)
 *   'otp'         → Enter 6-digit OTP from email
 *   'done'        → Auth complete, App.jsx handles redirect
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import useAuthStore from '../store/authStore';

// ─── Password Strength ────────────────────────────────────────────────────────

function getPasswordStrength(pwd) {
  if (!pwd) return { score: 0, label: '', color: '#334155' };
  let score = 0;
  if (pwd.length >= 8)  score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  const levels = [
    { label: 'Too weak',  color: '#ef4444' },
    { label: 'Weak',      color: '#f97316' },
    { label: 'Fair',      color: '#eab308' },
    { label: 'Good',      color: '#22c55e' },
    { label: 'Strong',    color: '#6366f1' },
    { label: 'Very strong', color: '#8b5cf6' },
  ];
  return { score, ...levels[Math.min(score, 5)] };
}

// ─── OTP Input Component ──────────────────────────────────────────────────────

function OtpInput({ value, onChange, disabled }) {
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);
  const refs = useRef([]);

  const setDigit = (idx, char) => {
    const d = [...digits];
    d[idx] = char.slice(-1);
    const newVal = d.join('');
    onChange(newVal);
    if (char && idx < 5) {
      setTimeout(() => refs.current[idx + 1]?.focus(), 10);
    }
  };

  const handleKey = (idx, e) => {
    if (e.key === 'Backspace' && !digits[idx] && idx > 0) {
      const d = [...digits];
      d[idx - 1] = '';
      onChange(d.join(''));
      setTimeout(() => refs.current[idx - 1]?.focus(), 10);
    }
    if (e.key === 'ArrowLeft' && idx > 0) refs.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < 5) refs.current[idx + 1]?.focus();
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    onChange(pasted.padEnd(6, '').slice(0, 6));
    const focusIdx = Math.min(pasted.length, 5);
    setTimeout(() => refs.current[focusIdx]?.focus(), 10);
  };

  return (
    <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => refs.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          disabled={disabled}
          onChange={e => setDigit(i, e.target.value.replace(/\D/g, ''))}
          onKeyDown={e => handleKey(i, e)}
          onPaste={handlePaste}
          onFocus={e => e.target.select()}
          style={{
            width: '48px', height: '60px',
            textAlign: 'center',
            fontSize: '24px', fontWeight: '700',
            background: d ? 'rgba(99,102,241,0.15)' : 'rgba(255,255,255,0.05)',
            border: `2px solid ${d ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
            borderRadius: '12px',
            color: '#f1f5f9',
            outline: 'none',
            transition: 'all 0.2s',
            cursor: disabled ? 'not-allowed' : 'text',
            letterSpacing: 0,
          }}
        />
      ))}
    </div>
  );
}

// ─── Countdown Timer ──────────────────────────────────────────────────────────

function Countdown({ seconds: initialSeconds, onExpire }) {
  const [secs, setSecs] = useState(initialSeconds);

  useEffect(() => {
    setSecs(initialSeconds);
    const iv = setInterval(() => setSecs(s => {
      if (s <= 1) { clearInterval(iv); onExpire?.(); return 0; }
      return s - 1;
    }), 1000);
    return () => clearInterval(iv);
  }, [initialSeconds]);

  const m = String(Math.floor(secs / 60)).padStart(2, '0');
  const s = String(secs % 60).padStart(2, '0');
  return <span style={{ color: secs < 60 ? '#f97316' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{m}:{s}</span>;
}

// ─── Main Auth Page ───────────────────────────────────────────────────────────

export default function Auth() {
  const {
    authStep, authMode, pendingEmail, loading, error,
    signupStep1, signupStep2, signinStep1, signinStep2, resendOtp,
    clearError,
    resetAuthFlow,
  } = useAuthStore();

  // Credentials form state
  const [form, setForm] = useState({ name: '', email: '', password: '', confirmPassword: '', phone: '' });
  const [showPass, setShowPass] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [formErr, setFormErr] = useState('');

  // OTP state
  const [otp, setOtp] = useState('');
  const [otpError, setOtpError] = useState('');
  const [otpExpired, setOtpExpired] = useState(false);
  const [otpKey, setOtpKey] = useState(0); // reset timer
  const [resendCooldown, setResendCooldown] = useState(60);
  const [resendMsg, setResendMsg] = useState('');
  const [verifying, setVerifying] = useState(false);
  const resendRef = useRef(null);

  // Resend cooldown ticker
  useEffect(() => {
    if (authStep !== 'otp') return;
    setResendCooldown(60);
    resendRef.current = setInterval(() => {
      setResendCooldown(c => { if (c <= 1) { clearInterval(resendRef.current); return 0; } return c - 1; });
    }, 1000);
    return () => clearInterval(resendRef.current);
  }, [authStep, otpKey]);

  const field = (k) => ({ value: form[k], onChange: e => { setForm(f => ({ ...f, [k]: e.target.value })); setFormErr(''); clearError(); } });
  const strength = getPasswordStrength(form.password);

  // ── Step handlers ────────────────────────────────────────────────────────

  const handleCredentials = async (e) => {
    e.preventDefault();
    setFormErr('');
    clearError();

    if (authMode === 'signup') {
      if (!form.name.trim()) return setFormErr('Full name is required.');
      if (!form.email.trim()) return setFormErr('Email is required.');
      if (form.password.length < 8) return setFormErr('Password must be at least 8 characters.');
      if (form.password !== form.confirmPassword) return setFormErr('Passwords do not match.');
      const res = await signupStep1(form.name.trim(), form.email.trim(), form.password, form.phone.trim() || undefined);
      if (!res.success) setFormErr(res.error);
    } else {
      if (!form.email.trim()) return setFormErr('Email is required.');
      if (!form.password) return setFormErr('Password is required.');
      const res = await signinStep1(form.email.trim(), form.password);
      if (!res.success) setFormErr(res.error);
    }
  };

  const handleOtp = useCallback(async (otpVal) => {
    const code = (otpVal ?? otp).replace(/\D/g, '');
    if (code.length !== 6) return;
    setOtpError('');
    setVerifying(true);
    try {
      let res;
      if (authMode === 'signup') {
        res = await signupStep2(pendingEmail, code);
      } else {
        res = await signinStep2(pendingEmail, code);
      }
      if (!res.success) {
        setOtpError(res.error);
        setOtp('');
      }
    } catch (_) {
      setOtpError('Verification failed. Please try again.');
    } finally {
      setVerifying(false);
    }
  }, [otp, authMode, pendingEmail, signupStep2, signinStep2]);

  const handleOtpChange = (val) => {
    setOtp(val);
    setOtpError('');
    if (val.replace(/\D/g, '').length === 6) {
      setTimeout(() => handleOtp(val), 100);
    }
  };

  const handleResend = async () => {
    if (resendCooldown > 0) return;
    setResendMsg('');
    const purpose = authMode === 'signup' ? 'signup_verify' : 'signin_verify';
    const res = await resendOtp(pendingEmail, purpose);
    if (res.success) {
      setResendMsg('✅ New code sent!');
      setOtp('');
      setOtpExpired(false);
      setOtpKey(k => k + 1);
    } else {
      setOtpError(res.error);
    }
  };

  // ── Styles ────────────────────────────────────────────────────────────────

  const css = `
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    * { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', sans-serif; }
    .auth-input {
      width: 100%; padding: 14px 16px; border-radius: 12px;
      background: rgba(255,255,255,0.05); border: 1.5px solid rgba(255,255,255,0.1);
      color: #f1f5f9; font-size: 15px; outline: none; transition: all 0.2s;
      font-family: inherit;
    }
    .auth-input:focus { border-color: #6366f1; background: rgba(99,102,241,0.08); }
    .auth-input::placeholder { color: #475569; }
    .auth-btn {
      width: 100%; padding: 15px; border-radius: 12px; border: none; cursor: pointer;
      font-size: 16px; font-weight: 600; font-family: inherit;
      background: linear-gradient(135deg, #6366f1, #8b5cf6);
      color: #fff; transition: all 0.25s; letter-spacing: 0.2px;
    }
    .auth-btn:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 8px 25px rgba(99,102,241,0.4); }
    .auth-btn:active:not(:disabled) { transform: translateY(0); }
    .auth-btn:disabled { opacity: 0.6; cursor: not-allowed; }
    .mode-btn {
      flex: 1; padding: 20px; border-radius: 16px; border: 2px solid rgba(255,255,255,0.08);
      background: rgba(255,255,255,0.03); color: #94a3b8; cursor: pointer;
      font-size: 15px; font-weight: 600; font-family: inherit; transition: all 0.25s;
      display: flex; flex-direction: column; align-items: center; gap: 8px;
    }
    .mode-btn:hover { border-color: #6366f1; background: rgba(99,102,241,0.08); color: #a5b4fc; transform: translateY(-2px); }
    .auth-link { color: #6366f1; cursor: pointer; text-decoration: none; }
    .auth-link:hover { color: #a5b4fc; text-decoration: underline; }
    .pass-wrap { position: relative; }
    .pass-toggle { position: absolute; right: 14px; top: 50%; transform: translateY(-50%); background: none; border: none; cursor: pointer; color: #64748b; font-size: 18px; padding: 0; }
    .pass-toggle:hover { color: #94a3b8; }
  `;

  const pageStyle = {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0f172a 0%, #1e1b4b 50%, #0f172a 100%)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: '24px', position: 'relative', overflow: 'hidden',
  };

  const cardStyle = {
    width: '100%', maxWidth: '460px',
    background: 'rgba(15,23,42,0.8)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(99,102,241,0.2)',
    borderRadius: '24px',
    padding: '48px 40px',
    boxShadow: '0 25px 60px rgba(0,0,0,0.5), 0 0 120px rgba(99,102,241,0.08)',
    position: 'relative', zIndex: 1,
  };

  const errorBox = (msg) => msg ? (
    <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', padding: '12px 14px', color: '#fca5a5', fontSize: '14px', marginBottom: '16px' }}>
      {msg}
    </div>
  ) : null;

  // ── Render: MODE ──────────────────────────────────────────────────────────
  if (authStep === 'mode') {
    return (
      <div style={pageStyle}>
        <style>{css}</style>
        {/* Decorative blobs */}
        <div style={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', top: '-200px', left: '-200px', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: '400px', height: '400px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(139,92,246,0.1) 0%, transparent 70%)', bottom: '-100px', right: '-100px', pointerEvents: 'none' }} />

        <div style={cardStyle}>
          {/* Logo */}
          <div style={{ textAlign: 'center', marginBottom: '40px' }}>
            <div style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '64px', height: '64px', borderRadius: '18px', background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', marginBottom: '16px', fontSize: '28px' }}>🚀</div>
            <h1 style={{ margin: '0 0 6px', color: '#f1f5f9', fontSize: '28px', fontWeight: '800', letterSpacing: '-0.5px' }}>JobAI</h1>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px' }}>Your AI-powered career companion</p>
          </div>

          <p style={{ textAlign: 'center', color: '#94a3b8', marginBottom: '28px', fontSize: '15px' }}>How would you like to continue?</p>

          <div style={{ display: 'flex', gap: '14px' }}>
            <button
              id="btn-signin"
              className="mode-btn"
              onClick={() => { clearError(); useAuthStore.setState({ authStep: 'credentials', authMode: 'signin' }); }}
            >
              <span style={{ fontSize: '28px' }}>🔐</span>
              <span>Sign In</span>
              <span style={{ fontSize: '12px', fontWeight: '400', color: '#475569' }}>Existing account</span>
            </button>
            <button
              id="btn-signup"
              className="mode-btn"
              onClick={() => { clearError(); useAuthStore.setState({ authStep: 'credentials', authMode: 'signup' }); }}
            >
              <span style={{ fontSize: '28px' }}>✨</span>
              <span>Sign Up</span>
              <span style={{ fontSize: '12px', fontWeight: '400', color: '#475569' }}>Create account</span>
            </button>
          </div>

          <p style={{ textAlign: 'center', color: '#475569', fontSize: '12px', marginTop: '28px', lineHeight: '1.6' }}>
            🔒 Two-factor authentication required on every sign in for your security
          </p>
        </div>
      </div>
    );
  }

  // ── Render: CREDENTIALS ───────────────────────────────────────────────────
  if (authStep === 'credentials') {
    const isSignup = authMode === 'signup';
    return (
      <div style={pageStyle}>
        <style>{css}</style>
        <div style={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', top: '-200px', left: '-200px', pointerEvents: 'none' }} />

        <div style={cardStyle}>
          {/* Back */}
          <button onClick={resetAuthFlow} style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', padding: '0 0 24px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}>
            ← Back
          </button>

          <h2 style={{ margin: '0 0 6px', color: '#f1f5f9', fontSize: '24px', fontWeight: '700' }}>
            {isSignup ? '✨ Create your account' : '👋 Welcome back'}
          </h2>
          <p style={{ margin: '0 0 28px', color: '#64748b', fontSize: '14px' }}>
            {isSignup
              ? 'After submitting, you\'ll receive an OTP to verify your email.'
              : 'Enter your credentials — an OTP will be sent to your email.'}
          </p>

          {errorBox(formErr || error)}

          <form onSubmit={handleCredentials} noValidate>
            {isSignup && (
              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px', fontWeight: '500' }}>Full Name *</label>
                <input id="signup-name" className="auth-input" type="text" placeholder="e.g. Priya Sharma" autoComplete="name" required {...field('name')} />
              </div>
            )}

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px', fontWeight: '500' }}>Email Address *</label>
              <input id="auth-email" className="auth-input" type="email" placeholder="you@example.com" autoComplete="email" required {...field('email')} />
            </div>

            <div style={{ marginBottom: isSignup ? '16px' : '24px' }}>
              <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px', fontWeight: '500' }}>Password *</label>
              <div className="pass-wrap">
                <input id="auth-password" className="auth-input" type={showPass ? 'text' : 'password'} placeholder="Min 8 characters" autoComplete={isSignup ? 'new-password' : 'current-password'} required style={{ paddingRight: '48px' }} {...field('password')} />
                <button type="button" className="pass-toggle" onClick={() => setShowPass(s => !s)}>{showPass ? '🙈' : '👁️'}</button>
              </div>
              {isSignup && form.password && (
                <div style={{ marginTop: '8px' }}>
                  <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
                    {[1,2,3,4,5].map(i => (
                      <div key={i} style={{ flex: 1, height: '3px', borderRadius: '4px', background: i <= strength.score ? strength.color : '#1e293b', transition: 'background 0.3s' }} />
                    ))}
                  </div>
                  <span style={{ fontSize: '12px', color: strength.color }}>{strength.label}</span>
                </div>
              )}
            </div>

            {isSignup && (
              <>
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px', fontWeight: '500' }}>Confirm Password *</label>
                  <div className="pass-wrap">
                    <input id="signup-confirm-password" className="auth-input" type={showConfirm ? 'text' : 'password'} placeholder="Re-enter password" autoComplete="new-password" required style={{ paddingRight: '48px' }} {...field('confirmPassword')} />
                    <button type="button" className="pass-toggle" onClick={() => setShowConfirm(s => !s)}>{showConfirm ? '🙈' : '👁️'}</button>
                  </div>
                  {form.confirmPassword && form.password !== form.confirmPassword && (
                    <p style={{ margin: '4px 0 0', color: '#ef4444', fontSize: '12px' }}>Passwords don't match</p>
                  )}
                </div>
                <div style={{ marginBottom: '24px' }}>
                  <label style={{ display: 'block', color: '#94a3b8', fontSize: '13px', marginBottom: '6px', fontWeight: '500' }}>Phone <span style={{ color: '#475569' }}>(optional)</span></label>
                  <input id="signup-phone" className="auth-input" type="tel" placeholder="+91 9876543210" autoComplete="tel" {...field('phone')} />
                </div>
              </>
            )}

            <button id="auth-submit-btn" type="submit" className="auth-btn" disabled={loading}>
              {loading ? '⏳ Sending OTP…' : isSignup ? 'Create Account & Send OTP →' : 'Sign In & Send OTP →'}
            </button>
          </form>

          <p style={{ textAlign: 'center', color: '#475569', fontSize: '14px', marginTop: '20px' }}>
            {isSignup ? 'Already have an account? ' : "Don't have an account? "}
            <button
              className="auth-link"
              style={{ background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '14px', padding: 0 }}
              onClick={() => {
                clearError();
                setFormErr('');
                setForm({ name: '', email: '', password: '', confirmPassword: '', phone: '' });
                useAuthStore.setState({ authStep: 'credentials', authMode: isSignup ? 'signin' : 'signup' });
              }}
            >
              {isSignup ? 'Sign In' : 'Sign Up'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ── Render: OTP ───────────────────────────────────────────────────────────
  if (authStep === 'otp') {
    return (
      <div style={pageStyle}>
        <style>{css}</style>
        <div style={{ position: 'absolute', width: '600px', height: '600px', borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.12) 0%, transparent 70%)', top: '-200px', left: '-200px', pointerEvents: 'none' }} />

        <div style={cardStyle}>
          {/* Back */}
          <button
            onClick={() => { setOtp(''); setOtpError(''); useAuthStore.setState({ authStep: 'credentials', pendingEmail: null }); }}
            style={{ background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '14px', padding: '0 0 24px', display: 'flex', alignItems: 'center', gap: '6px', fontFamily: 'inherit' }}
          >
            ← Back
          </button>

          <div style={{ textAlign: 'center', marginBottom: '32px' }}>
            <div style={{ fontSize: '48px', marginBottom: '16px' }}>📬</div>
            <h2 style={{ margin: '0 0 8px', color: '#f1f5f9', fontSize: '22px', fontWeight: '700' }}>Verify your email</h2>
            <p style={{ margin: 0, color: '#64748b', fontSize: '14px', lineHeight: '1.6' }}>
              Enter the 6-digit code sent to<br />
              <strong style={{ color: '#a5b4fc' }}>{pendingEmail}</strong>
            </p>
          </div>

          {errorBox(otpError || error)}

          {otpExpired && (
            <div style={{ background: 'rgba(234,179,8,0.1)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '10px', padding: '12px 14px', color: '#fde68a', fontSize: '14px', marginBottom: '16px', textAlign: 'center' }}>
              ⏰ Code expired. Click <strong>Resend OTP</strong> to get a new one.
            </div>
          )}

          <OtpInput value={otp} onChange={handleOtpChange} disabled={verifying || loading} />

          {/* Timer */}
          {!otpExpired && (
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: '13px', marginTop: '16px' }}>
              Code expires in <Countdown key={otpKey} seconds={600} onExpire={() => setOtpExpired(true)} />
            </p>
          )}

          <button
            id="otp-verify-btn"
            className="auth-btn"
            style={{ marginTop: '24px' }}
            disabled={otp.replace(/\D/g,'').length < 6 || verifying || loading || otpExpired}
            onClick={() => handleOtp(otp)}
          >
            {verifying || loading ? '⏳ Verifying…' : '✓ Verify Code'}
          </button>

          {/* Resend section */}
          <div style={{ textAlign: 'center', marginTop: '20px' }}>
            {resendMsg && <p style={{ color: '#4ade80', fontSize: '13px', marginBottom: '8px' }}>{resendMsg}</p>}
            {resendCooldown > 0 ? (
              <p style={{ color: '#475569', fontSize: '13px' }}>
                Resend in <span style={{ color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{resendCooldown}s</span>
              </p>
            ) : (
              <p style={{ color: '#475569', fontSize: '13px' }}>
                Didn't receive it?{' '}
                <button
                  id="otp-resend-btn"
                  className="auth-link"
                  style={{ background: 'none', border: 'none', fontFamily: 'inherit', fontSize: '13px', padding: 0, cursor: 'pointer' }}
                  onClick={handleResend}
                  disabled={loading}
                >
                  Resend OTP
                </button>
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // authStep === 'done' — App.jsx handles redirect
  return null;
}
