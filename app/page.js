'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import Swal from 'sweetalert2';
import Header from '@/components/Header';
import Sidebar from '@/components/Sidebar';
import Loader from '@/components/Loader';
import { useSession } from '@/components/SessionProvider';
import { fetchMapData, saveKoperasiData, uploadImage, fetchKemenkopData, cleanCoordinate, convertDriveUrl } from '@/lib/api';
import { DEFAULT_TABLE_COLUMNS, DEFAULT_NO_IMAGE, STANDARD_HEADERS, KEMENKOP_PASS, KEMENKOP_IV } from '@/lib/constants';
import CryptoJS from 'crypto-js';

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

  // API Kemenkop Modal
  const [apiModalOpen, setApiModalOpen] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiRawData, setApiRawData] = useState(null);
  const [apiActiveTab, setApiActiveTab] = useState('utama');
  
  const apiMapInstance = useRef(null);
  const apiMapMarker = useRef(null);

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
      const kabBoundaryGroup = L.featureGroup();
      const kecBoundaryGroup = L.featureGroup();
      
      markersLayerRef.current = ml;
      labelsLayerRef.current = ll;
      boundaryGroupRef.current = kecBoundaryGroup; // used by filter if needed

      L.control.layers(
        { "Open Street Map": osm, "Google Satellite": satellite, "Google Terrain": googleTerrain, "ESRI": esri },
        { "Batas Kabupaten/Kota": kabBoundaryGroup, "Batas Kecamatan": kecBoundaryGroup },
        { position: 'bottomleft' }
      ).addTo(map);
      L.control.zoom({ position: 'bottomright' }).addTo(map);

      map.on('zoomend', () => {
        if (map.getZoom() > 13.5) { if (!map.hasLayer(ll)) map.addLayer(ll); }
        else { if (map.hasLayer(ll)) map.removeLayer(ll); }
      });

      let clickTimeout = null;

      map.on('click', (e) => {
        // Reset view when clicking empty area
        kabBoundaryGroup.eachLayer(layer => {
            layer.setStyle({ color: '#b91c1c', opacity: 0.6, fillOpacity: 0.03 });
        });
        kecBoundaryGroup.clearLayers();
        map.setView([-4.0, 122.5], 8);

        if (!isEditModeRef.current || !isAdminRef.current) return;
        const latInput = document.getElementById('edit-lat');
        const lngInput = document.getElementById('edit-lng');
        if (latInput) latInput.value = e.latlng.lat.toFixed(8);
        if (lngInput) lngInput.value = e.latlng.lng.toFixed(8);
        if (tempEditMarkerRef.current) map.removeLayer(tempEditMarkerRef.current);
        tempEditMarkerRef.current = L.marker(e.latlng).addTo(map);
      });

      // Load kecamatan boundary GeoJSON
      try {
        const resp = await fetch('/kecamatan.geojson');
        if (resp.ok) boundaryDataRef.current = await resp.json();
      } catch (err) { console.warn("Gagal memuat GeoJSON kecamatan:", err); }

      // Load kabupaten boundary GeoJSON (sultra.geojson)
      try {
        const kabResp = await fetch('/sultra.geojson');
        if (kabResp.ok) {
          const kabData = await kabResp.json();
          L.geoJSON(kabData, {
            style: () => ({ color: '#b91c1c', weight: 2, fillColor: '#fef2f2', fillOpacity: 0.03, dashArray: '6, 4', opacity: 0.6 }),
            onEachFeature: (feature, layer) => {
              const name = feature.properties.NAME_2;
              const type = feature.properties.TYPE_2 || '';
              if (name) {
                layer.bindTooltip(`${type} ${name}`, { permanent: false, direction: 'center', className: 'leaflet-tooltip-koperasi', sticky: true });
              }

              layer.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                
                if (clickTimeout) {
                  clearTimeout(clickTimeout);
                  clickTimeout = null;
                  
                  // Double Click: Tampilkan Kecamatan
                  layer.setStyle({ opacity: 0, fillOpacity: 0 }); // Sembunyikan kabupaten ini
                  if (boundaryDataRef.current) {
                    kecBoundaryGroup.clearLayers();
                    L.geoJSON(boundaryDataRef.current, {
                      filter: (f) => {
                        const kabName = f.properties.WADMKK || f.properties.KABUPATEN || f.properties.kabupaten || f.properties.nm_kabupaten;
                        if (kabName && kabName.toUpperCase() === name.toUpperCase()) return true;
                        if (!kabName) return true; // Fallback jika data geojson belum memiliki properti kabupaten
                        return false;
                      },
                      style: () => ({ color: '#047857', weight: 2, fillColor: '#10b981', fillOpacity: 0.1, dashArray: '5, 5' }),
                      onEachFeature: (f, l) => {
                        const kecName = f.properties.nm_kecamatan || f.properties.WADMKC || f.properties.KECAMATAN || f.properties.kecamatan || f.properties.NAMOBJ;
                        if (kecName) l.bindTooltip(`Kec. ${kecName}`, { permanent: false, direction: 'center', sticky: true });
                        l.on('click', (e2) => L.DomEvent.stopPropagation(e2)); // Prevent reset map
                      },
                      interactive: true
                    }).addTo(kecBoundaryGroup);
                  }
                } else {
                  // Single Click: Highlight & Zoom Kabupaten
                  clickTimeout = setTimeout(() => {
                    clickTimeout = null;
                    kabBoundaryGroup.eachLayer(l => l.setStyle({ opacity: 0.1, fillOpacity: 0 }));
                    layer.setStyle({ opacity: 1, fillOpacity: 0.15, color: '#dc2626' });
                    kecBoundaryGroup.clearLayers();
                    map.fitBounds(layer.getBounds(), { padding: [20, 20], duration: 0.5 });
                  }, 250);
                }
              });
            },
            interactive: true
          }).addTo(kabBoundaryGroup);
        }
      } catch (err) { console.warn("Gagal memuat batas kabupaten:", err); }

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
  }, [rawData, filterKabupaten, filterKecamatan, filterDesa, searchQuery, checkedStatus, checkedGerai, checkedKesehatan]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setCurrentPage(1);
    // Update boundary
    updateBoundaryLayer(filterKabupaten, filterKecamatan);
  }, [filterKabupaten, filterKecamatan, filterDesa, searchQuery, checkedStatus, checkedGerai, checkedKesehatan]); // eslint-disable-line react-hooks/exhaustive-deps

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

      if (hasCoords) {
        const isAktif = String(item.status || '').toLowerCase().includes('aktif') && !String(item.status || '').toLowerCase().includes('tidak');
        // Define colors based on global CSS variables for consistency, or literal fallbacks
        const fillColor = isAktif ? '#10b981' : '#ef4444'; // var(--aktif) or var(--non-aktif)
        const borderColor = isAktif ? '#047857' : '#b91c1c'; // darker shade for stroke

        const marker = L.circleMarker([latVal, lngVal], {
          radius: 6,
          fillColor: fillColor,
          color: borderColor,
          weight: 1.5,
          opacity: 1,
          fillOpacity: 0.8
        });

        marker.bindTooltip(`<b>${item.nama}</b><br><small style="color:#cbd5e1;font-weight:400;">Desa ${item.desa}</small>`, { className: 'leaflet-tooltip-koperasi', direction: 'top', offset: [0, -5] });
        marker.on('click', () => selectItem(item, marker));
        
        // Custom property to store baseColor if used elsewhere
        marker.baseColor = fillColor;
        
        markersLayerRef.current.addLayer(marker);
        allMarkersRef.current.push({ marker, data: item, baseColor: fillColor });

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
        setCurrentItem(prev => ({ ...prev, ...localUpdateData }));
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
        console.log("Upload Response:", res);
        if (res.success || res.url || res.fileUrl) { 
          const finalUrl = res.url || res.fileUrl || res.data || res.downloadUrl || Object.values(res).find(v => typeof v === 'string' && v.startsWith('http'));
          if (finalUrl) uploadedUrls.push(finalUrl); 
          statusText.innerText = `Mengunggah ${i + 1} dari ${fileInput.files.length} gambar...`; 
        }
        else Swal.fire({ icon: 'error', title: 'Gagal', text: `Gagal mengunggah ${file.name}: ${res.message || 'Respons tidak valid'}` });
      } catch (err) { Swal.fire({ icon: 'error', title: 'Terputus', text: `Koneksi terputus saat mengunggah ${file.name}` }); }
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

  // UPLOAD EVENT BRIDGE REMOVED - using native React onClick

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

  // ========== API KEMENKOP FETCHING LOGIC ==========
  function extractSlug(rawUrl) {
    if (!rawUrl) return rawUrl;
    const trimmed = rawUrl.trim();
    try {
      const urlObj = new URL(trimmed);
      const segments = urlObj.pathname.split('/').filter(Boolean);
      return segments.length > 0 ? segments[segments.length - 1] : trimmed;
    } catch {
      return trimmed;
    }
  }

  async function handleFetchApi(rawUrl) {
    const slug = extractSlug(rawUrl);
    setApiRawData(null);
    setApiModalOpen(true);
    setApiLoading(true);
    setApiActiveTab('utama');
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
        const b64 = inputObj.data.replace(/\\\\\//g, '/');
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

  useEffect(() => {
    if (!apiRawData || !apiModalOpen || apiActiveTab !== 'media') return;
    const L = LRef.current;
    if (!L) return;

    if (apiMapInstance.current) {
      apiMapInstance.current.remove();
      apiMapInstance.current = null;
      apiMapMarker.current = null;
    }

    setTimeout(() => {
      const container = document.getElementById('api-map-page');
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
  }, [apiRawData, apiModalOpen, apiActiveTab]);

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
        <div className="detail-only">
          <div className="hint-box"><i className="fas fa-crosshairs" /> Klik peta untuk ubah koordinat lokasi.</div>
          <div className="info-row"><label>Nama Koperasi</label><input type="text" id="edit-nama" data-header="nama" className="edit-input dynamic-input-field" defaultValue={currentItem.nama || ''} /></div>
          <div className="info-row">
            <label>Status Koperasi</label>
            <select id="edit-status" data-header="status" className="edit-input dynamic-input-field" defaultValue={isAktif ? 'Aktif' : 'Tidak Aktif'}>
              <option value="Aktif">Aktif</option>
              <option value="Tidak Aktif">Tidak Aktif</option>
            </select>
          </div>
          <div className="info-row"><label>URL</label><input type="text" id="edit-url" data-header="url" className="edit-input dynamic-input-field" defaultValue={currentItem.url === '-' ? '' : (currentItem.url || '')} /></div>
          <hr style={{ border: 0, borderTop: '1px dashed var(--border)', margin: '15px 0' }} />
          <div className="info-row"><label>Alamat Lengkap</label><input type="text" id="edit-alamat" data-header="alamat" className="edit-input dynamic-input-field" defaultValue={currentItem.alamat === '-' ? '' : (currentItem.alamat || '')} /></div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="info-row" style={{ flex: 1 }}><label>Desa/Kel</label><input type="text" id="edit-desa" data-header="desa" className="edit-input dynamic-input-field" defaultValue={currentItem.desa === '-' ? '' : (currentItem.desa || '')} /></div>
            <div className="info-row" style={{ flex: 1 }}><label>Kecamatan</label><input type="text" id="edit-kecamatan" data-header="kecamatan" className="edit-input dynamic-input-field" defaultValue={currentItem.kecamatan === '-' ? '' : (currentItem.kecamatan || '')} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="info-row" style={{ flex: 1 }}><label>Kab/Kota</label><input type="text" id="edit-kabupaten" data-header="kabupaten" className="edit-input dynamic-input-field" defaultValue={currentItem.kabupaten === '-' ? '' : (currentItem.kabupaten || '')} /></div>
            <div className="info-row" style={{ flex: 1 }}><label>Kode Pos</label><input type="text" id="edit-kode_pos" data-header="kode_pos" className="edit-input dynamic-input-field" defaultValue={currentItem.kode_pos === '-' ? '' : (currentItem.kode_pos || '')} /></div>
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <div className="info-row" style={{ flex: 1 }}><label>Latitude (Y)</label><input type="text" id="edit-lat" data-header="lat" className="edit-input dynamic-input-field" defaultValue={currentItem.lat || ''} /></div>
            <div className="info-row" style={{ flex: 1 }}><label>Longitude (X)</label><input type="text" id="edit-lng" data-header="lng" className="edit-input dynamic-input-field" defaultValue={currentItem.lng || ''} /></div>
          </div>
          <hr style={{ border: 0, borderTop: '1px dashed var(--border)', margin: '15px 0' }} />
          <div className="info-row"><label>NIK</label><input type="text" data-header="nik" className="edit-input dynamic-input-field" defaultValue={currentItem.nik === '-' ? '' : (currentItem.nik || '')} /></div>
          <div className="info-row"><label>SK AHU</label><input type="text" data-header="ahu" className="edit-input dynamic-input-field" defaultValue={currentItem.ahu === '-' ? '' : (currentItem.ahu || '')} /></div>
          <div className="info-row"><label>Jenis Koperasi</label><input type="text" data-header="jenis koperasi" className="edit-input dynamic-input-field" defaultValue={currentItem['jenis koperasi'] === '-' ? '' : (currentItem['jenis koperasi'] || '')} /></div>
          <div className="info-row"><label>Tahun Pendirian</label><input type="text" data-header="tahun pendirian" className="edit-input dynamic-input-field" defaultValue={currentItem['tahun pendirian'] === '-' ? '' : (currentItem['tahun pendirian'] || '')} /></div>
          <div className="info-row"><label>Nama Pengurus</label><input type="text" data-header="pengurus" className="edit-input dynamic-input-field" defaultValue={currentItem.pengurus === '-' ? '' : (currentItem.pengurus || '')} /></div>
          <div className="info-row"><label>Nama Pengawas</label><input type="text" data-header="pengawas" className="edit-input dynamic-input-field" defaultValue={currentItem.pengawas === '-' ? '' : (currentItem.pengawas || '')} /></div>
          <div className="info-row"><label>Jumlah Anggota</label><input type="text" data-header="jumlah anggota" className="edit-input dynamic-input-field" defaultValue={currentItem['jumlah anggota'] === '-' ? '' : (currentItem['jumlah anggota'] || '')} /></div>
          <div className="info-row"><label>Sektor Usaha</label><input type="text" data-header="sektor usaha" className="edit-input dynamic-input-field" defaultValue={currentItem['sektor usaha'] === '-' ? '' : (currentItem['sektor usaha'] || '')} /></div>
          <div className="info-row"><label>Unit Gerai</label><input type="text" data-header="gerai" className="edit-input dynamic-input-field" defaultValue={currentItem.gerai === '-' ? '' : (currentItem.gerai || '')} /></div>
          <div className="info-row"><label>Tingkat Kesehatan</label><input type="text" data-header="kesehatan" className="edit-input dynamic-input-field" defaultValue={currentItem.kesehatan === '-' ? '' : (currentItem.kesehatan || '')} /></div>
          
          <div className="info-row" style={{ display: 'block' }}>
            <label style={{ fontWeight: 600, color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>Galeri Foto (URL / Upload Drive)</label>
            <div style={{ background: '#f8fafc', padding: 12, borderRadius: 8, border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 4 }}>
              <textarea id="edit-foto" data-header="foto" className="edit-input dynamic-input-field" style={{ resize: 'vertical', height: 60, width: '100%', border: '1px solid #cbd5e1' }} defaultValue={currentItem.foto === '-' ? '' : (currentItem.foto || '')} placeholder="Masukkan URL gambar (pisahkan koma) atau upload via tombol di bawah..." />
              
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input type="file" id="upload-foto" accept="image/*" multiple style={{ fontSize: 11, flex: 1, minWidth: 0, border: '1px dashed #cbd5e1', padding: '6px', borderRadius: 6, background: '#fff' }} />
                <button type="button" className="btn-action" style={{ width: 'auto', margin: 0, padding: '6px 14px', fontSize: 11, flexShrink: 0, background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 6 }} onClick={handleImageUpload}><i className="fas fa-cloud-upload-alt" /> Upload ke Drive</button>
              </div>
              <div id="upload-status" style={{ fontSize: 11, fontWeight: 600, color: 'var(--primary)', marginTop: 4 }} />
              
              {currentItem.foto && currentItem.foto !== '-' && (
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                  {currentItem.foto.split(',').map(f => f.trim()).filter(f => f !== '').map((url, idx) => {
                    const thumbUrl = convertDriveUrl(url);
                    return <img key={idx} src={thumbUrl} style={{ width: 45, height: 45, objectFit: 'cover', borderRadius: 6, border: '1px solid #cbd5e1' }} alt="Thumb" onError={e => e.target.style.display = 'none'} />
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
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
          {currentItem.url && currentItem.url !== '-' && (
            <button className="btn-action" style={{ width: '100%', marginTop: 12, backgroundColor: '#2563eb', color: 'white', border: 'none', justifyContent: 'center' }} onClick={() => handleFetchApi(currentItem.url)}>
              <i className="fas fa-info-circle" /> Lihat Selengkapnya
            </button>
          )}
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
                  <div className="filter-category"><span>Penilaian Kesehatan</span><div className="checkbox-group">
                    {uniqueKesehatan.map(val => <label key={val} className="cb-label"><input type="checkbox" className="cb-input" checked={checkedKesehatan.includes(val)} onChange={e => setCheckedKesehatan(e.target.checked ? [...checkedKesehatan, val] : checkedKesehatan.filter(v => v !== val))} /> {val}</label>)}
                  </div></div>
                  <button className="btn-cancel" onClick={() => { setCheckedStatus([]); setCheckedGerai([]); setCheckedKesehatan([]); }}><i className="fas fa-undo-alt" /> Bersihkan Filter Kategori</button>
                </div>
              )}
            </div>

            <div className="top-scrollbar-container custom-scrollbar" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
              <div className="top-scrollbar-inner" style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <div className="table-wrapper custom-scrollbar" style={{ overflowX: 'hidden' }}>
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
              </div>
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

      {/* ===== API KEMENKOP MODAL DENGAN TABS ===== */}
      {apiModalOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.8)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: 16 }} onClick={() => setApiModalOpen(false)}>
          <div style={{ background: '#fff', borderRadius: 16, maxWidth: 1000, width: '100%', maxHeight: '96vh', overflowY: 'auto', boxShadow: '0 25px 50px rgba(0,0,0,0.25)', display: 'flex', flexDirection: 'column' }} onClick={e => e.stopPropagation()}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#f8fafc' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dbeafe', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#2563eb' }}>
                  <i className="fas fa-satellite-dish" style={{ fontSize: 18 }} />
                </div>
                <div>
                  <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#1e293b' }}>
                    {apiRawData && !apiLoading ? (apiRawData.name || 'TANPA NAMA') : 'Menarik Data Koperasi...'}
                  </h3>
                  <p style={{ margin: 0, fontSize: 11, color: '#64748b', display: 'flex', alignItems: 'center', gap: 6 }}>
                    {apiRawData && !apiLoading ? (
                      <><i className="fas fa-map-marker-alt" style={{ color: '#ef4444' }} /> {[apiRawData.village?.name, apiRawData.subdistrict?.name, apiRawData.district?.name, apiRawData.province?.name].filter(Boolean).join(', ') || 'Lokasi tidak diketahui'}</>
                    ) : 'Harap tunggu sebentar...'}
                  </p>
                </div>
              </div>
              <button onClick={() => setApiModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: 20, cursor: 'pointer', width: 32, height: 32, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <i className="fas fa-times" />
              </button>
            </div>

            <div style={{ flex: 1, padding: 0, background: '#f1f5f9', display: 'flex', flexDirection: 'column' }}>
              {apiLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 16 }}>
                  <i className="fas fa-circle-notch fa-spin fa-3x" style={{ color: '#2563eb' }} />
                  <p style={{ color: '#475569', fontWeight: 600, fontSize: 14 }}>Menarik & Memproses Data...</p>
                </div>
              )}

              {apiRawData && !apiLoading && (
                <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                  <div style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' }}>
                    <button 
                      onClick={(e) => { e.currentTarget.nextElementSibling.scrollBy({ left: -200, behavior: 'smooth' }); }}
                      style={{ background: '#fff', border: 'none', padding: '16px 16px', cursor: 'pointer', zIndex: 10, color: '#64748b', borderRight: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fas fa-chevron-left"></i>
                    </button>
                    
                    <div style={{ flex: 1, display: 'flex', gap: 4, overflowX: 'auto', padding: '0 10px', scrollBehavior: 'smooth' }} className="custom-scrollbar">
                    {[
                      { id: 'utama', label: 'Utama & Tambahan' },
                      { id: 'media', label: 'Gambar & Lokasi' },
                      { id: 'wilayah', label: 'Wilayah' }
                    ].map(tab => (
                      <button 
                        key={tab.id} 
                        onClick={() => setApiActiveTab(tab.id)} 
                        style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: apiActiveTab === tab.id ? '#3b82f6' : '#64748b', background: 'transparent', border: 'none', borderBottom: `2px solid ${apiActiveTab === tab.id ? '#3b82f6' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                        {tab.label}
                      </button>
                    ))}
                    {(()=>{
                      const toArr = arr => Array.isArray(arr) ? arr.map(x => (x && typeof x==="object")? x : { value: x }) : [];
                      const tablesDef = [
                        { id: 'managements', title: 'Managements', data: toArr(apiRawData.managements), icon: 'fa-users' },
                        { id: 'members', title: 'Members', data: toArr(apiRawData.members), icon: 'fa-id-card' },
                        { id: 'outlets', title: 'Outlets', data: toArr(apiRawData.outlets), icon: 'fa-store' },
                        { id: 'potentials', title: 'Potentials', data: toArr(apiRawData.potentials), icon: 'fa-chart-line' },
                        { id: 'klus', title: 'KLU/S', data: toArr(apiRawData.klus), icon: 'fa-layer-group' },
                        { id: 'klu_types', title: 'KLU Types', data: toArr(apiRawData.klu_types), icon: 'fa-tags' },
                        { id: 'member_stats', title: 'Member Stats', data: toArr(apiRawData.member_stats), icon: 'fa-chart-bar' },
                        { id: 'development_reports', title: 'Reports', data: toArr(apiRawData.development_reports), icon: 'fa-hard-hat' },
                        { id: 'merged_villages', title: 'Merged Villages', data: toArr(apiRawData.merged_villages), icon: 'fa-map-signs' },
                        { id: 'news', title: 'News', data: toArr(apiRawData.news), icon: 'fa-newspaper' },
                      ];
                      return tablesDef.filter(tb => tb.data.length > 0).map(tb => (
                        <button 
                          key={tb.id} 
                          onClick={() => setApiActiveTab(tb.id)} 
                          style={{ padding: '12px 20px', fontSize: 13, fontWeight: 600, color: apiActiveTab === tb.id ? '#3b82f6' : '#64748b', background: 'transparent', border: 'none', borderBottom: `2px solid ${apiActiveTab === tb.id ? '#3b82f6' : 'transparent'}`, cursor: 'pointer', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
                          <i className={`fas ${tb.icon}`}></i> {tb.title}
                          <span style={{ background: '#dbeafe', color: '#1d4ed8', padding: '2px 6px', borderRadius: 999, fontSize: 9, fontWeight: 700 }}>{tb.data.length}</span>
                        </button>
                      ));
                    })()}
                    </div>
                    
                    <button 
                      onClick={(e) => { e.currentTarget.previousElementSibling.scrollBy({ left: 200, behavior: 'smooth' }); }}
                      style={{ background: '#fff', border: 'none', padding: '16px 16px', cursor: 'pointer', zIndex: 10, color: '#64748b', borderLeft: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <i className="fas fa-chevron-right"></i>
                    </button>
                  </div>

                  <div style={{ padding: 20, overflowY: 'auto' }}>
                    {/* Tab: Utama */}
                    {apiActiveTab === 'utama' && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 20 }}>
                        <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
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
                        <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                          <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fas fa-list-alt" style={{ color: '#22c55e' }} /> Informasi Tambahan
                          </h3>
                          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: '10px 8px', fontSize: 11 }}>
                            <b style={{ color: '#64748b' }}>RAT</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.rat || '-'}</span>
                            <b style={{ color: '#64748b' }}>Unit Gerai Usaha</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.outlets?.length || 0}</span>
                            <b style={{ color: '#64748b' }}>Penilaian Kes.</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.health_score || apiRawData.kesehatan || '-'}</span>
                            <b style={{ color: '#64748b' }}>Sektor Usaha</b><span style={{ color: '#1e293b', wordBreak: 'break-word' }}>{apiRawData.klu_types?.map(k => k.type || k.name).join(', ') || '-'}</span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Dynamic Tabs Content (for Tables) */}
                    {(()=>{
                      if (['utama', 'media', 'wilayah'].includes(apiActiveTab)) return null;
                      
                      const toArr = arr => Array.isArray(arr) ? arr.map(x => (x && typeof x==="object")? x : { value: x }) : [];
                      const tablesDef = [
                        { id: 'managements', title: 'Managements', data: toArr(apiRawData.managements) },
                        { id: 'members', title: 'Members', data: toArr(apiRawData.members) },
                        { id: 'outlets', title: 'Outlets', data: toArr(apiRawData.outlets) },
                        { id: 'potentials', title: 'Potentials', data: toArr(apiRawData.potentials) },
                        { id: 'klus', title: 'KLU/S', data: toArr(apiRawData.klus) },
                        { id: 'klu_types', title: 'KLU Types', data: toArr(apiRawData.klu_types) },
                        { id: 'member_stats', title: 'Member Stats', data: toArr(apiRawData.member_stats) },
                        { id: 'development_reports', title: 'Reports', data: toArr(apiRawData.development_reports) },
                        { id: 'merged_villages', title: 'Merged Villages', data: toArr(apiRawData.merged_villages) },
                        { id: 'news', title: 'News', data: toArr(apiRawData.news) },
                      ];
                      
                      const activeTb = tablesDef.find(tb => tb.id === apiActiveTab);
                      if (!activeTb || activeTb.data.length === 0) return null;
                      
                      let cols = Array.from(activeTb.data.reduce((s, row) => { Object.keys(row || {}).forEach(k => s.add(k)); return s; }, new Set()));
                      cols = cols.filter(c => c !== 'member_identification_number');
                      
                      const formatHeader = (k) => {
                          const map = {
                              'cooperative_asset_development_report_id': 'id_laporan',
                              'cooperative_asset_development_indicator_id': 'id_indikator',
                              'cooperative_asset_id': 'id_aset',
                              'description': 'keterangan',
                              'development_progress': 'progres',
                              'image_primary': 'foto_utama',
                              'image_secondary': 'foto_kedua',
                              'image_other_1': 'foto_lain_1',
                              'image_other_2': 'foto_lain_2',
                              'surveyor': 'surveyor',
                              'created_at': 'dibuat_pada',
                              'updated_at': 'diubah_pada',
                              'manpower': 'jml_pekerja',
                              'development_status': 'status_bangun',
                              'indicator_construction_type': 'tipe_konstruksi',
                              'indicator_indicator': 'nama_indikator',
                              'indicator_weight': 'bobot_indikator',
                              'indicator_description': 'ket_indikator',
                              'asset_name': 'nama_aset',
                              'asset_cooperative_id': 'id_koperasi',
                              'asset_asset_type': 'tipe_aset',
                              'asset_asset_status': 'status_aset',
                              'asset_image_primary': 'foto_aset_1',
                              'asset_image_secondary': 'foto_aset_2'
                          };
                          return map[k] || k;
                      };

                      const maskSensitiveData = (key, value) => {
                          if (!value || typeof value !== 'string') return value;
                          const k = String(key).toLowerCase();
                          if (k === 'nik' || k.includes('ktp')) {
                              return value.length > 8 ? value.substring(0, 4) + '*'.repeat(value.length - 8) + value.substring(value.length - 4) : '*'.repeat(value.length);
                          }
                          if (k.includes('phone') || k.includes('hp') || k.includes('telepon')) {
                              return value.length > 6 ? value.substring(0, 4) + '*'.repeat(value.length - 7) + value.substring(value.length - 3) : '*'.repeat(value.length);
                          }
                          if (k.includes('email')) {
                              const parts = value.split('@');
                              return parts.length === 2 && parts[0].length > 2 ? parts[0].substring(0, 2) + '*'.repeat(parts[0].length - 2) + '@' + parts[1] : value;
                          }
                          if (k.includes('npwp')) {
                              return value.length > 6 ? value.substring(0, 2) + '*'.repeat(value.length - 5) + value.substring(value.length - 3) : '*'.repeat(value.length);
                          }
                          return value;
                      };

                      return (
                        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #e2e8f0', overflow: 'hidden' }}>
                          <div style={{ overflowX: 'auto', padding: 0 }} className="custom-scrollbar top-scrollbar-container">
                            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }} className="top-scrollbar-inner">
                              <thead style={{ background: '#f8fafc' }}>
                                <tr>
                                  {cols.map(c => (
                                    <th key={c} style={{ padding: '12px 16px', borderBottom: '2px solid #e2e8f0', textAlign: 'left', color: '#64748b', whiteSpace: 'nowrap', textTransform: 'uppercase' }}>{formatHeader(c)}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {activeTb.data.map((row, rIdx) => (
                                  <tr key={rIdx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                                    {cols.map(c => {
                                      let val = row[c];
                                      if (c.toLowerCase().includes('image') && val) {
                                        return <td key={c} style={{ padding: '12px 16px' }}><img src={val} style={{ maxWidth: 80, borderRadius: 4, border: '1px solid #e2e8f0' }} alt="img" /></td>;
                                      }
                                      if (typeof val === 'object' && val !== null) val = JSON.stringify(val);
                                      val = maskSensitiveData(c, val);
                                      return <td key={c} style={{ padding: '12px 16px', color: '#334155', verticalAlign: 'top' }}>{val || '-'}</td>;
                                    })}
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Tab: Media */}
                    {apiActiveTab === 'media' && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                        <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                          <h3 style={{ margin: '0 0 12px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                            <i className="fas fa-map" style={{ color: '#ef4444' }} /> Peta Lokasi
                          </h3>
                          {(!isNaN(parseFloat(apiRawData.latitude ?? apiRawData.lat)) && !isNaN(parseFloat(apiRawData.longitude ?? apiRawData.lng ?? apiRawData.lon))) ? (
                            <>
                              <div id="api-map-page" style={{ height: 220, width: '100%', borderRadius: 8, border: '1px solid #e2e8f0', overflow: 'hidden', background: '#e2e8f0' }} />
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
                            <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
                              <h3 style={{ margin: '0 0 16px 0', fontSize: 13, fontWeight: 700, color: '#1e293b', paddingBottom: 8, borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 8 }}>
                                <i className="fas fa-images" style={{ color: '#8b5cf6' }} /> Galeri & Lampiran
                              </h3>
                              {imgs.length === 0 ? (
                                <p style={{ fontSize: 12, color: '#94a3b8', fontStyle: 'italic', margin: 0 }}>Tidak ada gambar yang dilampirkan.</p>
                              ) : (
                                <div style={{ display: 'flex', gap: 16, overflowX: 'auto', paddingBottom: 10 }}>
                                  {imgs.map((it, idx) => (
                                    <div key={idx} style={{ border: '1px solid #e2e8f0', borderRadius: 8, overflow: 'hidden', minWidth: 200, display: 'flex', flexDirection: 'column', background: '#f8fafc' }}>
                                      <img src={it.url} alt={it.label} style={{ width: '100%', height: 140, objectFit: 'cover', background: '#fff' }} />
                                      <div style={{ fontSize: 10, fontWeight: 700, textAlign: 'center', padding: '8px', color: '#475569', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </div>
                    )}

                    {/* Tab: Wilayah */}
                    {apiActiveTab === 'wilayah' && (
                      <div style={{ background: '#fff', padding: 20, borderRadius: 12, border: '1px solid #e2e8f0' }}>
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
                    )}
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
