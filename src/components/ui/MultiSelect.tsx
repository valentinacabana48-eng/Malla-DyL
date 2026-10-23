'use client';
import React, { useState, useEffect, useRef } from 'react';

/** Selector con casillas para elegir varias opciones; sin ninguna marcada = todas */
export default function MultiSelect({
  label,
  icon: IconComp,
  options,
  selected,
  onChange,
  allLabel,
  className = 'flex flex-col gap-1 min-w-[160px] max-w-[260px]',
  labelClassName = 'text-[11px] font-semibold tracking-widest text-muted-foreground uppercase',
  buttonClassName = 'w-full py-2 bg-card border border-border rounded-lg text-sm font-medium text-foreground',
}: {
  label: string;
  icon?: React.ElementType;
  options: string[];
  selected: string[];
  onChange: (v: string[]) => void;
  allLabel: string;
  className?: string;
  labelClassName?: string;
  buttonClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const IconEl = IconComp as React.ElementType | undefined;

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggle = (opt: string) => {
    if (selected.includes(opt)) {
      onChange(selected.filter((h) => h !== opt));
    } else {
      onChange([...selected, opt]);
    }
  };

  const buttonLabel =
    selected.length === 0 || selected.length === options.length ? allLabel : selected.join(', ');

  return (
    <div className={className} ref={ref}>
      <span className={labelClassName}>{label}</span>
      <div className="relative">
        {IconEl && (
          <IconEl
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none z-10"
          />
        )}
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          title={buttonLabel}
          className={`${buttonClassName} ${IconEl ? 'pl-8' : 'pl-3'} pr-8 text-left focus:outline-none focus:ring-2 focus:ring-ring cursor-pointer truncate`}
        >
          {buttonLabel}
        </button>
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground">
          ▾
        </div>

        {open && (
          <div className="absolute z-50 top-full mt-1 left-0 w-full bg-card border border-border rounded-lg shadow-lg py-1 min-w-[200px] max-h-72 overflow-y-auto">
            <label className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={selected.length === 0}
                onChange={() => onChange([])}
                className="accent-primary"
              />
              {allLabel}
            </label>
            <div className="border-t border-border my-1" />
            {options.map((opt) => (
              <label
                key={opt}
                className="flex items-center gap-2 px-3 py-2 hover:bg-muted cursor-pointer text-sm font-medium text-foreground"
              >
                <input
                  type="checkbox"
                  checked={selected.includes(opt)}
                  onChange={() => toggle(opt)}
                  className="accent-primary"
                />
                {opt}
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
