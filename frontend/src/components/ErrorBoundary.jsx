import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary caught:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ minHeight: '100vh', background: '#090c10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ maxWidth: 480, textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#f1f5f9', marginBottom: 10 }}>
              Something went wrong
            </h1>
            <p style={{ color: '#475569', fontSize: 14, marginBottom: 24, lineHeight: 1.6 }}>
              An unexpected error occurred. Please refresh the page. If the problem persists, try clearing your browser cache.
            </p>
            <div style={{ background: '#111827', border: '1px solid #1e2d47', borderRadius: 8, padding: '12px 16px', marginBottom: 24, textAlign: 'left' }}>
              <code style={{ fontFamily: 'Space Mono,monospace', fontSize: 11, color: '#ef4444' }}>
                {this.state.error?.message || 'Unknown error'}
              </code>
            </div>
            <button
              onClick={() => window.location.reload()}
              style={{ background: 'linear-gradient(135deg,#2563eb,#1d4ed8)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontFamily: 'Syne,sans-serif', fontWeight: 700, fontSize: 14, cursor: 'pointer' }}
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
