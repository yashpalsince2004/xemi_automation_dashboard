import * as XLSX from 'xlsx';

export const RS = String.fromCharCode(29);

export interface FieldSpec {
  cap: string;
  type: string;
  len: number | null;
  final: string;
}

export type SbSpecs = Record<string, FieldSpec[]>;
export type SbData = Record<string, string[][]>;

export interface IssueRow {
  Segment: string;
  "Field Name": string;
  "Invoice Sr. Number"?: string;
  "Item Sr Number in Invoice"?: string;
  "Serial No"?: string;
  "A Value": string;
  "B Value": string;
  Status: string;
}

export const SKIP_ON_ISSUES_ONLY = [
  "CUSTOM HOUSE CODE",
  "JOB NUMBER",
  "JOB DATE",
  "SB NO",
  "SB DATE",
  "CHA LICENSE NUMBER",
  "IMPORTER EXPORTER CODE",
  "BRANCH SR NO OF EXPORTER",
  "IMP. EXP. NAME",
  "IMP. EXP. ADDRESS1",
  "IMP. EXP. ADDRESS2",
  "IMP. EXP. CITY",
  "IMP. EXP. STATE",
  "IMP. EXP. PIN"
].map(x => x.toUpperCase());

export const SKIP_COMPARE_FIELDS = new Set([
  "MESSAGE TYPE",
  "CUSTOM HOUSE CODE",
  "USER JOB NO.",
  "USER JOB DATE"
]);

export function normalizeTableName(name: string): string {
  name = name.trim().toUpperCase();
  if (name === "ITEMS" || name === "ITEM") return "ITEM";
  return name;
}

export function norm(v: any): string {
  if (v === undefined || v === null) return "";
  return v.toString().trim();
}

export function isNumber(v: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(v);
}

export async function loadSbSpecs(arrayBuffer: ArrayBuffer): Promise<SbSpecs> {
  const wb = XLSX.read(arrayBuffer, { type: "array" });
  const sbSpecs: SbSpecs = {};

  wb.SheetNames.forEach(sh => {
    const rows = XLSX.utils.sheet_to_json<any[]>(wb.Sheets[sh], { header: 1 });
    if (!rows.length) return;

    const h = rows[0] || [];
    let colIndexes = {
      cap: h.findIndex((v: any) => /field/i.test(v?.toString() || "")),
      type: h.findIndex((v: any) => /type/i.test(v?.toString() || "")),
      len: h.findIndex((v: any) => /length?/i.test(v?.toString() || "")),
      final: h.findIndex((v: any) => /mandatory|final/i.test(v?.toString() || "")),
    };

    if (colIndexes.cap === -1) colIndexes.cap = 0;
    if (colIndexes.type === -1) colIndexes.type = 1;
    if (colIndexes.len === -1) colIndexes.len = 2;
    if (colIndexes.final === -1) colIndexes.final = 3;

    const fields = rows.slice(1).filter(r => r && r.length).map(r => {
      const lenVal = parseInt(r[colIndexes.len]);
      return {
        cap: (r[colIndexes.cap] || "").toString(),
        type: (r[colIndexes.type] || "").toString(),
        len: isNaN(lenVal) ? null : lenVal,
        final: ("" + (r[colIndexes.final] || "")).toUpperCase().startsWith('M') ? "M" : ""
      };
    });

    const normName = normalizeTableName(sh);
    sbSpecs[normName] = fields;
    if (normName === "ITEM") sbSpecs["ITEMS"] = fields;
    if (normName === "ITEMS") sbSpecs["ITEM"] = fields;
  });

  if (sbSpecs["ITEMS"] && !sbSpecs["ITEM"]) sbSpecs["ITEM"] = sbSpecs["ITEMS"];
  if (sbSpecs["ITEM"] && !sbSpecs["ITEMS"]) sbSpecs["ITEMS"] = sbSpecs["ITEM"];

  return sbSpecs;
}

export async function parseSbFlat(text: string, specs: SbSpecs): Promise<SbData> {
  const lines = text.split(/\r?\n/);
  const dataBySeg: SbData = {};
  let currentSeg: string | null = null;

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    
    if (t.startsWith('<TABLE>')) {
      let segName = t.replace('<TABLE>', '').trim().toUpperCase();
      segName = normalizeTableName(segName);
      currentSeg = segName;
      if (!dataBySeg[currentSeg]) dataBySeg[currentSeg] = [];
      continue;
    }
    
    if (currentSeg && !t.startsWith('<')) {
      let row = t.split(RS);
      const expectedLen = specs[currentSeg]?.length || row.length;
      while (row.length < expectedLen) {
        row.push("");
      }
      dataBySeg[currentSeg].push(row);
    }
  }

  if (dataBySeg["ITEM"] && !dataBySeg["ITEMS"]) dataBySeg["ITEMS"] = dataBySeg["ITEM"];
  if (dataBySeg["ITEMS"] && !dataBySeg["ITEM"]) dataBySeg["ITEM"] = dataBySeg["ITEMS"];

  return dataBySeg;
}

export function getDiffStatus(va: string, vb: string, s: FieldSpec): string {
  const a = norm(va);
  const b = norm(vb);

  if (s.final === "M" && (!a || !b)) {
    return "mandatory";
  }

  if (s.type === "N") {
    if ((a && !isNumber(a)) || (b && !isNumber(b))) {
      return "datatype";
    }
  }

  if (s.len) {
    if ((a && a.length > s.len) || (b && b.length > s.len)) {
      return "length";
    }
  }

  if (a !== b) {
    return "compare";
  }

  return "";
}

function getFieldValueByAliases(rows: string[][], spec: FieldSpec[], fieldAliases: string[], rowIdx: number): string {
  for (let name of fieldAliases) {
    let idx = spec.findIndex((s) => norm(s.cap).toLowerCase() === name.toLowerCase());
    if (idx !== -1) {
      const val = rows[rowIdx]?.[idx];
      if (val) return val;
    }
  }
  return "";
}

const invoiceSrAliases = [
  "Invoice Sr. Number", "Invoice Serial No", "Invoice Sr. No.", "Invoice Serial No.", "Inv Sr No"
];
const itemSrAliases = [
  "Item Sr Number in Invoice", "Item Serial No", "Item Serial No.", "Item Sr No"
];
const serialNoAliases = [
  "Serial No", "Sr No", "Sl No"
];

export function generateExportIssues(
  specs: SbSpecs, 
  parsedA: SbData, 
  parsedB: SbData
): void {
  const exportColumns = [
    "Segment", "Field Name", "Invoice Sr. Number", 
    "Item Sr Number in Invoice", "Serial No", "A Value", "B Value", "Status"
  ];

  const issueRows: IssueRow[] = [];
  const segmentNames = Object.keys(specs);

  segmentNames.forEach(segment => {
    const spec = specs[segment];
    let rowsA = parsedA[segment] || [];
    let rowsB = parsedB[segment] || [];

    if (norm(segment).toUpperCase() === 'EXCHANGE') {
      let currencyIdx = spec.findIndex(s => norm(s.cap).toUpperCase().includes('CURRENCY'));
      if (currencyIdx === -1) currencyIdx = 6;
      rowsA = rowsA.filter(r => norm(r[currencyIdx] ?? "").toUpperCase() !== 'INR');
      rowsB = rowsB.filter(r => norm(r[currencyIdx] ?? "").toUpperCase() !== 'INR');
    }

    const maxRows = Math.max(rowsA.length, rowsB.length);

    for (let i = 0; i < maxRows; i++) {
        const rowA = rowsA[i] || [];
        const rowB = rowsB[i] || [];

        spec.forEach((colSpec, idx) => {
          const va = rowA[idx] ?? "";
          const vb = rowB[idx] ?? "";

          const status = getDiffStatus(va, vb, colSpec);
          if (!status && norm(va) === norm(vb)) return;

          const invoiceSrNumber = getFieldValueByAliases(rowsA, spec, invoiceSrAliases, i) || getFieldValueByAliases(rowsB, spec, invoiceSrAliases, i);
          const itemSrNumber = getFieldValueByAliases(rowsA, spec, itemSrAliases, i) || getFieldValueByAliases(rowsB, spec, itemSrAliases, i);
          const serialNo = getFieldValueByAliases(rowsA, spec, serialNoAliases, i) || getFieldValueByAliases(rowsB, spec, serialNoAliases, i);

          issueRows.push({
            "Segment": segment,
            "Field Name": colSpec.cap,
            "Invoice Sr. Number": invoiceSrNumber,
            "Item Sr Number in Invoice": itemSrNumber,
            "Serial No": serialNo,
            "A Value": va,
            "B Value": vb,
            "Status": status
          });
        });
      }
  });

  if (!issueRows.length) {
    alert("No issues to export");
    return;
  }

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    XLSX.utils.json_to_sheet(issueRows, { header: exportColumns }),
    "Comparison_Issues"
  );
  XLSX.writeFile(wb, "SB_Comparison_Issues_All_Segments.xlsx");
}
