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

/** La página ya se abrió como app instalada (desde el ícono) */
function isStandalone(): boolean {
  return (
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    window.matchMedia('(display-mode: standalone)').matches
  );
}

/** iPhone/iPad sin la app instalada: Safari no ofrece el botón de instalar, hay que hacerlo a mano. */
export function useIosInstallable(): boolean {
  const [installable, setInstallable] = useState(false);
  useEffect(() => {
    const ua = navigator.userAgent;
    const isIos =
      /iPhone|iPad|iPod/.test(ua) ||
      // iPad con iPadOS se presenta como Mac
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setInstallable(isIos && !isStandalone());
  }, []);
  return installable;
}

/**
 * Android abierto en el navegador (no desde el ícono). Sirve para mostrar los pasos a mano
 * cuando el navegador no ofrece su aviso de instalar (p. ej. dentro de Facebook o Instagram,
 * o mientras Chrome todavía no lo da).
 */
export function useAndroidInstallable(): boolean {
  const [installable, setInstallable] = useState(false);
  useEffect(() => {
    setInstallable(/Android/i.test(navigator.userAgent) && !isStandalone());
  }, []);
  return installable;
}
