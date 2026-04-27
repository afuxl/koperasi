'use client';

import { useState, useEffect, useCallback } from 'react';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Loader from '@/components/Loader';
import Swal from 'sweetalert2';
import { fetchKomentarData, saveKomentarData } from '@/lib/api';

export default function KomentarPage() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nama, setNama] = useState('');
  const [instansi, setInstansi] = useState('');
  const [komentar, setKomentar] = useState('');
  const [testimonials, setTestimonials] = useState([]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchKomentarData();
      if (res.success) {
        // Asumsi data yang dikembalikan berupa array objek komentar
        // dan kita membaliknya (reverse) agar komentar terbaru di atas
        setTestimonials(res.data.reverse());
      } else {
        // Jika action belum ada di GAS, atau belum ada sheet, mungkin res.success false
        console.warn('Gagal memuat data komentar:', res.message);
        setTestimonials([]);
      }
    } catch (error) {
      console.error('Error fetching komentar:', error);
      Swal.fire({
        icon: 'warning',
        title: 'Perhatian',
        text: 'Tidak dapat terhubung ke server untuk mengambil komentar. Anda mungkin belum mengupdate Google Apps Script.'
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  function toggleSidebar() {
    if (window.innerWidth <= 992) setSidebarOpen(!sidebarOpen);
    else {
      const sb = document.getElementById('sidebar');
      sb?.classList.toggle('collapsed');
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!nama || !komentar) {
      Swal.fire({
        icon: 'warning',
        title: 'Peringatan',
        text: 'Nama dan komentar wajib diisi!'
      });
      return;
    }

    setIsSubmitting(true);
    const newTestimonial = {
      id: Date.now().toString(),
      nama,
      instansi: instansi || 'Masyarakat Umum',
      tanggal: new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }),
      komentar
    };

    try {
      const res = await saveKomentarData(newTestimonial);
      if (res.success) {
        Swal.fire({
          icon: 'success',
          title: 'Berhasil',
          text: 'Terima kasih atas komentar dan testimoni Anda!'
        });
        
        // Reset form
        setNama('');
        setInstansi('');
        setKomentar('');
        
        // Reload data from server
        loadData();
      } else {
        Swal.fire({
          icon: 'error',
          title: 'Gagal Menyimpan',
          text: res.message || 'Terjadi kesalahan saat menyimpan komentar.'
        });
      }
    } catch (error) {
      console.error('Error saving komentar:', error);
      Swal.fire({
        icon: 'error',
        title: 'Error Jaringan',
        text: 'Gagal menghubungi server. Pastikan Anda telah menambahkan script ke Google Apps Script.'
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <Loader text={isSubmitting ? "Mengirim Komentar.." : "Memuat Data.."} visible={loading || isSubmitting} />

      <Header title="Komentar & Testimoni" icon="fa-comments" statsContent={<><i className="fas fa-users" /> Forum Diskusi</>} onRefresh={loadData}>
        <button className="menu-toggle-btn" onClick={toggleSidebar} title="Toggle Menu">
          <i className="fas fa-bars" />
        </button>
      </Header>

      <div id="layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div id="view-komentar" style={{ padding: '20px', width: '100%', boxSizing: 'border-box', overflowY: 'auto' }}>
          
          <div style={{ maxWidth: '800px', margin: '0 auto' }}>
            <div style={{ background: '#fff', borderRadius: '12px', padding: '24px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)', marginBottom: '30px' }}>
              <h2 style={{ marginTop: 0, color: 'var(--text-main)', borderBottom: '2px solid var(--primary)', paddingBottom: '10px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <i className="fas fa-pen-nib" style={{ color: 'var(--primary)' }}></i> Tinggalkan Komentar
              </h2>
              
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 300px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', color: 'var(--text-main)', fontSize: '14px' }}>Nama Lengkap *</label>
                    <input 
                      type="text" 
                      value={nama}
                      onChange={(e) => setNama(e.target.value)}
                      placeholder="Masukkan nama Anda" 
                      style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                      disabled={isSubmitting}
                    />
                  </div>
                  <div style={{ flex: '1 1 300px' }}>
                    <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', color: 'var(--text-main)', fontSize: '14px' }}>Instansi / Koperasi (Opsional)</label>
                    <input 
                      type="text" 
                      value={instansi}
                      onChange={(e) => setInstansi(e.target.value)}
                      placeholder="Asal instansi atau nama koperasi" 
                      style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', boxSizing: 'border-box' }}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>
                
                <div>
                  <label style={{ display: 'block', marginBottom: '5px', fontWeight: '500', color: 'var(--text-main)', fontSize: '14px' }}>Komentar / Testimoni *</label>
                  <textarea 
                    rows="4" 
                    value={komentar}
                    onChange={(e) => setKomentar(e.target.value)}
                    placeholder="Tuliskan pengalaman, saran, atau masukan Anda di sini..." 
                    style={{ width: '100%', padding: '10px 15px', borderRadius: '8px', border: '1px solid #cbd5e1', fontSize: '14px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
                    disabled={isSubmitting}
                  ></textarea>
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '10px' }}>
                  <button type="submit" disabled={isSubmitting} style={{ background: isSubmitting ? '#cbd5e1' : 'var(--primary)', color: 'white', border: 'none', padding: '10px 20px', borderRadius: '8px', fontWeight: '600', cursor: isSubmitting ? 'not-allowed' : 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', transition: 'background 0.3s' }}>
                    {isSubmitting ? <><i className="fas fa-spinner fa-spin"></i> Mengirim...</> : <><i className="fas fa-paper-plane"></i> Kirim Komentar</>}
                  </button>
                </div>
              </form>
            </div>

            <h3 style={{ color: 'var(--text-main)', marginBottom: '20px', fontSize: '18px', display: 'flex', alignItems: 'center', gap: '10px' }}>
              <i className="fas fa-comments" style={{ color: '#10b981' }}></i> Komentar Terbaru ({testimonials.length})
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {testimonials.length > 0 ? testimonials.map((testi) => (
                <div key={testi.id} style={{ background: '#fff', borderRadius: '10px', padding: '20px', boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)', borderLeft: '4px solid var(--primary)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px', flexWrap: 'wrap', gap: '10px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <div style={{ width: '40px', height: '40px', borderRadius: '50%', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--primary)', fontWeight: 'bold', fontSize: '16px' }}>
                        {testi.nama ? testi.nama.charAt(0).toUpperCase() : 'A'}
                      </div>
                      <div>
                        <div style={{ fontWeight: '600', color: 'var(--text-main)', fontSize: '15px' }}>{testi.nama || 'Anonim'}</div>
                        <div style={{ fontSize: '12px', color: '#64748b' }}>{testi.instansi || 'Masyarakat Umum'}</div>
                      </div>
                    </div>
                    <div style={{ fontSize: '12px', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '5px' }}>
                      <i className="far fa-clock"></i> {testi.tanggal}
                    </div>
                  </div>
                  <div style={{ color: '#475569', fontSize: '14px', lineHeight: '1.6', marginTop: '10px' }}>
                    "{testi.komentar}"
                  </div>
                </div>
              )) : (
                <div style={{ textAlign: 'center', padding: '40px 20px', background: '#fff', borderRadius: '10px', color: '#64748b' }}>
                  <i className="fas fa-comment-slash" style={{ fontSize: '48px', color: '#cbd5e1', marginBottom: '15px', display: 'block' }}></i>
                  Belum ada komentar. Jadilah yang pertama memberikan testimoni!
                </div>
              )}
            </div>
          </div>
          
        </div>
      </div>
    </>
  );
}
