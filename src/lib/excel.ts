import type ExcelJS from 'exceljs';

// Utilidades Excel basadas en ExcelJS (reemplaza al paquete `xlsx` de npm,
// que está abandonado y tiene vulnerabilidades al leer archivos).

export type CellValue = string | number | boolean | null;

async function loadExcelJS() {
  return (await import('exceljs')).default;
}

// Excel guarda fechas/horas como días desde 1899-12-30; ExcelJS las entrega como Date (UTC).
function dateToSerial(d: Date): number {
  return d.getTime() / 86400000 + 25569;
}

function normalizeCell(value: ExcelJS.CellValue, empty: '' | null): CellValue {
  if (value === null || value === undefined) return empty;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean')
    return value;
  if (value instanceof Date) return dateToSerial(value);
  if (typeof value === 'object') {
    if ('richText' in value) return value.richText.map((t) => t.text).join('');
    if ('formula' in value || 'sharedFormula' in value) {
      const result = (value as ExcelJS.CellFormulaValue).result;
      if (
        result === undefined ||
        (typeof result === 'object' && result !== null && !(result instanceof Date))
      )
        return empty;
      return normalizeCell(result as ExcelJS.CellValue, empty);
    }
    if ('hyperlink' in value) return (value as ExcelJS.CellHyperlinkValue).text ?? empty;
    if ('error' in value) return empty;
  }
  return empty;
}

// CSV simple (RFC 4180) con detección de separador: Excel en español usa ';'
function parseCsv(text: string): string[][] {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i];
    if (inQuotes) {
      if (c === '"' && clean[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') inQuotes = false;
      else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delimiter) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += c;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function padRows<T>(rows: T[][], empty: T): T[][] {
  const width = rows.reduce((max, r) => Math.max(max, r.length), 0);
  return rows.map((r) => (r.length < width ? [...r, ...Array(width - r.length).fill(empty)] : r));
}

/**
 * Lee la primera hoja como matriz de filas (equivalente a `sheet_to_json(ws, { header: 1, defval })`).
 * Acepta .xlsx y .csv. Las fechas/horas se devuelven como número de serie de Excel.
 */
export async function readFirstSheetRows(
  file: File,
  empty: '' | null = ''
): Promise<CellValue[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xls')) {
    throw new Error(
      'El formato .xls (Excel 97-2003) no es compatible. Abre el archivo en Excel y guárdalo como .xlsx.'
    );
  }
  if (name.endsWith('.csv')) {
    const rows = parseCsv(await file.text()).map((r) => r.map((v) => (v === '' ? empty : v)));
    return padRows<CellValue>(rows, empty);
  }

  const ExcelJSLib = await loadExcelJS();
  const wb = new ExcelJSLib.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return [];

  const rows: CellValue[][] = [];
  const width = ws.columnCount;
  for (let r = 1; r <= ws.rowCount; r++) {
    const row = ws.getRow(r);
    const values: CellValue[] = [];
    for (let c = 1; c <= width; c++) values.push(normalizeCell(row.getCell(c).value, empty));
    rows.push(values);
  }
  return rows;
}

export interface SimpleSheet {
  name: string;
  rows: CellValue[][];
  /** Ancho de columnas en caracteres */
  colWidths?: number[];
}

/** Descarga un libro con hojas simples (sin estilos). */
export async function downloadSimpleWorkbook(sheets: SimpleSheet[], fileName: string) {
  const ExcelJSLib = await loadExcelJS();
  const wb = new ExcelJSLib.Workbook();
  sheets.forEach((sheet) => {
    const ws = wb.addWorksheet(sheet.name);
    sheet.rows.forEach((r) => ws.addRow(r));
    sheet.colWidths?.forEach((w, i) => {
      ws.getColumn(i + 1).width = w;
    });
  });
  await downloadWorkbook(wb, fileName);
}

export async function createWorkbook() {
  const ExcelJSLib = await loadExcelJS();
  return new ExcelJSLib.Workbook();
}

/** Genera el archivo y lo descarga en el navegador. */
export async function downloadWorkbook(wb: ExcelJS.Workbook, fileName: string) {
  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
