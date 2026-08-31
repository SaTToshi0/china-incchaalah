'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, CheckCircle, Package, BrainCircuit } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
};

export default function OpportunityDetail() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  
  const [opp, setOpp] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDetail() {
      try {
        const res = await fetch(`/api/admin/opportunities/${id}`, { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setOpp(data.opportunity);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchDetail();
  }, [id]);

  if (loading) return <div className="admin-skeleton" style={{ height: '100vh' }}></div>;
  if (!opp) return <div>Opportunité non trouvée</div>;

  const getScoreColor = (score: number) => {
    if (score >= 70) return 'admin-score-high';
    if (score >= 40) return 'admin-score-medium';
    return 'admin-score-low';
  };

  const mockTimeline = [
    { date: '12/01', demand: 2 }, { date: '19/01', demand: 5 }, { date: '26/01', demand: 12 }, { date: '02/02', demand: 18 }
  ];

  return (
    <div>
      <button onClick={() => router.back()} className="neo-button" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem', padding: '0.5rem 1rem' }}>
        <ArrowLeft size={18} /> Retour
      </button>

      <div className="neo-card" style={{ padding: '2rem', marginBottom: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.5rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '0.5rem' }}>
              <span className="admin-badge admin-badge-info">{opp.category || 'Général'}</span>
              <span className={`admin-badge ${opp.status === 'validated' ? 'admin-badge-success' : 'admin-badge-neutral'}`}>{opp.status || 'Nouveau'}</span>
            </div>
            <h1 style={{ fontSize: '2rem', fontWeight: 800, margin: 0 }}>{opp.name || 'Opportunité sans nom'}</h1>
          </div>
          <div style={{ width: '200px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem', fontWeight: 600 }}>
              <span>Score IA</span>
              <span>{opp.score || 0}/100</span>
            </div>
            <div className="admin-score-gauge" style={{ height: '12px' }}>
              <div className={`admin-score-fill ${getScoreColor(opp.score || 0)}`} style={{ width: `${opp.score || 0}%` }}></div>
            </div>
            <p style={{ fontSize: '0.65rem', color: 'var(--text-light)', marginTop: '0.5rem', textAlign: 'center' }}>
              Score indicatif basé uniquement sur les données de notre sondage. Il ne garantit pas la réussite commerciale du produit.
            </p>
          </div>
        </div>
      </div>

      <div className="admin-detail-grid">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="neo-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><BrainCircuit size={20} /> Analyse IA</h3>
            <div style={{ background: 'rgba(0,0,0,0.02)', padding: '1rem', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.05)' }}>
              <h4 style={{ marginBottom: '0.5rem', color: 'var(--primary-color)' }}>Le Problème</h4>
              <p style={{ marginBottom: '1rem', fontSize: '0.9rem', lineHeight: 1.5 }}>{opp.problemSummary || 'Aucun résumé du problème.'}</p>
              <h4 style={{ marginBottom: '0.5rem', color: '#10b981' }}>La Solution suggérée</h4>
              <p style={{ fontSize: '0.9rem', lineHeight: 1.5 }}>{opp.productSummary || 'Aucune suggestion de produit.'}</p>
            </div>
          </div>

          <div className="neo-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1.5rem' }}>Évolution de la demande</h3>
            <div style={{ height: '250px' }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={mockTimeline}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="demand" stroke="var(--primary-color)" strokeWidth={3} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
          <div className="neo-card" style={{ padding: '1.5rem' }}>
            <h3 style={{ marginBottom: '1rem' }}>Statistiques</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <span style={{ color: 'var(--text-light)' }}>Signalements</span>
                <span style={{ fontWeight: 600 }}>{opp.demandCount || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <span style={{ color: 'var(--text-light)' }}>Contacts récoltés</span>
                <span style={{ fontWeight: 600 }}>{opp.contactCount || 0}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', paddingBottom: '0.5rem', borderBottom: '1px solid rgba(0,0,0,0.05)' }}>
                <span style={{ color: 'var(--text-light)' }}>Intention d'achat</span>
                <span style={{ fontWeight: 600 }}>{Math.round((opp.contactCount || 0) / Math.max(opp.demandCount || 1, 1) * 100)}%</span>
              </div>
            </div>
          </div>

          <div className="neo-card" style={{ padding: '1.5rem', background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.05) 0%, rgba(59, 130, 246, 0.05) 100%)' }}>
            <h3 style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}><Package size={20} /> Action</h3>
            <p style={{ fontSize: '0.875rem', marginBottom: '1.5rem', color: 'var(--text-light)' }}>
              Prêt à valider cette idée ? Créez un test produit pour sourcer et tester la demande réelle.
            </p>
            <button className="neo-button" style={{ width: '100%', background: 'var(--primary-color)', color: 'white', padding: '1rem', fontWeight: 600 }}>
              Commencer un test produit
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
