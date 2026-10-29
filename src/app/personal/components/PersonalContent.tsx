'use client';
import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Users, Download, Plus, KeyRound } from 'lucide-react';
import { applyPrintSetup, createWorkbook, downloadWorkbook } from '@/lib/excel';
import { useAppContext, type Worker } from '@/context/AppContext';
import { useReadonly } from '@/hooks/useReadonly';
import { useCargoOptions } from '@/hooks/useCargoOptions';
import PersonalFilters from './PersonalFilters';
import PersonalSummary from './PersonalSummary';
import PersonalTable from './PersonalTable';
import AddWorkerPanel from './AddWorkerPanel';
import BulkPinPanel from './BulkPinPanel';

export default function PersonalContent() {
  const { workers, addWorker, updateWorker, deleteWorker, sucursales, globalSucursal, globalArea } =
    useAppContext();
  const isReadonly = useReadonly('personal');
  // [] = todas / todos
  const [filterSucursales, setFilterSucursales] = useState<string[]>([]);
  const [filterAreas, setFilterAreas] = useState<string[]>([]);
  const [filterEstado, setFilterEstado] = useState('Activos');
  const [filterCargos, setFilterCargos] = useState<string[]>([]);
  const [filterHoras, setFilterHoras] = useState<number[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [showClaves, setShowClaves] = useState(false);

  // Todos los filtros menos cargo y horas (así cada distribución muestra todas sus tarjetas)
  const workersBase = useMemo(() => {
    return workers.filter((w) => {
      if (filterSucursales.length > 0 && !filterSucursales.includes(w.sucursal)) return false;
      if (filterAreas.length > 0 && !filterAreas.includes(w.area)) return false;
      if (filterEstado === 'Activos' && w.estado !== 'Activo') return false;
      if (filterEstado === 'Inactivos' && w.estado !== 'Inactivo') return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!w.name.toLowerCase().includes(q) && !w.rut.includes(q)) return false;
      }
      return true;
    });
  }, [workers, filterSucursales, filterAreas, filterEstado, searchQuery]);

  const cargoOptions = useCargoOptions(filterAreas, filterCargos, setFilterCargos);

  const workersWithCargo = useMemo(
    () =>
      filterCargos.length === 0
        ? workersBase
        : workersBase.filter((w) => filterCargos.includes(w.cargo)),
    [workersBase, filterCargos]
  );
  const workersWithHoras = useMemo(
    () =>
      filterHoras.length === 0
        ? workersBase
        : workersBase.filter((w) => filterHoras.includes(w.horasContratadas)),
    [workersBase, filterHoras]
  );

  const filteredWorkers = useMemo(
    () =>
      filterHoras.length === 0
        ? workersWithCargo
        : workersWithCargo.filter((w) => filterHoras.includes(w.horasContratadas)),
    [workersWithCargo, filterHoras]
  );

  const summary = useMemo(() => {
    const activeWorkers = filteredWorkers.filter((w) => w.estado === 'Activo');
    const total = filteredWorkers.length;
    const activos = activeWorkers.length;
    const inactivos = filteredWorkers.filter((w) => w.estado === 'Inactivo').length;
    // Las horas se cuentan con el filtro de cargo y el cargo con el de horas, cada uno sin el suyo
    const horasBreakdown: Record<number, number> = {};
    workersWithCargo
      .filter((w) => w.estado === 'Activo')
      .forEach((w) => {
        horasBreakdown[w.horasContratadas] = (horasBreakdown[w.horasContratadas] || 0) + 1;
      });
    const cargoBreakdown: Record<string, number> = {};
    workersWithHoras
      .filter((w) => w.estado === 'Activo')
      .forEach((w) => {
        if (w.cargo) {
          cargoBreakdown[w.cargo] = (cargoBreakdown[w.cargo] || 0) + 1;
        }
      });
    // Lo elegido sigue como tarjeta aunque quede en 0, para poder quitarlo
    filterHoras.forEach((h) => {
      horasBreakdown[h] = horasBreakdown[h] || 0;
    });
    filterCargos.forEach((c) => {
      cargoBreakdown[c] = cargoBreakdown[c] || 0;
    });
    return { total, activos, inactivos, horasBreakdown, cargoBreakdown };
  }, [filteredWorkers, workersWithCargo, workersWithHoras, filterHoras, filterCargos]);

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
    toast.success(`${w?.name} borrada`);
  };

  // Dar de baja guarda su historial; deja de salir en la malla y en Mis turnos
  const handleDeactivateWorker = (worker: Worker) => {
    updateWorker({ ...worker, estado: 'Inactivo' });
    toast.success(`${worker.name} quedó Inactiva. Su historial se guarda.`);
  };

  const handleEdit = (worker: Worker) => {
    setEditingWorker(worker);
  };

  const isNewWorker = editingWorker ? !workers.find((w) => w.id === editingWorker.id) : false;

  const handleExport = async () => {
    if (filteredWorkers.length === 0) {
      toast.error('No hay trabajadores para exportar con los filtros actuales');
      return;
    }

    const wb = await createWorkbook();
    const ws = wb.addWorksheet('Personal');

    // ── Data ──────────────────────────────────────────────────────────────────
    const headers = [
      'Nombre',
      'RUT',
      'Cargo',
      'Área',
      'Sucursal',
      'Horas sem.',
      'Estado',
      'Cumpleaños',
    ];
    const dataRows = filteredWorkers.map((w) => [
      w.name,
      w.rut,
      w.cargo || '',
      w.area || '',
      w.sucursal || '',
      w.horasContratadas || '',
      w.estado,
      w.birthday || '',
    ]);
    const numCols = headers.length;
    const numDataRows = dataRows.length;

    // ── Column widths ─────────────────────────────────────────────────────────
    [30, 14, 18, 18, 18, 8, 12, 14].forEach((width, i) => {
      ws.getColumn(i + 1).width = width;
    });

    const border = (
      color: string,
      bottom: 'thin' | 'medium' = 'thin',
      top: 'thin' | 'medium' = 'thin'
    ) => ({
      top: { style: top, color: { argb: `FF${color}` } },
      bottom: { style: bottom, color: { argb: `FF${color}` } },
      left: { style: 'thin' as const, color: { argb: `FF${color}` } },
      right: { style: 'thin' as const, color: { argb: `FF${color}` } },
    });
    const fill = (color: string) => ({
      type: 'pattern' as const,
      pattern: 'solid' as const,
      fgColor: { argb: `FF${color}` },
    });

    // ── Title row (merged across all columns) ─────────────────────────────────
    const title = ws.addRow([
      `Listado de Personal — ${new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })}`,
    ]);
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
    headerRow.eachCell((cell) => {
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
      const statusColor =
        statusValue === 'Activo' ? '16A34A' : statusValue === 'Inactivo' ? 'DC2626' : '6B7280';
      for (let col = 1; col <= numCols; col++) {
        const cell = row.getCell(col);
        const isStatus = col === 7; // Estado column
        cell.font = {
          size: 10,
          bold: isStatus,
          color: { argb: `FF${isStatus ? statusColor : '1E293B'}` },
        };
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

    // Encabezado fijo con filtros, y lista para imprimir
    ws.views = [{ state: 'frozen', ySplit: 3 }];
    ws.autoFilter = { from: { row: 3, column: 1 }, to: { row: 3, column: numCols } };
    applyPrintSetup(ws);
    ws.pageSetup.printTitlesRow = '3:3';

    const today = new Date().toISOString().slice(0, 10);
    await downloadWorkbook(wb, `personal_${today}.xlsx`);
    toast.success(`${filteredWorkers.length} trabajador(es) exportados correctamente`);
  };

  return (
    <div className="p-4 lg:p-6 xl:p-8 max-w-screen-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-5 lg:mb-7 gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-foreground section-header-line flex items-center gap-2">
            <Users size={20} className="text-secondary" />
            Personal
          </h1>
          <p className="hidden lg:block text-muted-foreground text-sm mt-1 ml-3">
            Administra la información de los trabajadores de la empresa.
          </p>
        </div>
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowClaves(true)}
            disabled={isReadonly}
            className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-all duration-150 disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <KeyRound size={14} />
            Claves Mis turnos
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-2 border border-border bg-card px-4 py-2.5 rounded-xl text-sm font-semibold text-foreground hover:bg-muted transition-all duration-150"
            style={{ boxShadow: 'var(--shadow-sm)' }}
          >
            <Download size={14} />
            Exportar
          </button>
          <button
            onClick={() =>
              setEditingWorker({
                id: crypto.randomUUID(),
                name: '',
                initials: '',
                rut: '',
                cargo: 'Cajera',
                role: 'Cajera',
                sucursal: globalSucursal !== 'Todas' ? globalSucursal : (sucursales[0]?.name ?? ''),
                area: globalArea !== 'Todas' ? globalArea : 'Cajas',
                horasContratadas: 42,
                estado: 'Activo',
                avatarColor: 'bg-blue-100 text-blue-700',
                birthday: '',
              })
            }
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
            filterSucursales={filterSucursales}
            setFilterSucursales={setFilterSucursales}
            filterAreas={filterAreas}
            setFilterAreas={setFilterAreas}
            filterEstado={filterEstado}
            setFilterEstado={setFilterEstado}
            filterCargos={filterCargos}
            setFilterCargos={setFilterCargos}
            cargoOptions={cargoOptions}
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
          />
          <PersonalSummary
            summary={summary}
            selectedCargos={filterCargos}
            onToggleCargo={(c) =>
              setFilterCargos((prev) =>
                prev.includes(c) ? prev.filter((x) => x !== c) : [...prev, c]
              )
            }
            selectedHoras={filterHoras}
            onToggleHoras={(h) =>
              setFilterHoras((prev) =>
                prev.includes(h) ? prev.filter((x) => x !== h) : [...prev, h]
              )
            }
          />
          <PersonalTable
            workers={filteredWorkers}
            onEdit={handleEdit}
            onDelete={handleDeleteWorker}
            onDeactivate={handleDeactivateWorker}
          />
        </div>

        {showClaves && (
          <BulkPinPanel workers={filteredWorkers} onClose={() => setShowClaves(false)} />
        )}

        {/* En el celular el formulario ocupa toda la pantalla; en el computador va al lado */}
        {editingWorker && (
          <div className="fixed inset-0 z-50 overflow-y-auto bg-background p-4 lg:static lg:z-auto lg:overflow-visible lg:bg-transparent lg:p-0 lg:w-72 xl:w-80 lg:shrink-0">
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
