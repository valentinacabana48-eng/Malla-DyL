-- Turnos por sucursal.
-- shifts.sucursal = NULL: turno compartido por todas las sucursales (los que ya existían).
-- Con sucursal: turno propio de esa sucursal, que puede crear y editar el admin de esa sucursal.
-- El admin general sigue pudiendo crear, editar y borrar cualquier turno.
-- Solo agrega una columna y ajusta las políticas existentes (sin DROP).

ALTER TABLE public.shifts ADD COLUMN IF NOT EXISTS sucursal TEXT;

ALTER POLICY shifts_insert ON public.shifts
  WITH CHECK (
    public.is_global_admin()
    OR (sucursal IS NOT NULL AND public.can_edit_sucursal(sucursal))
  );

ALTER POLICY shifts_update ON public.shifts
  USING (
    public.is_global_admin()
    OR (sucursal IS NOT NULL AND public.can_edit_sucursal(sucursal))
  )
  WITH CHECK (
    public.is_global_admin()
    OR (sucursal IS NOT NULL AND public.can_edit_sucursal(sucursal))
  );

ALTER POLICY shifts_delete ON public.shifts
  USING (
    public.is_global_admin()
    OR (sucursal IS NOT NULL AND public.can_edit_sucursal(sucursal))
  );
