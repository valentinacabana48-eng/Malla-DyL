'use client';
import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';

export interface MenuItem {
  label: string;
  /** Texto chico debajo del nombre */
  hint?: string;
  icon?: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

/** Botón que abre una lista de acciones (se cierra al elegir o al tocar fuera). */
export default function MenuButton({
  label,
  icon,
  items,
}: {
  label: string;
  icon?: React.ReactNode;
  items: MenuItem[];
}) {
  const [open, setOpen] = useState(false);
  // Abre hacia la derecha si cabe; si no, hacia la izquierda
  const [alignRight, setAlignRight] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('touchstart', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('touchstart', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => {
          const r = ref.current?.getBoundingClientRect();
          if (r) setAlignRight(r.left + 256 > window.innerWidth - 8);
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted transition-colors"
      >
        {icon}
        {label}
        <ChevronDown size={15} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div
          role="menu"
          className={`absolute ${alignRight ? 'right-0' : 'left-0'} z-40 mt-1.5 w-64 max-w-[calc(100vw-1rem)] bg-card border border-border rounded-xl shadow-xl py-1`}
        >
          {items.map((it) => (
            <button
              key={it.label}
              type="button"
              role="menuitem"
              disabled={it.disabled}
              onClick={() => {
                setOpen(false);
                it.onSelect();
              }}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {it.icon && <span className="mt-0.5 text-muted-foreground">{it.icon}</span>}
              <span className="flex flex-col">
                <span className="text-sm font-semibold text-foreground">{it.label}</span>
                {it.hint && <span className="text-xs text-muted-foreground">{it.hint}</span>}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
