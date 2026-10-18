'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Lock, Unlock, X, Eye, EyeOff } from 'lucide-react';

interface MallaLockProps {
  isLocked: boolean;
  hasPin: boolean;
  onLock: () => void;
  onUnlock: (pin: string) => boolean;
  onSetPin: (pin: string) => void;
}

export default function MallaLock({ isLocked, hasPin, onLock, onUnlock, onSetPin }: MallaLockProps) {
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<'unlock' | 'setpin' | 'confirmpin'>('unlock');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showModal) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [showModal]);

  const openModal = () => {
    setPin('');
    setConfirmPin('');
    setError('');
    setShowPin(false);
    if (!hasPin) {
      setMode('setpin');
    } else if (isLocked) {
      setMode('unlock');
    } else {
      setMode('unlock');
    }
    setShowModal(true);
  };

  const handleClose = () => {
    setShowModal(false);
    setPin('');
    setConfirmPin('');
    setError('');
  };

  const handleSetPin = () => {
    if (pin.length < 4) {
      setError('El PIN debe tener al menos 4 dígitos.');
      return;
    }
    if (mode === 'setpin') {
      setMode('confirmpin');
      setConfirmPin('');
      setError('');
      setTimeout(() => inputRef.current?.focus(), 100);
      return;
    }
    if (mode === 'confirmpin') {
      if (pin !== confirmPin) {
        setError('Los PINs no coinciden. Intenta de nuevo.');
        setConfirmPin('');
        return;
      }
      onSetPin(pin);
      handleClose();
    }
  };

  const handleUnlock = () => {
    const ok = onUnlock(pin);
    if (!ok) {
      setError('PIN incorrecto. Intenta de nuevo.');
      setPin('');
      setTimeout(() => inputRef.current?.focus(), 100);
    } else {
      handleClose();
    }
  };

  const handleLockClick = () => {
    if (!hasPin) {
      openModal();
    } else if (isLocked) {
      openModal();
    } else {
      onLock();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'unlock') handleUnlock();
      else handleSetPin();
    }
  };

  return (
    <>
      {/* Lock/Unlock button */}
      <button
        onClick={handleLockClick}
        title={isLocked ? 'Malla bloqueada — clic para desbloquear' : 'Bloquear malla'}
        className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all duration-150 active:scale-95 ${
          isLocked
            ? 'bg-red-500 hover:bg-red-600 text-white' :'bg-gray-100 hover:bg-gray-200 text-gray-700 border border-gray-300'
        }`}
        style={isLocked ? { boxShadow: '0 2px 8px rgba(239,68,68,0.3)' } : {}}
      >
        {isLocked ? <Lock size={15} /> : <Unlock size={15} />}
        {isLocked ? 'Bloqueada' : 'Bloquear'}
      </button>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card rounded-2xl border border-border p-6 w-full max-w-sm mx-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-secondary/10 flex items-center justify-center">
                  <Lock size={18} className="text-secondary" />
                </div>
                <h2 className="text-base font-bold text-foreground">
                  {mode === 'unlock' && 'Desbloquear Malla'}
                  {mode === 'setpin' && 'Crear PIN de seguridad'}
                  {mode === 'confirmpin' && 'Confirmar PIN'}
                </h2>
              </div>
              <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
                <X size={18} />
              </button>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground mb-4">
              {mode === 'unlock' && 'Ingresa tu PIN para poder editar la malla de turnos.'}
              {mode === 'setpin' && 'Crea un PIN numérico (mínimo 4 dígitos). Solo tú lo sabrás.'}
              {mode === 'confirmpin' && 'Ingresa el PIN nuevamente para confirmar.'}
            </p>

            {/* PIN input */}
            <div className="relative mb-3">
              <input
                ref={inputRef}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                value={mode === 'confirmpin' ? confirmPin : pin}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (mode === 'confirmpin') setConfirmPin(val);
                  else setPin(val);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="••••"
                maxLength={8}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-foreground text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-secondary/50"
              />
              <button
                type="button"
                onClick={() => setShowPin(v => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {/* Error */}
            {error && (
              <p className="text-red-500 text-xs mb-3 text-center">{error}</p>
            )}

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={mode === 'unlock' ? handleUnlock : handleSetPin}
                disabled={(mode === 'confirmpin' ? confirmPin : pin).length < 4}
                className="flex-1 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {mode === 'unlock' && 'Desbloquear'}
                {mode === 'setpin' && 'Continuar'}
                {mode === 'confirmpin' && 'Guardar PIN'}
              </button>
            </div>

            {/* Change PIN hint when unlocking */}
            {mode === 'unlock' && (
              <p className="text-xs text-muted-foreground text-center mt-3">
                ¿Olvidaste tu PIN? Contacta al administrador.
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
