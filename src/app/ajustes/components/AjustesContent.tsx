'use client';
import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import {
  useAppContext,
  SHIFT_COLOR_OPTIONS,
  NON_WORKING_COLOR_OPTIONS,
  NON_WORKING_TYPES,
  type Shift,
  type NonWorkingType,
  type Sucursal,
} from '@/context/AppContext';
import { useAuth, type UserRole } from '@/context/AuthContext';
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
  colorIndex: number;
  colacion: number;
}

const EMPTY_FORM: ShiftFormData = { label: '', start: '', end: '', colorIndex: 0, colacion: 0 };

interface ShiftFormProps {
  initial?: ShiftFormData;
  existingCodes: string[];
  editingCode?: string;
  onSave: (data: ShiftFormData) => void;
  onCancel: () => void;
}

function ShiftForm({
  initial = EMPTY_FORM,
  existingCodes,
  editingCode,
  onSave,
  onCancel,
}: ShiftFormProps) {
  const [form, setForm] = useState<ShiftFormData>(initial);
  const [error, setError] = useState('');

  const grossHours = calcHours(form.start, form.end);
  const netHours = calcNetHoursLocal(form.start, form.end, form.colacion);
  const previewCode = editingCode || generateCode(form.label);
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
    const code = editingCode || generateCode(form.label);
    if (!editingCode && existingCodes.includes(code)) {
      setError('Ya existe un turno con ese nombre. Usa un nombre diferente.');
      return;
    }
    setError('');
    onSave(form);
  }

  const selectedColor = SHIFT_COLOR_OPTIONS[form.colorIndex];

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

      <div className="space-y-2">
        <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Color del turno
        </label>
        <div className="flex flex-wrap gap-2">
          {SHIFT_COLOR_OPTIONS.map((opt, idx) => (
            <button
              key={`color-${idx}`}
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
              <Clock size={11} />
              {form.label}
              {form.start && form.end ? ` (${form.start} - ${form.end})` : ''}
            </span>
          </div>
        )}
      </div>

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

// ─── Shift Card ───────────────────────────────────────────────────────────────

interface ShiftCardProps {
  shift: Shift;
  onEdit: () => void;
  onDelete: () => void;
}

function ShiftCard({ shift, onEdit, onDelete }: ShiftCardProps) {
  const gross = calcHours(shift.start, shift.end);
  const net = calcNetHoursLocal(shift.start, shift.end, shift.colacion || 0);
  const showNet = (shift.colacion || 0) > 0;
  return (
    <div className="bg-card border border-border rounded-xl p-4 shadow-sm flex items-center justify-between gap-4 hover:shadow-md transition-shadow">
      <div className="flex items-center gap-3 min-w-0">
        <span className={`w-3 h-3 rounded-full flex-shrink-0 ${shift.legendColor}`} />
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold ${shift.colorClass}`}
            >
              <Clock size={10} />
              {shift.label}
            </span>
            <span className="text-xs text-muted-foreground font-mono">{shift.code}</span>
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-sm text-muted-foreground">
            {shift.start && shift.end ? (
              <>
                <span className="font-medium text-foreground">{shift.start}</span>
                <span>→</span>
                <span className="font-medium text-foreground">{shift.end}</span>
                <span className="text-xs bg-muted px-2 py-0.5 rounded-full">{gross}h bruto</span>
                {showNet && (
                  <span className="text-xs bg-orange-50 text-orange-700 border border-orange-200 px-2 py-0.5 rounded-full flex items-center gap-1">
                    <Coffee size={9} />
                    {net}h neto
                  </span>
                )}
                {(shift.colacion || 0) > 0 && (
                  <span className="text-xs text-muted-foreground">col. {shift.colacion}min</span>
                )}
              </>
            ) : (
              <span className="italic text-xs">Sin horario definido</span>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <button
          onClick={onEdit}
          className="p-2 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
          title="Editar turno"
        >
          <Pencil size={15} />
        </button>
        <button
          onClick={onDelete}
          className="p-2 rounded-lg text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
          title="Eliminar turno"
        >
          <Trash2 size={15} />
        </button>
      </div>
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

// ─── Simple List Manager (for Sucursales) ─────────────────────────────────────

interface ListManagerProps {
  items: string[];
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  onAdd: (name: string) => void;
  onUpdate: (oldName: string, newName: string) => void;
  onDelete: (name: string) => void;
}

function ListManager({ items, label, icon, onAdd, onUpdate, onDelete }: ListManagerProps) {
  const IconComp = icon as React.FC<{ size?: number; className?: string }>;
  const [showForm, setShowForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [deletingItem, setDeletingItem] = useState<string | null>(null);
  const [error, setError] = useState('');

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = newName.trim();
    if (!trimmed) {
      setError('El nombre es obligatorio.');
      return;
    }
    if (items.includes(trimmed)) {
      setError('Ya existe un elemento con ese nombre.');
      return;
    }
    onAdd(trimmed);
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
    if (trimmed !== editingItem && items.includes(trimmed)) {
      setError('Ya existe un elemento con ese nombre.');
      return;
    }
    onUpdate(editingItem!, trimmed);
    setEditingItem(null);
    setEditValue('');
    setError('');
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <IconComp size={16} className="text-secondary" />
          <span className="text-sm font-semibold text-foreground">
            {label} ({items.length})
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
          <div className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={`Nombre de ${label.toLowerCase()}...`}
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

      {items.length === 0 && !showForm ? (
        <div className="text-center py-10 text-muted-foreground text-sm">
          No hay {label.toLowerCase()} configurados. Agrega el primero.
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <div key={`item-${item}`}>
              {deletingItem === item ? (
                <DeleteConfirm
                  label={item}
                  onConfirm={() => {
                    onDelete(item);
                    setDeletingItem(null);
                  }}
                  onCancel={() => setDeletingItem(null)}
                />
              ) : editingItem === item ? (
                <form
                  onSubmit={handleEdit}
                  className="bg-muted/30 border border-border rounded-xl p-3 flex gap-2"
                >
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
                <div className="bg-card border border-border rounded-xl px-4 py-3 flex items-center justify-between hover:shadow-sm transition-shadow">
                  <div className="flex items-center gap-2">
                    <IconComp size={14} className="text-muted-foreground" />
                    <span className="text-sm font-medium text-foreground">{item}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setEditingItem(item);
                        setEditValue(item);
                        setShowForm(false);
                        setError('');
                      }}
                      className="p-1.5 rounded-lg text-muted-foreground hover:text-secondary hover:bg-secondary/10 transition-colors"
                      title="Editar"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      onClick={() => setDeletingItem(item)}
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

// ─── PIN Settings Panel ───────────────────────────────────────────────────────

interface UserRoleRow {
  user_id: string;
  email: string;
  role: UserRole;
  created_at: string;
}

const ROLE_OPTIONS: { value: UserRole; label: string; description: string }[] = [
  { value: 'admin', label: 'Administrador', description: 'Puede ver y modificar todo' },
  { value: 'lector', label: 'Solo lectura', description: 'Puede ver, pero no modificar' },
  { value: 'pendiente', label: 'Sin acceso', description: 'No puede entrar a la app' },
];

function UsersPanel() {
  const { user } = useAuth();
  const supabase = getSupabase();
  const [rows, setRows] = useState<UserRoleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('user_roles')
      .select('user_id, email, role, created_at')
      .order('created_at');
    if (error) toast.error('No se pudo cargar la lista de usuarios.');
    setRows((data as UserRoleRow[]) || []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function changeRole(userId: string, role: UserRole) {
    setSavingId(userId);
    const { error } = await supabase
      .from('user_roles')
      .update({ role, updated_at: new Date().toISOString() })
      .eq('user_id', userId);
    setSavingId(null);
    if (error) {
      toast.error('No se pudo cambiar el rol.');
      return;
    }
    setRows((prev) => prev.map((r) => (r.user_id === userId ? { ...r, role } : r)));
    toast.success('Rol actualizado');
  }

  const pending = rows.filter((r) => r.role === 'pendiente').length;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h3 className="text-base font-bold text-foreground flex items-center gap-2">
          <ShieldCheck size={18} className="text-secondary" />
          Usuarios y permisos
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Cada persona entra con su propio correo y contraseña. Las cuentas nuevas quedan sin acceso
          hasta que les asignes un rol.
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
        <div className="flex flex-col divide-y divide-border border border-border rounded-xl overflow-hidden">
          {rows.map((r) => {
            const isMe = r.user_id === user?.id;
            return (
              <div
                key={r.user_id}
                className="flex items-center justify-between gap-3 px-4 py-3 flex-wrap"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Mail size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium text-foreground truncate">
                    {r.email || r.user_id}
                  </span>
                  {isMe && (
                    <span className="text-[10px] font-bold uppercase text-secondary bg-blue-50 px-1.5 py-0.5 rounded">
                      Tú
                    </span>
                  )}
                </div>
                <select
                  value={r.role}
                  disabled={isMe || savingId === r.user_id}
                  onChange={(e) => changeRole(r.user_id, e.target.value as UserRole)}
                  title={isMe ? 'No puedes cambiar tu propio rol' : undefined}
                  className="text-sm border border-border rounded-lg px-3 py-1.5 bg-card focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-60"
                >
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            );
          })}
        </div>
      )}

      <ul className="text-xs text-muted-foreground flex flex-col gap-1">
        {ROLE_OPTIONS.map((o) => (
          <li key={o.value}>
            <span className="font-semibold text-foreground">{o.label}:</span> {o.description}
          </li>
        ))}
      </ul>
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
    getSucursalCajas,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<Tab>('turnos');
  const [showForm, setShowForm] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const shiftList = Object.values(shifts);
  const existingCodes = Object.keys(shifts);

  function getFormInitial(code: string): ShiftFormData {
    const s = shifts[code];
    if (!s) return EMPTY_FORM;
    const colorIndex = SHIFT_COLOR_OPTIONS.findIndex((c) => c.colorClass === s.colorClass);
    return {
      label: s.label,
      start: s.start,
      end: s.end,
      colorIndex: colorIndex >= 0 ? colorIndex : 0,
      colacion: s.colacion || 0,
    };
  }

  function handleSave(data: ShiftFormData) {
    const color = SHIFT_COLOR_OPTIONS[data.colorIndex];
    const code = editingCode || generateCode(data.label);
    const shift: Shift = {
      code,
      label: data.label.trim(),
      start: data.start,
      end: data.end,
      colorClass: color.colorClass,
      legendColor: color.legendColor,
      colacion: data.colacion || 0,
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
    setDeletingCode(null);
  }

  function handleDelete(code: string) {
    deleteShift(code);
    setDeletingCode(null);
  }

  function handleCancelForm() {
    setShowForm(false);
    setEditingCode(null);
  }

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'turnos', label: 'Turnos', icon: Clock },
    { id: 'especiales', label: 'Días Especiales', icon: CalendarX },
    { id: 'sucursales', label: 'Sucursales', icon: MapPin },
    { id: 'areas', label: 'Áreas', icon: Users },
    { id: 'importar', label: 'Importar', icon: FileSpreadsheet },
    { id: 'acceso', label: 'Usuarios', icon: ShieldCheck },
  ];

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
            Configura turnos, días especiales, sucursales y áreas de tu organización.
          </p>
        </div>
        {activeTab === 'turnos' && !showForm && shiftList.length > 0 && (
          <button
            onClick={() => {
              setShowForm(true);
              setEditingCode(null);
              setDeletingCode(null);
            }}
            className="flex items-center gap-2 bg-secondary text-white px-4 py-2.5 rounded-lg text-sm font-semibold hover:bg-blue-700 transition-all shadow-sm"
          >
            <Plus size={16} />
            Nuevo turno
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted/30 rounded-xl p-1 mb-6 border border-border flex-wrap">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
              setShowForm(false);
              setEditingCode(null);
              setDeletingCode(null);
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

      {/* ── Turnos Tab ── */}
      {activeTab === 'turnos' && (
        <>
          {shiftList.length > 0 && (
            <div className="bg-card border border-border rounded-xl px-5 py-3 mb-6 flex items-center gap-6 shadow-sm">
              <div className="text-center">
                <p className="text-2xl font-bold text-foreground">{shiftList.length}</p>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Turnos</p>
              </div>
              <div className="h-8 w-px bg-border" />
              <div className="flex flex-wrap gap-2">
                {shiftList.map((s) => (
                  <span
                    key={`stat-${s.code}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${s.colorClass}`}
                  >
                    <Clock size={10} />
                    {s.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {showForm && (
            <div className="mb-6">
              <ShiftForm
                initial={editingCode ? getFormInitial(editingCode) : EMPTY_FORM}
                existingCodes={existingCodes}
                editingCode={editingCode || undefined}
                onSave={handleSave}
                onCancel={handleCancelForm}
              />
            </div>
          )}

          {shiftList.length === 0 && !showForm && (
            <EmptyState label="turnos" onAdd={() => setShowForm(true)} />
          )}

          {shiftList.length > 0 && (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
                Turnos configurados ({shiftList.length})
              </h2>
              {shiftList.map((shift) => (
                <div key={`shift-${shift.code}`}>
                  {deletingCode === shift.code ? (
                    <DeleteConfirm
                      label={shift.label}
                      onConfirm={() => handleDelete(shift.code)}
                      onCancel={() => setDeletingCode(null)}
                    />
                  ) : (
                    <ShiftCard
                      shift={shift}
                      onEdit={() => handleEdit(shift.code)}
                      onDelete={() => {
                        setDeletingCode(shift.code);
                        setShowForm(false);
                        setEditingCode(null);
                      }}
                    />
                  )}
                </div>
              ))}
            </div>
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
