import * as XLSX from 'xlsx';

export interface ParsedFile {
  name: string;
  rows: Record<string, unknown>[];
  columns: string[];
  rowCount: number;
  colCount: number;
}

export async function parseFile(file: File): Promise<ParsedFile> {
  const ext = file.name.split('.').pop()?.toLowerCase();
  if (ext === 'csv') return parseCSV(file);
  return parseExcel(file);
}

async function parseCSV(file: File): Promise<ParsedFile> {
  const text = await file.text();
  const wb = XLSX.read(text, { type: 'string' });
  return extractSheet(wb, file.name);
}

async function parseExcel(file: File): Promise<ParsedFile> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: 'array' });
  return extractSheet(wb, file.name);
}

function extractSheet(wb: XLSX.WorkBook, name: string): ParsedFile {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const columns = rows.length > 0 ? Object.keys(rows[0]) : [];
  return { name, rows, columns, rowCount: rows.length, colCount: columns.length };
}
