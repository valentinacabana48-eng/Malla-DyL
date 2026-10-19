import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Mis turnos — DyL',
  description: 'Revisa tu malla de turnos del mes.',
  applicationName: 'Mis turnos DyL',
  manifest: '/mis-turnos.webmanifest',
  appleWebApp: { capable: true, title: 'Mis turnos', statusBarStyle: 'default' },
  robots: { index: false, follow: false },
};

export default function MisTurnosLayout({ children }: { children: React.ReactNode }) {
  return children;
}
