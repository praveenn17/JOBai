/**
 * JobAI — Axios API client
 *
 * • baseURL auto-resolves: Vite proxy in dev (/api → localhost:5000),
 *   explicit VITE_API_URL in production builds.
 * • JWT token attached to every request automatically.
 * • 401 fires a global 'jobai:unauthorized' event → App.jsx logs user out.
 * • uploadFile() helper sets Content-Type multipart automatically.
 */
import axios from 'axios';

// In dev:  Vite proxy rewrites /api → http://localhost:5000/api (vite.config.js)
// In prod: set VITE_API_URL=https://yourbackend.com/api in frontend/.env
const BASE_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 120_000,  // 2 min — AI endpoints can take 30–60 s
  headers: { 'Content-Type': 'application/json' },
});

// ── Request interceptor: attach JWT ──────────────────────────────────────────
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('jobai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
}, (error) => Promise.reject(error));

// ── Response interceptor: handle auth errors globally ────────────────────────
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      localStorage.removeItem('jobai_token');
      window.dispatchEvent(new CustomEvent('jobai:unauthorized'));
    }
    // Normalize: always expose a user-readable message
    if (err.response?.data?.error) {
      err.message = err.response.data.error;
    }
    return Promise.reject(err);
  }
);

// ── Convenience helpers ───────────────────────────────────────────────────────

/**
 * Upload a file (resume, etc.).
 * @param {string}   url        - e.g. '/resume/upload'
 * @param {File}     file       - browser File object
 * @param {string}   fieldName  - FormData field name (default: 'resume')
 * @param {Function} onProgress - optional (loaded, total) callback
 */
export function uploadFile(url, file, fieldName = 'resume', onProgress) {
  const form = new FormData();
  form.append(fieldName, file);
  return api.post(url, form, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60_000,
    onUploadProgress: onProgress
      ? (e) => onProgress(e.loaded, e.total)
      : undefined,
  });
}

/**
 * Trigger a file download from an API endpoint.
 * @param {string} url      - e.g. '/applications/export'
 * @param {string} filename - e.g. 'applications.csv'
 */
export async function downloadFile(url, filename) {
  const res = await api.get(url, { responseType: 'blob' });
  const href = URL.createObjectURL(new Blob([res.data]));
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(href);
}

export default api;
