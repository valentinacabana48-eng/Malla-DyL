'use client';
import { useState } from 'react';
import AppLayout from '@/components/AppLayout';
import RRHHContent from './components/RRHHContent';
import RRHHLock from './components/RRHHLock';

export default function RRHHPage() {
  const [unlocked, setUnlocked] = useState(false);

  if (!unlocked) {
    return <RRHHLock onUnlocked={() => setUnlocked(true)} />;
  }

  return (
    <AppLayout>
      <RRHHContent />
    </AppLayout>
  );
}
