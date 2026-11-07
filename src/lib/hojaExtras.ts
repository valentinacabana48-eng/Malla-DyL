// Impresión del módulo Extras, en dos hojas:
// 1) El horario del día de la sucursal, con los extras marcados con la etiqueta EXTRA.
// 2) El listado de quienes cobran extra, con el monto y un espacio para firmar.
// Se abre en una ventana nueva y se manda a imprimir (como la hoja de permisos).

export interface FilaHorario {
  nombre: string;
  area: string;
  cargo: string;
  /** "HH:MM" */
  inicio: string;
  fin: string;
  extra: boolean;
  nota?: string;
}

export interface FilaPago {
  nombre: string;
  rut: string;
  cargo: string;
  inicio: string;
  fin: string;
  monto: number;
}

export interface HojaExtras {
  /** "YYYY-MM-DD" */
  fecha: string;
  sucursal: string;
  /** Si se filtró por área, cuál */
  area?: string;
  horario: FilaHorario[];
  pagos: FilaPago[];
}

const esc = (t: string) =>
  (t || '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

const DOW = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

/** "2026-11-07" → "sábado 7 de noviembre de 2026" */
export function fechaLargaAnio(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return `${DOW[dt.getDay()]} ${d} de ${MES[m - 1]} de ${y}`;
}

/** 25000 → "$25.000" */
export const pesos = (n: number) => `$${Math.round(n).toLocaleString('es-CL')}`;

export function imprimirHojaExtras(h: HojaExtras) {
  const win = window.open('', '_blank', 'width=900,height=1000');
  if (!win) {
    alert('Permite las ventanas emergentes para imprimir.');
    return;
  }
  const logo = `${window.location.origin}/assets/images/descarga__1_-1784608578251.png`;
  const fecha = fechaLargaAnio(h.fecha);
  const sub = `${esc(h.sucursal)}${h.area ? ` · ${esc(h.area)}` : ''} · ${fecha}`;
  const total = h.pagos.reduce((s, p) => s + p.monto, 0);

  const filasHorario = h.horario.length
    ? h.horario
        .map(
          (f) => `<tr class="${f.extra ? 'ex' : ''}">
  <td class="nom">${esc(f.nombre)}${f.extra ? ' <span class="tag">EXTRA</span>' : ''}${
    f.nota ? `<div class="nota">${esc(f.nota)}</div>` : ''
  }</td>
  <td>${esc(f.cargo || f.area)}</td>
  <td class="c">${esc(f.inicio)}</td>
  <td class="c">${esc(f.fin)}</td>
</tr>`
        )
        .join('')
    : '<tr><td colspan="4" class="c vacio">Nadie tiene turno este día.</td></tr>';

  const filasPago = h.pagos.length
    ? h.pagos
        .map(
          (p, i) => `<tr>
  <td class="c">${i + 1}</td>
  <td class="nom">${esc(p.nombre)}${p.cargo ? `<div class="nota">${esc(p.cargo)}</div>` : ''}</td>
  <td class="c">${esc(p.rut)}</td>
  <td class="c">${esc(p.inicio)} a ${esc(p.fin)}</td>
  <td class="r">${pesos(p.monto)}</td>
  <td class="firma"></td>
</tr>`
        )
        .join('')
    : '<tr><td colspan="6" class="c vacio">No hay extras este día.</td></tr>';

  const head = (titulo: string) =>
    `<div class="head"><div><h1>${titulo}</h1><p>${sub}</p></div><img src="${logo}" alt="DyL"></div>`;

  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Extras ${esc(h.sucursal)} ${esc(h.fecha)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: letter; margin: 12mm; }
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: 'Montserrat', Arial, Helvetica, sans-serif; font-size: 12px; font-weight: 500; color: #1a1a1a; margin: 0; }
  .hoja + .hoja { break-before: page; page-break-before: always; }
  .head { display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #1a1a1a; padding-bottom: 8px; margin-bottom: 12px; }
  .head h1 { font-size: 18px; font-weight: 800; margin: 0; letter-spacing: .5px; text-transform: uppercase; }
  .head p { margin: 3px 0 0; font-size: 12px; font-weight: 600; color: #444; }
  .head p::first-letter { text-transform: uppercase; }
  .head img { height: 54px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; letter-spacing: .5px; text-transform: uppercase; border-bottom: 1.5px solid #1a1a1a; padding: 6px; }
  td { border-bottom: 1px solid #ccc; padding: 6px; vertical-align: middle; }
  tr { break-inside: avoid; page-break-inside: avoid; }
  .c { text-align: center; } .r { text-align: right; white-space: nowrap; }
  th.c { text-align: center; } th.r { text-align: right; }
  .nom { font-weight: 700; }
  .nota { font-weight: 500; font-size: 10px; color: #555; margin-top: 1px; }
  tr.ex td { background: #fff4d6; }
  .tag { display: inline-block; margin-left: 6px; padding: 1px 7px; border: 1.5px solid #b45309; border-radius: 4px; color: #b45309; font-size: 10px; font-weight: 800; letter-spacing: 1px; vertical-align: 1px; }
  .resumen { margin-top: 10px; font-size: 11px; color: #444; }
  .pagos td { height: 46px; }
  .firma { width: 30%; }
  .pagos td.firma { border-bottom: 1px solid #1a1a1a; }
  .total td { border-bottom: none; border-top: 2px solid #1a1a1a; font-weight: 800; font-size: 13px; height: auto; }
  .vacio { color: #777; padding: 20px; }
  .muted { color: #555; font-size: 10px; margin-top: 10px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<section class="hoja">
  ${head('Horario del día')}
  <table>
    <thead><tr><th>Nombre</th><th>Cargo</th><th class="c">Entrada</th><th class="c">Salida</th></tr></thead>
    <tbody>${filasHorario}</tbody>
  </table>
  <p class="resumen">${h.horario.filter((f) => !f.extra).length} con turno · ${
    h.horario.filter((f) => f.extra).length
  } extra${h.horario.filter((f) => f.extra).length === 1 ? '' : 's'}</p>
</section>
<section class="hoja">
  ${head('Pago de extras')}
  <table class="pagos">
    <thead><tr><th class="c">N°</th><th>Nombre</th><th class="c">RUT</th><th class="c">Horario</th><th class="r">Monto</th><th class="c">Firma</th></tr></thead>
    <tbody>${filasPago}</tbody>
    ${
      h.pagos.length
        ? `<tfoot><tr class="total"><td></td><td colspan="3">TOTAL A PAGAR</td><td class="r">${pesos(total)}</td><td></td></tr></tfoot>`
        : ''
    }
  </table>
</section>
<p class="muted noprint">Si no se abrió el cuadro de impresión, usa Ctrl+P.</p>
<script>
  const img = document.querySelector('img');
  const logoListo = img.complete ? Promise.resolve() : new Promise((r) => { img.onload = r; img.onerror = r; });
  Promise.race([Promise.all([logoListo, document.fonts.ready]), new Promise((r) => setTimeout(r, 2500))])
    .then(() => setTimeout(() => window.print(), 150));
</script>
</body></html>`);
  win.document.close();
}
