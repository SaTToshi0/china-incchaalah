'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { LayoutDashboard, MessageSquare, Lightbulb, BarChart2, Users, LogOut, Menu, X } from 'lucide-react';
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean | null>(null);

  // If we are on the login page, render just children (with the login layout)
  if (pathname === '/admin/login') {
    return <>{children}</>;
  }

  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (!token) {
      router.push('/admin/login');
    } else {
      setIsAuthenticated(true);
    }
  }, [router]);

  const handleLogout = () => {
    localStorage.removeItem('auth_token');
    router.push('/admin/login');
  };

  const navLinks = [
    { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
    { href: '/admin/responses', label: 'Réponses', icon: MessageSquare },
    { href: '/admin/opportunities', label: 'Opportunités', icon: Lightbulb },
    { href: '/admin/analytics', label: 'Analyses', icon: BarChart2 },
    { href: '/admin/contacts', label: 'Contacts', icon: Users },
  ];

  if (isAuthenticated === null) return null;

  return (
    <div className="admin-layout">
      {/* Mobile Header */}
      <div className="admin-header-mobile neo-card">
        <div className="admin-sidebar-logo">
          <Lightbulb size={24} /> Admin
        </div>
        <button className="admin-menu-btn" onClick={() => setIsMobileOpen(!isMobileOpen)}>
          {isMobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`admin-sidebar neo-card ${isMobileOpen ? 'open' : ''}`}>
        <div className="admin-sidebar-header">
          <div className="admin-sidebar-logo">
            <Lightbulb size={24} color="var(--primary-color)" />
            <span>Validation.app</span>
          </div>
        </div>

        <nav className="admin-nav">
          {navLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link 
                key={link.href} 
                href={link.href}
                className={`admin-nav-link ${isActive ? 'active' : ''}`}
                onClick={() => setIsMobileOpen(false)}
              >
                <Icon size={20} />
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="admin-sidebar-footer">
          <button className="neo-button admin-logout-btn" onClick={handleLogout}>
            <LogOut size={20} />
            Déconnexion
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="admin-main">
        {children}
      </main>
    </div>
  );
}
