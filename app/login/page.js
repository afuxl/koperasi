'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Swal from 'sweetalert2';
import { loginAdmin } from '@/lib/api';
import { isSessionValid, setSession } from '@/lib/session';

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isSessionValid()) {
      router.replace('/');
    }
  }, [router]);

  async function handleLogin(e) {
    e.preventDefault();
    const user = e.target.username.value;
    const pass = e.target.password.value;
    setLoading(true);

    try {
      const result = await loginAdmin(user, pass);
      if (result.success) {
        setSession();
        Swal.fire({ icon: 'success', title: 'Login Berhasil', text: 'Membuka kunci akses administrator...', timer: 1500, showConfirmButton: false })
          .then(() => { window.location.href = '/'; });
      } else {
        Swal.fire({ icon: 'error', title: 'Akses Ditolak', text: result.message || 'Username atau Password salah!' });
      }
    } catch (error) {
      console.error('Login Error:', error);
      Swal.fire({ icon: 'error', title: 'Kesalahan Server', text: 'Tidak dapat menghubungi server. Periksa koneksi internet Anda.' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-slate-100 flex items-center justify-center min-h-screen p-4" style={{ fontFamily: "'Inter', sans-serif", overflow: 'auto' }}>
      <div className="bg-white w-full max-w-md rounded-2xl shadow-xl overflow-hidden border border-slate-200">
        {/* Header / Banner */}
        <div className="bg-gradient-to-br from-red-600 to-red-800 p-8 text-center relative">
          <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg relative z-10">
            <i className="fas fa-shield-alt text-2xl text-red-700" />
          </div>
          <h2 className="text-white text-2xl font-bold tracking-wide relative z-10">Login Admin</h2>
          <p className="text-red-100 text-sm mt-1 relative z-10">Dashboard Koperasi Merah Putih</p>
          <div className="absolute inset-0 opacity-10" style={{ background: "url('https://www.transparenttextures.com/patterns/cubes.png')" }} />
        </div>

        {/* Form Area */}
        <div className="p-8">
          <form onSubmit={handleLogin}>
            <div className="mb-5">
              <label className="block text-slate-600 text-xs font-bold uppercase tracking-wide mb-2">Username</label>
              <div className="relative">
                <i className="fas fa-user absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" name="username" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-200 transition-all text-sm" placeholder="Masukkan username" required autoComplete="off" />
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-slate-600 text-xs font-bold uppercase tracking-wide mb-2">Password</label>
              <div className="relative">
                <i className="fas fa-lock absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="password" name="password" className="w-full pl-10 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-red-500 focus:bg-white focus:ring-2 focus:ring-red-200 transition-all text-sm" placeholder="Masukkan password" required />
              </div>
            </div>

            <button type="submit" disabled={loading} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl shadow-md hover:shadow-lg transition-all hover:-translate-y-0.5 flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed disabled:transform-none">
              {loading ? <><i className="fas fa-circle-notch fa-spin" /> Memverifikasi...</> : <><i className="fas fa-sign-in-alt" /> Masuk Sistem</>}
            </button>
          </form>

          <div className="mt-6 text-center">
            <a href="/" className="text-sm text-slate-500 hover:text-red-600 transition-colors font-medium flex items-center justify-center gap-1">
              <i className="fas fa-arrow-left text-xs" /> Kembali ke Halaman Utama
            </a>
          </div>
        </div>

        <div className="bg-slate-50 p-4 border-t border-slate-100 text-center text-xs text-slate-500">
          <p>Sistem ini dilindungi dan hanya untuk pengurus/admin yang sah.</p>
        </div>
      </div>
    </div>
  );
}
