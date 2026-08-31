'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Flame, TrendingUp, Users, MessageCircle, Star, Globe, Plus } from 'lucide-react';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
};

export default function OpportunitiesPage() {
  const [opportunities, setOpportunities] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchOpportunities();
  }, []);

  const fetchOpportunities = async () => {
    try {
      const res = await fetch('/api/admin/opportunities', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setOpportunities(data.opportunities || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'admin-score-high';
    if (score >= 40) return 'admin-score-medium';
    return 'admin-score-low';
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Opportunités</h1>
          <p className="admin-page-subtitle">Idées générées par l'IA à partir des réponses</p>
        </div>
        <button className="neo-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', background: 'var(--primary-color)', color: 'white' }}>
          <Plus size={18} /> Créer manuellement
        </button>
      </div>

      <div className="admin-filter-bar neo-card">
        <button className="neo-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><Flame size={16} /> Meilleures</button>
        <button className="neo-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><TrendingUp size={16} /> Croissance</button>
        <button className="neo-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><Users size={16} /> Demande</button>
        <button className="neo-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><MessageCircle size={16} /> Contacts</button>
        <button className="neo-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem' }}><Globe size={16} /> International</button>
      </div>

      <div className="admin-opp-grid">
        {loading ? (
          [1,2,3,4,5,6].map(i => <div key={i} className="admin-opp-card neo-card admin-skeleton" style={{ height: '300px' }}></div>)
        ) : opportunities.length === 0 ? (
          <div className="admin-empty-state neo-card" style={{ gridColumn: '1 / -1' }}>
            <Star className="admin-empty-icon" />
            <h3>Aucune opportunité trouvée</h3>
            <p>Les opportunités seront générées automatiquement dès qu'il y aura assez de réponses similaires.</p>
          </div>
        ) : (
          opportunities.map((opp, index) => (
            <div key={opp.id} className="admin-opp-card neo-card">
              <div className="admin-opp-header">
                <span className="admin-badge admin-badge-info">{opp.category || 'Général'}</span>
                <span className="admin-opp-rank">#{index + 1}</span>
              </div>
              
              <h3 className="admin-opp-title">{opp.name || opp.problemSummary}</h3>
              
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 600 }}>
                  <span>Score de viabilité</span>
                  <span>{opp.score || 0}/100</span>
                </div>
                <div className="admin-score-gauge">
                  <div className={`admin-score-fill ${getScoreColor(opp.score || 0)}`} style={{ width: `${opp.score || 0}%` }}></div>
                </div>
              </div>

              <div className="admin-opp-stats">
                <div className="admin-opp-stat">
                  <span className="admin-opp-stat-label">Réponses</span>
                  <span className="admin-opp-stat-value">{opp.demandCount || 0}</span>
                </div>
                <div className="admin-opp-stat">
                  <span className="admin-opp-stat-label">Contacts</span>
                  <span className="admin-opp-stat-value">{opp.contactCount || 0}</span>
                </div>
              </div>

              <div className="admin-opp-actions">
                <span className={`admin-badge ${opp.status === 'validated' ? 'admin-badge-success' : 'admin-badge-neutral'}`}>
                  {opp.status || 'Nouveau'}
                </span>
                <Link href={`/admin/opportunities/${opp.id}`} className="neo-button" style={{ padding: '0.5rem 1rem', fontSize: '0.875rem' }}>
                  Voir détails
                </Link>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
