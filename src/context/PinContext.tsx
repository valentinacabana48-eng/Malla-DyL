'use client';
import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';

export type AccessLevel = 'none' | 'readonly' | 'admin';

const DEFAULT_SETTINGS = {
  adminPin: '1895',
  readonlyPin: '2075',
  recoveryEmail: 'valentinacabana48@gmail.com',
};

interface PinSettings {
  adminPin: string;
  readonlyPin: string;
  recoveryEmail: string;
}

interface PinContextValue {
  accessLevel: AccessLevel;
  pinSettings: PinSettings | null;
  loadingPins: boolean;
  verifyPin: (pin: string) => 'admin' | 'readonly' | 'invalid';
  logout: () => void;
  setAccessLevel: (level: AccessLevel) => void;
  updatePins: (settings: Partial<PinSettings>) => Promise<boolean>;
  sendRecoveryCode: () => Promise<{ success: boolean; error?: string }>;
  verifyRecoveryCode: (code: string) => boolean;
}

const PinContext = createContext<PinContextValue | null>(null);

export function usePinContext() {
  const ctx = useContext(PinContext);
  if (!ctx) throw new Error('usePinContext must be used within PinProvider');
  return ctx;
}

// Recovery code stored in memory (expires after 15 min)
let recoveryCodeStore: { code: string; expiresAt: number } | null = null;

export function PinProvider({ children }: { children: React.ReactNode }) {
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('none');
  const [pinSettings, setPinSettings] = useState<PinSettings | null>(null);
  const [loadingPins, setLoadingPins] = useState(true);
  const supabase = createClient();
  const settingsRef = useRef<PinSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    // Restore session from sessionStorage
    const saved = typeof window !== 'undefined' ? sessionStorage.getItem('pin_access_level') : null;
    if (saved === 'admin' || saved === 'readonly') {
      setAccessLevel(saved as AccessLevel);
    }
    loadPinSettings();
  }, []);

  async function loadPinSettings(): Promise<PinSettings> {
    setLoadingPins(true);
    try {
      const { data, error } = await supabase
        .from('pin_settings')
        .select('admin_pin, readonly_pin, recovery_email')
        .eq('id', 'global')
        .single();

      if (data && !error) {
        let settings: PinSettings = {
          adminPin: data.admin_pin || DEFAULT_SETTINGS.adminPin,
          readonlyPin: data.readonly_pin || DEFAULT_SETTINGS.readonlyPin,
          recoveryEmail: data.recovery_email || DEFAULT_SETTINGS.recoveryEmail,
        };
        setPinSettings(settings);
        settingsRef.current = settings;
        return settings;
      } else {
        // data is null or there's an error — use defaults
        setPinSettings(DEFAULT_SETTINGS);
        settingsRef.current = DEFAULT_SETTINGS;
        return DEFAULT_SETTINGS;
      }
    } catch {
      // Network or unexpected error — use defaults
      setPinSettings(DEFAULT_SETTINGS);
      settingsRef.current = DEFAULT_SETTINGS;
      return DEFAULT_SETTINGS;
    } finally {
      setLoadingPins(false);
    }
  }

  const verifyPin = useCallback((pin: string): 'admin' | 'readonly' | 'invalid' => {
    // Use ref as fallback so it works even if state hasn't updated yet
    let settings = pinSettings ?? settingsRef.current;
    if (pin === settings.adminPin) return 'admin';
    if (pin === settings.readonlyPin) return 'readonly';
    return 'invalid';
  }, [pinSettings]);

  const handleSetAccessLevel = useCallback((level: AccessLevel) => {
    setAccessLevel(level);
    if (typeof window !== 'undefined') {
      if (level === 'none') {
        sessionStorage.removeItem('pin_access_level');
      } else {
        sessionStorage.setItem('pin_access_level', level);
      }
    }
  }, []);

  const logout = useCallback(() => {
    handleSetAccessLevel('none');
  }, [handleSetAccessLevel]);

  const updatePins = useCallback(async (settings: Partial<PinSettings>): Promise<boolean> => {
    try {
      const updateData: Record<string, string> = {};
      if (settings.adminPin) updateData.admin_pin = settings.adminPin;
      if (settings.readonlyPin) updateData.readonly_pin = settings.readonlyPin;
      if (settings.recoveryEmail) updateData.recovery_email = settings.recoveryEmail;
      updateData.updated_at = new Date().toISOString();

      const { error } = await supabase
        .from('pin_settings')
        .update(updateData)
        .eq('id', 'global');

      if (error) return false;
      await loadPinSettings();
      return true;
    } catch {
      return false;
    }
  }, [supabase]);

  const sendRecoveryCode = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    // If pinSettings not loaded yet, try loading first
    let settings = pinSettings ?? settingsRef.current;
    if (!settings) {
      settings = await loadPinSettings();
    }

    const email = settings.recoveryEmail || DEFAULT_SETTINGS.recoveryEmail;
    const code = String(Math.floor(100000 + Math.random() * 900000));
    recoveryCodeStore = { code, expiresAt: Date.now() + 15 * 60 * 1000 };

    try {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
        return { success: false, error: 'Variables de entorno no configuradas' };
      }

      const res = await fetch(`${supabaseUrl}/functions/v1/send-pin-recovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({ email, code }),
      });

      if (!res.ok) {
        let errMsg = 'Error al enviar el correo';
        try {
          const err = await res.json();
          errMsg = err.error || errMsg;
        } catch {
          // ignore parse error
        }
        return { success: false, error: errMsg };
      }

      return { success: true };
    } catch (e: unknown) {
      return { success: false, error: (e as Error).message || 'Error de conexión' };
    }
  }, [pinSettings]);

  const verifyRecoveryCode = useCallback((code: string): boolean => {
    if (!recoveryCodeStore) return false;
    if (Date.now() > recoveryCodeStore.expiresAt) {
      recoveryCodeStore = null;
      return false;
    }
    return recoveryCodeStore.code === code;
  }, []);

  return (
    <PinContext.Provider value={{
      accessLevel,
      pinSettings,
      loadingPins,
      verifyPin,
      logout,
      setAccessLevel: handleSetAccessLevel,
      updatePins,
      sendRecoveryCode,
      verifyRecoveryCode,
    }}>
      {children}
    </PinContext.Provider>
  );
}
