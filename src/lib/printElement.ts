// Imprime solo un elemento de la página. Arma un documento aparte (en un iframe oculto) con
// los estilos de la app y el contenido del elemento, y lo manda a imprimir. Así lo que se
// imprime no depende del diseño de la página (menús, desplazamientos, celular o computador).

interface PrintOptions {
  /** Orientación de la hoja (por defecto vertical) */
  landscape?: boolean;
  /** Título del documento (se ve en el encabezado de la impresión y como nombre del PDF) */
  title?: string;
}

export function buildPrintDocument(el: HTMLElement, opts: PrintOptions = {}): string {
  // Estilos de la app: hojas enlazadas y bloques <style> del <head>
  const styles = Array.from(document.head.querySelectorAll('link[rel="stylesheet"], style'))
    .map((n) => n.outerHTML)
    .join('\n');
  const htmlClass = document.documentElement.className;
  const bodyClass = document.body.className;
  const title = (opts.title ?? document.title).replace(/</g, '&lt;');
  return `<!doctype html>
<html lang="es" class="${htmlClass}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=${opts.landscape ? 1100 : 780}">
<title>${title}</title>
${styles}
<style>
  /* Sin margen de página: así el navegador no agrega su propio encabezado (fecha y título,
     que repetía el título de la hoja) ni el pie con la dirección. El margen lo dan las filas
     vacías de .print-frame, que se repiten arriba y abajo de cada hoja */
  @page { size: A4 ${opts.landscape ? 'landscape' : 'portrait'}; margin: 0; }
  .print-frame { width: 100%; border-collapse: collapse; }
  .print-frame > thead > tr > td, .print-frame > tfoot > tr > td { height: 10mm; padding: 0; }
  .print-frame > tbody > tr > td { padding: 0 10mm; }
  html, body { background: #fff !important; margin: 0; padding: 0; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .print-root { overflow: visible !important; width: 100% !important; }
  /* Los nombres en una sola línea */
  .print-root td { white-space: nowrap; }
  .print-root table { min-width: 0 !important; width: 100% !important; }
  /* Filas compactas y sin cortarse entre hojas */
  .print-root td, .print-root th { padding-top: 3px !important; padding-bottom: 3px !important; }
  .print-root tr, .print-root .week-day-block { break-inside: avoid; page-break-inside: avoid; }
</style>
</head>
<body class="${bodyClass}">
<table class="print-frame">
<thead><tr><td></td></tr></thead>
<tfoot><tr><td></td></tr></tfoot>
<tbody><tr><td><div class="print-root">${el.outerHTML}</div></td></tr></tbody>
</table>
</body>
</html>`;
}

export function printElement(el: HTMLElement, opts: PrintOptions = {}) {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  // Con el ancho de una hoja: en el celular la hoja se arma con el ancho del iframe, y si es
  // angosto la tabla se corta a la derecha y los nombres ocupan dos líneas
  const width = opts.landscape ? 1100 : 780;
  iframe.style.cssText = `position:fixed;left:-10000px;top:0;width:${width}px;height:1100px;border:0;`;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  if (!doc || !win) {
    iframe.remove();
    window.print();
    return;
  }
  doc.open();
  doc.write(buildPrintDocument(el, opts));
  doc.close();

  const cleanup = () => setTimeout(() => iframe.remove(), 1000);
  win.addEventListener('afterprint', cleanup);

  // Se espera a que carguen los estilos y las fuentes antes de imprimir
  const go = () => {
    win.focus();
    win.print();
  };
  if (doc.readyState === 'complete') setTimeout(go, 300);
  else iframe.addEventListener('load', () => setTimeout(go, 300), { once: true });
}
