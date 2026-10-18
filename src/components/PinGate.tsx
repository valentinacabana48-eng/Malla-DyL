'use client';
import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, RefreshCw, Mail, CheckCircle, AlertTriangle, ChevronLeft } from 'lucide-react';
import { usePinContext } from '@/context/PinContext';
import AppImage from '@/components/ui/AppImage';

const BRANCH_LOGOS = [
  { src: '/assets/images/descarga__2_-1784608577889.png', alt: 'Distribuidora DyL' },
  { src: '/assets/images/descarga__1_-1784608578251.png', alt: 'Mayorista DyL' },
  { src: '/assets/images/descarga-1784608578238.png', alt: 'Envases DyL' },
];

type Step = 'pin' | 'recovery-send' | 'recovery-verify' | 'recovery-reset';

export default function PinGate({ children }: { children: React.ReactNode }) {
  const { accessLevel, verifyPin, setAccessLevel, sendRecoveryCode, verifyRecoveryCode, pinSettings, updatePins } = usePinContext();

  const [step, setStep] = useState<Step>('pin');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Recovery states
  const [recoverySent, setRecoverySent] = useState(false);
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [newAdminPin, setNewAdminPin] = useState('');
  const [newReadonlyPin, setNewReadonlyPin] = useState('');
  const [showNewPins, setShowNewPins] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  if (accessLevel !== 'none') return <>{children}</>;

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const result = verifyPin(pin);
    if (result === 'invalid') {
      setError('PIN incorrecto. Intenta nuevamente.');
      setPin('');
      return;
    }
    setAccessLevel(result);
  };

  const handleSendRecovery = async () => {
    setLoading(true);
    setRecoveryError('');
    const result = await sendRecoveryCode();
    setLoading(false);
    if (result.success) {
      setRecoverySent(true);
      setStep('recovery-verify');
    } else {
      setRecoveryError(result.error || 'Error al enviar el código');
    }
  };

  const handleVerifyCode = (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    if (verifyRecoveryCode(recoveryCode)) {
      setStep('recovery-reset');
    } else {
      setRecoveryError('Código incorrecto o expirado.');
    }
  };

  const handleResetPins = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecoveryError('');
    if (newAdminPin.length < 4) { setRecoveryError('El PIN Admin debe tener al menos 4 dígitos.'); return; }
    if (newReadonlyPin.length < 4) { setRecoveryError('El PIN Lectura debe tener al menos 4 dígitos.'); return; }
    if (newAdminPin === newReadonlyPin) { setRecoveryError('Los PINs no pueden ser iguales.'); return; }
    setLoading(true);
    const ok = await updatePins({ adminPin: newAdminPin, readonlyPin: newReadonlyPin });
    setLoading(false);
    if (ok) {
      setResetSuccess(true);
      setTimeout(() => {
        setStep('pin');
        setResetSuccess(false);
        setNewAdminPin('');
        setNewReadonlyPin('');
        setRecoveryCode('');
        setRecoverySent(false);
      }, 2000);
    } else {
      setRecoveryError('Error al guardar los PINs. Intenta nuevamente.');
    }
  };

  const recoveryEmail = pinSettings?.recoveryEmail || 'valentinacabana48@gmail.com';
  const maskedEmail = recoveryEmail.replace(/(.{2})(.*)(@.*)/, (_, a, b, c) => a + '*'.repeat(Math.max(2, b.length)) + c);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div
        className="bg-card rounded-2xl shadow-2xl border border-border w-full max-w-sm mx-4 overflow-hidden"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.4)' }}
      >
        {/* Header */}
        <div
          className="px-8 pt-8 pb-6 text-center"
          style={{ background: 'linear-gradient(135deg, #0a1e3d 0%, #0f2744 100%)' }}
        >
          <div className="flex items-center justify-center gap-3 mb-5">
            {BRANCH_LOGOS.map((logo) => (
              <div key={logo.alt} className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-white/10 border border-white/20 p-1">
                <AppImage src={logo.src} alt={logo.alt} width={40} height={40} className="object-contain w-full h-full" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Lock size={18} className="text-blue-300" />
            <h2 className="text-xl font-bold text-white">Acceso seguro</h2>
          </div>
          <p className="text-sm text-white/50">
            {step === 'pin' && 'Ingresa tu PIN para continuar'}
            {step === 'recovery-send' && 'Recuperar acceso'}
            {step === 'recovery-verify' && 'Verificar código'}
            {step === 'recovery-reset' && 'Restablecer PINs'}
          </p>
        </div>

        {/* Body */}
        <div className="px-8 py-7">

          {/* ── PIN Entry ── */}
          {step === 'pin' && (
            <form onSubmit={handlePinSubmit} className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">PIN de acceso</label>
                <div className="relative">
                  <input
                    type={showPin ? 'text' : 'password'}
                    value={pin}
                    onChange={e => { setPin(e.target.value); setError(''); }}
                    placeholder="••••"
                    maxLength={10}
                    autoFocus
                    className="w-full pl-4 pr-10 py-3 bg-muted/60 border border-border rounded-xl text-sm font-bold text-foreground tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPin(v => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {showPin ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                {error && (
                  <div className="flex items-center gap-1.5 text-red-500 text-xs mt-0.5">
                    <AlertTriangle size={12} />
                    {error}
                  </div>
                )}
              </div>

              <button
                type="submit"
                disabled={pin.length < 4}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: pin.length >= 4 ? 'linear-gradient(135deg, #1d5bd4 0%, #3b82f6 100%)' : undefined, color: pin.length >= 4 ? '#fff' : undefined }}
              >
                Ingresar
                <ArrowRight size={16} />
              </button>

              <button
                type="button"
                onClick={() => setStep('recovery-send')}
                className="text-xs text-muted-foreground hover:text-secondary transition-colors text-center mt-1 flex items-center justify-center gap-1"
              >
                <RefreshCw size={12} />
                ¿Olvidaste tu PIN?
              </button>
            </form>
          )}

          {/* ── Recovery: Send Code ── */}
          {step === 'recovery-send' && (
            <div className="flex flex-col gap-4">
              <button onClick={() => setStep('pin')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1">
                <ChevronLeft size={14} /> Volver
              </button>
              <div className="bg-muted/40 rounded-xl p-4 flex flex-col gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <Mail size={16} className="text-secondary" />
                  Enviar código de recuperación
                </div>
                <p className="text-xs text-muted-foreground">
                  Se enviará un código de 6 dígitos a:
                </p>
                <p className="text-sm font-mono font-semibold text-foreground">{maskedEmail}</p>
              </div>

              {recoveryError && (
                <div className="flex items-center gap-1.5 text-red-500 text-xs">
                  <AlertTriangle size={12} />
                  {recoveryError}
                </div>
              )}

              <button
                onClick={handleSendRecovery}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all"
                style={{ background: 'linear-gradient(135deg, #1d5bd4 0%, #3b82f6 100%)', color: '#fff', opacity: loading ? 0.7 : 1 }}
              >
                {loading ? <RefreshCw size={15} className="animate-spin" /> : <Mail size={15} />}
                {loading ? 'Enviando...' : 'Enviar código'}
              </button>
            </div>
          )}

          {/* ── Recovery: Verify Code ── */}
          {step === 'recovery-verify' && (
            <form onSubmit={handleVerifyCode} className="flex flex-col gap-4">
              <button type="button" onClick={() => setStep('recovery-send')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors mb-1">
                <ChevronLeft size={14} /> Volver
              </button>
              <div className="flex items-center gap-2 text-sm text-green-600 bg-green-50 border border-green-200 rounded-lg px-3 py-2">
                <CheckCircle size={14} />
                Código enviado a {maskedEmail}
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Código de 6 dígitos</label>
                <input
                  type="text"
                  value={recoveryCode}
                  onChange={e => { setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setRecoveryError(''); }}
                  placeholder="000000"
                  maxLength={6}
                  autoFocus
                  className="w-full px-4 py-3 bg-muted/60 border border-border rounded-xl text-sm font-bold text-foreground tracking-widest text-center focus:outline-none focus:ring-2 focus:ring-ring"
                />
                {recoveryError && (
                  <div className="flex items-center gap-1.5 text-red-500 text-xs">
                    <AlertTriangle size={12} />
                    {recoveryError}
                  </div>
                )}
              </div>
              <button
                type="submit"
                disabled={recoveryCode.length !== 6}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ background: recoveryCode.length === 6 ? 'linear-gradient(135deg, #1d5bd4 0%, #3b82f6 100%)' : undefined, color: recoveryCode.length === 6 ? '#fff' : undefined }}
              >
                Verificar código
                <ArrowRight size={16} />
              </button>
            </form>
          )}

          {/* ── Recovery: Reset PINs ── */}
          {step === 'recovery-reset' && (
            <form onSubmit={handleResetPins} className="flex flex-col gap-4">
              {resetSuccess ? (
                <div className="flex flex-col items-center gap-3 py-4">
                  <CheckCircle size={40} className="text-green-500" />
                  <p className="text-sm font-semibold text-foreground text-center">¡PINs actualizados correctamente!</p>
                </div>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">Establece tus nuevos PINs de acceso.</p>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nuevo PIN Admin (acceso completo)</label>
                    <div className="relative">
                      <input
                        type={showNewPins ? 'text' : 'password'}
                        value={newAdminPin}
                        onChange={e => setNewAdminPin(e.target.value.replace(/\D/g, '').slice(0, 10))}
                        placeholder="Mín. 4 dígitos"
                        className="w-full pl-4 pr-10 py-3 bg-muted/60 border border-border rounded-xl text-sm font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
                      />
                      <button type="button" onClick={() => setShowNewPins(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                        {showNewPins ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Nuevo PIN Lectura (solo visualizar)</label>
                    <input
                      type={showNewPins ? 'text' : 'password'}
                      value={newReadonlyPin}
                      onChange={e => setNewReadonlyPin(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      placeholder="Mín. 4 dígitos"
                      className="w-full px-4 py-3 bg-muted/60 border border-border rounded-xl text-sm font-bold tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
                    />
                  </div>
                  {recoveryError && (
                    <div className="flex items-center gap-1.5 text-red-500 text-xs">
                      <AlertTriangle size={12} />
                      {recoveryError}
                    </div>
                  )}
                  <button
                    type="submit"
                    disabled={loading || newAdminPin.length < 4 || newReadonlyPin.length < 4}
                    className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                    style={{ background: 'linear-gradient(135deg, #1d5bd4 0%, #3b82f6 100%)', color: '#fff' }}
                  >
                    {loading ? <RefreshCw size={15} className="animate-spin" /> : <CheckCircle size={15} />}
                    {loading ? 'Guardando...' : 'Guardar nuevos PINs'}
                  </button>
                </>
              )}
            </form>
          )}
        </div>

        {/* Footer hint */}
        {step === 'pin' && (
          <div className="px-8 pb-6 flex justify-center gap-6">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              Admin: acceso completo
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground/60">
              <div className="w-2 h-2 rounded-full bg-slate-400" />
              Lectura: solo visualizar
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
