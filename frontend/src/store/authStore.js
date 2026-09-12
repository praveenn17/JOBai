/**
 * JobAI Auth Store (Zustand)
 *
 * Handles: login, register, logout, token refresh-on-load, user update.
 * NEW: Two-factor auth (signup/signin via password + OTP), profile completion tracking.
 * All API calls go through the centralized api.js client.
 */
import { create } from 'zustand';
import api from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

const useAuthStore = create((set, get) => ({
  user:                null,
  token:               localStorage.getItem('jobai_token') || null,
  loading:             false,
  error:               null,

  // ── New 2FA / onboarding state ────────────────────────────────────────────
  profileComplete:        false,
  completionPercentage:   0,
  isNewUser:              false,
  pendingEmail:           null,   // email awaiting OTP verification
  authStep:               'mode', // 'mode' | 'credentials' | 'otp' | 'done'
  authMode:               null,   // 'signup' | 'signin'

  // ─── Init ────────────────────────────────────────────────────────────────

  /** Called once on app mount — validates stored token & loads user + profile. */
  init: async () => {
    const token = localStorage.getItem('jobai_token');
    if (!token) return;
    try {
      const res = await api.get(ENDPOINTS.auth.me);
      set({ user: res.data.user, token });

      // Fetch profile completion status
      try {
        const profileRes = await api.get(ENDPOINTS.profile.get);
        const profile = profileRes.data?.profile;
        if (profile) {
          set({
            profileComplete:      profile.is_complete === 1,
            completionPercentage: profile.completion_percentage || 0,
          });
        }
      } catch (_) {
        // Profile may not exist for very old accounts — non-fatal
      }
    } catch {
      localStorage.removeItem('jobai_token');
      set({ user: null, token: null });
    }
  },

  // ─── Legacy single-step auth (kept for backward compatibility) ─────────────

  login: async (email, password) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(ENDPOINTS.auth.login, { email, password });
      const { token, user } = res.data;
      localStorage.setItem('jobai_token', token);
      set({ user, token, loading: false });
      return { success: true };
    } catch (err) {
      const msg = err.message || 'Login failed.';
      set({ error: msg, loading: false });
      return { success: false, error: msg };
    }
  },

  register: async (data) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(ENDPOINTS.auth.register, data);
      const { token, user } = res.data;
      localStorage.setItem('jobai_token', token);
      set({ user, token, loading: false });
      return { success: true };
    } catch (err) {
      const msg = err.message || 'Registration failed.';
      set({ error: msg, loading: false });
      return { success: false, error: msg };
    }
  },

  // ─── New 2FA actions ──────────────────────────────────────────────────────

  /** Step 1 of signup: validate + send OTP. Does NOT create the user yet. */
  signupStep1: async (name, email, password, phone) => {
    set({ loading: true, error: null });
    try {
      await api.post(ENDPOINTS.auth.signupStep1, { name, email, password, confirmPassword: password, phone });
      set({ pendingEmail: email, authStep: 'otp', authMode: 'signup', loading: false });
      return { success: true };
    } catch (err) {
      const msg = err.message || 'Failed to send OTP.';
      set({ error: msg, loading: false });
      return { success: false, error: msg };
    }
  },

  /** Step 2 of signup: verify OTP → user created → JWT stored. */
  signupStep2: async (email, otp) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(ENDPOINTS.auth.signupStep2, { email, otp });
      const { token, user, profile_complete, completion_percentage } = res.data;
      localStorage.setItem('jobai_token', token);
      set({
        user, token,
        profileComplete:      profile_complete || false,
        completionPercentage: completion_percentage || 0,
        isNewUser:            true,
        authStep:             'done',
        loading:              false,
      });
      return { success: true, isNewUser: true, profileComplete: profile_complete };
    } catch (err) {
      const msg = err.message || 'OTP verification failed.';
      set({ error: msg, loading: false });
      return { success: false, error: msg };
    }
  },

  /** Step 1 of sign-in: verify password → send OTP. Does NOT return JWT yet. */
  signinStep1: async (email, password) => {
    set({ loading: true, error: null });
    try {
      await api.post(ENDPOINTS.auth.signinStep1, { email, password });
      set({ pendingEmail: email, authStep: 'otp', authMode: 'signin', loading: false });
      return { success: true };
    } catch (err) {
      const msg = err.message || 'Sign-in failed.';
      set({ error: msg, loading: false });
      return { success: false, error: msg };
    }
  },

  /** Step 2 of sign-in: verify OTP → JWT stored. */
  signinStep2: async (email, otp) => {
    set({ loading: true, error: null });
    try {
      const res = await api.post(ENDPOINTS.auth.signinStep2, { email, otp });
      const { token, user, profile_complete, completion_percentage } = res.data;
      localStorage.setItem('jobai_token', token);
      set({
        user, token,
        profileComplete:      profile_complete || false,
        completionPercentage: completion_percentage || 0,
        isNewUser:            false,
        authStep:             'done',
        loading:              false,
      });
      return { success: true, profileComplete: profile_complete, completionPercentage: completion_percentage };
    } catch (err) {
      const msg = err.message || 'OTP verification failed.';
      set({ error: msg, loading: false });
      return { success: false, error: msg };
    }
  },

  /** Resend OTP for the current pending email. */
  resendOtp: async (email, purpose) => {
    set({ loading: true, error: null });
    try {
      await api.post(ENDPOINTS.auth.resendOtp, { email, purpose });
      set({ loading: false });
      return { success: true };
    } catch (err) {
      const msg = err.message || 'Failed to resend OTP.';
      set({ error: msg, loading: false });
      return { success: false, error: msg };
    }
  },

  /** Reset auth flow to the mode-selection screen. */
  resetAuthFlow: () => set({
    authStep: 'mode',
    authMode: null,
    pendingEmail: null,
    error: null,
    loading: false,
  }),

  // ─── Misc ─────────────────────────────────────────────────────────────────

  /** Call after settings save to keep store in sync without re-login. */
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),

  /** Update profile completion status (called after profile setup saves). */
  updateProfileComplete: (complete, pct) => set({
    profileComplete: complete,
    completionPercentage: pct,
  }),

  logout: () => {
    localStorage.removeItem('jobai_token');
    set({
      user: null, token: null, error: null,
      profileComplete: false, completionPercentage: 0,
      isNewUser: false, pendingEmail: null,
      authStep: 'mode', authMode: null,
    });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
