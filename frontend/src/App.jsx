import React, { useEffect, Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import useAuthStore from './store/authStore';
import { ToastProvider } from './components/Toast';
import { ConfirmProvider } from './components/Confirm';
import { ErrorBoundary } from './components/ErrorBoundary';
import Loader from './components/Loader';
import Layout from './components/Layout';
import Login from './pages/Login';
import Register from './pages/Register';
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


function PrivateRoute({ children }) {
  const { token } = useAuthStore();
  return token ? children : <Navigate to="/login" replace />;
}

export default function App() {
  const { init, token, logout } = useAuthStore();
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
              <Route path="/login" element={token ? <Navigate to="/" replace /> : <Login />} />
              <Route path="/register" element={token ? <Navigate to="/" replace /> : <Register />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/verify-email" element={<VerifyEmail />} />
              <Route path="/" element={<PrivateRoute><Layout /></PrivateRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="resume" element={<ResumeManager />} />
                <Route path="match" element={<JobMatcher />} />
                <Route path="applications" element={<Applications />} />
                <Route path="email" element={<EmailApply />} />
                <Route path="email-analytics" element={<EmailAnalytics />} />
                <Route path="discover" element={<Discover />} />
                <Route path="feedback" element={<Feedback />} />
                <Route path="limits" element={<Limits />} />
                <Route path="settings" element={<Settings />} />
                <Route path="resume-tailor" element={<ResumeTailor />} />
                <Route path="eligibility" element={<EligibilityChecker />} />
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
