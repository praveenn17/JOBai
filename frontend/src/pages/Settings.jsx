import React, { useEffect, useState } from 'react';
import { User, Bell, Mail, Shield, Save, Lock, Trash2 } from 'lucide-react';
import api from '../services/api';
import useAuthStore from '../store/authStore';
import { Card, Btn, Input, SectionTitle, Alert, Badge } from '../components/UI';
import { useToast } from '../components/Toast';
import { useConfirm } from '../components/Confirm';
import { ENDPOINTS } from '../services/endpoints';

export default function Settings() {
  const { user, updateUser, logout } = useAuthStore();
  const toast   = useToast();
  const confirm = useConfirm();

  const [saving, setSaving]             = useState({ profile: false, prefs: false });
  const [changingPass, setChangingPass] = useState(false);
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [checking, setChecking]         = useState(false);       // ← was missing
  const [emailConfig, setEmailConfig]   = useState(null);        // ← was missing
  const [deletePassword, setDeletePassword] = useState('');

  const [profile, setProfile] = useState({ name: '', phone: '', location: '' });
  const [prefs, setPrefs]     = useState({
    preferred_roles: '', preferred_locations: '', min_salary: '',
    job_types: '', skills: '', daily_discovery_enabled: false, discovery_time: '16:00',
  });
  const [passwords, setPasswords] = useState({ current: '', new: '', confirm: '' });

  // Load profile + preferences on mount
  useEffect(() => {
    api.get(ENDPOINTS.auth.me).then(r => {
      const u = r.data.user;
      const p = r.data.preferences;
      setProfile({ name: u.name || '', phone: u.phone || '', location: u.location || '' });
      if (p) setPrefs({
        preferred_roles:         p.preferred_roles         || '',
        preferred_locations:     p.preferred_locations     || '',
        min_salary:              p.min_salary              || '',
        job_types:               p.job_types               || '',
        skills:                  p.skills                  || '',
        daily_discovery_enabled: !!p.daily_discovery_enabled,
        discovery_time:          p.discovery_time          || '16:00',
      });
    });
  }, []);

  const setP    = k => e => setProfile(p => ({ ...p, [k]: e.target.value }));
  const setPref = k => e => setPrefs(p => ({ ...p, [k]: e.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setPw   = k => e => setPasswords(p => ({ ...p, [k]: e.target.value }));

  const saveProfile = async () => {
    if (!profile.name.trim()) { toast.error('Name is required.'); return; }
    setSaving(s => ({ ...s, profile: true }));
    try {
      const r = await api.put(ENDPOINTS.auth.profile, profile);
      updateUser(r.data.user);   // ← sync auth store so navbar shows updated name instantly
      toast.success('Profile updated successfully.');
    } catch (err) {
      toast.error(err.message || 'Failed to update profile.');
    } finally {
      setSaving(s => ({ ...s, profile: false }));
    }
  };

  const savePrefs = async () => {
    setSaving(s => ({ ...s, prefs: true }));
    try {
      await api.put(ENDPOINTS.auth.preferences, prefs);
      toast.success('Job preferences saved.');
    } catch (err) {
      toast.error(err.message || 'Failed to save preferences.');
    } finally {
      setSaving(s => ({ ...s, prefs: false }));
    }
  };

  const changePassword = async () => {
    if (passwords.new !== passwords.confirm) { toast.error('New passwords do not match.'); return; }
    if (passwords.new.length < 8) { toast.error('Password must be at least 8 characters.'); return; }
    setChangingPass(true);
    try {
      await api.put(ENDPOINTS.auth.changePassword, {
        current_password: passwords.current,
        new_password: passwords.new,
      });
      toast.success('Password changed successfully.');
      setPasswords({ current: '', new: '', confirm: '' });
    } catch (err) {
      toast.error(err.message || 'Failed to change password.');
    } finally {
      setChangingPass(false);
    }
  };

  const deleteAccount = async () => {
    if (!deletePassword) { toast.error('Enter your password to confirm deletion.'); return; }
    const ok = await confirm(
      'This will permanently delete your account and ALL data. This cannot be undone.',
      { title: 'Delete Account', confirmLabel: 'Delete Forever', danger: true }
    );
    if (!ok) return;
    setDeletingAccount(true);
    try {
      await api.delete(ENDPOINTS.auth.deleteAccount, { data: { password: deletePassword } });
      toast.info('Account deleted.');
      setTimeout(() => { logout(); }, 1500);
    } catch (err) {
      toast.error(err.message || 'Failed to delete account.');
    } finally {
      setDeletingAccount(false);
    }
  };

  const checkEmail = async () => {
    setChecking(true);
    try {
      const r = await api.get(ENDPOINTS.email.verifyConfig);
      setEmailConfig(r.data);
    } catch {
      setEmailConfig({ valid: false, error: 'Could not verify email configuration.' });
    } finally {
      setChecking(false);
    }
  };

  const sectionTitle = (icon, label) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18 }}>
      {React.createElement(icon, { size: 16, color: '#60a5fa' })}
      <h2 style={{ fontSize: 15, fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, margin: 0 }}>{label}</h2>
    </div>
  );

  return (
    <div style={{ maxWidth: 700 }}>
      <SectionTitle sub="Manage your profile, job preferences, and platform settings.">Settings</SectionTitle>

      {/* ── Profile ─────────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 20 }}>
        {sectionTitle(User, 'Profile Information')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <Input label="Full Name"  value={profile.name}     onChange={setP('name')}     required />
          <Input label="Phone"      value={profile.phone}    onChange={setP('phone')}    placeholder="+91 9876543210" />
          <Input label="Location"   value={profile.location} onChange={setP('location')} placeholder="Kota, Rajasthan" style={{ gridColumn: '1/-1' }} />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <Btn loading={saving.profile} onClick={saveProfile}><Save size={14} /> Save Profile</Btn>
          <div style={{ fontSize: 12, color: '#334155' }}>
            Email: <span style={{ color: '#60a5fa' }}>{user?.email}</span> (cannot be changed)
          </div>
        </div>
      </Card>

      {/* ── Job Preferences ─────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 20 }}>
        {sectionTitle(Bell, 'Job Preferences')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
          <Input label="Preferred Roles"      value={prefs.preferred_roles}      onChange={setPref('preferred_roles')}      placeholder="Full Stack Developer, ML Engineer" />
          <Input label="Preferred Locations"  value={prefs.preferred_locations}  onChange={setPref('preferred_locations')}  placeholder="Kota, Bangalore, Remote" />
          <Input label="Job Types"            value={prefs.job_types}            onChange={setPref('job_types')}            placeholder="Internship, Full-time, Contract" />
          <Input label="Key Skills"           value={prefs.skills}               onChange={setPref('skills')}               placeholder="React, Python, Node.js" />
          <Input label="Minimum Salary (₹)"  type="number" value={prefs.min_salary} onChange={setPref('min_salary')}       placeholder="0 for any" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 13, color: '#94a3b8', fontWeight: 500 }}>Daily Discovery Time</label>
            <input
              type="time" value={prefs.discovery_time} onChange={setPref('discovery_time')}
              style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '10px 14px', color: '#e2e8f0', fontSize: 14, fontFamily: 'Syne,sans-serif', outline: 'none' }}
            />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: 16, fontSize: 14, color: '#94a3b8' }}>
          <input
            type="checkbox" checked={prefs.daily_discovery_enabled} onChange={setPref('daily_discovery_enabled')}
            style={{ width: 16, height: 16, accentColor: '#2563eb' }}
          />
          Enable daily AI job discovery (runs automatically at scheduled time)
        </label>
        <Btn loading={saving.prefs} onClick={savePrefs}><Save size={14} /> Save Preferences</Btn>
      </Card>

      {/* ── Email Configuration ─────────────────────────────────────────── */}
      <Card style={{ marginBottom: 20 }}>
        {sectionTitle(Mail, 'Email Configuration')}
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 14, lineHeight: 1.6 }}>
          Set <code style={{ background: '#111827', padding: '2px 6px', borderRadius: 4, color: '#60a5fa', fontSize: 11 }}>EMAIL_USER</code> and{' '}
          <code style={{ background: '#111827', padding: '2px 6px', borderRadius: 4, color: '#60a5fa', fontSize: 11 }}>EMAIL_PASS</code>{' '}
          in your backend <strong style={{ color: '#cbd5e1' }}>.env</strong> to enable email applications.
        </p>

        {emailConfig && (
          <Alert type={emailConfig.valid ? 'success' : 'error'} style={{ marginBottom: 14 }}>
            {emailConfig.valid
              ? '✓ Email is configured and working correctly.'
              : `✕ Email not working: ${emailConfig.error}`}
          </Alert>
        )}

        <div style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '12px 16px', marginBottom: 14, fontFamily: 'Space Mono,monospace', fontSize: 12, color: '#475569', lineHeight: 2 }}>
          <div><span style={{ color: '#334155' }}># backend/.env</span></div>
          <div><span style={{ color: '#60a5fa' }}>EMAIL_HOST</span>=smtp.gmail.com</div>
          <div><span style={{ color: '#60a5fa' }}>EMAIL_PORT</span>=587</div>
          <div><span style={{ color: '#60a5fa' }}>EMAIL_USER</span>=your.gmail@gmail.com</div>
          <div><span style={{ color: '#60a5fa' }}>EMAIL_PASS</span>=your_16char_app_password</div>
        </div>

        <Btn variant="ghost" loading={checking} onClick={checkEmail}><Mail size={14} /> Test Email Config</Btn>
      </Card>

      {/* ── Account Info ────────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 20 }}>
        {sectionTitle(Shield, 'Account Information')}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'Account ID',    value: user?.id ? user.id.slice(0, 8) + '…' : '—' },
            { label: 'Member Since',  value: user?.created_at ? new Date(user.created_at).toLocaleDateString() : '—' },
            { label: 'Email Status',  value: user?.email_verified ? 'Verified ✓' : 'Unverified' },
            { label: 'Platform',      value: 'JobAI v20' },
          ].map(({ label, value }) => (
            <div key={label} style={{ background: '#111827', border: '1px solid #1a2236', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 11, color: '#334155', marginBottom: 4, fontFamily: 'Space Mono,monospace', textTransform: 'uppercase' }}>{label}</div>
              <div style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>{value}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* ── Change Password ─────────────────────────────────────────────── */}
      <Card style={{ marginBottom: 20 }}>
        {sectionTitle(Lock, 'Change Password')}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
          <Input label="Current Password"      type="password" placeholder="••••••••" value={passwords.current} onChange={setPw('current')} />
          <Input label="New Password (min 8)"  type="password" placeholder="••••••••" value={passwords.new}     onChange={setPw('new')} />
          <Input label="Confirm New Password"  type="password" placeholder="••••••••" value={passwords.confirm} onChange={setPw('confirm')} />
          <Btn loading={changingPass} onClick={changePassword} style={{ alignSelf: 'flex-start' }}>
            <Save size={14} /> Change Password
          </Btn>
        </div>
      </Card>

      {/* ── Danger Zone ─────────────────────────────────────────────────── */}
      <Card style={{ border: '1px solid rgba(239,68,68,0.3)', background: 'rgba(239,68,68,0.03)' }}>
        {sectionTitle(Trash2, 'Danger Zone')}
        <p style={{ fontSize: 13, color: '#475569', marginBottom: 14 }}>
          Permanently delete your account and all data. This cannot be undone.
        </p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input
            type="password" placeholder="Enter password to confirm"
            value={deletePassword} onChange={e => setDeletePassword(e.target.value)}
            style={{ maxWidth: 280 }}
          />
          <Btn variant="danger" loading={deletingAccount} onClick={deleteAccount}>
            <Trash2 size={14} /> Delete Account
          </Btn>
        </div>
      </Card>
    </div>
  );
}
