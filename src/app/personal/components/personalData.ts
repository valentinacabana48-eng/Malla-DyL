export interface Worker {
  id: string;
  name: string;
  initials: string;
  rut: string;
  cargo: 'Cajera' | 'Jefa de Caja' | 'Tesorera';
  sucursal: string;
  area: string;
  horasContratadas: 20 | 30 | 42;
  estado: 'Activo' | 'Inactivo';
  avatarColor: string;
}

export const WORKERS: Worker[] = [
  { id: 'pw-001', name: 'María González', initials: 'MG', rut: '12.345.678-9', cargo: 'Cajera', sucursal: 'Mayorista Talca', area: 'Cajas', horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-blue-100 text-blue-700' },
  { id: 'pw-002', name: 'Carla Morales', initials: 'CM', rut: '13.987.654-1', cargo: 'Cajera', sucursal: 'Mayorista Talca', area: 'Cajas', horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-green-100 text-green-700' },
  { id: 'pw-003', name: 'Paula Martínez', initials: 'PM', rut: '14.876.543-2', cargo: 'Cajera', sucursal: 'Mayorista Talca', area: 'Cajas', horasContratadas: 30, estado: 'Activo', avatarColor: 'bg-pink-100 text-pink-700' },
  { id: 'pw-004', name: 'Fernanda López', initials: 'FL', rut: '16.234.567-3', cargo: 'Jefa de Caja', sucursal: 'Mayorista Talca', area: 'Cajas', horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-orange-100 text-orange-700' },
  { id: 'pw-005', name: 'Camila Rojas', initials: 'CR', rut: '17.345.678-4', cargo: 'Cajera', sucursal: 'Mayorista Talca', area: 'Cajas', horasContratadas: 20, estado: 'Activo', avatarColor: 'bg-red-100 text-red-700' },
  { id: 'pw-006', name: 'Valentina Pérez', initials: 'VP', rut: '18.456.789-5', cargo: 'Tesorera', sucursal: 'Mayorista Talca', area: 'Tesorería', horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-violet-100 text-violet-700' },
  { id: 'pw-007', name: 'Karla Díaz', initials: 'KD', rut: '19.567.890-6', cargo: 'Cajera', sucursal: 'Mayorista Talca', area: 'Cajas', horasContratadas: 30, estado: 'Activo', avatarColor: 'bg-teal-100 text-teal-700' },
  { id: 'pw-008', name: 'Constanza Silva', initials: 'CS', rut: '20.678.901-7', cargo: 'Jefa de Caja', sucursal: 'Mayorista Talca', area: 'Cajas', horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-indigo-100 text-indigo-700' },
  { id: 'pw-009', name: 'Sofía Reyes', initials: 'SR', rut: '21.789.012-8', cargo: 'Cajera', sucursal: 'Mayorista Curicó', area: 'Cajas', horasContratadas: 30, estado: 'Activo', avatarColor: 'bg-cyan-100 text-cyan-700' },
  { id: 'pw-010', name: 'Andrea Fuentes', initials: 'AF', rut: '22.890.123-9', cargo: 'Cajera', sucursal: 'Mayorista Curicó', area: 'Cajas', horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-amber-100 text-amber-700' },
  { id: 'pw-011', name: 'Claudia Torres', initials: 'CT', rut: '15.123.456-0', cargo: 'Jefa de Caja', sucursal: 'Mayorista Linares', area: 'Cajas', horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-lime-100 text-lime-700' },
  { id: 'pw-012', name: 'Isabel Vega', initials: 'IV', rut: '16.987.654-3', cargo: 'Tesorera', sucursal: 'Mayorista Curicó', area: 'Tesorería', horasContratadas: 42, estado: 'Inactivo', avatarColor: 'bg-rose-100 text-rose-700' },
];

export const SUCURSALES = ['Todas', 'Mayorista Talca', 'Mayorista Curicó', 'Mayorista Linares', 'Mayorista Rancagua'];
export const AREAS = ['Todas', 'Cajas', 'Tesorería', 'Supermercado', 'Bodega'];
export const CARGOS = ['Cajera', 'Jefa de Caja', 'Tesorera'];
export const HORAS_OPTIONS = [20, 30, 42];