'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Swal from 'sweetalert2';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Loader from '@/components/Loader';
import { useSession } from '@/components/SessionProvider';
import { fetchMapData, saveKoperasiData, uploadImage, cleanCoordinate, convertDriveUrl } from '@/lib/api';
import { DEFAULT_TABLE_COLUMNS, DEFAULT_NO_IMAGE, STANDARD_HEADERS } from '@/lib/constants';

// Lazy-load XLSX untuk export Excel
let XLSX;
if (typeof window !== 'undefined') {
  import('xlsx').then((mod) => { XLSX = mod.default || mod; });
}

export default function HomePage() {
  const { isAdmin } = useSession();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loaderText, setLoaderText] = useState('Memuat Data..');

  // Data state
  const [rawData, setRawData] = useState([]);
  const [dynamicHeaders, setDynamicHeaders] = useState([]);
  const [currentFilteredData, setCurrentFilteredData] = useState([]);
  const [currentMapData, setCurrentMapData] = useState([]);
  const [statsText, setStatsText] = useState(null);

  // Table state
  const [tableColumnsConfig, setTableColumnsConfig] = useState([...DEFAULT_TABLE_COLUMNS]);
  const [visibleCols, setVisibleCols] = useState(DEFAULT_TABLE_COLUMNS.filter(c => c.default).map(c => c.id));
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState('all');
  const [sortCol, setSortCol] = useState(null);
  const [sortAsc, setSortAsc] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tableCollapsed, setTableCollapsed] = useState(false);

  // Filter state
  const [filterKabupaten, setFilterKabupaten] = useState('');
  const [filterKecamatan, setFilterKecamatan] = useState('');
  const [filterDesa, setFilterDesa] = useState('');
  const [checkedStatus, setCheckedStatus] = useState([]);
  const [checkedGerai, setCheckedGerai] = useState([]);
  const [checkedKesehatan, setCheckedKesehatan] = useState([]);
  const [advSearchOpen, setAdvSearchOpen] = useState(false);
  const [colMenuOpen, setColMenuOpen] = useState(false);

  // Info panel & edit state
  const [currentItem, setCurrentItem] = useState(null);
  const [infoPanelVisible, setInfoPanelVisible] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [panelMinimized, setPanelMinimized] = useState(false);
  const [selectedRowId, setSelectedRowId] = useState(null);

  // Refs
  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markersLayerRef = useRef(null);
  const labelsLayerRef = useRef(null);
  const boundaryGroupRef = useRef(null);
  const geoJsonLayerRef = useRef(null);
  const boundaryDataRef = useRef(null);
  const allMarkersRef = useRef([]);
  const lastSelectedMarkerRef = useRef(null);
  const tempEditMarkerRef = useRef(null);
  const userMarkerRef = useRef(null);
  const userCircleRef = useRef(null);
  const sortableRef = useRef(null);
  const LRef = useRef(null);
  const resizerActive = useRef(false);
  const isAdminRef = useRef(false);

  // Dropdown data (derived)
  const kabupatenList = [...new Set(rawData.map(i => i.kabupaten))].filter(Boolean).sort();
  const kecamatanList = filterKabupaten ? [...new Set(rawData.filter(i => i.kabupaten === filterKabupaten).map(i => i.kecamatan))].filter(Boolean).sort() : [];
  const desaList = filterKecamatan ? [...new Set(rawData.filter(i => i.kecamatan === filterKecamatan).map(i => i.desa))].filter(Boolean).sort() : [];

  // Unique checkbox values
  const uniqueStatus = [...new Set(rawData.map(i => String(i.status).trim()))].filter(v => v && v !== '-' && v !== 'undefined' && v !== 'null').sort();
  const uniqueGerai = [...new Set(rawData.map(i => String(i.gerai).trim()))].filter(v => v && v !== '-' && v !== 'undefined' && v !== 'null').sort();
  const uniqueKesehatan = [...new Set(rawData.map(i => String(i.kesehatan).trim()))].filter(v => v && v !== '-' && v !== 'undefined' && v !== 'null').sort();

  // ========== INIT MAP ==========
  useEffect(() => {
    if (typeof window === 'undefined') return;
    let cancelled = false;

    async function initMap() {
      const L = (await import('leaflet')).default;
      LRef.current = L;

      // Fix default Leaflet icon paths
      delete L.Icon.Default.prototype._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
        iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
        shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
      });

      if (cancelled || !mapRef.current || mapInstanceRef.current) return;

      const satellite = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '© Google Satellite' });
      const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' });
      const googleTerrain = L.tileLayer('https://{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}', { maxZoom: 22, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: 'Google Terrain' });
      const esri = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { maxZoom: 19, attribution: 'Tiles © Esri' });

      const map = L.map(mapRef.current, { zoomControl: false, layers: [osm] }).setView([-4.0, 122.5], 8);
      mapInstanceRef.current = map;

      const bg = L.featureGroup().addTo(map);
      const ml = L.featureGroup().addTo(map);
      const ll = L.featureGroup().addTo(map);
      boundaryGroupRef.current = bg;
      markersLayerRef.current = ml;
      labelsLayerRef.current = ll;

      L.control.layers({ "Open Street Map": osm, "Google Satellite": satellite, "Google Terrain": googleTerrain, "ESRI": esri }, { "Batas Wilayah (Kecamatan)": bg }, { position: 'bottomleft' }).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      map.on('zoomend', () => {
        if (map.getZoom() > 13.5) { if (!map.hasLayer(ll)) map.addLayer(ll); }
        else { if (map.hasLayer(ll)) map.removeLayer(ll); }
      });

      map.on('click', (e) => {
        if (!isEditModeRef.current || !isAdminRef.current) return;
        const latInput = document.getElementById('edit-lat');
        const lngInput = document.getElementById('edit-lng');
        if (latInput) latInput.value = e.latlng.lat.toFixed(8);
        if (lngInput) lngInput.value = e.latlng.lng.toFixed(8);
        if (tempEditMarkerRef.current) map.removeLayer(tempEditMarkerRef.current);
        tempEditMarkerRef.current = L.marker(e.latlng).addTo(map);
      });

      // Load boundary GeoJSON
      try {
        const resp = await fetch('/kecamatan.geojson');
        if (resp.ok) boundaryDataRef.current = await resp.json();
      } catch (err) { console.warn("Gagal memuat GeoJSON:", err); }

      // Load data
      loadData();
    }

    initMap();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mutable refs for map click handler (closures)
  const isEditModeRef = useRef(false);
  useEffect(() => { isEditModeRef.current = isEditMode; }, [isEditMode]);
  useEffect(() => { isAdminRef.current = isAdmin; }, [isAdmin]);

  // ========== LOAD DATA ==========
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
        Swal.fire({ icon: 'error', title: 'Gagal', text: "Gagal memuat data: " + res.message });
      }
    } catch (error) {
      setLoading(false);
      console.error("Fetch error:", error);
      Swal.fire({ icon: 'error', title: 'Gagal', text: "Gagal mengambil data dari server." });
    }
  }, []);

  // ========== FILTER & SEARCH ==========
  useEffect(() => {
    let mapData = rawData.filter(i => {
      const matchKab = (filterKabupaten === '' || i.kabupaten === filterKabupaten);
      const matchKec = (filterKecamatan === '' || i.kecamatan === filterKecamatan);
      const matchDesa = (filterDesa === '' || i.desa === filterDesa);
      const matchStatus = checkedStatus.length === 0 || checkedStatus.includes(String(i.status).trim());
      const matchGerai = checkedGerai.length === 0 || checkedGerai.includes(String(i.gerai).trim());
      const matchKesehatan = checkedKesehatan.length === 0 || checkedKesehatan.includes(String(i.kesehatan).trim());
      return matchKab && matchKec && matchDesa && matchStatus && matchGerai && matchKesehatan;
    });
    setCurrentMapData(mapData);

    const q = searchQuery.toLowerCase();
    let filtered = mapData.filter(i => {
      return (String(i.nama || '').toLowerCase().includes(q) || String(i.desa || '').toLowerCase().includes(q) || String(i.nik || '').toLowerCase().includes(q) || String(i.pengurus || '').toLowerCase().includes(q));
    });
    setCurrentFilteredData(filtered);
    setCurrentPage(1);

    // Update boundary
    updateBoundaryLayer(filterKabupaten, filterKecamatan);
  }, [rawData, filterKabupaten, filterKecamatan, filterDesa, searchQuery, checkedStatus, checkedGerai, checkedKesehatan]); // eslint-disable-line react-hooks/exhaustive-deps

  // ========== RENDER MAP MARKERS ==========
  useEffect(() => {
    const L = LRef.current;
    const map = mapInstanceRef.current;
    if (!L || !map || !markersLayerRef.current) return;

    markersLayerRef.current.clearLayers();
    labelsLayerRef.current.clearLayers();
    allMarkersRef.current = [];

    currentMapData.forEach(item => {
      const latVal = parseFloat(item.lat);
      const lngVal = parseFloat(item.lng);
      const hasCoords = !isNaN(latVal) && !isNaN(lngVal);
      const isAktif = String(item.status || '').toLowerCase().includes('aktif') && !String(item.status || '').toLowerCase().includes('tidak');
      const baseColor = isAktif ? 'var(--aktif)' : 'var(--non-aktif)';

      if (hasCoords) {
        const customIcon = L.divIcon({
          className: 'custom-logo-marker',
          html: `<div style="width:34px;height:34px;background:white;border-radius:50%;border:3px solid ${baseColor};box-shadow:0 4px 8px rgba(0,0,0,0.3);display:flex;align-items:center;justify-content:center;overflow:hidden;transition:all 0.3s ease;"><img src="/kopkel128.png" style="width:20px;height:20px;object-fit:contain;"></div>`,
          iconSize: [34, 34], iconAnchor: [17, 17], tooltipAnchor: [0, -20],
        });

        const marker = L.marker([latVal, lngVal], { icon: customIcon });
        marker.bindTooltip(`<b>${item.nama}</b><br><small style="color:#cbd5e1;font-weight:400;">Desa ${item.desa}</small>`, { className: 'leaflet-tooltip-koperasi', direction: 'top', offset: [0, -5] });
        marker.on('click', () => selectItem(item, marker));
        markersLayerRef.current.addLayer(marker);
        allMarkersRef.current.push({ marker, data: item, baseColor });

        const labelMarker = L.marker([latVal, lngVal], {
          icon: L.divIcon({ className: 'custom-map-label', html: `<div>${item.nama}</div>`, iconSize: [0, 0], iconAnchor: [0, 0] }), interactive: false,
        });
        labelsLayerRef.current.addLayer(labelMarker);
      }
    });

    // Update stats
    const total = currentMapData.length;
    const withCoords = currentMapData.filter(item => item.lat !== null && !isNaN(parseFloat(item.lat))).length;
    setStatsText(<><i className="fas fa-chart-pie" /> {withCoords} dari {total} Terpetakan</>);

    if (map.getZoom() <= 13.5 && map.hasLayer(labelsLayerRef.current)) {
      map.removeLayer(labelsLayerRef.current);
    }
  }, [currentMapData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fit map to all markers on first load
  useEffect(() => {
    if (rawData.length > 0 && markersLayerRef.current && mapInstanceRef.current) {
      setTimeout(() => {
        if (markersLayerRef.current.getLayers().length > 0) {
          mapInstanceRef.current.fitBounds(markersLayerRef.current.getBounds(), { padding: [50, 50], maxZoom: 13, duration: 1 });
        } else {
          mapInstanceRef.current.setView([-4.0, 122.5], 8);
        }
      }, 100);
    }
  }, [rawData]);

  // ========== BOUNDARY ==========
  function updateBoundaryLayer(kabupaten, kecamatan) {
    const L = LRef.current;
    if (!L || !boundaryGroupRef.current) return;
    boundaryGroupRef.current.clearLayers();
    geoJsonLayerRef.current = null;
    if (!boundaryDataRef.current || (!kabupaten && !kecamatan)) return;

    let validKecList = [];
    if (kabupaten && !kecamatan) {
      validKecList = [...new Set(rawData.filter(i => i.kabupaten === kabupaten).map(i => String(i.kecamatan).toUpperCase()))];
    }

    const layer = L.geoJSON(boundaryDataRef.current, {
      filter: (feature) => {
        const propKec = feature.properties.nm_kecamatan || feature.properties.WADMKC || feature.properties.KECAMATAN || feature.properties.kecamatan || feature.properties.NAMOBJ;
        if (!propKec) return false;
        if (kecamatan !== '') return propKec.toUpperCase() === kecamatan.toUpperCase();
        else if (kabupaten !== '' && validKecList.length > 0) return validKecList.includes(propKec.toUpperCase());
        return false;
      },
      style: () => ({ color: 'var(--primary)', weight: 2, fillColor: 'var(--primary)', fillOpacity: 0.1, dashArray: '5, 5' }),
      interactive: false,
    }).addTo(boundaryGroupRef.current);
    geoJsonLayerRef.current = layer;

    if (layer.getBounds().isValid() && mapInstanceRef.current.hasLayer(boundaryGroupRef.current)) {
      mapInstanceRef.current.fitBounds(layer.getBounds(), { padding: [50, 50], duration: 1 });
    }
  }

  // ========== SELECT ITEM ==========
  function selectItem(item, marker) {
    if (lastSelectedMarkerRef.current) {
      const mData = allMarkersRef.current.find(m => m.marker === lastSelectedMarkerRef.current);
      if (mData) {
        const divEl = lastSelectedMarkerRef.current.getElement()?.querySelector('div');
        if (divEl) { divEl.style.border = `3px solid ${mData.baseColor}`; divEl.style.transform = 'scale(1)'; }
      }
    }
    if (marker) {
      const divEl = marker.getElement()?.querySelector('div');
      if (divEl) { divEl.style.border = '3px solid var(--highlight)'; divEl.style.transform = 'scale(1.2)'; }
      lastSelectedMarkerRef.current = marker;
    }
    setSelectedRowId(item.id);
    setCurrentItem(item);
    setInfoPanelVisible(true);
    setIsEditMode(false);
    setPanelMinimized(false);
  }

  // ========== SORT ==========
  const sortedData = (() => {
    if (!sortCol) return currentFilteredData;
    return [...currentFilteredData].sort((a, b) => {
      let valA = sortCol === 'no' ? parseInt(a.id) : a[sortCol];
      let valB = sortCol === 'no' ? parseInt(b.id) : b[sortCol];
      valA = (valA === null || valA === undefined || valA === '-') ? '' : valA;
      valB = (valB === null || valB === undefined || valB === '-') ? '' : valB;
      if (!isNaN(valA) && !isNaN(valB) && valA !== '' && valB !== '') { valA = parseFloat(valA); valB = parseFloat(valB); }
      else { valA = valA.toString().toLowerCase(); valB = valB.toString().toLowerCase(); }
      if (valA < valB) return sortAsc ? -1 : 1;
      if (valA > valB) return sortAsc ? 1 : -1;
      return 0;
    });
  })();

  // Pagination
  const totalItems = sortedData.length;
  const paginatedData = itemsPerPage === 'all' ? sortedData : sortedData.slice((currentPage - 1) * parseInt(itemsPerPage), currentPage * parseInt(itemsPerPage));
  const maxPage = itemsPerPage === 'all' ? 1 : Math.ceil(totalItems / parseInt(itemsPerPage)) || 1;

  // ========== HANDLERS ==========
  function handleSort(colId) {
    if (sortCol === colId) setSortAsc(!sortAsc);
    else { setSortCol(colId); setSortAsc(true); }
    setCurrentPage(1);
  }

  function toggleSidebar() {
    if (window.innerWidth <= 992) setSidebarOpen(!sidebarOpen);
    else {
      const sb = document.getElementById('sidebar');
      sb?.classList.toggle('collapsed');
      setTimeout(() => mapInstanceRef.current?.invalidateSize(), 300);
    }
  }

  function locateUser() {
    if (!navigator.geolocation) { Swal.fire({ icon: 'warning', title: 'Perhatian', text: 'Fitur Geolocation tidak didukung.' }); return; }
    navigator.geolocation.getCurrentPosition((pos) => {
      const { latitude: lat, longitude: lng, accuracy } = pos.coords;
      showUserLocation(lat, lng, accuracy);
      mapInstanceRef.current?.flyTo([lat, lng], 15, { duration: 1.5 });
    }, (err) => Swal.fire({ icon: 'error', title: 'Gagal', text: 'Gagal mendeteksi lokasi: ' + err.message }), { enableHighAccuracy: false });
  }

  function showUserLocation(lat, lng, accuracy) {
    const L = LRef.current;
    if (!L || !mapInstanceRef.current) return;
    if (userMarkerRef.current) mapInstanceRef.current.removeLayer(userMarkerRef.current);
    if (userCircleRef.current) mapInstanceRef.current.removeLayer(userCircleRef.current);
    userCircleRef.current = L.circle([lat, lng], { radius: accuracy, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: 0.15, weight: 1 }).addTo(mapInstanceRef.current);
    const dotIcon = L.divIcon({ className: 'custom-user-dot', html: '<div class="blue-dot"></div>', iconSize: [14, 14], iconAnchor: [7, 7] });
    userMarkerRef.current = L.marker([lat, lng], { icon: dotIcon, zIndexOffset: 1000 }).addTo(mapInstanceRef.current);
    userMarkerRef.current.bindPopup('<b>Lokasi Anda Saat Ini</b>').openPopup();
  }

  function exportToExcel() {
    if (currentFilteredData.length === 0) { Swal.fire({ icon: 'warning', title: 'Perhatian', text: 'Tidak ada data untuk diekspor!' }); return; }
    if (!XLSX) { Swal.fire({ icon: 'info', title: 'Memuat', text: 'Pustaka export Excel sedang dimuat, coba beberapa saat lagi.' }); return; }
    const dataToExport = currentFilteredData.map((i, index) => {
      let rowObj = { "No": index + 1, "Nama Koperasi": i.nama || "-", "Status": i.status || "-", "Kabupaten/Kota": i.kabupaten || "-", "Kecamatan": i.kecamatan || "-", "Desa/Kelurahan": i.desa || "-", "Kode Pos": i.kode_pos || "-", "NIK": i.nik || "-", "Pengurus": i.pengurus || "-", "Pengawas": i.pengawas || "-", "Jumlah Anggota": i['jumlah anggota'] || "-", "Unit Gerai": i.gerai || "-", "Kesehatan": i.kesehatan || "-", "Latitude": i.lat || "-", "Longitude": i.lng || "-" };
      dynamicHeaders.forEach(h => { rowObj[h] = i[h] || "-"; });
      return rowObj;
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data Koperasi");
    XLSX.writeFile(wb, `Data_Koperasi_Merah_Putih_${Date.now()}.xlsx`);
  }

  // ========== SAVE DATA ==========
  async function handleSaveData() {
    if (!isAdmin || !currentItem) return;
    let payloadData = { id: currentItem.id };
    payloadData.dynamicFields = {};

    document.querySelectorAll('.dynamic-input-field').forEach(input => {
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
        if (res.newId) { localUpdateData.id = res.newId; }
        // Update local data
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
        setIsEditMode(false);
        Swal.fire({ icon: 'success', title: 'Berhasil', text: 'Data berhasil disimpan!', timer: 1500, showConfirmButton: false });
      } else { setLoading(false); Swal.fire({ icon: 'error', title: 'Gagal', text: 'Gagal sinkronisasi data: ' + (res?.message || 'Unknown error') }); }
    } catch (error) { setLoading(false); console.error(error); Swal.fire({ icon: 'error', title: 'Gagal', text: 'Koneksi gagal.' }); }
  }

  // ========== IMAGE UPLOAD ==========
  async function handleImageUpload() {
    const fileInput = document.getElementById('upload-foto');
    const statusText = document.getElementById('upload-status');
    const fotoUrlField = document.getElementById('edit-foto');
    if (!fileInput || fileInput.files.length === 0) { if (statusText) statusText.innerText = 'Pilih file gambar terlebih dahulu.'; return; }
    statusText.innerText = `Mengunggah 0 dari ${fileInput.files.length} gambar...`;
    statusText.style.color = 'var(--highlight)';
    let uploadedUrls = [];
    for (let i = 0; i < fileInput.files.length; i++) {
      const file = fileInput.files[i];
      const base64Data = await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.split(',')[1]); reader.readAsDataURL(file); });
      try {
        const res = await uploadImage(base64Data, file.type, Date.now() + '_' + file.name);
        if (res.success) { uploadedUrls.push(res.url); statusText.innerText = `Mengunggah ${i + 1} dari ${fileInput.files.length} gambar...`; }
        else Swal.fire({ icon: 'error', title: 'Gagal', text: `Gagal mengunggah ${file.name}: ${res.message}` });
      } catch (err) { Swal.fire({ icon: 'error', title: 'Terputus', text: `Koneksi terputus saat mengunggah ${file.name}` }); }
    }
    if (uploadedUrls.length > 0) {
      statusText.innerText = 'Berhasil diunggah!';
      statusText.style.color = 'var(--aktif)';
      const currentVal = fotoUrlField.value.trim();
      fotoUrlField.value = (currentVal && currentVal !== '-') ? currentVal + ', ' + uploadedUrls.join(', ') : uploadedUrls.join(', ');
    }
  }

  // ========== UPLOAD EVENT BRIDGE ==========
  useEffect(() => {
    function onStartUpload() { handleImageUpload(); }
    document.addEventListener('startUpload', onStartUpload);
    return () => document.removeEventListener('startUpload', onStartUpload);
  });

  // ========== RESIZER ==========
  useEffect(() => {
    const resizer = document.getElementById('resizer');
    if (!resizer) return;
    const topPanel = document.getElementById('map-container');
    const bottomPanel = document.getElementById('table-container');

    function handleMouseDown(e) { resizerActive.current = true; document.body.style.cursor = 'row-resize'; e.preventDefault(); }
    function handleMove(e) {
      if (!resizerActive.current) return;
      const container = document.getElementById('content-wrapper');
      if (container?.classList.contains('table-collapsed')) return;
      const containerRect = container.getBoundingClientRect();
      let newBasis = ((e.clientY - containerRect.top) / containerRect.height) * 100;
      if (newBasis < 20) newBasis = 20; if (newBasis > 80) newBasis = 80;
      topPanel.style.flex = `0 0 ${newBasis}%`;
      bottomPanel.style.flex = '1 1 0%';
    }
    function handleUp() { if (resizerActive.current) { resizerActive.current = false; document.body.style.cursor = ''; mapInstanceRef.current?.invalidateSize(); } }

    resizer.addEventListener('mousedown', handleMouseDown);
    resizer.addEventListener('touchstart', () => { resizerActive.current = true; }, { passive: true });
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('touchmove', (e) => { if (resizerActive.current) handleMove(e.touches[0]); }, { passive: false });
    document.addEventListener('mouseup', handleUp);
    document.addEventListener('touchend', handleUp);

    return () => {
      resizer.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mouseup', handleUp);
      document.removeEventListener('touchend', handleUp);
    };
  }, []);

  // ========== RENDER INFO PANEL CONTENT ==========
  function renderInfoPanelContent() {
    if (!currentItem) return null;
    const isAktif = String(currentItem.status || '').toLowerCase().includes('aktif') && !String(currentItem.status || '').toLowerCase().includes('tidak');
    const statusColor = isAktif ? 'var(--aktif)' : 'var(--non-aktif)';
    const latVal = parseFloat(currentItem.lat); const lngVal = parseFloat(currentItem.lng);
    const hasCoords = !isNaN(latVal) && !isNaN(lngVal);

    // Image slider
    let rawFoto = (currentItem.foto && currentItem.foto !== '-') ? String(currentItem.foto).split(',') : [];
    let imageArray = rawFoto.map(f => convertDriveUrl(f)).filter(f => f !== '');
    if (imageArray.length === 0) imageArray = [DEFAULT_NO_IMAGE];

    if (isEditMode) {
      return (
        <div className="detail-only" dangerouslySetInnerHTML={{
          __html: `
            <div class="hint-box"><i class="fas fa-crosshairs"></i> Klik peta untuk ubah koordinat lokasi.</div>
            <div class="info-row"><label>Nama Koperasi</label><input type="text" id="edit-nama" data-header="nama" class="edit-input dynamic-input-field" value="${currentItem.nama || ''}"></div>
            <div class="info-row"><label>Status Koperasi</label><select id="edit-status" data-header="status" class="edit-input dynamic-input-field"><option value="Aktif" ${isAktif ? 'selected' : ''}>Aktif</option><option value="Tidak Aktif" ${!isAktif ? 'selected' : ''}>Tidak Aktif</option></select></div>
            <div class="info-row"><label>URL</label><input type="text" id="edit-url" data-header="url" class="edit-input dynamic-input-field" value="${currentItem.url === '-' ? '' : (currentItem.url || '')}"></div>
            <hr style="border:0;border-top:1px dashed var(--border);margin:15px 0;">
            <div class="info-row"><label>Alamat Lengkap</label><input type="text" id="edit-alamat" data-header="alamat" class="edit-input dynamic-input-field" value="${currentItem.alamat === '-' ? '' : (currentItem.alamat || '')}"></div>
            <div style="display:flex;gap:12px"><div class="info-row" style="flex:1"><label>Desa/Kel</label><input type="text" id="edit-desa" data-header="desa" class="edit-input dynamic-input-field" value="${currentItem.desa === '-' ? '' : (currentItem.desa || '')}"></div><div class="info-row" style="flex:1"><label>Kecamatan</label><input type="text" id="edit-kecamatan" data-header="kecamatan" class="edit-input dynamic-input-field" value="${currentItem.kecamatan === '-' ? '' : (currentItem.kecamatan || '')}"></div></div>
            <div style="display:flex;gap:12px"><div class="info-row" style="flex:1"><label>Kab/Kota</label><input type="text" id="edit-kabupaten" data-header="kabupaten" class="edit-input dynamic-input-field" value="${currentItem.kabupaten === '-' ? '' : (currentItem.kabupaten || '')}"></div><div class="info-row" style="flex:1"><label>Kode Pos</label><input type="text" id="edit-kode_pos" data-header="kode_pos" class="edit-input dynamic-input-field" value="${currentItem.kode_pos === '-' ? '' : (currentItem.kode_pos || '')}"></div></div>
            <div style="display:flex;gap:12px"><div class="info-row" style="flex:1"><label>Latitude (Y)</label><input type="text" id="edit-lat" data-header="lat" class="edit-input dynamic-input-field" value="${currentItem.lat || ''}"></div><div class="info-row" style="flex:1"><label>Longitude (X)</label><input type="text" id="edit-lng" data-header="lng" class="edit-input dynamic-input-field" value="${currentItem.lng || ''}"></div></div>
            <hr style="border:0;border-top:1px dashed var(--border);margin:15px 0;">
            <div class="info-row"><label>NIK</label><input type="text" data-header="nik" class="edit-input dynamic-input-field" value="${currentItem.nik === '-' ? '' : (currentItem.nik || '')}"></div>
            <div class="info-row"><label>SK AHU</label><input type="text" data-header="ahu" class="edit-input dynamic-input-field" value="${currentItem.ahu === '-' ? '' : (currentItem.ahu || '')}"></div>
            <div class="info-row"><label>Jenis Koperasi</label><input type="text" data-header="jenis koperasi" class="edit-input dynamic-input-field" value="${currentItem['jenis koperasi'] === '-' ? '' : (currentItem['jenis koperasi'] || '')}"></div>
            <div class="info-row"><label>Tahun Pendirian</label><input type="text" data-header="tahun pendirian" class="edit-input dynamic-input-field" value="${currentItem['tahun pendirian'] === '-' ? '' : (currentItem['tahun pendirian'] || '')}"></div>
            <div class="info-row"><label>Nama Pengurus</label><input type="text" data-header="pengurus" class="edit-input dynamic-input-field" value="${currentItem.pengurus === '-' ? '' : (currentItem.pengurus || '')}"></div>
            <div class="info-row"><label>Nama Pengawas</label><input type="text" data-header="pengawas" class="edit-input dynamic-input-field" value="${currentItem.pengawas === '-' ? '' : (currentItem.pengawas || '')}"></div>
            <div class="info-row"><label>Jumlah Anggota</label><input type="text" data-header="jumlah anggota" class="edit-input dynamic-input-field" value="${currentItem['jumlah anggota'] === '-' ? '' : (currentItem['jumlah anggota'] || '')}"></div>
            <div class="info-row"><label>Sektor Usaha</label><input type="text" data-header="sektor usaha" class="edit-input dynamic-input-field" value="${currentItem['sektor usaha'] === '-' ? '' : (currentItem['sektor usaha'] || '')}"></div>
            <div class="info-row"><label>Unit Gerai</label><input type="text" data-header="gerai" class="edit-input dynamic-input-field" value="${currentItem.gerai === '-' ? '' : (currentItem.gerai || '')}"></div>
            <div class="info-row"><label>Tingkat Kesehatan</label><input type="text" data-header="kesehatan" class="edit-input dynamic-input-field" value="${currentItem.kesehatan === '-' ? '' : (currentItem.kesehatan || '')}"></div>
            <div class="info-row"><label>Unggah Gambar Baru</label><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;"><input type="file" id="upload-foto" accept="image/*" multiple style="font-size:11px;flex:1;min-width:0;"><button onclick="document.dispatchEvent(new CustomEvent('startUpload'))" class="btn-save" style="width:auto;margin:0;padding:6px 14px;font-size:11px;flex-shrink:0;"><i class='fas fa-cloud-upload-alt'></i> Unggah</button></div><div id="upload-status" style="font-size:11px;font-weight:600;color:var(--primary);margin-top:6px;"></div></div>
            <div class="info-row"><label>Tautan URL Foto (Pisahkan koma)</label><textarea id="edit-foto" data-header="foto" class="edit-input dynamic-input-field" style="resize:vertical;height:60px;">${currentItem.foto === '-' ? '' : (currentItem.foto || '')}</textarea></div>
          `
        }} />
      );
    }

    // View mode
    return (
      <>
        <div className="detail-only">
          <SliderComponent images={imageArray} />
        </div>
        <div className="info-row"><label>Status Operasional</label><span style={{ color: statusColor, fontWeight: 700 }}><i className="fas fa-circle" style={{ fontSize: 10, marginRight: 4 }} /> {currentItem.status || '-'}</span></div>
        <div className="info-row"><label>Alamat & Lokasi Wilayah</label><span>{currentItem.alamat && currentItem.alamat !== '-' ? currentItem.alamat + ', ' : ''}{currentItem.desa || '-'}, {currentItem.kecamatan || '-'}, {currentItem.kabupaten || '-'}</span></div>
        <div className="detail-only">
          <hr style={{ border: 0, borderTop: '1px dashed var(--border)', margin: '15px 0' }} />
          <div className="info-row"><label>Nomor Induk Koperasi (NIK)</label><span>{currentItem.nik || '-'}</span></div>
          <div className="info-row"><label>SK AHU</label><span>{currentItem.ahu || currentItem.sk_ahu || '-'}</span></div>
          <div className="info-row"><label>Jenis Koperasi</label><span>{currentItem['jenis koperasi'] || '-'}</span></div>
          <hr style={{ border: 0, borderTop: '1px dashed var(--border)', margin: '15px 0' }} />
          <div style={{ marginBottom: 10 }}><label style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>INFORMASI TAMBAHAN</label></div>
          <div className="info-row"><label>Tahun Pendirian</label><span>{currentItem['tahun pendirian'] || '-'}</span></div>
          <div className="info-row"><label>Nama Pengurus</label><span>{currentItem.pengurus || '-'}</span></div>
          <div className="info-row"><label>Nama Pengawas</label><span>{currentItem.pengawas || '-'}</span></div>
          <div className="info-row"><label>Jumlah Anggota</label><span>{currentItem['jumlah anggota'] || '-'}</span></div>
          <div className="info-row"><label>Sektor Usaha</label><span>{currentItem['sektor usaha'] || '-'}</span></div>
          <div className="info-row"><label>Unit Gerai Usaha</label><span>{currentItem.gerai || '-'}</span></div>
          <div className="info-row"><label>Penilaian Kesehatan</label><span>{currentItem.kesehatan || '-'}</span></div>
          <div className="info-row" style={{ marginTop: 15 }}>
            <label>Navigasi Peta</label>
            {hasCoords ? <a href={`https://www.google.com/maps/search/?api=1&query=${latVal},${lngVal}`} target="_blank" rel="noopener noreferrer" className="gmaps-link"><i className="fas fa-location-arrow" /> Buka Rute di Google Maps</a> : <span style={{ color: 'var(--non-aktif)', fontSize: 12, fontWeight: 500 }}><i className="fas fa-exclamation-triangle" /> Titik koordinat belum diatur</span>}
          </div>
        </div>
      </>
    );
  }

  // ====================================================
  // RENDER
  // ====================================================
  return (
    <>
      <Loader text={loaderText} visible={loading} />

      {/* Lightbox */}
      <div id="lightbox-overlay" onClick={() => { document.getElementById('lightbox-overlay').style.display = 'none'; }}>
        <button className="lightbox-close"><i className="fas fa-times" /></button>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img id="lightbox-img" src="" alt="Fullscreen" onClick={e => e.stopPropagation()} />
      </div>

      <Header title="Dashboard Koperasi Merah Putih" icon="fa-map-location-dot" statsContent={statsText} onRefresh={loadData}>
        <button className="menu-toggle-btn" onClick={toggleSidebar} title="Toggle Menu">
          <i className="fas fa-bars" />
        </button>
      </Header>

      <div id="layout">
        <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />

        <div id="content-wrapper" className={tableCollapsed ? 'table-collapsed' : ''}>
          <div id="map-container">
            <main id="map" ref={mapRef} />

            <div className="map-floating-buttons">
              <button className="map-btn" onClick={locateUser} title="Tampilkan Lokasi Saya"><i className="fas fa-location-crosshairs" /></button>
              {isAdmin && <button className="map-btn" onClick={() => {
                setLoaderText('Mengukur akurasi tinggi GPS...');
                setLoading(true);
                navigator.geolocation.getCurrentPosition((pos) => {
                  setLoading(false);
                  showUserLocation(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
                  mapInstanceRef.current?.flyTo([pos.coords.latitude, pos.coords.longitude], 18, { duration: 1.5 });
                  Swal.fire({ icon: 'success', title: 'Berhasil', text: `Akurasi: ±${Math.round(pos.coords.accuracy)} meter.` });
                }, (err) => { setLoading(false); Swal.fire({ icon: 'error', title: 'Gagal', text: err.message }); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
              }} title="Cek Akurasi Lokasi (Admin)"><i className="fas fa-satellite" /></button>}
            </div>

            {/* Info Panel */}
            {infoPanelVisible && (
              <div id="info-panel" style={{ display: 'flex' }} className={panelMinimized ? 'minimized' : ''}>
                <div className="panel-header">
                  <h3>{currentItem?.nama || 'Detail Koperasi'}</h3>
                  <div className="panel-controls">
                    {isAdmin && <i className="fas fa-pen" title="Mode Edit" onClick={() => { setIsEditMode(true); setPanelMinimized(false); mapInstanceRef.current?.getContainer().classList.add('picking-location'); }} />}
                    <i className={`fas fa-chevron-${panelMinimized ? 'up' : 'down'}`} title="Sembunyikan/Luaskan" onClick={() => setPanelMinimized(!panelMinimized)} />
                    <i className="fas fa-xmark" title="Tutup Panel" onClick={() => { setInfoPanelVisible(false); setIsEditMode(false); mapInstanceRef.current?.getContainer().classList.remove('picking-location'); if (tempEditMarkerRef.current) { mapInstanceRef.current?.removeLayer(tempEditMarkerRef.current); tempEditMarkerRef.current = null; } }} />
                  </div>
                </div>
                <div className="panel-content">
                  {renderInfoPanelContent()}
                  {isEditMode && (
                    <div className="detail-only">
                      <button className="btn-save" onClick={handleSaveData}><i className="fas fa-cloud-arrow-up" /> Terapkan Pembaruan</button>
                      <button className="btn-save" style={{ background: '#e2e8f0', color: 'var(--text-muted)', marginTop: 6, boxShadow: 'none' }} onClick={() => { setIsEditMode(false); }}>Batalkan</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div id="resizer"><div className="resizer-line" /></div>

          {/* Table */}
          <div id="table-container">
            <div className="table-header-box">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', borderBottom: '1px dashed var(--border)', paddingBottom: 8, marginBottom: 4 }}>
                <h2 style={{ margin: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-main)', cursor: 'pointer', userSelect: 'none' }}
                  onClick={() => {
                    setTableCollapsed(!tableCollapsed);
                    setTimeout(() => mapInstanceRef.current?.invalidateSize(), 300);
                  }}>
                  <i className="fas fa-table" style={{ marginRight: 4, color: 'var(--text-muted)' }} /> Data Koperasi
                  <i className={`fas fa-chevron-${tableCollapsed ? 'up' : 'down'}`} style={{ marginLeft: 8, fontSize: 14, color: 'var(--primary)' }} />
                </h2>
                <div className="table-controls" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div style={{ display: 'flex', alignItems: 'center' }}>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)' }}>Tampilkan:</span>
                    <select className="filter-select" style={{ width: 'auto', padding: '3px 8px', marginLeft: 4, borderRadius: 6 }} value={itemsPerPage} onChange={e => { setItemsPerPage(e.target.value); setCurrentPage(1); }}>
                      <option value="10">10 Baris</option><option value="20">20 Baris</option><option value="50">50 Baris</option><option value="100">100 Baris</option><option value="all">Semua Data</option>
                    </select>
                  </div>

                  <div style={{ position: 'relative' }}>
                    <button className="btn-action" style={{ background: '#fff', color: '#475569', border: '1px solid #cbd5e1' }} onClick={() => setColMenuOpen(!colMenuOpen)}>
                      <i className="fas fa-columns" /> Pilih Kolom
                    </button>
                    {colMenuOpen && (
                      <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 8, background: '#fff', border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 10px 25px rgba(0,0,0,0.1)', zIndex: 50, padding: 12, width: 250, maxHeight: 300, overflowY: 'auto' }}>
                        <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 8, paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between' }}>
                          <span>Tampilkan Kolom</span>
                          <i className="fas fa-times" style={{ cursor: 'pointer', color: '#94a3b8' }} onClick={() => setColMenuOpen(false)} />
                        </div>
                        {tableColumnsConfig.filter(c => c.id !== 'no').map(col => (
                          <label key={col.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, padding: '4px 0', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}>
                            <input type="checkbox" checked={visibleCols.includes(col.id)} onChange={() => {
                              setVisibleCols(prev => prev.includes(col.id) ? prev.filter(c => c !== col.id) : [...prev, col.id]);
                            }} style={{ accentColor: 'var(--primary)' }} />
                            <span>{col.label}</span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>

                  <button className="btn-action btn-export" onClick={exportToExcel}><i className="fas fa-file-excel" /> Ekspor Excel</button>
                </div>
              </div>

              <div className="th-search-row">
                <div className="search-input-wrapper">
                  <input type="text" className="search-input" placeholder="Cari nama, desa, pengurus, NIK..." value={searchQuery} onChange={e => setSearchQuery(e.target.value)} />
                  {searchQuery && <i className="fas fa-times clear-search-btn" style={{ display: 'block' }} onClick={() => setSearchQuery('')} />}
                </div>
                <select className="filter-select" value={filterKabupaten} onChange={e => { setFilterKabupaten(e.target.value); setFilterKecamatan(''); setFilterDesa(''); setSearchQuery(''); }}>
                  <option value="">Semua Kabupaten/Kota</option>
                  {kabupatenList.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select className="filter-select" value={filterKecamatan} onChange={e => { setFilterKecamatan(e.target.value); setFilterDesa(''); setSearchQuery(''); }}>
                  <option value="">Semua Kecamatan</option>
                  {kecamatanList.map(k => <option key={k} value={k}>{k}</option>)}
                </select>
                <select className="filter-select" value={filterDesa} onChange={e => { setFilterDesa(e.target.value); setSearchQuery(''); }}>
                  <option value="">Semua Kelurahan/Desa</option>
                  {desaList.map(d => <option key={d} value={d}>{d}</option>)}
                </select>
                <button className="adv-search-toggle" onClick={() => setAdvSearchOpen(!advSearchOpen)}>
                  <i className="fas fa-sliders-h" /> <span>Kategori</span> <i className={`fas fa-chevron-${advSearchOpen ? 'up' : 'down'}`} />
                </button>
              </div>

              {advSearchOpen && (
                <div className="adv-search-panel active">
                  <div className="filter-category"><span>Status Operasional</span><div className="checkbox-group">
                    {uniqueStatus.map(val => <label key={val} className="cb-label"><input type="checkbox" className="cb-input" checked={checkedStatus.includes(val)} onChange={e => setCheckedStatus(e.target.checked ? [...checkedStatus, val] : checkedStatus.filter(v => v !== val))} /> {val}</label>)}
                  </div></div>
                  <div className="filter-category"><span>Unit Gerai</span><div className="checkbox-group">
                    {uniqueGerai.map(val => <label key={val} className="cb-label"><input type="checkbox" className="cb-input" checked={checkedGerai.includes(val)} onChange={e => setCheckedGerai(e.target.checked ? [...checkedGerai, val] : checkedGerai.filter(v => v !== val))} /> {val}</label>)}
                  </div></div>
                  <div className="filter-category"><span>Tingkat Kesehatan</span><div className="checkbox-group">
                    {uniqueKesehatan.map(val => <label key={val} className="cb-label"><input type="checkbox" className="cb-input" checked={checkedKesehatan.includes(val)} onChange={e => setCheckedKesehatan(e.target.checked ? [...checkedKesehatan, val] : checkedKesehatan.filter(v => v !== val))} /> {val}</label>)}
                  </div></div>
                  <button className="btn-cancel" onClick={() => { setCheckedStatus([]); setCheckedGerai([]); setCheckedKesehatan([]); }}><i className="fas fa-undo-alt" /> Bersihkan Filter Kategori</button>
                </div>
              )}
            </div>

            <div className="table-wrapper">
              <table className="data-table">
                <thead>
                  <tr>
                    {tableColumnsConfig.filter(c => visibleCols.includes(c.id)).map(col => (
                      <th key={col.id} onClick={() => handleSort(col.id)} style={col.id === 'no' ? { width: 40, textAlign: 'center' } : {}}>
                        {col.label} <i className={`fas ${sortCol === col.id ? (sortAsc ? 'fa-sort-up' : 'fa-sort-down') : 'fa-sort'} sort-icon ${sortCol === col.id ? 'active' : ''}`} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {paginatedData.length === 0 ? (
                    <tr><td colSpan={visibleCols.length} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}><i>Data tidak ditemukan.</i></td></tr>
                  ) : paginatedData.map((item, index) => {
                    const globalIdx = itemsPerPage === 'all' ? index + 1 : ((currentPage - 1) * parseInt(itemsPerPage)) + index + 1;
                    const isAktif = String(item.status || '').toLowerCase().includes('aktif') && !String(item.status || '').toLowerCase().includes('tidak');
                    const baseColor = isAktif ? 'var(--aktif)' : 'var(--non-aktif)';
                    const hasCoords = !isNaN(parseFloat(item.lat)) && !isNaN(parseFloat(item.lng));
                    return (
                      <tr key={item.id} className={selectedRowId === item.id ? 'selected' : ''}
                        onClick={() => {
                          if (hasCoords) mapInstanceRef.current?.flyTo([parseFloat(item.lat), parseFloat(item.lng)], 18, { duration: 1.5 });
                          const markerObj = allMarkersRef.current.find(m => m.data.id === item.id);
                          selectItem(item, markerObj?.marker);
                        }}>
                        {tableColumnsConfig.filter(c => visibleCols.includes(c.id)).map(col => {
                          if (col.id === 'no') return <td key={col.id} style={{ textAlign: 'center', color: 'var(--text-muted)', fontWeight: 500 }}>{globalIdx}</td>;
                          if (col.id === 'nama') return <td key={col.id} style={{ fontWeight: 600 }}>{item.nama} {!hasCoords && <i className="fas fa-exclamation-triangle" style={{ color: 'var(--highlight)', marginLeft: 5, fontSize: 10 }} title="Belum Terpetakan" />}</td>;
                          if (col.id === 'status') return <td key={col.id}><span className="status-badge" style={{ background: baseColor }}>{item.status}</span></td>;
                          return <td key={col.id}>{item[col.id] || '-'}</td>;
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="pagination-container">
              <span>{itemsPerPage === 'all' ? `Menampilkan Semua (${totalItems} Data)` : `Halaman ${currentPage} dari ${maxPage} (${totalItems} total data)`}</span>
              <div className="page-btn-group">
                <button className="page-btn" disabled={currentPage <= 1} onClick={() => setCurrentPage(p => p - 1)}><i className="fas fa-chevron-left" /></button>
                <button className="page-btn" disabled={currentPage >= maxPage} onClick={() => setCurrentPage(p => p + 1)}><i className="fas fa-chevron-right" /></button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ========== SLIDER COMPONENT ==========
function SliderComponent({ images }) {
  const [currentSlide, setCurrentSlide] = useState(0);
  function changeSlide(dir) {
    setCurrentSlide(prev => { let n = prev + dir; if (n < 0) n = images.length - 1; if (n >= images.length) n = 0; return n; });
  }
  function openLightbox(src) {
    const overlay = document.getElementById('lightbox-overlay');
    const img = document.getElementById('lightbox-img');
    if (overlay && img) { img.src = src; overlay.style.display = 'flex'; }
  }
  return (
    <div className="slider-container">
      <div className="slider-images" style={{ width: `${images.length * 100}%`, transform: `translateX(-${(currentSlide * 100) / images.length}%)` }}>
        {images.map((img, idx) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img key={idx} src={img} style={{ width: `${100 / images.length}%` }} onClick={() => openLightbox(img)} onError={e => { e.target.src = DEFAULT_NO_IMAGE; }} alt="" />
        ))}
      </div>
      {images.length > 1 && (
        <>
          <button className="slider-btn prev" onClick={() => changeSlide(-1)}><i className="fas fa-chevron-left" /></button>
          <button className="slider-btn next" onClick={() => changeSlide(1)}><i className="fas fa-chevron-right" /></button>
          <div className="slider-indicators">{images.map((_, idx) => <div key={idx} className={`indicator ${idx === currentSlide ? 'active' : ''}`} />)}</div>
        </>
      )}
    </div>
  );
}
