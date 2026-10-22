// Hoja "Solicitud Vacaciones / Permiso" para imprimir y firmar, igual al formulario de papel
// de DyL, con los datos ya completados. Se abre en una ventana nueva y se manda a imprimir.

export interface HojaPermiso {
  nombre: string;
  cargo: string;
  area: string;
  tipo: 'PERMISO_CG' | 'PERMISO_SG' | 'VACACIONES';
  /** "YYYY-MM-DD" */
  desde: string;
  hasta: string;
  observacion: string;
  /** Fecha de la solicitud, "YYYY-MM-DD" */
  fecha: string;
  /** Si ya se autorizó en la app: fecha de la resolución, "YYYY-MM-DD" */
  autorizada?: string;
}

const esc = (t: string) =>
  t.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );

/** "2026-10-30" → tres casillas: 30 | 10 | 2026 */
function casillas(iso?: string): string {
  const [y, m, d] = iso ? iso.split('-') : ['', '', ''];
  return `<span class="box">${d}</span><span class="box">${m}</span><span class="box">${y}</span>`;
}

const marca = (on: boolean) => `<span class="check">${on ? 'X' : ''}</span>`;

export function imprimirHojaPermiso(h: HojaPermiso) {
  const win = window.open('', '_blank', 'width=820,height=1000');
  if (!win) {
    alert('Permite las ventanas emergentes para imprimir la hoja.');
    return;
  }
  const logo = `${window.location.origin}/assets/images/app_logo.png`;
  const vac = h.tipo === 'VACACIONES';
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8">
<title>Solicitud ${vac ? 'vacaciones' : 'permiso'} - ${esc(h.nombre)}</title>
<style>
  @page { size: letter; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 12.5px; color: #000; margin: 0; }
  .frame { border: 1.5px solid #000; padding: 22px 26px; }
  .head { border: 1.5px solid #000; display: flex; align-items: center; justify-content: space-between; padding: 18px 26px; }
  .head h1 { font-size: 18px; margin: 0; letter-spacing: .3px; }
  .head img { height: 70px; }
  .row { display: flex; align-items: center; gap: 10px; margin: 11px 0; }
  .lbl { font-weight: bold; min-width: 150px; }
  .field { flex: 1; border: 1px solid #000; min-height: 24px; padding: 3px 8px; }
  .box { display: inline-block; width: 64px; height: 24px; border: 1px solid #000; text-align: center; line-height: 22px; margin-right: -1px; }
  .datebar { display: flex; justify-content: flex-end; margin: 14px 0 6px; }
  .datebar .tag { border: 1px solid #000; padding: 2px 18px; font-weight: bold; height: 24px; margin-right: -1px; }
  .check { display: inline-block; width: 80px; height: 24px; border: 1px solid #000; text-align: center; line-height: 22px; font-weight: bold; }
  .opt { display: flex; align-items: center; gap: 12px; margin: 8px 0 8px 160px; }
  .obs { min-height: 48px; }
  .sign { margin: 46px 0 0 auto; width: 55%; border-top: 1px solid #000; text-align: center; padding-top: 3px; }
  .res { border: 1.5px solid #000; padding: 14px 18px; margin-top: 22px; }
  .res h2 { font-size: 16px; margin: 0 0 4px; }
  .muted { color: #555; font-size: 10px; margin-top: 10px; }
  @media print { .noprint { display: none; } }
</style></head><body>
<div class="frame">
  <div class="head"><h1>SOLICITUD VACACIONES / PERMISO</h1><img src="${logo}" alt="DyL"></div>
  <div class="datebar"><span class="tag">FECHA</span>${casillas(h.fecha)}</div>
  <div class="row"><span class="lbl">NOMBRE:</span><span class="field">${esc(h.nombre)}</span></div>
  <div class="row"><span class="lbl">CARGO:</span><span class="field">${esc(h.cargo)}</span>
    <span class="lbl" style="min-width:auto">AREA:</span><span class="field">${esc(h.area)}</span></div>
  <div class="row"><span class="lbl">FECHA CONTRATO DE TRABAJO:</span>${casillas()}</div>
  <div class="row"><span class="lbl">SOLICITA:</span>${marca(!vac)} PERMISO</div>
  <div class="row"><span class="lbl"></span>${marca(vac)} VACACIONES</div>
  <div class="row"><span class="lbl">DESDE EL:</span>${casillas(h.desde)}</div>
  <div class="row"><span class="lbl">HASTA EL:</span>${casillas(h.hasta)}</div>
  <div class="opt"><span style="width:240px;font-weight:bold">CON GOCE DE REMUNERACIONES</span>${marca(h.tipo !== 'PERMISO_SG')}</div>
  <div class="opt"><span style="width:240px;font-weight:bold">SIN GOCE DE REMUNERACIONES</span>${marca(h.tipo === 'PERMISO_SG')}</div>
  <div class="row"><span class="lbl">OBSERVACION:</span><span class="field obs">${esc(h.observacion)}</span></div>
  <div class="sign">FIRMA DEL TRABAJADOR</div>
  <div class="res">
    <h2>RESOLUCION JEFATURA</h2>
    <div class="datebar"><span class="tag">FECHA</span>${casillas(h.autorizada)}</div>
    <div class="row"><span class="lbl">JEFE ÁREA:</span><span class="field"></span></div>
    <div class="row"><span class="lbl">LA PRESENTE SOLICITUD:</span>${marca(!!h.autorizada)} SE AUTORIZA &nbsp; ${marca(false)} SE RECHAZA</div>
    <div class="row"><span class="lbl">MOTIVO DEL RECHAZO:</span><span class="field obs"></span></div>
    <div class="sign">NOMBRE, FIRMA JEFE ÁREA</div>
  </div>
</div>
<p class="muted noprint">Si no se abrió el cuadro de impresión, usa Ctrl+P.</p>
<script>
  const img = document.querySelector('img');
  const go = () => setTimeout(() => window.print(), 150);
  if (img.complete) go(); else { img.onload = go; img.onerror = go; }
</script>
</body></html>`);
  win.document.close();
}
