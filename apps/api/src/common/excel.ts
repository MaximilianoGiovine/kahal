import * as ExcelJS from 'exceljs';
import { Response } from 'express';

export const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1C1917' } };

export function newWorkbook() {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Kahal';
  wb.created = new Date();
  return wb;
}

/** Hoja con encabezado estilizado, fila fija y autofiltro. */
export function addTableSheet(
  wb: ExcelJS.Workbook,
  name: string,
  columns: { header: string; key: string; width?: number; numFmt?: string }[],
  rows: Record<string, unknown>[],
) {
  const ws = wb.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  ws.columns = columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16, style: c.numFmt ? { numFmt: c.numFmt } : {} }));
  ws.addRows(rows);
  styleHeader(ws.getRow(1));
  if (rows.length) {
    ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  }
  return ws;
}

export function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle' };
  row.height = 20;
}

export async function sendWorkbook(res: Response, wb: ExcelJS.Workbook, filename: string) {
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
}

export const MONEY_FMT = '#,##0.00;[Red]-#,##0.00';
export const DATE_FMT = 'dd/mm/yyyy';
