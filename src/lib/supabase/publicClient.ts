import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Cliente para "Mis turnos": sin cuenta ni sesión de Supabase (las trabajadoras entran con
// RUT y clave por funciones de la base de datos) y sin conexión en vivo.
let publicClient: SupabaseClient | null = null;

export function getPublicSupabase(): SupabaseClient {
  if (!publicClient) {
    publicClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  return publicClient;
}
