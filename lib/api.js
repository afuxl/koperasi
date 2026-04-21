import { GAS_WEBAPP_URL } from './constants';

/**
 * Mengambil data peta koperasi dari Google Apps Script
 */
export async function fetchMapData() {
  const response = await fetch(`${GAS_WEBAPP_URL}?action=getMapData`, {
    method: 'GET',
    redirect: 'follow',
  });
  return response.json();
}

/**
 * Menyimpan data koperasi ke Google Apps Script
 */
export async function saveKoperasiData(payloadData) {
  const response = await fetch(GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({ action: 'saveKoperasiData', data: payloadData }),
  });
  return response.json();
}

/**
 * Menghapus data koperasi dari Google Apps Script
 */
export async function deleteKoperasiData(id) {
  const response = await fetch(GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'deleteKoperasiData', id }),
  });
  return response.json();
}

/**
 * Login admin via Google Apps Script
 */
export async function loginAdmin(username, password) {
  const response = await fetch(GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'loginAdmin', username, password }),
  });
  return response.json();
}

/**
 * Upload gambar ke Google Apps Script (Google Drive)
 */
export async function uploadImage(base64Data, mimetype, filename) {
  const response = await fetch(GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    redirect: 'follow',
    body: JSON.stringify({ action: 'uploadImage', data: base64Data, mimetype, filename }),
  });
  return response.json();
}

/**
 * Fetch data dari API Kemenkop berdasarkan slug
 */
export async function fetchKemenkopData(slug) {
  const res = await fetch(`https://api.merahputih.kop.id/api/cooperatives/by-slug/${slug}`);
  if (!res.ok) throw new Error(`Status Code: ${res.status}`);
  return res.json();
}

/**
 * Membersihkan dan format koordinat
 */
export function cleanCoordinate(value) {
  if (!value) return value;
  let clean = value.replace(/,/g, '.').replace(/[^\d.-]/g, '');
  let parts = clean.split('.');
  if (parts.length > 2) clean = parts[0] + '.' + parts.slice(1).join('');
  return clean;
}

/**
 * Konversi URL foto Google Drive ke URL direct
 */
export function convertDriveUrl(url) {
  let processed = url.trim();
  if (processed.includes("drive.google.com/uc") || processed.includes("drive.google.com/open")) {
    const idMatch = processed.match(/id=([^&]+)/);
    if (idMatch) processed = "https://lh3.googleusercontent.com/d/" + idMatch[1];
  } else if (processed.includes("drive.google.com/file/d/")) {
    const idMatch = processed.match(/d\/([^/]+)/);
    if (idMatch) processed = "https://lh3.googleusercontent.com/d/" + idMatch[1];
  }
  return processed;
}
