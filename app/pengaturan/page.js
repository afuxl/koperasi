'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import { useSession } from '@/components/SessionProvider';
import Swal from 'sweetalert2';

export default function PengaturanPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { isAdmin } = useSession();
  
  const [settings, setSettings] = useState({
    alamat: true,
    lat: true,
    lng: true,
    sk_number: true,
    nik: true,
    kode_pos: true,
    pengurus: true,
    pengawas: true,
    jumlah_anggota: true,
    gerai: true
  });

  const variablesList = [
    { id: 'alamat', label: 'Alamat Lengkap', desc: 'Menyinkronkan alamat lengkap koperasi.' },
    { id: 'lat', label: 'Latitude', desc: 'Menyinkronkan titik koordinat lintang.' },
    { id: 'lng', label: 'Longitude', desc: 'Menyinkronkan titik koordinat bujur.' },
    { id: 'sk_number', label: 'Nomor SK (AHU)', desc: 'Menyinkronkan Nomor SK Kemenkumham.' },
    { id: 'nik', label: 'NIK', desc: 'Menyinkronkan Nomor Induk Koperasi.' },
    { id: 'kode_pos', label: 'Kode Pos', desc: 'Menyinkronkan kode pos.' },
    { id: 'pengurus', label: 'Pengurus', desc: 'Menyinkronkan nama pengurus.' },
    { id: 'pengawas', label: 'Pengawas', desc: 'Menyinkronkan nama pengawas.' },
    { id: 'jumlah_anggota', label: 'Jumlah Anggota', desc: 'Menghitung dan menyinkronkan total anggota.' },
    { id: 'gerai', label: 'Unit Gerai Usaha', desc: 'Menghitung dan menyinkronkan jumlah unit gerai.' }
  ];

  useEffect(() => {
    // Redirect if not admin
    if (!isAdmin) {
      window.location.href = '/login';
      return;
    }

    const saved = localStorage.getItem('syncSettings');
    if (saved) {
      try {
        setSettings(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to parse syncSettings');
      }
    }
  }, [isAdmin]);

  function toggleSidebar() {
    if (window.innerWidth <= 992) setSidebarOpen(!sidebarOpen);
    else {
      const sb = document.getElementById('sidebar');
      sb?.classList.toggle('collapsed');
    }
  }

  const handleToggle = (id) => {
    setSettings(prev => ({
      ...prev,
      [id]: !prev[id]
    }));
  };

  const handleSave = () => {
    localStorage.setItem('syncSettings', JSON.stringify(settings));
    Swal.fire({
      icon: 'success',
      title: 'Tersimpan',
      text: 'Pengaturan sinkronisasi berhasil disimpan di perangkat ini.',
      timer: 2000,
      showConfirmButton: false
    });
  };

  if (!isAdmin) return null;

  return (
    <>
      <Header title="Pengaturan Sinkronisasi" icon="fa-cog" statsContent={<><i className="fas fa-sliders-h" /> Konfigurasi Data</>} onRefresh={() => {}}>
        <button className="menu-toggle-btn" onClick={toggleSidebar} title="Toggle Menu">
          <i className="fas fa-bars" />
        </button>
      </Header>

      <div id="layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div style={{ padding: '20px', width: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
          
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)' }}>
              
              <div style={{ borderBottom: '2px solid var(--primary)', paddingBottom: '15px', marginBottom: '20px' }}>
                <h2 style={{ marginTop: 0, color: 'var(--text-main)', display: 'flex', alignItems: 'center', gap: '10px', fontSize: 20, marginBottom: 5 }}>
                  <i className="fas fa-sync-alt" style={{ color: 'var(--primary)' }}></i> Pengaturan Sinkronisasi API Kemenkop
                </h2>
                <p style={{ margin: 0, color: '#64748b', fontSize: 13 }}>
                  Pilih variabel data apa saja yang akan disalin otomatis ke formulir Kelola Basis Data saat Anda menarik data dari server Kemenkop. (Pengaturan ini hanya berlaku di browser Anda).
                </p>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '15px' }}>
                {variablesList.map((item) => (
                  <div 
                    key={item.id} 
                    onClick={() => handleToggle(item.id)}
                    style={{ 
                      display: 'flex', alignItems: 'center', padding: '15px', 
                      border: `1px solid ${settings[item.id] ? '#3b82f6' : '#e2e8f0'}`, 
                      borderRadius: '10px', cursor: 'pointer', 
                      background: settings[item.id] ? '#eff6ff' : '#fff',
                      transition: 'all 0.2s'
                    }}
                  >
                    <div style={{ marginRight: '15px' }}>
                      <input 
                        type="checkbox" 
                        checked={settings[item.id]} 
                        onChange={() => {}} // handled by div click
                        style={{ width: 18, height: 18, accentColor: '#2563eb', cursor: 'pointer' }}
                      />
                    </div>
                    <div>
                      <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#1e293b' }}>{item.label}</h4>
                      <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#64748b' }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
              
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '30px', borderTop: '1px solid #e2e8f0', paddingTop: '20px' }}>
                <button onClick={handleSave} style={{ background: 'var(--primary)', color: 'white', border: 'none', padding: '12px 24px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', boxShadow: '0 4px 6px rgba(37, 99, 235, 0.2)' }}>
                  <i className="fas fa-save"></i> Simpan Pengaturan
                </button>
              </div>

            </div>
          </div>
          
        </div>
      </div>
    </>
  );
}
