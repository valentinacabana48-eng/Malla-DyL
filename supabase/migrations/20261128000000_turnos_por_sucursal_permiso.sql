-- Permiso "Turnos: crear los de su sucursal" (turnos_sucursal).
-- Quien lo tenga puede crear, editar y borrar los turnos propios de sus sucursales
-- (nunca los compartidos por todas). El admin general y el admin de sucursal siguen igual.
-- Solo ajusta las políticas existentes (sin DROP).

ALTER POLICY shifts_insert ON public.shifts
  WITH CHECK (
    public.is_global_admin()
    OR (sucursal IS NOT NULL AND public.can_edit_sucursal(sucursal))
    OR (sucursal IS NOT NULL AND public.has_perm('turnos_sucursal')
        AND public.in_my_sucursales(sucursal))
  );

ALTER POLICY shifts_update ON public.shifts
  USING (
    public.is_global_admin()
    OR (sucursal IS NOT NULL AND public.can_edit_sucursal(sucursal))
    OR (sucursal IS NOT NULL AND public.has_perm('turnos_sucursal')
        AND public.in_my_sucursales(sucursal))
  )
  WITH CHECK (
    public.is_global_admin()
    OR (sucursal IS NOT NULL AND public.can_edit_sucursal(sucursal))
    OR (sucursal IS NOT NULL AND public.has_perm('turnos_sucursal')
        AND public.in_my_sucursales(sucursal))
  );

ALTER POLICY shifts_delete ON public.shifts
  USING (
    public.is_global_admin()
    OR (sucursal IS NOT NULL AND public.can_edit_sucursal(sucursal))
    OR (sucursal IS NOT NULL AND public.has_perm('turnos_sucursal')
        AND public.in_my_sucursales(sucursal))
  );
