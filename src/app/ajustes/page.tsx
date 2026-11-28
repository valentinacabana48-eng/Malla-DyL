import AppLayout from '@/components/AppLayout';
import AdminOnly from '@/components/AdminOnly';
import AjustesContent from './components/AjustesContent';

export default function AjustesPage() {
  return (
    <AppLayout>
      <AdminOnly orPerm="turnos_sucursal">
        <AjustesContent />
      </AdminOnly>
    </AppLayout>
  );
}
