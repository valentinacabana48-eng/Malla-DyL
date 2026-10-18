'use client';
import { useEffect } from 'react';
import { setupPwa } from '@/lib/pwa';

export default function PwaSetup() {
  useEffect(() => {
    setupPwa();
  }, []);
  return null;
}
