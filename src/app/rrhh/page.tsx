import AppLayout from '@/components/AppLayout';
import AdminOnly from '@/components/AdminOnly';
import RRHHContent from './components/RRHHContent';

export default function RRHHPage() {
  return (
    <AppLayout>
      <AdminOnly>
        <RRHHContent />
      </AdminOnly>
    </AppLayout>
  );
}
