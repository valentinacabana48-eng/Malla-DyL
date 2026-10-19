'use client';
import { useAuth } from '@/context/AuthContext';

/**
 * true cuando esta persona no puede editar ese módulo (por defecto, la malla).
 * Úsalo para desactivar botones de editar, borrar y guardar.
 * (La base de datos también lo impone mediante RLS.)
 */
export function useReadonly(modulo: 'malla' | 'personal' = 'malla'): boolean {
  return !useAuth().can(modulo === 'personal' ? 'personal_editar' : 'malla_editar');
}
