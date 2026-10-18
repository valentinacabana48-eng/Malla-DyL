'use client';
import React, { useMemo } from 'react';
import { Bell, AlertTriangle, CheckCircle } from 'lucide-react';
import { type Worker, useAppContext } from '@/context/AppContext';

interface Props {
  workers: Worker[];
  specialDaysData: Record<string, Record<number, string>>;
  selectedMes: string;
}

interface WorkerAlert {
  worker: Worker;
  alerts: { type: 'warning' | 'info'; message: string }[];
  counts: Record<string, number>;
}

export default function SpecialDaysAlerts({ workers, specialDaysData, selectedMes }: Props) {
  const { getAllNonWorkingTypes } = useAppContext();
  const nonWorkingTypes = getAllNonWorkingTypes();

  const workerAlerts = useMemo((): WorkerAlert[] => {
    const result: WorkerAlert[] = [];

    workers.forEach(worker => {
      const workerSpecialDays = specialDaysData[worker.id] || {};
      const counts: Record<string, number> = {};

      Object.values(workerSpecialDays).forEach(typeCode => {
        counts[typeCode] = (counts[typeCode] || 0) + 1;
      });

      const alerts: { type: 'warning' | 'info'; message: string }[] = [];

      nonWorkingTypes.forEach(nwt => {
        const used = counts[nwt.code] || 0;
        if (used === 0) return;

        if (nwt.maxDaysPerMonth !== null) {
          if (used > nwt.maxDaysPerMonth) {
            alerts.push({
              type: 'warning',
              message: `${nwt.icon} ${nwt.label}: ${used} días usados — excede el límite de ${nwt.maxDaysPerMonth} día(s)/mes`,
            });
          } else if (used === nwt.maxDaysPerMonth) {
            alerts.push({
              type: 'warning',
              message: `${nwt.icon} ${nwt.label}: ${used}/${nwt.maxDaysPerMonth} días usados — límite alcanzado`,
            });
          } else {
            alerts.push({
              type: 'info',
              message: `${nwt.icon} ${nwt.label}: ${used}/${nwt.maxDaysPerMonth} días usados`,
            });
          }
        } else {
          alerts.push({
            type: 'info',
            message: `${nwt.icon} ${nwt.label}: ${used} día(s) en ${selectedMes}`,
          });
        }
      });

      // Also handle any unknown codes (e.g. deleted custom types still in data)
      Object.entries(counts).forEach(([code, used]) => {
        const known = nonWorkingTypes.find(t => t.code === code);
        if (!known && used > 0) {
          alerts.push({ type: 'info', message: `📌 ${code}: ${used} día(s)` });
        }
      });

      if (Object.keys(counts).length > 0) {
        result.push({ worker, alerts, counts });
      }
    });

    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workers, specialDaysData, selectedMes, nonWorkingTypes]);

  const hasWarnings = workerAlerts.some(wa => wa.alerts.some(a => a.type === 'warning'));

  if (workerAlerts.length === 0) return null;

  return (
    <div className="mt-4 bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Bell size={15} className={hasWarnings ? 'text-orange-500' : 'text-secondary'} />
        <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">
          Alertas de días especiales
        </h2>
        {hasWarnings && (
          <span className="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-xs font-semibold">
            <AlertTriangle size={11} />
            {workerAlerts.filter(wa => wa.alerts.some(a => a.type === 'warning')).length} con alertas
          </span>
        )}
      </div>

      <div className="divide-y divide-border/50">
        {workerAlerts.map(({ worker, alerts }) => {
          const hasWorkerWarning = alerts.some(a => a.type === 'warning');
          return (
            <div key={`alert-row-${worker.id}`} className={`px-5 py-3 flex items-start gap-3 ${hasWorkerWarning ? 'bg-orange-50/50' : ''}`}>
              <div className="w-8 h-8 rounded-full bg-secondary/15 text-secondary flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5">
                {worker.initials}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-foreground">{worker.name}</p>
                <p className="text-[10px] text-muted-foreground mb-1.5">{worker.role || worker.cargo} · {worker.sucursal}</p>
                <div className="flex flex-wrap gap-1.5">
                  {alerts.map((alert, ai) => (
                    <span
                      key={`alert-badge-${worker.id}-${ai}`}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-medium ${
                        alert.type === 'warning' ?'bg-orange-100 text-orange-700 border border-orange-200' :'bg-blue-50 text-blue-700 border border-blue-100'
                      }`}
                    >
                      {alert.type === 'warning' ? <AlertTriangle size={10} /> : <CheckCircle size={10} />}
                      {alert.message}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
