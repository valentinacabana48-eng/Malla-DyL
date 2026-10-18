'use client';
import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Users, Download, Plus } from 'lucide-react';
import * as XLSX from 'xlsx';
import { useAppContext, type Worker } from '@/context/AppContext';
import { useReadonly } from '@/hooks/useReadonly';
import PersonalFilters from './PersonalFilters';
import PersonalSummary from './PersonalSummary';
import PersonalTable from './PersonalTable';
import AddWorkerPanel from './AddWorkerPanel';

export default function PersonalContent() {
  const { workers, addWorker, updateWorker, deleteWorker } = useAppContext();
  const isReadonly = useReadonly();
  const [filterSucursal, setFilterSucursal] = useState('Todas');
  const [filterArea, setFilterArea] = useState('Todas');
  const [filterEstado, setFilterEstado] = useState('Activos');
  const [searchQuery, setSearchQuery] = useState('');
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);

  const filteredWorkers = useMemo(() => {
    return workers.filter((w) => {
      if (filterSucursal !== 'Todas' && w.sucursal !== filterSucursal) return false;
      if (filterArea !== 'Todas' && w.area !== filterArea) return false;
      if (filterEstado === 'Activos' && w.estado !== 'Activo') return false;
      if (filterEstado === 'Inactivos' && w.estado !== 'Inactivo') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!w.name.toLowerCase().includes(q) && !w.rut.includes(q)) return false;
      }
      return true;
    });
  }, [workers, filterSucursal, filterArea, filterEstado, searchQuery]);

  const summary = useMemo(() => {
    const activeWorkers = filteredWorkers.filter((w) => w.estado === 'Activo');
    const total = filteredWorkers.length;
    const activos = activeWorkers.length;
    const inactivos = filteredWorkers.filter((w) => w.estado === 'Inactivo').length;
    const horasBreakdown: Record<number, number> = {};
    activeWorkers.forEach(w => {
      horasBreakdown[w.horasContratadas] = (horasBreakdown[w.horasContratadas] || 0) + 1;
    });
    const cargoBreakdown: Record<string, number> = {};
    activeWorkers.forEach(w => {
      if (w.cargo) {
        cargoBreakdown[w.cargo] = (cargoBreakdown[w.cargo] || 0) + 1;
      }
    });
    return { total, activos, inactivos, horasBreakdown, cargoBreakdown };
  }, [filteredWorkers]);

  const handleAddWorker = (worker: Worker) => {
    addWorker(worker);
    toast.success(`${worker.name} agregada correctamente`);
    setEditingWorker(null);
  };

  const handleUpdateWorker = (updated: Worker) => {
    updateWorker(updated);
    toast.success(`${updated.name} actualizada correctamente`);
    setEditingWorker(null);
  };

  const handleDeleteWorker = (id: string) => {
    const w = workers.find((w) => w.id === id);
    deleteWorker(id);
    toast.success(`${w?.name} eliminada`);
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
  };

  const isNewWorker = editingWorker ? !workers.find(w => w.id === editingWorker.id) : false;

  const handleExport = () => {
    if (filteredWorkers.length === 0) {
      toast.error('No hay trabajadores para exportar con los filtros actuales');
      return;
    }

    const wb = XLSX.utils.book_new();

    // ── Data ──────────────────────────────────────────────────────────────────
    const headers = ['Nombre', 'RUT', 'Cargo', 'Área', 'Sucursal', 'Horas', 'Estado', 'Cumpleaños'];
    const dataRows = filteredWorkers.map(w => [
      w.name,
      w.rut,
      w.cargo || '',
      w.area || '',
      w.sucursal || '',
      w.horasContratadas ? `${w.horasContratadas}h` : '',
      w.estado,
      w.birthday || '',
    ]);

    // Title row (row 1) + blank spacer (row 2) + header (row 3) + data rows
    const sheetData: (string | number)[][] = [
      [`Listado de Personal — ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}`],
      [],
      headers,
      ...dataRows,
    ];

    const ws = XLSX.utils.aoa_to_sheet(sheetData);

    const numCols = headers.length;
    const numDataRows = dataRows.length;

    // ── Merge title across all columns ────────────────────────────────────────
    ws['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: numCols - 1 } }];

    // ── Column widths ─────────────────────────────────────────────────────────
    ws['!cols'] = [
      { wch: 30 }, // Nombre
      { wch: 14 }, // RUT
      { wch: 18 }, // Cargo
      { wch: 18 }, // Área
      { wch: 18 }, // Sucursal
      { wch: 8  }, // Horas
      { wch: 12 }, // Estado
      { wch: 14 }, // Cumpleaños
    ];

    // ── Row heights ───────────────────────────────────────────────────────────
    ws['!rows'] = [
      { hpt: 36 }, // title
      { hpt: 6  }, // spacer
      { hpt: 22 }, // header
    ];

    // ── Helper: apply style to a cell address ─────────────────────────────────
    const styleCell = (addr: string, style: Record<string, unknown>) => {
      if (!ws[addr]) ws[addr] = { t: 's', v: '' };
      ws[addr].s = style;
    };

    // ── Title row style ───────────────────────────────────────────────────────
    const titleStyle = {
      font: { bold: true, sz: 14, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '1E3A5F' } },
      alignment: { horizontal: 'center', vertical: 'center' },
      border: {
        top:    { style: 'thin', color: { rgb: 'FFFFFF' } },
        bottom: { style: 'thin', color: { rgb: 'FFFFFF' } },
        left:   { style: 'thin', color: { rgb: 'FFFFFF' } },
        right:  { style: 'thin', color: { rgb: 'FFFFFF' } },
      },
    };
    styleCell('A1', titleStyle);

    // ── Header row style (row index 2 → Excel row 3) ──────────────────────────
    const headerStyle = {
      font: { bold: true, sz: 11, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '2563EB' } },
      alignment: { horizontal: 'center', vertical: 'center', wrapText: true },
      border: {
        top:    { style: 'thin', color: { rgb: 'BFDBFE' } },
        bottom: { style: 'medium', color: { rgb: 'FFFFFF' } },
        left:   { style: 'thin', color: { rgb: 'BFDBFE' } },
        right:  { style: 'thin', color: { rgb: 'BFDBFE' } },
      },
    };
    const colLetters = ['A','B','C','D','E','F','G','H'];
    colLetters.forEach(col => styleCell(`${col}3`, headerStyle));

    // ── Data rows style (alternating) ─────────────────────────────────────────
    for (let i = 0; i < numDataRows; i++) {
      const excelRow = i + 4; // rows 4 onwards
      const isEven = i % 2 === 0;
      const bgColor = isEven ? 'EFF6FF' : 'FFFFFF';

      colLetters.forEach((col, colIdx) => {
        const addr = `${col}${excelRow}`;
        const isStatus = colIdx === 6; // Estado column
        const statusValue = dataRows[i][6];
        const statusColor = statusValue === 'Activo' ? '16A34A' : statusValue === 'Inactivo' ? 'DC2626' : '6B7280';

        styleCell(addr, {
          font: {
            sz: 10,
            color: { rgb: isStatus ? statusColor : '1E293B' },
            bold: isStatus,
          },
          fill: { fgColor: { rgb: bgColor } },
          alignment: { horizontal: colIdx === 0 ? 'left' : 'center', vertical: 'center' },
          border: {
            top:    { style: 'thin', color: { rgb: 'DBEAFE' } },
            bottom: { style: 'thin', color: { rgb: 'DBEAFE' } },
            left:   { style: 'thin', color: { rgb: 'DBEAFE' } },
            right:  { style: 'thin', color: { rgb: 'DBEAFE' } },
          },
        });
      });
    }

    // ── Footer row ────────────────────────────────────────────────────────────
    const footerRow = numDataRows + 4;
    sheetData.push([`Total: ${numDataRows} trabajador${numDataRows !== 1 ? 'es' : ''}`]);
    XLSX.utils.sheet_add_aoa(ws, [[`Total: ${numDataRows} trabajador${numDataRows !== 1 ? 'es' : ''}`]], { origin: `A${footerRow}` });
    ws['!merges'].push({ s: { r: footerRow - 1, c: 0 }, e: { r: footerRow - 1, c: numCols - 1 } });
    styleCell(`A${footerRow}`, {
      font: { bold: true, sz: 10, color: { rgb: '1E3A5F' } },
      fill: { fgColor: { rgb: 'DBEAFE' } },
      alignment: { horizontal: 'right', vertical: 'center' },
      border: {
        top:    { style: 'medium', color: { rgb: '2563EB' } },
        bottom: { style: 'thin', color: { rgb: '2563EB' } },
        left:   { style: 'thin', color: { rgb: '2563EB' } },
        right:  { style: 'thin', color: { rgb: '2563EB' } },
      },
    });

    XLSX.utils.book_append_sheet(wb, ws, 'Personal');

    const today = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `personal_${today}.xlsx`);
    toast.success(`${filteredWorkers.length} trabajador(es) exportados correctamente`);
  };

  return (
    <div className="p-6 xl:p-8 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-7 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
            <Users size={20} className="text-secondary" />
            Personal
          </h1>
          <p className="text-muted-foreground text-sm mt-1 ml-3">Administra la información de los trabajadores de la empresa.</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExport}
            className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-all duration-150"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <Download size={14} />
            Exportar
          </button>
          <button
            onClick={() => setEditingWorker({
              id: `pw-${Date.now()}`,
              name: '', initials: '', rut: '', cargo: 'Cajera', role: 'Cajera',
              sucursal: 'Mayorista Talca', area: 'Cajas',
              horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-blue-100 text-blue-700'
            })}
            disabled={isReadonly}
            className="flex items-center gap-2 bg-secondary text-white px-4 py-2.5 rounded-xl text-sm font-semibold hover:bg-blue-700 active:scale-95 transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ boxShadow: '0 2px 8px rgba(29,91,212,0.3)' }}
          >
            <Plus size={15} />
            Añadir trabajador
          </button>
        </div>
      </div>

      {/* Main layout */}
      <div className="flex gap-6">
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          <PersonalFilters
            filterSucursal={filterSucursal}
            setFilterSucursal={setFilterSucursal}
            filterArea={filterArea}
            setFilterArea={setFilterArea}
            filterEstado={filterEstado}
            setFilterEstado={setFilterEstado}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
          <PersonalSummary summary={summary} />
          <PersonalTable
            workers={filteredWorkers}
            onEdit={handleEdit}
            onDelete={handleDeleteWorker}
          />
        </div>

        {editingWorker && (
          <div className="w-72 xl:w-80 shrink-0">
            <AddWorkerPanel
              worker={editingWorker}
              isNew={isNewWorker}
              onSave={isNewWorker ? handleAddWorker : handleUpdateWorker}
              onCancel={() => setEditingWorker(null)}
            />
          </div>
        )}
      </div>
    </div>
  );
}