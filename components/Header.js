'use client';

import { useSession } from './SessionProvider';

export default function Header({ title, icon, statsContent, onRefresh, children }) {
  const { isAdmin } = useSession();

  return (
    <header>
      <div className="header-brand">
        {children /* menu toggle button */}
        <i className={`fas ${icon || 'fa-map-location-dot'} fa-2x`} />
        <h1>{title || 'Dashboard Koperasi Merah Putih'}</h1>
        {isAdmin && (
          <div id="admin-badge" style={{ display: 'inline-block' }}>
            <i className="fas fa-shield-alt" /> ADMIN
          </div>
        )}
      </div>
      <div id="stats-panel" onClick={onRefresh} title="Klik untuk memuat ulang data dari server">
        <span id="total-info">{statsContent || <><i className="fas fa-satellite-dish fa-spin" /> Memuat...</>}</span>
        <div className="refresh-overlay">
          <i className="fas fa-sync-alt" /> Sinkronisasi
        </div>
      </div>
    </header>
  );
}
