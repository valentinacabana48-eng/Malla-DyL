import type { MetadataRoute } from 'next';

// Permite instalar D&L Gestor como app en celulares (Android/iPhone) y en PC.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'D&L Gestor — Mallas de Turnos',
    short_name: 'D&L Gestor',
    description: 'Gestión de turnos, personal y asistencia de Mayorista D&L.',
    lang: 'es-CL',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0f2744',
    theme_color: '#0f2744',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Malla de turnos', url: '/malla-de-turnos', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
      { name: 'Asistencia', url: '/asistencia', icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
