'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Lock, Mail, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/admin/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('auth_token', data.token);
        router.push('/admin');
      } else {
        setError('Email ou mot de passe incorrect');
      }
    } catch (err) {
      setError('Erreur de connexion');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="admin-login-container">
      <div className="admin-login-card neo-card">
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <div className="admin-kpi-icon" style={{ display: 'inline-block', marginBottom: '1rem' }}>
            <Lock size={32} />
          </div>
          <h1 className="admin-page-title">Administration</h1>
          <p className="admin-page-subtitle">Connectez-vous pour gérer la plateforme</p>
        </div>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {error && (
            <div style={{ padding: '0.75rem', background: 'rgba(239, 68, 68, 0.1)', color: '#dc2626', borderRadius: '12px', textAlign: 'center', fontSize: '0.875rem' }}>
              {error}
            </div>
          )}

          <div style={{ position: 'relative' }}>
            <Mail size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input
              type="email"
              placeholder="Adresse email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', border: 'none', background: 'var(--bg-color)', boxShadow: 'var(--shadow-inset)', borderRadius: '12px', fontFamily: 'inherit' }}
            />
          </div>

          <div style={{ position: 'relative' }}>
            <Lock size={20} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-light)' }} />
            <input
              type="password"
              placeholder="Mot de passe"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={{ width: '100%', padding: '1rem 1rem 1rem 3rem', border: 'none', background: 'var(--bg-color)', boxShadow: 'var(--shadow-inset)', borderRadius: '12px', fontFamily: 'inherit' }}
            />
          </div>

          <button type="submit" className="neo-button" disabled={loading} style={{ padding: '1rem', fontWeight: 600, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem', background: 'var(--primary-color)', color: 'white' }}>
            {loading ? <Loader2 className="animate-spin" size={20} /> : 'Se connecter'}
          </button>
        </form>
      </div>
    </div>
  );
}
