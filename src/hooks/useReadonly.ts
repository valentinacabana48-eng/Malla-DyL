'use client';
import { usePinContext } from '@/context/PinContext';

/**
 * Returns true when the current user only has read-only access.
 * Use this to disable edit/delete/save buttons throughout the app.
 */
export function useReadonly(): boolean {
  const { accessLevel } = usePinContext();
  return accessLevel === 'readonly';
}
