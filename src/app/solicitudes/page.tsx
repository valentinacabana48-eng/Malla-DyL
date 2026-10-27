import AppLayout from '@/components/AppLayout';
import AdminOnly from '@/components/AdminOnly';
import SolicitudesContent from './components/SolicitudesContent';

export default function SolicitudesPage() {
  return (
    <AppLayout>
      <AdminOnly perm="solicitudes">
        <SolicitudesContent />
      </AdminOnly>
    </AppLayout>
  );
}
