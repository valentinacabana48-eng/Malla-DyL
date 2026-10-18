import React from 'react';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import { Toaster } from 'sonner';
import AppShell from '@/components/AppShell';
import PwaSetup from '@/components/PwaSetup';
import DesktopModeNotice from '@/components/DesktopModeNotice';
import { VISTA_INIT_SCRIPT } from '@/lib/vista';
import '../styles/tailwind.css';

// Fuente guardada en el proyecto (antes se descargaba de Google Fonts al compilar y
// eso hacía fallar el deploy de Netlify cuando Google cambiaba el formato de sus enlaces)
const plusJakarta = localFont({
  src: './fonts/PlusJakartaSans-latin.woff2',
  weight: '200 800',
  variable: '--font-plus-jakarta',
  display: 'swap',
});

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0f2744',
};

export const metadata: Metadata = {
  title: 'DyL Gestor — Gestión de Mallas de Turnos',
  description:
    'Sistema de gestión de turnos y personal para Mayorista DyL. Administra cajeras, jefas de caja y tesoreras en todas las sucursales.',
  applicationName: 'DyL Gestor',
  // Archivo en public/ (y no app/manifest.ts) para que Mis turnos pueda tener el suyo
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'DyL Gestor', statusBarStyle: 'default' },
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
    <html lang="es" className={plusJakarta.variable} suppressHydrationWarning>
      <head>
        {/* Aplica la vista elegida (celular / computador) antes de pintar */}
        <script dangerouslySetInnerHTML={{ __html: VISTA_INIT_SCRIPT }} />
      </head>
      <body className={plusJakarta.className}>
        <PwaSetup />
        <DesktopModeNotice />
        <AppShell>{children}</AppShell>
        <Toaster position="bottom-right" richColors />
      </body>
    </html>
  );
}
