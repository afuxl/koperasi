'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Swal from 'sweetalert2';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Loader from '@/components/Loader';
import { useSession } from '@/components/SessionProvider';
import { fetchMapData } from '@/lib/api';

let Chart, BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend, Title, BarController, PieController, DoughnutController;

export default function StatistikPage() {
  const { isAdmin } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rawData, setRawData] = useState([]);
  const [statsText, setStatsText] = useState(null);

  // Filter state
  const [filterKabupaten, setFilterKabupaten] = useState('');
  const [filterKecamatan, setFilterKecamatan] = useState('');

  // Chart refs
  const chartBarRef = useRef(null);
  const chartDoughnutRef = useRef(null);
  const chartPieRef = useRef(null);
  const chartBarInstance = useRef(null);
  const chartDoughnutInstance = useRef(null);
  const chartPieInstance = useRef(null);
  const chartJsLoaded = useRef(false);

  // Dropdown data
  const kabupatenList = [...new Set(rawData.map(i => i.kabupaten))].filter(Boolean).sort();
  const kecamatanList = filterKabupaten
    ? [...new Set(rawData.filter(i => i.kabupaten === filterKabupaten).map(i => i.kecamatan))].filter(Boolean).sort()
    : [];

  // Filtered data
  const filteredData = rawData.filter(i => {
    const matchKab = filterKabupaten === '' || i.kabupaten === filterKabupaten;
    const matchKec = filterKecamatan === '' || i.kecamatan === filterKecamatan;
    return matchKab && matchKec;
  });

  // KPI values
  const totalKoperasi = filteredData.length;
  const totalAktif = filteredData.filter(i => String(i.status || '').toLowerCase().includes('aktif') && !String(i.status || '').toLowerCase().includes('tidak')).length;
  const totalNonAktif = totalKoperasi - totalAktif;
  const totalTerpetakan = filteredData.filter(i => !isNaN(parseFloat(i.lat)) && !isNaN(parseFloat(i.lng))).length;

  // Load Chart.js
  useEffect(() => {
    async function loadChartJs() {
      const chartMod = await import('chart.js');
      Chart = chartMod.Chart;
      BarElement = chartMod.BarElement;
      CategoryScale = chartMod.CategoryScale;
      LinearScale = chartMod.LinearScale;
      ArcElement = chartMod.ArcElement;
      Tooltip = chartMod.Tooltip;
      Legend = chartMod.Legend;
      Title = chartMod.Title;
      BarController = chartMod.BarController;
      PieController = chartMod.PieController;
      DoughnutController = chartMod.DoughnutController;
      Chart.register(BarController, PieController, DoughnutController, BarElement, CategoryScale, LinearScale, ArcElement, Tooltip, Legend, Title);
      chartJsLoaded.current = true;
    }
    loadChartJs();
  }, []);

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchMapData();
      if (res.success) {
        setRawData(res.data);
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

  // Update stats text
  useEffect(() => {
    setStatsText(<><i className="fas fa-database" /> Total {rawData.length} Data</>);
  }, [rawData]);

  // Render charts when data changes
  useEffect(() => {
    if (!chartJsLoaded.current || filteredData.length === 0) return;

    // Wait a tick for DOM refs
    const timeout = setTimeout(() => renderCharts(), 100);
    return () => clearTimeout(timeout);
  }, [filteredData, filterKabupaten, filterKecamatan]); // eslint-disable-line react-hooks/exhaustive-deps

  function renderCharts() {
    if (!Chart) return;

    // ===== BAR CHART: Koperasi per Kabupaten/Kecamatan =====
    if (chartBarInstance.current) chartBarInstance.current.destroy();
    if (chartBarRef.current) {
      let barLabels, barDataAktif, barDataNonAktif;

      if (filterKabupaten === '') {
        // Per kabupaten
        const kabMap = {};
        filteredData.forEach(item => {
          const kab = item.kabupaten || 'Lainnya';
          if (!kabMap[kab]) kabMap[kab] = { aktif: 0, nonAktif: 0 };
          const isAktif = String(item.status || '').toLowerCase().includes('aktif') && !String(item.status || '').toLowerCase().includes('tidak');
          if (isAktif) kabMap[kab].aktif++; else kabMap[kab].nonAktif++;
        });
        barLabels = Object.keys(kabMap).sort();
        barDataAktif = barLabels.map(k => kabMap[k].aktif);
        barDataNonAktif = barLabels.map(k => kabMap[k].nonAktif);
      } else {
        // Per kecamatan
        const kecMap = {};
        filteredData.forEach(item => {
          const kec = item.kecamatan || 'Lainnya';
          if (!kecMap[kec]) kecMap[kec] = { aktif: 0, nonAktif: 0 };
          const isAktif = String(item.status || '').toLowerCase().includes('aktif') && !String(item.status || '').toLowerCase().includes('tidak');
          if (isAktif) kecMap[kec].aktif++; else kecMap[kec].nonAktif++;
        });
        barLabels = Object.keys(kecMap).sort();
        barDataAktif = barLabels.map(k => kecMap[k].aktif);
        barDataNonAktif = barLabels.map(k => kecMap[k].nonAktif);
      }

      chartBarInstance.current = new Chart(chartBarRef.current, {
        type: 'bar',
        data: {
          labels: barLabels,
          datasets: [
            { label: 'Aktif', data: barDataAktif, backgroundColor: '#10b981', borderRadius: 6, barPercentage: 0.7 },
            { label: 'Tidak Aktif', data: barDataNonAktif, backgroundColor: '#ef4444', borderRadius: 6, barPercentage: 0.7 },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { display: true, position: 'bottom', labels: { usePointStyle: true, font: { family: 'Inter', size: 11 } } } },
          scales: {
            x: { ticks: { font: { family: 'Inter', size: 10 }, maxRotation: 45, minRotation: 0 }, grid: { display: false } },
            y: { beginAtZero: true, ticks: { font: { family: 'Inter', size: 10 }, precision: 0 }, grid: { color: '#f1f5f9' } },
          },
        },
      });
    }

    // ===== DOUGHNUT CHART: Status =====
    if (chartDoughnutInstance.current) chartDoughnutInstance.current.destroy();
    if (chartDoughnutRef.current) {
      chartDoughnutInstance.current = new Chart(chartDoughnutRef.current, {
        type: 'doughnut',
        data: {
          labels: ['Aktif', 'Tidak Aktif'],
          datasets: [{ data: [totalAktif, totalNonAktif], backgroundColor: ['#10b981', '#ef4444'], borderColor: '#fff', borderWidth: 3, hoverOffset: 10 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false, cutout: '65%',
          plugins: {
            legend: { display: true, position: 'bottom', labels: { usePointStyle: true, font: { family: 'Inter', size: 11 } } },
          },
        },
      });
    }

    // ===== PIE CHART: Pemetaan =====
    if (chartPieInstance.current) chartPieInstance.current.destroy();
    if (chartPieRef.current) {
      const belumTerpetakan = totalKoperasi - totalTerpetakan;
      chartPieInstance.current = new Chart(chartPieRef.current, {
        type: 'pie',
        data: {
          labels: ['Sudah Terpetakan', 'Belum Terpetakan'],
          datasets: [{ data: [totalTerpetakan, belumTerpetakan], backgroundColor: ['#3b82f6', '#f59e0b'], borderColor: '#fff', borderWidth: 3, hoverOffset: 10 }],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: {
            legend: { display: true, position: 'bottom', labels: { usePointStyle: true, font: { family: 'Inter', size: 11 } } },
          },
        },
      });
    }
  }

  function toggleSidebar() {
    if (window.innerWidth <= 992) setSidebarOpen(!sidebarOpen);
    else {
      const sb = document.getElementById('sidebar');
      sb?.classList.toggle('collapsed');
    }
  }

  return (
    <>
      <Loader text="Memuat Data.." visible={loading} />

      <Header title="Dashboard Statistik" icon="fa-chart-line" statsContent={statsText} onRefresh={loadData}>
        <button className="menu-toggle-btn" onClick={toggleSidebar} title="Toggle Menu">
          <i className="fas fa-bars" />
        </button>
      </Header>

      <div id="layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div id="view-statistik">
          {/* Filter Row */}
          <div className="stat-filter-row">
            <h3><i className="fas fa-filter" style={{ color: 'var(--primary)' }} /> Filter Wilayah</h3>
            <select className="filter-select" value={filterKabupaten} onChange={e => { setFilterKabupaten(e.target.value); setFilterKecamatan(''); }}>
              <option value="">— Seluruh Kabupaten/Kota —</option>
              {kabupatenList.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <select className="filter-select" value={filterKecamatan} onChange={e => setFilterKecamatan(e.target.value)} disabled={!filterKabupaten}>
              <option value="">— Seluruh Kecamatan —</option>
              {kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}
            </select>
            <button className="btn-reset-filter" onClick={() => { setFilterKabupaten(''); setFilterKecamatan(''); }}>
              <i className="fas fa-undo-alt" /> Reset
            </button>
          </div>

          {/* KPI Cards */}
          <div className="kpi-grid">
            <div className="kpi-card">
              <div className="kpi-icon icon-blue"><i className="fas fa-building" /></div>
              <div className="kpi-details">
                <div className="kpi-title">Total Koperasi</div>
                <div className="kpi-value">{totalKoperasi}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon icon-green"><i className="fas fa-check-circle" /></div>
              <div className="kpi-details">
                <div className="kpi-title">Koperasi Aktif</div>
                <div className="kpi-value">{totalAktif}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon icon-red"><i className="fas fa-times-circle" /></div>
              <div className="kpi-details">
                <div className="kpi-title">Tidak Aktif</div>
                <div className="kpi-value">{totalNonAktif}</div>
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-icon icon-orange"><i className="fas fa-map-marker-alt" /></div>
              <div className="kpi-details">
                <div className="kpi-title">Sudah Terpetakan</div>
                <div className="kpi-value">{totalTerpetakan}</div>
              </div>
            </div>
          </div>

          {/* Charts */}
          <div className="charts-grid">
            <div className="chart-card">
              <div className="chart-header"><i className="fas fa-chart-bar" style={{ color: 'var(--primary)' }} /> Distribusi Koperasi per {filterKabupaten ? 'Kecamatan' : 'Kabupaten/Kota'}</div>
              <div className="chart-wrapper"><canvas ref={chartBarRef} /></div>
            </div>
            <div className="chart-card">
              <div className="chart-header"><i className="fas fa-chart-pie" style={{ color: 'var(--primary)' }} /> Status Operasional</div>
              <div className="chart-wrapper"><canvas ref={chartDoughnutRef} /></div>
            </div>
          </div>

          <div className="charts-grid" style={{ gridTemplateColumns: '1fr 2fr' }}>
            <div className="chart-card">
              <div className="chart-header"><i className="fas fa-map" style={{ color: 'var(--primary)' }} /> Status Pemetaan</div>
              <div className="chart-wrapper"><canvas ref={chartPieRef} /></div>
            </div>
            <div className="chart-card">
              <div className="chart-header"><i className="fas fa-info-circle" style={{ color: 'var(--primary)' }} /> Ringkasan Statistik</div>
              <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Persentase Aktif</span>
                  <span style={{ fontSize: 15, color: 'var(--aktif)', fontWeight: 800 }}>{totalKoperasi > 0 ? ((totalAktif / totalKoperasi) * 100).toFixed(1) : 0}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Persentase Terpetakan</span>
                  <span style={{ fontSize: 15, color: '#3b82f6', fontWeight: 800 }}>{totalKoperasi > 0 ? ((totalTerpetakan / totalKoperasi) * 100).toFixed(1) : 0}%</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Jumlah Kabupaten/Kota</span>
                  <span style={{ fontSize: 15, color: 'var(--text-main)', fontWeight: 800 }}>{kabupatenList.length}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 600 }}>Wilayah Terbanyak</span>
                  <span style={{ fontSize: 13, color: 'var(--text-main)', fontWeight: 700 }}>
                    {(() => {
                      if (filteredData.length === 0) return '-';
                      const counts = {};
                      filteredData.forEach(i => { const k = filterKabupaten ? (i.kecamatan || 'Lainnya') : (i.kabupaten || 'Lainnya'); counts[k] = (counts[k] || 0) + 1; });
                      const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
                      return sorted.length > 0 ? `${sorted[0][0]} (${sorted[0][1]})` : '-';
                    })()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
