import './globals.css';
import 'leaflet/dist/leaflet.css';
import { SessionProvider } from '@/components/SessionProvider';

export const metadata = {
  title: 'Dashboard Koperasi Desa/Kelurahan Merah Putih Sulawesi Tenggara',
  description: 'Aplikasi interaktif untuk pemetaan koperasi desa/kelurahan merah putih di Sulawesi Tenggara.',
  icons: { icon: '/favicon.ico' },
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet" />
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body>
        <SessionProvider>
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
