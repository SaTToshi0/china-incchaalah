'use client';

import React, { useState, useEffect } from 'react';
import { Search, Filter, Download, Trash2, ChevronLeft, ChevronRight } from 'lucide-react';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
};

export default function ResponsesPage() {
  const [responses, setResponses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchResponses();
  }, []);

  const fetchResponses = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/responses', { headers: getAuthHeaders() });
      if (res.ok) {
        const data = await res.json();
        setResponses(data.responses || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Êtes-vous sûr de vouloir supprimer cette réponse ?')) {
      // API call to delete
      setResponses(responses.filter(r => r.id !== id));
    }
  };

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Réponses</h1>
          <p className="admin-page-subtitle">Toutes les réponses brutes du sondage</p>
        </div>
        <button className="neo-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Download size={18} /> Exporter CSV
        </button>
      </div>

      <div className="admin-filter-bar neo-card">
        <div className="admin-search-wrapper">
          <Search className="admin-search-icon" size={18} />
          <input 
            type="text" 
            className="admin-search-input" 
            placeholder="Rechercher..." 
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <select className="admin-select">
          <option value="">Toutes les catégories</option>
          <option value="tech">Tech</option>
          <option value="sante">Santé</option>
        </select>
        <select className="admin-select">
          <option value="">Tous les pays</option>
          <option value="FR">France</option>
        </select>
        <button className="neo-button" style={{ padding: '0.75rem' }}><Filter size={18} /></button>
      </div>

      <div className="admin-table-container neo-card">
        {loading ? (
          <div className="admin-skeleton" style={{ height: '400px', width: '100%' }}></div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Pays</th>
                <th>Problème</th>
                <th>Catégorie</th>
                <th>Produit/Solution</th>
                <th>Contact</th>
                <th>Score</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {responses.length === 0 ? (
                <tr><td colSpan={8} style={{ textAlign: 'center', padding: '2rem' }}>Aucune réponse trouvée</td></tr>
              ) : responses.map((r, i) => (
                <tr key={r.id || i}>
                  <td>{new Date(r.createdAt || Date.now()).toLocaleDateString('fr-FR')}</td>
                  <td>{r.country || 'FR'}</td>
                  <td><div className="admin-text-truncate" title={r.problemDescription}>{r.problemDescription || '-'}</div></td>
                  <td><span className="admin-badge admin-badge-neutral">{r.problemCategory || 'N/A'}</span></td>
                  <td><div className="admin-text-truncate" title={r.productIdea}>{r.productIdea || '-'}</div></td>
                  <td>
                    {r.contactInfo ? (
                      <span className="admin-badge admin-badge-success">Oui</span>
                    ) : (
                      <span className="admin-badge admin-badge-warning">Non</span>
                    )}
                  </td>
                  <td>{r.score || 0}/100</td>
                  <td>
                    <button onClick={() => handleDelete(r.id)} style={{ color: '#ef4444', background: 'transparent', border: 'none', cursor: 'pointer' }}>
                      <Trash2 size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="admin-pagination neo-card">
        <span className="admin-pagination-info">Affichage 1 à 10 sur 100</span>
        <div className="admin-pagination-controls">
          <button className="admin-page-btn" disabled><ChevronLeft size={18} /></button>
          <button className="admin-page-btn active" style={{ background: 'var(--primary-color)', color: 'white' }}>1</button>
          <button className="admin-page-btn">2</button>
          <button className="admin-page-btn">3</button>
          <button className="admin-page-btn"><ChevronRight size={18} /></button>
        </div>
      </div>
    </div>
  );
}
