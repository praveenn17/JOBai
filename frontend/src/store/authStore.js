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

  /** True once init() has fully resolved (user + profile fetched or no token). */
  initialized:            false,

  // ─── Init ────────────────────────────────────────────────────────────────

  /**
   * Called once on app mount — validates stored JWT, loads user + profile.
   * Bug 1 fix: wait for BOTH /auth/me AND /api/profile before calling set()
   * so PrivateRoute never sees token=set but profileComplete=false.
   */
  init: async () => {
    const token = localStorage.getItem('jobai_token');
    if (!token) {
      set({ initialized: true });
      return;
    }
    try {
      // 1. Validate token + get user
      const meRes = await api.get(ENDPOINTS.auth.me);
      const user = meRes.data.user;

      // 2. Fetch profile to get is_complete and completion_percentage
      let profileComplete = false;
      let completionPercentage = 0;
      try {
        const profileRes = await api.get(ENDPOINTS.profile.get);
        // Backend GET /api/profile returns { profile, projects, experience, certifications, achievements }
        const profile = profileRes.data?.profile;
        if (profile) {
          profileComplete      = profile.is_complete === 1;
          completionPercentage = profile.completion_percentage || 0;
        }
      } catch (_) {
        // Profile may not exist for very old accounts — non-fatal.
        // profileComplete stays false, user will be sent to /profile-setup.
      }

      // 3. Single set() so React never sees an intermediate state where
      //    token is set but profileComplete is still false.
      set({ user, token, profileComplete, completionPercentage, initialized: true });
    } catch {
      localStorage.removeItem('jobai_token');
      set({ user: null, token: null, initialized: true });
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
      // Bug 1C fix: use strict boolean so integer 1 is handled correctly
      const isComplete = profile_complete === true || profile_complete === 1;
      set({
        user, token,
        profileComplete:      isComplete,
        completionPercentage: completion_percentage || 0,
        isNewUser:            true,
        authStep:             'done',
        initialized:          true,  // bypass init() guard in PrivateRoute
        loading:              false,
      });
      return { success: true, isNewUser: true, profileComplete: isComplete };
    } catch (err) {
      const msg = err.message || 'OTP verification failed.';
      set({ error: msg, loading: false });
      return { success: false, error: msg };
    }
  },

  /**
   * Step 1 of sign-in: verify password → send OTP email.
   * Bug 4 fix: must ONLY set authStep='otp'. Must NOT set token, user,
   * or profileComplete. Uses a single set() call to avoid partial renders.
   */
  signinStep1: async (email, password) => {
    try {
      set({ loading: true, error: null });
      await api.post(ENDPOINTS.auth.signinStep1, { email, password });
      // Single set() — sets authStep to 'otp' so Auth.jsx renders OTP screen.
      // Does NOT set token, user, or profileComplete.
      set({
        pendingEmail: email,
        authStep:     'otp',
        authMode:     'signin',
        loading:      false,
        error:        null,
      });
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
      // Bug 1C fix: use strict boolean — profile_complete may be true or 1
      const isComplete = profile_complete === true || profile_complete === 1;
      set({
        user,
        token,
        profileComplete:      isComplete,
        completionPercentage: completion_percentage || 0,
        isNewUser:            false,
        authStep:             'done',
        initialized:          true,  // bypass init() guard in PrivateRoute
        loading:              false,
      });
      return { success: true, profileComplete: isComplete, completionPercentage: completion_percentage };
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
