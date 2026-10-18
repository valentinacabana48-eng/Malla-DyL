'use client';
import React, { useState } from 'react';
import { LogOut, X, Plus, Minus } from 'lucide-react';

interface RetiroModalProps {
  workerName: string;
  dateLabel: string;
  currentHours: number;
  currentReason: string;
  onSave: (hours: number, reason: string) => void;
  onClose: () => void;
}

/** Retiro anticipado: cuántas horas descontar ese día y por qué */
export default function RetiroModal({
  workerName,
  dateLabel,
  currentHours,
  currentReason,
  onSave,
  onClose,
}: RetiroModalProps) {
  const [hours, setHours] = useState<number>(currentHours);
  const [reason, setReason] = useState(currentReason);

  function adjust(delta: number) {
    setHours((prev) => Math.max(0, Math.min(12, Math.round((prev + delta) * 2) / 2)));
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-rose-50 flex items-center justify-center">
              <LogOut size={18} className="text-rose-600" />
            </div>
            <div>
              <h2 className="font-semibold text-gray-900 text-sm">Se retiró antes</h2>
              <p className="text-xs text-gray-500">
                {workerName} · {dateLabel}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Cerrar"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-xs text-gray-500 text-center">Horas a descontar de este día</p>
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={() => adjust(-0.5)}
              className="w-10 h-10 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 transition-colors"
              aria-label="Restar media hora"
            >
              <Minus size={16} />
            </button>
            <div className="text-center">
              <span className="text-4xl font-bold text-gray-900">{hours}</span>
              <span className="text-lg text-gray-500 ml-1">hrs</span>
            </div>
            <button
              onClick={() => adjust(0.5)}
              className="w-10 h-10 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600 transition-colors"
              aria-label="Sumar media hora"
            >
              <Plus size={16} />
            </button>
          </div>
          <p className="text-center text-xs text-gray-400">
            Incrementos de 0.5 hrs · Deja en 0 para quitar el retiro
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Motivo (opcional)
            </label>
            <input
              type="text"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ej: Trámite médico"
              className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-300"
            />
          </div>

          <div className="flex gap-3 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-medium text-gray-600 hover:bg-gray-50 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => onSave(hours, hours > 0 ? reason.trim() : '')}
              className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-sm font-semibold transition-colors"
            >
              Guardar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
