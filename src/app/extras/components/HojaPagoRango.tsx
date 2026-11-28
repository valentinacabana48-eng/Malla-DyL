import React from 'react';
import { pesos } from '@/lib/extras';

// Hoja de pago de extras de varios días: cada persona con sus días (fecha, horario y monto),
// el total de la persona y una sola firma. Una hoja por área.

export interface DiaPago {
  id: string;
  fecha: string;
  inicio: string;
  fin: string;
  colacion: number;
  monto: number;
}
export interface PersonaPago {
  key: string;
  nombre: string;
  cargo: string;
  dias: DiaPago[];
  total: number;
}
export interface GrupoPago {
  area: string;
  /** "Cajeras", "Bodegueros"… para el título; '' si no se nombra */
  titulo: string;
  personas: PersonaPago[];
  total: number;
}

const DOW = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/** "2026-11-26" → "Jue 26/11" */
export function fechaCorta(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  return `${DOW[new Date(y, m - 1, d).getDay()]} ${d}/${String(m).padStart(2, '0')}`;
}

export default function HojaPagoRango({
  id,
  titulo,
  subtitulo,
  grupos,
  total,
}: {
  id?: string;
  /** "jueves 26 al domingo 29 de noviembre" */
  titulo: string;
  subtitulo: string;
  grupos: GrupoPago[];
  total: number;
}) {
  const lista = grupos.length === 0 ? [{ area: '', titulo: '', personas: [], total: 0 }] : grupos;
  return (
    <div id={id} style={{ fontFamily: 'sans-serif', color: '#111' }}>
      {lista.map((g, gi) => (
        <div
          key={g.area || 'vacio'}
          style={gi > 0 ? { breakBefore: 'page', pageBreakBefore: 'always' } : undefined}
        >
          <h1 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '2px' }}>
            Pago extra — {titulo}
            {g.titulo ? ` — ${g.titulo}` : ''}
          </h1>
          <p style={{ fontSize: '11px', color: '#555', marginBottom: '12px' }}>{subtitulo}</p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '11px' }}>
            <thead>
              <tr style={{ background: '#f3f4f6' }}>
                <th style={{ ...P_TH, width: '28px' }}>N°</th>
                <th style={{ ...P_TH, textAlign: 'left' }}>Nombre</th>
                <th style={P_TH}>Fecha</th>
                <th style={P_TH}>Horario</th>
                <th style={{ ...P_TH, textAlign: 'right' }}>Monto</th>
                <th style={{ ...P_TH, width: '28%' }}>Firma</th>
              </tr>
            </thead>
            {g.personas.length === 0 ? (
              <tbody>
                <tr>
                  <td colSpan={6} style={{ ...P_TD, textAlign: 'center', color: '#888' }}>
                    No hay extras en estos días.
                  </td>
                </tr>
              </tbody>
            ) : (
              g.personas.map((p, i) => {
                const varios = p.dias.length > 1;
                const filas = p.dias.length + (varios ? 1 : 0);
                const fin = { borderBottom: '1px solid #9ca3af' };
                return (
                  // Cada persona en su propio bloque, para que no se corte entre hojas
                  <tbody key={p.key} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                    {p.dias.map((dia, di) => {
                      const ultima = !varios && di === p.dias.length - 1;
                      const linea = ultima ? fin : {};
                      return (
                        <tr key={dia.id}>
                          {di === 0 && (
                            <>
                              <td
                                rowSpan={filas}
                                style={{
                                  ...P_TD,
                                  ...fin,
                                  textAlign: 'center',
                                  verticalAlign: 'top',
                                }}
                              >
                                {i + 1}
                              </td>
                              <td
                                rowSpan={filas}
                                style={{ ...P_TD, ...fin, fontWeight: '600', verticalAlign: 'top' }}
                              >
                                {p.nombre}
                                {p.cargo && (
                                  <div
                                    style={{ fontSize: '9px', color: '#6b7280', fontWeight: '400' }}
                                  >
                                    {p.cargo}
                                  </div>
                                )}
                              </td>
                            </>
                          )}
                          <td style={{ ...P_DIA, ...linea, textAlign: 'center' }}>
                            {fechaCorta(dia.fecha)}
                          </td>
                          <td style={{ ...P_DIA, ...linea, textAlign: 'center' }}>
                            {dia.inicio} a {dia.fin}
                            {dia.colacion ? (
                              <div style={{ fontSize: '9px', color: '#6b7280' }}>
                                colación {dia.colacion} min
                              </div>
                            ) : null}
                          </td>
                          <td style={{ ...P_DIA, ...linea, textAlign: 'right', fontWeight: '700' }}>
                            {pesos(dia.monto)}
                          </td>
                          {di === 0 && (
                            <td
                              rowSpan={filas}
                              style={{
                                ...P_TD,
                                ...fin,
                                verticalAlign: 'bottom',
                                paddingBottom: '8px',
                              }}
                            >
                              <div style={{ borderBottom: '1.2px solid #111', height: '26px' }} />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                    {varios && (
                      <tr>
                        <td
                          colSpan={2}
                          style={{ ...P_DIA, ...fin, textAlign: 'right', fontWeight: '700' }}
                        >
                          Total {p.dias.length} días
                        </td>
                        <td
                          style={{
                            ...P_DIA,
                            ...fin,
                            textAlign: 'right',
                            fontWeight: '800',
                            fontSize: '12px',
                          }}
                        >
                          {pesos(p.total)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })
            )}
            {g.personas.length > 0 && (
              <tfoot>
                <tr>
                  <td style={P_TOTAL} />
                  <td colSpan={3} style={P_TOTAL}>
                    Total {g.titulo ? g.titulo.toLocaleLowerCase('es') : 'a pagar'}
                  </td>
                  <td style={{ ...P_TOTAL, textAlign: 'right' }}>{pesos(g.total)}</td>
                  <td style={P_TOTAL} />
                </tr>
              </tfoot>
            )}
          </table>
          {lista.length > 1 && gi === lista.length - 1 && (
            <p
              style={{ marginTop: '14px', fontSize: '12px', fontWeight: '700', textAlign: 'right' }}
            >
              Total de todas las áreas: {pesos(total)}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

const P_TH: React.CSSProperties = {
  textAlign: 'center',
  padding: '5px 6px',
  borderBottom: '2px solid #d1d5db',
  fontWeight: '700',
  fontSize: '10px',
  textTransform: 'uppercase',
};
const P_TD: React.CSSProperties = {
  padding: '6px',
  height: '44px',
};
/** Cada día de una persona: más bajo que la fila de una sola persona */
const P_DIA: React.CSSProperties = {
  padding: '4px 6px',
  height: '24px',
  borderBottom: '1px solid #f0f0f0',
};
const P_TOTAL: React.CSSProperties = {
  padding: '6px',
  borderTop: '2px solid #374151',
  fontWeight: '700',
  fontSize: '12px',
  textTransform: 'uppercase',
};
