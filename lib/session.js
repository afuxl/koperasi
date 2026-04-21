import { SESSION_DURATION_MS } from './constants';

function getCookie(name) {
  if (typeof window === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
  if (match) return decodeURIComponent(match[2]);
  return null;
}

function setCookieVal(name, value, maxAgeMs) {
  if (typeof window === 'undefined') return;
  const date = new Date();
  date.setTime(date.getTime() + maxAgeMs);
  document.cookie = name + '=' + encodeURIComponent(value) + ';expires=' + date.toUTCString() + ';path=/';
}

function deleteCookie(name) {
  if (typeof window === 'undefined') return;
  document.cookie = name + '=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;';
}

export function isSessionValid() {
  if (typeof window === 'undefined') return false;
  const auth = getCookie('koperasi_admin_auth');
  const loginTime = parseInt(getCookie('koperasi_admin_login_time') || '0', 10);
  if (auth !== 'true' || !loginTime) return false;
  return (Date.now() - loginTime) < SESSION_DURATION_MS;
}

export function clearSession() {
  deleteCookie('koperasi_admin_auth');
  deleteCookie('koperasi_admin_login_time');
}

export function setSession() {
  setCookieVal('koperasi_admin_auth', 'true', SESSION_DURATION_MS);
  setCookieVal('koperasi_admin_login_time', Date.now().toString(), SESSION_DURATION_MS);
}

export function getRemainingSessionTime() {
  const loginTime = parseInt(getCookie('koperasi_admin_login_time') || '0', 10);
  if (!loginTime) return 0;
  return Math.max(0, SESSION_DURATION_MS - (Date.now() - loginTime));
}

export function formatRemainingTime(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  return hours > 0 ? `${hours} jam ${minutes} menit` : `${minutes} menit`;
}
