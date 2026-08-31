'use client';

import React, { useEffect, useState } from 'react';
import { MessageSquare, TrendingUp, Users, Globe, ArrowUpRight } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';

export const COLORS = ['#6c63ff', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      try {
        const [statsRes, analyticsRes] = await Promise.all([
          fetch('/api/admin/stats', { headers: getAuthHeaders() }),
          fetch('/api/admin/analytics', { headers: getAuthHeaders() })
        ]);
        
        if (statsRes.ok && analyticsRes.ok) {
          const statsData = await statsRes.json();
          const analyticsData = await analyticsRes.json();
          setStats({ ...statsData, ...analyticsData });
        }
      } catch (err) {
        console.error('Failed to fetch dashboard data', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, []);

  if (loading || !stats) {
    return (
      <div>
        <div className="admin-page-header">
          <div>
            <h1 className="admin-page-title">Dashboard</h1>
            <p className="admin-page-subtitle">Aperçu général de la plateforme</p>
          </div>
        </div>
        <div className="admin-kpi-grid">
          {[1,2,3,4].map(i => <div key={i} className="admin-kpi-card neo-card admin-skeleton" style={{ height: '120px' }}></div>)}
        </div>
      </div>
    );
  }

  // Placeholder data if analytics is empty
  const evolutionData = stats.evolution || [
    { name: '1', réponses: 12 }, { name: '2', réponses: 19 }, { name: '3', réponses: 15 },
    { name: '4', réponses: 25 }, { name: '5', réponses: 32 }, { name: '6', réponses: 28 },
  ];

  const categoryData = stats.categories || [
    { name: 'Tech', value: 400 }, { name: 'Santé', value: 300 }, { name: 'Finance', value: 300 }, { name: 'Edu', value: 200 }
  ];

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Dashboard</h1>
          <p className="admin-page-subtitle">Aperçu général de la plateforme</p>
        </div>
      </div>

      <div className="admin-kpi-grid">
        <div className="admin-kpi-card neo-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Total Réponses</span>
            <div className="admin-kpi-icon"><MessageSquare size={20} /></div>
          </div>
          <div className="admin-kpi-value">{stats.totalResponses || 0}</div>
        </div>
        <div className="admin-kpi-card neo-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Taux d'intérêt</span>
            <div className="admin-kpi-icon"><TrendingUp size={20} /></div>
          </div>
          <div className="admin-kpi-value">{stats.interestRate || '0%'}</div>
        </div>
        <div className="admin-kpi-card neo-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Total Contacts</span>
            <div className="admin-kpi-icon"><Users size={20} /></div>
          </div>
          <div className="admin-kpi-value">{stats.totalContacts || 0}</div>
        </div>
        <div className="admin-kpi-card neo-card">
          <div className="admin-kpi-header">
            <span className="admin-kpi-title">Pays</span>
            <div className="admin-kpi-icon"><Globe size={20} /></div>
          </div>
          <div className="admin-kpi-value">{stats.totalCountries || 0}</div>
        </div>
      </div>

      <div className="admin-charts-grid">
        <div className="admin-chart-card neo-card">
          <h3 className="admin-chart-title">Évolution des réponses</h3>
          <div className="admin-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={evolutionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.1)" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} />
                <YAxis axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow)', background: 'var(--bg-color)' }} />
                <Line type="monotone" dataKey="réponses" stroke="var(--primary-color)" strokeWidth={3} dot={false} activeDot={{ r: 8 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="admin-chart-card neo-card">
          <h3 className="admin-chart-title">Répartition par catégorie</h3>
          <div className="admin-chart-container">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={5} dataKey="value">
                  {categoryData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: 'var(--shadow)', background: 'var(--bg-color)' }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
