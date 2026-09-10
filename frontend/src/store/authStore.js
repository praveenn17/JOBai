/**
 * JobAI Auth Store (Zustand)
 *
 * Handles: login, register, logout, token refresh-on-load, user update.
 * All API calls go through the centralized api.js client.
 */
import { create } from 'zustand';
import api from '../services/api';
import { ENDPOINTS } from '../services/endpoints';

const useAuthStore = create((set, get) => ({
  user:    null,
  token:   localStorage.getItem('jobai_token') || null,
  loading: false,
  error:   null,

  /** Called once on app mount — validates stored token & loads user profile. */
  init: async () => {
    const token = localStorage.getItem('jobai_token');
    if (!token) return;
    try {
      const res = await api.get(ENDPOINTS.auth.me);
      set({ user: res.data.user, token });
    } catch {
      localStorage.removeItem('jobai_token');
      set({ user: null, token: null });
    }
  },

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

  /** Call after settings save to keep store in sync without re-login. */
  updateUser: (patch) => set((s) => ({ user: s.user ? { ...s.user, ...patch } : s.user })),

  logout: () => {
    localStorage.removeItem('jobai_token');
    set({ user: null, token: null, error: null });
  },

  clearError: () => set({ error: null }),
}));

export default useAuthStore;
