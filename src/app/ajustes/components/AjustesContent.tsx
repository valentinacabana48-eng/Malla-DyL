'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { toast } from 'sonner';
import {
  Settings,
  Plus,
  Pencil,
  Trash2,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  MapPin,
  Users,
  Coffee,
  Tag,
  FileSpreadsheet,
  CalendarX,
  Mail,
  ShieldCheck,
  Search,
  ChevronDown,
} from 'lucide-react';
import {
  useAppContext,
  SHIFT_COLOR_OPTIONS,
  NON_WORKING_COLOR_OPTIONS,
  NON_WORKING_TYPES,
  type Shift,
  type NonWorkingType,
  type Sucursal,
  timeToMinutes,
} from '@/context/AppContext';
import { useAuth, type UserRole } from '@/context/AuthContext';
import { ALL_PERMS, PERM_GROUPS, permsFor, type Perm } from '@/lib/permisos';
import { getSupabase } from '@/lib/supabase/client';
import ExcelImportPanel from './ExcelImportPanel';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function calcHours(start: string, end: string): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(':').map(Number);
  const [eh, em] = end.split(':').map(Number);
  let mins = eh * 60 + em - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.round((mins / 60) * 10) / 10;
}

function calcNetHoursLocal(start: string, end: string, colacion: number): number {
  const gross = calcHours(start, end);
  if (colacion > 0) {
    return Math.round((gross - colacion / 60) * 10) / 10;
  }
  return gross;
}

function generateCode(label: string): string {
  return (
    label
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '-')
      .replace(/[^a-z0-9-]/g, '')
      .slice(0, 20) || `turno-${Date.now()}`
  );
}

// Código del turno: el de un turno de sucursal lleva la sucursal, para no chocar con otro igual
function makeShiftCode(label: string, sucursal: string): string {
  const base = generateCode(label);
  return sucursal ? `${base}-${generateCode(sucursal)}` : base;
}

function startHour(start: string): number | null {
  if (!start) return null;
  const h = parseInt(start.split(':')[0], 10);
  return Number.isNaN(h) ? null : h;
}

// El color se asigna solo según la hora de entrada: el mismo que ya tienen los turnos que
// entran a esa hora; si no hay ninguno, uno fijo de la paleta para esa hora
function autoShiftColor(start: string, shifts: Shift[]) {
  const hour = startHour(start);
  const same = shifts.find((s) => s.colorClass && startHour(s.start) === hour);
  if (same) return { colorClass: same.colorClass, legendColor: same.legendColor };
  const opt = SHIFT_COLOR_OPTIONS[(hour ?? 0) % SHIFT_COLOR_OPTIONS.length];
  return { colorClass: opt.colorClass, legendColor: opt.legendColor };
}

function generateNwtCode(label: string): string {
  return `CUSTOM_${label
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '_')
    .replace(/[^A-Z0-9_]/g, '')
    .slice(0, 20)}_${Date.now()}`;
}

// ─── Empty state ─────────────────────────────────────────────────────────────

function EmptyState({ onAdd, label }: { onAdd: () => void; label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-full bg-secondary/10 flex items-center justify-center mb-4">
        <Clock size={32} className="text-secondary" />
      </div>
      <h3 className="text-lg font-semibold text-foreground mb-1">No hay {label} configurados</h3>
      <p className="text-muted-foreground text-sm max-w-xs mb-6">
        Agrega {label} para que aparezcan en los filtros y formularios de la aplicación.
      </p>
      <button
        onClick={onAdd}
        className="flex items-center gap-2 bg-secondary text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm"
      >
        <Plus size={16} />
        Agregar primero
      </button>
    </div>
  );
}

// ─── Shift Form ───────────────────────────────────────────────────────────────

interface ShiftFormData {
  label: string;
  start: string;
  end: string;
  colacion: number;
  /** '' = todas las sucursales */
  sucursal: string;
}

const EMPTY_FORM: ShiftFormData = { label: '', start: '', end: '', colacion: 0, sucursal: '' };

interface ShiftFormProps {
  initial?: ShiftFormData;
  existingCodes: string[];
  editingCode?: string;
  /** Sucursales que se pueden elegir para el turno */
  sucursalOptions: string[];
  /** Si se puede crear un turno para todas las sucursales (solo el admin general) */
  allowAll: boolean;
  /** Color que tendrá el turno (se asigna solo) */
  previewColor: (start: string) => { colorClass: string };
  onSave: (data: ShiftFormData) => void;
  onCancel: () => void;
}

function ShiftForm({
  initial = EMPTY_FORM,
  existingCodes,
  editingCode,
  sucursalOptions,
  allowAll,
  previewColor,
  onSave,
  onCancel,
}: ShiftFormProps) {
  const [form, setForm] = useState<ShiftFormData>(initial);
  const [error, setError] = useState('');

  const grossHours = calcHours(form.start, form.end);
  const netHours = calcNetHoursLocal(form.start, form.end, form.colacion);
  const previewCode = editingCode || makeShiftCode(form.label, form.sucursal);
  const colacionApplies = form.colacion > 0;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) {
      setError('El nombre del turno es obligatorio.');
      return;
    }
    if (!form.start) {
      setError('La hora de entrada es obligatoria.');
      return;
    }
    if (!form.end) {
      setError('La hora de salida es obligatoria.');
      return;
    }
    if (form.start === form.end) {
      setError('La hora de entrada y salida no pueden ser iguales.');
      return;
    }
    if (!allowAll && !form.sucursal) {
      setError('Elige la sucursal del turno.');
      return;
    }
    const code = editingCode || makeShiftCode(form.label, form.sucursal);
    if (!editingCode && existingCodes.includes(code)) {
      setError('Ya existe un turno con ese nombre. Usa un nombre diferente.');
      return;
    }
    setError('');
    onSave(form);
  }

  const selectedColor = previewColor(form.start);

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5"
    >
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
        <Clock size={16} className="text-secondary" />
        {editingCode ? 'Editar turno' : 'Nuevo turno'}
      </h3>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Nombre del turno *
        </label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="Ej: 6 a 14, Turno Mañana, Medio Día..."
          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {form.label && (
          <p className="text-[11px] text-muted-foreground">
            Código generado: <span className="font-mono font-semibold">{previewCode}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hora entrada *
          </label>
          <input
            type="time"
            value={form.start}
            onChange={(e) => setForm((f) => ({ ...f, start: e.target.value }))}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <div className="space-y-1.5">
          <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Hora salida *
          </label>
          <input
            type="time"
            value={form.end}
            onChange={(e) => setForm((f) => ({ ...f, end: e.target.value }))}
            className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      {/* Colacion field */}
      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Coffee size={12} />
          Colación (minutos)
        </label>
        <input
          type="number"
          min={0}
          max={120}
          value={form.colacion}
          onChange={(e) =>
            setForm((f) => ({ ...f, colacion: Math.max(0, parseInt(e.target.value) || 0) }))
          }
          placeholder="0"
          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <p className="text-[11px] text-muted-foreground">
          {form.colacion > 0
            ? `✓ Se descontarán ${form.colacion} min de colación`
            : 'Ingresa minutos de colación para descontarlos del bruto'}
        </p>
      </div>

      {form.start && form.end && form.start !== form.end && (
        <div className="flex items-center gap-4 bg-secondary/10 rounded-lg px-4 py-2.5 text-sm text-secondary font-semibold">
          <div className="flex items-center gap-2">
            <Clock size={14} />
            Bruto: {grossHours}h
          </div>
          {colacionApplies && form.colacion > 0 && (
            <>
              <span className="text-secondary/50">|</span>
              <div className="flex items-center gap-2">
                <Coffee size={14} />
                Neto: {netHours}h
              </div>
            </>
          )}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MapPin size={12} />
          Sucursal
        </label>
        <select
          value={form.sucursal}
          onChange={(e) => setForm((f) => ({ ...f, sucursal: e.target.value }))}
          disabled={!!editingCode}
          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-70"
        >
          {allowAll && <option value="">Todas las sucursales</option>}
          {!allowAll && !form.sucursal && <option value="">Elige la sucursal…</option>}
          {sucursalOptions.map((name) => (
            <option key={`suc-${name}`} value={name}>
              {name}
            </option>
          ))}
        </select>
        <p className="text-[11px] text-muted-foreground">
          {form.sucursal
            ? `Solo ${form.sucursal} verá este turno en su malla.`
            : 'Todas las sucursales verán este turno.'}
        </p>
      </div>

      {form.label && (
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-muted-foreground">
            Así se verá (el color se asigna solo según la hora de entrada):
          </span>
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${selectedColor.colorClass}`}
          >
            <Clock size={11} />
            {form.label}
            {form.start && form.end ? ` (${form.start} - ${form.end})` : ''}
          </span>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex items-center gap-2 bg-secondary text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm"
        >
          <CheckCircle size={15} />
          {editingCode ? 'Guardar cambios' : 'Agregar turno'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 bg-muted text-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-muted/80 transition-all"
        >
          <XCircle size={15} />
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── Lista de turnos (compacta, agrupada por hora de entrada) ─────────────────

interface ShiftListProps {
  shifts: Shift[];
  canEdit: (s: Shift) => boolean;
  onEdit: (code: string) => void;
  onDelete: (code: string) => void;
}

function ShiftList({ shifts, canEdit, onEdit, onDelete }: ShiftListProps) {
  const [query, setQuery] = useState('');
  const [confirmCode, setConfirmCode] = useState<string | null>(null);
  // Grupos cerrados; al buscar se abren todos para ver los resultados
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const searching = query.trim() !== '';
  const toggleGroup = (title: string) =>
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = shifts.filter(
      (s) =>
        !q ||
        s.label.toLowerCase().includes(q) ||
        `${s.start}-${s.end}`.includes(q) ||
        (s.sucursal ?? 'todas').toLowerCase().includes(q)
    );
    const map = new Map<string, Shift[]>();
    filtered
      .slice()
      .sort(
        (x, y) =>
          timeToMinutes(x.start) - timeToMinutes(y.start) ||
          timeToMinutes(x.end) - timeToMinutes(y.end)
      )
      .forEach((s) => {
        const h = startHour(s.start);
        const key = h === null ? 'Sin horario' : `Entrada ${String(h).padStart(2, '0')}:00`;
        map.set(key, [...(map.get(key) ?? []), s]);
      });
    return [...map.entries()];
  }, [shifts, query]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar turno (ej: 08:00, 15:30, nombre o sucursal)…"
          className="w-full pl-9 pr-3 py-2.5 bg-card border border-border rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {groups.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No hay turnos que coincidan con la búsqueda.
        </p>
      )}

      {groups.map(([title, list]) => {
        const open = searching || openGroups.has(title);
        return (
          <section
            key={title}
            className="bg-card border border-border rounded-xl overflow-hidden shadow-sm"
          >
            <h3>
              <button
                type="button"
                onClick={() => toggleGroup(title)}
                aria-expanded={open}
                className={`w-full min-h-[44px] px-4 py-2 bg-muted/40 text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center justify-between gap-3 hover:bg-muted/70 transition-colors ${
                  open ? 'border-b border-border' : ''
                }`}
              >
                <span className="flex items-center gap-2">
                  <ChevronDown
                    size={16}
                    className={`shrink-0 transition-transform ${open ? '' : '-rotate-90'}`}
                  />
                  {title}
                </span>
                <span className="flex items-center gap-2 font-semibold normal-case tracking-normal">
                  <span className="flex -space-x-1" aria-hidden="true">
                    {list.slice(0, 6).map((s) => (
                      <span
                        key={s.code}
                        className={`w-2.5 h-2.5 rounded-full ring-2 ring-card ${s.legendColor || 'bg-gray-400'}`}
                      />
                    ))}
                  </span>
                  {list.length} turno{list.length !== 1 ? 's' : ''}
                </span>
              </button>
            </h3>
            {open && (
              <ul className="divide-y divide-border/60">
                {list.map((shift) => {
                  const net = calcNetHoursLocal(shift.start, shift.end, shift.colacion || 0);
                  const editable = canEdit(shift);
                  return (
                    <li key={shift.code} className="flex items-center gap-3 px-4 py-2">
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 ${shift.legendColor || 'bg-gray-400'}`}
                      />
                      <div className="flex-1 min-w-0 flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                        <span className="text-sm font-semibold text-foreground whitespace-nowrap">
                          {shift.start && shift.end ? `${shift.start}–${shift.end}` : shift.label}
                        </span>
                        {shift.start && shift.end && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {net}h netas{shift.colacion ? ` · col. ${shift.colacion} min` : ''}
                          </span>
                        )}
                        <span
                          className={`text-[11px] font-semibold px-1.5 py-0.5 rounded-md whitespace-nowrap ${
                            shift.sucursal
                              ? 'bg-blue-50 text-blue-700'
                              : 'bg-muted text-muted-foreground'
                          }`}
                        >
                          {shift.sucursal ?? 'Todas'}
                        </span>
                      </div>
                      {confirmCode === shift.code ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-xs text-red-600 font-semibold hidden sm:inline">
                            ¿Eliminar?
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              onDelete(shift.code);
                              setConfirmCode(null);
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold"
                          >
                            Eliminar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmCode(null)}
                            className="px-2.5 py-1.5 rounded-lg bg-muted text-foreground text-xs font-semibold"
                          >
                            No
                          </button>
                        </div>
                      ) : editable ? (
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => onEdit(shift.code)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
                            title="Editar turno"
                            aria-label={`Editar turno ${shift.label}`}
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmCode(shift.code)}
                            className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                            title="Eliminar turno"
                            aria-label={`Eliminar turno ${shift.label}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      ) : (
                        <span className="text-[11px] text-muted-foreground shrink-0">
                          Solo admin general
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({
  label,
  onConfirm,
  onCancel,
}: {
  label: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-2 text-red-700 font-semibold">
        <AlertTriangle size={16} />
        ¿Eliminar &quot;{label}&quot;?
      </div>
      <p className="text-sm text-red-600">Esta acción no se puede deshacer.</p>
      <div className="flex gap-3">
        <button
          onClick={onConfirm}
          className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-red-700 transition-all"
        >
          <Trash2 size={14} />
          Sí, eliminar
        </button>
        <button
          onClick={onCancel}
          className="flex items-center gap-2 bg-muted text-foreground px-4 py-2 rounded-lg text-sm font-semibold hover:bg-muted/80 transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

// ─── Sucursal Manager (with Cajas) ───────────────────────────────────────────

interface SucursalManagerProps {
  sucursales: Sucursal[];
  onAdd: (name: string, cajas: number) => void;
  onUpdate: (oldName: string, newName: string, cajas: number) => void;
  onDelete: (name: string) => void;
}

function SucursalManager({ sucursales, onAdd, onUpdate, onDelete }: SucursalManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCajas, setNewCajas] = useState(20);
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCajas, setEditCajas] = useState(20);
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [error, setError] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (sucursales.some((s) => s.name === trimmed)) {
      setError('Ya existe una sucursal con ese nombre.');
      return;
    }
    if (newCajas < 1) {
      setError('El número de cajas debe ser al menos 1.');
      return;
    }
    onAdd(trimmed, newCajas);
    setNewName('');
    setNewCajas(20);
    setShowForm(false);
    setError('');
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = editName.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (trimmed !== editingItem && sucursales.some((s) => s.name === trimmed)) {
      setError('Ya existe una sucursal con ese nombre.');
      return;
    }
    if (editCajas < 1) {
      setError('El número de cajas debe ser al menos 1.');
      return;
    }
    onUpdate(editingItem!, trimmed, editCajas);
    setEditingItem(null);
    setError('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <MapPin size={16} className="text-secondary" />
          <span className="text-sm font-semibold text-foreground">
            Sucursales ({sucursales.length})
          </span>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingItem(null);
              setError('');
            }}
            className="flex items-center gap-1.5 bg-secondary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all shadow-sm"
          >
            <Plus size={13} />
            Agregar
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-muted/30 border border-border rounded-xl p-4 mb-4 space-y-3"
        >
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
          <div className="flex gap-2 flex-wrap">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de la sucursal..."
              className="flex-1 min-w-[160px] px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <div className="flex items-center gap-2">
              <label className="text-xs text-muted-foreground whitespace-nowrap">Cajas:</label>
              <input
                type="number"
                min={1}
                max={200}
                value={newCajas}
                onChange={(e) => setNewCajas(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-20 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center"
              />
            </div>
            <button
              type="submit"
              className="flex items-center gap-1.5 bg-secondary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all"
            >
              <CheckCircle size={14} />
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setNewName('');
                setNewCajas(20);
                setError('');
              }}
              className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <XCircle size={14} />
            </button>
          </div>
        </form>
      )}

      {sucursales.length === 0 && !showForm ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No hay sucursales configuradas. Agrega la primera.
        </div>
      ) : (
        <div className="space-y-2">
          {sucursales.map((suc) => (
            <div key={`suc-${suc.name}`}>
              {deletingItem === suc.name ? (
                <DeleteConfirm
                  label={suc.name}
                  onConfirm={() => {
                    onDelete(suc.name);
                    setDeletingItem(null);
                  }}
                  onCancel={() => setDeletingItem(null)}
                />
              ) : editingItem === suc.name ? (
                <form
                  onSubmit={handleEdit}
                  className="bg-muted/30 border border-border rounded-xl p-3 flex gap-2 flex-wrap items-center"
                >
                  {error && (
                    <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 rounded px-2 py-1 text-xs w-full">
                      <AlertTriangle size={11} />
                      {error}
                    </div>
                  )}
                  <input
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="flex-1 min-w-[140px] px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                    autoFocus
                  />
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">
                      Cajas:
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={200}
                      value={editCajas}
                      onChange={(e) => setEditCajas(Math.max(1, parseInt(e.target.value) || 1))}
                      className="w-20 px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center"
                    />
                  </div>
                  <button
                    type="submit"
                    className="flex items-center gap-1 bg-secondary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all"
                  >
                    <CheckCircle size={13} />
                    Guardar
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingItem(null);
                      setError('');
                    }}
                    className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
                  >
                    <XCircle size={13} />
                  </button>
                </form>
              ) : (
                <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-3">
                    <MapPin size={14} className="text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{suc.name}</span>
                    <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-semibold">
                      {suc.cajas} caja{suc.cajas !== 1 ? 's' : ''}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingItem(suc.name);
                        setEditName(suc.name);
                        setEditCajas(suc.cajas);
                        setShowForm(false);
                        setError('');
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeletingItem(suc.name)}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Area Manager (with Cargos) ───────────────────────────────────────────────

interface AreaManagerProps {
  areas: string[];
  areaCargos: Record<string, string[]>;
  onAddArea: (name: string) => void;
  onUpdateArea: (oldName: string, newName: string) => void;
  onDeleteArea: (name: string) => void;
  onSetAreaCargos: (area: string, cargos: string[]) => void;
}

function AreaManager({
  areas,
  areaCargos,
  onAddArea,
  onUpdateArea,
  onDeleteArea,
  onSetAreaCargos,
}: AreaManagerProps) {
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [expandedArea, setExpandedArea] = useState<string | null>(null);
  const [newCargo, setNewCargo] = useState('');
  const [error, setError] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (areas.includes(trimmed)) {
      setError('Ya existe un área con ese nombre.');
      return;
    }
    onAddArea(trimmed);
    setNewName('');
    setShowForm(false);
    setError('');
  }

  function handleEdit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = editValue.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (trimmed !== editingItem && areas.includes(trimmed)) {
      setError('Ya existe un área con ese nombre.');
      return;
    }
    onUpdateArea(editingItem!, trimmed);
    setEditingItem(null);
    setEditValue('');
    setError('');
  }

  function handleAddCargo(area: string) {
    const trimmed = newCargo.trim();
    if (!trimmed) return;
    const current = areaCargos[area] || [];
    if (!current.includes(trimmed)) {
      onSetAreaCargos(area, [...current, trimmed]);
    }
    setNewCargo('');
  }

  function handleRemoveCargo(area: string, cargo: string) {
    const current = areaCargos[area] || [];
    onSetAreaCargos(
      area,
      current.filter((c) => c !== cargo)
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-secondary" />
          <span className="text-sm font-semibold text-foreground">Áreas ({areas.length})</span>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingItem(null);
              setError('');
            }}
            className="flex items-center gap-1.5 bg-secondary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all shadow-sm"
          >
            <Plus size={13} />
            Agregar
          </button>
        )}
      </div>

      {showForm && (
        <form
          onSubmit={handleAdd}
          className="bg-muted/30 border border-border rounded-xl p-4 mb-4 space-y-3"
        >
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2 text-xs">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre del área..."
              className="flex-1 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              autoFocus
            />
            <button
              type="submit"
              className="flex items-center gap-1.5 bg-secondary text-white px-4 py-2 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all"
            >
              <CheckCircle size={14} />
              Guardar
            </button>
            <button
              type="button"
              onClick={() => {
                setShowForm(false);
                setNewName('');
                setError('');
              }}
              className="px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
            >
              <XCircle size={14} />
            </button>
          </div>
        </form>
      )}

      {areas.length === 0 && !showForm ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No hay áreas configuradas. Agrega la primera.
        </div>
      ) : (
        <div className="space-y-3">
          {areas.map((area) => {
            const cargos = areaCargos[area] || [];
            const isExpanded = expandedArea === area;
            return (
              <div
                key={`area-${area}`}
                className="bg-card border border-border rounded-xl overflow-hidden hover:shadow-sm transition-shadow"
              >
                {deletingItem === area ? (
                  <div className="p-4">
                    <DeleteConfirm
                      label={area}
                      onConfirm={() => {
                        onDeleteArea(area);
                        setDeletingItem(null);
                      }}
                      onCancel={() => setDeletingItem(null)}
                    />
                  </div>
                ) : editingItem === area ? (
                  <form onSubmit={handleEdit} className="p-3 flex gap-2">
                    {error && (
                      <div className="flex items-center gap-1.5 bg-red-50 border border-red-200 text-red-700 rounded px-2 py-1 text-xs">
                        <AlertTriangle size={11} />
                        {error}
                      </div>
                    )}
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                      autoFocus
                    />
                    <button
                      type="submit"
                      className="flex items-center gap-1 bg-secondary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all"
                    >
                      <CheckCircle size={13} />
                      Guardar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(null);
                        setError('');
                      }}
                      className="px-2 py-1.5 rounded-lg text-xs text-muted-foreground hover:bg-muted transition-colors"
                    >
                      <XCircle size={13} />
                    </button>
                  </form>
                ) : (
                  <>
                    <div className="px-4 py-3 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Users size={14} className="text-muted-foreground" />
                        <span className="text-sm font-medium text-foreground">{area}</span>
                        <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full font-semibold">
                          {cargos.length} cargo{cargos.length !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setExpandedArea(isExpanded ? null : area)}
                          className="flex items-center gap-1 p-1.5 rounded-lg text-xs text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
                          title="Gestionar cargos"
                        >
                          <Tag size={13} />
                          Cargos
                        </button>
                        <button
                          onClick={() => {
                            setEditingItem(area);
                            setEditValue(area);
                            setShowForm(false);
                            setError('');
                          }}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeletingItem(area)}
                          className="p-1.5 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
                          title="Eliminar"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Cargos panel */}
                    {isExpanded && (
                      <div className="border-t border-border bg-muted/20 px-4 py-3 space-y-3">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Cargos asignados a &quot;{area}&quot;
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {cargos.length === 0 && (
                            <span className="text-xs text-muted-foreground italic">
                              Sin cargos asignados — todos los cargos estarán disponibles
                            </span>
                          )}
                          {cargos.map((cargo) => (
                            <span
                              key={`cargo-${area}-${cargo}`}
                              className="flex items-center gap-1.5 bg-secondary/10 text-secondary border border-secondary/20 px-2.5 py-1 rounded-full text-xs font-semibold"
                            >
                              {cargo}
                              <button
                                onClick={() => handleRemoveCargo(area, cargo)}
                                className="hover:text-red-600 transition-colors"
                                title="Quitar cargo"
                              >
                                <XCircle size={12} />
                              </button>
                            </span>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <input
                            type="text"
                            value={newCargo}
                            onChange={(e) => setNewCargo(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleAddCargo(area);
                              }
                            }}
                            placeholder="Ej: Cajera, Jefa de Caja..."
                            className="flex-1 px-3 py-1.5 bg-background border border-border rounded-lg text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                          />
                          <button
                            type="button"
                            onClick={() => handleAddCargo(area)}
                            className="flex items-center gap-1 bg-secondary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all"
                          >
                            <Plus size={12} />
                            Añadir
                          </button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Non-Working Type Form ────────────────────────────────────────────────────

const COMMON_ICONS = [
  '📌',
  '🎓',
  '🚫',
  '⏸️',
  '🏠',
  '✈️',
  '🤒',
  '🧑‍🍼',
  '⚽',
  '🎉',
  '🔧',
  '📚',
  '💼',
  '🌙',
  '☀️',
  '❄️',
  '🩺',
  '🛡️',
  '🎯',
  '💡',
];

interface NwtFormData {
  label: string;
  icon: string;
  colorIndex: number;
  maxDaysPerMonth: number | null;
}

const EMPTY_NWT_FORM: NwtFormData = { label: '', icon: '📌', colorIndex: 0, maxDaysPerMonth: null };

interface NwtFormProps {
  initial?: NwtFormData;
  editingCode?: string;
  onSave: (data: NwtFormData) => void;
  onCancel: () => void;
}

function NwtForm({ initial = EMPTY_NWT_FORM, editingCode, onSave, onCancel }: NwtFormProps) {
  const [form, setForm] = useState<NwtFormData>(initial);
  const [customIcon, setCustomIcon] = useState('');
  const [hasLimit, setHasLimit] = useState(initial.maxDaysPerMonth !== null);
  const [error, setError] = useState('');

  const selectedColor = NON_WORKING_COLOR_OPTIONS[form.colorIndex];

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.label.trim()) {
      setError('El nombre es obligatorio.');
      return;
    }
    setError('');
    onSave({ ...form, maxDaysPerMonth: hasLimit ? (form.maxDaysPerMonth ?? 1) : null });
  }

  const activeIcon = customIcon.trim() || form.icon;

  return (
    <form
      onSubmit={handleSubmit}
      className="bg-card border border-border rounded-xl p-6 shadow-sm space-y-5"
    >
      <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
        <CalendarX size={16} className="text-secondary" />
        {editingCode ? 'Editar tipo de día especial' : 'Nuevo tipo de día especial'}
      </h3>

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-2.5 text-sm">
          <AlertTriangle size={15} />
          {error}
        </div>
      )}

      <div className="space-y-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Nombre *
        </label>
        <input
          type="text"
          value={form.label}
          onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
          placeholder="Ej: Inducción, No trabajaba aún, Capacitación..."
          className="w-full px-3 py-2.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Ícono
        </label>
        <div className="flex flex-wrap gap-2 mb-2">
          {COMMON_ICONS.map((ic) => (
            <button
              key={`ic-${ic}`}
              type="button"
              onClick={() => {
                setForm((f) => ({ ...f, icon: ic }));
                setCustomIcon('');
              }}
              className={`w-9 h-9 rounded-lg text-lg flex items-center justify-center border-2 transition-all ${customIcon === '' && form.icon === ic ? 'border-secondary bg-secondary/10 scale-110' : 'border-transparent hover:border-border hover:bg-muted/40'}`}
            >
              {ic}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={customIcon}
            onChange={(e) => setCustomIcon(e.target.value.slice(0, 2))}
            placeholder="O escribe un emoji..."
            className="w-40 px-3 py-2 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <span className="text-xs text-muted-foreground">
            Vista previa: <span className="text-lg">{activeIcon}</span>
          </span>
        </div>
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Color
        </label>
        <div className="flex flex-wrap gap-2">
          {NON_WORKING_COLOR_OPTIONS.map((opt, idx) => (
            <button
              key={`nwt-color-${idx}`}
              type="button"
              onClick={() => setForm((f) => ({ ...f, colorIndex: idx }))}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold border-2 transition-all ${opt.colorClass} ${form.colorIndex === idx ? 'border-foreground scale-105 shadow' : 'border-transparent'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
        {form.label && (
          <div className="mt-2">
            <span className="text-xs text-muted-foreground mr-2">Vista previa:</span>
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${selectedColor.colorClass}`}
            >
              <span>{activeIcon}</span>
              {form.label}
            </span>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Límite mensual
        </label>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setHasLimit(false)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${!hasLimit ? 'bg-secondary text-white border-secondary' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
          >
            Sin límite
          </button>
          <button
            type="button"
            onClick={() => {
              setHasLimit(true);
              setForm((f) => ({ ...f, maxDaysPerMonth: f.maxDaysPerMonth ?? 1 }));
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${hasLimit ? 'bg-secondary text-white border-secondary' : 'border-border text-muted-foreground hover:bg-muted/50'}`}
          >
            Con límite
          </button>
          {hasLimit && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={1}
                max={31}
                value={form.maxDaysPerMonth ?? 1}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxDaysPerMonth: Math.max(1, parseInt(e.target.value) || 1),
                  }))
                }
                className="w-16 px-2 py-1.5 bg-background border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring text-center"
              />
              <span className="text-xs text-muted-foreground">días/mes</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="submit"
          className="flex items-center gap-2 bg-secondary text-white px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm"
        >
          <CheckCircle size={15} />
          {editingCode ? 'Guardar cambios' : 'Agregar tipo'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-2 bg-muted text-foreground px-5 py-2.5 rounded-lg text-sm font-semibold hover:bg-muted/80 transition-all"
        >
          <XCircle size={15} />
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── Non-Working Type Card ────────────────────────────────────────────────────

function NwtCard({
  nwt,
  isBuiltIn,
  onEdit,
  onDelete,
}: {
  nwt: NonWorkingType;
  isBuiltIn: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${nwt.legendColor}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${nwt.colorClass}`}
            >
              <span>{nwt.icon}</span>
              {nwt.label}
            </span>
            {isBuiltIn && (
              <span className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full font-medium">
                predefinido
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            {nwt.maxDaysPerMonth !== null
              ? `Límite: ${nwt.maxDaysPerMonth} día(s)/mes`
              : 'Sin límite mensual'}{' '}
            · No cuenta horas trabajadas
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        {!isBuiltIn ? (
          <>
            <button
              onClick={onEdit}
              className="p-2 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
              title="Editar"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={onDelete}
              className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
              title="Eliminar"
            >
              <Trash2 size={15} />
            </button>
          </>
        ) : (
          <span className="text-[10px] text-muted-foreground italic px-2">solo lectura</span>
        )}
      </div>
    </div>
  );
}

// ─── Non-Working Types Manager ────────────────────────────────────────────────

function NwtManager() {
  const {
    customNonWorkingTypes,
    addCustomNonWorkingType,
    updateCustomNonWorkingType,
    deleteCustomNonWorkingType,
  } = useAppContext();

  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  function getFormInitial(code: string): NwtFormData {
    const t = customNonWorkingTypes.find((x) => x.code === code);
    if (!t) return EMPTY_NWT_FORM;
    const colorIndex = NON_WORKING_COLOR_OPTIONS.findIndex((c) => c.colorClass === t.colorClass);
    return {
      label: t.label,
      icon: t.icon,
      colorIndex: colorIndex >= 0 ? colorIndex : 0,
      maxDaysPerMonth: t.maxDaysPerMonth,
    };
  }

  function handleSave(data: NwtFormData) {
    const color = NON_WORKING_COLOR_OPTIONS[data.colorIndex];
    const icon = data.icon;
    if (editingCode) {
      updateCustomNonWorkingType({
        code: editingCode,
        label: data.label.trim(),
        icon,
        colorClass: color.colorClass,
        legendColor: color.legendColor,
        maxDaysPerMonth: data.maxDaysPerMonth,
      });
    } else {
      addCustomNonWorkingType({
        code: generateNwtCode(data.label),
        label: data.label.trim(),
        icon,
        colorClass: color.colorClass,
        legendColor: color.legendColor,
        maxDaysPerMonth: data.maxDaysPerMonth,
      });
    }
    setShowForm(false);
    setEditingCode(null);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <CalendarX size={16} className="text-secondary" />
          <span className="text-sm font-semibold text-foreground">Tipos de días especiales</span>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingCode(null);
              setDeletingCode(null);
            }}
            className="flex items-center gap-1.5 bg-secondary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-all shadow-sm"
          >
            <Plus size={13} />
            Nuevo tipo
          </button>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl px-4 py-3 mb-4 text-xs text-blue-700">
        <strong>Nota:</strong> Los días especiales no cuentan como horas trabajadas. Los tipos
        predefinidos no se pueden editar, pero puedes agregar los tuyos propios.
      </div>

      {showForm && (
        <div className="mb-6">
          <NwtForm
            initial={editingCode ? getFormInitial(editingCode) : EMPTY_NWT_FORM}
            editingCode={editingCode || undefined}
            onSave={handleSave}
            onCancel={() => {
              setShowForm(false);
              setEditingCode(null);
            }}
          />
        </div>
      )}

      {/* Built-in types */}
      <div className="space-y-3 mb-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Predefinidos
        </h3>
        {NON_WORKING_TYPES.map((nwt: NonWorkingType) => (
          <NwtCard
            key={`builtin-${nwt.code}`}
            nwt={nwt}
            isBuiltIn={true}
            onEdit={() => {}}
            onDelete={() => {}}
          />
        ))}
      </div>

      {/* Custom types */}
      {customNonWorkingTypes.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Personalizados ({customNonWorkingTypes.length})
          </h3>
          {customNonWorkingTypes.map((nwt) => (
            <div key={`custom-${nwt.code}`}>
              {deletingCode === nwt.code ? (
                <DeleteConfirm
                  label={nwt.label}
                  onConfirm={() => {
                    deleteCustomNonWorkingType(nwt.code);
                    setDeletingCode(null);
                  }}
                  onCancel={() => setDeletingCode(null)}
                />
              ) : (
                <NwtCard
                  nwt={nwt}
                  isBuiltIn={false}
                  onEdit={() => {
                    setEditingCode(nwt.code);
                    setShowForm(true);
                    setDeletingCode(null);
                  }}
                  onDelete={() => {
                    setDeletingCode(nwt.code);
                    setShowForm(false);
                    setEditingCode(null);
                  }}
                />
              )}
            </div>
          ))}
        </div>
      )}

      {customNonWorkingTypes.length === 0 && !showForm && (
        <div className="text-center py-8 text-muted-foreground text-sm border border-dashed border-border rounded-xl">
          No hay tipos personalizados aún. Agrega uno con el botón &quot;Nuevo tipo&quot;.
        </div>
      )}
    </div>
  );
}

// ─── Usuarios ────────────────────────────────────────────────────────────────

interface UserRoleRow {
  user_id: string;
  email: string;
  role: UserRole;
  /** null = todas las sucursales */
  sucursales: string[] | null;
  /** null = todas las áreas */
  areas?: string[] | null;
  /** null = todos los cargos */
  cargos?: string[] | null;
  /** Solo rol personalizado: qué puede hacer */
  permisos?: string[] | null;
  nombre?: string;
  created_at: string;
}

type UserChanges = Partial<
  Pick<UserRoleRow, 'role' | 'sucursales' | 'areas' | 'cargos' | 'permisos' | 'nombre'>
>;

const emptyToNull = (list: string[] | null | undefined) => (list && list.length > 0 ? list : null);

function UsersPanel() {
  const { user } = useAuth();
  const { sucursales: allSucursales, areas: allAreas, areaCargos, workers } = useAppContext();
  const supabase = getSupabase();
  const [rows, setRows] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const allCargos = useMemo(() => {
    const set = new Set<string>();
    Object.values(areaCargos).forEach((list) => list.forEach((c) => c && set.add(c)));
    workers.forEach((w) => w.cargo && set.add(w.cargo));
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [areaCargos, workers]);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.from('user_roles').select('*').order('created_at');
    if (error) toast.error('No se pudo cargar la lista de usuarios.');
    setRows(
      ((data as UserRoleRow[]) || []).map((r) => ({
        ...r,
        sucursales: emptyToNull(r.sucursales),
        areas: emptyToNull(r.areas),
        cargos: emptyToNull(r.cargos),
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveUser(userId: string, changes: UserChanges) {
    setSavingId(userId);
    const { error } = await supabase
      .from('user_roles')
      .update({ ...changes, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    setSavingId(null);
    if (error) {
      toast.error('No se pudo guardar el cambio.');
      return;
    }
    setRows((prev) => prev.map((r) => (r.user_id === userId ? { ...r, ...changes } : r)));
    toast.success(changes.nombre !== undefined ? 'Nombre guardado' : 'Permisos actualizados');
  }

  async function saveNombre(row: UserRoleRow, value: string) {
    const nombre = value.trim();
    if (nombre === (row.nombre ?? '')) return;
    if (row.user_id !== user?.id) {
      saveUser(row.user_id, { nombre });
      return;
    }
    // El propio nombre se guarda aparte (nadie puede cambiar sus propios permisos)
    const { error } = await supabase.rpc('set_my_name', { p_nombre: nombre });
    if (error) {
      toast.error('No se pudo guardar el nombre.');
      return;
    }
    setRows((prev) => prev.map((r) => (r.user_id === row.user_id ? { ...r, nombre } : r)));
    toast.success('Nombre guardado');
  }

  function toggleIn(list: string[] | null | undefined, name: string) {
    const current = list ?? [];
    return emptyToNull(
      current.includes(name) ? current.filter((x) => x !== name) : [...current, name]
    );
  }

  // Administración = todo (incluidos Ajustes y usuarios) dentro de sus sucursales.
  // Sin ninguna casilla queda sin acceso.
  function toggleAdmin(row: UserRoleRow) {
    if (row.role === 'admin') {
      saveUser(row.user_id, { role: 'personalizado', permisos: [...ALL_PERMS] });
    } else {
      saveUser(row.user_id, { role: 'admin', areas: null, cargos: null });
    }
  }

  function togglePerm(row: UserRoleRow, perm: Perm) {
    const current = permsFor(row.role, row.permisos ?? null);
    if (current.has(perm)) current.delete(perm);
    else current.add(perm);
    saveUser(row.user_id, {
      role: current.size > 0 ? 'personalizado' : 'pendiente',
      permisos: [...current],
    });
  }

  const pending = rows.filter((r) => r.role === 'pendiente').length;
  const displayName = (r: UserRoleRow) => r.nombre?.trim() || r.email || r.user_id;
  // Primero las cuentas sin acceso (las nuevas), luego por nombre
  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter(
        (r) => !q || (r.nombre ?? '').toLowerCase().includes(q) || r.email.toLowerCase().includes(q)
      )
      .sort((a, b) => {
        const pa = a.role === 'pendiente' ? 0 : 1;
        const pb = b.role === 'pendiente' ? 0 : 1;
        return pa - pb || displayName(a).localeCompare(displayName(b), 'es');
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, search]);

  const chip = (active: boolean) =>
    `text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors disabled:opacity-60 ${
      active
        ? 'bg-secondary text-white border-secondary'
        : 'bg-card text-muted-foreground border-border hover:bg-muted'
    }`;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <ShieldCheck size={18} className="text-secondary" />
          Usuarios y permisos
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Cada persona entra con su propio correo y contraseña. Las cuentas nuevas quedan sin acceso
          hasta que les marques algún permiso. Elige qué sucursales, áreas y cargos ve, y qué puede
          hacer en cada módulo.
        </p>
      </div>

      {pending > 0 && (
        <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-4 py-2.5 text-sm">
          <AlertTriangle size={14} />
          {pending === 1
            ? 'Hay 1 cuenta esperando aprobación.'
            : `Hay ${pending} cuentas esperando aprobación.`}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Cargando usuarios...</p>
      ) : (
        <>
          {rows.length > 5 && (
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por nombre o correo..."
              className="text-sm border border-border rounded-lg px-3 py-2 bg-card focus:outline-none focus:ring-2 focus:ring-ring"
            />
          )}
          <div className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
            {visibleRows.length === 0 && (
              <p className="text-sm text-muted-foreground px-4 py-3">
                No hay usuarios con ese nombre.
              </p>
            )}
            {visibleRows.map((r) => {
              const isMe = r.user_id === user?.id;
              const busy = isMe || savingId === r.user_id;
              const isAdminRow = r.role === 'admin';
              const perms = permsFor(r.role, r.permisos ?? null);
              const status =
                r.role === 'pendiente'
                  ? { text: 'Sin acceso', cls: 'text-amber-800 bg-amber-50 border-amber-200' }
                  : isAdminRow
                    ? {
                        text: r.sucursales
                          ? 'Administración de sucursal'
                          : 'Administración general',
                        cls: 'text-secondary bg-blue-50 border-blue-200',
                      }
                    : {
                        text: perms.size === 1 ? '1 permiso' : `${perms.size} permisos`,
                        cls: 'text-muted-foreground bg-muted border-border',
                      };
              const isOpen = openId === r.user_id;
              const hasName = !!r.nombre?.trim();
              return (
                <div key={r.user_id} className="flex flex-col">
                  <button
                    type="button"
                    onClick={() => setOpenId(isOpen ? null : r.user_id)}
                    aria-expanded={isOpen}
                    className="flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="w-8 h-8 rounded-full bg-blue-50 text-secondary text-sm font-bold flex items-center justify-center shrink-0">
                        {displayName(r).charAt(0).toUpperCase()}
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-foreground truncate">
                            {hasName ? r.nombre : r.email || r.user_id}
                          </span>
                          {isMe && (
                            <span className="text-[10px] font-bold uppercase text-secondary bg-blue-50 px-1.5 py-0.5 rounded">
                              Tú
                            </span>
                          )}
                        </div>
                        {hasName && (
                          <span className="text-xs text-muted-foreground truncate block">
                            {r.email}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${status.cls}`}
                      >
                        {status.text}
                      </span>
                      <ChevronDown
                        size={16}
                        className={`text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`}
                      />
                    </div>
                  </button>
                  {isOpen && (
                    <div className="flex flex-col gap-2.5 px-4 pb-4 pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground mr-1 w-[60px]">Nombre:</span>
                        <input
                          key={`${r.user_id}-${r.nombre ?? ''}`}
                          type="text"
                          defaultValue={r.nombre ?? ''}
                          maxLength={80}
                          placeholder="Nombre y apellido"
                          disabled={savingId === r.user_id}
                          onBlur={(e) => saveNombre(r, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                          }}
                          className="flex-1 min-w-[180px] max-w-sm text-sm border border-border rounded-lg px-3 py-1.5 bg-card focus:outline-none focus:ring-2 focus:ring-ring"
                        />
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Mail size={12} /> {r.email}
                        </span>
                      </div>
                      {isMe && (
                        <p className="text-xs text-muted-foreground -mt-1">
                          No puedes cambiar tus propios permisos.
                        </p>
                      )}

                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs text-muted-foreground mr-1 w-[60px]">
                          Sucursales:
                        </span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => saveUser(r.user_id, { sucursales: null })}
                          className={chip(r.sucursales === null)}
                        >
                          Todas
                        </button>
                        {allSucursales.map((s) => (
                          <button
                            key={s.name}
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              saveUser(r.user_id, { sucursales: toggleIn(r.sucursales, s.name) })
                            }
                            className={chip(!!r.sucursales?.includes(s.name))}
                          >
                            {s.name}
                          </button>
                        ))}
                      </div>
                      {!isAdminRow && (
                        <>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-muted-foreground mr-1 w-[60px]">
                              Áreas:
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveUser(r.user_id, { areas: null })}
                              className={chip(!r.areas)}
                            >
                              Todas
                            </button>
                            {allAreas.map((a) => (
                              <button
                                key={a}
                                type="button"
                                disabled={busy}
                                onClick={() => saveUser(r.user_id, { areas: toggleIn(r.areas, a) })}
                                className={chip(!!r.areas?.includes(a))}
                              >
                                {a}
                              </button>
                            ))}
                          </div>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-xs text-muted-foreground mr-1 w-[60px]">
                              Cargos:
                            </span>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => saveUser(r.user_id, { cargos: null })}
                              className={chip(!r.cargos)}
                            >
                              Todos
                            </button>
                            {allCargos.map((c) => (
                              <button
                                key={c}
                                type="button"
                                disabled={busy}
                                onClick={() =>
                                  saveUser(r.user_id, { cargos: toggleIn(r.cargos, c) })
                                }
                                className={chip(!!r.cargos?.includes(c))}
                              >
                                {c}
                              </button>
                            ))}
                          </div>
                        </>
                      )}

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-1">
                        {PERM_GROUPS.map((g) => (
                          <fieldset
                            key={g.modulo}
                            className="border border-border rounded-lg px-3 py-2 flex flex-col gap-1"
                          >
                            <legend className="text-[11px] font-bold uppercase text-muted-foreground px-1">
                              {g.modulo}
                            </legend>
                            {g.perms.map(({ perm, label }) => (
                              <label
                                key={perm}
                                className="flex items-center gap-2 text-xs text-foreground cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={perms.has(perm)}
                                  disabled={busy || isAdminRow}
                                  onChange={() => togglePerm(r, perm)}
                                  className="w-4 h-4 accent-blue-600"
                                />
                                {label}
                              </label>
                            ))}
                          </fieldset>
                        ))}
                        <fieldset className="border border-border rounded-lg px-3 py-2 flex flex-col gap-1">
                          <legend className="text-[11px] font-bold uppercase text-muted-foreground px-1">
                            Administración
                          </legend>
                          <label className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                            <input
                              type="checkbox"
                              checked={isAdminRow}
                              disabled={busy}
                              onChange={() => toggleAdmin(r)}
                              className="w-4 h-4 accent-blue-600"
                            />
                            Todo, con Ajustes y usuarios
                          </label>
                        </fieldset>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

type Tab = 'turnos' | 'especiales' | 'sucursales' | 'areas' | 'importar' | 'acceso';

export default function AjustesContent() {
  const {
    shifts,
    addShift,
    updateShift,
    deleteShift,
    sucursales,
    areas,
    areaCargos,
    addSucursal,
    updateSucursal,
    deleteSucursal,
    addArea,
    updateArea,
    deleteArea,
    setAreaCargos,
  } = useAppContext();

  const { isGlobalAdmin, allowedSucursales } = useAuth();
  const [activeTab, setActiveTab] = useState<Tab>('turnos');
  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const formRef = useRef<HTMLDivElement>(null);

  const allShifts = Object.values(shifts);
  const existingCodes = Object.keys(shifts);
  // El admin de sucursal ve los turnos compartidos y los de sus sucursales, y edita solo los suyos
  const mySucursales = isGlobalAdmin
    ? sucursales.map((s) => s.name)
    : (allowedSucursales ?? []).filter((n) => sucursales.some((s) => s.name === n));
  const shiftList = isGlobalAdmin
    ? allShifts
    : allShifts.filter((s) => !s.sucursal || mySucursales.includes(s.sucursal));
  const canEditShift = (s: Shift) =>
    isGlobalAdmin || (!!s.sucursal && mySucursales.includes(s.sucursal));

  // Al abrir el formulario (nuevo o editar) se sube hasta él
  useEffect(() => {
    if (showForm) formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [showForm, editingCode]);

  function getFormInitial(code: string): ShiftFormData {
    const s = shifts[code];
    if (!s) return EMPTY_FORM;
    return {
      label: s.label,
      start: s.start,
      end: s.end,
      colacion: s.colacion || 0,
      sucursal: s.sucursal ?? '',
    };
  }

  function openNewForm() {
    setShowForm(true);
    setEditingCode(null);
  }

  function handleSave(data: ShiftFormData) {
    const code = editingCode || makeShiftCode(data.label, data.sucursal);
    const prev = editingCode ? shifts[editingCode] : undefined;
    // Turno existente: conserva su color; turno nuevo: color según la hora de entrada
    const color =
      prev && prev.colorClass
        ? { colorClass: prev.colorClass, legendColor: prev.legendColor }
        : autoShiftColor(data.start, allShifts);
    const shift: Shift = {
      code,
      label: data.label.trim(),
      start: data.start,
      end: data.end,
      colorClass: color.colorClass,
      legendColor: color.legendColor,
      colacion: data.colacion || 0,
      sucursal: prev ? (prev.sucursal ?? null) : data.sucursal || null,
    };
    try {
      if (editingCode) {
        updateShift(shift);
        toast.success(`Turno "${shift.label}" actualizado`);
      } else {
        addShift(shift);
        toast.success(`Turno "${shift.label}" agregado`);
      }
      setShowForm(false);
      setEditingCode(null);
    } catch (err) {
      toast.error('Error al guardar el turno. Intenta de nuevo.');
      console.error('Error saving shift:', err);
    }
  }

  function handleEdit(code: string) {
    setEditingCode(code);
    setShowForm(true);
  }

  function handleDelete(code: string) {
    deleteShift(code);
    if (editingCode === code) handleCancelForm();
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingCode(null);
  }

  const ALL_TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'turnos', label: 'Turnos', icon: Clock },
    { id: 'especiales', label: 'Días Especiales', icon: CalendarX },
    { id: 'sucursales', label: 'Sucursales', icon: MapPin },
    { id: 'areas', label: 'Áreas', icon: Users },
    { id: 'importar', label: 'Importar', icon: FileSpreadsheet },
    { id: 'acceso', label: 'Usuarios', icon: ShieldCheck },
  ];
  // El admin de una sucursal solo administra sus turnos
  const TABS = isGlobalAdmin ? ALL_TABS : ALL_TABS.filter((t) => t.id === 'turnos');

  return (
    <div className="p-6 xl:p-8 max-w-3xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-wide text-foreground uppercase flex items-center gap-2">
            <Settings size={24} className="text-secondary" />
            Ajustes
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {isGlobalAdmin
              ? 'Configura turnos, días especiales, sucursales y áreas de tu organización.'
              : 'Crea y edita los turnos de tu sucursal.'}
          </p>
        </div>
        {activeTab === 'turnos' && !showForm && (
          <button
            onClick={openNewForm}
            className="flex items-center gap-2 bg-secondary text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm"
          >
            <Plus size={16} />
            Nuevo turno
          </button>
        )}
      </div>

      {/* Tabs */}
      {TABS.length > 1 && (
        <div className="flex gap-1 bg-muted/30 rounded-xl p-1 mb-6 border border-border flex-wrap">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setShowForm(false);
                setEditingCode(null);
              }}
              className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-semibold transition-all min-w-[80px] ${
                activeTab === tab.id
                  ? 'bg-card text-secondary shadow-sm border border-border'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>
      )}

      {/* ── Turnos Tab ── */}
      {activeTab === 'turnos' && (
        <>
          {/* Formulario arriba, antes de la lista */}
          {showForm && (
            <div ref={formRef} className="mb-6 scroll-mt-4">
              <ShiftForm
                key={editingCode ?? 'nuevo'}
                initial={
                  editingCode
                    ? getFormInitial(editingCode)
                    : {
                        ...EMPTY_FORM,
                        sucursal: isGlobalAdmin
                          ? ''
                          : mySucursales.length === 1
                            ? mySucursales[0]
                            : '',
                      }
                }
                existingCodes={existingCodes}
                editingCode={editingCode || undefined}
                sucursalOptions={mySucursales}
                allowAll={isGlobalAdmin}
                previewColor={(start) =>
                  editingCode && shifts[editingCode]?.colorClass
                    ? shifts[editingCode]
                    : autoShiftColor(start, allShifts)
                }
                onSave={handleSave}
                onCancel={handleCancelForm}
              />
            </div>
          )}

          {shiftList.length === 0 && !showForm && <EmptyState label="turnos" onAdd={openNewForm} />}

          {shiftList.length > 0 && (
            <>
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Turnos configurados ({shiftList.length})
              </h2>
              <ShiftList
                shifts={shiftList}
                canEdit={canEditShift}
                onEdit={handleEdit}
                onDelete={handleDelete}
              />
            </>
          )}
        </>
      )}

      {/* ── Días Especiales Tab ── */}
      {activeTab === 'especiales' && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <NwtManager />
        </div>
      )}

      {/* ── Sucursales Tab ── */}
      {activeTab === 'sucursales' && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <SucursalManager
            sucursales={sucursales}
            onAdd={addSucursal}
            onUpdate={updateSucursal}
            onDelete={deleteSucursal}
          />
        </div>
      )}

      {/* ── Areas Tab ── */}
      {activeTab === 'areas' && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <AreaManager
            areas={areas}
            areaCargos={areaCargos}
            onAddArea={addArea}
            onUpdateArea={updateArea}
            onDeleteArea={deleteArea}
            onSetAreaCargos={setAreaCargos}
          />
        </div>
      )}

      {/* ── Importar Tab ── */}
      {activeTab === 'importar' && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <ExcelImportPanel />
        </div>
      )}

      {/* ── Usuarios Tab ── */}
      {activeTab === 'acceso' && (
        <div className="bg-card border border-border rounded-xl p-6 shadow-sm">
          <UsersPanel />
        </div>
      )}
    </div>
  );
}
