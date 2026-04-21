// URL Backend Google Apps Script Web App
export const GAS_WEBAPP_URL = "https://script.google.com/macros/s/AKfycbzc96HHN04_Bd6DrkPXA5ww65-qqmu9v8--8rvlBQTHaqS9TSSEu-cjMMD7RBTwJpwL/exec";

// Durasi sesi admin: 6 jam
export const SESSION_DURATION_MS = 6 * 60 * 60 * 1000;

// Interval cek sesi (30 detik)
export const SESSION_CHECK_INTERVAL_MS = 30000;

// Default image jika foto tidak tersedia
export const DEFAULT_NO_IMAGE = "https://upload.wikimedia.org/wikipedia/commons/a/ac/No_image_available.svg";

// Konfigurasi kolom tabel default
export const DEFAULT_TABLE_COLUMNS = [
  { id: 'no', label: 'No', default: true },
  { id: 'nama', label: 'Nama Koperasi', default: true },
  { id: 'alamat', label: 'Alamat', default: false },
  { id: 'desa', label: 'Desa/Kel', default: true },
  { id: 'kecamatan', label: 'Kecamatan', default: true },
  { id: 'kabupaten', label: 'Kab/Kota', default: true },
  { id: 'status', label: 'Status', default: false },
  { id: 'kode_pos', label: 'Kode Pos', default: false },
  { id: 'nik', label: 'NIK', default: false },
  { id: 'ahu', label: 'SK AHU', default: false },
  { id: 'pengurus', label: 'Pengurus', default: false },
  { id: 'pengawas', label: 'Pengawas', default: false },
  { id: 'jumlah anggota', label: 'Jumlah Anggota', default: false },
  { id: 'sektor usaha', label: 'Sektor Usaha', default: false },
  { id: 'gerai', label: 'Unit Gerai', default: false },
  { id: 'kesehatan', label: 'Kesehatan', default: false },
  { id: 'tahun pendirian', label: 'Tahun Pendirian', default: false },
  { id: 'lat', label: 'Latitude', default: false },
  { id: 'lng', label: 'Longitude', default: false },
];

// Header standar yang dikenali oleh sistem
export const STANDARD_HEADERS = [
  'id', 'nama', 'alamat', 'desa', 'kecamatan', 'kabupaten', 'nik', 'lat', 'lng',
  'status', 'kode_pos', 'pengurus', 'pengawas', 'gerai', 'kesehatan',
  'tahun pendirian', 'jenis koperasi', 'jumlah anggota', 'ahu', 'sektor usaha', 'foto', 'url'
];

// API Kemenkop
export const KEMENKOP_PASS = "EX7rvuSQItlrBOSzePdlrrGuQOjOmIPs";
export const KEMENKOP_IV = "HIYa12MVEqtZIiBG";
