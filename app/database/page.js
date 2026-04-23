'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Loader from '@/components/Loader';
import { useSession } from '@/components/SessionProvider';
import { fetchMapData, saveKoperasiData, deleteKoperasiData, uploadImage, fetchKemenkopData, cleanCoordinate, convertDriveUrl } from '@/lib/api';
import { STANDARD_HEADERS, KEMENKOP_PASS, KEMENKOP_IV } from '@/lib/constants';
import CryptoJS from 'crypto-js';

let XLSX;
if (typeof window !== 'undefined') {
  import('xlsx').then((mod) => { XLSX = mod.default || mod; });
}

export default function DatabasePage() {
  const router = useRouter();
  const { isAdmin } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaderText, setLoaderText] = useState('Memuat Data..');

  // Data
  const [rawData, setRawData] = useState([]);
  const [dynamicHeaders, setDynamicHeaders] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statsText, setStatsText] = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 20;

  // Column Visibility
  const [visibleColumns, setVisibleColumns] = useState(['nama', 'status', 'kabupaten', 'kecamatan', 'desa']);
  const [showColMenu, setShowColMenu] = useState(false);

  const toggleColumn = (col) => {
    setVisibleColumns(prev => prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]);
  };

  // Modal
  const [modalOpen, setModalOpen] = useState(false);
  const [isNewData, setIsNewData] = useState(false);
  const [currentItem, setCurrentItem] = useState(null);

  // API Kemenkop Modal
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiRawData, setApiRawData] = useState(null);
  const [apiTargetId, setApiTargetId] = useState(null);

  // Refs for mini map
  const apiMapRef = useRef(null);
  const apiMapInstance = useRef(null);
  const apiMapMarker = useRef(null);
  const modalMapRef = useRef(null);
  const modalMapInstance = useRef(null);
  const modalMapMarker = useRef(null);
  const LRef = useRef(null);

  // Redirect if not admin
  useEffect(() => {
    const timer = setTimeout(() => {
      if (!isAdmin) {
        Swal.fire({ icon: 'warning', title: 'Akses Ditolak', text: 'Hanya admin yang dapat mengakses halaman ini.' })
          .then(() => router.push('/'));
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [isAdmin, router]);

  // Load Leaflet
  useEffect(() => {
    if (typeof window === 'undefined') return;
    import('leaflet').then(mod => {
      LRef.current = mod.default;
      delete mod.default.Icon.Default.prototype._getIconUrl;
      mod.default.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });
    });
  }, []);

  // All headers for display
  const allHeaders = (() => {
    const base = ['nama', 'status', 'alamat', 'desa', 'kecamatan', 'kabupaten', 'nik', 'lat', 'lng',
      'kode_pos', 'ahu', 'tahun pendirian', 'pengurus', 'pengawas', 'jumlah anggota',
      'sektor usaha', 'jenis koperasi', 'gerai', 'kesehatan', 'foto', 'url'];
    return [...base, ...dynamicHeaders];
  })();

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    setLoaderText('Memuat Data..');
    try {
      const res = await fetchMapData();
      if (res.success) {
        setRawData(res.data);
        setDynamicHeaders(res.dynamicHeaders || []);
        setLoading(false);
      } else {
        setLoading(false);
        Swal.fire({ icon: 'error', title: 'Gagal', text: 'Gagal memuat data: ' + res.message });
      }
    } catch (error) {
      setLoading(false);
      Swal.fire({ icon: 'error', title: 'Gagal', text: 'Gagal mengambil data dari server.' });
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  // Stats
  useEffect(() => {
    setStatsText(<><i className="fas fa-database" /> Total {rawData.length} Data</>);
  }, [rawData]);

  // Search/filter
  useEffect(() => {
    const q = searchQuery.toLowerCase();
    const result = rawData.filter(i =>
      String(i.nama || '').toLowerCase().includes(q) ||
      String(i.desa || '').toLowerCase().includes(q) ||
      String(i.kecamatan || '').toLowerCase().includes(q) ||
      String(i.kabupaten || '').toLowerCase().includes(q) ||
      String(i.nik || '').toLowerCase().includes(q)
    );
    setFilteredData(result);
  }, [rawData, searchQuery]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  // Pagination
  const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;
  const paginatedData = filteredData.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  useEffect(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(totalPages);
    }
  }, [totalPages, currentPage]);

  // ===== CRUD =====
  function openEditModal(item) {
    setCurrentItem({ ...item });
    setIsNewData(false);
    setModalOpen(true);
  }

  function openAddModal() {
    let maxId = 0;
    rawData.forEach(item => {
      if (item.id) {
        const numStr = item.id.toString().replace(/[^0-9]/g, '');
        if (numStr) { const num = parseInt(numStr, 10); if (num > maxId) maxId = num; }
      }
    });
    const newId = 'row_' + (maxId + 1);
    const newItem = { id: newId, nama: '', status: 'Aktif', alamat: '', desa: '', kecamatan: '', kabupaten: '', nik: '', lat: '', lng: '', ahu: '', 'tahun pendirian': '', pengurus: '', pengawas: '', 'jumlah anggota': '', kode_pos: '', 'sektor usaha': '', 'jenis koperasi': '', gerai: '', kesehatan: '', foto: '', url: '' };
    setCurrentItem(newItem);
    setIsNewData(true);
    setModalOpen(true);
  }

  async function handleDelete(id) {
    const confirm = await Swal.fire({ title: 'Konfirmasi Penghapusan', text: 'Data yang dihapus tidak dapat dikembalikan!', icon: 'warning', showCancelButton: true, confirmButtonColor: '#d32f2f', cancelButtonText: 'Batal', confirmButtonText: 'Ya, Hapus!' });
    if (!confirm.isConfirmed) return;

    setLoaderText('Menghapus data...');
    setLoading(true);
    try {
      const res = await deleteKoperasiData(id);
      if (res.success) {
        setRawData(prev => prev.filter(i => i.id !== id));
        Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Data berhasil dihapus.', timer: 1500, showConfirmButton: false });
      } else {
        Swal.fire({ icon: 'error', title: 'Gagal', text: 'Gagal menghapus data: ' + res.message });
      }
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Gagal', text: 'Koneksi gagal saat menghapus data.' });
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveModal() {
    if (!currentItem) return;
    let payloadData = { id: currentItem.id };
    payloadData.dynamicFields = {};

    document.querySelectorAll('.modal-dynamic-input-field').forEach(input => {
      const headerName = input.getAttribute('data-header');
      if (headerName) {
        if (STANDARD_HEADERS.includes(headerName.toLowerCase())) payloadData[headerName] = input.value;
        else payloadData.dynamicFields[headerName] = input.value;
      }
    });

    if (payloadData.lat) payloadData.lat = cleanCoordinate(payloadData.lat);
    if (payloadData.lng) payloadData.lng = cleanCoordinate(payloadData.lng);

    const localUpdateData = { ...payloadData, ...payloadData.dynamicFields };
    delete localUpdateData.dynamicFields;

    setLoaderText('Menyinkronkan perubahan ke Cloud...');
    setLoading(true);
    try {
      const res = await saveKoperasiData(payloadData);
      if (res?.success) {
        if (res.newId) localUpdateData.id = res.newId;
        setRawData(prev => {
          const updated = [...prev];
          const idx = updated.findIndex(item => item.id === currentItem.id);
          if (idx >= 0) {
            Object.keys(localUpdateData).forEach(key => { updated[idx][key] = (localUpdateData[key] !== '' && localUpdateData[key] !== null && localUpdateData[key] !== undefined) ? localUpdateData[key] : '-'; });
          } else {
            let newItem = {};
            Object.keys(localUpdateData).forEach(key => { newItem[key] = (localUpdateData[key] !== '' && localUpdateData[key] !== null && localUpdateData[key] !== undefined) ? localUpdateData[key] : '-'; });
            updated.push(newItem);
          }
          return updated;
        });
        setLoading(false);
        setModalOpen(false);
        Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Data berhasil disimpan!', timer: 1500, showConfirmButton: false });
      } else {
        setLoading(false);
        Swal.fire({ icon: 'error', title: 'Gagal', text: 'Gagal sinkronisasi: ' + (res?.message || 'Unknown') });
      }
    } catch (error) {
      setLoading(false);
      Swal.fire({ icon: 'error', title: 'Gagal', text: 'Koneksi gagal.' });
    }
  }

  async function handleModalImageUpload() {
    const fileInput = document.getElementById('modal-upload-foto');
    const statusText = document.getElementById('modal-upload-status');
    const fotoUrlField = document.getElementById('modal-edit-foto');
    if (!fileInput || fileInput.files.length === 0) { if (statusText) statusText.innerText = 'Pilih file gambar terlebih dahulu.'; return; }
    statusText.innerText = `Mengunggah 0 dari ${fileInput.files.length} gambar...`;
    statusText.style.color = 'var(--highlight)';
    let uploadedUrls = [];
    for (let i = 0; i < fileInput.files.length; i++) {
      const file = fileInput.files[i];
      const base64Data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); });
      try {
        const res = await uploadImage(base64Data, file.type, Date.now() + '_' + file.name);
        console.log("Upload Response:", res);
        if (res.success || res.url || res.fileUrl) { 
          const finalUrl = res.url || res.fileUrl || res.data || res.downloadUrl || Object.values(res).find(v => typeof v === 'string' && v.startsWith('http'));
          if (finalUrl) uploadedUrls.push(finalUrl); 
          statusText.innerText = `Mengunggah ${i + 1} dari ${fileInput.files.length} gambar...`; 
        }
        else Swal.fire({ icon: 'error', title: 'Gagal', text: `Gagal: ${res.message || 'Respons tidak valid'}` });
      } catch (err) { Swal.fire({ icon: 'error', title: 'Terputus', text: `Koneksi terputus.` }); }
    }
    if (uploadedUrls.length > 0) {
      statusText.innerText = 'Berhasil diunggah!';
      statusText.style.color = 'var(--aktif)';
      const currentVal = fotoUrlField.value.trim();
      const newVal = (currentVal && currentVal !== '-') ? currentVal + ', ' + uploadedUrls.join(', ') : uploadedUrls.join(', ');
      fotoUrlField.value = newVal;
      setCurrentItem(prev => ({ ...prev, foto: newVal }));
    }
  }

  function exportToExcel() {
    if (filteredData.length === 0) { Swal.fire({ icon: 'warning', text: 'Tidak ada data.' }); return; }
    if (!XLSX) { Swal.fire({ icon: 'info', text: 'Pustaka Excel belum siap.' }); return; }
    const dataToExport = filteredData.map((i, index) => {
      let row = { No: index + 1 };
      allHeaders.forEach(h => { row[h] = i[h] || '-'; });
      return row;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Database');
    XLSX.writeFile(wb, `Database_Koperasi_${Date.now()}.xlsx`);
  }

  // ===== API KEMENKOP =====
  function extractSlug(rawUrl) {
    // From URLs like https://simkopdes.go.id/abeli → abeli
    // Or just a plain slug like 'abeli'
    if (!rawUrl) return rawUrl;
    const trimmed = rawUrl.trim();
    try {
      const urlObj = new URL(trimmed);
      // Get the last path segment
      const segments = urlObj.pathname.split('/').filter(Boolean);
      return segments.length > 0 ? segments[segments.length - 1] : trimmed;
    } catch {
      // Not a valid URL, treat as slug
      return trimmed;
    }
  }

  async function handleFetchApi(rawUrl, sourceId) {
    const slug = extractSlug(rawUrl);
    setApiTargetId(sourceId);
    setApiRawData(null);
    setApiModalOpen(true);
    setApiLoading(true);
    try {
      const data = await fetchKemenkopData(slug);
      processApiData(data);
    } catch (err) {
      Swal.fire({ icon: 'error', title: 'Gagal', text: err.message });
      setApiModalOpen(false);
    } finally {
      setApiLoading(false);
    }
  }

  function processApiData(inputObj) {
    try {
      let finalData;
      if (inputObj && typeof inputObj.data === 'string') {
        const b64 = inputObj.data.replace(/\\\//g, '/');
        const key = CryptoJS.SHA256(KEMENKOP_PASS);
        const iv = CryptoJS.enc.Utf8.parse(KEMENKOP_IV);
        const dec = CryptoJS.AES.decrypt({ ciphertext: CryptoJS.enc.Base64.parse(b64) }, key, { iv, mode: CryptoJS.mode.CBC, padding: CryptoJS.pad.Pkcs7 }).toString(CryptoJS.enc.Utf8);
        if (!dec) throw new Error('Gagal mendekripsi payload API.');
        finalData = JSON.parse(dec);
      } else {
        finalData = inputObj.data || inputObj;
      }
      if (!finalData || typeof finalData !== 'object') throw new Error('Struktur JSON tidak dikenali.');
      setApiRawData(finalData);
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Gagal Memproses Data', text: e.message });
      setApiModalOpen(false);
    }
  }

  function useApiDataForForm() {
    if (!apiRawData || !apiTargetId) return;
    setApiModalOpen(false);
    let existingItem = rawData.find(i => i.id == apiTargetId);
    if (!existingItem) { Swal.fire('Error', 'Data referensi tidak ditemukan!', 'error'); return; }

    let pengurusStr = '', pengawasStr = '';
    if (apiRawData.managements?.length) {
      pengurusStr = apiRawData.managements.filter(m => m.status?.toUpperCase() === 'PENGURUS').map(m => m.name || m.nama).filter(Boolean).join(', ');
      pengawasStr = apiRawData.managements.filter(m => m.status?.toUpperCase() === 'PENGAWAS').map(m => m.name || m.nama).filter(Boolean).join(', ');
    }

    const updatedItem = { ...existingItem };
    updatedItem.kode_pos = apiRawData.postal_code || updatedItem.kode_pos;
    updatedItem.pengurus = pengurusStr || updatedItem.pengurus;
    updatedItem.pengawas = pengawasStr || updatedItem.pengawas;
    updatedItem['jumlah anggota'] = apiRawData.members ? apiRawData.members.length.toString() : '0';
    updatedItem.gerai = apiRawData.outlets ? apiRawData.outlets.length.toString() : '0';

    setCurrentItem(updatedItem);
    setIsNewData(false);
    setModalOpen(true);
    Swal.fire({ icon: 'success', title: 'Data Tersalin', text: 'Kode Pos, Pengurus, Pengawas, Jumlah Anggota, dan Gerai berhasil ditarik dari API.', timer: 4000, showConfirmButton: false });
  }

  // Render API results
  useEffect(() => {
    if (!apiRawData || !apiModalOpen) return;
    const L = LRef.current;
    if (!L) return;

    if (apiMapInstance.current) {
      apiMapInstance.current.remove();
      apiMapInstance.current = null;
      apiMapMarker.current = null;
    }

    setTimeout(() => {
      const container = document.getElementById('api-map');
      if (!container) return;

      const lat = parseFloat(apiRawData.latitude ?? apiRawData.lat);
      const lng = parseFloat(apiRawData.longitude ?? apiRawData.lng ?? apiRawData.lon);
      if (!isNaN(lat) && !isNaN(lng)) {
        apiMapInstance.current = L.map(container);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(apiMapInstance.current);
        
        apiMapInstance.current.setView([lat, lng], 14);
        apiMapMarker.current = L.marker([lat, lng]).addTo(apiMapInstance.current);
        
        setTimeout(() => apiMapInstance.current.invalidateSize(), 300);
      }
    }, 300);
  }, [apiRawData, apiModalOpen]);

  function toggleSidebar() {
    if (window.innerWidth <= 992) setSidebarOpen(!sidebarOpen);
    else { document.getElementById('sidebar')?.classList.toggle('collapsed'); }
  }

  if (!isAdmin) return <Loader text="Memverifikasi akses..." visible={true} />;

  return (
    <>
      <Loader text={loaderText} visible={loading} />

      <Header title="Kelola Basis Data" icon="fa-database" statsContent={statsText} onRefresh={loadData}>
        <button className="menu-toggle-btn" onClick={toggleSidebar} title="Toggle Menu"><i className="fas fa-bars" /></button>
      </Header>

      <div id="layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div id="view-statistik" style={{ padding: 20 }}>
          {/* Header / Actions */}
          <div className="stat-filter-row header-controls" style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h3 style={{ margin: 0 }}><i className="fas fa-table" style={{ color: 'var(--primary)' }} /> Basis Data Koperasi</h3>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>({filteredData.length} data)</span>
            </div>
            <div className="action-buttons" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <input type="text" className="db-search-input" placeholder="Cari nama, desa, kecamatan, NIK..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
              <div style={{ position: 'relative' }}>
                <button className="btn-action" style={{ background: '#fff', color: '#475569', border: '1px solid #cbd5e1' }} onClick={() => setShowColMenu(!showColMenu)}>
                  <i className="fas fa-columns" /> Pilih Kolom
                </button>
                {showColMenu && (
                  <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 50, padding: 12, width: 250, maxHeight: 300, overflowY: 'auto' }}>
                    <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                      <span>Tampilkan Kolom</span>
                      <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setShowColMenu(false)} />
                    </div>
                    {allHeaders.map(h => (
                      <label key={h} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
                        <input type="checkbox" checked={visibleColumns.includes(h)} onChange={() => toggleColumn(h)} style={{ accentColor: 'var(--primary)' }} />
                        <span style={{ textTransform: 'capitalize' }}>{h.replace(/_/g, ' ')}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
              <button className="btn-action" style={{ background: '#10b981', color: '#fff', border: 'none' }} onClick={openAddModal}><i className="fas fa-plus" /> Tambah Data</button>
              <button className="btn-action btn-export" onClick={exportToExcel}><i className="fas fa-file-excel" /> Ekspor</button>
            </div>
          </div>

          {/* Database Table */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)', marginTop: 8 }}>
            <div style={{ overflowX: 'auto', maxHeight: 'calc(100vh - 250px)' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th style={{ width: 50, textAlign: 'center' }}>No</th>
                    {allHeaders.filter(h => visibleColumns.includes(h)).map(h => (
                      <th key={h} style={{ textTransform: 'capitalize', whiteSpace: 'nowrap' }}>{h.replace(/_/g, ' ')}</th>
                    ))}
                    <th style={{ width: 150, textAlign: 'center' }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length === 0 ? (
                    <tr><td colSpan={visibleColumns.length + 2} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}><i>Data tidak ditemukan.</i></td></tr>
                  ) : paginatedData.map((item, index) => {
                    const globalIdx = (currentPage - 1) * itemsPerPage + index + 1;
                    return (
                      <tr key={item.id}>
                        <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>{globalIdx}</td>
                        {allHeaders.filter(h => visibleColumns.includes(h)).map(h => {
                          if (h === 'status') {
                            const isAktif = String(item.status || '').toLowerCase().includes('aktif') && !String(item.status || '').toLowerCase().includes('tidak');
                            return <td key={h}><span className="status-badge" style={{ background: isAktif ? 'var(--aktif)' : 'var(--non-aktif)' }}>{item.status}</span></td>;
                          }
                          if (h === 'nama') return <td key={h} style={{ fontWeight: 600 }}>{item.nama || '-'}</td>;
                          
                          // Handle long links/images gracefully
                          if (h === 'foto' || h === 'url') {
                             return <td key={h} style={{ maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item[h]}>{item[h] || '-'}</td>;
                          }
                          
                          return <td key={h}>{item[h] || '-'}</td>;
                        })}
                        <td style={{ textAlign: 'center' }}>
                          <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                            <button className="btn-action" style={{ fontSize: 9 }} onClick={() => openEditModal(item)} title="Edit"><i className="fas fa-pen" /> Edit</button>
                            <button className="btn-action" style={{ fontSize: 9, background: '#ef4444', color: '#fff', border: 'none' }} onClick={() => handleDelete(item.id)} title="Hapus"><i className="fas fa-trash" /></button>
                            {item.url && item.url !== '-' && (
                              <button className="btn-action" style={{ fontSize: 9, background: '#3b82f6', color: '#fff', border: 'none' }} onClick={() => handleFetchApi(item.url, item.id)} title="Tarik Data API"><i className="fas fa-cloud-download-alt" /></button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="pagination-container">
              <span>Halaman {currentPage} dari {totalPages} ({filteredData.length} total data)</span>
              <div className="page-btn-group">
                <button className="page-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}><i className="fas fa-chevron-left" /></button>
                <button className="page-btn" disabled={currentPage >= totalPages} onClick={() => setCurrentPage(p => p + 1)}><i className="fas fa-chevron-right" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== EDIT/ADD MODAL ===== */}
      {modalOpen && currentItem && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9000, backdropFilter: 'blur(4px)', padding: 16 }} onClick={() => setModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 700, width: '100%', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)' }} onClick={e => e.stopPropagation()}>
            <div style={{ background: 'var(--primary-gradient)', color: '#fff', padding: '16px 24px', borderRadius: '16px 16px 0 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}><i className="fas fa-edit" /> {isNewData ? 'Tambah Data Baru' : 'Edit Data Koperasi'}</h3>
              <button style={{ background: 'none', border: 'none', color: '#fff', fontSize: 20, cursor: 'pointer' }} onClick={() => setModalOpen(false)}><i className="fas fa-times" /></button>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Mini Map for coordinate editing */}
              <div style={{ background: '#f8fafc', borderRadius: 12, border: '1px solid var(--border)', overflow: 'hidden' }}>
                <div style={{ padding: '8px 12px', fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <i className="fas fa-map-marker-alt" style={{ color: 'var(--primary)' }} /> Klik peta untuk mengatur/memindahkan titik lokasi
                </div>
                <ModalMap item={currentItem} LRef={LRef} mapInstanceRef={modalMapInstance} markerRef={modalMapMarker} />
              </div>

              {allHeaders.map(header => (
                <div key={header} className="info-row">
                  <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>{header}</label>
                  {header === 'status' ? (
                    <select className="edit-input modal-dynamic-input-field" data-header={header} defaultValue={currentItem[header] || 'Aktif'}>
                      <option value="Aktif">Aktif</option><option value="Tidak Aktif">Tidak Aktif</option>
                    </select>
                  ) : header === 'foto' ? (
                    <div key={header} className="info-row" style={{ display: 'block' }}>
                      <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Galeri Foto (URL / Upload Drive)</label>
                      <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
                        <textarea id="modal-edit-foto" className="edit-input modal-dynamic-input-field" data-header={header} defaultValue={currentItem[header] === '-' ? '' : (currentItem[header] || '')} style={{ resize: 'vertical', height: 60, width: '100%', border: '1px solid #cbd5e1' }} placeholder="Masukkan URL gambar (pisahkan koma) atau upload via tombol di bawah..." />
                        
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <input type="file" id="modal-upload-foto" accept="image/*" multiple style={{ fontSize: 11, flex: 1, minWidth: 0, border: '1px dashed #cbd5e1', padding: '6px', borderRadius: 6, background: '#fff' }} />
                          <button className="btn-action" style={{ width: 'auto', margin: 0, padding: '6px 14px', fontSize: 11, flexShrink: 0, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6 }} onClick={handleModalImageUpload}><i className="fas fa-cloud-upload-alt" /> Upload ke Drive</button>
                        </div>
                        <div id="modal-upload-status" style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginTop: 4 }} />
                        
                        {currentItem[header] && currentItem[header] !== '-' && (
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                            {currentItem[header].split(',').map(f => f.trim()).filter(f => f !== '').map((url, idx) => {
                              const thumbUrl = convertDriveUrl(url);
                              return <img key={idx} src={thumbUrl} style={{ width: 45, height: 45, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }} alt="Thumb" onError={e => e.target.style.display = 'none'} />
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <input type="text" className="edit-input modal-dynamic-input-field" data-header={header} defaultValue={currentItem[header] === '-' ? '' : (currentItem[header] || '')} />
                  )}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                <button className="btn-save" style={{ flex: 1 }} onClick={handleSaveModal}><i className="fas fa-cloud-arrow-up" /> Simpan ke Cloud</button>
                <button className="btn-save" style={{ flex: 1, background: '#e2e8f0', color: 'var(--text-muted)', boxShadow: 'none' }} onClick={() => setModalOpen(false)}>Batal</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== API KEMENKOP MODAL ===== */}
      {apiModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: 16 }} onClick={() => setApiModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 1100, width: '100%', maxHeight: '96vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            {/* Header Modal API */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <i className="fas fa-satellite-dish" style={{ fontSize: 18 }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>Detail Data API Kemenkop</h3>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>Tampilan data sinkronisasi dari pusat</p>
                </div>
              </div>
              <button onClick={() => setApiModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-times" />
              </button>
            </div>

            <div style={{ flex: 1, padding: 24, background: '#f1f5f9', display: 'flex', flexDirection: 'column', gap: 20 }}>
              {apiLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 16 }}>
                  <i className="fas fa-circle-notch fa-spin fa-3x" style={{ color: '#2563eb' }} />
                  <p style={{ color: '#475569', fontWeight: 600, fontSize: 14 }}>Menarik & Memproses Data...</p>
                </div>
              )}

              {apiRawData && !apiLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                  {/* Hero Result */}
                  <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', borderLeft: '4px solid #3b82f6', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 16, boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <div>
                      <h2 style={{ margin: 0, fontSize: 20, fontWeight: 900, color: '#1e293b', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>{apiRawData.name || 'TANPA NAMA'}</h2>
                      <p style={{ margin: '4px 0 0 0', fontSize: 12, fontWeight: 500, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                        <i className="fas fa-map-marker-alt" style={{ color: '#ef4444' }} /> {[apiRawData.village?.name, apiRawData.subdistrict?.name, apiRawData.district?.name, apiRawData.province?.name].filter(Boolean).join(', ') || 'Lokasi tidak diketahui'}
                      </p>
                    </div>
                    <button className="btn-save" style={{ background: '#16a34a', padding: '10px 20px', borderRadius: 8, fontSize: 12, fontWeight: 700 }} onClick={useApiDataForForm}>
                      <i className="fas fa-check-circle" style={{ marginRight: 6 }} /> Gunakan Data Ini ke Form
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                    {/* Info Utama */}
                    <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-info-circle" style={{ color: '#3b82f6' }} /> Informasi Utama
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '10px 8px', fontSize: 11 }}>
                        <b style={{ color: '#64748b' }}>Nama Koperasi</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.name || '-'}</span>
                        <b style={{ color: '#64748b' }}>NIK</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.nik || '-'}</span>
                        <b style={{ color: '#64748b' }}>Alamat Lengkap</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.address || '-'}</span>
                        <b style={{ color: '#64748b' }}>AHU</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.sk_number || '-'}</span>
                        <b style={{ color: '#64748b' }}>Tah. Pendirian</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.establishment_year || '-'}</span>
                        <b style={{ color: '#64748b' }}>Kode Pos</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.postal_code || '-'}</span>
                        <b style={{ color: '#64748b' }}>Jml. Anggota</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.members?.length || 0}</span>
                        <b style={{ color: '#64748b' }}>Pengurus</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.managements?.filter(m => m.status?.toUpperCase() === 'PENGURUS').map(m => m.name || m.nama || m.employee_name).filter(Boolean).join(', ') || '-'}</span>
                        <b style={{ color: '#64748b' }}>Pengawas</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.managements?.filter(m => m.status?.toUpperCase() === 'PENGAWAS').map(m => m.name || m.nama || m.employee_name).filter(Boolean).join(', ') || '-'}</span>
                      </div>
                    </div>

                    {/* Info Tambahan */}
                    <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-list-alt" style={{ color: '#22c55e' }} /> Informasi Tambahan
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px 8px', fontSize: 11 }}>
                        <b style={{ color: '#64748b' }}>RAT</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.rat || '-'}</span>
                        <b style={{ color: '#64748b' }}>Unit Gerai Usaha</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.outlets?.length || 0}</span>
                        <b style={{ color: '#64748b' }}>Tingkat Kesehatan</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.health_score || apiRawData.kesehatan || '-'}</span>
                        <b style={{ color: '#64748b' }}>Sektor Usaha</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.klu_types?.map(k => k.type || k.name).join(', ') || '-'}</span>
                      </div>
                    </div>

                    {/* Peta Lokasi */}
                    <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)', display: 'flex', flexDirection: 'column' }}>
                      <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <i className="fas fa-map" style={{ color: '#ef4444' }} /> Peta Lokasi
                      </h3>
                      {(!isNaN(parseFloat(apiRawData.latitude ?? apiRawData.lat)) && !isNaN(parseFloat(apiRawData.longitude ?? apiRawData.lng ?? apiRawData.lon))) ? (
                        <>
                          <div id="api-map" style={{ height: 180, width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#e2e8f0' }} />
                          <div style={{ marginTop: 8, fontSize: 10, color: '#64748b', background: '#f1f5f9', padding: '4px 8px', borderRadius: 4, alignSelf: 'flex-start', fontFamily: 'monospace' }}>
                            Koordinat: <b>{parseFloat(apiRawData.latitude ?? apiRawData.lat).toFixed(6)}, {parseFloat(apiRawData.longitude ?? apiRawData.lng ?? apiRawData.lon).toFixed(6)}</b>
                          </div>
                        </>
                      ) : (
                        <div style={{ height: 180, width: '100%', borderRadius: 8, border: '1px dashed #cbd5e1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: 12, fontStyle: 'italic', background: '#f8fafc' }}>
                          <i className="fas fa-exclamation-triangle" style={{ marginRight: 8 }}></i> Koordinat tidak tersedia di API
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Wilayah Administratif */}
                  <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                    <h3 style={{ margin: '0 0 16px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <i className="fas fa-sitemap" style={{ color: '#f97316' }} /> Wilayah Administratif
                    </h3>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
                      {[{ title: 'Provinsi', data: apiRawData.province }, { title: 'Kabupaten/Kota', data: apiRawData.district }, { title: 'Kecamatan', data: apiRawData.subdistrict }, { title: 'Desa/Kelurahan', data: apiRawData.village }].map((w, idx) => (
                        <div key={idx} style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #f1f5f9' }}>
                          <b style={{ fontSize: 10, color: '#64748b', textTransform: 'uppercase', marginBottom: 6, display: 'block' }}>{w.title}</b>
                          {w.data ? Object.entries(w.data).map(([k, v]) => (
                            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #e2e8f0', padding: '4px 0' }}>
                              <span style={{ color: '#94a3b8', fontSize: 10, textTransform: 'capitalize' }}>{k}</span>
                              <span style={{ fontWeight: 600, color: '#334155', fontSize: 10, textAlign: 'right', wordBreak: 'break-all', paddingLeft: 8 }}>{v !== null && v !== undefined ? String(v) : '-'}</span>
                            </div>
                          )) : <span style={{ fontSize: 10, color: '#94a3b8' }}>-</span>}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Render Logo dan Banner */}
                  {(()=>{
                    let imgs = [];
                    if(apiRawData.logo_file) imgs.push({label:"Logo Koperasi", url:apiRawData.logo_file});
                    if(apiRawData.banner_file) imgs.push({label:"Banner", url:apiRawData.banner_file});
                    if(Array.isArray(apiRawData.outlets)){
                        apiRawData.outlets.forEach((o,i)=>{
                            if(o?.primary_image) imgs.push({label:`Outlet #${i+1} - Utama`, url:o.primary_image});
                            if(o?.secondary_image) imgs.push({label:`Outlet #${i+1} - Alternatif`, url:o.secondary_image});
                        });
                    }
                    return (
                      <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <i className="fas fa-images" style={{ color: '#8b5cf6' }} /> Galeri & Lampiran
                        </h3>
                        {imgs.length === 0 ? (
                          <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>Tidak ada gambar yang dilampirkan.</p>
                        ) : (
                          <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 10 }}>
                            {imgs.map((it, idx) => (
                              <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', minWidth: 200, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
                                <img src={it.url} alt={it.label} style={{ width: '100%', height: 120, objectFit: 'cover', background: '#fff' }} />
                                <div style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '8px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                    <KemenkopApiTables data={apiRawData} />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ========== MODAL MAP COMPONENT ==========
function ModalMap({ item, LRef, mapInstanceRef, markerRef }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const L = LRef.current;
    if (!L || !containerRef.current) return;

    // Clean up previous map instance
    if (mapInstanceRef.current) {
      mapInstanceRef.current.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    }

    const latVal = parseFloat(item?.lat);
    const lngVal = parseFloat(item?.lng);
    const hasCoords = !isNaN(latVal) && !isNaN(lngVal);
    const center = hasCoords ? [latVal, lngVal] : [-4.0, 122.5];
    const zoom = hasCoords ? 15 : 8;

    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OSM' });
    const satLayer = L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains:['mt0','mt1','mt2','mt3'], attribution: '© Google Satellite' });

    const map = L.map(containerRef.current, { 
      zoomControl: true,
      layers: [osmLayer]
    }).setView(center, zoom);
    
    L.control.layers({ 
      "OpenStreetMap": osmLayer, 
      "Google Satelit": satLayer 
    }).addTo(map);

    mapInstanceRef.current = map;

    if (hasCoords) {
      markerRef.current = L.marker(center).addTo(map);
    }

    // Click to set/move marker & update lat/lng inputs
    map.on('click', (e) => {
      const { lat, lng } = e.latlng;
      if (markerRef.current) map.removeLayer(markerRef.current);
      markerRef.current = L.marker([lat, lng]).addTo(map);

      // Update the lat/lng input fields in the modal
      const latInput = document.querySelector('.modal-dynamic-input-field[data-header="lat"]');
      const lngInput = document.querySelector('.modal-dynamic-input-field[data-header="lng"]');
      if (latInput) { latInput.value = lat.toFixed(8); latInput.dispatchEvent(new Event('input', { bubbles: true })); }
      if (lngInput) { lngInput.value = lng.toFixed(8); lngInput.dispatchEvent(new Event('input', { bubbles: true })); }
    });

    setTimeout(() => map.invalidateSize(), 200);

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
    };
  }, [item?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return <div ref={containerRef} style={{ height: 220, width: '100%' }} />;
}

// ========== KEMENKOP API TABLES (EXPANDABLE) COMPONENT ==========
function KemenkopApiTables({ data }) {
  const toArr = (arr) => Array.isArray(arr) ? arr.map(x => (x && typeof x === 'object') ? x : { value: x }) : [];
  
  const tablesDef = [
    { title: 'Managements (Pengurus & Pengawas)', data: toArr(data.managements), icon: 'fa-users' },
    { title: 'Members (Anggota)', data: toArr(data.members), icon: 'fa-id-card' },
    { title: 'Outlets (Gerai Usaha)', data: toArr(data.outlets), icon: 'fa-store' },
    { title: 'Potentials (Potensi Desa)', data: toArr(data.potentials), icon: 'fa-chart-line' },
    { title: 'KLU/S', data: toArr(data.klus), icon: 'fa-layer-group' },
    { title: 'KLU Types', data: toArr(data.klu_types), icon: 'fa-tags' },
    { title: 'Member Stats (Statistik Mingguan)', data: toArr(data.member_stats), icon: 'fa-chart-bar' },
    { title: 'Development Reports', data: toArr(data.development_reports), icon: 'fa-hard-hat' },
    { title: 'Merged Villages', data: toArr(data.merged_villages), icon: 'fa-map-signs' },
    { title: 'News', data: toArr(data.news), icon: 'fa-newspaper' },
  ];
  const formatHeader = (c) => {
    const map = {
      'cooperative_asset_development_report_id': 'ID Laporan',
      'cooperative_asset_development_indicator_id': 'ID Indikator',
      'cooperative_asset_id': 'ID Aset',
      'description': 'Deskripsi',
      'development_progress': 'Progress (%)',
      'image_primary': 'Foto Utama',
      'image_secondary': 'Foto 2',
      'image_other_1': 'Foto 3',
      'image_other_2': 'Foto 4',
      'surveyor': 'Surveyor',
      'created_at': 'Dibuat',
      'updated_at': 'Diupdate',
      'manpower': 'Pekerja',
      'indicator_construction_type': 'Tipe Konstruksi',
      'indicator_indicator': 'Indikator',
      'indicator_weight': 'Bobot',
      'indicator_description': 'Detail Indikator',
      'asset_name': 'Nama Aset',
      'asset_cooperative_id': 'ID Koperasi',
      'asset_asset_type': 'Tipe Aset',
      'asset_asset_status': 'Status Aset',
      'asset_image_primary': 'Foto Aset 1',
      'asset_image_secondary': 'Foto Aset 2',
      'name': 'Nama',
      'employee_name': 'Nama Pegawai',
      'status': 'Status',
      'nik': 'NIK',
      'address': 'Alamat',
      'phone_number': 'Telepon',
      'type': 'Tipe',
      'requested': 'Diminta',
      'approved': 'Disetujui',
      'rejected': 'Ditolak',
      'week': 'Minggu',
      'potency_type': 'Tipe Potensi',
      'potency_name': 'Nama Potensi',
      'volume': 'Volume',
      'unit': 'Satuan',
      'cooperative_member_id': 'ID Anggota',
      'gender': 'Jenis Kelamin',
      'date_of_birth': 'Tgl Lahir',
      'province_id': 'ID Prov',
      'district_id': 'ID Kab',
      'subdistrict_id': 'ID Kec',
      'village_id': 'ID Desa',
      'outlet_name': 'Nama Gerai',
      'outlet_type': 'Tipe Gerai',
      'latitude': 'Lat',
      'longitude': 'Lng',
      'title': 'Judul',
      'content': 'Konten'
    };
    return map[c] || c.replace(/_/g, ' ');
  };

  return (
    <>
      {tablesDef.map((tb, i) => {
        const isOpen = tb.data.length > 0 && tb.data.length <= 5;
        return (
          <details key={i} open={isOpen} style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.05)' }}>
            <summary style={{ padding: '16px', background: '#f8fafc', fontWeight: 700, fontSize: 13, color: '#1e293b', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: isOpen ? '1px solid #e2e8f0' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center' }}>
                <i className={`fas ${tb.icon}`} style={{ color: '#94a3b8', marginRight: 8, width: 20, textAlign: 'center' }} /> {tb.title}
                {tb.data.length > 0 && <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 8px', borderRadius: 12, fontSize: 10, marginLeft: 10, fontWeight: 800 }}>{tb.data.length} data</span>}
              </div>
            </summary>
            {tb.data.length === 0 ? (
              <div style={{ padding: 20, textAlign: 'center', fontSize: 12, color: '#94a3b8', fontStyle: 'italic' }}>Tidak ada data untuk tabel ini.</div>
            ) : (
              <div style={{ overflowX: 'auto', maxHeight: 400 }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr>
                      {Array.from(tb.data.reduce((s, row) => { Object.keys(row || {}).forEach(k => s.add(k)); return s; }, new Set())).map((c, idx) => (
                        <th key={idx} style={{ padding: '10px 12px', borderBottom: '2px solid #e2e8f0', background: '#f8fafc', fontSize: 10, fontWeight: 700, color: '#64748b', textTransform: 'uppercase', whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }} title={c}>{formatHeader(c)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {tb.data.map((row, idxRow) => (
                      <tr key={idxRow} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        {Array.from(tb.data.reduce((s, r) => { Object.keys(r || {}).forEach(k => s.add(k)); return s; }, new Set())).map((c, idxCol) => {
                          let val = row[c];
                          if (c.toLowerCase().includes("image") && val) {
                            return <td key={idxCol} style={{ padding: 10 }}><img src={val} alt="Img" style={{ maxWidth: 120, borderRadius: 4, border: '1px solid #e2e8f0' }} /></td>;
                          }
                          if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                          return <td key={idxCol} style={{ padding: 10, fontSize: 11, color: '#334155', verticalAlign: 'top' }}>{val || '-'}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </details>
        );
      })}
    </>
  );
}
