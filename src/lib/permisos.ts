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
      { perm: 'horas_extra', label: 'Horas extra' },
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

export type PerfilId =
  | 'admin_general'
  | 'gerente'
  | 'encargada'
  | 'jefa_caja'
  | 'lector'
  | 'personalizado'
  | 'pendiente';

/** Perfiles listos: al elegir uno se marcan sus permisos (después se pueden ajustar) */
export const PERFILES: {
  id: PerfilId;
  label: string;
  description: string;
  role: UserRole;
  permisos?: Perm[];
  /** Qué alcance conviene elegir después */
  pide?: string;
}[] = [
  {
    id: 'admin_general',
    label: 'Administración general',
    description: 'Todo, en todas las sucursales, incluidos los Ajustes y los usuarios.',
    role: 'admin',
  },
  {
    id: 'gerente',
    label: 'Gerente de sucursal',
    description: 'Todo en las sucursales que elijas: malla, personal, asistencia y RRHH.',
    role: 'admin',
    pide: 'Elige su sucursal.',
  },
  {
    id: 'encargada',
    label: 'Encargada de área',
    description:
      'Arma y publica la malla de su área, ve a su personal y aprueba la asistencia y las horas extra.',
    role: 'personalizado',
    permisos: [
      'malla_ver',
      'malla_editar',
      'malla_publicar',
      'personal_ver',
      'asistencia_ver',
      'asistencia_aprobar',
      'horas_extra',
    ],
    pide: 'Elige su sucursal y su área.',
  },
  {
    id: 'jefa_caja',
    label: 'Jefa de caja',
    description: 'Ve la malla y marca la asistencia de los cargos que elijas; queda por aprobar.',
    role: 'personalizado',
    permisos: ['malla_ver', 'asistencia_ver', 'asistencia_marcar'],
    pide: 'Elige su sucursal y el cargo Cajera.',
  },
  {
    id: 'lector',
    label: 'Solo lectura',
    description: 'Ve la malla, el personal y la asistencia, pero no modifica nada.',
    role: 'lector',
  },
  {
    id: 'personalizado',
    label: 'Personalizado',
    description: 'Tú eliges las casillas.',
    role: 'personalizado',
  },
  {
    id: 'pendiente',
    label: 'Sin acceso',
    description: 'No puede entrar a la app.',
    role: 'pendiente',
  },
];

/** Perfil que corresponde a una fila guardada (si no tiene uno guardado, se deduce del rol) */
export function perfilOf(row: {
  role: UserRole;
  perfil?: string | null;
  sucursales?: string[] | null;
  areas?: string[] | null;
  cargos?: string[] | null;
}): PerfilId {
  // Gerente sin sucursal elegida todavía: queda sin acceso hasta elegirla
  if (row.role === 'pendiente') return row.perfil === 'gerente' ? 'gerente' : 'pendiente';
  if (row.role === 'lector') return 'lector';
  if (row.role === 'asistencia') return 'jefa_caja';
  if (row.role === 'admin') {
    const scoped = !!(row.sucursales?.length || row.areas?.length || row.cargos?.length);
    return scoped ? 'gerente' : 'admin_general';
  }
  const known = PERFILES.find((p) => p.id === row.perfil);
  return known ? known.id : 'personalizado';
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
