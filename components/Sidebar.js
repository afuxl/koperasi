'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSession } from './SessionProvider';

export default function Sidebar({ isOpen, onClose }) {
  const pathname = usePathname();
  const { isAdmin, logout } = useSession();

  const links = [
    { href: '/', label: 'Peta Persebaran', icon: 'fa-map-marked-alt', id: 'link-peta' },
    { href: '/statistik', label: 'Dashboard Statistik', icon: 'fa-chart-line', id: 'link-statistik' },
    { href: '/komentar', label: 'Komentar & Testimoni', icon: 'fa-comments', id: 'link-komentar' },
  ];

  const handleLogout = () => {
    logout();
    window.location.href = '/';
  };

  return (
    <>
      {/* Mobile overlay */}
      <div
        id="mobile-overlay"
        style={{ display: isOpen ? 'block' : 'none', position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 999 }}
        onClick={onClose}
      />

      <aside id="sidebar" className={isOpen ? 'open' : ''}>
        <div className="sidebar-nav">
          <h3 style={{ marginTop: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-main)', marginBottom: 12, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
            <i className="fas fa-link" style={{ color: 'var(--primary)', marginRight: 6 }} /> Menu Utama
          </h3>
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column' }}>
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  id={link.id}
                  className={`sidebar-link ${pathname === link.href ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <i className={`fas ${link.icon}`} /> {link.label}
                </Link>
              </li>
            ))}

            {isAdmin && (
              <li id="menu-db-container">
                <Link
                  href="/database"
                  id="link-database"
                  className={`sidebar-link ${pathname === '/database' ? 'active' : ''}`}
                  onClick={onClose}
                >
                  <i className="fas fa-database" /> Kelola Basis Data
                </Link>
              </li>
            )}

            <li style={{ marginTop: 15, paddingTop: 15, borderTop: '1px dashed var(--border)' }} />

            {!isAdmin ? (
              <li id="menu-login">
                <Link href="/login" className="sidebar-link" onClick={onClose}>
                  <i className="fas fa-sign-in-alt" /> Login Admin
                </Link>
              </li>
            ) : (
              <li id="menu-logout">
                <a
                  href="#"
                  onClick={(e) => { e.preventDefault(); handleLogout(); }}
                  className="sidebar-link"
                  style={{ color: '#dc2626', fontWeight: 700 }}
                >
                  <i className="fas fa-sign-out-alt" style={{ color: '#dc2626' }} /> Keluar Admin
                </a>
              </li>
            )}
          </ul>
        </div>

        <div className="sidebar-footer">
          created by <strong>@m45y</strong><br />
          FOR LATSAR CPNS 2026<br />
          GOL III, ANGKATAN I
        </div>
      </aside>
    </>
  );
}
