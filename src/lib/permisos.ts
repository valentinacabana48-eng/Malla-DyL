// Permisos de la app: qué puede hacer cada persona, además de qué sucursales, áreas y
// cargos ve. La base de datos impone lo mismo (has_perm() en Supabase).

export type Perm =
  | 'malla_ver'
  | 'malla_editar'
  | 'malla_publicar'
  | 'personal_ver'
  | 'personal_editar'
  | 'asistencia_ver'
  | 'asistencia_marcar'
  | 'asistencia_aprobar'
  | 'horas_extra'
  | 'horas_extra_aprobar'
  | 'rrhh';

export type UserRole = 'admin' | 'lector' | 'asistencia' | 'personalizado' | 'pendiente';

/** Casillas de permisos, agrupadas por módulo, como se muestran en Ajustes */
export const PERM_GROUPS: { modulo: string; perms: { perm: Perm; label: string }[] }[] = [
  {
    modulo: 'Malla',
    perms: [
      { perm: 'malla_ver', label: 'Ver' },
      { perm: 'malla_editar', label: 'Editar' },
      { perm: 'malla_publicar', label: 'Publicar' },
    ],
  },
  {
    modulo: 'Personal',
    perms: [
      { perm: 'personal_ver', label: 'Ver' },
      { perm: 'personal_editar', label: 'Editar' },
    ],
  },
  {
    modulo: 'Asistencia',
    perms: [
      { perm: 'asistencia_ver', label: 'Ver' },
      { perm: 'asistencia_marcar', label: 'Marcar (por aprobar)' },
      { perm: 'asistencia_aprobar', label: 'Aprobar' },
    ],
  },
  {
    modulo: 'Horas extra',
    perms: [
      { perm: 'horas_extra', label: 'Anotar (por aprobar)' },
      { perm: 'horas_extra_aprobar', label: 'Aprobar' },
    ],
  },
  { modulo: 'RRHH', perms: [{ perm: 'rrhh', label: 'Ver y editar' }] },
];

export const ALL_PERMS: Perm[] = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.perm));

/** Igual que has_perm() en la base de datos */
export function permsFor(role: UserRole | null, permisos: string[] | null): Set<Perm> {
  switch (role) {
    case 'admin':
      return new Set(ALL_PERMS);
    case 'lector':
      return new Set<Perm>(['malla_ver', 'personal_ver', 'asistencia_ver']);
    case 'asistencia':
      return new Set<Perm>(['malla_ver', 'asistencia_ver', 'asistencia_marcar']);
    case 'personalizado':
      return new Set((permisos ?? []).filter((p): p is Perm => ALL_PERMS.includes(p as Perm)));
    default:
      return new Set();
  }
}

/** Permiso que pide cada sección del menú (Ajustes además pide ser administradora) */
export const ROUTE_PERMS: { href: string; perm: Perm }[] = [
  { href: '/malla-de-turnos', perm: 'malla_ver' },
  { href: '/cumplimiento', perm: 'personal_ver' },
  { href: '/personal', perm: 'personal_ver' },
  { href: '/asistencia', perm: 'asistencia_ver' },
  { href: '/rrhh', perm: 'rrhh' },
  { href: '/vista-previa', perm: 'malla_ver' },
  { href: '/', perm: 'personal_ver' },
];

export function routePerm(pathname: string): Perm | null {
  const hit = ROUTE_PERMS.find((r) =>
    r.href === '/' ? pathname === '/' : pathname === r.href || pathname.startsWith(`${r.href}/`)
  );
  return hit ? hit.perm : null;
}
