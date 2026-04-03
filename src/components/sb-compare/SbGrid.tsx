import { useMemo } from 'react';
import type { FieldSpec } from '@/lib/sbParser';
import { getDiffStatus, norm, SKIP_COMPARE_FIELDS } from '@/lib/sbParser';

// Currency field index in EXCHANGE table (position 6 in the flat file format)
const CURRENCY_FIELD_INDEX = 6;

interface Props {
  spec: FieldSpec[];
  rowsA: string[][];
  rowsB: string[][];
  showIssuesOnly: boolean;
  includeJobInfo?: boolean;
  tableName: string;
}
export default function SbGrid({ spec, rowsA, rowsB, showIssuesOnly, includeJobInfo = true, tableName }: Props) {
  // Filter exchange rate rows - we only want to compare USD with USD
  // Skip INR rows in both files
  const filteredRowsA = useMemo(() => {
    // Only apply to EXCHANGE table
    if (norm(tableName).toUpperCase() !== 'EXCHANGE') {
      return rowsA;
    }

    let currencyIdx = spec.findIndex(s => norm(s.cap).toUpperCase().includes('CURRENCY'));
    if (currencyIdx === -1) currencyIdx = 6;

    // Filter out rows that are INR
    return rowsA.filter(rowA => {
      const currency = rowA[currencyIdx] ?? "";
      return norm(currency).toUpperCase() !== 'INR';
    });
  }, [tableName, rowsA, spec]);

  const filteredRowsB = useMemo(() => {
    // Only apply to EXCHANGE table
    if (norm(tableName).toUpperCase() !== 'EXCHANGE') {
      return rowsB;
    }

    let currencyIdx = spec.findIndex(s => norm(s.cap).toUpperCase().includes('CURRENCY'));
    if (currencyIdx === -1) currencyIdx = 6;

    // Filter out rows that are INR
    return rowsB.filter(rowB => {
      const currency = rowB[currencyIdx] ?? "";
      return norm(currency).toUpperCase() !== 'INR';
    });
  }, [tableName, rowsB, spec]);

  const maxRows = Math.max(filteredRowsA.length, filteredRowsB.length);

  // Derive the table cells for each row/column
  const gridRows = useMemo(() => {
    const result = [];

    for (let c = 0; c < spec.length; c++) {
      const fieldSpec = spec[c];
      const cap = norm(fieldSpec.cap);

      if (showIssuesOnly && SKIP_COMPARE_FIELDS.has(cap.toUpperCase())) {
        continue;
      }

      let rowHasIssue = false;
      const cells = [];

      let isJobInfo = false;
      if (!includeJobInfo) {
        const fieldNorm = cap.toLowerCase();
        if (fieldNorm === 'job number' || fieldNorm === 'job date' || fieldNorm === 'job no' || fieldNorm === 'job no.') {
          isJobInfo = true;
        }
      }

      for (let r = 0; r < maxRows; r++) {
        const va = filteredRowsA[r]?.[c] ?? "";
        const vb = filteredRowsB[r]?.[c] ?? "";

        let status = getDiffStatus(va, vb, fieldSpec);
        let hasDiff = status !== "" || norm(va) !== norm(vb);

        if (isJobInfo) {
          status = "";
          hasDiff = false;
        }

        if (hasDiff) rowHasIssue = true;

        cells.push({ va, vb, status, diff: hasDiff });
      }

      if (showIssuesOnly && !rowHasIssue) {
        continue;
      }

      result.push({ cap, cells });
    }
    return result;
  }, [spec, filteredRowsA, rowsB, showIssuesOnly, includeJobInfo, maxRows]);

  const getCellClass = (status: string, diff: boolean) => {
    let base = "border border-border px-3 py-2 whitespace-nowrap text-sm ";
    if (status === 'mandatory') return base + "bg-red-100 text-red-900 font-bold";
    if (status === 'datatype') return base + "bg-orange-100 text-orange-900 font-bold";
    if (status === 'length') return base + "bg-yellow-100 text-yellow-900 font-bold";
    if (status === 'compare' || diff) return base + "bg-purple-100 text-purple-900 font-bold";
    return base;
  };

  return (
    <div className="w-full overflow-auto max-h-[70vh] rounded-md border border-border bg-card">
      <table className="w-max border-collapse">
        <thead className="sticky top-0 z-30 bg-muted">
          <tr>
            <th className="sticky left-0 z-40 bg-muted px-4 py-3 text-left font-semibold border-b border-border shadow-[1px_0_0_0_#e5e7eb]">
              Field
            </th>
            {Array.from({ length: maxRows }).map((_, i) => (
              <optgroup key={i} className="contents">
                <th className="px-4 py-3 text-left font-semibold border-b border-l border-border bg-muted">A{i + 1}</th>
                <th className="px-4 py-3 text-left font-semibold border-b border-l border-border bg-muted">B{i + 1}</th>
              </optgroup>
            ))}
          </tr>
        </thead>
        <tbody>
          {gridRows.map((row, i) => (
            <tr key={i} className="hover:bg-muted/50 transition-colors">
              <td className="sticky left-0 z-20 bg-background px-4 py-2 font-medium border-b border-border shadow-[1px_0_0_0_#e5e7eb]">
                {row.cap}
              </td>
              {row.cells.map((cell, cIdx) => (
                <optgroup key={cIdx} className="contents">
                  <td className={getCellClass(cell.status, cell.diff)}>{cell.va}</td>
                  <td className={getCellClass(cell.status, cell.diff)}>{cell.vb}</td>
                </optgroup>
              ))}
            </tr>
          ))}
          {gridRows.length === 0 && (
            <tr>
              <td colSpan={maxRows * 2 + 1} className="p-8 text-center text-muted-foreground">
                No differences found.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
