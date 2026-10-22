'use client';
import React, { useState } from 'react';
import { Lock, Unlock, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';

interface LockToggleProps {
  isLocked: boolean;
  /** Nombre de lo que se bloquea, p. ej. "la malla" */
  subject: string;
  onToggle: (locked: boolean) => Promise<boolean> | boolean | void;
  /** Si se indica, el botón queda deshabilitado con este motivo */
  disabledReason?: string;
  /** Solo el candado cuando está desbloqueado (bloqueado sigue diciendo «Bloqueada») */
  compact?: boolean;
}

/** Botón de bloqueo sin PIN: solo administradores pueden cambiarlo. */
export default function LockToggle({
  isLocked,
  subject,
  onToggle,
  disabledReason,
  compact = false,
}: LockToggleProps) {
  // Bloquear afecta a toda la sucursal: solo quien maneja la sucursal completa
  const { canManageSucursal: isAdmin } = useAuth();
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleConfirm = async () => {
    setSaving(true);
    await onToggle(!isLocked);
    setSaving(false);
    setConfirming(false);
  };

  return (
    <>
      <button
        onClick={() => setConfirming(true)}
        disabled={!isAdmin || !!disabledReason}
        title={
          disabledReason ??
          (isAdmin
            ? compact && !isLocked
              ? `Bloquear ${subject}`
              : undefined
            : 'Solo quien administra toda la sucursal puede cambiar el bloqueo')
        }
        aria-label={isLocked ? 'Bloqueada' : 'Bloquear'}
        className={`flex items-center gap-2 ${compact && !isLocked ? 'px-3' : 'px-4'} py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 disabled:cursor-not-allowed ${
          isLocked
            ? 'bg-red-500 text-white hover:bg-red-600 disabled:hover:bg-red-500'
            : 'border border-border bg-card text-foreground hover:bg-muted disabled:opacity-60'
        }`}
        style={isLocked ? { boxShadow: '0 2px 8px rgba(239,68,68,0.3)' } : {}}
      >
        {isLocked ? <Lock size={15} /> : <Unlock size={15} />}
        {isLocked ? 'Bloqueada' : compact ? null : 'Bloquear'}
      </button>

      {confirming && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div
                  className={`w-9 h-9 rounded-xl flex items-center justify-center ${isLocked ? 'bg-green-50' : 'bg-red-50'}`}
                >
                  {isLocked ? (
                    <Unlock size={18} className="text-green-600" />
                  ) : (
                    <Lock size={18} className="text-red-500" />
                  )}
                </div>
                <h2 className="text-base font-bold text-foreground">
                  {isLocked ? 'Desbloquear' : 'Bloquear'} {subject}
                </h2>
              </div>
              <button
                onClick={() => setConfirming(false)}
                className="text-muted-foreground hover:text-foreground"
                aria-label="Cerrar"
              >
                <X size={18} />
              </button>
            </div>
            <p className="text-sm text-muted-foreground mb-5">
              {isLocked
                ? `Se podrá volver a editar ${subject}.`
                : `Nadie podrá editar ${subject} hasta que un administrador la desbloquee. Aplica en todos los dispositivos, solo para esta sucursal.`}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirming(false)}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirm}
                disabled={saving}
                className={`flex-1 px-4 py-2.5 rounded-xl text-white text-sm font-semibold disabled:opacity-50 ${isLocked ? 'bg-green-600 hover:bg-green-700' : 'bg-red-500 hover:bg-red-600'}`}
              >
                {saving ? 'Guardando...' : isLocked ? 'Desbloquear' : 'Bloquear'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
