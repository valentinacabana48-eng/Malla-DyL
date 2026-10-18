'use client';
import React, { useState } from 'react';
import { Lock, Eye, EyeOff, ArrowRight, Mail, CheckCircle, AlertTriangle, ChevronLeft, Clock, LogOut, RefreshCw } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import AppImage from '@/components/ui/AppImage';

const BRANCH_LOGOS = [
  { src: '/assets/images/descarga__2_-1784608577889.png', alt: 'Distribuidora DyL' },
  { src: '/assets/images/descarga__1_-1784608578251.png', alt: 'Mayorista DyL' },
  { src: '/assets/images/descarga-1784608578238.png', alt: 'Envases DyL' },
];

const MIN_PASSWORD = 8;

type Step = 'login' | 'signup' | 'forgot';

const inputClass =
  'w-full pl-4 pr-10 py-3 bg-muted/60 border border-border rounded-xl text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring';

const primaryButtonClass =
  'w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm text-white transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed';

const primaryButtonStyle = { background: 'linear-gradient(135deg, #1d5bd4 0%, #3b82f6 100%)' };

function Shell({ subtitle, children }: { subtitle: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-background overflow-y-auto p-4">
      <div
        className="bg-card rounded-2xl border border-border w-full max-w-sm overflow-hidden"
        style={{ boxShadow: '0 25px 60px rgba(0,0,0,0.25)' }}
      >
        <div className="px-8 pt-8 pb-6 text-center" style={{ background: 'linear-gradient(135deg, #0a1e3d 0%, #0f2744 100%)' }}>
          <div className="flex items-center justify-center gap-3 mb-5">
            {BRANCH_LOGOS.map((logo) => (
              <div key={logo.alt} className="w-12 h-12 rounded-xl overflow-hidden flex items-center justify-center bg-white/10 border border-white/20 p-1">
                <AppImage src={logo.src} alt={logo.alt} width={40} height={40} className="object-contain w-full h-full" />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-center gap-2 mb-1">
            <Lock size={18} className="text-blue-300" />
            <h2 className="text-xl font-bold text-white">D&L Gestor</h2>
          </div>
          <p className="text-sm text-white/50">{subtitle}</p>
        </div>
        <div className="px-8 py-7">{children}</div>
      </div>
    </div>
  );
}

function ErrorText({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-1.5 text-red-500 text-xs" role="alert">
      <AlertTriangle size={12} className="mt-0.5 shrink-0" />
      <span>{children}</span>
    </div>
  );
}

function PasswordInput({ value, onChange, placeholder, autoComplete, autoFocus }: {
  value: string; onChange: (v: string) => void; placeholder: string; autoComplete: string; autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
        required
        className={inputClass}
      />
      <button
        type="button"
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
        aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{children}</label>;
}

function NewPasswordForm() {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password.length < MIN_PASSWORD) { setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`); return; }
    if (password !== confirm) { setError('Las contraseñas no coinciden.'); return; }
    setLoading(true);
    const err = await updatePassword(password);
    setLoading(false);
    if (err) setError(err);
  };

  return (
    <Shell subtitle="Crea una nueva contraseña">
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label>Nueva contraseña</Label>
          <PasswordInput value={password} onChange={v => { setPassword(v); setError(''); }} placeholder={`Mínimo ${MIN_PASSWORD} caracteres`} autoComplete="new-password" autoFocus />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>Confirmar contraseña</Label>
          <PasswordInput value={confirm} onChange={v => { setConfirm(v); setError(''); }} placeholder="Repite la contraseña" autoComplete="new-password" />
        </div>
        {error && <ErrorText>{error}</ErrorText>}
        <button type="submit" disabled={loading} className={primaryButtonClass} style={primaryButtonStyle}>
          {loading ? 'Guardando...' : 'Guardar contraseña'}
        </button>
      </form>
    </Shell>
  );
}

function PendingApproval() {
  const { user, signOut, refreshRole } = useAuth();
  const [checking, setChecking] = useState(false);
  return (
    <Shell subtitle="Cuenta pendiente de aprobación">
      <div className="flex flex-col gap-4 text-center">
        <div className="mx-auto w-12 h-12 rounded-full bg-amber-50 flex items-center justify-center">
          <Clock size={22} className="text-amber-600" />
        </div>
        <p className="text-sm text-foreground">
          Tu cuenta <span className="font-semibold">{user?.email}</span> fue creada, pero un administrador debe darte acceso.
        </p>
        <p className="text-xs text-muted-foreground">
          Pídele que te asigne un rol en <span className="font-semibold">Ajustes → Usuarios</span>.
        </p>
        <button
          onClick={async () => { setChecking(true); await refreshRole(); setChecking(false); }}
          disabled={checking}
          className={primaryButtonClass}
          style={primaryButtonStyle}
        >
          <RefreshCw size={14} className={checking ? 'animate-spin' : ''} />
          Ya me dieron acceso
        </button>
        <button onClick={signOut} className="text-xs text-muted-foreground hover:text-red-600 flex items-center justify-center gap-1">
          <LogOut size={12} /> Cerrar sesión
        </button>
      </div>
    </Shell>
  );
}

function LoginScreen() {
  const { signIn, signUp, sendPasswordReset } = useAuth();
  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const go = (s: Step) => { setStep(s); setError(''); setInfo(''); setPassword(''); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setInfo('');
    if (step === 'signup' && password.length < MIN_PASSWORD) {
      setError(`La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`);
      return;
    }
    setLoading(true);
    if (step === 'login') {
      const err = await signIn(email, password);
      if (err) setError(err);
    } else if (step === 'signup') {
      const err = await signUp(email, password);
      if (err) setError(err);
      else setInfo('Cuenta creada. Revisa tu correo para confirmarla y luego inicia sesión.');
    } else {
      const err = await sendPasswordReset(email);
      if (err) setError(err);
      else setInfo('Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.');
    }
    setLoading(false);
  };

  const subtitle = step === 'login' ? 'Inicia sesión para continuar' : step === 'signup' ? 'Crear cuenta' : 'Recuperar contraseña';
  const buttonText = step === 'login' ? 'Ingresar' : step === 'signup' ? 'Crear cuenta' : 'Enviar enlace';

  return (
    <Shell subtitle={subtitle}>
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        {step !== 'login' && (
          <button type="button" onClick={() => go('login')} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors -mb-1">
            <ChevronLeft size={14} /> Volver
          </button>
        )}

        <div className="flex flex-col gap-1.5">
          <Label>Correo</Label>
          <div className="relative">
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
              placeholder="nombre@empresa.cl"
              autoComplete="email"
              autoFocus
              required
              className={inputClass}
            />
            <Mail size={16} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          </div>
        </div>

        {step !== 'forgot' && (
          <div className="flex flex-col gap-1.5">
            <Label>Contraseña</Label>
            <PasswordInput
              value={password}
              onChange={v => { setPassword(v); setError(''); }}
              placeholder={step === 'signup' ? `Mínimo ${MIN_PASSWORD} caracteres` : '••••••••'}
              autoComplete={step === 'signup' ? 'new-password' : 'current-password'}
            />
          </div>
        )}

        {error && <ErrorText>{error}</ErrorText>}
        {info && (
          <div className="flex items-start gap-1.5 text-green-700 text-xs bg-green-50 border border-green-200 rounded-lg p-2.5">
            <CheckCircle size={12} className="mt-0.5 shrink-0" />
            <span>{info}</span>
          </div>
        )}

        <button type="submit" disabled={loading} className={primaryButtonClass} style={primaryButtonStyle}>
          {loading ? 'Procesando...' : buttonText}
          {!loading && <ArrowRight size={16} />}
        </button>

        {step === 'login' && (
          <div className="flex items-center justify-between text-xs mt-1">
            <button type="button" onClick={() => go('forgot')} className="text-muted-foreground hover:text-secondary transition-colors">
              ¿Olvidaste tu contraseña?
            </button>
            <button type="button" onClick={() => go('signup')} className="text-secondary font-semibold hover:underline">
              Crear cuenta
            </button>
          </div>
        )}
      </form>
    </Shell>
  );
}

/** Muestra login / recuperación / espera de aprobación hasta que el usuario tenga rol. */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const { loading, session, role, recoveringPassword } = useAuth();

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-[3px] border-secondary/20 border-t-secondary animate-spin" />
      </div>
    );
  }
  if (recoveringPassword && session) return <NewPasswordForm />;
  if (!session) return <LoginScreen />;
  if (role === null) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-background">
        <div className="w-10 h-10 rounded-full border-[3px] border-secondary/20 border-t-secondary animate-spin" />
      </div>
    );
  }
  if (role === 'pendiente') return <PendingApproval />;
  return <>{children}</>;
}
