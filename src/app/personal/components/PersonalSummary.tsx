import React from 'react';
import { Users, UserCheck, UserX, Clock, Briefcase } from 'lucide-react';

interface Summary {
  total: number;
  activos: number;
  inactivos: number;
  horasBreakdown: Record<number, number>;
  cargoBreakdown: Record<string, number>;
}

const HORAS_COLORS: Record<number, { bg: string; text: string; border: string }> = {
  42: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  30: { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  20: { bg: 'bg-orange-50', text: 'text-orange-600', border: 'border-orange-200' },
};

const CARGO_COLORS = [
  { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' },
  { bg: 'bg-teal-50', text: 'text-teal-700', border: 'border-teal-200' },
  { bg: 'bg-rose-50', text: 'text-rose-700', border: 'border-rose-200' },
  { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  { bg: 'bg-indigo-50', text: 'text-indigo-700', border: 'border-indigo-200' },
  { bg: 'bg-cyan-50', text: 'text-cyan-700', border: 'border-cyan-200' },
  { bg: 'bg-lime-50', text: 'text-lime-700', border: 'border-lime-200' },
  { bg: 'bg-pink-50', text: 'text-pink-700', border: 'border-pink-200' },
];

export default function PersonalSummary({ summary }: { summary: Summary }) {
  const topCards = [
    {
      id: 'sum-total',
      label: 'Trabajadores totales',
      value: summary.total,
      icon: Users,
      iconBg: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      id: 'sum-activos',
      label: 'Activos',
      value: summary.activos,
      icon: UserCheck,
      iconBg: 'bg-green-100',
      iconColor: 'text-green-600',
    },
    {
      id: 'sum-inactivos',
      label: 'Inactivos',
      value: summary.inactivos,
      icon: UserX,
      iconBg: 'bg-orange-100',
      iconColor: 'text-orange-500',
    },
  ];

  const horasEntries = Object.entries(summary.horasBreakdown).sort(
    (a, b) => Number(b[0]) - Number(a[0])
  );
  const cargoEntries = Object.entries(summary.cargoBreakdown || {}).sort((a, b) => b[1] - a[1]);

  return (
    <div className="space-y-3">
      {/* Top KPI cards */}
      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        {topCards.map((c) => {
          const Icon = c.icon;
          return (
            <div
              key={c.id}
              className="bg-card rounded-xl border border-border px-3 lg:px-4 py-3 shadow-sm flex items-center justify-center lg:justify-start text-center lg:text-left gap-3"
            >
              <div
                className={`hidden lg:flex w-10 h-10 rounded-full ${c.iconBg} items-center justify-center shrink-0`}
              >
                <Icon size={18} className={c.iconColor} />
              </div>
              <div>
                <p className="text-2xl font-extrabold text-foreground font-tabular leading-tight">
                  {c.value}
                </p>
                <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Cargo breakdown */}
      {cargoEntries.length > 0 && (
        <div className="bg-card rounded-xl border border-border px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Briefcase size={15} className="text-secondary" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Distribución por cargo
            </h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {cargoEntries.map(([cargo, count], idx) => {
              const colors = CARGO_COLORS[idx % CARGO_COLORS.length];
              return (
                <div
                  key={`cargo-${cargo}`}
                  className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl border ${colors.bg} ${colors.border}`}
                >
                  <div className={`text-2xl font-extrabold ${colors.text}`}>{count}</div>
                  <p className={`text-sm font-semibold ${colors.text}`}>{cargo}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Horas contratadas breakdown */}
      {horasEntries.length > 0 && (
        <div className="bg-card rounded-xl border border-border px-5 py-4 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <Clock size={15} className="text-secondary" />
            <h3 className="text-xs font-bold text-foreground uppercase tracking-wider">
              Distribución por horas contratadas
            </h3>
          </div>
          <div className="flex flex-wrap gap-3">
            {horasEntries.map(([horas, count]) => {
              const h = Number(horas);
              const colors = HORAS_COLORS[h] || {
                bg: 'bg-slate-50',
                text: 'text-slate-700',
                border: 'border-slate-200',
              };
              return (
                <div
                  key={`horas-${horas}`}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${colors.bg} ${colors.border}`}
                >
                  <div className={`text-3xl font-extrabold ${colors.text}`}>{count}</div>
                  <div>
                    <p className={`text-sm font-bold ${colors.text}`}>{horas}h</p>
                    <p className="text-xs text-muted-foreground">contratadas</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
