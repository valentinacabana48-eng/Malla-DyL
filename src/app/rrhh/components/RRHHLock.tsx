'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Lock, Eye, EyeOff, ShieldCheck, RefreshCw, X } from 'lucide-react';

const STORAGE_KEY = 'rrhh_pin_hash';
const RECOVERY_KEY = 'rrhh_recovery_code';

// Simple hash: XOR + base64 (not cryptographic, but hides PIN from plain view)
function hashPin(pin: string): string {
  return btoa(pin.split('').map((c, i) => String.fromCharCode(c.charCodeAt(0) ^ (i + 7))).join(''));
}

function generateRecoveryCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

interface RRHHLockProps {
  onUnlocked: () => void;
}

type Screen = 'locked' | 'setpin' | 'confirmpin' | 'recovery_show' | 'recovery_input';

export default function RRHHLock({ onUnlocked }: RRHHLockProps) {
  const [screen, setScreen] = useState<Screen>('locked');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [recoveryInput, setRecoveryInput] = useState('');
  const [newPin, setNewPin] = useState('');
  const [confirmNewPin, setConfirmNewPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [hasPin, setHasPin] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryStep, setRecoveryStep] = useState<'enter_code' | 'new_pin' | 'confirm_pin'>('enter_code');
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setHasPin(true);
      setScreen('locked');
    } else {
      setScreen('setpin');
    }
  }, []);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, [screen, recoveryStep]);

  const resetFields = () => {
    setPin('');
    setConfirmPin('');
    setRecoveryInput('');
    setNewPin('');
    setConfirmNewPin('');
    setError('');
    setShowPin(false);
  };

  // --- SET PIN FLOW ---
  const handleSetPin = () => {
    if (screen === 'setpin') {
      if (pin.length < 4) { setError('El PIN debe tener al menos 4 dígitos.'); return; }
      setScreen('confirmpin');
      setError('');
      return;
    }
    if (screen === 'confirmpin') {
      if (pin !== confirmPin) { setError('Los PINs no coinciden. Intenta de nuevo.'); setConfirmPin(''); return; }
      const code = generateRecoveryCode();
      setRecoveryCode(code);
      localStorage.setItem(STORAGE_KEY, hashPin(pin));
      localStorage.setItem(RECOVERY_KEY, code);
      setHasPin(true);
      setScreen('recovery_show');
      setError('');
    }
  };

  // --- UNLOCK FLOW ---
  const handleUnlock = () => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored && hashPin(pin) === stored) {
      resetFields();
      onUnlocked();
    } else {
      setError('PIN incorrecto. Intenta de nuevo.');
      setPin('');
    }
  };

  // --- RECOVERY FLOW ---
  const handleRecovery = () => {
    if (recoveryStep === 'enter_code') {
      const stored = localStorage.getItem(RECOVERY_KEY);
      if (recoveryInput.trim().toUpperCase() === stored) {
        setRecoveryStep('new_pin');
        setError('');
      } else {
        setError('Código de recuperación incorrecto.');
      }
      return;
    }
    if (recoveryStep === 'new_pin') {
      if (newPin.length < 4) { setError('El PIN debe tener al menos 4 dígitos.'); return; }
      setRecoveryStep('confirm_pin');
      setError('');
      return;
    }
    if (recoveryStep === 'confirm_pin') {
      if (newPin !== confirmNewPin) { setError('Los PINs no coinciden.'); setConfirmNewPin(''); return; }
      const code = generateRecoveryCode();
      localStorage.setItem(STORAGE_KEY, hashPin(newPin));
      localStorage.setItem(RECOVERY_KEY, code);
      setRecoveryCode(code);
      setScreen('recovery_show');
      setRecoveryStep('enter_code');
      setError('');
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(recoveryCode).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (screen === 'locked') handleUnlock();
      else if (screen === 'setpin' || screen === 'confirmpin') handleSetPin();
      else if (screen === 'recovery_input') handleRecovery();
    }
  };

  // ---- RENDER ----

  // Recovery code display screen (after set/reset)
  if (screen === 'recovery_show') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm mx-4 shadow-2xl text-center">
          <div className="w-14 h-14 rounded-2xl bg-green-100 flex items-center justify-center mx-auto mb-4">
            <ShieldCheck size={28} className="text-green-600" />
          </div>
          <h2 className="text-lg font-bold text-foreground mb-2">PIN configurado</h2>
          <p className="text-sm text-muted-foreground mb-5">
            Guarda este código de recuperación en un lugar seguro. Lo necesitarás si olvidas tu PIN.
          </p>
          <div className="bg-muted rounded-xl px-4 py-3 font-mono text-xl tracking-widest text-foreground font-bold mb-3 select-all">
            {recoveryCode}
          </div>
          <button
            onClick={handleCopy}
            className="text-xs text-secondary hover:underline mb-5 block mx-auto"
          >
            {copied ? '¡Copiado!' : 'Copiar código'}
          </button>
          <button
            onClick={() => { setScreen('locked'); resetFields(); onUnlocked(); }}
            className="w-full px-4 py-3 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-blue-700 transition-colors"
          >
            Entrar al módulo RRHH
          </button>
        </div>
      </div>
    );
  }

  // Recovery input screen
  if (screen === 'recovery_input') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm mx-4 shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-orange-100 flex items-center justify-center">
                <RefreshCw size={18} className="text-orange-500" />
              </div>
              <h2 className="text-base font-bold text-foreground">
                {recoveryStep === 'enter_code' && 'Recuperar acceso'}
                {recoveryStep === 'new_pin' && 'Nuevo PIN'}
                {recoveryStep === 'confirm_pin' && 'Confirmar nuevo PIN'}
              </h2>
            </div>
            <button onClick={() => { setScreen('locked'); resetFields(); setRecoveryStep('enter_code'); }} className="text-muted-foreground hover:text-foreground">
              <X size={18} />
            </button>
          </div>

          <p className="text-sm text-muted-foreground mb-4">
            {recoveryStep === 'enter_code' && 'Ingresa el código de recuperación que guardaste al crear el PIN.'}
            {recoveryStep === 'new_pin' && 'Crea un nuevo PIN (mínimo 4 dígitos).'}
            {recoveryStep === 'confirm_pin' && 'Confirma el nuevo PIN.'}
          </p>

          <div className="relative mb-3">
            {recoveryStep === 'enter_code' ? (
              <input
                ref={inputRef}
                type="text"
                value={recoveryInput}
                onChange={e => { setRecoveryInput(e.target.value.toUpperCase()); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="XXXXXXXX"
                maxLength={8}
                className="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-secondary/50 uppercase"
              />
            ) : (
              <input
                ref={inputRef}
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                pattern="[0-9]*"
                value={recoveryStep === 'new_pin' ? newPin : confirmNewPin}
                onChange={e => {
                  const val = e.target.value.replace(/\D/g, '');
                  if (recoveryStep === 'new_pin') setNewPin(val);
                  else setConfirmNewPin(val);
                  setError('');
                }}
                onKeyDown={handleKeyDown}
                placeholder="••••"
                maxLength={8}
                className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-foreground text-center text-xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-secondary/50"
              />
            )}
            {recoveryStep !== 'enter_code' && (
              <button type="button" onClick={() => setShowPin(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            )}
          </div>

          {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => { setScreen('locked'); resetFields(); setRecoveryStep('enter_code'); }}
              className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleRecovery}
              disabled={
                recoveryStep === 'enter_code' ? recoveryInput.length < 8 :
                recoveryStep === 'new_pin' ? newPin.length < 4 :
                confirmNewPin.length < 4
              }
              className="flex-1 px-4 py-2.5 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {recoveryStep === 'enter_code' ? 'Verificar' : recoveryStep === 'new_pin' ? 'Continuar' : 'Guardar PIN'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Set PIN / Confirm PIN screens
  if (screen === 'setpin' || screen === 'confirmpin') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
        <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm mx-4 shadow-2xl">
          <div className="flex flex-col items-center mb-6">
            <div className="w-14 h-14 rounded-2xl bg-secondary/10 flex items-center justify-center mb-3">
              <Lock size={26} className="text-secondary" />
            </div>
            <h2 className="text-lg font-bold text-foreground">
              {screen === 'setpin' ? 'Proteger módulo RRHH' : 'Confirmar PIN'}
            </h2>
            <p className="text-sm text-muted-foreground text-center mt-1">
              {screen === 'setpin' ?'Crea un PIN numérico (mínimo 4 dígitos) para restringir el acceso a este módulo.' :'Ingresa el PIN nuevamente para confirmar.'}
            </p>
          </div>

          <div className="relative mb-3">
            <input
              ref={inputRef}
              type={showPin ? 'text' : 'password'}
              inputMode="numeric"
              pattern="[0-9]*"
              value={screen === 'confirmpin' ? confirmPin : pin}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                if (screen === 'confirmpin') setConfirmPin(val);
                else setPin(val);
                setError('');
              }}
              onKeyDown={handleKeyDown}
              placeholder="••••"
              maxLength={8}
              className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-foreground text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-secondary/50"
            />
            <button type="button" onClick={() => setShowPin(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
              {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}

          <button
            onClick={handleSetPin}
            disabled={(screen === 'confirmpin' ? confirmPin : pin).length < 4}
            className="w-full mt-2 px-4 py-3 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {screen === 'setpin' ? 'Continuar' : 'Guardar PIN'}
          </button>
          {screen === 'confirmpin' && (
            <button onClick={() => { setScreen('setpin'); setConfirmPin(''); setError(''); }} className="w-full mt-2 text-xs text-muted-foreground hover:underline">
              ← Volver
            </button>
          )}
        </div>
      </div>
    );
  }

  // Locked screen (default)
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background">
      <div className="bg-card rounded-2xl border border-border p-8 w-full max-w-sm mx-4 shadow-2xl">
        <div className="flex flex-col items-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-red-100 flex items-center justify-center mb-3">
            <Lock size={26} className="text-red-500" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Módulo RRHH</h2>
          <p className="text-sm text-muted-foreground text-center mt-1">
            Ingresa tu PIN para acceder a este módulo.
          </p>
        </div>

        <div className="relative mb-3">
          <input
            ref={inputRef}
            type={showPin ? 'text' : 'password'}
            inputMode="numeric"
            pattern="[0-9]*"
            value={pin}
            onChange={e => { setPin(e.target.value.replace(/\D/g, '')); setError(''); }}
            onKeyDown={handleKeyDown}
            placeholder="••••"
            maxLength={8}
            className="w-full px-4 py-3 pr-12 rounded-xl border border-border bg-background text-foreground text-center text-2xl tracking-widest font-mono focus:outline-none focus:ring-2 focus:ring-secondary/50"
          />
          <button type="button" onClick={() => setShowPin(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
            {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        </div>

        {error && <p className="text-red-500 text-xs mb-3 text-center">{error}</p>}

        <button
          onClick={handleUnlock}
          disabled={pin.length < 4}
          className="w-full mt-2 px-4 py-3 rounded-xl bg-secondary text-white text-sm font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Ingresar
        </button>

        <button
          onClick={() => { setScreen('recovery_input'); resetFields(); }}
          className="w-full mt-3 text-xs text-muted-foreground hover:text-secondary hover:underline transition-colors"
        >
          ¿Olvidaste tu PIN? Recuperar acceso
        </button>
      </div>
    </div>
  );
}
