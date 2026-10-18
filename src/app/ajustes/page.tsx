import AppLayout from '@/components/AppLayout';
import AdminOnly from '@/components/AdminOnly';
import AjustesContent from './components/AjustesContent';

export default function AjustesPage() {
  return (
    <AppLayout>
      <AdminOnly>
        <AjustesContent />
      </AdminOnly>
    </AppLayout>
  );
}
