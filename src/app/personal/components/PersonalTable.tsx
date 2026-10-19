'use client';
import React, { useState } from 'react';
import { Pencil, Trash2, ChevronUp, ChevronDown, Users } from 'lucide-react';
import { type Worker } from '@/context/AppContext';
import { useReadonly } from '@/hooks/useReadonly';

interface Props {
  workers: Worker[];
  onEdit: (w: Worker) => void;
  onDelete: (id: string) => void;
}

function formatBirthday(birthday: string): string {
  if (!birthday) return '—';
  try {
    const [, m, d] = birthday.split('-').map(Number);
    const MONTHS = [
      'Ene',
      'Feb',
      'Mar',
      'Abr',
      'May',
      'Jun',
      'Jul',
      'Ago',
      'Sep',
      'Oct',
      'Nov',
      'Dic',
    ];
    return `${d} ${MONTHS[m - 1]}`;
  } catch {
    return '—';
  }
}

export default function PersonalTable({ workers, onEdit, onDelete }: Props) {
  const [sortField, setSortField] = useState<keyof Worker>('name');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const isReadonly = useReadonly('personal');

  const handleSort = (field: keyof Worker) => {
    if (sortField === field) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sorted = [...workers].sort((a, b) => {
    const av = a[sortField] as string;
    const bv = b[sortField] as string;
    return sortDir === 'asc'
      ? String(av).localeCompare(String(bv))
      : String(bv).localeCompare(String(av));
  });

  const SortIcon = ({ field }: { field: keyof Worker }) => (
    <span className="inline-flex flex-col ml-1">
      <ChevronUp
        size={10}
        className={
          sortField === field && sortDir === 'asc' ? 'text-secondary' : 'text-muted-foreground/40'
        }
      />
      <ChevronDown
        size={10}
        className={
          sortField === field && sortDir === 'desc' ? 'text-secondary' : 'text-muted-foreground/40'
        }
      />
    </span>
  );

  if (workers.length === 0) {
    return (
      <div className="bg-card rounded-xl border border-border shadow-sm flex flex-col items-center justify-center py-16 text-center">
        <Users size={40} className="text-muted-foreground/30 mb-3" />
        <p className="text-base font-semibold text-muted-foreground">
          Sin trabajadores para este filtro
        </p>
        <p className="text-sm text-muted-foreground/60 mt-1">
          Ajusta los filtros o agrega una nueva trabajadora
        </p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border">
        <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider">
          Listado de Trabajadores
        </h2>
      </div>
      {/* Celular: una tarjeta por trabajadora */}
      <ul className="lg:hidden divide-y divide-border/60">
        {sorted.map((worker) => (
          <li key={worker.id} className="px-4 py-4 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div
                className={`w-11 h-11 rounded-full ${worker.avatarColor} flex items-center justify-center text-sm font-bold shrink-0`}
              >
                {worker.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-base font-semibold text-foreground truncate">{worker.name}</p>
                <p className="text-sm text-muted-foreground truncate">
                  {worker.cargo} · {worker.sucursal}
                </p>
              </div>
              <span
                className={`px-2.5 py-1 rounded-full text-xs font-semibold shrink-0 ${
                  worker.estado === 'Activo'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-600'
                }`}
              >
                {worker.estado}
              </span>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
              <span>{worker.horasContratadas}h contratadas</span>
              {worker.rut && <span className="font-mono">{worker.rut}</span>}
              {worker.area && <span>{worker.area}</span>}
              {worker.birthday && <span>🎂 {formatBirthday(worker.birthday)}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => onEdit(worker)}
                disabled={isReadonly}
                className="flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-semibold disabled:opacity-40"
              >
                <Pencil size={16} />
                Editar
              </button>
              {deleteConfirm === worker.id ? (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onDelete(worker.id);
                      setDeleteConfirm(null);
                    }}
                    className="min-h-[44px] rounded-xl bg-red-600 text-white text-sm font-semibold"
                  >
                    Eliminar
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteConfirm(null)}
                    className="min-h-[44px] rounded-xl bg-muted text-foreground text-sm font-semibold"
                  >
                    No
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setDeleteConfirm(worker.id)}
                  disabled={isReadonly}
                  className="flex items-center justify-center gap-2 min-h-[44px] rounded-xl border border-red-200 bg-red-50 text-red-600 text-sm font-semibold disabled:opacity-40"
                >
                  <Trash2 size={16} />
                  Eliminar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>

      <div className="hidden lg:block overflow-x-auto scrollbar-thin">
        <table className="w-full" style={{ minWidth: 780 }}>
          <thead>
            <tr className="bg-muted/20 border-b border-border">
              {[
                { key: 'name', label: 'Nombre' },
                { key: 'rut', label: 'RUT' },
                { key: 'cargo', label: 'Cargo' },
                { key: 'sucursal', label: 'Sucursal' },
                { key: 'area', label: 'Área' },
                { key: 'birthday', label: 'Cumpleaños' },
                { key: 'estado', label: 'Estado' },
              ].map((col) => (
                <th
                  key={`th-${col.key}`}
                  onClick={() => handleSort(col.key as keyof Worker)}
                  className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground select-none"
                >
                  {col.label}
                  <SortIcon field={col.key as keyof Worker} />
                </th>
              ))}
              <th className="text-left px-4 py-3 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((worker, idx) => (
              <tr
                key={worker.id}
                className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${idx % 2 === 1 ? 'bg-muted/5' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`w-8 h-8 rounded-full ${worker.avatarColor} flex items-center justify-center text-xs font-bold shrink-0`}
                    >
                      {worker.initials}
                    </div>
                    <div>
                      <span className="text-sm font-semibold text-foreground block">
                        {worker.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {worker.horasContratadas}h contratadas
                      </span>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-sm text-muted-foreground font-mono">{worker.rut}</td>
                <td className="px-4 py-3 text-sm text-foreground">{worker.cargo}</td>
                <td className="px-4 py-3 text-sm text-foreground">{worker.sucursal}</td>
                <td className="px-4 py-3 text-sm text-foreground">{worker.area}</td>
                <td className="px-4 py-3 text-sm text-foreground">
                  {worker.birthday ? (
                    <span className="flex items-center gap-1">
                      <span>🎂</span>
                      <span>{formatBirthday(worker.birthday)}</span>
                    </span>
                  ) : (
                    <span className="text-muted-foreground/40">—</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${
                      worker.estado === 'Activo'
                        ? 'bg-green-100 text-green-700'
                        : 'bg-red-100 text-red-600'
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${worker.estado === 'Activo' ? 'bg-green-500' : 'bg-red-400'}`}
                    />
                    {worker.estado}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => onEdit(worker)}
                      disabled={isReadonly}
                      className="p-1.5 rounded-lg hover:bg-blue-50 text-blue-500 hover:text-blue-700 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                      title="Editar trabajadora"
                    >
                      <Pencil size={15} />
                    </button>
                    {deleteConfirm === worker.id ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => {
                            onDelete(worker.id);
                            setDeleteConfirm(null);
                          }}
                          className="px-2 py-1 bg-red-500 text-white text-xs rounded-md font-medium hover:bg-red-600 transition-colors"
                        >
                          Sí
                        </button>
                        <button
                          onClick={() => setDeleteConfirm(null)}
                          className="px-2 py-1 bg-muted text-foreground text-xs rounded-md font-medium hover:bg-muted/80 transition-colors"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteConfirm(worker.id)}
                        disabled={isReadonly}
                        className="p-1.5 rounded-lg hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Eliminar trabajadora"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
