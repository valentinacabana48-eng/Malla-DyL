import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { AppProvider } from '@/context/AppContext';
import { AuthProvider } from '@/context/AuthContext';
import AuthGate from '@/components/AuthGate';
import PwaSetup from '@/components/PwaSetup';
import '../styles/tailwind.css';

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2744',
};

export const metadata: Metadata = {
  title: 'D&L Gestor — Gestión de Mallas de Turnos',
  description:
    'Sistema de gestión de turnos y personal para Mayorista D&L. Administra cajeras, jefas de caja y tesoreras en todas las sucursales.',
  applicationName: 'D&L Gestor',
  appleWebApp: { capable: true, title: 'D&L Gestor', statusBarStyle: 'default' },
  formatDetection: { telephone: false },
  icons: {
    icon: [
      { url: '/favicon.ico', type: 'image/x-icon' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
    apple: [{ url: '/icons/apple-touch-icon.png', sizes: '180x180' }],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={plusJakarta.variable}>
      <body className={plusJakarta.className}>
        <PwaSetup />
        <AuthProvider>
          <AuthGate>
            <AppProvider>{children}</AppProvider>
          </AuthGate>
        </AuthProvider>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
