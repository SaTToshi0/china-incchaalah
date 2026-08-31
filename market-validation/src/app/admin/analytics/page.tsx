'use client';

import React, { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend } from 'recharts';
import { COLORS } from '../page';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
};

export default function AnalyticsPage() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        const res = await fetch('/api/admin/analytics', { headers: getAuthHeaders() });
        if (res.ok) {
          const json = await res.json();
          setData(json);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchAnalytics();
  }, []);

  if (loading) return <div className="admin-skeleton" style={{ height: '100vh' }}></div>;

  const catData = data?.categories || [{ name: 'Tech', value: 40 }, { name: 'Santé', value: 30 }, { name: 'Autre', value: 30 }];
  const countryData = data?.countries || [{ name: 'France', value: 120 }, { name: 'Belgique', value: 40 }, { name: 'Suisse', value: 20 }];
  const evolution = data?.evolution || [{ date: '1', count: 5 }, { date: '2', count: 10 }, { date: '3', count: 15 }];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Analyses Avancées</h1>
          <p className="admin-page-subtitle">Statistiques détaillées du sondage</p>
        </div>
      </div>

      <div className="admin-charts-grid">
        <div className="admin-chart-card neo-card">
          <h3 className="admin-chart-title">Catégories de problèmes</h3>
          <div className="admin-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value" label>
                  {catData.map((e: any, i: number) => <Cell key={`cell-${i}`} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="admin-chart-card neo-card">
          <h3 className="admin-chart-title">Top Pays</h3>
          <div className="admin-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={countryData} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} />
                <XAxis type="number" />
                <YAxis dataKey="name" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="value" fill="var(--primary-color)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="admin-chart-card neo-card" style={{ gridColumn: '1 / -1' }}>
          <h3 className="admin-chart-title">Évolution sur 90 jours</h3>
          <div className="admin-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolution}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="count" stroke="#10b981" strokeWidth={3} dot={false} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="admin-chart-card neo-card" style={{ gridColumn: '1 / -1', background: 'var(--primary-color)', color: 'white' }}>
          <h3 className="admin-chart-title" style={{ color: 'white' }}>Funnel de conversion</h3>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'center', height: '100%', padding: '2rem 0' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', fontWeight: 800 }}>{data?.totalResponses || 0}</div>
              <div style={{ opacity: 0.8 }}>Visiteurs (estimé)</div>
            </div>
            <div style={{ fontSize: '2rem', opacity: 0.5 }}>→</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', fontWeight: 800 }}>{data?.totalResponses || 0}</div>
              <div style={{ opacity: 0.8 }}>Réponses</div>
            </div>
            <div style={{ fontSize: '2rem', opacity: 0.5 }}>→</div>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '3rem', fontWeight: 800 }}>{data?.totalContacts || 0}</div>
              <div style={{ opacity: 0.8 }}>Contacts laissés</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
