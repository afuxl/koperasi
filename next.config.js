/** @type {import('next').NextConfig} */
const nextConfig = {
  // Mengizinkan gambar dari domain eksternal
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: 'lh3.googleusercontent.com' },
      { protocol: 'https', hostname: 'upload.wikimedia.org' },
      { protocol: 'https', hostname: 'drive.google.com' },
    ],
    unoptimized: true,
  },
  // Mengabaikan ESLint errors saat build agar tidak memblokir deployment
  eslint: {
    ignoreDuringBuilds: true,
  },
};

module.exports = nextConfig;
