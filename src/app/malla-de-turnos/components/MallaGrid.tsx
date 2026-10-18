'use client';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { User, X, Zap, CheckSquare } from 'lucide-react';
import {
  type ShiftCode,
  type Shift,
  type Worker,
  type NonWorkingType,
  useAppContext,
} from '@/context/AppContext';
import { useReadonly } from '@/hooks/useReadonly';

interface Props {
  workers: Worker[];
  scheduleData: Record<string, ShiftCode[]>;
  specialDaysData: Record<string, Record<number, string>>;
  shifts: Record<string, Shift>;
  daysOfWeek: string[];
  daysInMonth: number;
  monthLabel: string;
  getAlerts: (workerId: string) => string[];
  getWeekUnderHours: (workerId: string) => Set<number>;
  onCellChange: (workerId: string, dayIndex: number, shift: ShiftCode) => void;
  onSpecialDayChange: (workerId: string, dayIndex: number, typeCode: string | null) => void;
  contractedHoursOverride: Record<string, number>;
  onContractedHoursChange: (workerId: string, hours: number) => void;
  holidayDayIndices?: Set<number>;
}

// ─── Helper: group shift codes by start hour ───────────────────────────────
function groupShiftsByHour(shifts: Record<string, Shift>): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  const noHour: string[] = [];

  Object.keys(shifts).forEach((code) => {
    const info = shifts[code];
    if (!info.start) {
      noHour.push(code);
      return;
    }
    const hour = info.start.split(':')[0];
    const label = `${parseInt(hour, 10)}:00`;
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(code);
  });

  const sorted = new Map([...groups.entries()].sort((a, b) => parseInt(a[0]) - parseInt(b[0])));

  if (noHour.length > 0) sorted.set('—', noHour);
  return sorted;
}

// ─── Grouped shift list for dropdowns ─────────────────────────────────────
function GroupedShiftOptions({
  shifts,
  excludeCode,
  onSelect,
}: {
  shifts: Record<string, Shift>;
  excludeCode?: ShiftCode;
  onSelect: (code: string) => void;
}) {
  const [expandedHour, setExpandedHour] = useState<string | null>(null);
  const groups = groupShiftsByHour(shifts);

  return (
    <>
      {[...groups.entries()].map(([hourLabel, codes]) => {
        const isExpanded = expandedHour === hourLabel;
        const filteredCodes = codes.filter((c) => c !== excludeCode);
        if (filteredCodes.length === 0) return null;

        if (filteredCodes.length === 1) {
          const s = filteredCodes[0];
          const info = shifts[s];
          return (
            <button
              key={`grp-single-${s}`}
              onClick={() => onSelect(s)}
              className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors ${info?.colorClass || ''}`}
            >
              {info ? `${s.toUpperCase()} ${info.start}–${info.end}` : s}
            </button>
          );
        }

        return (
          <div key={`grp-${hourLabel}`}>
            <button
              onClick={() => setExpandedHour(isExpanded ? null : hourLabel)}
              className="w-full text-left px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:bg-muted/40 transition-colors flex items-center justify-between"
            >
              <span>🕐 {hourLabel}</span>
              <span className="text-[10px] opacity-60">
                {isExpanded ? '▲' : '▼'} {filteredCodes.length}
              </span>
            </button>
            {isExpanded &&
              filteredCodes.map((s) => {
                const info = shifts[s];
                return (
                  <button
                    key={`grp-item-${s}`}
                    onClick={() => onSelect(s)}
                    className={`w-full text-left pl-6 pr-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors ${info?.colorClass || ''}`}
                  >
                    {info ? `${s.toUpperCase()} ${info.start}–${info.end}` : s}
                  </button>
                );
              })}
          </div>
        );
      })}
    </>
  );
}

// ─── Smart floating dropdown portal ───────────────────────────────────────
function SmartDropdown({
  anchorRef,
  open,
  onClose,
  children,
}: {
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useEffect(() => {
    if (!open || !anchorRef.current) return;

    const anchor = anchorRef.current.getBoundingClientRect();
    const dropH = dropRef.current?.offsetHeight || 320;
    const dropW = dropRef.current?.offsetWidth || 180;
    const vp = { w: window.innerWidth, h: window.innerHeight };

    // Always open to the right of the cell
    let left = anchor.right + 2;

    let top = anchor.top;
    if (top + dropH > vp.h - 8) top = vp.h - dropH - 8;
    if (top < 8) top = 8;

    // If dropdown overflows right edge, clamp it (but never go left of anchor)
    if (left + dropW > vp.w - 8) left = vp.w - dropW - 8;
    if (left < anchor.right + 2) left = anchor.right + 2;

    setStyle({ position: 'fixed', top, left, zIndex: 9999, visibility: 'visible' });
  }, [open, anchorRef]);

  // Recalculate when content changes (e.g. after first render gives real height)
  useEffect(() => {
    if (!open || !anchorRef.current || !dropRef.current) return;
    const anchor = anchorRef.current.getBoundingClientRect();
    const dropH = dropRef.current.offsetHeight;
    const dropW = dropRef.current.offsetWidth;
    const vp = { w: window.innerWidth, h: window.innerHeight };

    // Always open to the right of the cell
    let left = anchor.right + 2;

    let top = anchor.top;
    if (top + dropH > vp.h - 8) top = vp.h - dropH - 8;
    if (top < 8) top = 8;
    if (left + dropW > vp.w - 8) left = vp.w - dropW - 8;
    if (left < anchor.right + 2) left = anchor.right + 2;

    setStyle({ position: 'fixed', top, left, zIndex: 9999, visibility: 'visible' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        dropRef.current &&
        !dropRef.current.contains(e.target as Node) &&
        anchorRef.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open, onClose, anchorRef]);

  if (!open) return null;

  return ReactDOM.createPortal(
    <div
      ref={dropRef}
      style={style}
      className="bg-card border border-border rounded-lg shadow-xl py-1 min-w-[160px] max-h-[70vh] overflow-y-auto animate-fade-in"
    >
      {children}
    </div>,
    document.body
  );
}

// ─── Individual ShiftCell (normal mode — no active shift selected) ─────────
function ShiftCell({
  workerId,
  dayIndex,
  shift,
  specialDay,
  shifts,
  nonWorkingTypes,
  onCellChange,
  onSpecialDayChange,
  isUnderHoursWeek,
}: {
  workerId: string;
  dayIndex: number;
  shift: ShiftCode;
  specialDay: string | undefined;
  shifts: Record<string, Shift>;
  nonWorkingTypes: NonWorkingType[];
  onCellChange: (wid: string, di: number, s: ShiftCode) => void;
  onSpecialDayChange: (wid: string, di: number, typeCode: string | null) => void;
  isUnderHoursWeek?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const isReadonly = useReadonly();
  const warnClass = isUnderHoursWeek ? 'bg-amber-50/70' : '';
  const warnStyle = isUnderHoursWeek
    ? { boxShadow: 'inset 0 0 0 1px rgba(245,158,11,0.25)' }
    : undefined;

  if (specialDay) {
    const nwt = nonWorkingTypes.find((t) => t.code === specialDay);
    return (
      <td
        className={`border-r border-border/50 px-0.5 py-0.5 min-w-[44px] text-center relative ${warnClass}`}
        style={warnStyle}
      >
        <button
          ref={btnRef}
          onClick={() => !isReadonly && setOpen(!open)}
          className={`inline-flex flex-col items-center px-0.5 py-0.5 rounded text-[10px] font-bold leading-tight w-full transition-opacity ${isReadonly ? 'cursor-default' : 'cursor-pointer hover:opacity-80'} ${nwt?.colorClass || 'bg-slate-100 text-slate-700 border border-slate-300'}`}
          title={nwt?.label || specialDay}
        >
          <span>{nwt?.icon || '📌'}</span>
          <span className="font-normal opacity-80 text-[8px]">
            {nwt?.label?.slice(0, 4).toUpperCase() || specialDay.slice(0, 4)}
          </span>
        </button>
        {!isReadonly && (
          <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
            <button
              onClick={() => {
                onSpecialDayChange(workerId, dayIndex, null);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
            >
              Limpiar
            </button>
            <div className="border-t border-border/50 my-1" />
            <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Turnos
            </p>
            <GroupedShiftOptions
              shifts={shifts}
              onSelect={(s) => {
                onSpecialDayChange(workerId, dayIndex, null);
                onCellChange(workerId, dayIndex, s);
                setOpen(false);
              }}
            />
            <div className="border-t border-border/50 my-1" />
            <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Días especiales
            </p>
            {nonWorkingTypes
              .filter((t) => t.code !== specialDay)
              .map((nwt) => (
                <button
                  key={`cell-nwt-${nwt.code}`}
                  onClick={() => {
                    onSpecialDayChange(workerId, dayIndex, nwt.code);
                    setOpen(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors flex items-center gap-1.5`}
                >
                  <span>{nwt.icon}</span>
                  <span
                    className={
                      nwt.colorClass.includes('text-')
                        ? nwt.colorClass.split(' ').find((c) => c.startsWith('text-')) || ''
                        : ''
                    }
                  >
                    {nwt.label}
                  </span>
                </button>
              ))}
          </SmartDropdown>
        )}
      </td>
    );
  }

  if (!shift) {
    return (
      <td
        className={`border-r border-border/50 px-0.5 py-0.5 min-w-[44px] text-center relative ${warnClass}`}
        style={warnStyle}
      >
        <button
          ref={btnRef}
          onClick={() => !isReadonly && setOpen(!open)}
          className={`w-full h-6 rounded transition-colors text-muted-foreground/40 text-xs ${isReadonly ? 'cursor-default' : 'hover:bg-muted/60 cursor-pointer'}`}
          title={isReadonly ? 'Solo lectura' : 'Asignar turno'}
        >
          —
        </button>
        {!isReadonly && (
          <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
            <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Turnos
            </p>
            <GroupedShiftOptions
              shifts={shifts}
              onSelect={(s) => {
                onCellChange(workerId, dayIndex, s);
                setOpen(false);
              }}
            />
            <div className="border-t border-border/50 my-1" />
            <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
              Días especiales
            </p>
            {nonWorkingTypes.map((nwt) => (
              <button
                key={`cell-nwt-${nwt.code}`}
                onClick={() => {
                  onSpecialDayChange(workerId, dayIndex, nwt.code);
                  setOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors flex items-center gap-1.5"
              >
                <span>{nwt.icon}</span>
                <span>{nwt.label}</span>
              </button>
            ))}
          </SmartDropdown>
        )}
      </td>
    );
  }

  // DESC (descanso) is not stored in the Supabase shifts table — provide a fallback so it always renders
  const shiftInfo = shifts[shift as string] ?? undefined;
  if (!shiftInfo) return <td className="border-r border-border/50 px-0.5 py-0.5 min-w-[44px]" />;

  return (
    <td
      className={`border-r border-border/50 px-0.5 py-0.5 min-w-[44px] text-center relative ${warnClass}`}
      style={warnStyle}
    >
      <button
        ref={btnRef}
        onClick={() => !isReadonly && setOpen(!open)}
        className={`inline-flex flex-col items-center px-0.5 py-0.5 rounded text-[10px] font-bold leading-tight w-full transition-opacity ${isReadonly ? 'cursor-default' : 'cursor-pointer hover:opacity-80'} ${shiftInfo.colorClass}`}
        title={`${shiftInfo.start}–${shiftInfo.end}`}
      >
        <span>{shiftInfo.code?.toUpperCase()}</span>
        {shiftInfo.start && <span className="font-normal opacity-70">{shiftInfo.start}</span>}
      </button>
      {!isReadonly && (
        <SmartDropdown anchorRef={btnRef} open={open} onClose={() => setOpen(false)}>
          <button
            onClick={() => {
              onCellChange(workerId, dayIndex, null);
              setOpen(false);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-muted-foreground hover:bg-muted/50 transition-colors"
          >
            Limpiar
          </button>
          <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Turnos
          </p>
          <GroupedShiftOptions
            shifts={shifts}
            excludeCode={shift}
            onSelect={(s) => {
              onCellChange(workerId, dayIndex, s);
              setOpen(false);
            }}
          />
          <div className="border-t border-border/50 my-1" />
          <p className="px-3 py-1 text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
            Días especiales
          </p>
          {nonWorkingTypes.map((nwt) => (
            <button
              key={`cell-nwt-${nwt.code}`}
              onClick={() => {
                onCellChange(workerId, dayIndex, null);
                onSpecialDayChange(workerId, dayIndex, nwt.code);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-1.5 text-xs font-medium hover:bg-muted/50 transition-colors flex items-center gap-1.5"
            >
              <span>{nwt.icon}</span>
              <span>{nwt.label}</span>
            </button>
          ))}
        </SmartDropdown>
      )}
    </td>
  );
}

// ─── Block-mode cell: click to toggle selection ────────────────────────────
function BlockModeCell({
  workerId,
  dayIndex,
  shift,
  specialDay,
  shifts,
  nonWorkingTypes,
  isSelected,
  onToggle,
  isUnderHoursWeek,
}: {
  workerId: string;
  dayIndex: number;
  shift: ShiftCode;
  specialDay: string | undefined;
  shifts: Record<string, Shift>;
  nonWorkingTypes: NonWorkingType[];
  isSelected: boolean;
  onToggle: (wid: string, di: number) => void;
  isUnderHoursWeek?: boolean;
}) {
  let content: React.ReactNode;
  let baseClass = '';

  if (specialDay) {
    const nwt = nonWorkingTypes.find((t) => t.code === specialDay);
    baseClass = nwt?.colorClass || 'bg-slate-100 text-slate-700';
    content = (
      <>
        <span>{nwt?.icon || '📌'}</span>
        <span className="font-normal opacity-80 text-[8px]">
          {nwt?.label?.slice(0, 4).toUpperCase() || specialDay.slice(0, 4)}
        </span>
      </>
    );
  } else if (shift) {
    const shiftInfo = shifts[shift as string] ?? undefined;
    baseClass = shiftInfo?.colorClass || '';
    content = (
      <>
        <span>{shift?.toUpperCase()}</span>
        {shiftInfo?.start && <span className="font-normal opacity-70">{shiftInfo.start}</span>}
      </>
    );
  } else {
    content = <span className="text-muted-foreground/30">—</span>;
  }

  const warnBg = isUnderHoursWeek && !isSelected ? 'bg-amber-50/70' : '';
  const warnStyle =
    isUnderHoursWeek && !isSelected
      ? { boxShadow: 'inset 0 0 0 1px rgba(245,158,11,0.25)' }
      : undefined;

  return (
    <td
      className={`border-r border-border/50 px-0.5 py-1 min-w-[52px] text-center relative cursor-pointer select-none transition-all
        ${
          isSelected
            ? 'ring-2 ring-inset ring-emerald-500 bg-emerald-50/60'
            : `hover:ring-2 hover:ring-inset hover:ring-emerald-300 hover:bg-emerald-50/20 ${warnBg}`
        }`}
      style={warnStyle}
      onClick={() => onToggle(workerId, dayIndex)}
      title={isSelected ? 'Clic para deseleccionar' : 'Clic para seleccionar'}
    >
      <div
        className={`inline-flex flex-col items-center px-1 py-0.5 rounded text-[10px] font-bold leading-tight w-full ${isSelected ? 'opacity-70' : ''} ${baseClass}`}
      >
        {content}
      </div>
      {isSelected && (
        <span className="absolute top-0.5 right-0.5 w-2.5 h-2.5 bg-emerald-500 rounded-full flex items-center justify-center">
          <span className="text-white text-[7px] font-bold">✓</span>
        </span>
      )}
    </td>
  );
}

// ─── Floating Shift Selector Panel (draggable, block mode) ────────────────
function FloatingShiftPanel({
  shifts,
  nonWorkingTypes,
  activeShift,
  activeSpecialDay,
  onSelectShift,
  onSelectSpecialDay,
  onClose,
  selectedCount,
  onApply,
  onClearSelection,
}: {
  shifts: Record<string, Shift>;
  nonWorkingTypes: NonWorkingType[];
  activeShift: ShiftCode;
  activeSpecialDay: string | undefined;
  onSelectShift: (code: ShiftCode) => void;
  onSelectSpecialDay: (code: string | undefined) => void;
  onClose: () => void;
  selectedCount: number;
  onApply: () => void;
  onClearSelection: () => void;
}) {
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [initialized, setInitialized] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [openHour, setOpenHour] = useState<string | null>(null);
  const dragStart = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Initialize position: top-center of viewport
  useEffect(() => {
    const panelW = 480;
    const x = Math.max(8, (window.innerWidth - panelW) / 2);
    const y = 12;
    setPos({ x, y });
    setInitialized(true);
  }, []);

  const clampPos = useCallback((x: number, y: number) => {
    const panelW = panelRef.current?.offsetWidth || 480;
    const panelH = panelRef.current?.offsetHeight || 52;
    const maxX = window.innerWidth - panelW - 8;
    const maxY = window.innerHeight - panelH - 8;
    return {
      x: Math.max(8, Math.min(x, maxX)),
      y: Math.max(8, Math.min(y, maxY)),
    };
  }, []);

  // Mouse drag
  const onMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    dragStart.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      if (!dragStart.current) return;
      const dx = e.clientX - dragStart.current.mx;
      const dy = e.clientY - dragStart.current.my;
      setPos(clampPos(dragStart.current.px + dx, dragStart.current.py + dy));
    };
    const onUp = () => {
      setDragging(false);
      dragStart.current = null;
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [dragging, clampPos]);

  // Touch drag
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    dragStart.current = { mx: t.clientX, my: t.clientY, px: pos.x, py: pos.y };
    setDragging(true);
  };

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: TouchEvent) => {
      if (!dragStart.current) return;
      const t = e.touches[0];
      const dx = t.clientX - dragStart.current.mx;
      const dy = t.clientY - dragStart.current.my;
      setPos(clampPos(dragStart.current.px + dx, dragStart.current.py + dy));
    };
    const onUp = () => {
      setDragging(false);
      dragStart.current = null;
    };
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };
  }, [dragging, clampPos]);

  // Build groups: hour label → shift codes
  const groups = groupShiftsByHour(shifts);

  if (!initialized) return null;

  return (
    <div
      ref={panelRef}
      className="fixed z-[9998] select-none"
      style={{ left: pos.x, top: pos.y, touchAction: 'none' }}
    >
      <div
        className={`bg-card border-2 shadow-2xl rounded-2xl flex flex-col ${dragging ? 'cursor-grabbing border-emerald-400' : 'border-border'}`}
        style={{ minWidth: 320, maxWidth: 520, maxHeight: 'calc(100vh - 24px)' }}
      >
        {/* ── Header ── */}
        <div className="border-b border-border/60 bg-muted/30">
          {/* Top row: drag + title + apply/counter + close */}
          <div className="flex items-center gap-2 px-3 py-2">
            {/* Drag handle */}
            <span
              onMouseDown={onMouseDown}
              onTouchStart={onTouchStart}
              className="cursor-grab active:cursor-grabbing text-muted-foreground hover:text-foreground shrink-0"
              title="Mover panel"
            >
              <svg width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
                <circle cx="3" cy="2" r="1.2" />
                <circle cx="7" cy="2" r="1.2" />
                <circle cx="3" cy="7" r="1.2" />
                <circle cx="7" cy="7" r="1.2" />
                <circle cx="3" cy="12" r="1.2" />
                <circle cx="7" cy="12" r="1.2" />
              </svg>
            </span>

            <Zap size={11} className="text-secondary shrink-0" />
            <span className="text-[11px] font-bold text-foreground flex-1">Asignación rápida</span>

            {/* Apply / counter */}
            {activeShift !== undefined && selectedCount > 0 && (
              <>
                <span className="text-[10px] text-emerald-600 font-semibold whitespace-nowrap bg-emerald-50 border border-emerald-200 rounded-full px-1.5 py-0.5">
                  {selectedCount} sel.
                </span>
                <button
                  onClick={onApply}
                  className="flex items-center gap-1 bg-emerald-500 hover:bg-emerald-600 text-white px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors whitespace-nowrap"
                >
                  <CheckSquare size={11} />
                  Aplicar
                </button>
                <button
                  onClick={onClearSelection}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded transition-colors whitespace-nowrap"
                >
                  Limpiar sel.
                </button>
              </>
            )}
            {activeShift !== undefined && selectedCount === 0 && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                {activeShift === null
                  ? 'Selecciona celdas a limpiar'
                  : 'Selecciona celdas → Aplicar'}
              </span>
            )}
            {activeSpecialDay !== undefined && selectedCount > 0 && (
              <>
                <span className="text-[10px] text-purple-600 font-semibold whitespace-nowrap bg-purple-50 border border-purple-200 rounded-full px-1.5 py-0.5">
                  {selectedCount} sel.
                </span>
                <button
                  onClick={onApply}
                  className="flex items-center gap-1 bg-purple-500 hover:bg-purple-600 text-white px-2.5 py-1 rounded-full text-[11px] font-bold transition-colors whitespace-nowrap"
                >
                  <CheckSquare size={11} />
                  Aplicar
                </button>
                <button
                  onClick={onClearSelection}
                  className="text-[10px] text-muted-foreground hover:text-foreground px-1 py-0.5 rounded transition-colors whitespace-nowrap"
                >
                  Limpiar sel.
                </button>
              </>
            )}
            {activeSpecialDay !== undefined && selectedCount === 0 && (
              <span className="text-[10px] text-muted-foreground whitespace-nowrap">
                Selecciona celdas → Aplicar
              </span>
            )}

            {/* Close */}
            <button
              onClick={onClose}
              className="p-0.5 hover:bg-muted rounded-full transition-colors text-muted-foreground hover:text-foreground shrink-0"
              title="Cerrar"
            >
              <X size={12} />
            </button>
          </div>

          {/* Pills row: limpiar + descanso + special days */}
          <div className="flex items-center gap-1.5 px-3 pb-2 flex-wrap">
            {/* Clear pill */}
            <button
              onClick={() =>
                onSelectShift(activeShift === null ? (undefined as unknown as ShiftCode) : null)
              }
              title="Modo limpiar celda"
              className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all whitespace-nowrap ${
                activeShift === null
                  ? 'border-emerald-500 ring-2 ring-emerald-300 bg-slate-200 text-slate-700'
                  : 'border-transparent hover:border-border/60 bg-slate-100 text-slate-500'
              }`}
            >
              ✕ Limpiar
            </button>

            {/* Special day pills */}
            {nonWorkingTypes
              .filter((nwt) => nwt.code !== 'DESC')
              .map((nwt) => (
                <button
                  key={`qp-nwt-${nwt.code}`}
                  onClick={() =>
                    onSelectSpecialDay(activeSpecialDay === nwt.code ? undefined : nwt.code)
                  }
                  title={`Modo ${nwt.label}`}
                  className={`px-2 py-0.5 rounded-full text-[11px] font-bold border transition-all whitespace-nowrap ${
                    activeSpecialDay === nwt.code
                      ? 'border-purple-500 ring-2 ring-purple-300 bg-purple-100 text-purple-700'
                      : 'border-transparent hover:border-border/60 bg-purple-50 text-purple-500'
                  }`}
                >
                  {nwt.icon} {nwt.label}
                </button>
              ))}
          </div>
        </div>

        {/* ── Hour groups ── */}
        <div className="px-2 py-2 flex flex-col gap-1 flex-1 min-h-0 overflow-y-auto">
          {[...groups.entries()].map(([hourLabel, codes]) => {
            const isOpen = openHour === hourLabel;
            const hourNum = hourLabel === '—' ? '—' : hourLabel.replace(':00', '');

            return (
              <div
                key={`fp-grp-${hourLabel}`}
                className="rounded-xl border border-border/50 overflow-hidden"
              >
                {/* Hour header button */}
                <button
                  onClick={() => setOpenHour(isOpen ? null : hourLabel)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors ${
                    isOpen ? 'bg-secondary/10 border-b border-border/40' : 'hover:bg-muted/40'
                  }`}
                >
                  <span
                    className={`text-sm font-bold min-w-[28px] ${isOpen ? 'text-secondary' : 'text-foreground'}`}
                  >
                    {hourNum}
                  </span>
                  <span className="text-[10px] text-muted-foreground flex-1">
                    {hourLabel === '—'
                      ? 'Sin hora'
                      : `${codes.length} turno${codes.length !== 1 ? 's' : ''}`}
                  </span>
                  {/* Preview chips (collapsed) */}
                  {!isOpen && (
                    <div className="flex items-center gap-0.5 flex-wrap max-w-[200px]">
                      {codes.slice(0, 4).map((c) => {
                        const info = shifts[c];
                        return (
                          <span
                            key={`prev-${c}`}
                            className={`px-1.5 py-0 rounded-full text-[10px] font-bold border border-transparent ${info?.colorClass || 'bg-slate-100 text-slate-600'}`}
                          >
                            {c.toUpperCase()}
                          </span>
                        );
                      })}
                      {codes.length > 4 && (
                        <span className="text-[10px] text-muted-foreground">
                          +{codes.length - 4}
                        </span>
                      )}
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {isOpen ? '▲' : '▼'}
                  </span>
                </button>

                {/* Expanded shift pills */}
                {isOpen && (
                  <div className="flex flex-wrap gap-1.5 px-3 py-2 bg-muted/10">
                    {codes.map((c) => {
                      const info = shifts[c];
                      const isActive = activeShift === c;
                      return (
                        <button
                          key={`fp-shift-${c}`}
                          onClick={() =>
                            onSelectShift(
                              isActive ? (undefined as unknown as ShiftCode) : (c as ShiftCode)
                            )
                          }
                          title={info?.start ? `${info.start}–${info.end}` : c}
                          className={`flex flex-col items-center px-2.5 py-1 rounded-xl text-[11px] font-bold border transition-all ${
                            isActive
                              ? 'border-emerald-500 ring-2 ring-emerald-300 scale-105 shadow-sm ' +
                                (info?.colorClass || '')
                              : 'border-transparent hover:border-border/60 hover:scale-105 ' +
                                (info?.colorClass || 'bg-slate-100 text-slate-700')
                          }`}
                        >
                          <span>{c.toUpperCase()}</span>
                          {info?.start && (
                            <span className="text-[9px] font-normal opacity-70">
                              {info.start}–{info.end}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function MallaGrid({
  workers,
  scheduleData,
  specialDaysData,
  shifts,
  daysOfWeek,
  daysInMonth,
  monthLabel,
  getAlerts,
  getWeekUnderHours,
  onCellChange,
  onSpecialDayChange,
  contractedHoursOverride,
  onContractedHoursChange,
  holidayDayIndices = new Set(),
}: Props) {
  const {
    getAllNonWorkingTypes,
    setCellShift: ctxSetCellShift,
    setSpecialDay: ctxSetSpecialDay,
    scheduleData: fullScheduleData,
    specialDays: fullSpecialDays,
    selectedMes,
    bulkAssign,
    bulkAssignSpecialDay,
  } = useAppContext();
  const nonWorkingTypes = getAllNonWorkingTypes();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const [tooltip, setTooltip] = useState<{ x: number; y: number; alerts: string[] } | null>(null);
  const [expandedWeekBreakdown, setExpandedWeekBreakdown] = useState<Set<string>>(new Set());
  const [expandedWeeklyHours, setExpandedWeeklyHours] = useState<Set<string>>(new Set());

  // ─── Floating panel state ──────────────────────────────────────────────
  const [panelOpen, setPanelOpen] = useState(false);
  // undefined = panel closed/no mode; null = "limpiar" mode; string = shift code
  const [activeShift, setActiveShift] = useState<ShiftCode | undefined>(undefined);
  const [activeSpecialDay, setActiveSpecialDay] = useState<string | undefined>(undefined);

  // Block mode: set of "workerId-dayIndex" keys
  const [selectedCells, setSelectedCells] = useState<Set<string>>(new Set());

  const handleSelectShift = useCallback((code: ShiftCode) => {
    setActiveShift(code);
    setActiveSpecialDay(undefined);
    // Do NOT reset selectedCells here — user may have already selected cells before choosing a shift
  }, []);

  const handleSelectSpecialDay = useCallback((code: string | undefined) => {
    setActiveSpecialDay(code);
    setActiveShift(undefined);
    // Do NOT reset selectedCells here — user may have already selected cells before choosing a special day
  }, []);

  const handleToggleCell = useCallback((workerId: string, dayIndex: number) => {
    const key = `${workerId}-${dayIndex}`;
    setSelectedCells((prev) => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  }, []);

  const handleApply = useCallback(() => {
    // Group selected cells by workerId → list of dayIndices
    const workerDayMap = new Map<string, number[]>();
    selectedCells.forEach((key) => {
      const lastDash = key.lastIndexOf('-');
      const workerId = key.substring(0, lastDash);
      const dayIndex = parseInt(key.substring(lastDash + 1), 10);
      if (!workerDayMap.has(workerId)) workerDayMap.set(workerId, []);
      workerDayMap.get(workerId)!.push(dayIndex);
    });

    const workerIds = [...workerDayMap.keys()];
    // Collect all unique day indices across all workers
    const allDayIndices = [...new Set([...workerDayMap.values()].flat())];

    if (activeSpecialDay !== undefined) {
      // Use bulkAssignSpecialDay for atomic multi-worker, multi-day assignment
      bulkAssignSpecialDay(workerIds, allDayIndices, activeSpecialDay);
    } else {
      // Use bulkAssign for atomic multi-worker, multi-day shift assignment
      bulkAssign(workerIds, allDayIndices, activeShift ?? null);
    }
    setSelectedCells(new Set());
  }, [selectedCells, activeShift, activeSpecialDay, bulkAssign, bulkAssignSpecialDay]);

  const handleClearSelection = useCallback(() => {
    setSelectedCells(new Set());
  }, []);

  const openPanel = () => {
    setPanelOpen(true);
    setActiveShift(undefined);
    setActiveSpecialDay(undefined);
    setSelectedCells(new Set());
  };

  const closePanel = () => {
    setPanelOpen(false);
    setActiveShift(undefined);
    setActiveSpecialDay(undefined);
    setSelectedCells(new Set());
  };

  // ─── Dual scrollbar refs ───────────────────────────────────────────────
  const topScrollRef = useRef<HTMLDivElement>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const gridWrapperRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const floatingHeaderScrollRef = useRef<HTMLDivElement>(null);
  const [fixedScrollLeft, setFixedScrollLeft] = useState(0);
  const [fixedScrollWidth, setFixedScrollWidth] = useState(0);
  const [gridRect, setGridRect] = useState<{ left: number; width: number } | null>(null);
  const [showFixedBar, setShowFixedBar] = useState(false);
  const [showFloatingHeader, setShowFloatingHeader] = useState(false);
  const [floatingHeaderLeft, setFloatingHeaderLeft] = useState(0);
  const [floatingHeaderWidth, setFloatingHeaderWidth] = useState(0);

  const handleTopScroll = useCallback(() => {
    if (gridScrollRef.current && topScrollRef.current) {
      gridScrollRef.current.scrollLeft = topScrollRef.current.scrollLeft;
    }
  }, []);

  const handleGridScroll = useCallback(() => {
    if (topScrollRef.current && gridScrollRef.current) {
      topScrollRef.current.scrollLeft = gridScrollRef.current.scrollLeft;
    }
    if (gridScrollRef.current) {
      setFixedScrollLeft(gridScrollRef.current.scrollLeft);
    }
    // Sync floating header scroll position
    if (floatingHeaderScrollRef.current && gridScrollRef.current) {
      floatingHeaderScrollRef.current.scrollLeft = gridScrollRef.current.scrollLeft;
    }
  }, []);

  // Update fixed scrollbar geometry on resize/scroll
  useEffect(() => {
    const updateGeometry = () => {
      const wrapper = gridScrollRef.current;
      if (!wrapper) return;
      const rect = wrapper.getBoundingClientRect();
      setGridRect({ left: rect.left, width: rect.width });
      setFixedScrollWidth(wrapper.scrollWidth);
      // Show fixed bar only when grid bottom is below viewport
      const isGridBottomBelowViewport = rect.bottom > window.innerHeight;
      const isGridTopAboveViewport = rect.top < window.innerHeight;
      setShowFixedBar(isGridBottomBelowViewport && isGridTopAboveViewport);

      // Show floating header when thead has scrolled above viewport
      const thead = theadRef.current;
      if (thead) {
        const theadRect = thead.getBoundingClientRect();
        const shouldShow = theadRect.bottom < 0;
        setShowFloatingHeader(shouldShow);
        setFloatingHeaderLeft(rect.left);
        setFloatingHeaderWidth(rect.width);
        // Sync scroll position when showing
        if (shouldShow && floatingHeaderScrollRef.current) {
          floatingHeaderScrollRef.current.scrollLeft = wrapper.scrollLeft;
        }
      }
    };

    updateGeometry();
    window.addEventListener('scroll', updateGeometry, { passive: true });
    window.addEventListener('resize', updateGeometry, { passive: true });

    const ro = new ResizeObserver(updateGeometry);
    if (gridScrollRef.current) ro.observe(gridScrollRef.current);

    return () => {
      window.removeEventListener('scroll', updateGeometry);
      window.removeEventListener('resize', updateGeometry);
      ro.disconnect();
    };
  }, []);

  const handleFixedScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    if (gridScrollRef.current) {
      gridScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
    if (topScrollRef.current) {
      topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
    }
  }, []);

  // ─── Sync scroll width ─────────────────────────────────────────────────
  const [tableScrollWidth, setTableScrollWidth] = useState(0);
  useEffect(() => {
    const grid = gridScrollRef.current;
    if (!grid) return;
    const update = () => setTableScrollWidth(grid.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(grid);
    return () => ro.disconnect();
  }, []);

  // ─── Compute leading/trailing days ────────────────────────────────────
  const MONTH_NAMES_MAP: Record<string, number> = {
    Enero: 0,
    Febrero: 1,
    Marzo: 2,
    Abril: 3,
    Mayo: 4,
    Junio: 5,
    Julio: 6,
    Agosto: 7,
    Septiembre: 8,
    Octubre: 9,
    Noviembre: 10,
    Diciembre: 11,
  };
  const DOW_LETTERS = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const parts = (monthLabel || '').split(' ');
  const monthIdx = MONTH_NAMES_MAP[parts[0]] ?? 7;
  const year = parseInt(parts[1] || '2026', 10);

  const firstDayJS = new Date(year, monthIdx, 1).getDay();
  const leadingCount = (firstDayJS + 6) % 7;
  const prevMonthLastDay = new Date(year, monthIdx, 0).getDate();

  // Compute prev/next month keys for cross-month cell editing
  const prevYear = monthIdx === 0 ? year - 1 : year;
  const prevMonthIdx = monthIdx === 0 ? 11 : monthIdx - 1;
  const prevMonthKey = `${prevYear}-${String(prevMonthIdx + 1).padStart(2, '0')}`;

  const nextYear = monthIdx === 11 ? year + 1 : year;
  const nextMonthIdx = monthIdx === 11 ? 0 : monthIdx + 1;
  const nextMonthKey = `${nextYear}-${String(nextMonthIdx + 1).padStart(2, '0')}`;

  const leadingDays = Array.from({ length: leadingCount }, (_, i) => {
    const dayNum = prevMonthLastDay - leadingCount + 1 + i;
    const jsDay = new Date(prevYear, prevMonthIdx, dayNum).getDay();
    const dayIndex = dayNum - 1; // 0-based index in prev month's 31-slot array
    return { day: dayNum, dow: DOW_LETTERS[jsDay], dayIndex };
  });

  const lastDayJS = new Date(year, monthIdx, daysInMonth).getDay();
  const lastDayMonBased = (lastDayJS + 6) % 7;
  const trailingCount = lastDayMonBased === 6 ? 0 : (6 - lastDayMonBased + 7) % 7;

  const trailingDays = Array.from({ length: trailingCount }, (_, i) => {
    const dayNum = i + 1;
    const jsDay = new Date(nextYear, nextMonthIdx, dayNum).getDay();
    const dayIndex = i; // 0-based index in next month's 31-slot array
    return { day: dayNum, dow: DOW_LETTERS[jsDay], dayIndex };
  });

  // ─── Per-worker summary: weekly hours per week + sunday count ─────────
  const getWorkerSummary = useCallback(
    (
      workerId: string
    ): {
      weeklyHours: {
        key: number;
        hours: number;
        weekNum: number;
        daysInWeek: number;
        scheduledDays: number;
      }[];
      sundayCount: number;
      totalHours: number;
      firstWeekKey: number | null;
      lastWeekKey: number | null;
      firstWeekPrevHours: number;
      lastWeekNextHours: number;
    } => {
      const sched = scheduleData[workerId] || [];
      const workerSpecialDays = specialDaysData[workerId] || {};

      const MONTH_NAMES_MAP: Record<string, number> = {
        Enero: 0,
        Febrero: 1,
        Marzo: 2,
        Abril: 3,
        Mayo: 4,
        Junio: 5,
        Julio: 6,
        Agosto: 7,
        Septiembre: 8,
        Octubre: 9,
        Noviembre: 10,
        Diciembre: 11,
      };
      const parts = (monthLabel || '').split(' ');
      const monthIdx = MONTH_NAMES_MAP[parts[0]] ?? 7;
      const year = parseInt(parts[1] || '2026', 10);

      const weekHoursMap: Map<number, number> = new Map();
      const weekDaysMap: Map<number, number> = new Map();
      const weekScheduledDaysMap: Map<number, number> = new Map();
      let sundayCount = 0;
      let totalHours = 0;

      // Build month-clipped weeks: week starts at day 1 (or Monday of the week containing day 1),
      // clipped to month boundaries. Each week ends on Sunday or end of month.
      const monthClippedWeeks: { startDay: number; endDay: number; key: number }[] = [];
      let wd = 1;
      while (wd <= daysInMonth) {
        const date = new Date(year, monthIdx, wd);
        const dow = (date.getDay() + 6) % 7; // 0=Mon, 6=Sun
        const weekMonday = wd - dow;
        const weekSunday = weekMonday + 6;
        const startDay = Math.max(1, weekMonday);
        const endDay = Math.min(daysInMonth, weekSunday);
        monthClippedWeeks.push({ startDay, endDay, key: startDay });
        wd = endDay + 1;
      }

      // Helper: get the month-clipped week key for a given 1-based day number
      const getMonthWeekKey = (dayNum: number): number => {
        const week = monthClippedWeeks.find((w) => dayNum >= w.startDay && dayNum <= w.endDay);
        return week ? week.key : 1;
      };

      for (let i = 0; i < daysInMonth; i++) {
        const isSpecial = !!workerSpecialDays[i];
        const dow = daysOfWeek[i];

        if (dow === 'D' && (isSpecial || !sched[i] || sched[i] === 'DESC')) {
          sundayCount++;
        }

        const dayNum = i + 1;
        const weekKey = getMonthWeekKey(dayNum);
        // Track how many calendar days of this month fall in this week
        weekDaysMap.set(weekKey, (weekDaysMap.get(weekKey) || 0) + 1);

        if (isSpecial || !sched[i] || sched[i] === 'DESC') continue;
        const shiftInfo = shifts[sched[i] as string];
        if (!shiftInfo || !shiftInfo.start || !shiftInfo.end) continue;

        const [sh, sm] = shiftInfo.start.split(':').map(Number);
        const [eh, em] = shiftInfo.end.split(':').map(Number);
        let mins = eh * 60 + em - (sh * 60 + sm);
        if (mins < 0) mins += 24 * 60;
        let hrs = mins / 60;
        const col = (shiftInfo as { colacion?: number }).colacion;
        if (col && col > 0) hrs -= col / 60;

        totalHours += hrs;

        weekHoursMap.set(weekKey, (weekHoursMap.get(weekKey) || 0) + hrs);
        // Track actual scheduled (working) days per week
        weekScheduledDaysMap.set(weekKey, (weekScheduledDaysMap.get(weekKey) || 0) + 1);
      }

      // Use month-clipped week keys (startDay) for first/last week
      const firstWeekKey = monthClippedWeeks.length > 0 ? monthClippedWeeks[0].key : null;
      const lastWeekKey =
        monthClippedWeeks.length > 1 ? monthClippedWeeks[monthClippedWeeks.length - 1].key : null;

      // Determine if first/last weeks are "incomplete" (don't span a full Mon-Sun)
      const firstWeekEndDay = monthClippedWeeks.length > 0 ? monthClippedWeeks[0].endDay : 7;
      const lastWeekStartDay =
        monthClippedWeeks.length > 1 ? monthClippedWeeks[monthClippedWeeks.length - 1].startDay : 1;
      const firstWeekDaysCount =
        monthClippedWeeks.length > 0
          ? monthClippedWeeks[0].endDay - monthClippedWeeks[0].startDay + 1
          : 7;
      const lastWeekDaysCount =
        monthClippedWeeks.length > 1
          ? monthClippedWeeks[monthClippedWeeks.length - 1].endDay -
            monthClippedWeeks[monthClippedWeeks.length - 1].startDay +
            1
          : 7;

      let firstWeekPrevHours = 0;
      const isFirstWeekIncomplete = leadingCount > 0 && firstWeekDaysCount < 7;
      if (isFirstWeekIncomplete) {
        const prevSched = (fullScheduleData[prevMonthKey] || {})[workerId] || [];
        const prevSpecialDays = (fullSpecialDays[prevMonthKey] || {})[workerId] || {};
        for (const ld of leadingDays) {
          const isSpecial = !!prevSpecialDays[ld.dayIndex];
          if (isSpecial) continue;
          const shiftCode = prevSched[ld.dayIndex];
          if (!shiftCode || shiftCode === 'DESC') continue;
          const shiftInfo = shifts[shiftCode as string];
          if (!shiftInfo || !shiftInfo.start || !shiftInfo.end) continue;
          const [sh, sm] = shiftInfo.start.split(':').map(Number);
          const [eh, em] = shiftInfo.end.split(':').map(Number);
          let mins = eh * 60 + em - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          let hrs = mins / 60;
          const col = (shiftInfo as { colacion?: number }).colacion;
          if (col && col > 0) hrs -= col / 60;
          firstWeekPrevHours += hrs;
        }
      }

      let lastWeekNextHours = 0;
      const isLastWeekIncomplete = trailingCount > 0 && lastWeekDaysCount < 7;
      if (isLastWeekIncomplete) {
        const nextSched = (fullScheduleData[nextMonthKey] || {})[workerId] || [];
        const nextSpecialDays = (fullSpecialDays[nextMonthKey] || {})[workerId] || {};
        for (const trd of trailingDays) {
          const isSpecial = !!nextSpecialDays[trd.dayIndex];
          if (isSpecial) continue;
          const shiftCode = nextSched[trd.dayIndex];
          if (!shiftCode || shiftCode === 'DESC') continue;
          const shiftInfo = shifts[shiftCode as string];
          if (!shiftInfo || !shiftInfo.start || !shiftInfo.end) continue;
          const [sh, sm] = shiftInfo.start.split(':').map(Number);
          const [eh, em] = shiftInfo.end.split(':').map(Number);
          let mins = eh * 60 + em - (sh * 60 + sm);
          if (mins < 0) mins += 24 * 60;
          let hrs = mins / 60;
          const col = (shiftInfo as { colacion?: number }).colacion;
          if (col && col > 0) hrs -= col / 60;
          lastWeekNextHours += hrs;
        }
      }

      // Build sorted weekly hours with week number
      const sortedWeeks = [...weekHoursMap.entries()].sort((a, b) => a[0] - b[0]);
      const weeklyHours = sortedWeeks.map(([key, hours], idx) => ({
        key,
        hours: Math.round(hours * 10) / 10,
        weekNum: idx + 1,
        daysInWeek: weekDaysMap.get(key) ?? 7,
        scheduledDays: weekScheduledDaysMap.get(key) ?? 0,
      }));

      return {
        weeklyHours,
        sundayCount,
        totalHours: Math.round(totalHours * 10) / 10,
        firstWeekKey: isFirstWeekIncomplete ? firstWeekKey : null,
        lastWeekKey: isLastWeekIncomplete ? lastWeekKey : null,
        firstWeekPrevHours: Math.round(firstWeekPrevHours * 10) / 10,
        lastWeekNextHours: Math.round(lastWeekNextHours * 10) / 10,
      };
    },
    [
      scheduleData,
      specialDaysData,
      shifts,
      daysOfWeek,
      daysInMonth,
      monthLabel,
      leadingDays,
      trailingDays,
      leadingCount,
      trailingCount,
      fullScheduleData,
      fullSpecialDays,
      prevMonthKey,
      nextMonthKey,
    ]
  );

  // ─── Early return AFTER all hooks ─────────────────────────────────────
  if (workers.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <User size={48} className="text-muted-foreground/30 mb-3" />
        <p className="text-base font-semibold text-muted-foreground">
          Sin trabajadoras para este filtro
        </p>
        <p className="text-sm text-muted-foreground/70 mt-1">
          Ajusta los filtros de sucursal o área
        </p>
      </div>
    );
  }

  // Is the panel in block-select mode? (a shift or "clear" is selected)
  const isBlockMode = panelOpen && (activeShift !== undefined || activeSpecialDay !== undefined);

  return (
    <div>
      {/* ─── Hint bar ──────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/50 bg-muted/20">
        {panelOpen ? (
          <p className="text-xs text-muted-foreground">
            {isBlockMode ? (
              <>
                <strong>
                  {activeSpecialDay !== undefined
                    ? (nonWorkingTypes.find((t) => t.code === activeSpecialDay)?.label ??
                      activeSpecialDay)
                    : activeShift === null
                      ? '✕ Limpiar'
                      : activeShift}
                </strong>{' '}
                activo — haz clic en las celdas para seleccionarlas, luego toca{' '}
                <strong>Aplicar</strong>.
                {selectedCells.size > 0 && (
                  <span className="ml-1 text-emerald-600 font-semibold">
                    {selectedCells.size} celda{selectedCells.size !== 1 ? 's' : ''} seleccionada
                    {selectedCells.size !== 1 ? 's' : ''}.
                  </span>
                )}
              </>
            ) : (
              'Selecciona un turno o día especial en el panel flotante para activar el modo bloque.'
            )}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Haz clic en cada celda para asignar turnos, o usa el panel de asignación rápida.
          </p>
        )}
        {!panelOpen && (
          <button
            onClick={openPanel}
            className="flex items-center gap-1.5 bg-secondary text-white px-3 py-1.5 rounded-lg text-xs font-semibold hover:bg-blue-700 transition-colors shrink-0 ml-4"
          >
            <Zap size={13} />
            Asignación rápida
          </button>
        )}
      </div>

      {/* ─── Grid ──────────────────────────────────────────────────────── */}
      <div
        ref={gridScrollRef}
        onScroll={handleGridScroll}
        className="overflow-auto scrollbar-thin"
        style={{ maxHeight: 'calc(100vh - 220px)' }}
      >
        <table className="border-collapse text-xs" style={{ minWidth: 1000, width: 'max-content' }}>
          <thead ref={theadRef} className="sticky top-0 z-20">
            <tr className="bg-muted/30 border-b border-border">
              <th
                className="text-left px-3 py-1 font-semibold text-muted-foreground uppercase tracking-wider text-[11px] sticky left-0 w-[140px] min-w-[140px] max-w-[140px] border-r border-border"
                style={{ zIndex: 13, backgroundColor: '#f1f5f9' }}
              >
                COLABORADORAS
              </th>
              {/* Summary column header — sticky */}
              <th
                className="text-center px-1 py-1 font-semibold text-muted-foreground uppercase tracking-wider text-[11px] border-r border-border min-w-[90px] w-[90px] sticky"
                style={{ left: 140, zIndex: 13, backgroundColor: '#f1f5f9' }}
              >
                <div>Resumen</div>
                <div className="text-[9px] font-normal normal-case tracking-normal text-muted-foreground/70">
                  horas · sem. · dom.
                </div>
              </th>
              {leadingDays.map((ld) => (
                <th
                  key={`lead-${ld.day}`}
                  className="text-center px-0 py-1.5 w-[44px] min-w-[44px] max-w-[44px] font-medium border-r border-border/30 opacity-35"
                  style={{ backgroundColor: '#f1f5f9' }}
                >
                  <div className="font-bold text-xs text-muted-foreground">{ld.day}</div>
                  <div className="text-[10px] text-muted-foreground/60">{ld.dow}</div>
                </th>
              ))}
              {days.map((d, i) => {
                const dow = daysOfWeek[i];
                const isSunday = dow === 'D';
                const isHoliday = holidayDayIndices.has(i);
                return (
                  <th
                    key={`day-${d}`}
                    className={`text-center px-0 py-1.5 w-[44px] min-w-[44px] max-w-[44px] font-medium border-r border-border/50 ${isSunday ? 'text-red-500' : isHoliday ? 'text-amber-700' : 'text-muted-foreground'}`}
                    style={{
                      backgroundColor: isSunday ? '#fee2e2' : isHoliday ? '#fef3c7' : '#f1f5f9',
                    }}
                  >
                    <div className="font-bold text-xs">{d}</div>
                    <div
                      className={`text-[10px] ${isSunday ? 'text-red-400' : isHoliday ? 'text-amber-500' : 'text-muted-foreground/60'}`}
                    >
                      {dow}
                    </div>
                  </th>
                );
              })}
              {trailingDays.map((td) => (
                <th
                  key={`trail-${td.day}`}
                  className="text-center px-0 py-1.5 w-[44px] min-w-[44px] max-w-[44px] font-medium border-r border-border/30 opacity-35"
                  style={{ backgroundColor: '#f1f5f9' }}
                >
                  <div className="font-bold text-xs text-muted-foreground">{td.day}</div>
                  <div className="text-[10px] text-muted-foreground/60">{td.dow}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {workers.map((worker, rowIdx) => {
              const sched = scheduleData[worker.id] || [];
              const workerSpecialDays = specialDaysData[worker.id] || {};
              const alerts = getAlerts(worker.id);
              const hasAlert = alerts.length > 0;

              // Determine row background for sticky cells
              const rowBg = hasAlert ? 'bg-orange-50' : rowIdx % 2 === 0 ? 'bg-card' : 'bg-muted/5';
              // Solid opaque background colors for sticky columns to prevent content bleed-through
              const stickyBgColor = hasAlert ? '#fff7ed' : rowIdx % 2 === 0 ? '#ffffff' : '#f9fafb';

              return (
                <tr
                  key={worker.id}
                  className={`border-b border-border/50 transition-colors hover:bg-muted/20 ${hasAlert ? 'row-alert-bg' : rowIdx % 2 === 0 ? '' : 'bg-muted/5'}`}
                >
                  {/* Sticky worker name cell */}
                  <td
                    className="px-2 py-0.5 sticky left-0 border-r border-border w-[140px] min-w-[140px] max-w-[140px]"
                    style={{ zIndex: 2, backgroundColor: stickyBgColor }}
                  >
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-bold text-muted-foreground shrink-0 w-4 text-right">
                        {rowIdx + 1}.
                      </span>
                      <div className="w-6 h-6 rounded-full bg-secondary/15 text-secondary flex items-center justify-center text-[9px] font-bold shrink-0">
                        {worker.initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1">
                          <p className="font-semibold text-foreground text-xs truncate">
                            {worker.name}
                          </p>
                        </div>
                        <div className="flex items-center gap-1">
                          <p className="text-[10px] text-muted-foreground truncate">
                            {worker.role || worker.cargo}
                          </p>
                          {(() => {
                            const effectiveHoras =
                              contractedHoursOverride[worker.id] ?? worker.horasContratadas ?? 42;
                            return (
                              <span className="text-[9px] font-semibold text-blue-600 bg-blue-50 border border-blue-100 rounded px-1 py-0 shrink-0 whitespace-nowrap">
                                {effectiveHoras}h
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Summary cell — sticky, pinned next to worker name */}
                  {(() => {
                    const {
                      weeklyHours,
                      sundayCount,
                      totalHours,
                      firstWeekKey,
                      lastWeekKey,
                      firstWeekPrevHours,
                      lastWeekNextHours,
                    } = getWorkerSummary(worker.id);
                    const effectiveHorasContratadas =
                      contractedHoursOverride[worker.id] ?? worker.horasContratadas ?? 42;
                    const maxWeekHours =
                      weeklyHours.length > 0 ? Math.max(...weeklyHours.map((w) => w.hours)) : 0;
                    const horasLimite = effectiveHorasContratadas;
                    const hoursOver = maxWeekHours > horasLimite;
                    const underHoursWeeks = getWeekUnderHours(worker.id);
                    const hasUnderHoursWeek = underHoursWeeks.size > 0;
                    const sundaysOver = sundayCount < 2;

                    const firstWeekCurrentHours =
                      firstWeekKey !== null
                        ? Math.round(
                            (weeklyHours.find((w) => w.key === firstWeekKey)?.hours ?? 0) * 10
                          ) / 10
                        : 0;
                    const lastWeekCurrentHours =
                      lastWeekKey !== null
                        ? Math.round(
                            (weeklyHours.find((w) => w.key === lastWeekKey)?.hours ?? 0) * 10
                          ) / 10
                        : 0;

                    const sameWeek =
                      firstWeekKey !== null && lastWeekKey !== null && firstWeekKey === lastWeekKey;

                    return (
                      <td
                        className="border-r border-border px-1 py-0.5 min-w-[90px] w-[90px] text-center align-middle sticky"
                        style={{ left: 140, zIndex: 2, backgroundColor: stickyBgColor }}
                      >
                        {/* Monthly total hours */}
                        <div
                          className={`inline-flex items-center gap-0.5 px-1 py-0.5 rounded-md text-[10px] font-semibold mb-0.5 ${hoursOver ? 'bg-orange-100 text-orange-700 border border-orange-200' : 'bg-blue-50 text-blue-700 border border-blue-100'}`}
                        >
                          <span>⏱</span>
                          <span>{totalHours}h mes</span>
                          {hoursOver && <span className="text-[9px]">⚠</span>}
                        </div>

                        {/* Weekly hours breakdown */}
                        {weeklyHours.length > 0 && (
                          <div className="mt-0.5 mb-0.5">
                            <button
                              onClick={() =>
                                setExpandedWeeklyHours((prev) => {
                                  const next = new Set(prev);
                                  if (next.has(worker.id)) next.delete(worker.id);
                                  else next.add(worker.id);
                                  return next;
                                })
                              }
                              className="w-full flex items-center justify-between gap-1 px-1 py-0.5 rounded text-[9px] font-semibold border bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100 transition-colors"
                            >
                              <span>Horas x sem.</span>
                              <span>{expandedWeeklyHours.has(worker.id) ? '▲' : '▼'}</span>
                            </button>
                            {expandedWeeklyHours.has(worker.id) && (
                              <div className="mt-0.5 space-y-0.5">
                                {weeklyHours.map((wk) => {
                                  // Use actual scheduled days for proportional required hours
                                  const requiredHours =
                                    horasLimite * ((wk.scheduledDays || wk.daysInWeek) / 7);
                                  const tolerance = 0.1;
                                  const isUnder =
                                    wk.hours > 0 &&
                                    wk.scheduledDays > 0 &&
                                    wk.hours < requiredHours * (1 - tolerance);
                                  const isOver = wk.hours > horasLimite;
                                  return (
                                    <div
                                      key={`wk-${wk.key}`}
                                      className={`flex items-center justify-between gap-1 px-1 py-0.5 rounded text-[9px] font-medium border ${
                                        isOver
                                          ? 'bg-orange-50 border-orange-200 text-orange-700'
                                          : isUnder
                                            ? 'bg-amber-50 border-amber-200 text-amber-700'
                                            : 'bg-green-50 border-green-200 text-green-700'
                                      }`}
                                    >
                                      <span>S{wk.weekNum}</span>
                                      <span className="font-bold">{wk.hours}h</span>
                                      {isOver && <span>⚠</span>}
                                      {isUnder && <span>⚡</span>}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        )}

                        {/* Incomplete week breakdown: collapsible toggle */}
                        {(firstWeekKey !== null || lastWeekKey !== null) &&
                          !sameWeek &&
                          (() => {
                            const hasFirstWeek = firstWeekKey !== null;
                            const hasLastWeek = lastWeekKey !== null;
                            // Use proportional required hours based on days in this month for each partial week
                            const firstWeekDaysInMonth = weeklyHours[0]?.daysInWeek ?? 7;
                            const lastWeekDaysInMonth =
                              weeklyHours[weeklyHours.length - 1]?.daysInWeek ?? 7;
                            const tolerance = 0.1;
                            // First week: total = current month + prev month portion
                            const firstWeekTotal =
                              Math.round((firstWeekCurrentHours + firstWeekPrevHours) * 10) / 10;
                            // Last week: total = current month + next month portion
                            const lastWeekTotal =
                              Math.round((lastWeekCurrentHours + lastWeekNextHours) * 10) / 10;
                            // Flag based on full week total vs contracted hours
                            const firstHasDiff =
                              hasFirstWeek &&
                              firstWeekTotal > 0 &&
                              firstWeekTotal < horasLimite * (1 - tolerance);
                            const lastHasDiff =
                              hasLastWeek &&
                              lastWeekTotal > 0 &&
                              lastWeekTotal < horasLimite * (1 - tolerance);
                            const hasDiff = firstHasDiff || lastHasDiff;
                            const isExpanded = expandedWeekBreakdown.has(worker.id);
                            return (
                              <div className="mt-1 mb-1">
                                <button
                                  onClick={() =>
                                    setExpandedWeekBreakdown((prev) => {
                                      const next = new Set(prev);
                                      if (next.has(worker.id)) next.delete(worker.id);
                                      else next.add(worker.id);
                                      return next;
                                    })
                                  }
                                  className={`w-full flex items-center justify-between gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-semibold border transition-colors ${
                                    hasDiff
                                      ? 'bg-orange-50 border-orange-300 text-orange-700 hover:bg-orange-100'
                                      : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                  }`}
                                >
                                  <span className="flex items-center gap-1">
                                    {hasDiff && <span>⚠</span>}
                                    <span>Sems. incompletas</span>
                                  </span>
                                  <span>{isExpanded ? '▲' : '▼'}</span>
                                </button>
                                {isExpanded && (
                                  <div className="mt-0.5 space-y-0.5">
                                    {hasFirstWeek && (
                                      <div
                                        className={`rounded-md border px-1.5 py-1 text-left ${firstHasDiff ? 'border-orange-300 bg-orange-50' : 'border-violet-200 bg-violet-50'}`}
                                      >
                                        <div
                                          className={`text-[9px] font-bold uppercase tracking-wide mb-0.5 ${firstHasDiff ? 'text-orange-600' : 'text-violet-600'}`}
                                        >
                                          Sem. 1 {firstHasDiff && '⚠'}
                                        </div>
                                        <div className="flex items-center justify-between gap-1">
                                          <span
                                            className={`text-[9px] ${firstHasDiff ? 'text-orange-500' : 'text-violet-500'}`}
                                          >
                                            Mes ant.
                                          </span>
                                          <span
                                            className={`text-[9px] font-bold ${firstHasDiff ? 'text-orange-700' : 'text-violet-700'}`}
                                          >
                                            {firstWeekPrevHours}h
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-1">
                                          <span
                                            className={`text-[9px] ${firstHasDiff ? 'text-orange-500' : 'text-violet-500'}`}
                                          >
                                            Este mes
                                          </span>
                                          <span
                                            className={`text-[9px] font-bold ${firstHasDiff ? 'text-orange-700' : 'text-violet-700'}`}
                                          >
                                            {firstWeekCurrentHours}h
                                          </span>
                                        </div>
                                        <div
                                          className={`flex items-center justify-between gap-1 mt-0.5 pt-0.5 border-t ${firstHasDiff ? 'border-orange-200' : 'border-violet-200'}`}
                                        >
                                          <span
                                            className={`text-[9px] font-semibold ${firstHasDiff ? 'text-orange-600' : 'text-violet-600'}`}
                                          >
                                            Total sem.
                                          </span>
                                          <span
                                            className={`text-[9px] font-bold ${firstHasDiff ? 'text-orange-800' : 'text-violet-800'}`}
                                          >
                                            {firstWeekTotal}h
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                    {hasLastWeek && (
                                      <div
                                        className={`rounded-md border px-1.5 py-1 text-left ${lastHasDiff ? 'border-orange-300 bg-orange-50' : 'border-teal-200 bg-teal-50'}`}
                                      >
                                        <div
                                          className={`text-[9px] font-bold uppercase tracking-wide mb-0.5 ${lastHasDiff ? 'text-orange-600' : 'text-teal-600'}`}
                                        >
                                          Últ. sem. {lastHasDiff && '⚠'}
                                        </div>
                                        <div className="flex items-center justify-between gap-1">
                                          <span
                                            className={`text-[9px] ${lastHasDiff ? 'text-orange-500' : 'text-teal-500'}`}
                                          >
                                            Este mes
                                          </span>
                                          <span
                                            className={`text-[9px] font-bold ${lastHasDiff ? 'text-orange-700' : 'text-teal-700'}`}
                                          >
                                            {lastWeekCurrentHours}h
                                          </span>
                                        </div>
                                        <div className="flex items-center justify-between gap-1">
                                          <span
                                            className={`text-[9px] ${lastHasDiff ? 'text-orange-500' : 'text-teal-500'}`}
                                          >
                                            Mes sig.
                                          </span>
                                          <span
                                            className={`text-[9px] font-bold ${lastHasDiff ? 'text-orange-700' : 'text-teal-700'}`}
                                          >
                                            {lastWeekNextHours}h
                                          </span>
                                        </div>
                                        <div
                                          className={`flex items-center justify-between gap-1 mt-0.5 pt-0.5 border-t ${lastHasDiff ? 'border-orange-200' : 'border-teal-200'}`}
                                        >
                                          <span
                                            className={`text-[9px] font-semibold ${lastHasDiff ? 'text-orange-600' : 'text-teal-600'}`}
                                          >
                                            Total sem.
                                          </span>
                                          <span
                                            className={`text-[9px] font-bold ${lastHasDiff ? 'text-orange-800' : 'text-teal-800'}`}
                                          >
                                            {lastWeekTotal}h
                                          </span>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            );
                          })()}

                        {/* Sunday count */}
                        <div
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${sundaysOver ? 'bg-red-100 text-red-700 border border-red-200' : 'bg-slate-100 text-slate-600 border border-slate-200'}`}
                        >
                          <span>☀</span>
                          <span>{sundayCount} dom. desc.</span>
                          {sundaysOver && <span className="text-[9px]">⚠</span>}
                        </div>
                      </td>
                    );
                  })()}

                  {/* Leading locked cells */}
                  {leadingDays.map((ld) => {
                    const prevSched = (fullScheduleData[prevMonthKey] || {})[worker.id] || [];
                    const prevSpecial = (fullSpecialDays[prevMonthKey] || {})[worker.id] || {};
                    return (
                      <ShiftCell
                        key={`lead-cell-${worker.id}-${ld.day}`}
                        workerId={worker.id}
                        dayIndex={ld.dayIndex}
                        shift={prevSched[ld.dayIndex] ?? null}
                        specialDay={prevSpecial[ld.dayIndex]}
                        shifts={shifts}
                        nonWorkingTypes={nonWorkingTypes}
                        onCellChange={(wid, di, s) => ctxSetCellShift(wid, di, s, prevMonthKey)}
                        onSpecialDayChange={(wid, di, tc) =>
                          ctxSetSpecialDay(wid, di, tc, prevMonthKey)
                        }
                      />
                    );
                  })}

                  {/* Current month cells */}
                  {(() => {
                    // Compute underHoursWeeks once per worker, not per cell
                    const underHoursWeeks = getWeekUnderHours(worker.id);
                    return days.map((d, i) => {
                      // Compute month-clipped week key for this day (matches getWeekUnderHours logic)
                      const dayNum = i + 1;
                      const date = new Date(year, monthIdx, dayNum);
                      const dayOfWeekNum = (date.getDay() + 6) % 7; // 0=Mon, 6=Sun
                      const weekMondayDay = dayNum - dayOfWeekNum;
                      const weekKey = Math.max(1, weekMondayDay); // startDay of the month-clipped week
                      const isUnderHoursWeek = underHoursWeeks.has(weekKey);

                      if (isBlockMode) {
                        const cellKey = `${worker.id}-${i}`;
                        return (
                          <BlockModeCell
                            key={`${worker.id}-day-${i}`}
                            workerId={worker.id}
                            dayIndex={i}
                            shift={sched[i] ?? null}
                            specialDay={workerSpecialDays[i]}
                            shifts={shifts}
                            nonWorkingTypes={nonWorkingTypes}
                            isSelected={selectedCells.has(cellKey)}
                            onToggle={handleToggleCell}
                            isUnderHoursWeek={isUnderHoursWeek}
                          />
                        );
                      }
                      return (
                        <ShiftCell
                          key={`${worker.id}-day-${i}`}
                          workerId={worker.id}
                          dayIndex={i}
                          shift={sched[i] ?? null}
                          specialDay={workerSpecialDays[i]}
                          shifts={shifts}
                          nonWorkingTypes={nonWorkingTypes}
                          onCellChange={onCellChange}
                          onSpecialDayChange={onSpecialDayChange}
                          isUnderHoursWeek={isUnderHoursWeek}
                        />
                      );
                    });
                  })()}

                  {/* Trailing locked cells */}
                  {trailingDays.map((trd) => {
                    const nextSched = (fullScheduleData[nextMonthKey] || {})[worker.id] || [];
                    const nextSpecial = (fullSpecialDays[nextMonthKey] || {})[worker.id] || {};
                    return (
                      <ShiftCell
                        key={`trail-cell-${worker.id}-${trd.day}`}
                        workerId={worker.id}
                        dayIndex={trd.dayIndex}
                        shift={nextSched[trd.dayIndex] ?? null}
                        specialDay={nextSpecial[trd.dayIndex]}
                        shifts={shifts}
                        nonWorkingTypes={nonWorkingTypes}
                        onCellChange={(wid, di, s) => ctxSetCellShift(wid, di, s, nextMonthKey)}
                        onSpecialDayChange={(wid, di, tc) =>
                          ctxSetSpecialDay(wid, di, tc, nextMonthKey)
                        }
                      />
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── Floating shift selector panel ─────────────────────────────── */}
      {panelOpen && (
        <FloatingShiftPanel
          shifts={shifts}
          nonWorkingTypes={nonWorkingTypes}
          activeShift={activeShift ?? null}
          activeSpecialDay={activeSpecialDay}
          onSelectShift={handleSelectShift}
          onSelectSpecialDay={handleSelectSpecialDay}
          onClose={closePanel}
          selectedCount={selectedCells.size}
          onApply={handleApply}
          onClearSelection={handleClearSelection}
        />
      )}

      {/* Floating alert tooltip */}
      {tooltip && (
        <div
          className="fixed z-[9999] bg-orange-50 border border-orange-200 rounded-lg shadow-lg p-2 text-[10px] text-orange-700 font-medium pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translateY(-50%)',
            minWidth: '220px',
          }}
        >
          {tooltip.alerts.map((a, ai) => (
            <p key={ai} className="mb-0.5 whitespace-normal">
              ⚠ {a}
            </p>
          ))}
        </div>
      )}

      {/* ─── Fixed bottom scrollbar ────────────────────────────────────── */}
      {showFixedBar && gridRect && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: gridRect.left,
            width: gridRect.width,
            zIndex: 9998,
            backgroundColor: 'rgba(255,255,255,0.97)',
            borderTop: '1px solid #e2e8f0',
            boxShadow: '0 -2px 8px rgba(0,0,0,0.08)',
            height: 16,
            overflow: 'hidden',
          }}
        >
          <div
            ref={topScrollRef}
            onScroll={(e) => {
              handleFixedScroll(e);
            }}
            style={{ overflowX: 'auto', overflowY: 'hidden', height: '100%' }}
          >
            <div style={{ width: fixedScrollWidth, height: 1 }} />
          </div>
        </div>
      )}
    </div>
  );
}
