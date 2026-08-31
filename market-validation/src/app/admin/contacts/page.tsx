'use client';

import React, { useState, useEffect } from 'react';
import { Search, Download, ShieldAlert } from 'lucide-react';

const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('auth_token') : '';
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
};

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchContacts() {
      try {
        const res = await fetch('/api/admin/contacts', { headers: getAuthHeaders() });
        if (res.ok) {
          const data = await res.json();
          setContacts(data.contacts || []);
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchContacts();
  }, []);

  return (
    <div>
      <div className="admin-page-header">
        <div>
          <h1 className="admin-page-title">Contacts</h1>
          <p className="admin-page-subtitle">Liste des prospects intéressés par les solutions</p>
        </div>
        <button className="neo-button" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Download size={18} /> Exporter CSV
        </button>
      </div>

      <div className="neo-card" style={{ padding: '1rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem', background: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
        <ShieldAlert size={24} color="#3b82f6" />
        <p style={{ fontSize: '0.875rem', color: 'var(--text-color)', margin: 0 }}>
          <strong>Avis de confidentialité :</strong> Les coordonnées sont protégées et accessibles uniquement aux administrateurs. Ne les exportez que si nécessaire.
        </p>
      </div>

      <div className="admin-filter-bar neo-card">
        <div className="admin-search-wrapper">
          <Search className="admin-search-icon" size={18} />
          <input type="text" className="admin-search-input" placeholder="Rechercher un contact..." />
        </div>
        <select className="admin-select">
          <option value="">Méthode de contact</option>
          <option value="email">Email</option>
          <option value="phone">Téléphone</option>
        </select>
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
                <th>Type</th>
                <th>Coordonnées</th>
                <th>Intérêt (Problème / Produit)</th>
              </tr>
            </thead>
            <tbody>
              {contacts.length === 0 ? (
                <tr><td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>Aucun contact trouvé</td></tr>
              ) : contacts.map((c, i) => (
                <tr key={c.id || i}>
                  <td>{new Date(c.createdAt || Date.now()).toLocaleDateString('fr-FR')}</td>
                  <td>{c.country || 'FR'}</td>
                  <td>
                    <span className={`admin-badge ${c.contactType === 'email' ? 'admin-badge-info' : 'admin-badge-success'}`}>
                      {c.contactType || 'email'}
                    </span>
                  </td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{c.contactInfo}</td>
                  <td>
                    <div className="admin-text-truncate" style={{ fontSize: '0.8rem' }} title={c.problemDescription}>
                      <strong>Problème:</strong> {c.problemDescription || '-'}
                    </div>
                    <div className="admin-text-truncate" style={{ fontSize: '0.8rem', color: 'var(--text-light)' }} title={c.productIdea}>
                      <strong>Produit:</strong> {c.productIdea || '-'}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
