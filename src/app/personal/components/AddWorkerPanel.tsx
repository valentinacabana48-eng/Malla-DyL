'use client';
import React, { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { X, Save } from 'lucide-react';
import { HORAS_OPTIONS, useAppContext, type Worker } from '@/context/AppContext';
import { useReadonly } from '@/hooks/useReadonly';
import WorkerPinSection from './WorkerPinSection';

interface Props {
  worker: Worker;
  isNew: boolean;
  onSave: (w: Worker) => void;
  onCancel: () => void;
}

interface FormData {
  name: string;
  rut: string;
  cargo: string;
  sucursal: string;
  area: string;
  horasContratadas: number;
  estado: Worker['estado'];
  birthday: string;
  exentoDomingos: boolean;
}

const AVATAR_COLORS = [
  'bg-blue-100 text-blue-700',
  'bg-green-100 text-green-700',
  'bg-pink-100 text-pink-700',
  'bg-orange-100 text-orange-700',
  'bg-violet-100 text-violet-700',
  'bg-teal-100 text-teal-700',
];

function getInitials(name: string): string {
  const parts = name.trim().split(' ');
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export default function AddWorkerPanel({ worker, isNew, onSave, onCancel }: Props) {
  const { sucursales, areas, areaCargos } = useAppContext();
  const isReadonly = useReadonly('personal');
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormData>({
    defaultValues: {
      name: worker.name,
      rut: worker.rut,
      cargo: worker.cargo,
      sucursal: worker.sucursal,
      area: worker.area,
      horasContratadas: worker.horasContratadas,
      estado: worker.estado,
      birthday: worker.birthday || '',
      exentoDomingos: !!worker.exentoDomingos,
    },
  });

  useEffect(() => {
    reset({
      name: worker.name,
      rut: worker.rut,
      cargo: worker.cargo,
      sucursal: worker.sucursal,
      area: worker.area,
      horasContratadas: worker.horasContratadas,
      estado: worker.estado,
      birthday: worker.birthday || '',
      exentoDomingos: !!worker.exentoDomingos,
    });
  }, [worker.id, reset]);

  const selectedArea = watch('area');

  // Get cargos for the selected area; if none configured, show a free text input
  const cargosForArea =
    selectedArea && areaCargos[selectedArea] && areaCargos[selectedArea].length > 0
      ? areaCargos[selectedArea]
      : null;

  const onSubmit = (data: FormData) => {
    const initials = getInitials(data.name);
    const colorIdx =
      Math.abs(data.name.charCodeAt(0) + (data.name.charCodeAt(1) || 0)) % AVATAR_COLORS.length;
    const saved: Worker = {
      ...worker,
      ...data,
      horasContratadas: Number(data.horasContratadas) as 10 | 20 | 30 | 42,
      initials,
      role: data.cargo,
      avatarColor: worker.avatarColor || AVATAR_COLORS[colorIdx],
      birthday: data.birthday || '',
      exentoDomingos: !!data.exentoDomingos,
    };
    onSave(saved);
  };

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden lg:sticky lg:top-4">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border bg-muted/20">
        <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">
          {isNew ? 'Añadir Trabajador' : 'Editar Trabajador'}
        </h3>
        <button
          onClick={onCancel}
          type="button"
          aria-label="Cerrar"
          className="w-11 h-11 lg:w-auto lg:h-auto lg:p-1 flex items-center justify-center rounded-lg hover:bg-muted transition-colors text-muted-foreground"
        >
          <X className="w-5 h-5 lg:w-[15px] lg:h-[15px]" />
        </button>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="p-5 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Nombre completo
          </label>
          <input
            {...register('name', {
              required: 'El nombre es obligatorio',
              minLength: { value: 3, message: 'Mínimo 3 caracteres' },
            })}
            placeholder="Ej: Juan Pérez"
            className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          {errors.name && <p className="text-xs text-red-500 mt-1">{errors.name.message}</p>}
        </div>

        {/* RUT */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">RUT</label>
          <input
            {...register('rut', {
              required: 'El RUT es obligatorio',
              pattern: {
                value: /^\d{1,2}\.\d{3}\.\d{3}-[\dkK]$/,
                message: 'Formato: 12.345.678-9',
              },
            })}
            placeholder="Ej: 12.345.678-9"
            className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-base lg:text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
          />
          {errors.rut && <p className="text-xs text-red-500 mt-1">{errors.rut.message}</p>}
        </div>

        {/* Birthday */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Fecha de cumpleaños
          </label>
          <input
            type="date"
            {...register('birthday')}
            className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>

        {/* Sucursal */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Sucursal</label>
          <select
            {...register('sucursal', { required: true })}
            className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            {sucursales.map((s) => (
              <option key={`suc-${s.name}`} value={s.name}>
                {s.name}
              </option>
            ))}
          </select>
        </div>

        {/* Area */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Área</label>
          <select
            {...register('area', { required: true })}
            className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            {areas.map((a) => (
              <option key={`area-${a}`} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>

        {/* Cargo — filtered by area if cargos are configured */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Cargo
            {cargosForArea && (
              <span className="ml-1 text-[10px] text-secondary font-normal">
                (filtrado por área)
              </span>
            )}
          </label>
          {cargosForArea ? (
            <select
              {...register('cargo', { required: true })}
              className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            >
              {cargosForArea.map((c) => (
                <option key={`cargo-${c}`} value={c}>
                  {c}
                </option>
              ))}
            </select>
          ) : (
            <input
              {...register('cargo', { required: 'El cargo es obligatorio' })}
              placeholder="Ej: Cajera, Jefa de Caja..."
              className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-ring placeholder:text-muted-foreground/50"
            />
          )}
          {errors.cargo && (
            <p className="text-xs text-red-500 mt-1">{String(errors.cargo.message)}</p>
          )}
        </div>

        {/* Horas */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">
            Horas contratadas
          </label>
          <select
            {...register('horasContratadas', { required: true })}
            className="w-full px-3 py-3 lg:py-2 bg-input border border-border rounded-lg text-base lg:text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
          >
            {HORAS_OPTIONS.map((h) => (
              <option key={`horas-${h}`} value={h}>
                {h} horas
              </option>
            ))}
          </select>
        </div>

        {/* Domingos */}
        <label className="flex items-start gap-2.5 cursor-pointer rounded-lg border border-border bg-muted/20 px-3 py-2.5">
          <input
            type="checkbox"
            {...register('exentoDomingos')}
            className="mt-0.5 h-4 w-4 rounded border-border text-secondary focus:ring-ring"
          />
          <span className="text-xs">
            <span className="block font-semibold text-foreground">Trabaja todos los domingos</span>
            <span className="block text-muted-foreground">
              No se mostrará la alerta de domingos libres (p. ej. contratos de 10, 20 o 30 horas de
              fin de semana).
            </span>
          </span>
        </label>

        {/* Estado */}
        <div>
          <label className="block text-xs font-semibold text-foreground mb-1">Estado</label>
          <div className="relative">
            <div className="absolute left-3 top-1/2 -translate-y-1/2 w-2 h-2 rounded-full bg-green-500 pointer-events-none" />
            <select
              {...register('estado')}
              className="w-full pl-8 pr-3 py-2 bg-input border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-ring appearance-none"
            >
              <option value="Activo">Activo</option>
              <option value="Inactivo">Inactivo</option>
            </select>
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full flex items-center justify-center gap-2 bg-secondary text-white py-3.5 lg:py-2.5 rounded-lg text-base lg:text-sm font-semibold hover:bg-blue-700 disabled:opacity-60 active:scale-95 transition-all duration-150"
        >
          {isSubmitting ? (
            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={15} />
          )}
          {isNew ? 'Guardar trabajador' : 'Actualizar trabajador'}
        </button>
      </form>

      {!isNew && !isReadonly && <WorkerPinSection worker={worker} />}
    </div>
  );
}
