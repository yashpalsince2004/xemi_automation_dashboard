import { useMemo } from 'react';
import type { FieldSpec } from '@/lib/sbparser';
import { getDiffStatus, norm, SKIP_COMPARE_FIELDS } from '@/lib/sbparser';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';



function getMatchScore(rowA: string[], rowB: string[], spec: FieldSpec[]) {
  let score = 0;
  spec.forEach((colSpec, idx) => {
    if (SKIP_COMPARE_FIELDS.has(norm(colSpec.cap).toUpperCase())) return;
    const va = rowA[idx] ?? "";
    const vb = rowB[idx] ?? "";
    if (getDiffStatus(va, vb, colSpec) === "") { // In frontend logic, getDiffStatus returns string, empty string means no diff for the purpose of basic comparison, wait but diff also checks exact match
      // Actually, frontend getDiffStatus returns string enum ('mandatory', 'datatype', 'length', 'compare', '')
      // Lets do a safer match check:
      if (norm(va) === norm(vb) || getDiffStatus(va, vb, colSpec) === "") {
        score++;
      }
    }
  });
  return score;
}

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

  
  const { pairedA, pairedB, missingRows, extraRows } = useMemo(() => {
    let availableB = [...filteredRowsB];
    let pairedA = [];
    let pairedB = [];
    let missingRows = [];

    // Pass 1: Pair rowsA with the best matching rowsB
    filteredRowsA.forEach((rA, origIdx) => {
      let bestIdx = -1;
      let bestScore = -1;

      for (let i = 0; i < availableB.length; i++) {
        let score = getMatchScore(rA, availableB[i], spec);
        if (score > bestScore) {
          bestScore = score;
          bestIdx = i;
        }
      }

      if (bestIdx !== -1 && bestScore > 0) { // Assume >0 is enough to link
        pairedA.push(rA);
        pairedB.push(availableB[bestIdx]);
        availableB.splice(bestIdx, 1);
      } else {
        missingRows.push({ row: rA, origIdx });
      }
    });

    // Pass 2: Remaining rows in availableB are extra
    let extraRows = availableB.map(rB => ({ row: rB }));

    return { pairedA, pairedB, missingRows, extraRows };
  }, [filteredRowsA, filteredRowsB, spec]);

  const maxRows = pairedA.length;


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
        const va = pairedA[r]?.[c] ?? "";
        const vb = pairedB[r]?.[c] ?? "";

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
  }, [spec, pairedA, pairedB, showIssuesOnly, includeJobInfo, maxRows]);

  const getCellClass = (status: string, diff: boolean) => {
    let base = "border border-border px-3 py-2 whitespace-nowrap text-sm ";
    if (status === 'mandatory') return base + "bg-red-100 text-red-900 font-bold";
    if (status === 'datatype') return base + "bg-orange-100 text-orange-900 font-bold";
    if (status === 'length') return base + "bg-yellow-100 text-yellow-900 font-bold";
    if (status === 'compare' || diff) return base + "bg-purple-100 text-purple-900 font-bold";
    return base;
  };

  return (
    <div>
      {missingRows.length > 0 && (
        <div className="mb-6 p-4 rounded-md border border-red-200 bg-red-50/50">
          <h4 className="text-red-800 font-semibold mb-2">Missing in Generated ({missingRows.length} items)</h4>
          <Accordion type="single" collapsible className="w-full">
            {missingRows.map((m, idx) => (
              <AccordionItem key={idx} value={"missing-" + idx} className="border-red-200">
                <AccordionTrigger className="text-sm font-medium text-red-700 py-2 hover:no-underline hover:bg-red-100/50 px-2 rounded">
                  View Missing {tableName} Item {m.origIdx + 1}
                </AccordionTrigger>
                <AccordionContent className="pt-2 px-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {spec.map((colSpec, cIdx) => {
                      const val = m.row[cIdx];
                      if (!val) return null;
                      return (
                        <div key={cIdx} className="text-xs bg-white rounded p-2 shadow-sm border border-red-100">
                          <span className="font-semibold text-red-900/70 block mb-0.5">{norm(colSpec.cap)}</span>
                          <span className="text-slate-800 break-words">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}

      {extraRows.length > 0 && (
        <div className="mb-6 p-4 rounded-md border border-orange-200 bg-orange-50/50">
          <h4 className="text-orange-800 font-semibold mb-2">Extra in Generated ({extraRows.length} items)</h4>
          <Accordion type="single" collapsible className="w-full">
            {extraRows.map((e, idx) => (
              <AccordionItem key={idx} value={"extra-" + idx} className="border-orange-200">
                <AccordionTrigger className="text-sm font-medium text-orange-700 py-2 hover:no-underline hover:bg-orange-100/50 px-2 rounded">
                  View Extra {tableName} Item {idx + 1}
                </AccordionTrigger>
                <AccordionContent className="pt-2 px-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {spec.map((colSpec, cIdx) => {
                      const val = e.row[cIdx];
                      if (!val) return null;
                      return (
                        <div key={cIdx} className="text-xs bg-white rounded p-2 shadow-sm border border-orange-100">
                          <span className="font-semibold text-orange-900/70 block mb-0.5">{norm(colSpec.cap)}</span>
                          <span className="text-slate-800 break-words">{val}</span>
                        </div>
                      );
                    })}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      )}
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
    </div>
  );
}
