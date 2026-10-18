'use client';
import React from 'react';
import { X, Share, SquarePlus } from 'lucide-react';

// Pasos para instalar la app en iPhone/iPad (Safari no tiene botón de instalar)
export default function IosInstallModal({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      icon: <Share size={26} className="text-blue-600" />,
      text: (
        <>
          Toca el botón <strong>Compartir</strong> (el cuadrado con la flecha hacia arriba) en la
          barra de Safari.
        </>
      ),
    },
    {
      icon: <SquarePlus size={26} className="text-blue-600" />,
      text: (
        <>
          Baja y elige <strong>«Agregar a pantalla de inicio»</strong>.
        </>
      ),
    },
    {
      icon: (
        <span className="text-xs font-bold text-blue-600" aria-hidden="true">
          Agregar
        </span>
      ),
      text: (
        <>
          Toca <strong>Agregar</strong> arriba a la derecha. Listo: el ícono DyL Gestor queda en tu
          pantalla de inicio.
        </>
      ),
    },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex items-end lg:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="ios-install-title"
        className="relative w-full max-w-md bg-card rounded-t-3xl lg:rounded-2xl px-5 pt-4 pb-8 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="ios-install-title" className="text-lg font-bold text-foreground">
            Instalar la app en iPhone
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 flex items-center justify-center rounded-xl text-muted-foreground"
          >
            <X size={20} />
          </button>
        </div>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-4 bg-muted/50 rounded-2xl p-4">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="w-16 h-12 rounded-xl bg-card border border-border flex items-center justify-center shrink-0">
                {step.icon}
              </span>
              <p className="text-sm text-foreground leading-snug">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-muted-foreground">
          Si no ves «Agregar a pantalla de inicio», abre esta página en Safari.
        </p>
      </div>
    </div>
  );
}
