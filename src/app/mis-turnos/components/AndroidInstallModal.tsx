'use client';
import React from 'react';
import { X, EllipsisVertical, Download } from 'lucide-react';

// Pasos para instalar Mis turnos en Android cuando el navegador no muestra su propio aviso
export default function AndroidInstallModal({ onClose }: { onClose: () => void }) {
  const steps = [
    {
      icon: <EllipsisVertical size={26} className="text-blue-600" />,
      text: (
        <>
          En Chrome, toca los <strong>3 puntitos</strong> arriba a la derecha.
        </>
      ),
    },
    {
      icon: <Download size={24} className="text-blue-600" />,
      text: (
        <>
          Elige <strong>«Instalar app»</strong> o <strong>«Agregar a la pantalla principal»</strong>.
        </>
      ),
    },
    {
      icon: (
        <span className="text-xs font-bold text-blue-600" aria-hidden="true">
          Instalar
        </span>
      ),
      text: (
        <>
          Toca <strong>Instalar</strong>. Listo: el ícono Mis turnos queda en tu celular.
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
        aria-labelledby="android-install-title"
        className="relative w-full max-w-md bg-white rounded-t-3xl lg:rounded-2xl px-5 pt-4 pb-8 shadow-2xl"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id="android-install-title" className="text-lg font-bold text-gray-900">
            Instalar la app en Android
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="w-11 h-11 flex items-center justify-center rounded-xl text-gray-500"
          >
            <X size={20} />
          </button>
        </div>
        <ol className="space-y-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-center gap-4 bg-slate-50 rounded-2xl p-4">
              <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-sm font-bold flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="w-16 h-12 rounded-xl bg-white border border-gray-200 flex items-center justify-center shrink-0">
                {step.icon}
              </span>
              <p className="text-sm text-gray-900 leading-snug">{step.text}</p>
            </li>
          ))}
        </ol>
        <p className="mt-4 text-xs text-gray-500">
          Si abriste el link desde Facebook, Instagram u otra app y no ves esas opciones, ábrelo
          en Chrome.
        </p>
        <p className="mt-2 text-xs text-gray-500">
          La primera vez que abras la app instalada, ingresa de nuevo con tu RUT y tu clave.
        </p>
      </div>
    </div>
  );
}
