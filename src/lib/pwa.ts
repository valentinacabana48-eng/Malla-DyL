'use client';
import { useEffect, useState } from 'react';

// El navegador dispara `beforeinstallprompt` una sola vez y muy temprano (antes del login),
// así que se guarda aquí para poder mostrar el botón "Instalar app" más tarde.
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

export function setupPwa() {
  if (typeof window === 'undefined') return;

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e as BeforeInstallPromptEvent;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });

  if ('serviceWorker' in navigator && process.env.NODE_ENV === 'production') {
    navigator.serviceWorker
      .register('/sw.js')
      .catch((err) => console.error('Service worker:', err));
  }
}

/** Devuelve una función para instalar la app, o null si el navegador no lo ofrece (o ya está instalada). */
export function useInstallPrompt(): (() => Promise<void>) | null {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);

  if (!deferredPrompt) return null;
  return async () => {
    const prompt = deferredPrompt;
    if (!prompt) return;
    await prompt.prompt();
    await prompt.userChoice;
    deferredPrompt = null;
    notify();
  };
}
