'use client';
import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Users, Download, Plus } from 'lucide-react';
import { createWorkbook, downloadWorkbook } from '@/lib/excel';
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

  const handleExport = async () => {
    if (filteredWorkers.length === 0) {
      toast.error('No hay trabajadores para exportar con los filtros actuales');
      return;
    }

    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Personal');

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
    const numCols = headers.length;
    const numDataRows = dataRows.length;

    // ── Column widths ─────────────────────────────────────────────────────────
    [30, 14, 18, 18, 18, 8, 12, 14].forEach((width, i) => { ws.getColumn(i + 1).width = width; });

    const border = (color: string, bottom: 'thin' | 'medium' = 'thin', top: 'thin' | 'medium' = 'thin') => ({
      top: { style: top, color: { argb: `FF${color}` } },
      bottom: { style: bottom, color: { argb: `FF${color}` } },
      left: { style: 'thin' as const, color: { argb: `FF${color}` } },
      right: { style: 'thin' as const, color: { argb: `FF${color}` } },
    });
    const fill = (color: string) => ({ type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: `FF${color}` } });

    // ── Title row (merged across all columns) ─────────────────────────────────
    const title = ws.addRow([`Listado de Personal — ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}`]);
    ws.mergeCells(1, 1, 1, numCols);
    title.height = 36;
    title.getCell(1).font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
    title.getCell(1).fill = fill('1E3A5F');
    title.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

    // ── Spacer ────────────────────────────────────────────────────────────────
    ws.addRow([]).height = 6;

    // ── Header row ────────────────────────────────────────────────────────────
    const headerRow = ws.addRow(headers);
    headerRow.height = 22;
    headerRow.eachCell(cell => {
      cell.font = { bold: true, size: 11, color: { argb: 'FFFFFFFF' } };
      cell.fill = fill('2563EB');
      cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
      cell.border = border('BFDBFE', 'medium');
    });

    // ── Data rows (alternating) ───────────────────────────────────────────────
    dataRows.forEach((values, i) => {
      const row = ws.addRow(values);
      const bgColor = i % 2 === 0 ? 'EFF6FF' : 'FFFFFF';
      const statusValue = values[6];
      const statusColor = statusValue === 'Activo' ? '16A34A' : statusValue === 'Inactivo' ? 'DC2626' : '6B7280';
      for (let col = 1; col <= numCols; col++) {
        const cell = row.getCell(col);
        const isStatus = col === 7; // Estado column
        cell.font = { size: 10, bold: isStatus, color: { argb: `FF${isStatus ? statusColor : '1E293B'}` } };
        cell.fill = fill(bgColor);
        cell.alignment = { horizontal: col === 1 ? 'left' : 'center', vertical: 'middle' };
        cell.border = border('DBEAFE');
      }
    });

    // ── Footer row ────────────────────────────────────────────────────────────
    const footer = ws.addRow([`Total: ${numDataRows} trabajador${numDataRows !== 1 ? 'es' : ''}`]);
    ws.mergeCells(footer.number, 1, footer.number, numCols);
    footer.getCell(1).font = { bold: true, size: 10, color: { argb: 'FF1E3A5F' } };
    footer.getCell(1).fill = fill('DBEAFE');
    footer.getCell(1).alignment = { horizontal: 'right', vertical: 'middle' };
    footer.getCell(1).border = border('2563EB', 'thin', 'medium');

    const today = new Date().toISOString().slice(0, 10);
    await downloadWorkbook(wb, `personal_${today}.xlsx`);
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
              id: crypto.randomUUID(),
              name: '', initials: '', rut: '', cargo: 'Cajera', role: 'Cajera',
              sucursal: 'Mayorista Talca', area: 'Cajas',
              horasContratadas: 42, estado: 'Activo', avatarColor: 'bg-blue-100 text-blue-700', birthday: ''
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