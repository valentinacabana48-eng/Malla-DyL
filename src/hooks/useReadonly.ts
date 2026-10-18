'use client';
import { useAuth } from '@/context/AuthContext';

/**
 * Returns true when the current user only has read-only access.
 * Use this to disable edit/delete/save buttons throughout the app.
 * (La base de datos también lo impone mediante RLS.)
 */
export function useReadonly(): boolean {
  return useAuth().isReadonly;
}
