'use client';

import { useSession } from './SessionProvider';

export default function Header({ title, icon, statsContent, onRefresh, children }) {
  const { isAdmin } = useSession();

  return (
    <header>
      <div className="header-brand">
        {children /* menu toggle button */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://upload.wikimedia.org/wikipedia/commons/3/31/Coat_of_arms_of_Southeast_Sulawesi.svg"
          alt="Logo Sulawesi Tenggara"
          className="header-logo"
        />
        <div className="header-title-group">
          <h1>{title || 'Dashboard Koperasi Merah Putih'}</h1>
          <span className="header-subtitle">Provinsi Sulawesi Tenggara</span>
        </div>
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
