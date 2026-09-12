import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import useAuthStore from './store/authStore';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Confirm';
import { ErrorBoundary } from './components/ErrorBoundary';
import Loader from './components/Loader';
import Layout from './components/Layout';
// Legacy auth pages kept for backwards compatibility (deep-linked emails, etc.)
import Login from './pages/Login';
import Register from './pages/Register';
// New unified auth + onboarding
import Auth from './pages/Auth';
import ProfileSetup from './pages/ProfileSetup';
import { ForgotPassword, ResetPassword } from './pages/ForgotPassword';
import VerifyEmail from './pages/VerifyEmail';
const Dashboard      = lazy(() => import('./pages/Dashboard'));
const ResumeManager  = lazy(() => import('./pages/ResumeManager'));
const JobMatcher     = lazy(() => import('./pages/JobMatcher'));
const Applications   = lazy(() => import('./pages/Applications'));
const EmailApply     = lazy(() => import('./pages/EmailApply'));
const EmailAnalytics = lazy(() => import('./pages/EmailAnalytics'));
const Discover       = lazy(() => import('./pages/Discover'));
const Feedback       = lazy(() => import('./pages/Feedback'));
const Limits         = lazy(() => import('./pages/Limits'));
const Settings       = lazy(() => import('./pages/Settings'));
const NotFound       = lazy(() => import('./pages/NotFound'));
const ResumeTailor   = lazy(() => import('./pages/ResumeTailor'));
const EligibilityChecker = lazy(() => import('./pages/EligibilityChecker'));

/**
 * PrivateRoute — guards authenticated routes.
 *
 * Logic:
 *   - Not authenticated → /auth
 *   - Authenticated + profile incomplete + not already on /profile-setup → /profile-setup
 *   - Otherwise → render children
 */
function PrivateRoute({ children }) {
  const { token, profileComplete, authStep } = useAuthStore();
  const location = useLocation();

  if (!token) {
    return <Navigate to="/auth" replace />;
  }

  // If the auth flow is freshly complete (authStep === 'done') AND profile isn't done
  // AND we're not already on /profile-setup → redirect to onboarding
  if (!profileComplete && location.pathname !== '/profile-setup') {
    return <Navigate to="/profile-setup" replace />;
  }

  return children;
}

export default function App() {
  const { init, token, logout, authStep } = useAuthStore();
  const [ready, setReady] = React.useState(false);

  useEffect(() => {
    init().finally(() => setReady(true));
  }, []);

  // Handle token expiry / 401 from any API call
  useEffect(() => {
    const handler = () => { logout(); };
    window.addEventListener('jobai:unauthorized', handler);
    return () => window.removeEventListener('jobai:unauthorized', handler);
  }, [logout]);

  if (!ready) return <Loader fullScreen />;

  return (
    <ErrorBoundary>
      <ToastProvider>
        <ConfirmProvider>
          <BrowserRouter>
            <Suspense fallback={<Loader fullScreen />}>
            <Routes>
              {/* ── Auth routes (public) ─────────────────────────────────── */}
              {/* New unified 2FA auth page */}
              <Route path="/auth" element={
                token ? <Navigate to="/" replace /> :
                authStep === 'done' ? <Navigate to="/" replace /> :
                <Auth />
              } />

              {/* Legacy routes kept so existing deep-links / emails don't break */}
              <Route path="/login"    element={token ? <Navigate to="/" replace /> : <Login />} />
              <Route path="/register" element={token ? <Navigate to="/" replace /> : <Register />} />

              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password"  element={<ResetPassword />} />
              <Route path="/verify-email"    element={<VerifyEmail />} />

              {/* ── Profile setup (requires auth but NOT profileComplete) ── */}
              <Route path="/profile-setup" element={
                token ? <ProfileSetup /> : <Navigate to="/auth" replace />
              } />

              {/* ── Authenticated app routes ─────────────────────────────── */}
              <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="resume"          element={<ResumeManager />} />
                <Route path="match"           element={<JobMatcher />} />
                <Route path="applications"    element={<Applications />} />
                <Route path="email"           element={<EmailApply />} />
                <Route path="email-analytics" element={<EmailAnalytics />} />
                <Route path="discover"        element={<Discover />} />
                <Route path="feedback"        element={<Feedback />} />
                <Route path="limits"          element={<Limits />} />
                <Route path="settings"        element={<Settings />} />
                <Route path="resume-tailor"   element={<ResumeTailor />} />
                <Route path="eligibility"     element={<EligibilityChecker />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
            </Suspense>
          </BrowserRouter>
        </ConfirmProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
