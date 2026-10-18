-- Las funciones de rol y de escritura solo pueden llamarlas usuarios con sesión iniciada.
-- (Las políticas RLS usan app_role/is_admin/can_read, por eso authenticated sí las ejecuta.)
REVOKE EXECUTE ON FUNCTION public.app_role(), public.is_admin(), public.can_read(), public.handle_new_user() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.app_role(), public.is_admin(), public.can_read() TO authenticated;
REVOKE EXECUTE ON FUNCTION
  public.set_schedule_cell(TEXT, TEXT, INT, TEXT),
  public.set_special_day_cell(TEXT, TEXT, INT, TEXT),
  public.remove_special_day_type(TEXT)
FROM PUBLIC, anon;
