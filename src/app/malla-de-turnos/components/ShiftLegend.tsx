'use client';
import React, { useState } from 'react';
import { Clock, CalendarX } from 'lucide-react';
import { type Shift, useAppContext } from '@/context/AppContext';

interface Props {
  shifts: Record<string, Shift>;
}

export default function ShiftLegend({ shifts }: Props) {
  const { getAllNonWorkingTypes } = useAppContext();
  const nonWorkingTypes = getAllNonWorkingTypes();
  const items = Object.values(shifts);
  const [showSpecial, setShowSpecial] = useState(false);

  return (
    <div className="mt-4 space-y-2">
      {/* Shift legend */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mr-2">
            Leyenda de turnos
          </span>
          {items.map((item) => (
            <span
              key={`leg-${item.code}`}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${item.colorClass}`}
            >
              <Clock size={11} />
              {item.label}
              {item.start ? ` (${item.start} - ${item.end})` : ''}
            </span>
          ))}
        </div>
      </div>

      {/* Special days legend */}
      <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
        <button
          onClick={() => setShowSpecial((v) => !v)}
          className="flex items-center gap-2 w-full text-left"
        >
          <CalendarX size={14} className="text-muted-foreground" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            Días especiales (no cuentan horas) — {nonWorkingTypes.length} tipos
          </span>
          <span className="ml-auto text-xs text-muted-foreground">{showSpecial ? '▲' : '▼'}</span>
        </button>
        {showSpecial && (
          <div className="flex flex-wrap items-center gap-2 mt-3">
            {nonWorkingTypes
              .filter((t) => !t.legacy)
              .map((nwt) => (
                <span
                  key={`leg-nwt-${nwt.code}`}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold ${nwt.colorClass}`}
                >
                  <span>{nwt.icon}</span>
                  {nwt.label}
                  {nwt.maxDaysPerMonth !== null && (
                    <span className="opacity-60 font-normal ml-1">
                      máx. {nwt.maxDaysPerMonth}/mes
                    </span>
                  )}
                </span>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
