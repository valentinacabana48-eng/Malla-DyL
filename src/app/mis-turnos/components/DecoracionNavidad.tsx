'use client';
import React, { useEffect, useState } from 'react';
import { temaDelMes, type Tema } from '@/lib/temaMes';

/** Tema del mes, leído en el navegador (en el servidor no hay tema) */
export function useTema(): Tema {
  const [tema, setTema] = useState<Tema>(null);
  useEffect(() => setTema(temaDelMes()), []);
  return tema;
}

// Número "al azar" pero siempre igual, para que la nieve no salte en cada dibujo
function azar(n: number) {
  const x = Math.sin(n * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

const ESTILOS = `
@keyframes dyl-nieve { from { transform: translate3d(0,-12px,0); } to { transform: translate3d(var(--deriva),var(--caida),0); } }
@keyframes dyl-brillo { 0%,100% { opacity: 1; } 50% { opacity: .45; } }
@media (prefers-reduced-motion: reduce) { .dyl-copo, .dyl-ampolleta { animation: none !important; } }
`;

/** Copos de nieve cayendo (no se pueden tocar: pasan por detrás de los clics) */
export function Nieve({ cantidad = 26, caida = '260px' }: { cantidad?: number; caida?: string }) {
  return (
    <span className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      <style>{ESTILOS}</style>
      {Array.from({ length: cantidad }, (_, i) => {
        const tam = 3 + Math.round(azar(i + 1) * 5);
        return (
          <span
            key={i}
            className="dyl-copo absolute rounded-full bg-white"
            style={
              {
                left: `${Math.round(azar(i + 7) * 100)}%`,
                top: `${Math.round(azar(i + 3) * 80) - 10}%`,
                width: tam,
                height: tam,
                opacity: 0.35 + azar(i + 11) * 0.5,
                '--caida': caida,
                '--deriva': `${Math.round((azar(i + 5) - 0.5) * 40)}px`,
                animation: `dyl-nieve ${6 + azar(i + 13) * 6}s linear ${-azar(i + 17) * 10}s infinite`,
              } as React.CSSProperties
            }
          />
        );
      })}
    </span>
  );
}

const COLORES = ['#ef4444', '#facc15', '#22c55e', '#38bdf8', '#f97316'];

/** Guirnalda de luces de colores colgando arriba */
export function Guirnalda({ luces = 18 }: { luces?: number }) {
  return (
    <span className="pointer-events-none absolute top-0 inset-x-0 h-7" aria-hidden="true">
      <style>{ESTILOS}</style>
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 100 28"
        preserveAspectRatio="none"
      >
        <path
          d={Array.from({ length: luces }, (_, i) => {
            const x0 = (i / luces) * 100;
            const x1 = ((i + 1) / luces) * 100;
            return `${i === 0 ? 'M0 4' : ''} Q${(x0 + x1) / 2} 20 ${x1} 4`;
          }).join(' ')}
          fill="none"
          stroke="rgba(15,23,42,0.55)"
          strokeWidth="1.2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      {Array.from({ length: luces }, (_, i) => {
        const color = COLORES[i % COLORES.length];
        return (
          <span
            key={i}
            className="dyl-ampolleta absolute w-[9px] h-[13px] rounded-b-full rounded-t-[40%]"
            style={{
              left: `calc(${((i + 0.5) / luces) * 100}% - 4.5px)`,
              top: 11,
              background: color,
              boxShadow: `0 0 8px 2px ${color}99`,
              animation: `dyl-brillo ${1.6 + (i % 3) * 0.5}s ease-in-out ${(i % 4) * 0.35}s infinite`,
            }}
          >
            <span className="absolute -top-[3px] left-[2px] w-[5px] h-[4px] rounded-sm bg-slate-500" />
          </span>
        );
      })}
    </span>
  );
}

/** Gorro de Viejito Pascuero para poner sobre el logo */
export function GorroPascuero({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 48" className={className} aria-hidden="true">
      <path d="M8 38 C 14 14, 34 2, 52 10 C 46 16, 46 26, 50 34 Z" fill="#dc2626" />
      <path d="M52 10 C 56 14, 58 22, 54 30" fill="none" stroke="#b91c1c" strokeWidth="3" />
      <circle cx="54" cy="32" r="6" fill="#fff" />
      <rect x="4" y="34" width="50" height="11" rx="5.5" fill="#fff" />
      <rect x="4" y="34" width="50" height="11" rx="5.5" fill="none" stroke="#e2e8f0" />
    </svg>
  );
}

/** Pinos nevados para el borde de la pantalla de ingreso */
export function Pinos({ className = '' }: { className?: string }) {
  const pino = (x: number, alto: number, color: string) => {
    const a = alto;
    const b = x;
    return (
      <g key={x}>
        <rect x={b - 3} y={100 - 10} width="6" height="10" fill="#7c4a24" />
        <path
          d={`M${b} ${100 - a} L${b + a * 0.32} ${100 - a * 0.55} L${b - a * 0.32} ${100 - a * 0.55} Z`}
          fill={color}
        />
        <path
          d={`M${b} ${100 - a * 0.75} L${b + a * 0.42} ${100 - a * 0.3} L${b - a * 0.42} ${100 - a * 0.3} Z`}
          fill={color}
        />
        <path
          d={`M${b} ${100 - a * 0.5} L${b + a * 0.52} ${90} L${b - a * 0.52} ${90} Z`}
          fill={color}
        />
        <path
          d={`M${b} ${100 - a} L${b + a * 0.12} ${100 - a * 0.84} L${b - a * 0.12} ${100 - a * 0.84} Z`}
          fill="#fff"
          opacity="0.9"
        />
      </g>
    );
  };
  return (
    <svg viewBox="0 0 200 100" className={className} aria-hidden="true">
      {pino(40, 70, '#14532d')}
      {pino(95, 92, '#166534')}
      {pino(150, 62, '#14532d')}
      <text x="95" y="13" textAnchor="middle" fontSize="16" fill="#facc15">
        ★
      </text>
    </svg>
  );
}

/** Pequeño adorno de algunos días especiales del calendario de diciembre */
export function adornoDia(dia: number): string {
  if (dia === 24 || dia === 25) return '🎄';
  if (dia === 31) return '🎉';
  return '';
}
