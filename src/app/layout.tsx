import React from 'react';
import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';
import { AppProvider } from '@/context/AppContext';
import { PinProvider } from '@/context/PinContext';
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
};

export const metadata: Metadata = {
  title: 'D&L Gestor — Gestión de Mallas de Turnos',
  description:
    'Sistema de gestión de turnos y personal para Mayorista D&L. Administra cajeras, jefas de caja y tesoreras en todas las sucursales.',
  icons: { icon: [{ url: '/favicon.ico', type: 'image/x-icon' }] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={plusJakarta.variable}>
      <body className={plusJakarta.className}>
        <AppProvider>
          <PinProvider>
            {children}
          </PinProvider>
        </AppProvider>
        <Toaster position="bottom-right" richColors />
</body>
    </html>
  );
}