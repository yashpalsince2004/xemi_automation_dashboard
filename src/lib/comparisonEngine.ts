import type { ParsedFile } from './fileParser';

export interface MismatchDetail {
  rowKey: string;
  column: string;
  valueA: unknown;
  valueB: unknown;
  reason: string;
  typeA: string;
  typeB: string;
}

export interface ComparisonResult {
  totalA: number;
  totalB: number;
  matched: number;
  mismatched: number;
  missingInB: number;
  extraInB: number;
  mismatches: MismatchDetail[];
  missingRows: Record<string, unknown>[];
  extraRows: Record<string, unknown>[];
  schemaDiff: { column: string; inA: boolean; inB: boolean }[];
  columnMismatchCounts: Record<string, number>;
  failureCategories: Record<string, number>;
  matchRateByRow: number[];
}

function getType(v: unknown): string {
  if (v === null || v === undefined || v === '') return 'null';
  if (typeof v === 'number' || (!isNaN(Number(v)) && String(v).trim() !== '')) return 'number';
  return typeof v;
}

export function compareFiles(
  fileA: ParsedFile,
  fileB: ParsedFile,
  keyColumn: string
): ComparisonResult {
  const mapB = new Map<string, Record<string, unknown>>();
  fileB.rows.forEach(r => mapB.set(String(r[keyColumn] ?? ''), r));

  const allCols = Array.from(new Set([...fileA.columns, ...fileB.columns]));
  const schemaDiff = allCols
    .filter(c => !fileA.columns.includes(c) || !fileB.columns.includes(c))
    .map(c => ({ column: c, inA: fileA.columns.includes(c), inB: fileB.columns.includes(c) }));

  const mismatches: MismatchDetail[] = [];
  const missingRows: Record<string, unknown>[] = [];
  const matchedKeys = new Set<string>();
  const columnMismatchCounts: Record<string, number> = {};
  const failureCategories: Record<string, number> = {
    'Type Mismatch': 0, 'Value Mismatch': 0, 'Null vs Value': 0,
    'Row Missing': 0, 'Extra Row': 0, 'Extra Column': 0,
  };
  const matchRateByRow: number[] = [];
  let matched = 0;

  const sharedCols = allCols.filter(c => fileA.columns.includes(c) && fileB.columns.includes(c) && c !== keyColumn);

  for (const rowA of fileA.rows) {
    const key = String(rowA[keyColumn] ?? '');
    const rowB = mapB.get(key);
    if (!rowB) {
      missingRows.push(rowA);
      failureCategories['Row Missing']++;
      matchRateByRow.push(0);
      continue;
    }
    matchedKeys.add(key);
    let rowHasMismatch = false;
    let colMatches = 0;

    for (const col of sharedCols) {
      const vA = rowA[col], vB = rowB[col];
      const tA = getType(vA), tB = getType(vB);
      if (String(vA) === String(vB)) { colMatches++; continue; }
      rowHasMismatch = true;
      columnMismatchCounts[col] = (columnMismatchCounts[col] || 0) + 1;

      let reason: string;
      let category: string;
      if ((tA === 'null') !== (tB === 'null')) {
        reason = `Null vs Value: File A has ${tA === 'null' ? 'null' : `"${vA}"`}, File B has ${tB === 'null' ? 'null' : `"${vB}"`}`;
        category = 'Null vs Value';
      } else if (tA !== tB) {
        reason = `Type mismatch: expected ${tA}, found ${tB}`;
        category = 'Type Mismatch';
      } else {
        reason = `Value mismatch: "${vA}" ≠ "${vB}"`;
        category = 'Value Mismatch';
      }
      failureCategories[category]++;
      mismatches.push({ rowKey: key, column: col, valueA: vA, valueB: vB, reason, typeA: tA, typeB: tB });
    }

    if (!rowHasMismatch) matched++;
    matchRateByRow.push(sharedCols.length > 0 ? (colMatches / sharedCols.length) * 100 : 100);
  }

  const extraRows = fileB.rows.filter(r => !matchedKeys.has(String(r[keyColumn] ?? '')) && !missingRows.some(m => String(m[keyColumn]) === String(r[keyColumn])));
  failureCategories['Extra Row'] = extraRows.length;
  failureCategories['Extra Column'] = schemaDiff.length;

  return {
    totalA: fileA.rowCount, totalB: fileB.rowCount,
    matched, mismatched: mismatches.length > 0 ? fileA.rowCount - matched - missingRows.length : 0,
    missingInB: missingRows.length, extraInB: extraRows.length,
    mismatches, missingRows, extraRows, schemaDiff,
    columnMismatchCounts, failureCategories, matchRateByRow,
  };
}

export function exportDiffCSV(result: ComparisonResult): string {
  const headers = ['Row Key', 'Column', 'Value A', 'Value B', 'Reason'];
  const lines = [headers.join(',')];
  for (const m of result.mismatches) {
    lines.push([m.rowKey, m.column, String(m.valueA), String(m.valueB), `"${m.reason}"`].join(','));
  }
  return lines.join('\n');
}
