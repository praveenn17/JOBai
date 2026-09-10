import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Btn } from '../components/UI';

export default function NotFound() {
  const navigate = useNavigate();
  return (
    <div style={{ minHeight: '100vh', background: '#090c10', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 400 }}>
        <div style={{ fontFamily: 'Space Mono,monospace', fontSize: 96, fontWeight: 700, color: '#1a2236', lineHeight: 1, marginBottom: 24 }}>404</div>
        <h1 style={{ fontFamily: 'Syne,sans-serif', fontWeight: 800, fontSize: 22, color: '#f1f5f9', marginBottom: 10 }}>Page not found</h1>
        <p style={{ color: '#475569', fontSize: 14, marginBottom: 28 }}>The page you're looking for doesn't exist or was moved.</p>
        <Btn onClick={() => navigate('/')}>← Back to Dashboard</Btn>
      </div>
    </div>
  );
}
